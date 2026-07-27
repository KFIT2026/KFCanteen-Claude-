// Adds a few demo raw materials + a demo dish (with recipe) for documentation screenshots.
// Uses "demo-" id prefix so scripts/clear-demo-data.js can remove them too.
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

const rawMaterials = [
  { id: "demo-rm1", name: "Chicken Thigh", unit: "kg", stock: 25, buy_price: 180 },
  { id: "demo-rm2", name: "Rice", unit: "kg", stock: 50, buy_price: 55 },
  { id: "demo-rm3", name: "Soy Sauce", unit: "L", stock: 8, buy_price: 65 },
  { id: "demo-rm4", name: "Vinegar", unit: "L", stock: 6, buy_price: 45 },
];

const dishes = [
  { id: "demo-dish1", name: "Adobo with Rice", cat: "LUNCH", price: 65, img: "🍚", is_photo: false, grams: 350 },
];

const dishIngredients = [
  { id: "demo-di1", dish_id: "demo-dish1", raw_material_id: "demo-rm1", quantity: 0.2 },
  { id: "demo-di2", dish_id: "demo-dish1", raw_material_id: "demo-rm2", quantity: 0.15 },
  { id: "demo-di3", dish_id: "demo-dish1", raw_material_id: "demo-rm3", quantity: 0.03 },
];

async function main() {
  let r = await supabase.from("raw_materials").insert(rawMaterials);
  console.log("raw_materials:", r.error ? r.error.message : "ok " + rawMaterials.length);
  r = await supabase.from("dishes").insert(dishes);
  console.log("dishes:", r.error ? r.error.message : "ok " + dishes.length);
  r = await supabase.from("dish_ingredients").insert(dishIngredients);
  console.log("dish_ingredients:", r.error ? r.error.message : "ok " + dishIngredients.length);
}
main();
