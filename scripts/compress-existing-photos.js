// One-time backfill: recompresses photos already stored in the database.
// Uploads have always gone straight to base64 with no resizing, so
// menu_items/other_products/dishes photos average 115-165KB each -- every
// full-table fetch (Manage Menu, Groceries, Dishes) was pulling 20+MB of
// image data. This re-encodes each existing photo the same way new uploads
// are now compressed client-side (src/canteen-app.jsx's compressImageFile):
// downscaled to at most 800px on the long side, re-encoded as JPEG at 70%
// quality.
//
// PACED ON PURPOSE: the first version of this script fired every UPDATE
// back-to-back with no delay, which piled write load onto a database that
// was already straining under the existing photo bloat and caused a real
// outage (statement timeouts cascaded into the live app failing to load
// for real users). This version waits between every write, waits longer
// between tables, and retries a timeout once (with a longer pause) instead
// of just logging and moving on. It's idempotent -- an already-compressed
// row is detected via the "not smaller" check and skipped, so re-running
// after a partial/interrupted run is safe and just picks up where it left
// off.
//
// BACK UP FIRST. Run manually:
//   node --env-file=.env scripts/compress-existing-photos.js
// Add --dry-run to only report projected savings without writing anything.

const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY. Run with: node --env-file=.env scripts/compress-existing-photos.js");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const DRY_RUN = process.argv.includes("--dry-run");

const WRITE_DELAY_MS = 600;      // pause after every single UPDATE
const TABLE_DELAY_MS = 3000;     // pause between tables
const TIMEOUT_RETRY_DELAY_MS = 4000; // extra pause before retrying a timed-out write

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// { table, photoColumn, isPhotoColumn, maxDim, quality }
const TARGETS = [
  { table: "other_products", photoColumn: "photo", isPhotoColumn: "is_photo", maxDim: 800, quality: 70 },
  { table: "menu_items",     photoColumn: "img",   isPhotoColumn: "is_photo", maxDim: 800, quality: 70 },
  { table: "dishes",         photoColumn: "img",   isPhotoColumn: "is_photo", maxDim: 800, quality: 70 },
];

async function compressDataUrl(dataUrl, maxDim, quality) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl);
  if (!match) return null; // not a base64 data URL (e.g. an emoji slipped into an is_photo row) -- skip
  const inputBuffer = Buffer.from(match[1], "base64");
  const outputBuffer = await sharp(inputBuffer)
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
  return { dataUrl: `data:image/jpeg;base64,${outputBuffer.toString("base64")}`, before: inputBuffer.length, after: outputBuffer.length };
}

// Retries once on a statement-timeout-shaped error, after a longer pause.
// Any other error, or a second failure, is reported and treated as failed
// (the row is left as-is -- safe to just re-run the script again later).
async function updateWithRetry(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (!error) return { success: true };
  const isTimeout = /timeout/i.test(error.message || "");
  if (!isTimeout) return { success: false, error };
  await sleep(TIMEOUT_RETRY_DELAY_MS);
  const retry = await supabase.from(table).update(patch).eq("id", id);
  if (!retry.error) return { success: true, retried: true };
  return { success: false, error: retry.error };
}

// Same retry-once-on-timeout treatment for the initial bulk SELECT --
// menu_items' own fetch timed out on a prior run before any row could even
// be looked at, which the write-retry logic above doesn't cover.
async function selectWithRetry(table, columns) {
  const first = await supabase.from(table).select(columns);
  if (!first.error) return first;
  if (!/timeout/i.test(first.error.message || "")) return first;
  await sleep(TIMEOUT_RETRY_DELAY_MS);
  return supabase.from(table).select(columns);
}

async function run() {
  console.log(DRY_RUN ? "DRY RUN -- no writes will be made.\n" : "LIVE RUN -- paced writes, will not repeat the earlier outage.\n");
  let grandBefore = 0, grandAfter = 0, grandCount = 0, grandSkipped = 0, grandFailed = 0;

  for (let ti = 0; ti < TARGETS.length; ti++) {
    const t = TARGETS[ti];
    if (ti > 0) await sleep(TABLE_DELAY_MS);

    const { data, error } = await selectWithRetry(t.table, `id, ${t.photoColumn}, ${t.isPhotoColumn}`);
    if (error) { console.error(`Failed to fetch ${t.table}:`, error.message); continue; }

    const candidates = data.filter(r => r[t.isPhotoColumn] && r[t.photoColumn]);
    console.log(`${t.table}: ${candidates.length} of ${data.length} rows have a photo`);

    let tableBefore = 0, tableAfter = 0, tableCount = 0, tableSkipped = 0, tableFailed = 0;
    for (const row of candidates) {
      const result = await compressDataUrl(row[t.photoColumn], t.maxDim, t.quality);
      if (!result) { tableSkipped++; continue; }
      if (result.after >= result.before) { tableSkipped++; continue; } // already small/optimal (e.g. already compressed in a prior run) -- don't touch

      if (DRY_RUN) {
        tableBefore += result.before; tableAfter += result.after; tableCount++;
        continue;
      }

      const outcome = await updateWithRetry(t.table, row.id, { [t.photoColumn]: result.dataUrl });
      await sleep(WRITE_DELAY_MS);

      if (outcome.success) {
        tableBefore += result.before; tableAfter += result.after; tableCount++;
        if (outcome.retried) console.log(`  (recovered after retry: ${t.table}.${row.id})`);
      } else {
        tableFailed++;
        console.error(`  Failed to update ${t.table}.${row.id}:`, outcome.error.message);
      }
    }
    console.log(`  ${tableCount} compressed (${(tableBefore/1024).toFixed(0)}KB -> ${(tableAfter/1024).toFixed(0)}KB), ${tableSkipped} skipped, ${tableFailed} failed\n`);
    grandBefore += tableBefore; grandAfter += tableAfter; grandCount += tableCount; grandSkipped += tableSkipped; grandFailed += tableFailed;
  }

  console.log("=".repeat(50));
  console.log(`Total: ${grandCount} photos compressed, ${grandSkipped} skipped, ${grandFailed} failed`);
  console.log(`Total size: ${(grandBefore/1024/1024).toFixed(2)}MB -> ${(grandAfter/1024/1024).toFixed(2)}MB (${grandBefore ? (100-100*grandAfter/grandBefore).toFixed(0) : 0}% smaller)`);
  if (grandFailed > 0) console.log("Some rows failed -- safe to just run this script again, it will skip everything already done.");
  if (DRY_RUN) console.log("\nThis was a dry run -- nothing was written. Re-run without --dry-run to apply.");
}

run();
