// Loads realistic sample data into every table for testing/demo purposes.
// Every row uses an id prefixed "demo-" so it can be cleanly removed later
// with scripts/clear-demo-data.js — this never touches your real admin
// account or anything without that prefix.
//
// Run:  node --env-file=.env scripts/seed-demo-data.js

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing env vars. Run with: node --env-file=.env scripts/seed-demo-data.js");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 1x1 placeholder PNG — stands in for a real receipt photo
const PLACEHOLDER_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function getWeekKey(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diffDays = Math.floor((date - start) / 86400000);
  const weekNum = Math.ceil((diffDays + start.getDay() + 1) / 7);
  return `${date.getFullYear()}-${weekNum}`;
}
const TODAY = new Date();
const WEEK_KEY = getWeekKey(TODAY);
const TODAY_ISO = TODAY.toISOString().slice(0, 10);
function isoOffset(days) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const users = [
  { id: "demo-u1", username: "miguel.santos", password: "Demo1234", role: "staff", name: "Miguel Santos", avatar: "MS", plant: "KF-Main", id_number: "KF2400101", phone: "09171112201", credit_limit: 1000, credit_balance: 1000, registered: true, is_employee: true },
  { id: "demo-u2", username: "grace.villanueva", password: "Demo1234", role: "staff", name: "Grace Villanueva", avatar: "GV", plant: "Colortree", id_number: "CT-24-0101", phone: "09171112202", credit_limit: 1000, credit_balance: 1000, registered: true, is_employee: true },
  { id: "demo-u3", username: "ramon.cruz", password: "Demo1234", role: "staff", name: "Ramon Cruz", avatar: "RC", plant: "KF-Global", id_number: "KF2401101", phone: "09171112203", credit_limit: 1000, credit_balance: 1000, registered: true, is_employee: true },
  { id: "demo-u4", username: "kim.delatorre", password: "Demo1234", role: "user", name: "Kim Dela Torre", avatar: "KD", plant: "KF-Main", id_number: "KF2400201", phone: "09171112204", credit_limit: 1000, credit_balance: 640, registered: true, is_employee: true },
  { id: "demo-u5", username: "angel.reyes", password: "Demo1234", role: "user", name: "Angel Reyes", avatar: "AR", plant: "Colortree", id_number: "CT-24-0201", phone: "09171112205", credit_limit: 1000, credit_balance: 85, registered: true, is_employee: true },
  { id: "demo-u6", username: "mark.aquino", password: "Demo1234", role: "user", name: "Mark Aquino", avatar: "MA", plant: "KF-Global", id_number: "KF2401201", phone: "09171112206", credit_limit: 1000, credit_balance: 920, registered: true, is_employee: true },
  { id: "demo-u7", username: "", password: "", role: "user", name: "Nadine Garcia", avatar: "NG", plant: "KF-Main", id_number: "KF2400301", phone: "", credit_limit: 1000, credit_balance: 1000, registered: false, is_employee: true },
  { id: "demo-u8", username: "paolo.outside", password: "Demo1234", role: "user", name: "Paolo Mendoza", avatar: "PM", plant: "", id_number: "", phone: "09171112208", email: "paolo.mendoza@example.com", credit_limit: 0, credit_balance: 0, registered: true, is_employee: false },
];

const menuItems = [
  { id: "demo-m1", day: "Monday", name: "Adobo with Rice", price: 65, img: "🍚", cat: "LUNCH", grams: 350 },
  { id: "demo-m2", day: "Monday", name: "Pandesal", price: 5, img: "🥖", cat: "BREAKFAST", grams: 50 },
  { id: "demo-m3", day: "Tuesday", name: "Tinola with Rice", price: 65, img: "🍗", cat: "LUNCH", grams: 370 },
  { id: "demo-m4", day: "Tuesday", name: "Maja Blanca", price: 30, img: "🍮", cat: "SNACK", grams: 150 },
  { id: "demo-m5", day: "Wednesday", name: "Lechon Kawali & Rice", price: 85, img: "🥩", cat: "LUNCH", grams: 380 },
  { id: "demo-m6", day: "Wednesday", name: "Halo-halo", price: 50, img: "🍧", cat: "SNACK", grams: 350 },
  { id: "demo-m7", day: "Thursday", name: "Kare-kare & Rice", price: 90, img: "🍛", cat: "LUNCH", grams: 420 },
  { id: "demo-m8", day: "Thursday", name: "Banana Cue", price: 10, img: "🍌", cat: "SNACK", grams: 120 },
  { id: "demo-m9", day: "Friday", name: "Bangus Sisig & Rice", price: 80, img: "🐟", cat: "LUNCH", grams: 360 },
  { id: "demo-m10", day: "Friday", name: "Buko Pandan", price: 35, img: "🥥", cat: "SNACK", grams: 200 },
  { id: "demo-m11", day: "Saturday", name: "Bulalo & Rice", price: 120, img: "🦴", cat: "LUNCH", grams: 500 },
  { id: "demo-m12", day: "Saturday", name: "Turon", price: 15, img: "🍡", cat: "SNACK", grams: 100 },
].map(m => ({ ...m, week_key: WEEK_KEY, available: true, is_photo: false }));

const otherProducts = [
  { id: "demo-op1", name: "Nova Chips", category: "Chips", buy_price: 8, price: 15, emoji: "🥔", stock: 20 },
  { id: "demo-op2", name: "Rebisco Biscuit", category: "Biscuit", buy_price: 7, price: 12, emoji: "🍪", stock: 30 },
  { id: "demo-op3", name: "Lucky Me! Pancit Canton", category: "Instant Noodles", buy_price: 10, price: 18, emoji: "🍜", stock: 20 },
  { id: "demo-op4", name: "Nescafé 3-in-1", category: "Instant Coffee", buy_price: 5, price: 8, emoji: "☕", stock: 50 },
  { id: "demo-op5", name: "Milo Sachet", category: "Powdered Drinks", buy_price: 7, price: 12, emoji: "🥤", stock: 35 },
  { id: "demo-op6", name: "Coca-Cola 1.5L", category: "Soft Drinks", buy_price: 50, price: 75, emoji: "🥤", stock: 12 },
  { id: "demo-op7", name: "C2 Apple 230ml", category: "Others", buy_price: 13, price: 20, emoji: "🧃", stock: 18 },
  { id: "demo-op8", name: "Mineral Water 500ml", category: "Others", buy_price: 8, price: 15, emoji: "💧", stock: 24 },
].map(p => ({ ...p, is_photo: false, available: true }));

const orders = [
  { id: "demo-KF900001", user_id: "demo-u4", user_name: "Kim Dela Torre", date: TODAY_ISO, plant: "KF-Main", items: [{ name: "Adobo with Rice", qty: 2, price: 65, grams: 350, buyPrice: null }, { name: "Pandesal", qty: 2, price: 5, grams: 50, buyPrice: null }], total: 140, payment_type: "Cash", time: "7:50 AM" },
  { id: "demo-KF900002", user_id: "demo-u5", user_name: "Angel Reyes", date: TODAY_ISO, plant: "Colortree", items: [{ name: "Tinola with Rice", qty: 1, price: 65, grams: 370, buyPrice: null }, { name: "Nova Chips", qty: 2, price: 15, grams: null, buyPrice: 8 }], total: 95, payment_type: "Credit", time: "8:20 AM" },
  { id: "demo-KF900003", user_id: "demo-u6", user_name: "Mark Aquino", date: TODAY_ISO, plant: "KF-Global", items: [{ name: "Lechon Kawali & Rice", qty: 1, price: 85, grams: 380, buyPrice: null }], total: 85, payment_type: "Cash", time: "9:00 AM" },
  { id: "demo-KF900004", user_id: "demo-u4", user_name: "Kim Dela Torre", date: TODAY_ISO, plant: "KF-Main", items: [{ name: "Kare-kare & Rice", qty: 1, price: 90, grams: 420, buyPrice: null }, { name: "Milo Sachet", qty: 1, price: 12, grams: null, buyPrice: 7 }], total: 102, payment_type: null, time: "10:15 AM" },
  { id: "demo-KF900005", user_id: "demo-u5", user_name: "Angel Reyes", date: TODAY_ISO, plant: "Colortree", items: [{ name: "Bangus Sisig & Rice", qty: 1, price: 80, grams: 360, buyPrice: null }], total: 80, payment_type: null, time: "11:00 AM" },
  { id: "demo-KF900006", user_id: "demo-u6", user_name: "Mark Aquino", date: isoOffset(-1), plant: "KF-Global", items: [{ name: "Bulalo & Rice", qty: 1, price: 120, grams: 500, buyPrice: null }, { name: "Turon", qty: 2, price: 15, grams: 100, buyPrice: null }], total: 150, payment_type: "Cash", time: "12:30 PM" },
  { id: "demo-KF900007", user_id: "demo-u4", user_name: "Kim Dela Torre", date: isoOffset(-1), plant: "KF-Main", items: [{ name: "Coca-Cola 1.5L", qty: 1, price: 75, grams: null, buyPrice: 50 }, { name: "Rebisco Biscuit", qty: 2, price: 12, grams: null, buyPrice: 7 }], total: 99, payment_type: "Credit", time: "1:15 PM" },
];

const receipts = [
  { id: "demo-rc1", photo: PLACEHOLDER_IMG, date: TODAY_ISO, amount: 850, note: "Weekly vegetable and meat restock", source: "Supplier", source_name: "Manila Fresh Meat Supplier", purchase_type: "Raw Materials", uploaded_by: "Staff Admin", uploaded_at: TODAY.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) },
  { id: "demo-rc2", photo: PLACEHOLDER_IMG, date: TODAY_ISO, amount: 620, note: "Chips and drinks restock", source: "Grocery", source_name: "Puregold", purchase_type: "Grocery", uploaded_by: "Staff Admin", uploaded_at: TODAY.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) },
  { id: "demo-rc3", photo: PLACEHOLDER_IMG, date: isoOffset(-1), amount: 310, note: "Rice sacks", source: "Supplier", source_name: "Golden Grain Rice Supplier", purchase_type: "Raw Materials", uploaded_by: "Staff Admin", uploaded_at: TODAY.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) },
];

const inventoryLog = [
  { id: "demo-il1", product: "Nova Chips", emoji: "🥔", type: "IN", qty: 20, before: 0, after: 20, by: "Staff Admin", time: TODAY.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) + " · 7:30 AM" },
  { id: "demo-il2", product: "Coca-Cola 1.5L", emoji: "🥤", type: "IN", qty: 12, before: 0, after: 12, by: "Staff Admin", time: TODAY.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) + " · 7:35 AM" },
  { id: "demo-il3", product: "Nova Chips", emoji: "🥔", type: "OUT", qty: 2, before: 20, after: 18, by: "System", time: TODAY.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) + " · 8:20 AM" },
];

async function seed() {
  const steps = [
    ["users", users],
    ["menu_items", menuItems],
    ["other_products", otherProducts],
    ["orders", orders],
    ["receipts", receipts],
    ["inventory_log", inventoryLog],
  ];
  for (const [table, rows] of steps) {
    const { error } = await supabase.from(table).insert(rows);
    if (error) console.error(`${table} failed:`, error.message);
    else console.log(`${table}: inserted ${rows.length} rows`);
  }
  console.log("\nDemo login: any of miguel.santos / grace.villanueva / ramon.cruz (staff), kim.delatorre / angel.reyes / mark.aquino (customer) — password Demo1234");
  console.log("Run scripts/clear-demo-data.js when you're ready to remove all of this.");
}

seed();
