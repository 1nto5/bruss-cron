import sql from 'mssql';
import { dbc } from '../lib/mongo.js';

const OPTION_TYPES = [
  { type: 'department', query: 'SELECT X_I, Nazwa FROM [dbo].[Dzial] WHERE Nazwa IS NOT NULL' },
  { type: 'shiftGroup', query: 'SELECT X_I, Nazwa FROM [dbo].[grupy] WHERE Nazwa IS NOT NULL' },
  { type: 'position', query: 'SELECT X_I, Nazwa FROM [dbo].[STANOW] WHERE Nazwa IS NOT NULL' },
];

async function syncR2platnikEmployeeOptions() {
  if (!process.env.MONGO_URI) {
    throw new Error(
      'Please define the MONGO_URI environment variable in .env!'
    );
  }

  const sqlConfig = {
    user: process.env.R2PLATNIK_SQL_USER,
    password: process.env.R2PLATNIK_SQL_PASSWORD,
    server: process.env.R2PLATNIK_SQL_SERVER,
    database: process.env.R2PLATNIK_SQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      instanceName: process.env.R2PLATNIK_SQL_INSTANCE,
    },
  };

  try {
    const collection = await dbc('employee_options');
    await collection.createIndex({ type: 1, sqlId: 1 }, { unique: true });

    await sql.connect(sqlConfig);

    for (const { type, query } of OPTION_TYPES) {
      const result = await sql.query(query);
      const options = result.recordset.map(({ X_I, Nazwa }) => ({
        type,
        name: Nazwa.trim(),
        sqlId: X_I,
      }));

      if (options.length > 0) {
        const bulkOps = options.map((opt) => ({
          updateOne: {
            filter: { type: opt.type, sqlId: opt.sqlId },
            update: { $set: opt },
            upsert: true,
          },
        }));

        await collection.bulkWrite(bulkOps, { ordered: false });

        // Remove options no longer in source
        const activeSqlIds = options.map((opt) => opt.sqlId);
        const deleteResult = await collection.deleteMany({
          type,
          sqlId: { $nin: activeSqlIds },
        });

        console.log(
          `  ${type}: ${options.length} synced, ${deleteResult.deletedCount} removed`
        );
      }
    }
  } catch (error) {
    console.error('Error during syncing employee options:', error);
    throw error;
  } finally {
    await sql.close();
    console.log(
      `syncR2platnikEmployeeOptions -> success at ${new Date().toLocaleString()}`
    );
  }
}

export { syncR2platnikEmployeeOptions };
