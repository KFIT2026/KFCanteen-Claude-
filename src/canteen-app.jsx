import { useState, useMemo, useRef, useCallback } from "react";

const PURPLE = "#6B21A8";
const PURPLE_DARK = "#4C1D95";
const PURPLE_LIGHT = "#EDE9FE";
const PURPLE_MID = "#7C3AED";
const BG = "#F3F4F6";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const TODAY = DAYS[Math.min(new Date().getDay() === 0 ? 5 : new Date().getDay() - 1, 5)];
const MEAL_CATS = ["ALL","BREAKFAST","LUNCH","SNACK"];

const statusColor = { Pending:"#F59E0B", Preparing:"#3B82F6", Ready:"#10B981", Served:"#6B7280" };

const USERS = [
  { id:"u1", username:"admin",  password:"admin123", role:"admin", name:"System Admin", avatar:"SA" },
  { id:"u2", username:"staff1", password:"staff123", role:"staff", name:"Ana Reyes",    avatar:"AR" },
  { id:"u3", username:"staff2", password:"staff456", role:"staff", name:"Ben Cruz",     avatar:"BC" },
  { id:"u4", username:"juan",   password:"user123",  role:"user",  name:"Juan dela Cruz",avatar:"JD" },
  { id:"u5", username:"maria",  password:"user456",  role:"user",  name:"Maria Santos", avatar:"MS" },
];

const DEFAULT_OTHER_PRODUCTS = [
  { id:"op1",  name:"Nova Chips",           category:"Chips",          price:15, emoji:"🥔", stock:20, available:true },
  { id:"op2",  name:"Piattos Cheese",        category:"Chips",          price:20, emoji:"🥔", stock:15, available:true },
  { id:"op3",  name:"Rebisco Biscuit",       category:"Biscuit",        price:12, emoji:"🍪", stock:30, available:true },
  { id:"op4",  name:"SkyFlakes",             category:"Biscuit",        price:10, emoji:"🍪", stock:25, available:true },
  { id:"op5",  name:"Lucky Me! Pancit Canton",category:"Instant Noodles",price:18, emoji:"🍜", stock:20, available:true },
  { id:"op6",  name:"Nissin Cup Noodles",    category:"Instant Noodles",price:35, emoji:"🍜", stock:10, available:true },
  { id:"op7",  name:"Nescafé 3-in-1",        category:"Instant Coffee", price:8,  emoji:"☕", stock:50, available:true },
  { id:"op8",  name:"Great Taste Coffee",    category:"Instant Coffee", price:8,  emoji:"☕", stock:50, available:true },
  { id:"op9",  name:"Tang Orange",           category:"Powdered Drinks",price:6,  emoji:"🍊", stock:40, available:true },
  { id:"op10", name:"Milo Sachet",           category:"Powdered Drinks",price:12, emoji:"🥤", stock:35, available:true },
  { id:"op11", name:"Coca-Cola 1.5L",        category:"Soft Drinks",    price:75, emoji:"🥤", stock:12, available:true },
  { id:"op12", name:"Royal TruOrange 1L",    category:"Soft Drinks",    price:55, emoji:"🥤", stock:8,  available:true },
  { id:"op13", name:"C2 Apple 230ml",        category:"Others",         price:20, emoji:"🧃", stock:18, available:true },
  { id:"op14", name:"Mineral Water 500ml",   category:"Others",         price:15, emoji:"💧", stock:24, available:true },
];

const defaultMenu = {
  Monday:[
    { id:"m1", name:"Adobo with Rice",    price:65, available:true, img:"🍚", cat:"LUNCH" },
    { id:"m2", name:"Sinigang na Baboy",  price:75, available:true, img:"🍲", cat:"LUNCH" },
    { id:"m3", name:"Pandesal",           price:5,  available:true, img:"🥖", cat:"BREAKFAST" },
  ],
  Tuesday:[
    { id:"m4", name:"Tinola with Rice",   price:65, available:true, img:"🍗", cat:"LUNCH" },
    { id:"m5", name:"Chopsuey",           price:55, available:true, img:"🥦", cat:"LUNCH" },
    { id:"m6", name:"Maja Blanca",        price:30, available:true, img:"🍮", cat:"SNACK" },
  ],
  Wednesday:[
    { id:"m7", name:"Lechon Kawali & Rice",price:85,available:true, img:"🥩", cat:"LUNCH" },
    { id:"m8", name:"Pinakbet",           price:55, available:true, img:"🫑", cat:"LUNCH" },
    { id:"m9", name:"Halo-halo",          price:50, available:true, img:"🍧", cat:"SNACK" },
  ],
  Thursday:[
    { id:"m10",name:"Kare-kare & Rice",   price:90, available:true, img:"🍛", cat:"LUNCH" },
    { id:"m11",name:"Laing",              price:60, available:true, img:"🌿", cat:"LUNCH" },
    { id:"m12",name:"Banana Cue",         price:10, available:true, img:"🍌", cat:"SNACK" },
  ],
  Friday:[
    { id:"m13",name:"Bangus Sisig & Rice",price:80, available:true, img:"🐟", cat:"LUNCH" },
    { id:"m14",name:"Ginisang Monggo",    price:55, available:true, img:"🫘", cat:"LUNCH" },
    { id:"m15",name:"Buko Pandan",        price:35, available:true, img:"🥥", cat:"SNACK" },
  ],
  Saturday:[
    { id:"m16",name:"Bulalo & Rice",      price:120,available:true, img:"🦴", cat:"LUNCH" },
    { id:"m17",name:"Nilaga",             price:80, available:true, img:"🥕", cat:"LUNCH" },
    { id:"m18",name:"Turon",              price:15, available:true, img:"🍡", cat:"SNACK" },
  ],
  Sunday:[
    { id:"m19",name:"Lechon & Rice",      price:130,available:true, img:"🐷", cat:"LUNCH" },
    { id:"m20",name:"Dinuguan",           price:70, available:true, img:"🍖", cat:"LUNCH" },
    { id:"m21",name:"Puto Bumbong",       price:25, available:true, img:"🍢", cat:"SNACK" },
  ],
};

const defaultOrders = [
  { id:"KF000001", user:"Juan dela Cruz", userId:"u4", items:[{name:"Adobo with Rice",qty:2,price:65}], total:130, status:"Pending",  time:"10:30 AM" },
  { id:"KF000002", user:"Maria Santos",   userId:"u5", items:[{name:"Sinigang na Baboy",qty:1,price:75},{name:"Nova Chips",qty:2,price:15}], total:105, status:"Preparing",time:"10:45 AM" },
  { id:"KF000003", user:"Juan dela Cruz", userId:"u4", items:[{name:"Pandesal",qty:5,price:5}], total:25, status:"Ready", time:"11:00 AM" },
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
    { id:"menu",     label:"Menu",            icon:"menu" },
    { id:"myorders", label:"My Orders",       icon:"orders" },
    { id:"cart",     label:"Cart",            icon:"cart" },
    { id:"mgmenu",   label:"Manage Menu",     icon:"manage" },
    { id:"mgorders", label:"Manage Orders",   icon:"manage" },
    { id:"mgproducts",label:"Manage Products",icon:"products" },
    { id:"personnel",label:"Personnel",       icon:"people" },
    { id:"history",  label:"Overall History", icon:"history" },
  ],
  staff: [
    { id:"mgmenu",    label:"Manage Menu",      icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",    icon:"manage" },
    { id:"mgproducts",label:"Manage Products",  icon:"products" },
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

  // menu / filter state
  const [menu, setMenu] = useState(defaultMenu);
  const [selectedDay, setSelectedDay] = useState(TODAY);
  const [mealCat, setMealCat] = useState("ALL");
  const [menuView, setMenuView] = useState("Weekly Menu"); // "Weekly Menu" | "Other Products"
  const [searchQ, setSearchQ] = useState("");

  // cart & orders
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState(defaultOrders);
  const [orderPlaced, setOrderPlaced] = useState(false);

  // manage menu add form
  const [showAddItem, setShowAddItem] = useState(null);
  const [newItem, setNewItem] = useState({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null });

  const [dragOver, setDragOver] = useState(false);
  const photoInputRef = useRef(null);

  const handlePhotoFile = useCallback((file) => {
    if(!file||!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setNewItem(p=>({...p, photo:e.target.result}));
    reader.readAsDataURL(file);
  }, []);

  // other products category
  const [otherCat, setOtherCat] = useState("All");
  const [filterCat, setFilterCat] = useState("All");
  const [otherProducts, setOtherProducts] = useState(DEFAULT_OTHER_PRODUCTS);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name:"", price:"", emoji:"🛍️", category:"Others", stock:"" });


  const cartCount = cart.reduce((s,i)=>s+i.qty,0);
  const cartTotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const role = currentUser?.role;

  const orderCounter = useRef(3); // starts at 3 since defaults are KF000001-3
  const nextOrderId = () => {
    orderCounter.current += 1;
    return "KF" + String(orderCounter.current).padStart(6, "0");
  };
  const handleLogin = () => {
    const found = USERS.find(u=>u.username===loginForm.username && u.password===loginForm.password);
    if (found) { setCurrentUser(found); setLoginError(""); setActiveTab(found.role==="staff"?"mgmenu":"menu"); }
    else setLoginError("Incorrect username or password.");
  };
  const handleLogout = () => { setCurrentUser(null); setLoginForm({username:"",password:""}); setCart([]); setLoginError(""); };

  /* ── CART ── */
  const addToCart = (item) => setCart(prev=>{
    const ex=prev.find(c=>c.id===item.id);
    if(ex) return prev.map(c=>c.id===item.id?{...c,qty:c.qty+1}:c);
    return [...prev,{...item,qty:1}];
  });
  const updateQty = (id,delta) => setCart(prev=>prev.map(c=>c.id===id?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));
  const removeFromCart = (id) => setCart(prev=>prev.filter(c=>c.id!==id));

  const placeOrder = () => {
    if(!cart.length) return;
    const order={ id:nextOrderId(), user:currentUser.name, userId:currentUser.id,
      items:cart.map(c=>({name:c.name,qty:c.qty,price:c.price})), total:cartTotal,
      status:"Pending", time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) };
    setOrders(prev=>[order,...prev]);
    // deduct stock for other products
    setOtherProducts(prev => prev.map(p => {
      const cartItem = cart.find(c => c.id === p.id);
      if (!cartItem) return p;
      const newStock = Math.max(0, p.stock - cartItem.qty);
      return { ...p, stock: newStock, available: newStock > 0 };
    }));
    setCart([]);
    setOrderPlaced(true);
    setTimeout(()=>setOrderPlaced(false),3000);
    setActiveTab("myorders");
  };

  /* ── MENU MGMT ── */
  const addMenuItem = (day) => {
    if(!newItem.name||!newItem.price) return;
    const item={ id:"m"+Date.now(), name:newItem.name, price:parseFloat(newItem.price), available:true, img:newItem.photo||newItem.img||"🍽️", isPhoto:!!newItem.photo, cat:newItem.cat };
    setMenu(prev=>({...prev,[day]:[...prev[day],item]}));
    setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null});
    setShowAddItem(null);
  };
  const removeMenuItem = (day,id) => setMenu(prev=>({...prev,[day]:prev[day].filter(i=>i.id!==id)}));
  const toggleAvail = (day,id) => setMenu(prev=>({...prev,[day]:prev[day].map(i=>i.id===id?{...i,available:!i.available}:i)}));
  const updateOrderStatus = (id,status) => setOrders(prev=>prev.map(o=>o.id===id?{...o,status}:o));

  const addOtherProduct = () => {
    if(!newProduct.name||!newProduct.price||!newProduct.stock) return;
    const p = { id:"op"+Date.now(), name:newProduct.name, price:parseFloat(newProduct.price), emoji:newProduct.emoji||"🛍️", category:newProduct.category||"Others", stock:parseInt(newProduct.stock), available:parseInt(newProduct.stock)>0 };
    setOtherProducts(prev=>[...prev, p]);
    setNewProduct({ name:"", price:"", emoji:"🛍️", category:"Others", stock:"" });
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
          <h1 style={{fontSize:22,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>Welcome Back</h1>
          <p style={{color:"#9CA3AF",fontSize:13,margin:0}}>Sign in to order your meal</p>
        </div>

        {/* fields */}
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
            <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:0,color:"#9CA3AF"}}>
              <Icon name={showPass?"eyeoff":"eye"} size={18} color="#9CA3AF" />
            </button>
          </div>
        </div>
        {loginError && <p style={{color:"#EF4444",fontSize:12,margin:"6px 0 0",display:"flex",alignItems:"center",gap:5}}>⚠️ {loginError}</p>}

        <button onClick={handleLogin} style={{width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:18,letterSpacing:"0.3px"}}>
          Sign In
        </button>

        <p style={{textAlign:"center",marginTop:18,fontSize:13,color:"#9CA3AF"}}>
          Don't have an account? <span style={{color:PURPLE_MID,fontWeight:600,cursor:"pointer"}}>Register as Employee</span>
        </p>

        {/* demo hint */}
        <div style={{marginTop:16,borderTop:"1px solid #F3F4F6",paddingTop:14}}>
          <p style={{fontSize:11,color:"#9CA3AF",margin:"0 0 8px",textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:600}}>Quick login</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{label:"Admin",u:"admin",p:"admin123",c:PURPLE},{label:"Staff",u:"staff1",p:"staff123",c:"#0891B2"},{label:"Customer",u:"juan",p:"user123",c:"#059669"}].map(a=>(
              <button key={a.u} onClick={()=>{setLoginForm({username:a.u,password:a.p});setLoginError("");}}
                style={{flex:1,minWidth:80,background:a.c+"12",color:a.c,border:`1px solid ${a.c}33`,borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ════════════════════════════════════════
     TOP NAVBAR
  ════════════════════════════════════════ */
  const navItems = NAV[role]||NAV.user;

  const Navbar = () => (
    <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",display:"flex",alignItems:"center",padding:"0 1.5rem",gap:0,position:"sticky",top:0,zIndex:50,height:52,overflowX:"auto"}}>
      {/* Brand */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginRight:24,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <Icon name="utensils" size={20} color={PURPLE} />
          <span style={{fontWeight:700,fontSize:15,color:PURPLE,letterSpacing:"-0.3px"}}>KFCanteen</span>
        </div>
        <div style={{width:1,height:28,background:"#E5E7EB",margin:"0 8px"}} />
        <div>
          <div style={{fontSize:11,color:"#6B7280",lineHeight:1.2}}>{currentUser.name}</div>
          <div style={{fontSize:10,color:PURPLE_MID,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{role}</div>
        </div>
      </div>

      {/* Nav links */}
      <div style={{display:"flex",alignItems:"stretch",gap:0,flex:1,overflowX:"auto"}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>setActiveTab(n.id)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"0 14px",height:52,border:"none",borderBottom:activeTab===n.id?`2.5px solid ${PURPLE}`:"2.5px solid transparent",background:"none",cursor:"pointer",fontSize:13,fontWeight:activeTab===n.id?600:400,color:activeTab===n.id?PURPLE:"#6B7280",whiteSpace:"nowrap",flexShrink:0}}>
            <Icon name={n.icon} size={15} color={activeTab===n.id?PURPLE:"#9CA3AF"} />
            {n.label}
            {n.id==="cart"&&cartCount>0&&<span style={{background:PURPLE,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{cartCount}</span>}
          </button>
        ))}
      </div>

      {/* Avatar + logout */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,marginLeft:12}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:PURPLE}}>
          {currentUser.avatar}
        </div>
        <button onClick={handleLogout} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#6B7280",padding:"6px 10px",borderRadius:8}}>
          <Icon name="logout" size={15} color="#9CA3AF" /> Logout
        </button>
      </div>
    </div>
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

  /* ── Day tabs ── */
  const DayTabs = () => (
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {DAYS.map(day=>(
        <button key={day} onClick={()=>setSelectedDay(day)}
          style={{padding:"7px 18px",borderRadius:50,border:"1px solid #E5E7EB",background:selectedDay===day?PURPLE:"#fff",color:selectedDay===day?"#fff":"#374151",fontWeight:selectedDay===day?700:400,fontSize:13,cursor:"pointer",position:"relative"}}>
          {day}
          {day===TODAY&&<span style={{position:"absolute",top:-3,right:-3,width:7,height:7,background:"#EF4444",borderRadius:"50%"}} />}
        </button>
      ))}
    </div>
  );

  /* ── Meal category pills ── */
  const MealCatPills = () => (
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      {MEAL_CATS.map(c=>(
        <button key={c} onClick={()=>setMealCat(c)}
          style={{padding:"5px 16px",borderRadius:50,border:"1px solid #E5E7EB",background:mealCat===c?"#1a1a2e":"#fff",color:mealCat===c?"#fff":"#6B7280",fontWeight:mealCat===c?700:400,fontSize:12,cursor:"pointer",letterSpacing:"0.5px"}}>
          {c}
        </button>
      ))}
    </div>
  );

  /* ── Food card ── */
  const FoodCard = ({item,onAdd}) => {
    const outOfStock = item.available===false || (item.stock!==undefined && item.stock<=0);
    return (
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden",display:"flex",flexDirection:"column",transition:"box-shadow 0.15s",opacity:outOfStock?0.7:1}}
        onMouseEnter={e=>e.currentTarget.style.boxShadow=outOfStock?"none":"0 4px 16px rgba(107,33,168,0.10)"}
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
        </div>
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:6,flex:1}}>
          <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
          <div style={{color:PURPLE,fontWeight:700,fontSize:16}}>₱{item.price}</div>
          {outOfStock
            ? <div style={{textAlign:"center",fontSize:12,color:"#9CA3AF",padding:"7px",background:"#F9FAFB",borderRadius:8,marginTop:"auto",fontWeight:600}}>Out of Stock</div>
            : <button onClick={()=>onAdd(item)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:"auto"}}>
                <Icon name="plus" size={14} color="#fff" /> Add to Cart
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
            <DayTabs />
            <MealCatPills />
            {visibleItems.length===0 ? <Empty /> : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
                {visibleItems.map(item=><FoodCard key={item.id} item={item} onAdd={addToCart} />)}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
              {otherCats.map(c=>(
                <button key={c} onClick={()=>setOtherCat(c)}
                  style={{padding:"6px 16px",borderRadius:50,border:"1px solid #E5E7EB",background:otherCat===c?PURPLE:"#fff",color:otherCat===c?"#fff":"#6B7280",fontSize:12,fontWeight:otherCat===c?700:400,cursor:"pointer"}}>
                  {c}
                </button>
              ))}
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
              <div key={item.id} style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #F3F4F6"}}>
                <span style={{fontSize:28}}>{item.img||item.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
                  <div style={{fontSize:12,color:"#6B7280"}}>₱{item.price} each</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>updateQty(item.id,-1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E5E7EB",background:BG,cursor:"pointer",fontSize:16,fontWeight:700,color:"#374151"}}>−</button>
                  <span style={{fontSize:14,fontWeight:700,minWidth:20,textAlign:"center"}}>{item.qty}</span>
                  <button onClick={()=>updateQty(item.id,1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E5E7EB",background:BG,cursor:"pointer",fontSize:16,fontWeight:700,color:"#374151"}}>+</button>
                </div>
                <div style={{fontWeight:700,fontSize:14,color:PURPLE,minWidth:52,textAlign:"right"}}>₱{item.price*item.qty}</div>
                <button onClick={()=>removeFromCart(item.id)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"#EF4444"}}>
                  <Icon name="trash" size={15} color="#EF4444" />
                </button>
              </div>
            ))}
            <div style={{padding:"16px 18px",background:"#FAFAFA",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:"#6B7280"}}>Total Amount</div>
                <div style={{fontSize:22,fontWeight:800,color:PURPLE}}>₱{cartTotal}</div>
              </div>
              <button onClick={placeOrder} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"11px 28px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Place Order
              </button>
            </div>
          </div>
        )}
      </div>
    );

    /* ── MY ORDERS ── */
    if(activeTab==="myorders") return (
      <div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 20px",display:"flex",alignItems:"center",gap:10}}>
          <Icon name="orders" size={20} color={PURPLE} /> My Orders
        </h2>
        {orders.filter(o=>o.userId===currentUser.id).length===0 ? (
          <Empty msg="No orders yet" sub="Place an order from the menu to see it here." />
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {orders.filter(o=>o.userId===currentUser.id).map(order=>(
              <div key={order.id} style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"16px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#111"}}>Order #{order.id}</div>
                    <div style={{fontSize:12,color:"#9CA3AF"}}>{order.time}</div>
                  </div>
                  <span style={{background:statusColor[order.status]+"22",color:statusColor[order.status],fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{order.status}</span>
                </div>
                {order.items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#374151",padding:"3px 0"}}>
                    <span>{it.name} × {it.qty}</span><span style={{fontWeight:600}}>₱{it.price*it.qty}</span>
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

    /* ── MANAGE MENU (staff/admin) ── */
    if(activeTab==="mgmenu") return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
            <Icon name="manage" size={20} color={PURPLE} /> Manage Weekly Menu
          </h2>
          <button onClick={()=>setShowAddItem(selectedDay)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="plus" size={14} color="#fff" /> Add Item
          </button>
        </div>
        {/* day tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {DAYS.map(day=>(
            <button key={day} onClick={()=>setSelectedDay(day)}
              style={{padding:"7px 18px",borderRadius:50,border:"1px solid #E5E7EB",background:selectedDay===day?PURPLE:"#fff",color:selectedDay===day?"#fff":"#374151",fontWeight:selectedDay===day?700:400,fontSize:13,cursor:"pointer",position:"relative"}}>
              {day.slice(0,3)}
              {day===TODAY&&<span style={{position:"absolute",top:-3,right:-3,width:7,height:7,background:"#EF4444",borderRadius:"50%"}} />}
            </button>
          ))}
        </div>
        {/* ── ADD ITEM MODAL ── */}
        {showAddItem===selectedDay&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
              {/* modal header */}
              <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Menu Item</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>{selectedDay} · {newItem.cat}</div>
                </div>
                <button onClick={()=>{setShowAddItem(null);setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null});}}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  ×
                </button>
              </div>

              <div style={{padding:"22px"}}>
                {/* Photo upload area */}
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Item Photo</label>
                  <div
                    onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                    onDragLeave={()=>setDragOver(false)}
                    onDrop={e=>{e.preventDefault();setDragOver(false);handlePhotoFile(e.dataTransfer.files[0]);}}
                    onClick={()=>photoInputRef.current?.click()}
                    style={{border:`2px dashed ${dragOver?PURPLE:"#D1D5DB"}`,borderRadius:12,padding:"1.5rem",textAlign:"center",cursor:"pointer",background:dragOver?PURPLE_LIGHT:"#FAFAFA",transition:"all 0.15s",position:"relative",minHeight:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
                    {newItem.photo ? (
                      <>
                        <img src={newItem.photo} alt="preview" style={{maxHeight:130,maxWidth:"100%",borderRadius:10,objectFit:"cover"}} />
                        <button onClick={e=>{e.stopPropagation();setNewItem(p=>({...p,photo:null}));}}
                          style={{position:"absolute",top:8,right:8,background:"#EF4444",border:"none",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{width:48,height:48,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}>
                          <Icon name="products" size={22} color={PURPLE} />
                        </div>
                        <div style={{fontSize:13,fontWeight:600,color:"#374151"}}>Drop photo here or click to browse</div>
                        <div style={{fontSize:12,color:"#9CA3AF"}}>JPG, PNG, WEBP supported</div>
                        {/* emoji fallback */}
                        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:"#9CA3AF"}}>or use emoji:</span>
                          <input value={newItem.img} onChange={e=>setNewItem(p=>({...p,img:e.target.value}))}
                            onClick={e=>e.stopPropagation()}
                            style={{width:56,fontSize:20,borderRadius:8,border:"1px solid #E5E7EB",padding:"4px 6px",textAlign:"center",background:"#fff"}} />
                        </div>
                      </>
                    )}
                    <input ref={photoInputRef} type="file" accept="image/*" style={{display:"none"}}
                      onChange={e=>handlePhotoFile(e.target.files[0])} />
                  </div>
                </div>

                {/* Fields row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Item Name</label>
                    <input value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Adobo with Rice"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Category</label>
                    <select value={newItem.cat} onChange={e=>setNewItem(p=>({...p,cat:e.target.value}))}
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
                      {["BREAKFAST","LUNCH","SNACK"].map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Price (₱)</label>
                    <input value={newItem.price} onChange={e=>setNewItem(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button onClick={()=>{setShowAddItem(null);setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null});}}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>
                    Cancel
                  </button>
                  <button onClick={()=>addMenuItem(selectedDay)}
                    disabled={!newItem.name||!newItem.price}
                    style={{flex:2,background:newItem.name&&newItem.price?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:newItem.name&&newItem.price?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <Icon name="plus" size={15} color="#fff" /> Add to {selectedDay}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {menu[selectedDay].map(item=>(
            <div key={item.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 16px",display:"flex",alignItems:"center",gap:12,opacity:item.available?1:0.6}}>
              {/* thumbnail */}
              <div style={{width:52,height:52,borderRadius:10,background:PURPLE_LIGHT,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {item.isPhoto&&item.img
                  ? <img src={item.img} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                  : <span style={{fontSize:26}}>{item.img}</span>
                }
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
                <div style={{fontSize:12,color:"#6B7280"}}>{item.cat} · ₱{item.price}</div>
              </div>
              <span style={{fontSize:11,background:item.available?"#D1FAE5":"#FEE2E2",color:item.available?"#065F46":"#991B1B",padding:"3px 10px",borderRadius:20,fontWeight:600}}>
                {item.available?"Available":"Unavailable"}
              </span>
              <button onClick={()=>toggleAvail(selectedDay,item.id)} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,color:"#374151",fontWeight:500}}>Toggle</button>
              <button onClick={()=>removeMenuItem(selectedDay,item.id)} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500}}>
                <Icon name="trash" size={13} color="#991B1B" /> Remove
              </button>
            </div>
          ))}
          {menu[selectedDay].length===0&&<Empty msg={`No items for ${selectedDay}`} sub="Click '+ Add Item' to add one." />}
        </div>
      </div>
    );

    /* ── MANAGE ORDERS (staff/admin) ── */
    if(activeTab==="mgorders") return (
      <div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 16px",display:"flex",alignItems:"center",gap:10}}>
          <Icon name="manage" size={20} color={PURPLE} /> Manage Orders
        </h2>
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          {["Pending","Preparing","Ready","Served"].map(s=>(
            <div key={s} style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:20,fontWeight:800,color:statusColor[s]}}>{orders.filter(o=>o.status===s).length}</span>
              <span style={{fontSize:11,color:"#6B7280",fontWeight:600}}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {orders.map(order=>(
            <div key={order.id} style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{order.user}</div>
                  <div style={{fontSize:12,color:"#9CA3AF"}}>#{order.id} · {order.time}</div>
                </div>
                <span style={{background:statusColor[order.status]+"22",color:statusColor[order.status],fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{order.status}</span>
              </div>
              {order.items.map((it,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#374151",padding:"2px 0"}}>
                  <span>{it.name} × {it.qty}</span><span style={{fontWeight:600}}>₱{it.price*it.qty}</span>
                </div>
              ))}
              <div style={{borderTop:"1px solid #F3F4F6",marginTop:10,paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,fontSize:15,color:PURPLE}}>₱{order.total}</span>
                <div style={{display:"flex",gap:6}}>
                  {["Pending","Preparing","Ready","Served"].map(s=>(
                    <button key={s} onClick={()=>updateOrderStatus(order.id,s)}
                      style={{background:order.status===s?statusColor[s]:"#F3F4F6",color:order.status===s?"#fff":"#6B7280",border:`1px solid ${statusColor[s]}55`,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:order.status===s?700:400}}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );

    /* ── MANAGE PRODUCTS (admin) ── */
    if(activeTab==="mgproducts") {
      const prodCats = ["All",...new Set(otherProducts.map(p=>p.category))];
      const displayed = filterCat==="All"?otherProducts:otherProducts.filter(p=>p.category===filterCat);
      return (
        <div>
          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="products" size={20} color={PURPLE} /> Manage Other Products
            </h2>
            <button onClick={()=>setShowAddProduct(true)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              <Icon name="plus" size={14} color="#fff" /> Add Product
            </button>
          </div>

          {/* category filter */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {prodCats.map(c=>(
              <button key={c} onClick={()=>setFilterCat(c)}
                style={{padding:"6px 16px",borderRadius:50,border:"1px solid #E5E7EB",background:filterCat===c?PURPLE:"#fff",color:filterCat===c?"#fff":"#6B7280",fontSize:12,fontWeight:filterCat===c?700:400,cursor:"pointer"}}>
                {c}
              </button>
            ))}
          </div>

          {/* summary stats */}
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            {[
              {label:"Total Products", value:otherProducts.length, color:PURPLE},
              {label:"Available",      value:otherProducts.filter(p=>p.available&&p.stock>0).length, color:"#10B981"},
              {label:"Low Stock (≤5)", value:otherProducts.filter(p=>p.stock<=5&&p.stock>0).length, color:"#F59E0B"},
              {label:"Out of Stock",   value:otherProducts.filter(p=>p.stock<=0).length, color:"#EF4444"},
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
                    <div style={{fontSize:12,color:"#6B7280"}}>{p.category} · ₱{p.price}</div>
                  </div>
                  {/* stock controls */}
                  <div style={{display:"flex",alignItems:"center",gap:6,background:"#F9FAFB",borderRadius:9,padding:"6px 10px",border:"1px solid #E5E7EB"}}>
                    <button onClick={()=>updateOtherStock(p.id,-1)} style={{width:24,height:24,borderRadius:6,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:16,fontWeight:700,color:"#374151",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <div style={{textAlign:"center",minWidth:54}}>
                      <div style={{fontSize:15,fontWeight:800,color:oos?"#EF4444":p.stock<=5?"#F59E0B":"#111"}}>{p.stock}</div>
                      <div style={{fontSize:10,color:"#9CA3AF",lineHeight:1}}>in stock</div>
                    </div>
                    <button onClick={()=>updateOtherStock(p.id,1)} style={{width:24,height:24,borderRadius:6,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:16,fontWeight:700,color:"#374151",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
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
            {displayed.length===0&&<Empty msg="No products found" sub="Add a product or change your category filter." />}
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
                      <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Price (₱)</label>
                      <input value={newProduct.price} onChange={e=>setNewProduct(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0"
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Initial Stock</label>
                      <input value={newProduct.stock} onChange={e=>setNewProduct(p=>({...p,stock:e.target.value}))} placeholder="0" type="number" min="0"
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    </div>
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
    if(activeTab==="personnel") return (
      <div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 20px",display:"flex",alignItems:"center",gap:10}}>
          <Icon name="people" size={20} color={PURPLE} /> Personnel
        </h2>
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:"#F9FAFB"}}>
                {["Name","Username","Role","Status"].map(h=>(
                  <th key={h} style={{padding:"12px 16px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:12,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {USERS.map(u=>(
                <tr key={u.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                  <td style={{padding:"13px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:34,height:34,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:PURPLE}}>{u.avatar}</div>
                      <span style={{fontWeight:600,color:"#111"}}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{padding:"13px 16px",color:"#6B7280",fontFamily:"monospace"}}>{u.username}</td>
                  <td style={{padding:"13px 16px"}}>
                    <span style={{background:u.role==="admin"?PURPLE_LIGHT:u.role==="staff"?"#E0F2FE":"#D1FAE5",color:u.role==="admin"?PURPLE:u.role==="staff"?"#0369A1":"#065F46",fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:20}}>{u.role}</span>
                  </td>
                  <td style={{padding:"13px 16px"}}>
                    <span style={{background:"#D1FAE5",color:"#065F46",fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:20,display:"inline-flex",alignItems:"center",gap:4}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:"#059669",display:"inline-block"}} /> Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    /* ── OVERALL HISTORY (admin) ── */
    if(activeTab==="history") return (
      <div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 16px",display:"flex",alignItems:"center",gap:10}}>
          <Icon name="history" size={20} color={PURPLE} /> Overall History
        </h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          {[
            {label:"Total Orders",  value:orders.length,                                           color:PURPLE},
            {label:"Pending",       value:orders.filter(o=>o.status==="Pending").length,           color:"#F59E0B"},
            {label:"Completed",     value:orders.filter(o=>o.status==="Served").length,            color:"#10B981"},
            {label:"Revenue",       value:"₱"+orders.reduce((s,o)=>s+o.total,0).toLocaleString(), color:"#059669"},
          ].map(stat=>(
            <div key={stat.label} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"1rem",textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:800,color:stat.color}}>{stat.value}</div>
              <div style={{fontSize:11,color:"#9CA3AF",marginTop:4,fontWeight:500}}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#F9FAFB"}}>
                {["Order ID","Customer","Items","Total","Status","Time"].map(h=>(
                  <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:12,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(order=>(
                <tr key={order.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                  <td style={{padding:"11px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12}}>{order.id}</td>
                  <td style={{padding:"11px 14px",fontWeight:600,color:"#111"}}>{order.user}</td>
                  <td style={{padding:"11px 14px",color:"#6B7280"}}>{order.items.length} item(s)</td>
                  <td style={{padding:"11px 14px",fontWeight:700,color:PURPLE}}>₱{order.total}</td>
                  <td style={{padding:"11px 14px"}}>
                    <span style={{background:statusColor[order.status]+"22",color:statusColor[order.status],fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{order.status}</span>
                  </td>
                  <td style={{padding:"11px 14px",color:"#9CA3AF"}}>{order.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    return null;
  };

  /* ════════════════════════════════════════
     MAIN APP SHELL
  ════════════════════════════════════════ */
  return (
    <div style={{minHeight:600,background:BG,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <Navbar />
      <div style={{padding:"1.5rem",maxWidth:1100,margin:"0 auto"}}>
        {renderTab()}
      </div>
      {/* toast */}
      {orderPlaced&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:PURPLE,color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:600,zIndex:200,display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 24px rgba(107,33,168,0.3)"}}>
          <Icon name="check" size={16} color="#fff" /> Order placed successfully!
        </div>
      )}
    </div>
  );
}
