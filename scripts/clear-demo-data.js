// Removes every row created by scripts/seed-demo-data.js (anything with an
// id starting "demo-"). Safe to run anytime — never touches real data.
//
// Run:  node --env-file=.env scripts/clear-demo-data.js

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing env vars. Run with: node --env-file=.env scripts/clear-demo-data.js");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TABLES = ["orders", "receipts", "inventory_log", "menu_items", "other_products", "dish_ingredients", "dishes", "raw_materials", "raw_material_log", "users"];

async function clear() {
  for (const table of TABLES) {
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).like("id", "demo-%");
    if (error) console.error(`${table} failed:`, error.message);
    else console.log(`${table}: removed ${count ?? "?"} demo rows`);
  }
}

clear();
