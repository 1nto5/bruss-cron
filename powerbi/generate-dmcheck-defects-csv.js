import { dbc } from "../lib/mongo.js";
import fs from "fs/promises";
import path from "path";

const DEFECT_REPORTING_START = new Date("2025-11-01T00:00:00.000Z");
const ARCHIVE_DAYS = 90;

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

  const query = {
    time: { $gte: DEFECT_REPORTING_START },
    workplace: { $in: workplaces },
  };

  const archiveThreshold = new Date(
    Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000,
  );
  const skipArchive = DEFECT_REPORTING_START >= archiveThreshold;

  const collScans = await dbc("dmcheck_scans");
  const collDefects = await dbc("dmcheck_defects");

  const defects = await collDefects.find().toArray();
  const defectsMap = new Map(defects.map((d) => [d.key, d]));

  let scans = await collScans.find(query).sort({ _id: -1 }).toArray();

  if (!skipArchive) {
    const collScansArchive = await dbc("dmcheck_scans_archive");
    const scansArchive = await collScansArchive
      .find(query)
      .sort({ _id: -1 })
      .toArray();
    scans = [...scans, ...scansArchive];
  }

  // Build CSV
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
  const lines = [headers.join(",")];

  scans.forEach((doc) => {
    const defectKeysList = doc.defectKeys?.length ? doc.defectKeys : [null];

    defectKeysList.forEach((defectKey) => {
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
      ];
      lines.push(row.join(","));
    });
  });

  const csv = lines.join("\n");

  // Ensure directory exists
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  // Write CSV file
  await fs.writeFile(OUTPUT_PATH, csv, "utf-8");

  const stats = await fs.stat(OUTPUT_PATH);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    `generateDmcheckDefectsCsv -> success | Rows: ${lines.length}, Size: ${(stats.size / 1024 / 1024).toFixed(1)}MB, Time: ${duration}s`,
  );

  return {
    rowCount: lines.length,
    fileSize: stats.size,
    filePath: OUTPUT_PATH,
    duration: parseFloat(duration),
  };
}
