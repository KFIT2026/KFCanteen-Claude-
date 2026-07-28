// Seeds a full, realistic demo dataset for tomorrow's live demonstration.
// Unlike seed-demo-data.js, this is meant to STAY in the database (not be
// cleared afterward). Still uses "demo-" id prefixes for easy identification.
// Requires scripts/demo-images.json (run scripts/gen-demo-images.js first).
//
// Run:  node --env-file=.env scripts/seed-demo-persistent.js

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing env vars. Run with: node --env-file=.env scripts/seed-demo-persistent.js");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const images = JSON.parse(fs.readFileSync(__dirname + "/demo-images.json"));

function getWeekKey(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diffDays = Math.floor((date - start) / 86400000);
  const weekNum = Math.ceil((diffDays + start.getDay() + 1) / 7);
  return `${date.getFullYear()}-${weekNum}`;
}
const TODAY = new Date();
const WEEK_KEY = getWeekKey(TODAY);
const TODAY_ISO = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,"0")}-${String(TODAY.getDate()).padStart(2,"0")}`;
function isoOffset(days) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
const nowStamp = () => TODAY.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+TODAY.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

/* ── 1. Raw Materials ── */
const rawMaterials = [
  { id:"demo-rm-chicken", name:"Chicken Thigh", unit:"kg", stock:25, buy_price:180 },
  { id:"demo-rm-pork",    name:"Pork Belly",    unit:"kg", stock:20, buy_price:220 },
  { id:"demo-rm-beef",    name:"Beef Cubes",    unit:"kg", stock:10, buy_price:320 },
  { id:"demo-rm-rice",    name:"Rice",          unit:"kg", stock:60, buy_price:55 },
  { id:"demo-rm-soy",     name:"Soy Sauce",     unit:"L",  stock:12, buy_price:65 },
  { id:"demo-rm-vinegar", name:"Vinegar",       unit:"L",  stock:10, buy_price:45 },
  { id:"demo-rm-garlic",  name:"Garlic",        unit:"kg", stock:6,  buy_price:120 },
  { id:"demo-rm-onion",   name:"Onion",         unit:"kg", stock:8,  buy_price:90 },
  { id:"demo-rm-oil",     name:"Cooking Oil",   unit:"L",  stock:15, buy_price:95 },
  { id:"demo-rm-flour",   name:"Flour",         unit:"kg", stock:20, buy_price:45 },
];

/* ── 2. Dishes (with generated photos) ── */
const dishDefs = [
  { id:"demo-dish-adobo",   name:"Adobo with Rice",      cat:"LUNCH",     price:65, grams:350,
    ingredients:[["demo-rm-chicken",0.2],["demo-rm-rice",0.15],["demo-rm-soy",0.03],["demo-rm-vinegar",0.02],["demo-rm-garlic",0.01]] },
  { id:"demo-dish-tinola",  name:"Tinola with Rice",     cat:"LUNCH",     price:65, grams:370,
    ingredients:[["demo-rm-chicken",0.22],["demo-rm-rice",0.15],["demo-rm-onion",0.02],["demo-rm-garlic",0.01]] },
  { id:"demo-dish-lechon",  name:"Lechon Kawali & Rice", cat:"LUNCH",     price:85, grams:380,
    ingredients:[["demo-rm-pork",0.25],["demo-rm-rice",0.15],["demo-rm-oil",0.05]] },
  { id:"demo-dish-karekare",name:"Kare-kare & Rice",     cat:"LUNCH",     price:90, grams:420,
    ingredients:[["demo-rm-beef",0.25],["demo-rm-rice",0.15],["demo-rm-onion",0.02],["demo-rm-garlic",0.01]] },
  { id:"demo-dish-sisig",   name:"Bangus Sisig & Rice",  cat:"LUNCH",     price:80, grams:360,
    ingredients:[["demo-rm-pork",0.15],["demo-rm-rice",0.15],["demo-rm-onion",0.02],["demo-rm-garlic",0.01]] },
  { id:"demo-dish-pandesal",name:"Pandesal",             cat:"BREAKFAST", price:5,  grams:50,
    ingredients:[["demo-rm-flour",0.05]] },
];
const dishes = dishDefs.map(d => ({
  id:d.id, name:d.name, cat:d.cat, price:d.price, img:images.dishes[d.name], is_photo:true, grams:d.grams,
}));
const dishIngredients = dishDefs.flatMap(d =>
  d.ingredients.map(([rmId, qty], i) => ({ id:d.id+"-ing"+i, dish_id:d.id, raw_material_id:rmId, quantity:qty }))
);

/* ── 3. Menu items — every item linked to a dish (mandatory-link flow) ── */
const menuPlan = [
  ["Monday", "demo-dish-adobo"], ["Monday", "demo-dish-pandesal"],
  ["Tuesday", "demo-dish-tinola"],
  ["Wednesday", "demo-dish-lechon"],
  ["Thursday", "demo-dish-karekare"],
  ["Friday", "demo-dish-sisig"],
  ["Saturday", "demo-dish-adobo"],
];
const menuItems = menuPlan.map(([day, dishId], i) => {
  const d = dishDefs.find(x => x.id === dishId);
  return {
    id:"demo-mi"+i, week_key:WEEK_KEY, day, name:d.name, price:d.price, available:true,
    img:images.dishes[d.name], is_photo:true, cat:d.cat, grams:d.grams, dish_id:dishId,
  };
});

/* ── 4. Other Products (snacks/drinks) ── */
const otherProducts = [
  { id:"demo-op1", name:"Nova Chips", category:"Chips", buy_price:8, price:15, emoji:"🥔", stock:20 },
  { id:"demo-op2", name:"Rebisco Biscuit", category:"Biscuit", buy_price:7, price:12, emoji:"🍪", stock:30 },
  { id:"demo-op3", name:"Lucky Me! Pancit Canton", category:"Instant Noodles", buy_price:10, price:18, emoji:"🍜", stock:20 },
  { id:"demo-op4", name:"Nescafé 3-in-1", category:"Instant Coffee", buy_price:5, price:8, emoji:"☕", stock:50 },
  { id:"demo-op5", name:"Milo Sachet", category:"Powdered Drinks", buy_price:7, price:12, emoji:"🥤", stock:35 },
  { id:"demo-op6", name:"Coca-Cola 1.5L", category:"Soft Drinks", buy_price:50, price:75, emoji:"🥤", stock:12 },
  { id:"demo-op7", name:"C2 Apple 230ml", category:"Others", buy_price:13, price:20, emoji:"🧃", stock:18 },
  { id:"demo-op8", name:"Mineral Water 500ml", category:"Others", buy_price:8, price:15, emoji:"💧", stock:24 },
].map(p => ({ ...p, is_photo:false, available:true }));

/* ── 5. Demo accounts ── */
const users = [
  { id:"demo-u1", username:"miguel.santos", password:"Demo1234", role:"staff", name:"Miguel Santos", avatar:"MS", plant:"KF-Main", id_number:"KF2400101", department:"Canteen", position:"Canteen Staff", company:"KOU FU COLOR PRINTING CORPORATION", phone:"09171112201", credit_limit:1000, credit_balance:1000, registered:true, is_employee:true },
  { id:"demo-u2", username:"grace.villanueva", password:"Demo1234", role:"staff", name:"Grace Villanueva", avatar:"GV", plant:"Colortree", id_number:"CT-24-0101", department:"Canteen", position:"Canteen Staff", company:"COLORTREE LABEL CORPORATION", phone:"09171112202", credit_limit:1000, credit_balance:1000, registered:true, is_employee:true },
  { id:"demo-u3", username:"ramon.cruz", password:"Demo1234", role:"staff-admin", name:"Ramon Cruz", avatar:"RC", plant:"KF-Global", id_number:"KF2401101", department:"Canteen", position:"Canteen Supervisor", company:"KOU FU COLOR PRINTING CORPORATION", phone:"09171112203", credit_limit:1000, credit_balance:1000, registered:true, is_employee:true },
  { id:"demo-u4", username:"kim.delatorre", password:"Demo1234", role:"user", name:"Kim Dela Torre", avatar:"KD", plant:"KF-Main", id_number:"KF2400201", department:"Accounting", position:"Staff", company:"KOU FU COLOR PRINTING CORPORATION", phone:"09171112204", email:"kim.delatorre@example.com", credit_limit:1000, credit_balance:640, registered:true, is_employee:true },
  { id:"demo-u5", username:"angel.reyes", password:"Demo1234", role:"user", name:"Angel Reyes", avatar:"AR", plant:"Colortree", id_number:"CT-24-0201", department:"HR", position:"Staff", company:"COLORTREE LABEL CORPORATION", phone:"09171112205", email:"angel.reyes@example.com", credit_limit:1000, credit_balance:85, registered:true, is_employee:true },
  { id:"demo-u6", username:"mark.aquino", password:"Demo1234", role:"user", name:"Mark Aquino", avatar:"MA", plant:"KF-Global", id_number:"KF2401201", department:"MIS", position:"Staff", company:"KOU FU COLOR PRINTING CORPORATION", phone:"09171112206", email:"mark.aquino@example.com", credit_limit:1000, credit_balance:920, registered:true, is_employee:true },
  { id:"demo-u7", username:null, password:"", role:"user", name:"Nadine Garcia", avatar:"NG", plant:"", id_number:"KF2400301", department:"Compliance", position:"Staff", company:"KOU FU COLOR PRINTING CORPORATION", phone:"", credit_limit:1000, credit_balance:1000, registered:false, is_employee:true },
  { id:"demo-u8", username:"paolo.outside", password:"Demo1234", role:"user", name:"Paolo Mendoza", avatar:"PM", plant:"", id_number:"", phone:"09171112208", email:"paolo.mendoza@example.com", credit_limit:0, credit_balance:0, registered:true, is_employee:false },
];

/* ── 6. Orders ── */
const orders = [
  { id:"demo-KF900001", user_id:"demo-u4", user_name:"Kim Dela Torre", date:TODAY_ISO, plant:"KF-Main", items:[{name:"Adobo with Rice",qty:2,price:65,grams:350,buyPrice:null},{name:"Pandesal",qty:2,price:5,grams:50,buyPrice:null}], total:140, payment_type:"Cash", time:"7:50 AM" },
  { id:"demo-KF900002", user_id:"demo-u5", user_name:"Angel Reyes", date:TODAY_ISO, plant:"Colortree", items:[{name:"Tinola with Rice",qty:1,price:65,grams:370,buyPrice:null},{name:"Nova Chips",qty:2,price:15,grams:null,buyPrice:8}], total:95, payment_type:"Credit", time:"8:20 AM" },
  { id:"demo-KF900003", user_id:"demo-u6", user_name:"Mark Aquino", date:TODAY_ISO, plant:"KF-Global", items:[{name:"Lechon Kawali & Rice",qty:1,price:85,grams:380,buyPrice:null}], total:85, payment_type:"Cash", time:"9:00 AM" },
  { id:"demo-KF900004", user_id:"demo-u4", user_name:"Kim Dela Torre", date:TODAY_ISO, plant:"KF-Main", items:[{name:"Kare-kare & Rice",qty:1,price:90,grams:420,buyPrice:null},{name:"Milo Sachet",qty:1,price:12,grams:null,buyPrice:7}], total:102, payment_type:null, time:"10:15 AM" },
  { id:"demo-KF900005", user_id:"demo-u5", user_name:"Angel Reyes", date:TODAY_ISO, plant:"Colortree", items:[{name:"Bangus Sisig & Rice",qty:1,price:80,grams:360,buyPrice:null}], total:80, payment_type:null, time:"11:00 AM" },
  { id:"demo-KF900006", user_id:"demo-u6", user_name:"Mark Aquino", date:isoOffset(-1), plant:"KF-Global", items:[{name:"Adobo with Rice",qty:1,price:65,grams:350,buyPrice:null},{name:"Coca-Cola 1.5L",qty:1,price:75,grams:null,buyPrice:50}], total:140, payment_type:"Cash", time:"12:30 PM" },
  { id:"demo-KF900007", user_id:"demo-u4", user_name:"Kim Dela Torre", date:isoOffset(-1), plant:"KF-Main", items:[{name:"Coca-Cola 1.5L",qty:1,price:75,grams:null,buyPrice:50},{name:"Rebisco Biscuit",qty:2,price:12,grams:null,buyPrice:7}], total:99, payment_type:"Credit", time:"1:15 PM" },
];

/* ── 7. Receipts (with generated photos) ── */
const receipts = Object.values(images.receipts).map((r, i) => ({
  id:"demo-rc"+(i+1), photo:r.photo, date: i < 2 ? TODAY_ISO : isoOffset(-1), amount:r.meta.total,
  note:`${r.meta.items.length} item${r.meta.items.length>1?"s":""} purchased`,
  source: r.meta.store.includes("SUPPLIER") || r.meta.store.includes("MARKET") ? "Supplier" : "Grocery",
  source_name: r.meta.store.replace(/\s+/g," ").split(" ").map(w=>w[0]+w.slice(1).toLowerCase()).join(" "),
  purchase_type: r.meta.items.some(it=>/kg|L\)/.test(it.name)) ? "Raw Materials" : "Grocery",
  uploaded_by:"Ramon Cruz", uploaded_at:nowStamp(),
}));

/* ── 8. Logs ── */
const rawMaterialLog = rawMaterials.map((m, i) => ({
  id:"demo-rml"+i, raw_material:m.name, unit:m.unit, type:"IN", qty:m.stock, before:0, after:m.stock, by:"Ramon Cruz", time:nowStamp(),
}));
const inventoryLog = [
  { id:"demo-il1", product:"Nova Chips", emoji:"🥔", type:"IN", qty:20, before:0, after:20, by:"Ramon Cruz", time:nowStamp() },
  { id:"demo-il2", product:"Coca-Cola 1.5L", emoji:"🥤", type:"IN", qty:12, before:0, after:12, by:"Ramon Cruz", time:nowStamp() },
  { id:"demo-il3", product:"Nova Chips", emoji:"🥔", type:"OUT", qty:2, before:20, after:18, by:"System", time:nowStamp() },
];

async function seed() {
  const steps = [
    ["users", users],
    ["raw_materials", rawMaterials],
    ["dishes", dishes],
    ["dish_ingredients", dishIngredients],
    ["menu_items", menuItems],
    ["other_products", otherProducts],
    ["orders", orders],
    ["receipts", receipts],
    ["raw_material_log", rawMaterialLog],
    ["inventory_log", inventoryLog],
  ];
  for (const [table, rows] of steps) {
    const { error } = await supabase.from(table).insert(rows);
    if (error) console.error(`${table} FAILED:`, error.message);
    else console.log(`${table}: inserted ${rows.length} rows`);
  }
  console.log("\nDemo logins (password Demo1234):");
  console.log("  staff:       miguel.santos, grace.villanueva");
  console.log("  staff-admin: ramon.cruz");
  console.log("  customer:    kim.delatorre, angel.reyes, mark.aquino");
  console.log("This data is meant to STAY for the demo. Run scripts/clear-demo-data.js only when you're done with it.");
}
seed();
