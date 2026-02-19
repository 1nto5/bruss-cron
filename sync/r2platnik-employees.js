import sql from 'mssql';
import { dbc } from '../lib/mongo.js';

async function syncR2platnikEmployees() {
  // Initialize counters
  let processedEmployees = 0;
  let addedEmployees = 0;
  let deletedEmployees = 0;

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
    const employeesCollection = await dbc('employees');

    await sql.connect(sqlConfig);
    const query = `
      SELECT
        p.Identyfikator, p.Imie, p.Nazwisko,
        d.Nazwa AS DzialNazwa,
        g.Nazwa AS GrupaNazwa,
        s.Nazwa AS StanowiskoNazwa,
        mgr.Imie + ' ' + mgr.Nazwisko AS Przelozony,
        p.Data_zatrudnienia, p.Data_zwolnienia
      FROM [dbo].[PRACOWNK] p
      LEFT JOIN [dbo].[Dzial] d ON d.X_I = p.X_IDzial
      LEFT JOIN [dbo].[grupy] g ON g.X_I = p.X_IGrupa
      LEFT JOIN [dbo].[STANOW] s ON s.X_I = p.X_IStanowisko
      LEFT JOIN [dbo].[PRACOWNK] mgr ON mgr.X_I = p.X_IPrzelozony
      WHERE p.Identyfikator IS NOT NULL
        AND p.Skasowany = 0
        AND (p.Data_zwolnienia > GETDATE() OR p.Data_zwolnienia IS NULL)`;
    const result = await sql.query(query);

    const employees = result.recordset.map(
      ({ Imie, Nazwisko, Identyfikator, DzialNazwa, GrupaNazwa, StanowiskoNazwa, Przelozony, Data_zatrudnienia, Data_zwolnienia }) => ({
        firstName: Imie,
        lastName: Nazwisko,
        identifier: Identyfikator,
        department: DzialNazwa || null,
        shiftGroup: GrupaNazwa || null,
        position: StanowiskoNazwa || null,
        manager: Przelozony || null,
        hireDate: Data_zatrudnienia ? new Date(Data_zatrudnienia) : null,
        endDate: Data_zwolnienia ? new Date(Data_zwolnienia) : null,
      })
    );

    processedEmployees = employees.length;

    if (employees.length > 0) {
      const bulkOps = employees.map((emp) => ({
        updateOne: {
          filter: { identifier: emp.identifier },
          update: { $set: emp },
          upsert: true,
        },
      }));

      const bulkResult = await employeesCollection.bulkWrite(bulkOps, { ordered: false });
      addedEmployees = bulkResult.upsertedCount;

      // Get count of employees to be deleted (exclude external employees)
      const employeesToDelete = await employeesCollection.countDocuments({
        identifier: { $nin: employees.map((emp) => emp.identifier) },
        external: { $ne: true },
      });

      deletedEmployees = employeesToDelete;

      // Delete employees that no longer exist in R2platnik (but keep external employees)
      if (employeesToDelete > 0) {
        await employeesCollection.deleteMany({
          identifier: { $nin: employees.map((emp) => emp.identifier) },
          external: { $ne: true },
        });
      }
    }
  } catch (error) {
    console.error('Error during syncing employees:', error);
    throw error; // Re-throw to allow executeWithErrorNotification to handle it
  } finally {
    await sql.close();
    console.log(
      `syncR2platnikEmployees -> success at ${new Date().toLocaleString()} | Processed: ${processedEmployees}, Added: ${addedEmployees}, Deleted: ${deletedEmployees}`
    );
  }
}

export { syncR2platnikEmployees };

