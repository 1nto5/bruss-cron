import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { dbc } from "../lib/mongo.js";

// Output path - configurable via env, defaults to data directory
const OUTPUT_PATH =
  process.env.POWERBI_CSV_PATH ||
  path.join(process.cwd(), "data", "powerbi-dmcheck.csv");

function formatOperators(operator) {
  if (!operator) return "";
  if (Array.isArray(operator)) return operator.join("; ");
  return operator;
}

function convertToLocalTime(date) {
  return new Date(date.toLocaleString("en-US"));
}

function formatLocalTime(date) {
  if (!date) return "";
  const localDate = convertToLocalTime(date);
  return localDate.toISOString().replace("T", " ").slice(0, 19);
}

function escapeCSV(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Streams a MongoDB cursor to a write stream as CSV rows.
 * Uses backpressure handling to avoid buffering too much in memory.
 * @returns {Promise<number>} Number of rows written.
 */
async function processCursor(cursor, defectsMap, writeStream) {
  let rowCount = 0;

  for await (const doc of cursor) {
    const defectKeysList = doc.defectKeys?.length ? doc.defectKeys : [null];

    for (const defectKey of defectKeysList) {
      const defect = defectKey ? defectsMap.get(defectKey) : null;

      const row = [
        `="${doc.dmc || ""}"`, // ="..." forces Power BI to treat as text
        escapeCSV(formatLocalTime(doc.time)),
        escapeCSV(doc.workplace?.toUpperCase()),
        escapeCSV(doc.article),
        escapeCSV(formatOperators(doc.operator)),
        escapeCSV(doc.status),
        escapeCSV(defectKey),
        escapeCSV(defect?.translations?.pl),
        escapeCSV(defect?.translations?.de),
        escapeCSV(defect?.translations?.en),
      ].join(",");

      const canContinue = writeStream.write(row + "\n");
      rowCount++;

      // Backpressure: if the internal buffer is full, wait for it to drain
      if (!canContinue) {
        await new Promise((resolve) => writeStream.once("drain", resolve));
      }
    }
  }

  return rowCount;
}

export async function generateDmcheckDefectsCsv() {
  const startTime = Date.now();

  const collConfigs = await dbc("dmcheck_configs");
  const workplaces = await collConfigs
    .aggregate([
      { $match: { enableDefectReporting: true } },
      { $group: { _id: "$workplace" } },
    ])
    .toArray()
    .then((docs) => docs.map((d) => d._id));

  if (workplaces.length === 0) {
    console.log("generateDmcheckDefectsCsv -> no workplaces with defect reporting enabled, skipping");
    return null;
  }

  const query = { workplace: { $in: workplaces } };

  const projection = {
    _id: 0,
    dmc: 1,
    time: 1,
    workplace: 1,
    article: 1,
    operator: 1,
    status: 1,
    defectKeys: 1,
  };

  const collScans = await dbc("dmcheck_scans");
  const collDefects = await dbc("dmcheck_defects");

  const defects = await collDefects.find().toArray();
  const defectsMap = new Map(defects.map((d) => [d.key, d]));

  // Ensure directory exists before opening the write stream
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const writeStream = createWriteStream(OUTPUT_PATH, { encoding: "utf-8" });

  // Write CSV header
  const headers = [
    "dmc",
    "time",
    "workplace",
    "article",
    "operator",
    "status",
    "defect_key",
    "defect_pl",
    "defect_de",
    "defect_en",
  ];
  writeStream.write(headers.join(",") + "\n");

  // Stream live scans
  const liveCursor = collScans
    .find(query, { projection })
    .sort({ time: -1 });
  const rowCount = await processCursor(liveCursor, defectsMap, writeStream);

  // Close the stream and wait for it to finish flushing
  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    writeStream.end();
  });

  const stats = await fs.stat(OUTPUT_PATH);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    `generateDmcheckDefectsCsv -> success | Rows: ${rowCount}, Size: ${(stats.size / 1024 / 1024).toFixed(1)}MB, Time: ${duration}s`,
  );

  return {
    rowCount,
    fileSize: stats.size,
    filePath: OUTPUT_PATH,
    duration: parseFloat(duration),
  };
}
