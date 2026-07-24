import { useState, useMemo, useRef, useCallback } from "react";

const PURPLE = "#6B21A8";
const PURPLE_LIGHT = "#EDE9FE";
const PURPLE_MID = "#7C3AED";
const BG = "#F3F4F6";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// helpers
const getDateKey = (date) => DAYS[Math.min(date.getDay()===0?5:date.getDay()-1,5)]; // Mon-Sat day name
const formatDateLabel = (date) => date.toLocaleDateString("en-PH",{month:"short",day:"numeric"});
const formatDateFull  = (date) => date.toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"});
const isSameDay = (a,b) => a.toDateString()===b.toDateString();
const isPast    = (date) => { const t=new Date(); t.setHours(0,0,0,0); const d=new Date(date); d.setHours(0,0,0,0); return d<t; };
const isFuture  = (date) => { const t=new Date(); t.setHours(0,0,0,0); const d=new Date(date); d.setHours(0,0,0,0); return d>t; };

// build 2 weeks of Mon-Sat dates (1 past week + current/next week)
const buildDateRange = () => {
  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun
  // Monday of last week
  const startOffset = todayDow===0 ? -13 : -(todayDow-1+7);
  const dates = [];
  for(let i=startOffset; i<=startOffset+13; i++){
    const d = new Date(today);
    d.setDate(today.getDate()+i);
    if(d.getDay()!==0) dates.push(new Date(d)); // exclude Sundays
  }
  return dates;
};
const DATE_RANGE = buildDateRange();
const TODAY_DATE = new Date();
const TODAY = getDateKey(TODAY_DATE);
const MEAL_CATS = ["ALL","BREAKFAST","LUNCH","SNACK"];


const PLANTS = ["KF-Main","Colortree","KF-Global"];
const toProperCase = str => str.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// registered = has password set (username/password filled)
// unregistered = admin-added employees, no password yet
const USERS = [
  // Admin
  { id:"u1",  username:"admin",      password:"admin123",  role:"admin",       name:"System Admin",     avatar:"SA", plant:"KF-Main",   idNumber:"KF2300001",  phone:"09171234501", creditLimit:5000, creditBalance:5000, registered:true },
  // ONE Staff-Admin (supervises all plants, sees all orders + full history)
  { id:"u2",  username:"staffadmin", password:"sa123",     role:"staff-admin", name:"Ana Reyes",        avatar:"AR", plant:"KF-Main",   idNumber:"KF2300002",  phone:"09181234502", creditLimit:2000, creditBalance:2000, registered:true },
  // Staff per plant (sees only their assigned plant orders)
  { id:"u3",  username:"staff.main", password:"main123",   role:"staff",       name:"Ben Cruz",         avatar:"BC", plant:"KF-Main",   idNumber:"KF2300003",  phone:"09191234503", creditLimit:1000, creditBalance:1000, registered:true },
  { id:"u12", username:"staff.ct",   password:"ct123",     role:"staff",       name:"Rosa Dela Cruz",   avatar:"RD", plant:"Colortree", idNumber:"CT-23-0001", phone:"09221234512", creditLimit:1000, creditBalance:1000, registered:true },
  { id:"u13", username:"staff.kg",   password:"kg123",     role:"staff",       name:"Carlos Lim",       avatar:"CL", plant:"KF-Global", idNumber:"KF2301001",  phone:"09231234513", creditLimit:1000, creditBalance:1000, registered:true },
  // Customers
  { id:"u4",  username:"juan",       password:"user123",   role:"user",        name:"Juan dela Cruz",   avatar:"JD", plant:"KF-Main",   idNumber:"KF2300004",  phone:"09201234504", creditLimit:1000, creditBalance:856,  registered:true },
  { id:"u5",  username:"maria",      password:"user456",   role:"user",        name:"Maria Santos",     avatar:"MS", plant:"Colortree", idNumber:"CT-23-0005", phone:"09211234505", creditLimit:1000, creditBalance:75,   registered:true },
  { id:"u16", username:"paulo",      password:"paulo123",  role:"user",        name:"Paulo Fernandez",  avatar:"PF", plant:"KF-Global", idNumber:"KF2301004",  phone:"09261234516", creditLimit:1000, creditBalance:950,  registered:true },
  // Unregistered employees awaiting self-registration
  { id:"u6",  username:"", password:"", role:"user", name:"Liza Reyes",      avatar:"LR", plant:"KF-Main",   idNumber:"KF2301003",  phone:"", creditLimit:1000, creditBalance:1000, registered:false },
  { id:"u7",  username:"", password:"", role:"user", name:"Joseph Tan",      avatar:"JT", plant:"Colortree", idNumber:"CT-23-0002", phone:"", creditLimit:1000, creditBalance:1000, registered:false },
  { id:"u8",  username:"", password:"", role:"user", name:"Paulo Fernandez", avatar:"PF", plant:"KF-Global", idNumber:"KF2301004",  phone:"", creditLimit:1000, creditBalance:1000, registered:false },
];

const DEFAULT_OTHER_PRODUCTS = [
  { id:"op1",  name:"Nova Chips",           category:"Chips",          buyPrice:8,  price:15, emoji:"🥔", stock:20, available:true },
  { id:"op2",  name:"Piattos Cheese",        category:"Chips",          buyPrice:12, price:20, emoji:"🥔", stock:15, available:true },
  { id:"op3",  name:"Rebisco Biscuit",       category:"Biscuit",        buyPrice:7,  price:12, emoji:"🍪", stock:30, available:true },
  { id:"op4",  name:"SkyFlakes",             category:"Biscuit",        buyPrice:6,  price:10, emoji:"🍪", stock:25, available:true },
  { id:"op5",  name:"Lucky Me! Pancit Canton",category:"Instant Noodles",buyPrice:10,price:18, emoji:"🍜", stock:20, available:true },
  { id:"op6",  name:"Nissin Cup Noodles",    category:"Instant Noodles",buyPrice:22, price:35, emoji:"🍜", stock:10, available:true },
  { id:"op7",  name:"Nescafé 3-in-1",        category:"Instant Coffee", buyPrice:5,  price:8,  emoji:"☕", stock:50, available:true },
  { id:"op8",  name:"Great Taste Coffee",    category:"Instant Coffee", buyPrice:5,  price:8,  emoji:"☕", stock:50, available:true },
  { id:"op9",  name:"Tang Orange",           category:"Powdered Drinks",buyPrice:3,  price:6,  emoji:"🍊", stock:40, available:true },
  { id:"op10", name:"Milo Sachet",           category:"Powdered Drinks",buyPrice:7,  price:12, emoji:"🥤", stock:35, available:true },
  { id:"op11", name:"Coca-Cola 1.5L",        category:"Soft Drinks",    buyPrice:50, price:75, emoji:"🥤", stock:12, available:true },
  { id:"op12", name:"Royal TruOrange 1L",    category:"Soft Drinks",    buyPrice:38, price:55, emoji:"🥤", stock:8,  available:true },
  { id:"op13", name:"C2 Apple 230ml",        category:"Others",         buyPrice:13, price:20, emoji:"🧃", stock:18, available:true },
  { id:"op14", name:"Mineral Water 500ml",   category:"Others",         buyPrice:8,  price:15, emoji:"💧", stock:24, available:true },
];

const defaultMenu = {
  Monday:[
    { id:"m1", name:"Adobo with Rice",    price:65, available:true, img:"🍚", cat:"LUNCH",      grams:350 },
    { id:"m2", name:"Sinigang na Baboy",  price:75, available:true, img:"🍲", cat:"LUNCH",      grams:400 },
    { id:"m3", name:"Pandesal",           price:5,  available:true, img:"🥖", cat:"BREAKFAST",  grams:50  },
  ],
  Tuesday:[
    { id:"m4", name:"Tinola with Rice",   price:65, available:true, img:"🍗", cat:"LUNCH",      grams:370 },
    { id:"m5", name:"Chopsuey",           price:55, available:true, img:"🥦", cat:"LUNCH",      grams:300 },
    { id:"m6", name:"Maja Blanca",        price:30, available:true, img:"🍮", cat:"SNACK",      grams:150 },
  ],
  Wednesday:[
    { id:"m7", name:"Lechon Kawali & Rice",price:85,available:true, img:"🥩", cat:"LUNCH",     grams:380 },
    { id:"m8", name:"Pinakbet",           price:55, available:true, img:"🫑", cat:"LUNCH",      grams:280 },
    { id:"m9", name:"Halo-halo",          price:50, available:true, img:"🍧", cat:"SNACK",      grams:350 },
  ],
  Thursday:[
    { id:"m10",name:"Kare-kare & Rice",   price:90, available:true, img:"🍛", cat:"LUNCH",      grams:420 },
    { id:"m11",name:"Laing",              price:60, available:true, img:"🌿", cat:"LUNCH",      grams:250 },
    { id:"m12",name:"Banana Cue",         price:10, available:true, img:"🍌", cat:"SNACK",      grams:120 },
  ],
  Friday:[
    { id:"m13",name:"Bangus Sisig & Rice",price:80, available:true, img:"🐟", cat:"LUNCH",      grams:360 },
    { id:"m14",name:"Ginisang Monggo",    price:55, available:true, img:"🫘", cat:"LUNCH",      grams:300 },
    { id:"m15",name:"Buko Pandan",        price:35, available:true, img:"🥥", cat:"SNACK",      grams:200 },
  ],
  Saturday:[
    { id:"m16",name:"Bulalo & Rice",      price:120,available:true, img:"🦴", cat:"LUNCH",      grams:500 },
    { id:"m17",name:"Nilaga",             price:80, available:true, img:"🥕", cat:"LUNCH",      grams:450 },
    { id:"m18",name:"Turon",              price:15, available:true, img:"🍡", cat:"SNACK",      grams:100 },
  ],
  Sunday:[
    { id:"m19",name:"Lechon & Rice",      price:130,available:true, img:"🐷", cat:"LUNCH",      grams:480 },
    { id:"m20",name:"Dinuguan",           price:70, available:true, img:"🍖", cat:"LUNCH",      grams:350 },
    { id:"m21",name:"Puto Bumbong",       price:25, available:true, img:"🍢", cat:"SNACK",      grams:150 },
  ],
};

const defaultOrders = [
  // Jun 25 - Wednesday
  { id:"KF000001", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-25", plant:"KF-Main", items:[{name:"Lechon Kawali & Rice",qty:1,price:85,grams:380,buyPrice:null},{name:"Halo-halo",qty:1,price:50,grams:350,buyPrice:null}], total:135, paymentType:"Cash",   time:"8:10 AM" },
  { id:"KF000002", user:"Maria Santos",    userId:"u5", date:"2026-06-25", plant:"KF-Main", items:[{name:"Pinakbet",qty:1,price:55,grams:280,buyPrice:null},{name:"Coca-Cola 1.5L",qty:1,price:75,grams:null,buyPrice:50}], total:130, paymentType:"Credit", time:"8:45 AM" },
  { id:"KF000003", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-25", plant:"KF-Main", items:[{name:"Nova Chips",qty:2,price:15,grams:null,buyPrice:8},{name:"Nescafé 3-in-1",qty:1,price:8,grams:null,buyPrice:5}], total:38, paymentType:"Cash",   time:"10:00 AM" },

  // Jun 26 - Thursday
  { id:"KF000004", user:"Maria Santos",    userId:"u5", date:"2026-06-26", plant:"KF-Main", items:[{name:"Kare-kare & Rice",qty:1,price:90,grams:420,buyPrice:null},{name:"Milo Sachet",qty:2,price:12,grams:null,buyPrice:7}], total:114, paymentType:"Credit", time:"8:30 AM" },
  { id:"KF000005", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-26", plant:"KF-Main", items:[{name:"Laing",qty:1,price:60,grams:250,buyPrice:null},{name:"SkyFlakes",qty:3,price:10,grams:null,buyPrice:6}], total:90, paymentType:"Cash",   time:"9:15 AM" },
  { id:"KF000006", user:"Maria Santos",    userId:"u5", date:"2026-06-26", plant:"KF-Main", items:[{name:"Banana Cue",qty:3,price:10,grams:120,buyPrice:null},{name:"Tang Orange",qty:2,price:6,grams:null,buyPrice:3}], total:42, paymentType:"Cash",   time:"2:00 PM" },

  // Jun 27 - Friday
  { id:"KF000007", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-27", items:[{name:"Bangus Sisig & Rice",qty:2,price:80,grams:360,buyPrice:null},{name:"Royal TruOrange 1L",qty:2,price:55,grams:null,buyPrice:38}], total:270, paymentType:"Credit", time:"8:00 AM" },
  { id:"KF000008", user:"Maria Santos",    userId:"u5", date:"2026-06-27", items:[{name:"Ginisang Monggo",qty:1,price:55,grams:300,buyPrice:null},{name:"Piattos Cheese",qty:1,price:20,grams:null,buyPrice:12}], total:75, paymentType:"Cash",   time:"9:30 AM" },
  { id:"KF000009", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-27", items:[{name:"Buko Pandan",qty:2,price:35,grams:200,buyPrice:null},{name:"C2 Apple 230ml",qty:2,price:20,grams:null,buyPrice:13}], total:110, paymentType:"Cash",   time:"1:00 PM" },

  // Jun 28 - Saturday
  { id:"KF000010", user:"Maria Santos",    userId:"u5", date:"2026-06-28", items:[{name:"Bulalo & Rice",qty:1,price:120,grams:500,buyPrice:null},{name:"Mineral Water 500ml",qty:2,price:15,grams:null,buyPrice:8}], total:150, paymentType:"Cash",   time:"8:15 AM" },
  { id:"KF000011", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-28", items:[{name:"Nilaga",qty:2,price:80,grams:450,buyPrice:null},{name:"Lucky Me! Pancit Canton",qty:2,price:18,grams:null,buyPrice:10}], total:196, paymentType:"Credit", time:"9:00 AM" },
  { id:"KF000012", user:"Maria Santos",    userId:"u5", date:"2026-06-28", items:[{name:"Turon",qty:4,price:15,grams:100,buyPrice:null},{name:"Great Taste Coffee",qty:2,price:8,grams:null,buyPrice:5}], total:76, paymentType:"Cash",   time:"2:30 PM" },

  // Jun 30 - Monday
  { id:"KF000013", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-30", items:[{name:"Adobo with Rice",qty:2,price:65,grams:350,buyPrice:null},{name:"Pandesal",qty:3,price:5,grams:50,buyPrice:null}], total:145, paymentType:"Cash",   time:"7:50 AM" },
  { id:"KF000014", user:"Maria Santos",    userId:"u5", date:"2026-06-30", items:[{name:"Sinigang na Baboy",qty:1,price:75,grams:400,buyPrice:null},{name:"Rebisco Biscuit",qty:2,price:12,grams:null,buyPrice:7}], total:99, paymentType:"Credit", time:"8:40 AM" },
  { id:"KF000015", user:"Juan dela Cruz",  userId:"u4", date:"2026-06-30", items:[{name:"Nova Chips",qty:1,price:15,grams:null,buyPrice:8},{name:"Milo Sachet",qty:2,price:12,grams:null,buyPrice:7}], total:39, paymentType:"Cash",   time:"10:30 AM" },
  { id:"KF000016", user:"Maria Santos",    userId:"u5", date:"2026-06-30", items:[{name:"Pandesal",qty:5,price:5,grams:50,buyPrice:null},{name:"Nescafé 3-in-1",qty:3,price:8,grams:null,buyPrice:5}], total:49, paymentType:"Cash",   time:"2:15 PM" },

  // Jul 1 - Tuesday (Today)
  { id:"KF000017", user:"Juan dela Cruz",  userId:"u4", date:"2026-07-01", items:[{name:"Adobo with Rice",qty:2,price:65,grams:350,buyPrice:null},{name:"Nova Chips",qty:1,price:15,grams:null,buyPrice:8}], total:145, paymentType:"Cash",   time:"8:15 AM" },
  { id:"KF000018", user:"Maria Santos",    userId:"u5", date:"2026-07-01", items:[{name:"Sinigang na Baboy",qty:1,price:75,grams:400,buyPrice:null},{name:"Coca-Cola 1.5L",qty:1,price:75,grams:null,buyPrice:50}], total:150, paymentType:"Credit", time:"9:00 AM" },
  { id:"KF000019", user:"Juan dela Cruz",  userId:"u4", date:"2026-07-01", items:[{name:"Pandesal",qty:5,price:5,grams:50,buyPrice:null},{name:"Nescafé 3-in-1",qty:2,price:8,grams:null,buyPrice:5}], total:41, paymentType:"Cash",   time:"9:30 AM" },
  { id:"KF000020", user:"Maria Santos",    userId:"u5", date:"2026-07-01", items:[{name:"Tinola with Rice",qty:1,price:65,grams:370,buyPrice:null},{name:"Milo Sachet",qty:3,price:12,grams:null,buyPrice:7},{name:"SkyFlakes",qty:2,price:10,grams:null,buyPrice:6}], total:121, paymentType:"Credit", time:"10:15 AM" },
  { id:"KF000021", user:"Juan dela Cruz",  userId:"u4", date:"2026-07-01", items:[{name:"Lechon Kawali & Rice",qty:1,price:85,grams:380,buyPrice:null},{name:"Royal TruOrange 1L",qty:1,price:55,grams:null,buyPrice:38}], total:140, time:"11:00 AM" },
  { id:"KF000022", user:"Maria Santos",    userId:"u5", date:"2026-07-01", items:[{name:"Bangus Sisig & Rice",qty:2,price:80,grams:360,buyPrice:null},{name:"Piattos Cheese",qty:2,price:20,grams:null,buyPrice:12},{name:"C2 Apple 230ml",qty:2,price:20,grams:null,buyPrice:13}], total:240, time:"11:45 AM" },
];

/* ── tiny icon SVG ── */
const Icon = ({ name, size=16, color="currentColor" }) => {
  const paths = {
    utensils: <><path d="M3 2v6a3 3 0 0 0 6 0V2"/><line x1="6" y1="2" x2="6" y2="22"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    cart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    orders: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    manage: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    products: <><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></>,
    people: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    history: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeoff: <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline-block",verticalAlign:"middle",flexShrink:0}}>
      {paths[name]}
    </svg>
  );
};

/* ── Nav items by role ── */
const NAV = {
  admin: [
    { id:"menu",      label:"Menu",            icon:"menu" },
    { id:"myorders",  label:"My Orders",       icon:"orders" },
    { id:"cart",      label:"Cart",            icon:"cart" },
    { id:"mgmenu",    label:"Manage Menu",     icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",   icon:"manage" },
    { id:"mgproducts",label:"Manage Products", icon:"products" },
    { id:"personnel", label:"Personnel",       icon:"people" },
    { id:"history",   label:"Overall History", icon:"history" },
  ],
  "staff-admin": [
    { id:"mgmenu",    label:"Manage Menu",     icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",   icon:"manage" },
    { id:"mgproducts",label:"Manage Products", icon:"products" },
    { id:"history",   label:"Overall History", icon:"history" },
  ],
  staff: [
    { id:"mgmenu",    label:"Manage Menu",     icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",   icon:"manage" },
  ],
  user: [
    { id:"menu",     label:"Menu",            icon:"menu" },
    { id:"myorders", label:"My Orders",       icon:"orders" },
    { id:"cart",     label:"Cart",            icon:"cart" },
  ],
};

export default function KFCanteen() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username:"", password:"" });
  const [loginError, setLoginError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [activeTab, setActiveTab] = useState("menu");
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({ selectedUserId:"", phone:"", password:"", confirmPassword:"" });
  const [registerShowConfirm, setRegisterShowConfirm] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [nameSearch, setNameSearch] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerShowPass, setRegisterShowPass] = useState(false);
  const [users, setUsers] = useState(USERS);
  const [creditNotif, setCreditNotif] = useState(false);
  const [editCreditId, setEditCreditId] = useState(null);
  const [editCreditVal, setEditCreditVal] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [editRoleId, setEditRoleId] = useState(null);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({name:"", plant:"KF-Main", idNumber:"", rows:[{id:1, idNumber:"", name:"", plant:"KF-Main"}]});

  // menu / filter state
  const [menu, setMenu] = useState(defaultMenu);
  const [selectedDate, setSelectedDate] = useState(TODAY_DATE);
  const selectedDay = getDateKey(selectedDate); // the Mon-Sat day name for menu lookup
  const [mealCat, setMealCat] = useState("ALL");
  const [menuView, setMenuView] = useState("Weekly Menu"); // "Weekly Menu" | "Other Products"
  const [searchQ, setSearchQ] = useState("");

  // cart & orders
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState(defaultOrders);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [orderPlant, setOrderPlant] = useState("");

  // manage menu add form
  const [showAddItem, setShowAddItem] = useState(null);
  const [newItem, setNewItem] = useState({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"" });

  const [dragOver, setDragOver] = useState(false);
  const photoInputRef = useRef(null);

  const handlePhotoFile = useCallback((file) => {
    if(!file||!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setNewItem(p=>({...p, photo:e.target.result}));
    reader.readAsDataURL(file);
  }, []);

  // other products category
  const [orderSearch, setOrderSearch] = useState("");
  const [paymentModal, setPaymentModal] = useState(null);
  const [otherCat, setOtherCat] = useState("All");
  const [filterCat, setFilterCat] = useState("All");
  const [otherProducts, setOtherProducts] = useState(DEFAULT_OTHER_PRODUCTS);
  const [mgDay, setMgDay] = useState(TODAY);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [stockAddVal, setStockAddVal] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [myOrderSearch, setMyOrderSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState("orders");
  const [salesDate, setSalesDate] = useState(TODAY_DATE);
  const [showSalesCalendar, setShowSalesCalendar] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [scYear, setScYear] = useState(TODAY_DATE.getFullYear());
  const [scMonth, setScMonth] = useState(TODAY_DATE.getMonth());
  const [inventoryLog, setInventoryLog] = useState([
    // Jun 24 - initial stock load
    { id:"il01", product:"Nova Chips",            emoji:"🥔", type:"IN",  qty:30, before:0,  after:30, by:"Admin KF",  time:"Jun 24, 2026 · 7:30 AM" },
    { id:"il02", product:"Piattos Cheese",         emoji:"🥔", type:"IN",  qty:20, before:0,  after:20, by:"Admin KF",  time:"Jun 24, 2026 · 7:30 AM" },
    { id:"il03", product:"Rebisco Biscuit",        emoji:"🍪", type:"IN",  qty:40, before:0,  after:40, by:"Admin KF",  time:"Jun 24, 2026 · 7:35 AM" },
    { id:"il04", product:"SkyFlakes",              emoji:"🍪", type:"IN",  qty:35, before:0,  after:35, by:"Admin KF",  time:"Jun 24, 2026 · 7:35 AM" },
    { id:"il05", product:"Lucky Me! Pancit Canton",emoji:"🍜", type:"IN",  qty:25, before:0,  after:25, by:"Ana Reyes", time:"Jun 24, 2026 · 7:40 AM" },
    { id:"il06", product:"Nissin Cup Noodles",     emoji:"🍜", type:"IN",  qty:15, before:0,  after:15, by:"Ana Reyes", time:"Jun 24, 2026 · 7:40 AM" },
    { id:"il07", product:"Nescafé 3-in-1",         emoji:"☕", type:"IN",  qty:60, before:0,  after:60, by:"Ana Reyes", time:"Jun 24, 2026 · 7:45 AM" },
    { id:"il08", product:"Great Taste Coffee",     emoji:"☕", type:"IN",  qty:60, before:0,  after:60, by:"Ana Reyes", time:"Jun 24, 2026 · 7:45 AM" },
    { id:"il09", product:"Tang Orange",            emoji:"🍊", type:"IN",  qty:50, before:0,  after:50, by:"Ben Cruz",  time:"Jun 24, 2026 · 7:50 AM" },
    { id:"il10", product:"Milo Sachet",            emoji:"🥤", type:"IN",  qty:50, before:0,  after:50, by:"Ben Cruz",  time:"Jun 24, 2026 · 7:50 AM" },
    { id:"il11", product:"Coca-Cola 1.5L",         emoji:"🥤", type:"IN",  qty:20, before:0,  after:20, by:"Ben Cruz",  time:"Jun 24, 2026 · 7:55 AM" },
    { id:"il12", product:"Royal TruOrange 1L",     emoji:"🥤", type:"IN",  qty:15, before:0,  after:15, by:"Ben Cruz",  time:"Jun 24, 2026 · 7:55 AM" },
    { id:"il13", product:"C2 Apple 230ml",         emoji:"🧃", type:"IN",  qty:25, before:0,  after:25, by:"Admin KF",  time:"Jun 24, 2026 · 8:00 AM" },
    { id:"il14", product:"Mineral Water 500ml",    emoji:"💧", type:"IN",  qty:30, before:0,  after:30, by:"Admin KF",  time:"Jun 24, 2026 · 8:00 AM" },
    // Jun 25 - sales OUT
    { id:"il15", product:"Nova Chips",             emoji:"🥔", type:"OUT", qty:2,  before:30, after:28, by:"System",    time:"Jun 25, 2026 · 8:10 AM" },
    { id:"il16", product:"Coca-Cola 1.5L",         emoji:"🥤", type:"OUT", qty:1,  before:20, after:19, by:"System",    time:"Jun 25, 2026 · 8:45 AM" },
    { id:"il17", product:"Nescafé 3-in-1",         emoji:"☕", type:"OUT", qty:1,  before:60, after:59, by:"System",    time:"Jun 25, 2026 · 10:00 AM"},
    // Jun 26 - sales OUT
    { id:"il18", product:"Milo Sachet",            emoji:"🥤", type:"OUT", qty:2,  before:50, after:48, by:"System",    time:"Jun 26, 2026 · 8:30 AM" },
    { id:"il19", product:"SkyFlakes",              emoji:"🍪", type:"OUT", qty:3,  before:35, after:32, by:"System",    time:"Jun 26, 2026 · 9:15 AM" },
    { id:"il20", product:"Tang Orange",            emoji:"🍊", type:"OUT", qty:2,  before:50, after:48, by:"System",    time:"Jun 26, 2026 · 2:00 PM" },
    // Jun 27 - restock + sales
    { id:"il21", product:"Nova Chips",             emoji:"🥔", type:"IN",  qty:10, before:28, after:38, by:"Ana Reyes", time:"Jun 27, 2026 · 7:30 AM" },
    { id:"il22", product:"Royal TruOrange 1L",     emoji:"🥤", type:"OUT", qty:2,  before:15, after:13, by:"System",    time:"Jun 27, 2026 · 8:00 AM" },
    { id:"il23", product:"Piattos Cheese",         emoji:"🥔", type:"OUT", qty:1,  before:20, after:19, by:"System",    time:"Jun 27, 2026 · 9:30 AM" },
    { id:"il24", product:"C2 Apple 230ml",         emoji:"🧃", type:"OUT", qty:2,  before:25, after:23, by:"System",    time:"Jun 27, 2026 · 1:00 PM" },
    // Jun 28 - sales
    { id:"il25", product:"Mineral Water 500ml",    emoji:"💧", type:"OUT", qty:2,  before:30, after:28, by:"System",    time:"Jun 28, 2026 · 8:15 AM" },
    { id:"il26", product:"Lucky Me! Pancit Canton",emoji:"🍜", type:"OUT", qty:2,  before:25, after:23, by:"System",    time:"Jun 28, 2026 · 9:00 AM" },
    { id:"il27", product:"Great Taste Coffee",     emoji:"☕", type:"OUT", qty:2,  before:60, after:58, by:"System",    time:"Jun 28, 2026 · 2:30 PM" },
    // Jun 30 - restock
    { id:"il28", product:"Coca-Cola 1.5L",         emoji:"🥤", type:"IN",  qty:10, before:19, after:29, by:"Ben Cruz",  time:"Jun 30, 2026 · 7:30 AM" },
    { id:"il29", product:"Milo Sachet",            emoji:"🥤", type:"IN",  qty:20, before:48, after:68, by:"Ben Cruz",  time:"Jun 30, 2026 · 7:30 AM" },
    { id:"il30", product:"Nova Chips",             emoji:"🥔", type:"OUT", qty:1,  before:38, after:37, by:"System",    time:"Jun 30, 2026 · 7:50 AM" },
    { id:"il31", product:"Rebisco Biscuit",        emoji:"🍪", type:"OUT", qty:2,  before:40, after:38, by:"System",    time:"Jun 30, 2026 · 8:40 AM" },
    { id:"il32", product:"Nescafé 3-in-1",         emoji:"☕", type:"OUT", qty:3,  before:59, after:56, by:"System",    time:"Jun 30, 2026 · 10:30 AM"},
    { id:"il33", product:"Nescafé 3-in-1",         emoji:"☕", type:"OUT", qty:3,  before:56, after:53, by:"System",    time:"Jun 30, 2026 · 2:15 PM" },
    // Jul 1 - today
    { id:"il34", product:"Nova Chips",             emoji:"🥔", type:"OUT", qty:1,  before:37, after:36, by:"System",    time:"Jul 1, 2026 · 8:15 AM"  },
    { id:"il35", product:"Coca-Cola 1.5L",         emoji:"🥤", type:"OUT", qty:1,  before:29, after:28, by:"System",    time:"Jul 1, 2026 · 9:00 AM"  },
    { id:"il36", product:"Nescafé 3-in-1",         emoji:"☕", type:"OUT", qty:2,  before:53, after:51, by:"System",    time:"Jul 1, 2026 · 9:30 AM"  },
    { id:"il37", product:"Milo Sachet",            emoji:"🥤", type:"OUT", qty:3,  before:68, after:65, by:"System",    time:"Jul 1, 2026 · 10:15 AM" },
    { id:"il38", product:"SkyFlakes",              emoji:"🍪", type:"OUT", qty:2,  before:32, after:30, by:"System",    time:"Jul 1, 2026 · 10:15 AM" },
    { id:"il39", product:"Royal TruOrange 1L",     emoji:"🥤", type:"OUT", qty:1,  before:13, after:12, by:"System",    time:"Jul 1, 2026 · 11:00 AM" },
    { id:"il40", product:"Piattos Cheese",         emoji:"🥔", type:"OUT", qty:2,  before:19, after:17, by:"System",    time:"Jul 1, 2026 · 11:45 AM" },
    { id:"il41", product:"C2 Apple 230ml",         emoji:"🧃", type:"OUT", qty:2,  before:23, after:21, by:"System",    time:"Jul 1, 2026 · 11:45 AM" },
  ]);
  const [newProduct, setNewProduct] = useState({ name:"", buyPrice:"", price:"", emoji:"🛍️", category:"Others", stock:"" });


  const cartCount = cart.reduce((s,i)=>s+i.qty,0);
  const cartTotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const role = currentUser?.role;

  const orderCounter = useRef(22); // starts at 22 since defaults are KF000001-22
  const nextOrderId = () => {
    orderCounter.current += 1;
    return "KF" + String(orderCounter.current).padStart(6, "0");
  };
  const handleLoginWith = (username, password) => {
    const found = users.find(u=>u.username===username && u.password===password && u.registered);
    if(!found){ setLoginError("Invalid username or password."); return; }
    const isReset = (new Date().getDate()===15 || new Date().getDate()===new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate());
    setCurrentUser(isReset?{...found,creditBalance:found.creditLimit}:found);
    if(isReset) setUsers(prev=>prev.map(u=>u.id===found.id?{...u,creditBalance:u.creditLimit}:u));
    setLoginError("");
    setActiveTab(found.role==="user"?"menu":found.role==="admin"?"menu":found.role==="staff-admin"?"mgmenu":"mgorders");
  };
  const handleLogin = () => {
    const found = users.find(u=>u.username===loginForm.username && u.password===loginForm.password && u.registered);
    if (found) {
      // auto-reset credit on 15th or last day of month
      const today = new Date();
      const day = today.getDate();
      const lastDay = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
      let updatedUser = found;
      if(day===15||day===lastDay) {
        updatedUser = {...found, creditBalance: found.creditLimit};
        setUsers(prev=>prev.map(u=>u.id===found.id?updatedUser:u));
      }
      setCurrentUser(updatedUser);
      setLoginError("");
      setActiveTab(found.role==="user"?"menu":found.role==="admin"?"menu":found.role==="staff-admin"?"mgmenu":"mgorders");
      if(updatedUser.creditBalance < 100) setCreditNotif(true);
    } else setLoginError("Incorrect username or password.");
  };
  const handleLogout = () => { setCurrentUser(null); setLoginForm({username:"",password:""}); setCart([]); setLoginError(""); setCreditNotif(false); setSidebarOpen(false); };

  /* ── DOWNLOAD ORDERS AS XLSX ── */
  const downloadOrdersExcel = (ordersToExport, date, filterType) => {
    try {
      var dateStr = date.toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
      var filterLabel = filterType==="all"?"All Transactions":filterType+" Only";
      var cashOrders = ordersToExport.filter(function(o){return o.paymentType==="Cash";});
      var creditOrders = ordersToExport.filter(function(o){return o.paymentType==="Credit";});
      var unpaidOrders = ordersToExport.filter(function(o){return !o.paymentType;});
      var cashTotal = cashOrders.reduce(function(s,o){return s+o.total;},0);
      var creditTotal = creditOrders.reduce(function(s,o){return s+o.total;},0);
      var grandTotal = ordersToExport.reduce(function(s,o){return s+o.total;},0);

      // Load SheetJS dynamically
      var script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.onload = function() {
        var XLSX = window.XLSX;
        var wb = XLSX.utils.book_new();

        // ── Sheet 1: Orders ──
        var wsData = [];
        // Title block
        wsData.push(["KFCanteen - Daily Sales Report"]);
        wsData.push(["Date:", dateStr]);
        wsData.push(["Filter:", filterLabel]);
        wsData.push(["Generated:", new Date().toLocaleString("en-PH")]);
        wsData.push(["Report By:", currentUser.name+" ("+currentUser.plant+")"]);
        wsData.push([]);
        // Column headers
        wsData.push(["#","Order ID","Customer","Plant","Items","Qty","Unit Price","Subtotal","Payment","Time"]);
        // Data rows
        ordersToExport.forEach(function(o, idx){
          o.items.forEach(function(it, iIdx){
            wsData.push([
              iIdx===0 ? idx+1 : "",
              iIdx===0 ? o.id : "",
              iIdx===0 ? o.user : "",
              iIdx===0 ? (o.plant||"") : "",
              it.name,
              it.qty,
              it.price,
              it.price*it.qty,
              iIdx===0 ? (o.paymentType||"Unpaid") : "",
              iIdx===0 ? o.time : "",
            ]);
          });
          // Order subtotal row
          wsData.push(["","","","","","","ORDER TOTAL","P"+o.total,"",""]);
          wsData.push([]); // spacer
        });

        // Summary block
        wsData.push([]);
        wsData.push(["SUMMARY"]);
        wsData.push(["Total Orders", ordersToExport.length]);
        wsData.push(["Cash Orders", cashOrders.length, "Total Cash", "P"+cashTotal]);
        wsData.push(["Credit Orders", creditOrders.length, "Total Credit", "P"+creditTotal]);
        wsData.push(["Unpaid Orders", unpaidOrders.length]);
        wsData.push(["GRAND TOTAL", "", "", "P"+grandTotal]);

        var ws = XLSX.utils.aoa_to_sheet(wsData);

        // Set column widths
        ws["!cols"] = [
          {wch:4},{wch:12},{wch:22},{wch:12},{wch:30},
          {wch:6},{wch:12},{wch:12},{wch:12},{wch:10}
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Orders");

        // ── Sheet 2: Summary ──
        var summaryData = [
          ["KFCanteen - Sales Summary"],
          ["Date", dateStr],
          ["Filter", filterLabel],
          [],
          ["Payment Type","Count","Total Amount"],
          ["Cash", cashOrders.length, cashTotal],
          ["Credit", creditOrders.length, creditTotal],
          ["Unpaid", unpaidOrders.length, 0],
          [],
          ["GRAND TOTAL", ordersToExport.length, grandTotal],
        ];
        var wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        wsSummary["!cols"] = [{wch:20},{wch:10},{wch:16}];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        // Download
        var fileName = "KFCanteen_"+date.toISOString().slice(0,10)+"_"+filterLabel.replace(/ /g,"_")+".xlsx";
        XLSX.writeFile(wb, fileName);
      };
      script.onerror = function(){
        alert("Could not load Excel library. Please check your internet connection.");
      };
      document.head.appendChild(script);
    } catch(e) {
      alert("Download failed: "+e.message);
    }
  };

  const handleRegister = () => {
    if(!registerForm.selectedUserId){ setRegisterError("Please select your name from the list."); return; }
    if(!registerForm.phone||!/^[0-9+\-\s]{7,15}$/.test(registerForm.phone)){ setRegisterError("Please enter a valid cellphone number."); return; }
    if(!registerForm.password){ setRegisterError("Password is required."); return; }
    if(registerForm.password !== registerForm.confirmPassword){ setRegisterError("Passwords do not match."); return; }
    const emp = users.find(u=>u.id===registerForm.selectedUserId);
    if(!emp){ setRegisterError("Employee not found."); return; }
    // Generate username from name (lowercase, no spaces)
    const username = emp.name.toLowerCase().replace(/\s+/g,".").replace(/[^a-z.]/g,"");
    setUsers(prev=>prev.map(u=>u.id===registerForm.selectedUserId?{
      ...u,
      username,
      password: registerForm.password,
      phone: registerForm.phone.trim(),
      registered: true,
    }:u));
    setRegisterForm({ selectedUserId:"", phone:"", password:"", confirmPassword:"" });
    setNameSearch("");
    setRegisterError("");
    setShowRegister(false);
  };

  /* ── CART ── */
  const addToCart = (item, scheduledDate) => setCart(prev=>{
    const key = item.id + (scheduledDate? "_"+scheduledDate.toDateString():"");
    const ex = prev.find(c=>c._key===key);
    if(ex) return prev.map(c=>c._key===key?{...c,qty:c.qty+1}:c);
    return [...prev,{...item, qty:1, buyPrice:item.buyPrice||null, _key:key,
      scheduledDate: scheduledDate&&isFuture(scheduledDate)?scheduledDate:null }];
  });
  const updateQty = (key,delta) => setCart(prev=>prev.map(c=>c._key===key?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));
  const removeFromCart = (key) => setCart(prev=>prev.filter(c=>c._key!==key));

  const placeOrder = () => {
    if(!cart.length) return;
    const plant = orderPlant || currentUser.plant || "KF-Main";
    const order={ id:nextOrderId(), user:currentUser.name, userId:currentUser.id,
      date: new Date().toISOString().slice(0,10),
      plant: plant,
      items:cart.map(c=>({name:c.name,qty:c.qty,price:c.price,grams:c.grams||null,buyPrice:c.buyPrice||null,scheduledDate:c.scheduledDate?c.scheduledDate.toLocaleDateString("en-PH",{month:"short",day:"numeric"}):null})), total:cartTotal, time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) };
    setOrders(prev=>[order,...prev]);
    const newBalance = Math.max(0, (currentUser.creditBalance||0) - cartTotal);
    const updatedUser = {...currentUser, creditBalance: newBalance};
    setCurrentUser(updatedUser);
    setUsers(prev=>prev.map(u=>u.id===currentUser.id?updatedUser:u));
    if(newBalance < 100) setCreditNotif(true);
    setOtherProducts(prev => {
      const updated = prev.map(p => {
        const cartItem = cart.find(c => c.id === p.id);
        if (!cartItem) return p;
        const newStock = Math.max(0, p.stock - cartItem.qty);
        setInventoryLog(log=>[{
          id:"il"+Date.now()+p.id, product:p.name, emoji:p.emoji,
          type:"OUT", qty:cartItem.qty, before:p.stock, after:newStock,
          by:currentUser.name,
          time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
        },...log]);
        return { ...p, stock: newStock, available: newStock > 0 };
      });
      return updated;
    });
    setCart([]);
    setOrderPlant("");
    setShowPlantModal(false);
    setOrderPlaced(true);
    setTimeout(()=>setOrderPlaced(false),3000);
    setActiveTab("myorders");
  };

  /* ── MENU MGMT ── */
  const addMenuItem = (day) => {
    if(!newItem.name||!newItem.price) return;
    const item={ id:"m"+Date.now(), name:newItem.name, price:parseFloat(newItem.price), available:true, img:newItem.photo||newItem.img||"🍽️", isPhoto:!!newItem.photo, cat:newItem.cat, grams:newItem.grams?parseFloat(newItem.grams):null };
    setMenu(prev=>({...prev,[day]:[...prev[day],item]}));
    setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null,grams:""});
    setShowAddItem(null);
  };
  const removeMenuItem = (day,id) => setMenu(prev=>({...prev,[day]:prev[day].filter(i=>i.id!==id)}));
  const toggleAvail = (day,id) => setMenu(prev=>({...prev,[day]:prev[day].map(i=>i.id===id?{...i,available:!i.available}:i)}));

  const confirmPayment = (orderId, paymentType) => {
    const order = orders.find(o=>o.id===orderId);
    if(!order) return;
    // mark served + save payment type
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,paymentType}:o));
    // if credit, deduct from user's credit balance
    if(paymentType==="Credit"){
      setUsers(prev=>prev.map(u=>{
        if(u.name!==order.user) return u;
        const newBal = Math.max(0,(u.creditBalance||0)-order.total);
        // update currentUser too if it's them
        if(currentUser&&currentUser.name===u.name){
          const updated = {...currentUser, creditBalance:newBal};
          setCurrentUser(updated);
          if(newBal<100) setCreditNotif(true);
        }
        return {...u, creditBalance:newBal};
      }));
    }
    setPaymentModal(null);
  };

  const addOtherProduct = () => {
    if(!newProduct.name||!newProduct.price||!newProduct.stock) return;
    const p = { id:"op"+Date.now(), name:newProduct.name, buyPrice:parseFloat(newProduct.buyPrice)||0, price:parseFloat(newProduct.price), emoji:newProduct.emoji||"🛍️", category:newProduct.category||"Others", stock:parseInt(newProduct.stock), available:parseInt(newProduct.stock)>0 };
    setOtherProducts(prev=>[...prev, p]);
    setNewProduct({ name:"", buyPrice:"", price:"", emoji:"🛍️", category:"Others", stock:"" });
    setShowAddProduct(false);
  };
  const removeOtherProduct = (id) => setOtherProducts(prev=>prev.filter(p=>p.id!==id));
  const toggleOtherAvail = (id) => setOtherProducts(prev=>prev.map(p=>p.id===id?{...p,available:!p.available}:p));
  const updateOtherStock = (id, delta) => setOtherProducts(prev=>prev.map(p=>{
    if(p.id!==id) return p;
    const newStock = Math.max(0, p.stock + delta);
    return {...p, stock:newStock, available: newStock>0};
  }));

  /* ── FILTERED ITEMS ── */
  const visibleItems = useMemo(()=>{
    let items = menu[selectedDay]||[];
    if(mealCat!=="ALL") items=items.filter(i=>i.cat===mealCat);
    if(searchQ.trim()) items=items.filter(i=>i.name.toLowerCase().includes(searchQ.toLowerCase()));
    return items;
  },[menu,selectedDay,mealCat,searchQ]);

  const otherCats = ["All",...new Set(otherProducts.map(p=>p.category))];
  const visibleOthers = useMemo(()=>{
    let items = otherCat==="All"?otherProducts:otherProducts.filter(p=>p.category===otherCat);
    if(searchQ.trim()) items=items.filter(i=>i.name.toLowerCase().includes(searchQ.toLowerCase()));
    return items;
  },[otherProducts,otherCat,searchQ]);

  /* ════════════════════════════════════════
     LOGIN SCREEN
  ════════════════════════════════════════ */
  if (!currentUser) return (
    <div style={{minHeight:600,display:"flex",alignItems:"center",justifyContent:"center",background:BG,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:420,background:"#fff",borderRadius:20,boxShadow:"0 8px 40px rgba(0,0,0,0.10)",padding:"2.5rem 2.25rem"}}>
        {/* logo */}
        <div style={{textAlign:"center",marginBottom:"1.75rem"}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:56,height:56,borderRadius:"50%",background:PURPLE_LIGHT,marginBottom:14}}>
            <Icon name="utensils" size={26} color={PURPLE} />
          </div>
          <h1 style={{fontSize:22,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>{showRegister?"Create Account":"Welcome Back"}</h1>
          <p style={{color:"#9CA3AF",fontSize:13,margin:0}}>{showRegister?"Register as an employee":"Sign in to order your meal"}</p>
        </div>

        {!showRegister ? (
          <>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Username</label>
              <input value={loginForm.username} onChange={e=>setLoginForm(p=>({...p,username:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Enter your username"
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:loginError?"1.5px solid #EF4444":"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
            </div>
            <div style={{marginBottom:6}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Password</label>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={loginForm.password}
                  onChange={e=>setLoginForm(p=>({...p,password:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Enter your password"
                  style={{width:"100%",padding:"11px 42px 11px 14px",borderRadius:10,border:loginError?"1.5px solid #EF4444":"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:0}}>
                  <Icon name={showPass?"eyeoff":"eye"} size={18} color="#9CA3AF" />
                </button>
              </div>
            </div>
            {loginError && <p style={{color:"#EF4444",fontSize:12,margin:"6px 0 0",display:"flex",alignItems:"center",gap:5}}>⚠️ {loginError}</p>}
            <button onClick={handleLogin} style={{width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:18}}>Sign In</button>
            <p style={{textAlign:"center",marginTop:16,fontSize:13,color:"#9CA3AF"}}>
              Don't have an account? <span onClick={()=>{setShowRegister(true);setLoginError("");}} style={{color:PURPLE_MID,fontWeight:600,cursor:"pointer"}}>Register as Employee</span>
            </p>
          </>
        ) : (
          <>
            {/* Step indicator */}
            <div style={{display:"flex",gap:8,marginBottom:18,alignItems:"center"}}>
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.selectedUserId?PURPLE:PURPLE_LIGHT}} />
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.selectedUserId&&registerForm.phone?PURPLE:PURPLE_LIGHT}} />
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.password&&registerForm.confirmPassword&&registerForm.password===registerForm.confirmPassword?PURPLE:PURPLE_LIGHT}} />
            </div>

            {/* Step 1: Search name */}
            {!registerForm.selectedUserId ? (
              <div style={{position:"relative"}}>
                <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Search Your Name</label>
                <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:10,padding:"10px 14px",background:"#fff"}}>
                  <Icon name="search" size={16} color="#9CA3AF" />
                  <input value={nameSearch}
                    onChange={e=>{
                      const v=e.target.value; setNameSearch(v);
                      if(v.trim().length>=2){
                        setNameSuggestions(users.filter(u=>!u.registered&&(
                          u.name.toLowerCase().includes(v.toLowerCase()) ||
                          (u.idNumber||"").toLowerCase().includes(v.toLowerCase())
                        )));
                      } else setNameSuggestions([]);
                    }}
                    placeholder="Type your name to search..."
                    style={{border:"none",outline:"none",fontSize:14,color:"#111",width:"100%",background:"none"}} />
                </div>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Only employees added by admin can register</div>
                {nameSuggestions.length>0&&(
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",zIndex:200,overflow:"hidden",marginTop:2}}>
                    {nameSuggestions.map(u=>(
                      <button key={u.id} onMouseDown={()=>{setRegisterForm(p=>({...p,selectedUserId:u.id}));setNameSearch(u.name);setNameSuggestions([]);}}
                        style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",border:"none",borderBottom:"1px solid #F3F4F6",background:"none",cursor:"pointer",textAlign:"left"}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:PURPLE,flexShrink:0}}>{u.avatar}</div>
                        <div>
                          <div style={{fontSize:14,fontWeight:600,color:"#111"}}>{u.name}</div>
                          <div style={{fontSize:11,color:"#6B7280",display:"flex",alignItems:"center",gap:6}}>
                            {u.idNumber&&<span style={{fontFamily:"monospace",fontWeight:600,color:"#374151"}}>{u.idNumber}</span>}
                            {u.idNumber&&<span style={{color:"#D1D5DB"}}>·</span>}
                            <span style={{background:PURPLE_LIGHT,color:PURPLE,padding:"1px 6px",borderRadius:8,fontWeight:600,fontSize:10}}>{u.plant}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {nameSearch.length>=2&&nameSuggestions.length===0&&(
                  <div style={{marginTop:8,padding:"12px",background:"#FEF3C7",borderRadius:8,fontSize:13,color:"#92400E",textAlign:"center"}}>
                    No unregistered employee found for "{nameSearch}".<br/>
                    <span style={{fontSize:12}}>Please ask your admin to add your name first.</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Selected employee card */}
                {(()=>{const emp=users.find(u=>u.id===registerForm.selectedUserId); return emp&&(
                  <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:PURPLE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#111"}}>{emp.name}</div>
                      <div style={{fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                        {emp.idNumber&&<span style={{fontFamily:"monospace",fontWeight:600,color:"#374151",fontSize:11}}>{emp.idNumber}</span>}
                        {emp.idNumber&&<span style={{color:"rgba(107,33,168,0.4)"}}>·</span>}
                        <span style={{color:PURPLE,fontWeight:600}}>{emp.plant}</span>
                      </div>
                    </div>
                    <button onClick={()=>{setRegisterForm(p=>({...p,selectedUserId:""}));setNameSearch("");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#6B7280",padding:"4px 8px",borderRadius:6,border:"1px solid #E5E7EB",background:"#fff"}}>Change</button>
                  </div>
                );})()}

                {/* Contact Number */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Cellphone Number</label>
                  <input value={registerForm.phone} onChange={e=>setRegisterForm(p=>({...p,phone:e.target.value}))}
                    placeholder="e.g. 09171234567" type="tel" maxLength={15}
                    style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                </div>

                {/* Password */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Create Password</label>
                  <div style={{position:"relative"}}>
                    <input type={registerShowPass?"text":"password"} value={registerForm.password}
                      onChange={e=>setRegisterForm(p=>({...p,password:e.target.value}))} placeholder="Create a password"
                      style={{width:"100%",padding:"11px 42px 11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                    <button onClick={()=>setRegisterShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer"}}>
                      <Icon name={registerShowPass?"eyeoff":"eye"} size={18} color="#9CA3AF" />
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Confirm Password</label>
                  <div style={{position:"relative"}}>
                    <input type={registerShowConfirm?"text":"password"} value={registerForm.confirmPassword}
                      onChange={e=>setRegisterForm(p=>({...p,confirmPassword:e.target.value}))} placeholder="Re-enter your password"
                      style={{width:"100%",padding:"11px 42px 11px 14px",borderRadius:10,border:registerForm.confirmPassword?(registerForm.password===registerForm.confirmPassword?"1.5px solid #10B981":"1.5px solid #EF4444"):"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                    <button onClick={()=>setRegisterShowConfirm(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer"}}>
                      <Icon name={registerShowConfirm?"eyeoff":"eye"} size={18} color="#9CA3AF" />
                    </button>
                  </div>
                  {registerForm.confirmPassword&&(
                    <div style={{fontSize:11,marginTop:4,color:registerForm.password===registerForm.confirmPassword?"#059669":"#EF4444"}}>
                      {registerForm.password===registerForm.confirmPassword?"✅ Passwords match":"❌ Passwords do not match"}
                    </div>
                  )}
                </div>
              </>
            )}

            {registerError&&<p style={{color:"#EF4444",fontSize:12,margin:"4px 0 8px",display:"flex",alignItems:"center",gap:5}}>⚠️ {registerError}</p>}
            {registerForm.selectedUserId&&(
              <button onClick={handleRegister} style={{width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:6}}>Complete Registration</button>
            )}
            <p style={{textAlign:"center",marginTop:14,fontSize:13,color:"#9CA3AF"}}>
              Already have an account? <span onClick={()=>{setShowRegister(false);setRegisterError("");}} style={{color:PURPLE_MID,fontWeight:600,cursor:"pointer"}}>Sign In</span>
            </p>
          </>
        )}

        {/* demo hint — only on login */}
        {!showRegister&&(
          <div style={{marginTop:16,borderTop:"1px solid #F3F4F6",paddingTop:14}}>
            <p style={{fontSize:11,color:"#9CA3AF",margin:"0 0 8px",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:600}}>Quick login</p>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {/* Row 1: Admin roles */}
              <div style={{display:"flex",gap:6}}>
                {[
                  {label:"Admin",       u:"admin",      p:"admin123", c:PURPLE},
                  {label:"Staff-Admin", u:"staffadmin", p:"sa123",    c:"#92400E"},
                  {label:"Customer",    u:"juan",       p:"user123",  c:"#059669"},
                ].map(a=>(
                  <button key={a.u} onClick={()=>{setLoginForm({username:a.u,password:a.p});setLoginError("");handleLoginWith(a.u,a.p);}}
                    style={{flex:1,background:a.c+"12",color:a.c,border:"1px solid "+a.c+"33",borderRadius:8,padding:"7px 8px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                    {a.label}
                  </button>
                ))}
              </div>
              {/* Row 2: Staff per plant */}
              <div style={{display:"flex",gap:6}}>
                {[
                  {label:"Staff-Main",  u:"staff.main", p:"main123",  c:"#0891B2"},
                  {label:"Staff-CT",    u:"staff.ct",   p:"ct123",    c:"#0891B2"},
                  {label:"Staff-GLB",   u:"staff.kg",   p:"kg123",    c:"#0891B2"},
                ].map(a=>(
                  <button key={a.u} onClick={()=>{setLoginForm({username:a.u,password:a.p});setLoginError("");handleLoginWith(a.u,a.p);}}
                    style={{flex:1,background:a.c+"12",color:a.c,border:"1px solid "+a.c+"33",borderRadius:8,padding:"7px 8px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                    {a.label}
                  </button>
                ))}
              </div>
              {/* Row 3: Customer per plant */}
              <div style={{display:"flex",gap:6}}>
                {[
                  {label:"Cust-Main",  u:"juan",  p:"user123",  c:"#059669"},
                  {label:"Cust-CT",    u:"maria", p:"user456",  c:"#059669"},
                  {label:"Cust-GLB",   u:"paulo", p:"paulo123", c:"#059669"},
                ].map(a=>(
                  <button key={a.u} onClick={()=>{setLoginForm({username:a.u,password:a.p});setLoginError("");handleLoginWith(a.u,a.p);}}
                    style={{flex:1,background:a.c+"12",color:a.c,border:"1px solid "+a.c+"33",borderRadius:8,padding:"7px 8px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ════════════════════════════════════════
     TOP NAVBAR
  ════════════════════════════════════════ */
  const navItems = NAV[role]||NAV.user;

  const Navbar = () => (
    <>
      {/* ── Top Bar ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",display:"flex",alignItems:"center",padding:"0 1rem",position:"sticky",top:0,zIndex:50,height:52,flexShrink:0}}>
        {/* Hamburger */}
        <button onClick={()=>setSidebarOpen(p=>!p)}
          style={{background:"none",border:"none",cursor:"pointer",padding:"6px 8px",marginRight:10,borderRadius:8,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}
          aria-label="Toggle menu">
          <span style={{display:"block",width:20,height:2,background:sidebarOpen?PURPLE:"#374151",borderRadius:2,transition:"all 0.2s"}} />
          <span style={{display:"block",width:20,height:2,background:sidebarOpen?PURPLE:"#374151",borderRadius:2,transition:"all 0.2s"}} />
          <span style={{display:"block",width:20,height:2,background:sidebarOpen?PURPLE:"#374151",borderRadius:2,transition:"all 0.2s"}} />
        </button>

        {/* Brand */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <Icon name="utensils" size={18} color={PURPLE} />
          <span style={{fontWeight:700,fontSize:15,color:PURPLE,letterSpacing:"-0.3px"}}>KFCanteen</span>
          {currentUser.plant&&(
            <span style={{display:"flex",alignItems:"center",gap:4,background:PURPLE_LIGHT,color:PURPLE,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>
              📍 {currentUser.plant}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div style={{flex:1}} />

        {/* Right side */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {/* Cart button for users and admin */}
          {(role==="user"||role==="admin")&&(
            <button onClick={()=>{setActiveTab("cart");setSidebarOpen(false);}}
              style={{background:activeTab==="cart"?PURPLE:PURPLE_LIGHT,border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",color:activeTab==="cart"?"#fff":PURPLE,fontSize:13,display:"flex",alignItems:"center",gap:6,fontWeight:600}}>
              <Icon name="cart" size={15} color={activeTab==="cart"?"#fff":PURPLE} />
              {cartCount>0&&<span style={{background:activeTab==="cart"?"#fff":PURPLE,color:activeTab==="cart"?PURPLE:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{cartCount}</span>}
            </button>
          )}
          {/* Credit balance */}
          {currentUser.creditBalance!=null&&(
            <div style={{display:"flex",alignItems:"center",gap:5,background:currentUser.creditBalance<100?"#FEE2E2":PURPLE_LIGHT,borderRadius:20,padding:"4px 10px",border:`1px solid ${currentUser.creditBalance<100?"#FECACA":"#DDD6FE"}`}}>
              <span style={{fontSize:11,fontWeight:700,color:currentUser.creditBalance<100?"#EF4444":PURPLE}}>
                💳 ₱{currentUser.creditBalance?.toLocaleString()}
              </span>
            </div>
          )}
          {/* Avatar */}
          <div style={{width:30,height:30,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:PURPLE,flexShrink:0}}>
            {currentUser.avatar}
          </div>
          {/* Logout */}
          <button onClick={handleLogout} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#6B7280",padding:"5px 8px",borderRadius:8,flexShrink:0}}>
            <Icon name="logout" size={14} color="#9CA3AF" />
            <span style={{display:"none"}} className="md-show">Logout</span>
          </button>
        </div>
      </div>

      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen&&(
        <div onClick={()=>setSidebarOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:98,top:52}} />
      )}

      {/* ── Sidebar ── */}
      <div style={{
        position:"fixed",top:52,left:0,bottom:0,width:240,
        background:"#fff",borderRight:"1px solid #E5E7EB",
        zIndex:99,transform:sidebarOpen?"translateX(0)":"translateX(-100%)",
        transition:"transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        display:"flex",flexDirection:"column",overflowY:"auto",
        boxShadow:sidebarOpen?"4px 0 20px rgba(0,0,0,0.08)":"none",
      }}>
        {/* User info header */}
        <div style={{padding:"16px",borderBottom:"1px solid #F3F4F6",background:PURPLE_LIGHT}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:PURPLE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>
              {currentUser.avatar}
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:"#111",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{currentUser.name}</div>
              <div style={{fontSize:11,color:PURPLE,fontWeight:600,textTransform:"capitalize"}}>{role==="user"?"Customer":role==="staff-admin"?"Staff-Admin":role==="staff"?"Staff":"Admin"}</div>
              {currentUser.company&&<div style={{fontSize:10,color:"#6B7280",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{currentUser.company}</div>}
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{flex:1,padding:"8px 0"}}>
          {navItems.map(n=>{
            const isActive = activeTab===n.id;
            return (
              <button key={n.id}
                onClick={()=>{ setActiveTab(n.id); setSidebarOpen(false); }}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 16px",border:"none",background:isActive?PURPLE_LIGHT:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`3px solid ${isActive?PURPLE:"transparent"}`,transition:"all 0.1s"}}>
                <Icon name={n.icon} size={17} color={isActive?PURPLE:"#6B7280"} />
                <span style={{fontSize:14,fontWeight:isActive?600:400,color:isActive?PURPLE:"#374151"}}>{n.label}</span>
                {n.id==="cart"&&cartCount>0&&<span style={{marginLeft:"auto",background:PURPLE,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{cartCount}</span>}
              </button>
            );
          })}
        </div>

        {/* Logout at bottom */}
        <div style={{padding:"12px 8px",borderTop:"1px solid #F3F4F6"}}>
          <button onClick={handleLogout}
            style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 16px",border:"none",background:"#FEF2F2",cursor:"pointer",borderRadius:8,color:"#EF4444"}}>
            <Icon name="logout" size={17} color="#EF4444" />
            <span style={{fontSize:14,fontWeight:600}}>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );

  /* ════════════════════════════════════════
     HERO BANNER
  ════════════════════════════════════════ */
  const Hero = () => (
    <div style={{background:PURPLE,borderRadius:16,padding:"2rem 2.5rem",marginBottom:24,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{position:"relative",zIndex:1}}>
        <h2 style={{fontSize:26,fontWeight:800,color:"#fff",margin:"0 0 6px",lineHeight:1.2}}>Delicious meals, delivered<br/>to your desk.</h2>
        <p style={{color:"rgba(255,255,255,0.75)",margin:0,fontSize:14}}>Browse our weekly menu and daily specials.</p>
      </div>
      <div style={{fontSize:90,opacity:0.15,userSelect:"none",lineHeight:1}}>
        <Icon name="utensils" size={110} color="#fff" />
      </div>
    </div>
  );

  /* ════════════════════════════════════════
     MENU + FILTER BAR
  ════════════════════════════════════════ */
  const MenuFilterBar = () => (
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:4}}>
        {["Weekly Menu","Other Products"].map(v=>(
          <button key={v} onClick={()=>{setMenuView(v);setSearchQ("");setMealCat("ALL");setOtherCat("All");}}
            style={{padding:"7px 18px",borderRadius:8,border:"1px solid #E5E7EB",background:menuView===v?"#fff":BG,fontWeight:menuView===v?600:400,fontSize:13,color:menuView===v?"#111":"#6B7280",cursor:"pointer",boxShadow:menuView===v?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
            {v}
          </button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,border:"1px solid #E5E7EB",borderRadius:9,padding:"7px 12px",background:BG,minWidth:180}}>
        <Icon name="search" size={15} color="#9CA3AF" />
        <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search items..."
          style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
      </div>
    </div>
  );

  /* ── Calendar Date Picker ── */
  const DatePicker = () => {
    const [calYear, setCalYear] = useState(selectedDate.getFullYear());
    const [calMonth, setCalMonth] = useState(selectedDate.getMonth());

    const prevMonth = () => { if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); };
    const nextMonth = () => { if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); };

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();
    const monthLabel = new Date(calYear, calMonth).toLocaleDateString("en-PH",{month:"long",year:"numeric"});

    const cells = [];
    for(let i=0;i<firstDay;i++) cells.push({day:daysInPrev-firstDay+1+i, type:"prev"});
    for(let d=1;d<=daysInMonth;d++) cells.push({day:d, type:"curr"});
    const remaining = 42-cells.length;
    for(let i=1;i<=remaining;i++) cells.push({day:i, type:"next"});
    const weeks = [];
    for(let w=0;w<cells.length/7;w++) weeks.push(cells.slice(w*7,(w+1)*7));

    const isPastD = isPast(selectedDate)&&!isSameDay(selectedDate,TODAY_DATE);
    const isFutD = isFuture(selectedDate);

    return (
      <div style={{marginBottom:16,position:"relative",display:"inline-block"}}>
        {/* collapsed trigger row */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"8px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <span style={{fontSize:14}}>📅</span>
            <span style={{fontWeight:600,fontSize:14,color:"#374151"}}>{selectedDate.toLocaleDateString("en-PH",{year:"numeric",month:"2-digit",day:"2-digit"})}</span>
            {isPastD&&<span style={{fontSize:11,background:"#FEE2E2",color:"#991B1B",padding:"2px 8px",borderRadius:10,fontWeight:600}}>Past</span>}
            {isSameDay(selectedDate,TODAY_DATE)&&<span style={{fontSize:11,background:"#D1FAE5",color:"#065F46",padding:"2px 8px",borderRadius:10,fontWeight:600}}>Today</span>}
            {isFutD&&<span style={{fontSize:11,background:PURPLE_LIGHT,color:PURPLE,padding:"2px 8px",borderRadius:10,fontWeight:600}}>Early Order</span>}
          </div>
          <button onClick={()=>setShowCalendar(p=>!p)}
            style={{display:"flex",alignItems:"center",gap:6,background:showCalendar?PURPLE:"#fff",color:showCalendar?"#fff":PURPLE,border:`1.5px solid ${PURPLE}`,borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>
            🗓️ {showCalendar?"Close":"Change Date"}
          </button>
        </div>

        {/* calendar dropdown */}
        {showCalendar&&(
          <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:100,background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",minWidth:280}}>
            {/* header */}
            <div style={{background:PURPLE,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <button onClick={prevMonth} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
              <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{monthLabel}</span>
              <button onClick={nextMonth} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            </div>
            {/* day headers */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>(
                <div key={d} style={{textAlign:"center",padding:"6px 0",fontSize:11,fontWeight:700,color:d==="Su"?"#EF4444":"#6B7280"}}>{d}</div>
              ))}
            </div>
            {/* grid */}
            <div style={{padding:"4px 6px 8px"}}>
              {weeks.map((week,wi)=>(
                <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                  {week.map((cell,ci)=>{
                    if(cell.type!=="curr") return (
                      <div key={ci} style={{textAlign:"center",padding:"6px 2px",fontSize:12,color:"#D1D5DB"}}>{cell.day}</div>
                    );
                    const cellDate = new Date(calYear, calMonth, cell.day);
                    const isSel = isSameDay(cellDate, selectedDate);
                    const isT = isSameDay(cellDate, TODAY_DATE);
                    const isCellPast = isPast(cellDate)&&!isSameDay(cellDate,TODAY_DATE);
                    const isCellFut = isFuture(cellDate);
                    const isSun = cellDate.getDay()===0;
                    return (
                      <div key={ci} onClick={()=>{ setSelectedDate(cellDate); setShowCalendar(false); }}
                        style={{textAlign:"center",padding:"5px 2px",cursor:"pointer",position:"relative"}}>
                        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:"50%",fontSize:13,fontWeight:isSel||isT?700:400,background:isSel?PURPLE:isT?PURPLE_LIGHT:"transparent",color:isSel?"#fff":isSun?"#EF4444":isCellPast?"#9CA3AF":isCellFut?PURPLE:"#374151",border:isT&&!isSel?`1.5px solid ${PURPLE}`:"none"}}>
                          {cell.day}
                        </div>
                        {isCellFut&&!isSel&&<span style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,background:PURPLE,borderRadius:"50%",display:"block"}} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* today footer */}
            <div style={{borderTop:"1px solid #E5E7EB",padding:"8px",textAlign:"center"}}>
              <button onClick={()=>{setSelectedDate(new Date(TODAY_DATE));setCalYear(TODAY_DATE.getFullYear());setCalMonth(TODAY_DATE.getMonth());setShowCalendar(false);}}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:PURPLE,fontWeight:600}}>
                Today: {TODAY_DATE.toLocaleDateString("en-PH",{month:"2-digit",day:"2-digit",year:"numeric"})}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── Meal category dropdown ── */
  const MealCatPills = () => (
    <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
      <label style={{fontSize:13,fontWeight:600,color:"#374151",whiteSpace:"nowrap"}}>Meal Type:</label>
      <div style={{position:"relative",display:"inline-block"}}>
        <select value={mealCat} onChange={e=>setMealCat(e.target.value)}
          style={{appearance:"none",WebkitAppearance:"none",padding:"8px 36px 8px 14px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",fontSize:13,fontWeight:500,color:"#374151",cursor:"pointer",outline:"none",minWidth:150,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
          {MEAL_CATS.map(c=><option key={c} value={c}>{c==="ALL"?"All Categories":c.charAt(0)+c.slice(1).toLowerCase()}</option>)}
        </select>
        <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",fontSize:12,color:"#9CA3AF"}}>▼</span>
      </div>
    </div>
  );

  /* ── Food card ── */
  const FoodCard = ({item, onAdd, isPastDate, scheduledDate}) => {
    const outOfStock = item.available===false || (item.stock!==undefined && item.stock<=0);
    const cantOrder = outOfStock || isPastDate;
    return (
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden",display:"flex",flexDirection:"column",transition:"box-shadow 0.15s",opacity:cantOrder?0.7:1}}
        onMouseEnter={e=>e.currentTarget.style.boxShadow=cantOrder?"none":"0 4px 16px rgba(107,33,168,0.10)"}
        onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
        <div style={{height:130,background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
          {item.isPhoto&&item.img
            ? <img src={item.img} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
            : <span style={{fontSize:54,lineHeight:1}}>{item.img||item.emoji}</span>
          }
          {item.cat&&<span style={{position:"absolute",top:8,left:8,background:PURPLE,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:20,letterSpacing:"0.5px"}}>{item.cat}</span>}
          {item.stock!==undefined&&<span style={{position:"absolute",top:8,right:8,background:item.stock<=5?"#EF4444":item.stock<=10?"#F59E0B":"#10B981",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>
            {item.stock<=0?"Out":item.stock+" left"}
          </span>}
          {scheduledDate&&<span style={{position:"absolute",bottom:8,right:8,background:"rgba(107,33,168,0.85)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8}}>📅 {formatDateLabel(scheduledDate)}</span>}
        </div>
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:6,flex:1}}>
          <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
          {item.grams&&<div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#6B7280",background:"#F3F4F6",borderRadius:20,padding:"2px 8px",alignSelf:"flex-start"}}>
            <span>⚖️</span>
            <span>{item.grams}g per serving</span>
          </div>}
          {/* buy/sell price — admin & staff only */}
          {(role==="admin"||role==="staff-admin"||role==="staff") && item.buyPrice!=null ? (
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:11,color:"#EF4444",fontWeight:600}}>Buy ₱{item.buyPrice}</span>
                <span style={{fontSize:10,color:"#D1D5DB"}}>→</span>
                <span style={{fontSize:11,color:"#059669",fontWeight:600}}>Sell ₱{item.price}</span>
                <span style={{fontSize:10,color:PURPLE,fontWeight:700,background:PURPLE_LIGHT,borderRadius:10,padding:"1px 6px"}}>+₱{(item.price-item.buyPrice).toFixed(0)}</span>
              </div>
              <div style={{color:PURPLE,fontWeight:700,fontSize:16}}>₱{item.price}</div>
            </div>
          ) : (
            <div style={{color:PURPLE,fontWeight:700,fontSize:16}}>₱{item.price}</div>
          )}
          {isPastDate
            ? <div style={{textAlign:"center",fontSize:12,color:"#9CA3AF",padding:"7px",background:"#F9FAFB",borderRadius:8,marginTop:"auto",fontWeight:600}}>📅 Past — View Only</div>
            : outOfStock
            ? <div style={{textAlign:"center",fontSize:12,color:"#9CA3AF",padding:"7px",background:"#F9FAFB",borderRadius:8,marginTop:"auto",fontWeight:600}}>Out of Stock</div>
            : <button onClick={()=>onAdd(item, scheduledDate)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:"auto"}}>
                <Icon name="plus" size={14} color="#fff" />
                {scheduledDate ? `Order for ${formatDateLabel(scheduledDate)}` : "Add to Cart"}
              </button>
          }
        </div>
      </div>
    );
  };

  /* ── Empty state ── */
  const Empty = ({msg="No items found",sub="Try adjusting your filters or search terms."}) => (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"4rem 2rem",textAlign:"center"}}>
      <div style={{marginBottom:12}}><Icon name="search" size={36} color="#D1D5DB" /></div>
      <div style={{fontWeight:600,fontSize:15,color:"#374151",marginBottom:4}}>{msg}</div>
      <div style={{fontSize:13,color:"#9CA3AF"}}>{sub}</div>
    </div>
  );

  /* ════════════════════════════════════════
     RENDER TABS
  ════════════════════════════════════════ */
  const renderTab = () => {
    /* ── MENU TAB (user/staff/admin) ── */
    if(activeTab==="menu") return (
      <div>
        <Hero />
        <MenuFilterBar />
        {menuView==="Weekly Menu" ? (
          <div>
            <DatePicker />
            <MealCatPills />
            {visibleItems.length===0 ? <Empty /> : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
                {visibleItems.map(item=><FoodCard key={item.id} item={item} onAdd={addToCart}
                  isPastDate={isPast(selectedDate)&&!isSameDay(selectedDate,TODAY_DATE)}
                  scheduledDate={isFuture(selectedDate)?selectedDate:null} />)}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <label style={{fontSize:13,fontWeight:600,color:"#374151",whiteSpace:"nowrap"}}>Category:</label>
              <div style={{position:"relative",display:"inline-block"}}>
                <select value={otherCat} onChange={e=>setOtherCat(e.target.value)}
                  style={{appearance:"none",WebkitAppearance:"none",padding:"8px 36px 8px 14px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",fontSize:13,fontWeight:500,color:"#374151",cursor:"pointer",outline:"none",minWidth:180,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                  {otherCats.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",fontSize:12,color:"#9CA3AF"}}>▼</span>
              </div>
            </div>
            {visibleOthers.length===0 ? <Empty /> : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>
                {visibleOthers.map(item=><FoodCard key={item.id} item={item} onAdd={addToCart} />)}
              </div>
            )}
          </div>
        )}
      </div>
    );

    /* ── CART TAB ── */
    if(activeTab==="cart") return (
      <div style={{maxWidth:560,margin:"0 auto"}}>
        <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 20px",display:"flex",alignItems:"center",gap:10}}>
          <Icon name="cart" size={20} color={PURPLE} /> Your Cart
        </h2>
        {cart.length===0 ? (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"4rem",textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>🛒</div>
            <div style={{fontWeight:600,fontSize:15,color:"#374151"}}>Your cart is empty</div>
            <div style={{fontSize:13,color:"#9CA3AF",marginTop:4}}>Add items from the menu to get started</div>
          </div>
        ) : (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden"}}>
            {cart.map(item=>(
              <div key={item._key} style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #F3F4F6"}}>
                <span style={{fontSize:28}}>{item.img||item.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:"#111"}}>
                    {item.name}
                    {item.scheduledDate&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>📅 {item.scheduledDate instanceof Date?formatDateLabel(item.scheduledDate):item.scheduledDate}</span>}
                  </div>
                  {item.grams&&<div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#6B7280",background:"#F3F4F6",borderRadius:20,padding:"1px 7px",margin:"2px 0"}}>⚖️ {item.grams}g per serving</div>}
                  <div style={{fontSize:12,color:"#6B7280"}}>₱{item.price} each</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>updateQty(item._key,-1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E5E7EB",background:BG,cursor:"pointer",fontSize:16,fontWeight:700,color:"#374151"}}>−</button>
                  <span style={{fontSize:14,fontWeight:700,minWidth:20,textAlign:"center"}}>{item.qty}</span>
                  <button onClick={()=>updateQty(item._key,1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E5E7EB",background:BG,cursor:"pointer",fontSize:16,fontWeight:700,color:"#374151"}}>+</button>
                </div>
                <div style={{fontWeight:700,fontSize:14,color:PURPLE,minWidth:52,textAlign:"right"}}>₱{item.price*item.qty}</div>
                <button onClick={()=>removeFromCart(item._key)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#EF4444"}}>
                  <Icon name="trash" size={15} color="#EF4444" />
                </button>
              </div>
            ))}
            <div style={{padding:"16px 18px",background:"#FAFAFA",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:"#6B7280"}}>Total Amount</div>
                <div style={{fontSize:22,fontWeight:800,color:PURPLE}}>₱{cartTotal}</div>
              </div>
              <button onClick={()=>{setShowPlantModal(true);setOrderPlant(currentUser.plant||"KF-Main");}} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"11px 28px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Place Order
              </button>
            </div>
          </div>
        )}
      </div>
    );

    /* ── MY ORDERS ── */
    if(activeTab==="myorders") {
      const myOrders = orders.filter(o=>o.userId===currentUser.id);
      const filteredMyOrders = myOrders.filter(o=>
        o.id.toLowerCase().includes(myOrderSearch.toLowerCase()) ||
        o.items.some(it=>it.name.toLowerCase().includes(myOrderSearch.toLowerCase())) ||
        (o.date||"").includes(myOrderSearch)
      );
      return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
            <Icon name="orders" size={20} color={PURPLE} /> My Orders
          </h2>
          <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220}}>
            <Icon name="search" size={15} color="#9CA3AF" />
            <input value={myOrderSearch} onChange={e=>setMyOrderSearch(e.target.value)} placeholder="Search by order ID or item..."
              style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
            {myOrderSearch&&<button onClick={()=>setMyOrderSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
          </div>
        </div>
        {myOrders.length===0 ? (
          <Empty msg="No orders yet" sub="Place an order from the menu to see it here." />
        ) : filteredMyOrders.length===0 ? (
          <Empty msg="No orders match" sub="Try a different search term." />
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {filteredMyOrders.map(order=>(
              <div key={order.id} style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"16px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#111"}}>Order #{order.id}</div>
                    <div style={{fontSize:12,color:"#9CA3AF"}}>{order.date} · {order.time}</div>
                  </div>
                  {order.paymentType&&<span style={{background:order.paymentType==="Credit"?PURPLE_LIGHT:"#D1FAE5",color:order.paymentType==="Credit"?PURPLE:"#065F46",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{order.paymentType==="Credit"?"💳 Credit":"💵 Cash"}</span>}
                  {!order.paymentType&&<span style={{background:"#FEF3C7",color:"#92400E",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>⏳ Unpaid</span>}
                </div>
                {order.items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#374151",padding:"4px 0",alignItems:"flex-start"}}>
                    <div>
                      <span>{it.name} × {it.qty}</span>
                      {it.scheduledDate&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>📅 {it.scheduledDate}</span>}
                      {it.grams&&<div style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,color:"#9CA3AF",marginLeft:6}}>⚖️ {it.grams}g/serving</div>}
                    </div>
                    <span style={{fontWeight:600,flexShrink:0}}>₱{it.price*it.qty}</span>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #F3F4F6",marginTop:10,paddingTop:10,display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:15}}>
                  <span>Total</span><span style={{color:PURPLE}}>₱{order.total}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      );
    }

    /* ── MANAGE MENU (staff/admin) ── */
    if(activeTab==="mgmenu") {
      return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
            <Icon name="manage" size={20} color={PURPLE} /> Manage Weekly Menu {(role==="staff"||role==="staff-admin")&&<span style={{fontSize:13,fontWeight:500,color:PURPLE,background:PURPLE_LIGHT,padding:"2px 10px",borderRadius:20,marginLeft:6}}>📍 {currentUser.plant}</span>}
          </h2>
          <button onClick={()=>setShowAddItem(mgDay)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="plus" size={14} color="#fff" /> Add Item
          </button>
        </div>
        {/* day tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {DAYS.map(day=>(
            <button key={day} onClick={()=>setMgDay(day)}
              style={{padding:"7px 18px",borderRadius:50,border:"1px solid #E5E7EB",background:mgDay===day?PURPLE:"#fff",color:mgDay===day?"#fff":"#374151",fontWeight:mgDay===day?700:400,fontSize:13,cursor:"pointer",position:"relative"}}>
              {day.slice(0,3)}
              {day===TODAY&&<span style={{position:"absolute",top:-3,right:-3,width:7,height:7,background:"#EF4444",borderRadius:"50%"}} />}
            </button>
          ))}
        </div>
        {/* ── ADD ITEM MODAL ── */}
        {showAddItem===mgDay&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
              <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Menu Item</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>{mgDay} · {newItem.cat}</div>
                </div>
                <button onClick={()=>{setShowAddItem(null);setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null,grams:""});}}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
              <div style={{padding:"22px"}}>
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Item Photo</label>
                  <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
                    onDrop={e=>{e.preventDefault();setDragOver(false);handlePhotoFile(e.dataTransfer.files[0]);}}
                    onClick={()=>photoInputRef.current?.click()}
                    style={{border:`2px dashed ${dragOver?PURPLE:"#D1D5DB"}`,borderRadius:12,padding:"1.5rem",textAlign:"center",cursor:"pointer",background:dragOver?PURPLE_LIGHT:"#FAFAFA",transition:"all 0.15s",position:"relative",minHeight:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
                    {newItem.photo ? (
                      <><img src={newItem.photo} alt="preview" style={{maxHeight:130,maxWidth:"100%",borderRadius:10,objectFit:"cover"}} />
                        <button onClick={e=>{e.stopPropagation();setNewItem(p=>({...p,photo:null}));}} style={{position:"absolute",top:8,right:8,background:"#EF4444",border:"none",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                      </>
                    ) : (
                      <><div style={{width:48,height:48,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}><Icon name="products" size={22} color={PURPLE} /></div>
                        <div style={{fontSize:13,fontWeight:600,color:"#374151"}}>Drop photo here or click to browse</div>
                        <div style={{fontSize:12,color:"#9CA3AF"}}>JPG, PNG, WEBP supported</div>
                        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:"#9CA3AF"}}>or use emoji:</span>
                          <input value={newItem.img} onChange={e=>setNewItem(p=>({...p,img:e.target.value}))} onClick={e=>e.stopPropagation()} style={{width:56,fontSize:20,borderRadius:8,border:"1px solid #E5E7EB",padding:"4px 6px",textAlign:"center",background:"#fff"}} />
                        </div>
                      </>
                    )}
                    <input ref={photoInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handlePhotoFile(e.target.files[0])} />
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Item Name</label>
                    <input value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Adobo with Rice"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Category</label>
                    <select value={newItem.cat} onChange={e=>setNewItem(p=>({...p,cat:e.target.value}))} style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
                      {["BREAKFAST","LUNCH","SNACK"].map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Price (₱)</label>
                    <input value={newItem.price} onChange={e=>setNewItem(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Grams per Serving <span style={{fontWeight:400,color:"#9CA3AF"}}>(optional)</span></label>
                    <div style={{position:"relative"}}>
                      <input value={newItem.grams} onChange={e=>setNewItem(p=>({...p,grams:e.target.value}))} placeholder="e.g. 250" type="number" min="0"
                        style={{width:"100%",fontSize:14,padding:"10px 40px 10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                      <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#9CA3AF",fontWeight:600}}>g</span>
                    </div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>This will be shown to customers on the menu card</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button onClick={()=>{setShowAddItem(null);setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null,grams:""});}}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                  <button onClick={()=>addMenuItem(mgDay)} disabled={!newItem.name||!newItem.price}
                    style={{flex:2,background:newItem.name&&newItem.price?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:newItem.name&&newItem.price?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <Icon name="plus" size={15} color="#fff" /> Add to {mgDay}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(menu[mgDay]||[]).map(item=>(
            <div key={item.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 16px",display:"flex",alignItems:"center",gap:12,opacity:item.available?1:0.6}}>
              <div style={{width:52,height:52,borderRadius:10,background:PURPLE_LIGHT,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {item.isPhoto&&item.img ? <img src={item.img} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{fontSize:26}}>{item.img}</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
                <div style={{fontSize:12,color:"#6B7280"}}>{item.cat} · ₱{item.price}{item.grams?` · ⚖️ ${item.grams}g/serving`:""}</div>
              </div>
              <span style={{fontSize:11,background:item.available?"#D1FAE5":"#FEE2E2",color:item.available?"#065F46":"#991B1B",padding:"3px 10px",borderRadius:20,fontWeight:600}}>
                {item.available?"Available":"Unavailable"}
              </span>
              <button onClick={()=>toggleAvail(mgDay,item.id)} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,color:"#374151",fontWeight:500}}>Toggle</button>
              {(role==="admin"||role==="staff-admin")&&<button onClick={()=>removeMenuItem(mgDay,item.id)} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500}}>
                <Icon name="trash" size={13} color="#991B1B" /> Remove
              </button>}
            </div>
          ))}
          {(menu[mgDay]||[]).length===0&&<Empty msg={`No items for ${mgDay}`} sub="Click '+ Add Item' to add one." />}
        </div>
      </div>
      );
    }

    /* ── MANAGE ORDERS (staff/admin) ── */
    if(activeTab==="mgorders") {
      const filteredOrders = orders.filter(o=>{
        const plantMatch = (role==="staff") ? (o.plant===currentUser.plant) : true;
        const searchMatch = o.id.toLowerCase().includes(orderSearch.toLowerCase()) ||
          o.user.toLowerCase().includes(orderSearch.toLowerCase());
        return plantMatch && searchMatch;
      });
      return (
        <div>
          {/* payment modal */}
          {/* Plant selection modal */}
      {/* payment modal */}
      {paymentModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Select Payment Type</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>{paymentModal.userName} · {paymentModal.orderId}</div>
                  </div>
                  <button onClick={()=>setPaymentModal(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:"24px 22px"}}>
                  <div style={{background:"#F9FAFB",borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,color:"#6B7280"}}>Order Total</span>
                    <span style={{fontSize:20,fontWeight:800,color:PURPLE}}>₱{paymentModal.orderTotal}</span>
                  </div>
                  {/* show credit balance if available */}
                  {(()=>{const u=users.find(uu=>uu.name===paymentModal.userName); return u?(
                    <div style={{background:u.creditBalance<paymentModal.orderTotal?"#FEF3C7":"#F0FDF4",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:u.creditBalance<paymentModal.orderTotal?"#92400E":"#065F46",display:"flex",justifyContent:"space-between"}}>
                      <span>💳 Credit Balance</span>
                      <span style={{fontWeight:700}}>₱{u.creditBalance?.toLocaleString()}</span>
                    </div>
                  ):null;})()}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <button onClick={()=>confirmPayment(paymentModal.orderId,"Cash")}
                      style={{background:"#F0FDF4",color:"#065F46",border:"2px solid #A7F3D0",borderRadius:12,padding:"18px 12px",cursor:"pointer",fontWeight:700,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <span style={{fontSize:28}}>💵</span>
                      <span>Cash</span>
                      <span style={{fontSize:11,fontWeight:400,color:"#6B7280"}}>No credit deduction</span>
                    </button>
                    <button
                      onClick={()=>{
                        const u=users.find(uu=>uu.name===paymentModal.userName);
                        if(u&&u.creditBalance<paymentModal.orderTotal){alert(`Insufficient credit! Balance: ₱${u.creditBalance}`);return;}
                        confirmPayment(paymentModal.orderId,"Credit");
                      }}
                      style={{background:PURPLE_LIGHT,color:PURPLE,border:`2px solid ${PURPLE}44`,borderRadius:12,padding:"18px 12px",cursor:"pointer",fontWeight:700,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <span style={{fontSize:28}}>💳</span>
                      <span>Credit</span>
                      <span style={{fontSize:11,fontWeight:400,color:"#6B7280"}}>Deducts from balance</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
      )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="manage" size={20} color={PURPLE} /> Manage Orders {(role==="staff"||role==="staff-admin")&&<span style={{fontSize:13,fontWeight:500,color:PURPLE,background:PURPLE_LIGHT,padding:"2px 10px",borderRadius:20,marginLeft:6}}>📍 {currentUser.plant}</span>}
            </h2>
            {/* search bar */}
            <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220}}>
              <Icon name="search" size={15} color="#9CA3AF" />
              <input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} placeholder="Search by name or order ID..."
                style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
            </div>
          </div>

          {/* order count summary - plant filtered for staff */}
          {(()=>{
            var sO = (role==="staff"||role==="staff-admin") ? orders.filter(o=>o.plant===currentUser.plant) : orders;
            return <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:20,fontWeight:800,color:PURPLE}}>{sO.length}</span>
                <span style={{fontSize:11,color:"#6B7280",fontWeight:600}}>Total Orders</span>
              </div>
              <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:20,fontWeight:800,color:"#059669"}}>{sO.filter(o=>o.paymentType==="Cash").length}</span>
                <span style={{fontSize:11,color:"#6B7280",fontWeight:600}}>💵 Cash</span>
              </div>
              <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:20,fontWeight:800,color:PURPLE}}>{sO.filter(o=>o.paymentType==="Credit").length}</span>
                <span style={{fontSize:11,color:"#6B7280",fontWeight:600}}>💳 Credit</span>
              </div>
              <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:20,fontWeight:800,color:"#9CA3AF"}}>{sO.filter(o=>!o.paymentType).length}</span>
                <span style={{fontSize:11,color:"#6B7280",fontWeight:600}}>Unpaid</span>
              </div>
            </div>;
          })()}

          {/* Plant filter for staff-admin */}
          {role==="staff-admin"&&(
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
              {["All",...PLANTS].map(p=>(
                <button key={p} onClick={()=>setOrderSearch(p==="All"?"":p)}
                  style={{padding:"5px 14px",borderRadius:20,border:"1px solid #E5E7EB",background:orderSearch===p||(p==="All"&&!orderSearch)?PURPLE:"#fff",color:orderSearch===p||(p==="All"&&!orderSearch)?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                  {p}
                </button>
              ))}
            </div>
          )}
          {role==="staff"&&(
            <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:PURPLE,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
              📍 Showing orders for <strong>{currentUser.plant}</strong> only
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {filteredOrders.length===0&&<Empty msg="No orders found" sub="Try a different name or order ID." />}
            {filteredOrders.map(order=>(
              <div key={order.id} style={{background:"#fff",borderRadius:14,border:`1px solid ${order.paymentType?"#D1FAE5":"#E5E7EB"}`,padding:"16px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{order.user}</div>
                    <div style={{fontSize:12,color:"#9CA3AF",display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                      <span>#{order.id} · {order.time}</span>
                      {order.plant&&<span style={{background:PURPLE_LIGHT,color:PURPLE,fontWeight:600,fontSize:11,padding:"1px 7px",borderRadius:8}}>{order.plant}</span>}
                    </div>
                  </div>
                  {order.paymentType
                    ? <span style={{background:order.paymentType==="Credit"?PURPLE_LIGHT:"#D1FAE5",color:order.paymentType==="Credit"?PURPLE:"#065F46",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>
                        {order.paymentType==="Credit"?"💳 Credit":"💵 Cash"}
                      </span>
                    : <span style={{background:"#FEF3C7",color:"#92400E",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>⏳ Unpaid</span>
                  }
                </div>
                {order.items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#374151",padding:"3px 0",alignItems:"flex-start"}}>
                    <div>
                      <span>{it.name} × {it.qty}</span>
                      {it.scheduledDate&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>📅 {it.scheduledDate}</span>}
                      {it.grams&&<span style={{fontSize:11,color:"#9CA3AF",marginLeft:6}}>⚖️ {it.grams}g/serving</span>}
                    </div>
                    <span style={{fontWeight:600,flexShrink:0}}>₱{it.price*it.qty}</span>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #F3F4F6",marginTop:10,paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:15,color:PURPLE}}>₱{order.total}</span>
                  {!order.paymentType
                    ? <button onClick={()=>setPaymentModal({orderId:order.id,orderTotal:order.total,userName:order.user,userId:order.userId})}
                        style={{background:PURPLE,color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                        💰 Collect Payment
                      </button>
                    : <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#6B7280"}}>
                        <span>✅ Paid via</span>
                        <span style={{fontWeight:700,color:order.paymentType==="Credit"?PURPLE:"#059669"}}>{order.paymentType==="Credit"?"💳 Credit":"💵 Cash"}</span>
                      </div>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ── MANAGE PRODUCTS (admin) ── */
    if(activeTab==="mgproducts") {
      const prodCats = ["All",...new Set(otherProducts.map(p=>p.category))];
      const displayed = otherProducts
        .filter(p=>filterCat==="All"||p.category===filterCat)
        .filter(p=>p.name.toLowerCase().includes(productSearch.toLowerCase())||p.category.toLowerCase().includes(productSearch.toLowerCase()));
      return (
        <div>
          {/* stock add modal */}
          {stockModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Stock</div>
                  <button onClick={()=>{setStockModal(null);setStockAddVal("");}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:"24px 22px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,background:"#F9FAFB",borderRadius:10,padding:"12px 16px",marginBottom:20}}>
                    <span style={{fontSize:32}}>{stockModal.emoji}</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{stockModal.name}</div>
                      <div style={{fontSize:12,color:"#6B7280"}}>Current stock: <strong style={{color:stockModal.stock<=5?"#EF4444":PURPLE}}>{stockModal.stock}</strong></div>
                    </div>
                  </div>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>How many units to add?</label>
                  <input
                    value={stockAddVal}
                    onChange={e=>setStockAddVal(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&stockAddVal){updateOtherStock(stockModal.id,parseInt(stockAddVal)||0);setStockModal(null);setStockAddVal("");}}}
                    type="number" min="1" placeholder="e.g. 10" autoFocus
                    style={{width:"100%",fontSize:18,fontWeight:700,padding:"12px 14px",borderRadius:9,border:`1.5px solid ${PURPLE}`,background:"#fff",color:"#111",boxSizing:"border-box",outline:"none",textAlign:"center"}}
                  />
                  {stockAddVal&&parseInt(stockAddVal)>0&&(
                    <div style={{marginTop:10,background:PURPLE_LIGHT,borderRadius:8,padding:"8px 12px",textAlign:"center",fontSize:13,color:PURPLE,fontWeight:600}}>
                      New stock will be: {stockModal.stock + (parseInt(stockAddVal)||0)} units
                    </div>
                  )}
                  <div style={{display:"flex",gap:10,marginTop:16}}>
                    <button onClick={()=>{setStockModal(null);setStockAddVal("");}} style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button onClick={()=>{
                      if(!stockAddVal||parseInt(stockAddVal)<=0) return;
                      const qty = parseInt(stockAddVal)||0;
                      const before = stockModal.stock;
                      const after = before + qty;
                      updateOtherStock(stockModal.id, qty);
                      setInventoryLog(prev=>[{
                        id:"il"+Date.now(), product:stockModal.name, emoji:stockModal.emoji,
                        type:"IN", qty, before, after,
                        by:currentUser.name,
                        time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
                      },...prev]);
                      setStockModal(null);setStockAddVal("");
                    }} disabled={!stockAddVal||parseInt(stockAddVal)<=0}
                      style={{flex:2,background:stockAddVal&&parseInt(stockAddVal)>0?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:stockAddVal&&parseInt(stockAddVal)>0?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                      + Add Stock
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="products" size={20} color={PURPLE} /> Manage Other Products
            </h2>
            <button onClick={()=>setShowAddProduct(true)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              <Icon name="plus" size={14} color="#fff" /> Add Product
            </button>
          </div>

          {/* search + category filter row */}
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",flex:1,minWidth:200}}>
              <Icon name="search" size={15} color="#9CA3AF" />
              <input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Search products..."
                style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
              {productSearch&&<button onClick={()=>setProductSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {prodCats.map(c=>(
                <button key={c} onClick={()=>setFilterCat(c)}
                  style={{padding:"6px 14px",borderRadius:50,border:"1px solid #E5E7EB",background:filterCat===c?PURPLE:"#fff",color:filterCat===c?"#fff":"#6B7280",fontSize:12,fontWeight:filterCat===c?700:400,cursor:"pointer"}}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* summary stats */}
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            {[
              {label:"Total Products", value:otherProducts.length,                                    color:PURPLE},
              {label:"Available",      value:otherProducts.filter(p=>p.available&&p.stock>0).length,  color:"#10B981"},
              {label:"Low Stock (≤5)", value:otherProducts.filter(p=>p.stock<=5&&p.stock>0).length,   color:"#F59E0B"},
              {label:"Out of Stock",   value:otherProducts.filter(p=>p.stock<=0).length,              color:"#EF4444"},
            ].map(s=>(
              <div key={s.label} style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:110}}>
                <span style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</span>
                <span style={{fontSize:11,color:"#6B7280",fontWeight:600,textAlign:"center"}}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* product rows */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {displayed.map(p=>{
              const oos = p.stock<=0;
              return (
                <div key={p.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 16px",display:"flex",alignItems:"center",gap:12,opacity:oos?0.7:1}}>
                  <div style={{width:52,height:52,borderRadius:10,background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{p.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{p.name}</div>
                    <div style={{fontSize:12,color:"#6B7280",display:"flex",gap:8,flexWrap:"wrap",marginTop:2}}>
                      <span>{p.category}</span>
                      <span style={{color:"#EF4444"}}>Buy: ₱{p.buyPrice||0}</span>
                      <span style={{color:"#059669"}}>Sell: ₱{p.price}</span>
                      <span style={{color:PURPLE,fontWeight:600}}>+₱{(p.price-(p.buyPrice||0)).toFixed(0)} profit</span>
                    </div>
                  </div>
                  {/* stock badge */}
                  <div style={{textAlign:"center",minWidth:60}}>
                    <div style={{fontSize:16,fontWeight:800,color:oos?"#EF4444":p.stock<=5?"#F59E0B":"#111"}}>{p.stock}</div>
                    <div style={{fontSize:10,color:"#9CA3AF"}}>in stock</div>
                  </div>
                  {/* add stock button */}
                  <button onClick={()=>{setStockModal({id:p.id,name:p.name,emoji:p.emoji,stock:p.stock});setStockAddVal("");}}
                    style={{background:PURPLE_LIGHT,color:PURPLE,border:`1px solid ${PURPLE}44`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                    <Icon name="plus" size={12} color={PURPLE} /> Add Stock
                  </button>
                  <span style={{fontSize:11,background:oos?"#FEE2E2":p.available?"#D1FAE5":"#FEE2E2",color:oos?"#991B1B":p.available?"#065F46":"#991B1B",padding:"3px 10px",borderRadius:20,fontWeight:600,whiteSpace:"nowrap"}}>
                    {oos?"Out of Stock":p.available?"Available":"Unavailable"}
                  </span>
                  {!oos&&<button onClick={()=>toggleOtherAvail(p.id)} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,color:"#374151",fontWeight:500,whiteSpace:"nowrap"}}>Toggle</button>}
                  <button onClick={()=>removeOtherProduct(p.id)} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500,flexShrink:0}}>
                    <Icon name="trash" size={13} color="#991B1B" /> Remove
                  </button>
                </div>
              );
            })}
            {displayed.length===0&&<Empty msg="No products found" sub="Try a different search or category." />}
          </div>

          {/* ADD PRODUCT MODAL */}
          {showAddProduct&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:460,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Other Product</div>
                  <button onClick={()=>{setShowAddProduct(false);setNewProduct({name:"",price:"",emoji:"🛍️",category:"Others",stock:""}); }}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:"22px",display:"flex",flexDirection:"column",gap:14}}>
                  {/* emoji + name row */}
                  <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Emoji</label>
                      <input value={newProduct.emoji} onChange={e=>setNewProduct(p=>({...p,emoji:e.target.value}))}
                        style={{width:56,fontSize:24,borderRadius:9,border:"1.5px solid #E5E7EB",padding:"8px 6px",textAlign:"center",background:"#FAFAFA"}} />
                    </div>
                    <div style={{flex:1}}>
                      <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Product Name</label>
                      <input value={newProduct.name} onChange={e=>setNewProduct(p=>({...p,name:e.target.value}))} placeholder="e.g. Nova Chips"
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Category</label>
                      <select value={newProduct.category} onChange={e=>setNewProduct(p=>({...p,category:e.target.value}))}
                        style={{width:"100%",fontSize:13,padding:"10px 8px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
                        {["Chips","Biscuit","Instant Noodles","Instant Coffee","Powdered Drinks","Soft Drinks","Others"].map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,color:"#EF4444",display:"block",marginBottom:6}}>Buying Price (₱)</label>
                      <input value={newProduct.buyPrice} onChange={e=>setNewProduct(p=>({...p,buyPrice:e.target.value}))} placeholder="0.00" type="number" min="0"
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #FECACA",background:"#FFF5F5",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,color:"#059669",display:"block",marginBottom:6}}>Selling Price (₱)</label>
                      <input value={newProduct.price} onChange={e=>setNewProduct(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0"
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #A7F3D0",background:"#F0FDF4",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    </div>
                  </div>
                  {/* profit preview */}
                  {newProduct.buyPrice&&newProduct.price&&(
                    <div style={{background:PURPLE_LIGHT,borderRadius:9,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,color:PURPLE,fontWeight:600}}>Profit per item:</span>
                      <span style={{fontSize:15,color:PURPLE,fontWeight:800}}>₱{(parseFloat(newProduct.price||0)-parseFloat(newProduct.buyPrice||0)).toFixed(2)}</span>
                    </div>
                  )}
                  <div>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Initial Stock</label>
                    <input value={newProduct.stock} onChange={e=>setNewProduct(p=>({...p,stock:e.target.value}))} placeholder="0" type="number" min="0"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:4}}>
                    <button onClick={()=>{setShowAddProduct(false);setNewProduct({name:"",price:"",emoji:"🛍️",category:"Others",stock:""}); }}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button onClick={addOtherProduct} disabled={!newProduct.name||!newProduct.price||!newProduct.stock}
                      style={{flex:2,background:newProduct.name&&newProduct.price&&newProduct.stock?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:newProduct.name&&newProduct.price&&newProduct.stock?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <Icon name="plus" size={15} color="#fff" /> Add Product
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── PERSONNEL (admin) ── */
    if(activeTab==="personnel") {
      const unregistered = users.filter(u=>!u.registered);
      const registered = users.filter(u=>u.registered);
      const searchTerm = personnelSearch==="unregistered" ? "" : personnelSearch;
      const filteredUsers = (personnelSearch==="unregistered"?unregistered:registered).filter(u=>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.plant||"").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.idNumber||"").toLowerCase().includes(searchTerm.toLowerCase())
      );
      return (
        <div>
          {/* Add Employee Modal - Bulk Entry */}
          {showAddEmployeeModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:620,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden",display:"flex",flexDirection:"column",maxHeight:"90vh"}}>
                {/* Header */}
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Employees</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>Fill in each row — click "+ Add Another" to add more</div>
                  </div>
                  <button onClick={()=>{setShowAddEmployeeModal(false);setNewEmployee({name:"",plant:"KF-Main",idNumber:"",rows:[{id:Date.now(),idNumber:"",name:"",plant:"KF-Main"}]});}}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>

                {/* Scrollable rows */}
                <div style={{overflowY:"auto",flex:1,padding:"16px 22px"}}>
                  {/* Column headers */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1.4fr 32px",gap:8,marginBottom:8}}>
                    {["ID Number","Full Name","Plant",""].map(h=>(
                      <div key={h} style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.4px"}}>{h}</div>
                    ))}
                  </div>

                  {(newEmployee.rows||[{id:1,idNumber:"",name:"",plant:"KF-Main"}]).map((row,idx)=>(
                    <div key={row.id} style={{display:"grid",gridTemplateColumns:"1fr 2fr 1.4fr 32px",gap:8,marginBottom:10,alignItems:"center"}}>
                      {/* ID Number */}
                      <input value={row.idNumber}
                        onChange={e=>{const v=e.target.value.toUpperCase(); setNewEmployee(p=>({...p,rows:p.rows.map(r=>r.id===row.id?{...r,idNumber:v}:r)}));}}
                        placeholder="e.g. KF2301005"
                        style={{padding:"9px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",width:"100%",boxSizing:"border-box"}} />
                      {/* Full Name */}
                      <input value={row.name}
                        onChange={e=>{const v=e.target.value; setNewEmployee(p=>({...p,rows:p.rows.map(r=>r.id===row.id?{...r,name:v}:r)}));}}
                        onBlur={e=>{const v=toProperCase(e.target.value); setNewEmployee(p=>({...p,rows:p.rows.map(r=>r.id===row.id?{...r,name:v}:r)}));}}
                        placeholder="e.g. Juan dela Cruz"
                        style={{padding:"9px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",width:"100%",boxSizing:"border-box"}} />
                      {/* Plant selector */}
                      <select value={row.plant}
                        onChange={e=>{const v=e.target.value; setNewEmployee(p=>({...p,rows:p.rows.map(r=>r.id===row.id?{...r,plant:v}:r)}));}}
                        style={{padding:"9px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",background:"#fff",cursor:"pointer"}}>
                        {PLANTS.map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                      {/* Remove row */}
                      <button onClick={()=>setNewEmployee(p=>({...p,rows:p.rows.filter(r=>r.id!==row.id)}))}
                        disabled={(newEmployee.rows||[]).length<=1}
                        style={{width:32,height:32,borderRadius:8,border:"none",background:(newEmployee.rows||[]).length<=1?"#F3F4F6":"#FEE2E2",color:(newEmployee.rows||[]).length<=1?"#D1D5DB":"#EF4444",cursor:(newEmployee.rows||[]).length<=1?"not-allowed":"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Add another row */}
                  <button onClick={()=>setNewEmployee(p=>({...p,rows:[...(p.rows||[]),{id:Date.now(),idNumber:"",name:"",plant:"KF-Main"}]}))}
                    style={{width:"100%",padding:"10px",border:"1.5px dashed #D1D5DB",borderRadius:9,background:"#F9FAFB",color:"#6B7280",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:4}}>
                    <Icon name="plus" size={14} color="#6B7280" /> Add Another
                  </button>
                </div>

                {/* Footer */}
                <div style={{padding:"16px 22px",borderTop:"1px solid #E5E7EB",flexShrink:0}}>
                  {/* Summary */}
                  {(newEmployee.rows||[]).filter(r=>r.name.trim()).length>0&&(
                    <div style={{background:PURPLE_LIGHT,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:PURPLE,display:"flex",justifyContent:"space-between"}}>
                      <span>✅ <strong>{(newEmployee.rows||[]).filter(r=>r.name.trim()).length}</strong> employee{(newEmployee.rows||[]).filter(r=>r.name.trim()).length>1?"s":""} ready to add</span>
                      {(newEmployee.rows||[]).filter(r=>!r.name.trim()).length>0&&<span style={{color:"#F59E0B"}}>⚠️ {(newEmployee.rows||[]).filter(r=>!r.name.trim()).length} empty row{(newEmployee.rows||[]).filter(r=>!r.name.trim()).length>1?"s":""} will be skipped</span>}
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>{setShowAddEmployeeModal(false);setNewEmployee({name:"",plant:"KF-Main",idNumber:"",rows:[{id:Date.now(),idNumber:"",name:"",plant:"KF-Main"}]});}}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button onClick={()=>{
                      var validRows = (newEmployee.rows||[]).filter(r=>r.name.trim());
                      if(!validRows.length) return;
                      var newUsers = validRows.map(r=>{
                        var name=toProperCase(r.name);
                        var initials=name.split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2);
                        return {id:"u"+Date.now()+Math.random(),username:"",password:"",role:"user",name,avatar:initials,plant:r.plant,idNumber:r.idNumber.trim(),phone:"",creditLimit:1000,creditBalance:1000,registered:false};
                      });
                      setUsers(prev=>[...prev,...newUsers]);
                      setShowAddEmployeeModal(false);
                      setNewEmployee({name:"",plant:"KF-Main",idNumber:"",rows:[{id:Date.now(),idNumber:"",name:"",plant:"KF-Main"}]});
                    }} disabled={!(newEmployee.rows||[]).some(r=>r.name.trim())}
                      style={{flex:2,background:(newEmployee.rows||[]).some(r=>r.name.trim())?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:(newEmployee.rows||[]).some(r=>r.name.trim())?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                      Save All Employees
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="people" size={20} color={PURPLE} /> Personnel
            </h2>
            <div style={{display:"flex",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220}}>
                <Icon name="search" size={15} color="#9CA3AF" />
                <input value={personnelSearch==="unregistered"?"":personnelSearch} onChange={e=>setPersonnelSearch(e.target.value)} placeholder="Search name, plant..."
                  style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
                {personnelSearch&&<button onClick={()=>setPersonnelSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
              </div>
              <button onClick={()=>setShowAddEmployeeModal(true)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                <Icon name="plus" size={14} color="#fff" /> Add Employee
              </button>
            </div>
          </div>

          {/* Tab pills */}
          <div style={{display:"flex",gap:4,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:4,marginBottom:16,width:"fit-content"}}>
            <button onClick={()=>setPersonnelSearch("")} style={{padding:"7px 16px",borderRadius:7,border:"none",background:personnelSearch!=="unregistered"?PURPLE:"transparent",color:personnelSearch!=="unregistered"?"#fff":"#6B7280",fontWeight:personnelSearch!=="unregistered"?700:400,fontSize:13,cursor:"pointer"}}>
              Registered ({registered.length})
            </button>
            <button onClick={()=>setPersonnelSearch("unregistered")} style={{padding:"7px 16px",borderRadius:7,border:"none",background:personnelSearch==="unregistered"?"#EF4444":"transparent",color:personnelSearch==="unregistered"?"#fff":"#6B7280",fontWeight:personnelSearch==="unregistered"?700:400,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              Unregistered ({unregistered.length})
              {unregistered.length>0&&<span style={{background:"#EF4444",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{unregistered.length}</span>}
            </button>
          </div>

          {/* Unregistered employees notice */}
          {personnelSearch==="unregistered"&&unregistered.length>0&&(
            <div style={{background:"#FEF3C7",borderRadius:10,border:"1px solid #FCD34D",padding:"12px 16px",marginBottom:16,fontSize:13,color:"#92400E",display:"flex",alignItems:"center",gap:10}}>
              ⚠️ These employees have been added but haven't registered yet. Ask them to register using their name.
            </div>
          )}

          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#F9FAFB"}}>
                  {personnelSearch==="unregistered"
                    ? ["ID No.","Name","Plant","Status","Action"].map(h=>(<th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>))
                    : ["ID No.","Name","Plant","Phone","Username","Role","Credit Limit","Balance","Actions"].map(h=>(<th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>))
                  }
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length===0&&<tr><td colSpan={8} style={{padding:"2rem",textAlign:"center",color:"#9CA3AF"}}>No personnel found.</td></tr>}
                {personnelSearch==="unregistered" ? filteredUsers.map(u=>(
                  <tr key={u.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12,fontWeight:600}}>{u.idNumber||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#EF4444",flexShrink:0}}>{u.avatar}</div>
                        <span style={{fontWeight:600,color:"#111",fontSize:13}}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{padding:"12px 14px"}}><span style={{background:PURPLE_LIGHT,color:PURPLE,fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>{u.plant||"—"}</span></td>
                    <td style={{padding:"12px 14px"}}><span style={{background:"#FEE2E2",color:"#991B1B",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>Pending Registration</span></td>
                    <td style={{padding:"12px 14px"}}>
                      <button onClick={()=>setUsers(prev=>prev.filter(uu=>uu.id!==u.id))} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500}}>
                        <Icon name="trash" size={13} color="#991B1B" /> Remove
                      </button>
                    </td>
                  </tr>
                )) : filteredUsers.map(u=>(
                  <tr key={u.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{u.idNumber||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:PURPLE,flexShrink:0}}>{u.avatar}</div>
                        <span style={{fontWeight:600,color:"#111",fontSize:13}}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{padding:"12px 14px"}}><span style={{background:PURPLE_LIGHT,color:PURPLE,fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>{u.plant||"—"}</span></td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{u.phone||"—"}</td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12}}>{u.username||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      {editRoleId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select defaultValue={u.role} onChange={e=>{ setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,role:e.target.value}:uu)); setEditRoleId(null); }}
                            style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none",cursor:"pointer"}}>
                            <option value="user">Customer</option>
                            <option value="staff">Staff</option>
                            <option value="staff-admin">Staff-Admin</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button onClick={()=>setEditRoleId(null)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{background:u.role==="admin"?PURPLE_LIGHT:u.role==="staff"?"#E0F2FE":"#D1FAE5",color:u.role==="admin"?PURPLE:u.role==="staff"?"#0369A1":"#065F46",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>
                            {u.role==="user"?"Customer":u.role==="staff-admin"?"Staff-Admin":u.role==="staff"?"Staff":"Admin"}
                          </span>
                          <button onClick={()=>setEditRoleId(u.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:2}}>
                            <Icon name="edit" size={12} color="#9CA3AF" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      {editCreditId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <input value={editCreditVal} onChange={e=>setEditCreditVal(e.target.value)} type="number" min="0"
                            style={{width:75,fontSize:13,padding:"4px 7px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none"}} />
                          <button onClick={()=>{setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,creditLimit:parseFloat(editCreditVal)||uu.creditLimit}:uu));setEditCreditId(null);}}
                            style={{background:PURPLE,color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>Save</button>
                          <button onClick={()=>setEditCreditId(null)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 7px",cursor:"pointer",fontSize:11}}>✕</button>
                        </div>
                      ) : (
                        <span style={{fontWeight:600,color:"#374151"}}>₱{(u.creditLimit||0).toLocaleString()}</span>
                      )}
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      <span style={{fontWeight:700,color:u.creditBalance<100?"#EF4444":u.creditBalance<500?"#F59E0B":"#059669"}}>
                        ₱{(u.creditBalance||0).toLocaleString()}
                      </span>
                      {u.creditBalance<100&&<span style={{display:"block",fontSize:10,color:"#EF4444",fontWeight:600}}>⚠️ Low</span>}
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        <button onClick={()=>{setEditCreditId(u.id);setEditCreditVal(String(u.creditLimit||0));}}
                          style={{background:PURPLE_LIGHT,color:PURPLE,border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                          Set Limit
                        </button>
                        <button onClick={()=>setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,creditBalance:uu.creditLimit}:uu))}
                          style={{background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                          Reset
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,background:"#F0FDF4",borderRadius:10,border:"1px solid #A7F3D0",padding:"10px 14px",fontSize:12,color:"#065F46"}}>
            💡 Credit balances auto-reset to each user's limit on the <strong>15th</strong> and <strong>last day</strong> of every month.
          </div>
        </div>
      );
    }
    if(activeTab==="history") {
      // ── inventory calculations (other products only) ──
      const outLogs = inventoryLog.filter(l=>l.type==="OUT");
      const inLogs  = inventoryLog.filter(l=>l.type==="IN");
      const totalStockIn  = inLogs.reduce((s,l)=>s+l.qty,0);
      const totalStockOut = outLogs.reduce((s,l)=>s+l.qty,0);

      // actual sales revenue from sold other products
      const actualRevenue = orders.reduce((s,o)=>
        s+o.items.filter(it=>otherProducts.find(p=>p.name===it.name)).reduce((ss,it)=>ss+it.price*it.qty,0),0);
      // actual expense = units sold × buy price
      const actualExpense = orders.reduce((s,o)=>
        s+o.items.filter(it=>it.buyPrice!=null&&it.buyPrice>0).reduce((ss,it)=>ss+(it.buyPrice||0)*it.qty,0),0);
      // actual profit = what was sold - what it cost
      const actualProfit = actualRevenue - actualExpense;
      // projected revenue = current stock × sell price
      const projectedRevenue = otherProducts.reduce((s,p)=>s+p.stock*p.price,0);
      // projected expense = current stock × buy price
      const projectedExpense = otherProducts.reduce((s,p)=>s+p.stock*(p.buyPrice||0),0);
      // projected profit = if all current stock is sold
      const projectedProfit = projectedRevenue - projectedExpense;

      return (
        <div>
          <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 16px",display:"flex",alignItems:"center",gap:10}}>
            <Icon name="history" size={20} color={PURPLE} /> Overall History
          </h2>
          <div style={{display:"flex",gap:4,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:4,marginBottom:20,width:"fit-content"}}>
            {[{id:"orders",label:"📋 Orders"},...((role==="admin"||role==="staff-admin")?[{id:"inventory",label:"📦 Inventory"}]:[])].map(t=>(
              <button key={t.id} onClick={()=>setHistoryTab(t.id)}
                style={{padding:"8px 20px",borderRadius:8,border:"none",background:historyTab===t.id?PURPLE:"transparent",color:historyTab===t.id?"#fff":"#6B7280",fontWeight:historyTab===t.id?700:400,fontSize:13,cursor:"pointer"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── ORDERS TAB ── */}
          {historyTab==="orders"&&(()=>{
            const selDateStr = salesDate.toISOString().slice(0,10);
            const dayOrders = orders.filter(o=>o.date===selDateStr);
            const cashOrders   = dayOrders.filter(o=>o.paymentType==="Cash");
            const creditOrders = dayOrders.filter(o=>o.paymentType==="Credit");
            const cashTotal    = cashOrders.reduce((s,o)=>s+o.total,0);
            const creditTotal  = creditOrders.reduce((s,o)=>s+o.total,0);
            const dayTotal     = dayOrders.reduce((s,o)=>s+o.total,0);
            const firstDay = new Date(scYear,scMonth,1).getDay();
            const daysInMonth = new Date(scYear,scMonth+1,0).getDate();
            const daysInPrev = new Date(scYear,scMonth,0).getDate();
            const monthLabel = new Date(scYear,scMonth).toLocaleDateString("en-PH",{month:"long",year:"numeric"});
            const cells=[];
            for(let i=0;i<firstDay;i++) cells.push({day:daysInPrev-firstDay+1+i,type:"prev"});
            for(let d=1;d<=daysInMonth;d++) cells.push({day:d,type:"curr"});
            const rem=42-cells.length; for(let i=1;i<=rem;i++) cells.push({day:i,type:"next"});
            const weeks=[]; for(let w=0;w<cells.length/7;w++) weeks.push(cells.slice(w*7,(w+1)*7));

            // which dates have orders (for dots)
            const datesWithOrders = new Set(orders.map(o=>o.date));

            return (
              <div>
                {/* date picker trigger */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"8px 14px"}}>
                    <span style={{fontSize:14}}>📅</span>
                    <span style={{fontWeight:600,fontSize:14,color:"#374151"}}>{salesDate.toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"})}</span>
                    {isSameDay(salesDate,TODAY_DATE)&&<span style={{fontSize:11,background:"#D1FAE5",color:"#065F46",padding:"2px 8px",borderRadius:10,fontWeight:600}}>Today</span>}
                  </div>
                  <button onClick={()=>{setShowSalesCalendar(p=>!p);setShowDownloadMenu(false);}}
                    style={{display:"flex",alignItems:"center",gap:6,background:showSalesCalendar?PURPLE:"#fff",color:showSalesCalendar?"#fff":PURPLE,border:"1.5px solid "+PURPLE,borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>
                    🗓️ {showSalesCalendar?"Close":"Select Date"}
                  </button>
                  {/* Download Excel button */}
                  {dayOrders.length>0&&(
                    <div style={{position:"relative",marginLeft:"auto"}}>
                      <button onClick={()=>setShowDownloadMenu(p=>!p)}
                        style={{display:"flex",alignItems:"center",gap:6,background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>
                        📥 Download Excel
                      </button>
                      {showDownloadMenu&&(
                        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:100,minWidth:200,overflow:"hidden"}}>
                          <div style={{padding:"8px 12px",fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.5px",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
                            Download Options
                          </div>
                          {[
                            {label:"All Transactions",    icon:"📊", filter:"all"},
                            {label:"Cash Only",           icon:"💵", filter:"Cash"},
                            {label:"Credit Only",         icon:"💳", filter:"Credit"},
                          ].map(opt=>(
                            <button key={opt.filter} onClick={()=>{
                              var rows = opt.filter==="all" ? dayOrders : dayOrders.filter(o=>o.paymentType===opt.filter);
                              downloadOrdersExcel(rows, salesDate, opt.filter);
                              setShowDownloadMenu(false);
                            }} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#374151",textAlign:"left",borderBottom:"1px solid #F3F4F6"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                              <span style={{fontSize:16}}>{opt.icon}</span>
                              <span style={{fontWeight:500}}>{opt.label}</span>
                              <span style={{marginLeft:"auto",fontSize:11,color:"#9CA3AF"}}>{opt.filter==="all"?dayOrders.length:dayOrders.filter(o=>o.paymentType===opt.filter).length} orders</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* calendar dropdown */}
                {showSalesCalendar&&(
                  <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.10)",minWidth:280,marginBottom:16,display:"inline-block"}}>
                    <div style={{background:PURPLE,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <button onClick={()=>{if(scMonth===0){setScMonth(11);setScYear(y=>y-1);}else setScMonth(m=>m-1);}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                      <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{monthLabel}</span>
                      <button onClick={()=>{if(scMonth===11){setScMonth(0);setScYear(y=>y+1);}else setScMonth(m=>m+1);}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
                      {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>(
                        <div key={d} style={{textAlign:"center",padding:"6px 0",fontSize:11,fontWeight:700,color:d==="Su"?"#EF4444":"#6B7280"}}>{d}</div>
                      ))}
                    </div>
                    <div style={{padding:"4px 6px 8px"}}>
                      {weeks.map((week,wi)=>(
                        <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                          {week.map((cell,ci)=>{
                            if(cell.type!=="curr") return <div key={ci} style={{textAlign:"center",padding:"6px 2px",fontSize:12,color:"#D1D5DB"}}>{cell.day}</div>;
                            const cellDate = new Date(scYear,scMonth,cell.day);
                            const cellStr = cellDate.toISOString().slice(0,10);
                            const isSel = isSameDay(cellDate,salesDate);
                            const isT = isSameDay(cellDate,TODAY_DATE);
                            const hasOrders = datesWithOrders.has(cellStr);
                            return (
                              <div key={ci} onClick={()=>{setSalesDate(cellDate);setShowSalesCalendar(false);}} style={{textAlign:"center",padding:"5px 2px",cursor:"pointer",position:"relative"}}>
                                <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:"50%",fontSize:13,fontWeight:isSel||isT?700:400,background:isSel?PURPLE:isT?PURPLE_LIGHT:"transparent",color:isSel?"#fff":cellDate.getDay()===0?"#EF4444":"#374151",border:isT&&!isSel?`1.5px solid ${PURPLE}`:"none"}}>
                                  {cell.day}
                                </div>
                                {hasOrders&&!isSel&&<span style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,background:"#059669",borderRadius:"50%",display:"block"}} />}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div style={{borderTop:"1px solid #E5E7EB",padding:"8px",textAlign:"center"}}>
                      <button onClick={()=>{setSalesDate(new Date(TODAY_DATE));setScYear(TODAY_DATE.getFullYear());setScMonth(TODAY_DATE.getMonth());setShowSalesCalendar(false);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:PURPLE,fontWeight:600}}>
                        Today: {TODAY_DATE.toLocaleDateString("en-PH",{month:"2-digit",day:"2-digit",year:"numeric"})}
                      </button>
                    </div>
                  </div>
                )}

                {/* daily sales summary cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:16}}>
                  {[
                    {label:"Total Sales",    value:"₱"+dayTotal,   color:PURPLE,    sub:dayOrders.length+" orders"},
                    {label:"💵 Cash Sales",   value:"₱"+cashTotal,  color:"#059669", sub:cashOrders.length+" orders"},
                    {label:"💳 Credit Sales", value:"₱"+creditTotal,color:"#0891B2", sub:creditOrders.length+" orders"},
                    {label:"Unpaid",          value:dayOrders.filter(o=>!o.paymentType).length, color:"#F59E0B", sub:"orders"},
                  ].map(s=>(
                    <div key={s.label} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"1rem",textAlign:"center"}}>
                      <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:11,color:"#374151",marginTop:2,fontWeight:600}}>{s.label}</div>
                      <div style={{fontSize:10,color:"#9CA3AF"}}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* orders table for selected day */}
                {dayOrders.length===0 ? (
                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"3rem",textAlign:"center"}}>
                    <div style={{fontSize:32,marginBottom:8}}>📭</div>
                    <div style={{fontWeight:600,color:"#374151"}}>No orders on this date</div>
                    <div style={{fontSize:13,color:"#9CA3AF",marginTop:4}}>Select a date with a 🟢 dot to see its orders</div>
                  </div>
                ) : (
                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead>
                        <tr style={{background:"#F9FAFB"}}>
                          {["Order ID","Customer","Items","Total","Payment","Time"].map(h=>(
                            <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dayOrders.map(order=>(
                          <tr key={order.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                            <td style={{padding:"11px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:11}}>{order.id}</td>
                            <td style={{padding:"11px 14px",fontWeight:600,color:"#111"}}>{order.user}</td>
                            <td style={{padding:"11px 14px",color:"#6B7280"}}>{order.items.map((it,i)=>(<div key={i} style={{fontSize:12,lineHeight:1.7}}>{it.name} ×{it.qty}</div>))}</td>
                            <td style={{padding:"11px 14px",fontWeight:700,color:"#059669"}}>₱{order.total}</td>
                            <td style={{padding:"11px 14px"}}>
                              {order.paymentType
                                ?<span style={{background:order.paymentType==="Credit"?PURPLE_LIGHT:"#D1FAE5",color:order.paymentType==="Credit"?PURPLE:"#065F46",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10}}>
                                  {order.paymentType==="Credit"?"💳 Credit":"💵 Cash"}
                                </span>
                                :<span style={{background:"#FEF3C7",color:"#92400E",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10}}>⏳ Unpaid</span>}
                            </td>
                            <td style={{padding:"11px 14px",color:"#9CA3AF",whiteSpace:"nowrap"}}>{order.time}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{background:"#F9FAFB",borderTop:"2px solid #E5E7EB"}}>
                          <td colSpan={3} style={{padding:"11px 14px",fontWeight:700,color:"#374151",fontSize:13}}>Daily Total</td>
                          <td style={{padding:"11px 14px",fontWeight:800,color:PURPLE,fontSize:15}}>₱{dayTotal}</td>
                          <td colSpan={2} style={{padding:"11px 14px",fontSize:12,color:"#6B7280"}}>
                            💵 Cash: ₱{cashTotal} &nbsp;|&nbsp; 💳 Credit: ₱{creditTotal}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── INVENTORY TAB ── */}
          {historyTab==="inventory"&&(
            <div>
              {/* stock movement summary */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:16}}>
                {[
                  {label:"Total Stock IN",   value:totalStockIn,                    color:"#10B981", sub:"units received"},
                  {label:"Total Stock OUT",   value:totalStockOut,                   color:"#EF4444", sub:"units sold"},
                  {label:"Current Stock",     value:otherProducts.reduce((s,p)=>s+p.stock,0), color:"#F59E0B", sub:"units remaining"},
                  {label:"Products",          value:otherProducts.length,            color:PURPLE,    sub:"product types"},
                ].map(s=>(
                  <div key={s.label} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"1rem",textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:11,color:"#374151",marginTop:2,fontWeight:600}}>{s.label}</div>
                    <div style={{fontSize:10,color:"#9CA3AF"}}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* financial summary */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                {/* actual — based on sold items */}
                <div style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"1rem"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{background:"#D1FAE5",color:"#065F46",padding:"2px 8px",borderRadius:10,fontSize:11}}>✅ Actual</span>
                    Based on sold items
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      {label:"Revenue (Sales)",  value:actualRevenue,  color:"#059669"},
                      {label:"Expense (Buy Cost)",value:actualExpense, color:"#EF4444"},
                      {label:"Actual Profit",    value:actualProfit,   color:PURPLE, bold:true},
                    ].map(r=>(
                      <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F3F4F6"}}>
                        <span style={{fontSize:12,color:"#6B7280"}}>{r.label}</span>
                        <span style={{fontSize:r.bold?16:14,fontWeight:r.bold?800:600,color:r.color}}>₱{r.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* projected — based on current stock */}
                <div style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"1rem"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{background:PURPLE_LIGHT,color:PURPLE,padding:"2px 8px",borderRadius:10,fontSize:11}}>📈 Projected</span>
                    If all current stock is sold
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      {label:"Projected Revenue", value:projectedRevenue, color:"#059669"},
                      {label:"Projected Expense",  value:projectedExpense, color:"#EF4444"},
                      {label:"Projected Profit",   value:projectedProfit,  color:PURPLE, bold:true},
                    ].map(r=>(
                      <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F3F4F6"}}>
                        <span style={{fontSize:12,color:"#6B7280"}}>{r.label}</span>
                        <span style={{fontSize:r.bold?16:14,fontWeight:r.bold?800:600,color:r.color}}>₱{r.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* inventory log table */}
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"#F9FAFB"}}>
                      {["Product","Type","Qty","Before","After","By","Date & Time"].map(h=>(
                        <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLog.length===0&&<tr><td colSpan={7} style={{padding:"3rem",textAlign:"center",color:"#9CA3AF"}}>No inventory logs yet.</td></tr>}
                    {inventoryLog.map(log=>(
                      <tr key={log.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                        <td style={{padding:"11px 14px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{log.emoji}</span><span style={{fontWeight:600,color:"#111"}}>{log.product}</span></div></td>
                        <td style={{padding:"11px 14px"}}><span style={{background:log.type==="IN"?"#D1FAE5":"#FEE2E2",color:log.type==="IN"?"#065F46":"#991B1B",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{log.type==="IN"?"📥 IN":"📤 OUT"}</span></td>
                        <td style={{padding:"11px 14px",fontWeight:700,color:log.type==="IN"?"#059669":"#EF4444"}}>{log.type==="IN"?"+":"-"}{log.qty}</td>
                        <td style={{padding:"11px 14px",color:"#6B7280"}}>{log.before}</td>
                        <td style={{padding:"11px 14px",fontWeight:600,color:"#111"}}>{log.after}</td>
                        <td style={{padding:"11px 14px",color:"#6B7280",fontSize:12}}>{log.by}</td>
                        <td style={{padding:"11px 14px",color:"#9CA3AF",fontSize:12,whiteSpace:"nowrap"}}>{log.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  /* ════════════════════════════════════════
     MAIN APP SHELL
  ════════════════════════════════════════ */
  return (
    <div style={{minHeight:600,background:BG,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <Navbar />
      {/* low credit warning banner */}
      {creditNotif&&currentUser.creditBalance<100&&(
        <div style={{background:"#FEF3C7",borderBottom:"1px solid #FCD34D",padding:"10px 1.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,position:"sticky",top:52,zIndex:40}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>⚠️</span>
            <div>
              <span style={{fontWeight:700,fontSize:13,color:"#92400E"}}>Low Credit Balance! </span>
              <span style={{fontSize:13,color:"#92400E"}}>Your remaining credit is <strong>₱{currentUser.creditBalance}</strong> — below ₱100. Resets on the 15th and last day of each month.</span>
            </div>
          </div>
          <button onClick={()=>setCreditNotif(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#92400E",flexShrink:0}}>✕</button>
        </div>
      )}
      {/* Main content */}
      <div style={{padding:"1.25rem",maxWidth:1100,margin:"0 auto",transition:"margin-left 0.25s"}}>
        {renderTab()}
      </div>
      {showPlantModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
            <div style={{background:PURPLE,padding:"18px 22px"}}>
              <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Select Canteen Plant</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>Where will you pick up your order?</div>
            </div>
            <div style={{padding:"22px"}}>
              {/* Suggested plant */}
              {currentUser.plant&&(
                <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:PURPLE,display:"flex",alignItems:"center",gap:8}}>
                  <span>💡</span>
                  <span>Your assigned plant is <strong>{currentUser.plant}</strong></span>
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
                {PLANTS.map(p=>(
                  <button key={p} onClick={()=>setOrderPlant(p)}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderRadius:12,border:orderPlant===p?"2px solid "+PURPLE:"1px solid #E5E7EB",background:orderPlant===p?PURPLE_LIGHT:"#fff",cursor:"pointer",textAlign:"left"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:15,color:orderPlant===p?PURPLE:"#111"}}>{p}</div>
                      {currentUser.plant===p&&<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>Your assigned plant</div>}
                    </div>
                    {orderPlant===p&&<span style={{color:PURPLE,fontSize:18}}>✓</span>}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setShowPlantModal(false);setOrderPlant("");}} style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                <button onClick={placeOrder} disabled={!orderPlant}
                  style={{flex:2,background:orderPlant?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:orderPlant?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                  Place Order at {orderPlant||"..."}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


            {/* order toast */}
      {orderPlaced&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:PURPLE,color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:600,zIndex:200,display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 24px rgba(107,33,168,0.3)"}}>
          <Icon name="check" size={16} color="#fff" /> Order placed successfully!
        </div>
      )}
    </div>
  );
}
