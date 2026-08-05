// One-time backfill: recompresses photos already stored in the database.
// Uploads have always gone straight to base64 with no resizing, so
// menu_items/other_products/dishes photos average 115-165KB each -- every
// full-table fetch (Manage Menu, Groceries, Dishes) was pulling 20+MB of
// image data. This re-encodes each existing photo the same way new uploads
// are now compressed client-side (src/canteen-app.jsx's compressImageFile):
// downscaled to at most 800px on the long side, re-encoded as JPEG at 70%
// quality.
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

// { table, photoColumn, isPhotoColumn, idColumn, maxDim, quality }
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

async function run() {
  console.log(DRY_RUN ? "DRY RUN -- no writes will be made.\n" : "LIVE RUN -- will write compressed photos back to the database.\n");
  let grandBefore = 0, grandAfter = 0, grandCount = 0, grandSkipped = 0;

  for (const t of TARGETS) {
    const { data, error } = await supabase.from(t.table).select(`id, ${t.photoColumn}, ${t.isPhotoColumn}`);
    if (error) { console.error(`Failed to fetch ${t.table}:`, error.message); continue; }

    const candidates = data.filter(r => r[t.isPhotoColumn] && r[t.photoColumn]);
    console.log(`${t.table}: ${candidates.length} of ${data.length} rows have a photo`);

    let tableBefore = 0, tableAfter = 0, tableCount = 0, tableSkipped = 0;
    for (const row of candidates) {
      const result = await compressDataUrl(row[t.photoColumn], t.maxDim, t.quality);
      if (!result) { tableSkipped++; continue; }
      if (result.after >= result.before) { tableSkipped++; continue; } // already small/optimal, don't touch

      tableBefore += result.before;
      tableAfter += result.after;
      tableCount++;

      if (!DRY_RUN) {
        const { error: updErr } = await supabase.from(t.table).update({ [t.photoColumn]: result.dataUrl }).eq("id", row.id);
        if (updErr) console.error(`  Failed to update ${t.table}.${row.id}:`, updErr.message);
      }
    }
    console.log(`  ${tableCount} compressed (${(tableBefore/1024).toFixed(0)}KB -> ${(tableAfter/1024).toFixed(0)}KB), ${tableSkipped} skipped\n`);
    grandBefore += tableBefore; grandAfter += tableAfter; grandCount += tableCount; grandSkipped += tableSkipped;
  }

  console.log("=".repeat(50));
  console.log(`Total: ${grandCount} photos compressed, ${grandSkipped} skipped`);
  console.log(`Total size: ${(grandBefore/1024/1024).toFixed(2)}MB -> ${(grandAfter/1024/1024).toFixed(2)}MB (${grandBefore ? (100-100*grandAfter/grandBefore).toFixed(0) : 0}% smaller)`);
  if (DRY_RUN) console.log("\nThis was a dry run -- nothing was written. Re-run without --dry-run to apply.");
}

run();
