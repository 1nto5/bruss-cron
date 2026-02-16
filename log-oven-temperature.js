import { dbc } from './lib/mongo.js';
import {
  SENSOR_OUTLIER_THRESHOLD,
  MIN_SENSORS_FOR_OUTLIER_DETECTION,
  TEMPERATURE_PRECISION_DECIMALS,
  CONNECTION_TIMEOUT_MS,
  SILENCE_DURATION_HOURS,
  SENSOR_KEYS,
  SENSOR_LABELS
} from './lib/temperature-constants.js';
import { temperatureOutlierCollector } from './lib/temperature-outlier-collector.js';
import { temperatureMissingSensorCollector } from './lib/temperature-missing-sensor-collector.js';
import { hoursAgo } from './lib/format-helpers.js';

const API_KEY = process.env.CONTROLLINO_API_KEY;

// Helper to get all oven configs (oven name to IP mapping)
async function getOvenConfigs() {
  const ovenConfigsCol = await dbc('oven_controllino_configs');
  const configs = await ovenConfigsCol.find({}).toArray();
  // Build a map: { ovenName: ip }
  const map = {};
  for (const cfg of configs) {
    if (cfg.oven && cfg.ip) {
      map[cfg.oven] = cfg.ip;
    }
  }
  return map;
}

// Helper to get all active oven processes (running or prepared)
async function getActiveOvenProcesses() {
  const ovenProcessesCol = await dbc('oven_processes');
  return ovenProcessesCol.find({ status: { $in: ['running', 'prepared'] } }).toArray();
}

// Helper to get the last successful temperature reading time for an oven
async function getLastSuccessfulReadTime(oven) {
  const ovenTemperatureLogsCol = await dbc('oven_temperature_logs');
  const lastLog = await ovenTemperatureLogsCol.findOne(
    { oven },
    { sort: { timestamp: -1 } }
  );
  return lastLog ? lastLog.timestamp : null;
}

// Fetch sensor data from Arduino at given IP
async function fetchSensorData(ip) {
  const url = `http://${ip}/`;
  const res = await fetch(url, {
    headers: { 'X-API-KEY': API_KEY },
    timeout: CONNECTION_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`Request failed with status code ${res.status}`);
  }
  return await res.json();
}

// Helper function to detect outliers and calculate statistics
function analyzeTemperatureData(sensorData) {
  // Get the four main sensors from configuration
  const sensorKeys = SENSOR_KEYS;
  const sensorValues = [];
  const validSensors = [];

  // Extract valid sensor readings
  for (const key of sensorKeys) {
    if (typeof sensorData[key] === 'number' && !isNaN(sensorData[key])) {
      sensorValues.push(sensorData[key]);
      validSensors.push(key);
    }
  }

  if (sensorValues.length < MIN_SENSORS_FOR_OUTLIER_DETECTION) {
    // Need minimum sensors for outlier detection
    return {
      validValues: sensorValues,
      validSensors,
      outlierSensors: [],
      medianTemp: sensorValues.length > 0 ? sensorValues[0] : null,
      filteredAvgTemp: sensorValues.length > 0 ? sensorValues[0] : null,
      hasOutliers: false
    };
  }

  // Calculate median
  const sortedValues = [...sensorValues].sort((a, b) => a - b);
  const median = sensorValues.length % 2 === 0
    ? (sortedValues[Math.floor(sensorValues.length / 2) - 1] + sortedValues[Math.floor(sensorValues.length / 2)]) / 2
    : sortedValues[Math.floor(sensorValues.length / 2)];

  // Identify outliers using configured threshold
  const outlierThreshold = SENSOR_OUTLIER_THRESHOLD;
  const outlierSensors = [];
  const nonOutlierValues = [];
  const nonOutlierSensors = [];

  for (let i = 0; i < sensorValues.length; i++) {
    const value = sensorValues[i];
    const sensor = validSensors[i];
    const deviation = Math.abs(value - median) / median;

    if (deviation > outlierThreshold) {
      outlierSensors.push(sensor);
    } else {
      nonOutlierValues.push(value);
      nonOutlierSensors.push(sensor);
    }
  }

  // Calculate filtered average (excluding outliers) - this becomes our main avgTemp
  const precisionMultiplier = Math.pow(10, TEMPERATURE_PRECISION_DECIMALS);
  const avgTemp = nonOutlierValues.length > 0
    ? Math.round((nonOutlierValues.reduce((acc, val) => acc + val, 0) / nonOutlierValues.length) * precisionMultiplier) / precisionMultiplier
    : Math.round(median * precisionMultiplier) / precisionMultiplier;

  const roundedMedian = Math.round(median * precisionMultiplier) / precisionMultiplier;

  return {
    validValues: sensorValues,
    validSensors,
    outlierSensors,
    nonOutlierSensors,
    medianTemp: roundedMedian,
    avgTemp,
    hasOutliers: outlierSensors.length > 0
  };
}

// Append log entry to oven_temperature_logs collection
async function saveTemperatureLog(oven, processIds, sensorData, timestamp = new Date()) {
  const ovenTemperatureLogsCol = await dbc('oven_temperature_logs');
  const ovenProcessesCol = await dbc('oven_processes');

  // Analyze temperature data for outliers
  const analysis = analyzeTemperatureData(sensorData);

  // Check each process to see if this is its first temperature log
  for (const processId of processIds) {
    // Check if this process already has any temperature logs
    const existingLog = await ovenTemperatureLogsCol.findOne({
      processIds: processId,
    });

    if (!existingLog) {
      // This is the first temperature log for this process, update its startTime and status
      const updateResult = await ovenProcessesCol.updateOne(
        { _id: processId },
        { $set: { startTime: timestamp, status: 'running' } }
      );
      if (updateResult.modifiedCount > 0) {
        logInfo(
          `Updated process ${processId}: set startTime to ${timestamp.toISOString()} and status to 'running'`
        );
      }
    }
    // If this is not the first temperature reading, we assume the process is already running
  }

  // Save temperature log with outlier analysis
  await ovenTemperatureLogsCol.insertOne({
    oven,
    processIds,
    timestamp,
    sensorData,
    outlierSensors: analysis.outlierSensors,
    medianTemp: analysis.medianTemp,
    avgTemp: analysis.avgTemp, // This is now the filtered average (excluding outliers)
    hasOutliers: analysis.hasOutliers
  });

  // Return analysis for potential notification
  return analysis;
}

// Logging helpers — dev-only for info/warn, always-on for errors
function createLogger(method, devOnly = true) {
  if (devOnly && process.env.NODE_ENV !== 'development') return () => {};
  return (...args) => console[method](...args);
}
const logInfo = createLogger('log');
const logWarn = createLogger('warn');
const logError = createLogger('error', false);

// Determine whether a connection error for an oven should be reported.
// Suppresses notifications when all processes are only 'prepared', when no recent
// running process exists, or when the last successful read is within the silence window.
async function shouldReportConnectionError(oven, processes) {
  if (processes.every(proc => proc.status === 'prepared')) return null;

  const hasRecentRunningProcess = processes.some(proc =>
    proc.status === 'running' && (!proc.startTime || new Date(proc.startTime) > hoursAgo(1))
  );
  if (!hasRecentRunningProcess) return null;

  const lastReadTime = await getLastSuccessfulReadTime(oven);
  const shouldNotify = !lastReadTime || lastReadTime < hoursAgo(SILENCE_DURATION_HOURS);
  return shouldNotify ? { lastReadTime } : null;
}

// Main function
async function logOvenTemperature() {
  if (!API_KEY) {
    throw new Error('CONTROLLINO_API_KEY environment variable is not set');
  }
  try {
    const ovenMap = await getOvenConfigs();
    const activeProcesses = await getActiveOvenProcesses();
    if (activeProcesses.length === 0) {
      logInfo('No active oven processes found.');
      return;
    }
    // Group processes by oven name
    const ovenToProcesses = {};
    for (const proc of activeProcesses) {
      if (!ovenToProcesses[proc.oven]) {
        ovenToProcesses[proc.oven] = [];
      }
      ovenToProcesses[proc.oven].push(proc);
    }
    // For each oven, fetch sensor data once and log to oven_temperature_logs
    for (const [oven, processes] of Object.entries(ovenToProcesses)) {
      const ip = ovenMap[oven];
      if (!ip) {
        logWarn(`No IP configured for oven: ${oven}`);
        continue;
      }

      try {
        const sensorData = await fetchSensorData(ip);
        const processIds = processes.map((proc) => proc._id);
        const currentTimestamp = new Date();
        const analysis = await saveTemperatureLog(oven, processIds, sensorData, currentTimestamp);

        logInfo(
          `Logged sensor data for oven ${oven} (${ip}) to oven_temperature_logs with processIds: [${processIds.join(
            ', '
          )}]`
        );

        // Collect outliers for hourly batch notification
        if (analysis.hasOutliers) {
          temperatureOutlierCollector.addOutlier(oven, sensorData, analysis, processes, currentTimestamp);
          logInfo(`Outliers detected for oven ${oven}: ${analysis.outlierSensors.join(', ')}`);
        }
      } catch (err) {
        const report = await shouldReportConnectionError(oven, processes);
        if (report) {
          const { lastReadTime } = report;
          const currentTimestamp = new Date();
          const errorContext = {
            oven,
            ip,
            processIds: processes.map(p => p._id),
            processStatuses: processes.map(p => ({
              id: p._id,
              status: p.status,
              hydraBatch: p.hydraBatch,
              startTime: p.startTime
            })),
            lastSuccessfulRead: lastReadTime,
            errorType: err.name,
            errorCode: err.code
          };
          logError(
            `Failed to fetch/log data for oven ${oven} (${ip}):`,
            err.message,
            '\nContext:', JSON.stringify(errorContext, null, 2)
          );

          // Collect missing sensor for hourly batch notification
          temperatureMissingSensorCollector.addMissingSensor(
            oven,
            ip,
            processes.map(p => ({
              id: p._id,
              status: p.status,
              hydraBatch: p.hydraBatch,
              article: p.article,
              startTime: p.startTime
            })),
            lastReadTime,
            err,
            currentTimestamp
          );

          // Add context to error for better notification
          err.context = errorContext;
          throw err;
        }
        // Silently continue if error reporting is suppressed
      }
    }
  } catch (err) {
    logError('Script error:', err);
    // Pass error with context to notification system
    if (!err.context) {
      err.context = { message: 'General script error in logOvenTemperature' };
    }
    throw err; // Re-throw to allow executeWithErrorNotification to handle it
  }
}

export { logOvenTemperature };

// if (require.main === module) {
//   logInfo('Starting Oven Sensor Logging Script...');
//   setInterval(
//     () => {
//       logOvenTemperature();
//     },
//     60 * 1000 // Run every 1 minute
//   ); // Run every 1 minutes
// }
