// Daily backup script for the KFCanteen Supabase database.
// Dumps every table to a timestamped JSON file under /backups.
//
// Run manually:   node --env-file=.env scripts/backup-db.js
// (Node 20.6+ required for --env-file. This project runs on Node 24.)

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY. Run with: node --env-file=.env scripts/backup-db.js");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TABLES = ["users", "menu_items", "other_products", "orders", "receipts", "inventory_log"];

async function backup() {
  const timestamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const outDir = path.join(__dirname, "..", "backups", timestamp);
  fs.mkdirSync(outDir, { recursive: true });

  let hadError = false;
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.error(`Failed to back up "${table}":`, error.message);
      hadError = true;
      continue;
    }
    fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(data, null, 2));
    console.log(`${table}: ${data.length} rows -> ${path.join("backups", timestamp, table + ".json")}`);
  }

  if (hadError) {
    console.error("Backup completed with errors — see above.");
    process.exit(1);
  }
  console.log(`Backup complete: backups/${timestamp}`);
}

backup();
