import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// --- CONFIGURATION ---
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Environment variables from original server
const S3_BUCKET_URL =
  process.env.S3_BUCKET_URL ||
  "https://fusion-networks-qa-dev.s3.eu-west-2.amazonaws.com";
const DATABASE_URL = process.env.S3_DATABASE_URL;

// Database URLs - AWS S3 public URLs
const LIGHTHOUSE_DB_URL = process.env.LIGHTHOUSE_DB_URLS
  ? process.env.LIGHTHOUSE_DB_URLS.split(",").map((url) => url.trim())
  : [
      `${DATABASE_URL}/lighthouse_performance_Auth.db`,
      `${DATABASE_URL}/lighthouse_performance_UnAuth.db`,
      `${DATABASE_URL}/lighthouse_performance.db`,
    ];

const VISUAL_DB_URL = process.env.VISUAL_DB_URLS
  ? process.env.VISUAL_DB_URLS.split(",").map((url) => url.trim())
  : [`${DATABASE_URL}/visual_desktop.db`, `${DATABASE_URL}/visual_mobile.db`];

// Paths to save the databases on the server instance's temporary disk
const LIGHTHOUSE_DB_PATH = path.join("/tmp", "lighthouse_performance.db");
const VISUAL_DB_PATH = path.join("/tmp", "visual_data.db");
const TEMP_DB_DIR = path.join("/tmp", "temp_dbs");

// How often to refresh the database from the URL (e.g., 15 minutes)
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// These variables will hold our live database connections
let lighthouseDb;
let visualDb;

/**
 * Downloads a single database from URL and saves it locally.
 */
async function downloadSingleDatabase(dbUrl, localPath, retryCount = 0) {
  console.log(`📥 Downloading database from ${dbUrl}...`);

  try {
    const response = await fetch(dbUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const fileBuffer = await response.buffer();
    fs.writeFileSync(localPath, fileBuffer);

    // Get file size for debugging
    const stats = fs.statSync(localPath);
    const fileSizeKB = Math.round(stats.size / 1024);

    console.log(
      `✅ Database downloaded: ${path.basename(localPath)} (${fileSizeKB} KB)`
    );

    // Quick check of the downloaded database
    try {
      const testDb = new Database(localPath, { readonly: true });
      const tables = testDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .all();
      let totalRows = 0;

      for (const table of tables) {
        const count = testDb
          .prepare(`SELECT COUNT(*) as count FROM ${table.name}`)
          .get();
        totalRows += count.count;
        console.log(`   📊 Table ${table.name}: ${count.count} rows`);
      }

      console.log(
        `   📋 Total tables: ${tables.length}, Total rows: ${totalRows}`
      );
      testDb.close();
    } catch (dbError) {
      console.warn(`   ⚠️ Could not inspect database: ${dbError.message}`);
    }

    return { success: true, path: localPath, url: dbUrl };
  } catch (error) {
    console.error(`❌ Download failed for ${dbUrl}: ${error.message}`);

    // Retry logic
    if (retryCount < 3) {
      console.log(`🔄 Retrying download (${retryCount + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return downloadSingleDatabase(dbUrl, localPath, retryCount + 1);
    }

    return { success: false, error: error.message, url: dbUrl };
  }
}

/**
 * Downloads multiple databases and merges them into a single database.
 */
async function downloadAndMergeDatabases(
  dbUrls,
  outputPath,
  dbType = "database"
) {
  console.log(
    `🚀 Starting download of ${dbUrls.length} ${dbType} databases...`
  );

  // Ensure temp directory exists
  if (!fs.existsSync(TEMP_DB_DIR)) {
    fs.mkdirSync(TEMP_DB_DIR, { recursive: true });
  }

  // Download all databases
  const downloadPromises = dbUrls.map((dbUrl, index) => {
    const fileName = `${dbType}_db_${index}_${Date.now()}.db`;
    const localPath = path.join(TEMP_DB_DIR, fileName);
    return downloadSingleDatabase(dbUrl, localPath);
  });

  const downloadResults = await Promise.all(downloadPromises);

  const successfulDownloads = downloadResults.filter((r) => r.success);
  const failedDownloads = downloadResults.filter((r) => !r.success);

  console.log(
    `📊 ${dbType} Download Summary: ${successfulDownloads.length} successful, ${failedDownloads.length} failed`
  );

  if (successfulDownloads.length === 0) {
    console.error(`❌ All ${dbType} database downloads failed`);
    return false;
  }

  // Log failed downloads
  failedDownloads.forEach((failed) => {
    console.error(
      `❌ Failed to download ${dbType}: ${failed.url} - ${failed.error}`
    );
  });

  // Merge databases
  try {
    await mergeDownloadedDatabases(successfulDownloads, outputPath, dbType);
    cleanupTempFiles(dbType);
    console.log(`✅ ${dbType} database merge completed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${dbType} database merge failed: ${error.message}`);
    cleanupTempFiles(dbType);
    return false;
  }
}

/**
 * Merges multiple downloaded databases into a single database.
 */
async function mergeDownloadedDatabases(
  downloadResults,
  outputPath,
  dbType = "database"
) {
  console.log(`🔄 Starting ${dbType} database merge process...`);

  // Remove existing merged database
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`🗑️ Removed existing ${dbType} database`);
  }

  // Create merged database
  const mergedDb = new Database(outputPath);
  console.log(`📂 Created new ${dbType} database at ${outputPath}`);

  try {
    // Get schema from first successful download
    const firstDbPath = downloadResults[0].path;
    const firstDb = new Database(firstDbPath, { readonly: true });

    console.log(`🔍 Analyzing schema from ${path.basename(firstDbPath)}...`);

    // Extract and create schema
    const tables = firstDb
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all();
    const indexes = firstDb
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all();

    console.log(
      `📋 Found ${tables.length} tables and ${indexes.length} indexes in ${dbType} schema`
    );

    // Log table names and structure
    for (const table of tables) {
      console.log(`   📊 Table: ${table.name}`);
      try {
        const tableInfo = firstDb
          .prepare(`PRAGMA table_info(${table.name})`)
          .all();
        console.log(
          `      Columns: ${tableInfo
            .map((col) => `${col.name}(${col.type})`)
            .join(", ")}`
        );
      } catch (error) {
        console.log(`      ⚠️ Could not get table info: ${error.message}`);
      }
    }

    firstDb.close();

    // Create tables in merged database
    console.log(`📋 Creating ${tables.length} ${dbType} tables...`);
    for (const table of tables) {
      if (table.sql) {
        try {
          mergedDb.exec(table.sql);
          console.log(`   ✅ Created table: ${table.name}`);
        } catch (error) {
          console.error(
            `   ❌ Failed to create table ${table.name}: ${error.message}`
          );
        }
      }
    }

    // Create indexes (but skip if they fail due to duplicates)
    console.log(`📋 Creating ${indexes.length} ${dbType} indexes...`);
    for (const index of indexes) {
      if (index.sql) {
        try {
          mergedDb.exec(index.sql);
          console.log(`   ✅ Created index: ${index.name}`);
        } catch (error) {
          console.log(
            `   ⚠️ Skipped ${dbType} index ${index.name}: ${error.message}`
          );
        }
      }
    }

    // Merge data from all databases with ID reassignment
    let totalRowsMerged = 0;
    const tableRowCounts = {};

    for (const [dbIndex, download] of downloadResults.entries()) {
      console.log(
        `📊 Merging ${dbType} data from ${path.basename(
          download.path
        )}... (Database ${dbIndex + 1}/${downloadResults.length})`
      );

      const sourceDb = new Database(download.path, { readonly: true });

      try {
        for (const table of tables) {
          const tableName = table.name;

          if (!tableRowCounts[tableName]) {
            tableRowCounts[tableName] = 0;
          }

          // Get table info
          const tableInfo = sourceDb
            .prepare(`PRAGMA table_info(${tableName})`)
            .all();
          const columns = tableInfo.map((col) => col.name);
          const primaryKeys = tableInfo.filter((col) => col.pk > 0);

          // Check if table has an auto-incrementing primary key
          const hasAutoIncrementId =
            primaryKeys.length === 1 &&
            primaryKeys[0].name.toLowerCase() === "id" &&
            primaryKeys[0].type.toUpperCase().includes("INTEGER");

          // Get all rows from source table
          const rows = sourceDb.prepare(`SELECT * FROM ${tableName}`).all();

          console.log(`   📊 Source table ${tableName}: ${rows.length} rows`);

          if (rows.length === 0) {
            console.log(`   ⚠️ ${tableName}: No rows found in source`);
            continue;
          }

          // Get current max ID from merged database
          let currentMaxId = 0;
          if (hasAutoIncrementId) {
            try {
              const maxIdResult = mergedDb
                .prepare(
                  `SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableName}`
                )
                .get();
              currentMaxId = maxIdResult.max_id || 0;
              console.log(
                `   🔢 Current max ID in ${tableName}: ${currentMaxId}`
              );
            } catch (error) {
              console.log(
                `   ⚠️ Could not get max ID for ${tableName}: ${error.message}`
              );
            }
          }

          let insertedCount = 0;
          let errorCount = 0;

          // Use transaction for performance
          const insertTransaction = mergedDb.transaction(() => {
            for (const [rowIndex, row] of rows.entries()) {
              try {
                if (hasAutoIncrementId) {
                  // Reassign ID to avoid conflicts
                  currentMaxId++;
                  row.id = currentMaxId;
                }

                // Prepare insert statement
                const columnList = columns.join(", ");
                const placeholders = columns.map(() => "?").join(", ");
                const insertSql = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;

                const insertStmt = mergedDb.prepare(insertSql);
                const values = columns.map((col) => row[col]);

                const result = insertStmt.run(values);
                if (result.changes > 0) {
                  insertedCount++;
                }
              } catch (error) {
                errorCount++;
                if (errorCount <= 3) {
                  console.error(
                    `   ❌ Error inserting row ${
                      rowIndex + 1
                    } in ${tableName}: ${error.message}`
                  );
                  if (errorCount === 1) {
                    console.error(
                      `   Sample row data:`,
                      JSON.stringify(row, null, 2)
                    );
                  }
                }
              }
            }
          });

          // Execute the transaction
          try {
            insertTransaction();
            totalRowsMerged += insertedCount;
            tableRowCounts[tableName] += insertedCount;

            console.log(
              `   ✅ ${tableName}: ${insertedCount}/${rows.length} rows merged${
                errorCount > 0 ? ` (${errorCount} errors)` : ""
              } (DB: ${path.basename(download.path)})`
            );
          } catch (transactionError) {
            console.error(
              `   ❌ Transaction failed for ${tableName}: ${transactionError.message}`
            );
          }
        }
      } finally {
        sourceDb.close();
      }
    }

    // Log final row counts
    console.log(`📊 Final ${dbType} database row counts:`);
    for (const [tableName, count] of Object.entries(tableRowCounts)) {
      console.log(`   ${tableName}: ${count} rows`);
    }

    // Optimize merged database
    console.log(`🔧 Optimizing merged ${dbType} database...`);
    try {
      mergedDb.exec("ANALYZE");
      mergedDb.exec("VACUUM");
      console.log(`   ✅ Database optimization completed`);
    } catch (error) {
      console.warn(`   ⚠️ Database optimization failed: ${error.message}`);
    }

    console.log(
      `✅ ${dbType} database merge completed: ${totalRowsMerged} total rows merged from ${downloadResults.length} databases`
    );
  } finally {
    mergedDb.close();
  }
}

/**
 * Clean up temporary database files.
 */
function cleanupTempFiles(dbType = null) {
  console.log(
    `🧹 Cleaning up temporary files${dbType ? ` for ${dbType}` : ""}...`
  );

  try {
    if (fs.existsSync(TEMP_DB_DIR)) {
      const files = fs.readdirSync(TEMP_DB_DIR);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(TEMP_DB_DIR, file);
        if (file.endsWith(".db")) {
          if (!dbType || file.includes(dbType)) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        }
      }

      console.log(`🗑️ Cleaned up ${cleanedCount} temporary database files`);

      if (fs.readdirSync(TEMP_DB_DIR).length === 0) {
        fs.rmdirSync(TEMP_DB_DIR);
      }
    }
  } catch (error) {
    console.error(`⚠️ Cleanup failed: ${error.message}`);
  }
}

/**
 * Downloads the lighthouse databases from the public URLs and saves them locally.
 */
async function downloadLighthouseDatabase() {
  console.log(
    `Attempting to download and merge lighthouse databases from ${LIGHTHOUSE_DB_URL.length} sources...`
  );

  try {
    const success = await downloadAndMergeDatabases(
      LIGHTHOUSE_DB_URL,
      LIGHTHOUSE_DB_PATH,
      "lighthouse"
    );

    if (success) {
      console.log(
        `Lighthouse database successfully downloaded and merged to ${LIGHTHOUSE_DB_PATH}`
      );
      const stats = fs.statSync(LIGHTHOUSE_DB_PATH);
      const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
      console.log(`📊 Merged lighthouse database size: ${fileSizeMB} MB`);
      return true;
    } else {
      console.error("❌ Lighthouse database download and merge failed");
      return false;
    }
  } catch (error) {
    console.error(
      "Error downloading and merging lighthouse databases:",
      error.message
    );
    return false;
  }
}

/**
 * Downloads the visual databases from the public URLs and saves them locally.
 */
async function downloadVisualDatabase() {
  console.log(
    `Attempting to download and merge visual databases from ${VISUAL_DB_URL.length} sources...`
  );

  try {
    const success = await downloadAndMergeDatabases(
      VISUAL_DB_URL,
      VISUAL_DB_PATH,
      "visual"
    );

    if (success) {
      console.log(
        `Visual database successfully downloaded and merged to ${VISUAL_DB_PATH}`
      );
      const stats = fs.statSync(VISUAL_DB_PATH);
      const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
      console.log(`📊 Merged visual database size: ${fileSizeMB} MB`);
      return true;
    } else {
      console.error("❌ Visual database download and merge failed");
      return false;
    }
  } catch (error) {
    console.error(
      "Error downloading and merging visual databases:",
      error.message
    );
    return false;
  }
}

/**
 * Downloads both lighthouse and visual databases.
 */
async function downloadAllDatabases() {
  console.log("🚀 Starting download of all databases...");

  const lighthouseSuccess = await downloadLighthouseDatabase();
  const visualSuccess = await downloadVisualDatabase();

  const results = {
    lighthouse: lighthouseSuccess,
    visual: visualSuccess,
    overall: lighthouseSuccess && visualSuccess,
  };

  console.log(`📊 Database download summary:
    - Lighthouse: ${lighthouseSuccess ? "✅ Success" : "❌ Failed"}
    - Visual: ${visualSuccess ? "✅ Success" : "❌ Failed"}
    - Overall: ${results.overall ? "✅ All successful" : "⚠️ Some failed"}`);

  return results;
}

/**
 * Initializes the database connections from the local files.
 */
function initializeDatabaseConnections() {
  // Close existing connections before creating new ones to prevent leaks
  if (lighthouseDb) {
    lighthouseDb.close();
  }
  if (visualDb) {
    visualDb.close();
  }

  // Initialize lighthouse database
  try {
    if (fs.existsSync(LIGHTHOUSE_DB_PATH)) {
      lighthouseDb = new Database(LIGHTHOUSE_DB_PATH, { readonly: true });
      console.log("✅ Successfully connected to the lighthouse database.");

      const tables = lighthouseDb
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        .all();
      console.log(
        `📋 Lighthouse tables: ${tables.map((t) => t.name).join(", ")}`
      );

      for (const table of tables) {
        try {
          const count = lighthouseDb
            .prepare(`SELECT COUNT(*) as count FROM ${table.name}`)
            .get();
          console.log(`📊 Lighthouse ${table.name}: ${count.count} rows`);
        } catch (error) {
          console.log(
            `⚠️ Could not count rows in lighthouse ${table.name}: ${error.message}`
          );
        }
      }
    } else {
      console.error("❌ Lighthouse database file not found");
      lighthouseDb = null;
    }
  } catch (error) {
    console.error(
      "Failed to connect to lighthouse database file:",
      error.message
    );
    lighthouseDb = null;
  }

  // Initialize visual database
  try {
    if (fs.existsSync(VISUAL_DB_PATH)) {
      visualDb = new Database(VISUAL_DB_PATH, { readonly: true });
      console.log("✅ Successfully connected to the visual database.");

      const tables = visualDb
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        .all();
      console.log(`📋 Visual tables: ${tables.map((t) => t.name).join(", ")}`);

      for (const table of tables) {
        try {
          const count = visualDb
            .prepare(`SELECT COUNT(*) as count FROM ${table.name}`)
            .get();
          console.log(`📊 Visual ${table.name}: ${count.count} rows`);
        } catch (error) {
          console.log(
            `⚠️ Could not count rows in visual ${table.name}: ${error.message}`
          );
        }
      }
    } else {
      console.error("❌ Visual database file not found");
      visualDb = null;
    }
  } catch (error) {
    console.error("Failed to connect to visual database file:", error.message);
    visualDb = null;
  }
}

// --- API ROUTES ---

// Health check endpoint (from original)
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Authentication Endpoint (ORIGINAL - KEPT AS IS)
app.post("/api/verifycredentials", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    return res
      .status(200)
      .json({ message: "Credentials are valid", isAuthenticated: true });
  }

  return res
    .status(401)
    .json({ error: "Invalid username or password", isAuthenticated: false });
});

// Supabase Data Endpoint (from original)
app.get("/api/supabase/data", async (req, res) => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE_NAME}`,
      {
        headers: {
          apikey: SUPABASE_TOKEN,
          Authorization: `Bearer ${SUPABASE_TOKEN}`,
        },
      }
    );
    if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// --- LIGHTHOUSE API ROUTES ---

app.get("/api/lighthouse/data", (req, res) => {
  if (!lighthouseDb) {
    return res.status(503).json({
      error: "Service Unavailable: Lighthouse database is not ready.",
    });
  }

  try {
    const stmt = lighthouseDb.prepare(
      "SELECT * FROM performance_matrix ORDER BY created_at DESC"
    );
    const data = stmt.all();
    console.log(
      `📊 Lighthouse API call: Retrieved ${data.length} records from performance_matrix`
    );
    res.json(data);
  } catch (error) {
    console.error("Error querying lighthouse database:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch data from the lighthouse database" });
  }
});

app.get("/api/lighthouse/stats", (req, res) => {
  if (!lighthouseDb) {
    return res.status(503).json({
      error: "Service Unavailable: Lighthouse database is not ready.",
    });
  }

  try {
    const tables = lighthouseDb
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all();
    const tableStats = {};
    let totalRows = 0;

    for (const table of tables) {
      const count = lighthouseDb
        .prepare(`SELECT COUNT(*) as count FROM ${table.name}`)
        .get();
      tableStats[table.name] = count.count;
      totalRows += count.count;
    }

    const stats = fs.statSync(LIGHTHOUSE_DB_PATH);
    const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;

    res.json({
      totalTables: tables.length,
      totalRows,
      fileSizeMB,
      tableStats,
      lastUpdated: stats.mtime,
      sourceUrls: LIGHTHOUSE_DB_URL.length,
    });
  } catch (error) {
    console.error("Error getting lighthouse database stats:", error);
    res
      .status(500)
      .json({ error: "Failed to get lighthouse database statistics" });
  }
});

// --- VISUAL API ROUTES ---

app.get("/api/visual/data", (req, res) => {
  console.log("📊 Visual data API called");

  if (!visualDb) {
    console.log("❌ Visual database not available");
    return res
      .status(503)
      .json({ error: "Service Unavailable: Visual database is not ready." });
  }

  try {
    const tables = visualDb
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all();
    console.log(
      `📋 Found ${tables.length} tables in visual database: ${tables
        .map((t) => t.name)
        .join(", ")}`
    );

    let allData = [];
    let totalRecords = 0;

    for (const table of tables) {
      try {
        const tableInfo = visualDb
          .prepare(`PRAGMA table_info(${table.name})`)
          .all();
        const hasCreatedAt = tableInfo.some(
          (col) => col.name.toLowerCase() === "created_at"
        );

        let query;
        if (hasCreatedAt) {
          query = `SELECT * FROM ${table.name} ORDER BY created_at DESC`;
        } else {
          const hasId = tableInfo.some(
            (col) => col.name.toLowerCase() === "id"
          );
          if (hasId) {
            query = `SELECT * FROM ${table.name} ORDER BY id DESC`;
          } else {
            query = `SELECT * FROM ${table.name}`;
          }
        }

        const stmt = visualDb.prepare(query);
        const data = stmt.all();
        allData.push(...data);
        totalRecords += data.length;
        console.log(`📊 Retrieved ${data.length} records from ${table.name}`);
      } catch (error) {
        console.error(`❌ Error querying visual table ${table.name}:`, error);
      }
    }

    console.log(
      `📊 Visual API call completed: Retrieved ${totalRecords} total records from ${tables.length} tables`
    );
    res.json(allData);
  } catch (error) {
    console.error("❌ Error querying visual database:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch data from the visual database" });
  }
});

app.get("/api/visual/stats", (req, res) => {
  if (!visualDb) {
    return res
      .status(503)
      .json({ error: "Service Unavailable: Visual database is not ready." });
  }

  try {
    const tables = visualDb
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all();
    const tableStats = {};
    let totalRows = 0;

    for (const table of tables) {
      const count = visualDb
        .prepare(`SELECT COUNT(*) as count FROM ${table.name}`)
        .get();
      tableStats[table.name] = count.count;
      totalRows += count.count;
    }

    const stats = fs.statSync(VISUAL_DB_PATH);
    const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;

    res.json({
      totalTables: tables.length,
      totalRows,
      fileSizeMB,
      tableStats,
      lastUpdated: stats.mtime,
      sourceUrls: VISUAL_DB_URL.length,
    });
  } catch (error) {
    console.error("Error getting visual database stats:", error);
    res.status(500).json({ error: "Failed to get visual database statistics" });
  }
});

// --- BASELINE API ROUTE ---
app.get("/api/baseline/data", (req, res) => {
  console.log("📊 Baseline data API called");

  if (!visualDb) {
    console.log("❌ Visual database not available");
    return res
      .status(503)
      .json({ error: "Service Unavailable: Visual database is not ready." });
  }

  try {
    // Check if baseline table exists
    const tables = visualDb
      .prepare(
        `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name = 'baseline'
      `
      )
      .all();

    if (tables.length === 0) {
      console.log("❌ Baseline table not found");
      return res
        .status(404)
        .json({ error: "Baseline table not found in database" });
    }

    console.log("📋 Found baseline table in visual database");

    // Check table structure
    const tableInfo = visualDb.prepare(`PRAGMA table_info(baseline)`).all();
    const hasCreatedAt = tableInfo.some(
      (col) => col.name.toLowerCase() === "created_at"
    );
    const hasId = tableInfo.some((col) => col.name.toLowerCase() === "id");

    console.log(
      `📋 Baseline table columns: ${tableInfo
        .map((col) => col.name)
        .join(", ")}`
    );
    console.log(
      `📋 Baseline table has created_at: ${hasCreatedAt}, has id: ${hasId}`
    );

    // Use appropriate ORDER BY clause
    let query;
    if (hasCreatedAt) {
      query = `SELECT * FROM baseline ORDER BY created_at DESC`;
    } else if (hasId) {
      query = `SELECT * FROM baseline ORDER BY id DESC`;
    } else {
      query = `SELECT * FROM baseline`;
    }

    console.log(`📊 Executing baseline query: ${query}`);
    const stmt = visualDb.prepare(query);
    const data = stmt.all();

    console.log(
      `📊 Baseline API call completed: Retrieved ${data.length} records`
    );

    res.json(data);
  } catch (error) {
    console.error("❌ Error querying baseline table:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch data from the baseline table" });
  }
});

// --- LEGACY API ROUTES (for backward compatibility) ---

app.get("/api/data", (req, res) => {
  if (!lighthouseDb) {
    return res
      .status(503)
      .json({ error: "Service Unavailable: Database is not ready." });
  }

  try {
    const stmt = lighthouseDb.prepare(
      "SELECT * FROM performance_matrix ORDER BY created_at DESC"
    );
    const data = stmt.all();
    console.log(
      `📊 Legacy API call: Retrieved ${data.length} records from performance_matrix`
    );
    res.json(data);
  } catch (error) {
    console.error("Error querying cached database:", error);
    res.status(500).json({ error: "Failed to fetch data from the database" });
  }
});

// --- REFRESH API ROUTES ---

app.post("/api/refresh", async (req, res) => {
  console.log("🔄 Manual database refresh requested for all databases");

  try {
    const results = await downloadAllDatabases();

    if (results.lighthouse || results.visual) {
      initializeDatabaseConnections();
      res.json({
        success: results.overall,
        lighthouse: results.lighthouse,
        visual: results.visual,
        message: results.overall
          ? "All databases refreshed successfully"
          : "Some databases failed to refresh",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        lighthouse: false,
        visual: false,
        error: "All database refreshes failed",
      });
    }
  } catch (error) {
    console.error("Manual refresh failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/**
 * Main function to start the server after the initial DB downloads.
 */
async function startServer() {
  console.log(
    `🚀 Starting server with ${LIGHTHOUSE_DB_URL.length} lighthouse and ${VISUAL_DB_URL.length} visual database sources...`
  );

  const results = await downloadAllDatabases();

  if (results.lighthouse || results.visual) {
    initializeDatabaseConnections();

    console.log(
      `⏰ Setting up periodic refresh every ${Math.round(
        REFRESH_INTERVAL_MS / 1000
      )} seconds`
    );
    setInterval(async () => {
      console.log("🔄 Periodic database refresh starting...");
      const refreshResults = await downloadAllDatabases();
      if (refreshResults.lighthouse || refreshResults.visual) {
        initializeDatabaseConnections();
      }
    }, REFRESH_INTERVAL_MS);
  } else {
    console.error(
      "CRITICAL: All database downloads failed. The API will not be available."
    );
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoints available:`);
    console.log(`   - GET  /api/health                    - Health check`);
    console.log(
      `   - GET  /api/proxy/merged-results      - S3 proxy for merged results`
    );
    console.log(
      `   - POST /api/verifycredentials         - Verify credentials (original)`
    );
    console.log(`   - GET  /api/supabase/data             - Get Supabase data`);
    console.log(
      `   - GET  /api/data                      - Get lighthouse performance data (legacy)`
    );
    console.log(
      `   - GET  /api/lighthouse/data           - Get lighthouse performance data`
    );
    console.log(
      `   - GET  /api/lighthouse/stats          - Get lighthouse database statistics`
    );
    console.log(`   - GET  /api/visual/data               - Get visual data`);
    console.log(
      `   - GET  /api/visual/stats              - Get visual database statistics`
    );
    console.log(
      `   - POST /api/refresh                   - Manual refresh all databases`
    );
    console.log(`🗂️  Database sources:`);
    console.log(
      `   - Lighthouse DBs: ${LIGHTHOUSE_DB_URL.length} sources from S3`
    );
    console.log(`   - Visual DBs: ${VISUAL_DB_URL.length} sources from S3`);
    console.log(`   - S3 Bucket: ${S3_BUCKET_URL}`);

    if (!results.lighthouse && !results.visual) {
      console.warn(
        "⚠️ Warning: Server started, but API is non-functional due to all DB download failures."
      );
    } else if (!results.overall) {
      console.warn(
        "⚠️ Warning: Server started, but some databases failed to download."
      );
    }
  });
}

// --- START THE APPLICATION ---
startServer();
