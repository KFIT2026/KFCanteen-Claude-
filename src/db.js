import { supabase } from "./supabaseClient";

/* ── field mapping: app (camelCase) <-> database (snake_case) ── */

export const userToDb = (u) => ({
  id: u.id,
  username: u.username,
  password: u.password,
  role: u.role,
  name: u.name,
  avatar: u.avatar,
  plant: u.plant,
  id_number: u.idNumber,
  department: u.department,
  position: u.position,
  company: u.company,
  phone: u.phone,
  email: u.email,
  credit_limit: u.creditLimit,
  credit_balance: u.creditBalance,
  registered: u.registered,
  is_employee: u.isEmployee,
  reg_code: u.regCode,
});

export const userFromDb = (r) => ({
  id: r.id,
  username: r.username,
  password: r.password,
  role: r.role,
  name: r.name,
  avatar: r.avatar,
  plant: r.plant,
  idNumber: r.id_number,
  department: r.department,
  position: r.position,
  company: r.company,
  phone: r.phone,
  email: r.email,
  creditLimit: Number(r.credit_limit),
  creditBalance: Number(r.credit_balance),
  registered: r.registered,
  isEmployee: r.is_employee,
  regCode: r.reg_code,
});

/* ── users table ── */

export const fetchUsers = async () => {
  const { data, error } = await supabase.from("users").select("*");
  if (error) { console.error("fetchUsers failed:", error); return []; }
  return data.map(userFromDb);
};

export const dbInsertUser = async (user) => {
  const { error } = await supabase.from("users").insert(userToDb(user));
  if (error) console.error("dbInsertUser failed:", error);
  return { success: !error, error };
};

export const dbUpdateUser = async (id, patch) => {
  const dbPatch = userToDb({ id, ...patch });
  delete dbPatch.id;
  Object.keys(dbPatch).forEach(k => dbPatch[k] === undefined && delete dbPatch[k]);
  const { error } = await supabase.from("users").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateUser failed:", error);
  return { success: !error, error };
};

export const dbDeleteUser = async (id) => {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) console.error("dbDeleteUser failed:", error);
  return { success: !error, error };
};

export const dbDeleteUsers = async (ids) => {
  const { error } = await supabase.from("users").delete().in("id", ids);
  if (error) console.error("dbDeleteUsers failed:", error);
  return { success: !error, error };
};

export const dbInsertUsers = async (users) => {
  const { error } = await supabase.from("users").insert(users.map(userToDb));
  if (error) console.error("dbInsertUsers failed:", error);
  return { success: !error, error };
};

/* ── menu_items table ── */

const menuItemToDb = (weekKey, day, m) => ({
  id: m.id,
  week_key: weekKey,
  day,
  name: m.name,
  price: m.price,
  available: m.available,
  img: m.img,
  is_photo: m.isPhoto,
  cat: m.cat,
  grams: m.grams,
  serving_unit: m.servingUnit || "g",
  dish_id: m.dishId || null,
});

export const fetchMenu = async () => {
  const { data, error } = await supabase.from("menu_items").select("*");
  if (error) { console.error("fetchMenu failed:", error); return {}; }
  const menu = {};
  data.forEach(r => {
    if (!menu[r.week_key]) menu[r.week_key] = {};
    if (!menu[r.week_key][r.day]) menu[r.week_key][r.day] = [];
    menu[r.week_key][r.day].push({
      id: r.id, name: r.name, price: Number(r.price), available: r.available,
      img: r.img, isPhoto: r.is_photo, cat: r.cat, grams: r.grams==null?null:Number(r.grams),
      servingUnit: r.serving_unit || "g",
      dishId: r.dish_id || null,
    });
  });
  return menu;
};

export const dbInsertMenuItem = async (weekKey, day, item) => {
  const { error } = await supabase.from("menu_items").insert(menuItemToDb(weekKey, day, item));
  if (error) console.error("dbInsertMenuItem failed:", error);
};

export const dbUpdateMenuItem = async (id, patch) => {
  const dbPatch = {};
  if ("available" in patch) dbPatch.available = patch.available;
  if ("name" in patch) dbPatch.name = patch.name;
  if ("price" in patch) dbPatch.price = patch.price;
  const { error } = await supabase.from("menu_items").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateMenuItem failed:", error);
};

export const dbDeleteMenuItem = async (id) => {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) console.error("dbDeleteMenuItem failed:", error);
};

/* ── short_order_items / visitor_menu_items tables ── */
/* fixed, non-dated menus — same shape as menu_items minus week_key/day */

const fixedMenuItemToDb = (m) => ({
  id: m.id,
  name: m.name,
  price: m.price,
  available: m.available,
  img: m.img,
  is_photo: m.isPhoto,
  cat: m.cat,
  grams: m.grams,
  serving_unit: m.servingUnit || "g",
  dish_id: m.dishId || null,
});

const fixedMenuItemFromDb = (r) => ({
  id: r.id, name: r.name, price: Number(r.price), available: r.available,
  img: r.img, isPhoto: r.is_photo, cat: r.cat, grams: r.grams==null?null:Number(r.grams),
  servingUnit: r.serving_unit || "g",
  dishId: r.dish_id || null,
});

// Short Order items can optionally have size/price variants (Visitor Menu
// stays single-price, so it keeps using the shared fixedMenuItem* mapper).
const shortOrderItemToDb = (m) => ({ ...fixedMenuItemToDb(m), sizes: m.sizes||[] });
const shortOrderItemFromDb = (r) => ({ ...fixedMenuItemFromDb(r), sizes: r.sizes||[] });

export const fetchShortOrderItems = async () => {
  const { data, error } = await supabase.from("short_order_items").select("*");
  if (error) { console.error("fetchShortOrderItems failed:", error); return []; }
  return data.map(shortOrderItemFromDb);
};
export const dbInsertShortOrderItem = async (item) => {
  const { error } = await supabase.from("short_order_items").insert(shortOrderItemToDb(item));
  if (error) console.error("dbInsertShortOrderItem failed:", error);
};
export const dbUpdateShortOrderItem = async (id, patch) => {
  const dbPatch = {};
  if ("available" in patch) dbPatch.available = patch.available;
  if ("name" in patch) dbPatch.name = patch.name;
  if ("price" in patch) dbPatch.price = patch.price;
  if ("img" in patch) dbPatch.img = patch.img;
  if ("isPhoto" in patch) dbPatch.is_photo = patch.isPhoto;
  if ("cat" in patch) dbPatch.cat = patch.cat;
  if ("grams" in patch) dbPatch.grams = patch.grams;
  if ("servingUnit" in patch) dbPatch.serving_unit = patch.servingUnit;
  if ("dishId" in patch) dbPatch.dish_id = patch.dishId;
  if ("sizes" in patch) dbPatch.sizes = patch.sizes;
  const { error } = await supabase.from("short_order_items").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateShortOrderItem failed:", error);
};
export const dbDeleteShortOrderItem = async (id) => {
  const { error } = await supabase.from("short_order_items").delete().eq("id", id);
  if (error) console.error("dbDeleteShortOrderItem failed:", error);
};

export const fetchVisitorMenuItems = async () => {
  const { data, error } = await supabase.from("visitor_menu_items").select("*");
  if (error) { console.error("fetchVisitorMenuItems failed:", error); return []; }
  return data.map(fixedMenuItemFromDb);
};
export const dbInsertVisitorMenuItem = async (item) => {
  const { error } = await supabase.from("visitor_menu_items").insert(fixedMenuItemToDb(item));
  if (error) console.error("dbInsertVisitorMenuItem failed:", error);
};
export const dbUpdateVisitorMenuItem = async (id, patch) => {
  const dbPatch = {};
  if ("available" in patch) dbPatch.available = patch.available;
  if ("name" in patch) dbPatch.name = patch.name;
  if ("price" in patch) dbPatch.price = patch.price;
  if ("img" in patch) dbPatch.img = patch.img;
  if ("isPhoto" in patch) dbPatch.is_photo = patch.isPhoto;
  if ("cat" in patch) dbPatch.cat = patch.cat;
  if ("grams" in patch) dbPatch.grams = patch.grams;
  if ("servingUnit" in patch) dbPatch.serving_unit = patch.servingUnit;
  if ("dishId" in patch) dbPatch.dish_id = patch.dishId;
  const { error } = await supabase.from("visitor_menu_items").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateVisitorMenuItem failed:", error);
};
export const dbDeleteVisitorMenuItem = async (id) => {
  const { error } = await supabase.from("visitor_menu_items").delete().eq("id", id);
  if (error) console.error("dbDeleteVisitorMenuItem failed:", error);
};

/* ── other_products table ── */

const productToDb = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  buy_price: p.buyPrice,
  price: p.price,
  emoji: p.emoji,
  photo: p.photo,
  is_photo: p.isPhoto,
  stock: p.stock,
  available: p.available,
});

const productFromDb = (r) => ({
  id: r.id, name: r.name, category: r.category, buyPrice: Number(r.buy_price),
  price: Number(r.price), emoji: r.emoji, photo: r.photo, isPhoto: r.is_photo,
  stock: r.stock, available: r.available,
});

export const fetchProducts = async () => {
  const { data, error } = await supabase.from("other_products").select("*");
  if (error) { console.error("fetchProducts failed:", error); return []; }
  return data.map(productFromDb);
};

export const dbInsertProduct = async (product) => {
  const { error } = await supabase.from("other_products").insert(productToDb(product));
  if (error) console.error("dbInsertProduct failed:", error);
};

export const dbUpdateProduct = async (id, patch) => {
  const dbPatch = productToDb({ id, ...patch });
  delete dbPatch.id;
  Object.keys(dbPatch).forEach(k => dbPatch[k] === undefined && delete dbPatch[k]);
  const { error } = await supabase.from("other_products").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateProduct failed:", error);
};

export const dbDeleteProduct = async (id) => {
  const { error } = await supabase.from("other_products").delete().eq("id", id);
  if (error) console.error("dbDeleteProduct failed:", error);
};

/* ── orders table ── */

const orderToDb = (o) => ({
  id: o.id,
  user_id: o.userId,
  user_name: o.user,
  date: o.date,
  plant: o.plant,
  items: o.items,
  total: o.total,
  payment_type: o.paymentType || null,
  time: o.time,
  source: o.source || "app",
  encoded_by: o.encodedBy || null,
  guest_type: o.guestType || null,
  placed_at: o.placedAt || null,
  collected_by: o.collectedBy || null,
  collected_at: o.collectedAt || null,
});

const orderFromDb = (r) => ({
  id: r.id, userId: r.user_id, user: r.user_name, date: r.date, plant: r.plant,
  items: r.items, total: Number(r.total), paymentType: r.payment_type, time: r.time,
  source: r.source || "app", encodedBy: r.encoded_by, guestType: r.guest_type,
  placedAt: r.placed_at, status: r.status || "active", cancelledAt: r.cancelled_at,
  collectedBy: r.collected_by, collectedAt: r.collected_at,
});

export const fetchOrders = async () => {
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (error) { console.error("fetchOrders failed:", error); return []; }
  return data.map(orderFromDb);
};

export const dbInsertOrder = async (order) => {
  const { error } = await supabase.from("orders").insert(orderToDb(order));
  if (error) console.error("dbInsertOrder failed:", error);
  return { success: !error, error };
};

// Atomically assigns the next "KFxxxxxx" order id via a Postgres sequence
// (see migration 023) -- generating it client-side from the locally loaded
// orders list let two people placing orders around the same moment compute
// the same "next" id before either insert was visible to the other, and
// the second insert would silently fail (id is the primary key).
export const dbNextOrderId = async () => {
  const { data, error } = await supabase.rpc("next_order_id");
  if (error) { console.error("dbNextOrderId failed:", error); return null; }
  return data;
};

export const dbUpdateOrder = async (id, patch) => {
  const dbPatch = {};
  if ("paymentType" in patch) dbPatch.payment_type = patch.paymentType;
  if ("plant" in patch) dbPatch.plant = patch.plant;
  if ("status" in patch) dbPatch.status = patch.status;
  if ("cancelledAt" in patch) dbPatch.cancelled_at = patch.cancelledAt;
  if ("items" in patch) dbPatch.items = patch.items;
  if ("total" in patch) dbPatch.total = patch.total;
  if ("collectedBy" in patch) dbPatch.collected_by = patch.collectedBy;
  if ("collectedAt" in patch) dbPatch.collected_at = patch.collectedAt;
  const { error } = await supabase.from("orders").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateOrder failed:", error);
};

/* ── inventory_log table ── */

const logToDb = (l) => ({
  id: l.id, product: l.product, emoji: l.emoji, type: l.type,
  qty: l.qty, before: l.before, after: l.after, by: l.by, time: l.time,
});

const logFromDb = (r) => ({
  id: r.id, product: r.product, emoji: r.emoji, type: r.type,
  qty: r.qty, before: r.before, after: r.after, by: r.by, time: r.time,
});

export const fetchInventoryLog = async () => {
  const { data, error } = await supabase.from("inventory_log").select("*").order("created_at", { ascending: false });
  if (error) { console.error("fetchInventoryLog failed:", error); return []; }
  return data.map(logFromDb);
};

export const dbInsertLog = async (entry) => {
  const { error } = await supabase.from("inventory_log").insert(logToDb(entry));
  if (error) console.error("dbInsertLog failed:", error);
};

/* ── receipts table ── */

const receiptToDb = (r) => ({
  id: r.id, photo: r.photo, date: r.date, amount: r.amount,
  note: r.note, source: r.source, source_name: r.sourceName, purchase_type: r.purchaseType,
  uploaded_by: r.by, uploaded_at: r.uploadedAt,
});

const receiptFromDb = (r) => ({
  id: r.id, photo: r.photo, date: r.date, amount: r.amount==null?null:Number(r.amount),
  note: r.note, source: r.source, sourceName: r.source_name, purchaseType: r.purchase_type,
  by: r.uploaded_by, uploadedAt: r.uploaded_at,
});

export const fetchReceipts = async () => {
  const { data, error } = await supabase.from("receipts").select("*").order("created_at", { ascending: false });
  if (error) { console.error("fetchReceipts failed:", error); return []; }
  return data.map(receiptFromDb);
};

export const dbInsertReceipt = async (receipt) => {
  const { error } = await supabase.from("receipts").insert(receiptToDb(receipt));
  if (error) console.error("dbInsertReceipt failed:", error);
};

export const dbDeleteReceipt = async (id) => {
  const { error } = await supabase.from("receipts").delete().eq("id", id);
  if (error) console.error("dbDeleteReceipt failed:", error);
};

/* ── raw_materials table ── */

const rawMaterialToDb = (m) => ({
  id: m.id, name: m.name, unit: m.unit, stock: m.stock, buy_price: m.buyPrice, excess_stock: m.excessStock,
});
const rawMaterialFromDb = (r) => ({
  id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock), buyPrice: Number(r.buy_price),
  excessStock: Number(r.excess_stock || 0),
});

export const fetchRawMaterials = async () => {
  const { data, error } = await supabase.from("raw_materials").select("*");
  if (error) { console.error("fetchRawMaterials failed:", error); return []; }
  return data.map(rawMaterialFromDb);
};

export const dbInsertRawMaterial = async (material) => {
  const { error } = await supabase.from("raw_materials").insert(rawMaterialToDb(material));
  if (error) console.error("dbInsertRawMaterial failed:", error);
};

export const dbUpdateRawMaterial = async (id, patch) => {
  const dbPatch = rawMaterialToDb({ id, ...patch });
  delete dbPatch.id;
  Object.keys(dbPatch).forEach(k => dbPatch[k] === undefined && delete dbPatch[k]);
  const { error } = await supabase.from("raw_materials").update(dbPatch).eq("id", id);
  if (error) console.error("dbUpdateRawMaterial failed:", error);
};

export const dbDeleteRawMaterial = async (id) => {
  const { error } = await supabase.from("raw_materials").delete().eq("id", id);
  if (error) console.error("dbDeleteRawMaterial failed:", error);
};

/* ── dishes + dish_ingredients tables ── */

const dishToDb = (d) => ({
  id: d.id, name: d.name, cat: d.cat, price: d.price, img: d.img, is_photo: d.isPhoto, grams: d.grams,
  serving_unit: d.servingUnit || "g",
});
const dishIngredientToDb = (dishId, ing) => ({
  id: ing.id, dish_id: dishId, raw_material_id: ing.rawMaterialId, quantity: ing.quantity,
});

export const fetchDishes = async () => {
  const [{ data: dishRows, error: e1 }, { data: ingRows, error: e2 }] = await Promise.all([
    supabase.from("dishes").select("*"),
    supabase.from("dish_ingredients").select("*"),
  ]);
  if (e1) { console.error("fetchDishes failed:", e1); return []; }
  if (e2) console.error("fetch dish_ingredients failed:", e2);
  return dishRows.map(d => ({
    id: d.id, name: d.name, cat: d.cat, price: Number(d.price), img: d.img, isPhoto: d.is_photo, grams: d.grams==null?null:Number(d.grams),
    servingUnit: d.serving_unit || "g",
    ingredients: (ingRows||[]).filter(i => i.dish_id === d.id).map(i => ({ id: i.id, rawMaterialId: i.raw_material_id, quantity: Number(i.quantity) })),
  }));
};

export const dbInsertDish = async (dish) => {
  const { error } = await supabase.from("dishes").insert(dishToDb(dish));
  if (error) { console.error("dbInsertDish failed:", error); return; }
  if (dish.ingredients && dish.ingredients.length) {
    const rows = dish.ingredients.map(ing => dishIngredientToDb(dish.id, ing));
    const { error: e2 } = await supabase.from("dish_ingredients").insert(rows);
    if (e2) console.error("dbInsertDish ingredients failed:", e2);
  }
};

export const dbUpdateDish = async (id, patch, ingredients) => {
  const dbPatch = dishToDb({ id, ...patch });
  delete dbPatch.id;
  Object.keys(dbPatch).forEach(k => dbPatch[k] === undefined && delete dbPatch[k]);
  if (Object.keys(dbPatch).length) {
    const { error } = await supabase.from("dishes").update(dbPatch).eq("id", id);
    if (error) console.error("dbUpdateDish failed:", error);
  }
  if (ingredients) {
    // replace all ingredient rows for this dish
    const { error: eDel } = await supabase.from("dish_ingredients").delete().eq("dish_id", id);
    if (eDel) console.error("dbUpdateDish clear ingredients failed:", eDel);
    if (ingredients.length) {
      const rows = ingredients.map(ing => dishIngredientToDb(id, ing));
      const { error: eIns } = await supabase.from("dish_ingredients").insert(rows);
      if (eIns) console.error("dbUpdateDish insert ingredients failed:", eIns);
    }
  }
};

export const dbDeleteDish = async (id) => {
  const { error } = await supabase.from("dishes").delete().eq("id", id);
  if (error) console.error("dbDeleteDish failed:", error);
};

/* ── raw_material_log table ── */

const rawMaterialLogToDb = (l) => ({
  id: l.id, raw_material: l.rawMaterial, unit: l.unit, type: l.type,
  qty: l.qty, before: l.before, after: l.after, by: l.by, time: l.time,
  source: l.source || "purchase", note: l.note || null,
});
const rawMaterialLogFromDb = (r) => ({
  id: r.id, rawMaterial: r.raw_material, unit: r.unit, type: r.type,
  qty: Number(r.qty), before: Number(r.before), after: Number(r.after), by: r.by, time: r.time,
  source: r.source || "purchase", note: r.note || null,
});

export const fetchRawMaterialLog = async () => {
  const { data, error } = await supabase.from("raw_material_log").select("*").order("created_at", { ascending: false });
  if (error) { console.error("fetchRawMaterialLog failed:", error); return []; }
  return data.map(rawMaterialLogFromDb);
};

export const dbInsertRawMaterialLog = async (entry) => {
  const { error } = await supabase.from("raw_material_log").insert(rawMaterialLogToDb(entry));
  if (error) console.error("dbInsertRawMaterialLog failed:", error);
};

/* ── daily_menu_prep table (prepared weight per plant/date/menu item) ── */

const prepToDb = (p) => ({
  id: p.id, plant: p.plant, date: p.date, menu_item_id: p.menuItemId,
  prepared_qty: p.preparedQty, updated_by: p.updatedBy,
});
const prepFromDb = (r) => ({
  id: r.id, plant: r.plant, date: r.date, menuItemId: r.menu_item_id,
  preparedQty: Number(r.prepared_qty), updatedBy: r.updated_by,
});

export const fetchDailyPrep = async () => {
  const { data, error } = await supabase.from("daily_menu_prep").select("*");
  if (error) { console.error("fetchDailyPrep failed:", error); return []; }
  return data.map(prepFromDb);
};

export const dbUpsertDailyPrep = async (entry) => {
  const { error } = await supabase.from("daily_menu_prep")
    .upsert(prepToDb(entry), { onConflict: "plant,date,menu_item_id" });
  if (error) console.error("dbUpsertDailyPrep failed:", error);
};

/* ── plant_closes table (end-of-day close per plant) ── */

const closeToDb = (c) => ({
  id: c.id, plant: c.plant, date: c.date, closed_by: c.closedBy,
  reopened_by: c.reopenedBy || null, reopened_at: c.reopenedAt || null,
});
const closeFromDb = (r) => ({
  id: r.id, plant: r.plant, date: r.date, closedBy: r.closed_by, closedAt: r.closed_at,
  reopenedBy: r.reopened_by, reopenedAt: r.reopened_at,
});

export const fetchPlantCloses = async () => {
  const { data, error } = await supabase.from("plant_closes").select("*");
  if (error) { console.error("fetchPlantCloses failed:", error); return []; }
  return data.map(closeFromDb);
};

export const dbInsertPlantClose = async (entry) => {
  const { data, error } = await supabase.from("plant_closes").insert(closeToDb(entry)).select().single();
  if (error) { console.error("dbInsertPlantClose failed:", error); return null; }
  return closeFromDb(data);
};

export const dbReopenPlantClose = async (id, reopenedBy) => {
  const { error } = await supabase.from("plant_closes")
    .update({ reopened_by: reopenedBy, reopened_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("dbReopenPlantClose failed:", error);
};

/* ── dish_excess_decisions table (repurpose/waste log) ── */

const excessDecisionToDb = (d) => ({
  id: d.id, plant: d.plant, date: d.date, menu_item_id: d.menuItemId||null,
  dish_name: d.dishName, excess_qty: d.excessQty, serving_unit: d.servingUnit||"g",
  decision: d.decision, decided_by: d.decidedBy,
  repurpose_target_type: d.repurposeTargetType||null,
  repurpose_target_id: d.repurposeTargetId||null,
  repurpose_target_name: d.repurposeTargetName||null,
});
const excessDecisionFromDb = (r) => ({
  id: r.id, plant: r.plant, date: r.date, menuItemId: r.menu_item_id,
  dishName: r.dish_name, excessQty: Number(r.excess_qty), servingUnit: r.serving_unit||"g", decision: r.decision,
  decidedBy: r.decided_by, decidedAt: r.decided_at,
  repurposeTargetType: r.repurpose_target_type, repurposeTargetId: r.repurpose_target_id, repurposeTargetName: r.repurpose_target_name,
});

export const fetchExcessDecisions = async () => {
  const { data, error } = await supabase.from("dish_excess_decisions").select("*").order("decided_at", { ascending: false });
  if (error) { console.error("fetchExcessDecisions failed:", error); return []; }
  return data.map(excessDecisionFromDb);
};

export const dbInsertExcessDecision = async (entry) => {
  const { error } = await supabase.from("dish_excess_decisions").insert(excessDecisionToDb(entry));
  if (error) console.error("dbInsertExcessDecision failed:", error);
};

/* ── suggestions table ── */

const suggestionToDb = (s) => ({
  id: s.id, user_id: s.userId, user_name: s.userName, content: s.content,
});
const suggestionFromDb = (r) => ({
  id: r.id, userId: r.user_id, userName: r.user_name, content: r.content, createdAt: r.created_at,
});

export const fetchSuggestions = async () => {
  const { data, error } = await supabase.from("suggestions").select("*").order("created_at", { ascending: false });
  if (error) { console.error("fetchSuggestions failed:", error); return []; }
  return data.map(suggestionFromDb);
};

export const dbInsertSuggestion = async (entry) => {
  const { error } = await supabase.from("suggestions").insert(suggestionToDb(entry));
  if (error) console.error("dbInsertSuggestion failed:", error);
};

// suggestion_replies has ON DELETE CASCADE on suggestion_id, so deleting a
// suggestion also removes its replies at the DB level.
export const dbDeleteSuggestion = async (id) => {
  const { error } = await supabase.from("suggestions").delete().eq("id", id);
  if (error) console.error("dbDeleteSuggestion failed:", error);
};

/* ── suggestion_replies table ── */

const suggestionReplyToDb = (r) => ({
  id: r.id, suggestion_id: r.suggestionId, author_id: r.authorId,
  author_name: r.authorName, author_role: r.authorRole, content: r.content,
});
const suggestionReplyFromDb = (r) => ({
  id: r.id, suggestionId: r.suggestion_id, authorId: r.author_id,
  authorName: r.author_name, authorRole: r.author_role, content: r.content, createdAt: r.created_at,
});

export const fetchSuggestionReplies = async () => {
  const { data, error } = await supabase.from("suggestion_replies").select("*").order("created_at", { ascending: true });
  if (error) { console.error("fetchSuggestionReplies failed:", error); return []; }
  return data.map(suggestionReplyFromDb);
};

export const dbInsertSuggestionReply = async (entry) => {
  const { error } = await supabase.from("suggestion_replies").insert(suggestionReplyToDb(entry));
  if (error) console.error("dbInsertSuggestionReply failed:", error);
};

export const dbDeleteSuggestionReply = async (id) => {
  const { error } = await supabase.from("suggestion_replies").delete().eq("id", id);
  if (error) console.error("dbDeleteSuggestionReply failed:", error);
};

/* ── app_settings / app_settings_log tables ── */

export const fetchAppSettings = async () => {
  const { data, error } = await supabase.from("app_settings").select("*");
  if (error) { console.error("fetchAppSettings failed:", error); return {}; }
  const map = {};
  data.forEach(r => { map[r.key] = r.value; });
  return map;
};

export const dbUpdateAppSetting = async (key, value, updatedBy) => {
  const { error } = await supabase.from("app_settings")
    .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) console.error("dbUpdateAppSetting failed:", error);
  return { success: !error, error };
};

export const fetchAppSettingsLog = async () => {
  const { data, error } = await supabase.from("app_settings_log").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) { console.error("fetchAppSettingsLog failed:", error); return []; }
  return data.map(r => ({ id: r.id, settingKey: r.setting_key, summary: r.summary, changedBy: r.changed_by, createdAt: r.created_at }));
};

export const dbInsertAppSettingsLog = async (entry) => {
  const { error } = await supabase.from("app_settings_log")
    .insert({ id: entry.id, setting_key: entry.settingKey, summary: entry.summary, changed_by: entry.changedBy, created_at: entry.createdAt });
  if (error) console.error("dbInsertAppSettingsLog failed:", error);
};
