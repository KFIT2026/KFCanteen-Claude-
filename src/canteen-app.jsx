import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  fetchUsers, dbInsertUser, dbUpdateUser, dbDeleteUser, dbInsertUsers, dbDeleteUsers,
  fetchMenu, dbInsertMenuItem, dbUpdateMenuItem, dbDeleteMenuItem,
  fetchProducts, dbInsertProduct, dbUpdateProduct, dbDeleteProduct,
  fetchOrders, dbInsertOrder, dbUpdateOrder,
  fetchInventoryLog, dbInsertLog,
  fetchReceipts, dbInsertReceipt, dbDeleteReceipt,
  fetchRawMaterials, dbInsertRawMaterial, dbUpdateRawMaterial, dbDeleteRawMaterial,
  fetchDishes, dbInsertDish, dbUpdateDish, dbDeleteDish,
  fetchRawMaterialLog, dbInsertRawMaterialLog,
  fetchPlantCloses, dbInsertPlantClose, dbReopenPlantClose,
  fetchExcessDecisions, dbInsertExcessDecision,
  fetchSuggestions, dbInsertSuggestion, dbDeleteSuggestion,
  fetchSuggestionReplies, dbInsertSuggestionReply, dbDeleteSuggestionReply,
  fetchShortOrderItems, dbInsertShortOrderItem, dbUpdateShortOrderItem, dbDeleteShortOrderItem,
  fetchVisitorMenuItems, dbInsertVisitorMenuItem, dbUpdateVisitorMenuItem, dbDeleteVisitorMenuItem,
} from "./db";
import { supabase } from "./supabaseClient";

const PURPLE = "#6B21A8";
const PURPLE_LIGHT = "#EDE9FE";
const PURPLE_MID = "#7C3AED";
const BG = "#F3F4F6";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// helpers
// 6-digit registration code, shown only to admin in Personnel > Unregistered.
// An employee must get this from admin and enter it correctly to register --
// closes the impersonation hole where anyone who knew a coworker's ID number
// could register an account as them.
const generateRegCode = () => String(Math.floor(100000 + Math.random()*900000));
const getDateKey = (date) => DAYS[Math.min(date.getDay()===0?5:date.getDay()-1,5)]; // Mon-Sat day name
// local "YYYY-MM-DD" — NEVER use date.toISOString().slice(0,10) for this: it converts
// through UTC, which silently shifts the date back a day in any positive UTC-offset
// timezone (e.g. Philippine Time, UTC+8) whenever the local date/time was constructed
// at local midnight or during the local-morning hours still behind UTC's date.
const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
// traditional calendar week number (week containing Jan 1 = week 1)
const getWeekNumber = (date) => {
  const start = new Date(date.getFullYear(),0,1);
  const diffDays = Math.floor((date - start)/86400000);
  return Math.ceil((diffDays + start.getDay() + 1)/7);
};
const getWeekKey = (date) => `${date.getFullYear()}-${getWeekNumber(date)}`;
const formatDateLabel = (date) => date.toLocaleDateString("en-PH",{month:"short",day:"numeric"});
const formatDateFull  = (date) => date.toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"});
const isSameDay = (a,b) => a.toDateString()===b.toDateString();
const isPast    = (date) => { const t=new Date(); t.setHours(0,0,0,0); const d=new Date(date); d.setHours(0,0,0,0); return d<t; };
const isFuture  = (date) => { const t=new Date(); t.setHours(0,0,0,0); const d=new Date(date); d.setHours(0,0,0,0); return d>t; };
// order.time is a display string like "5:46 AM" (from toLocaleTimeString) --
// not sortable as plain text since it breaks across the AM/PM boundary.
// Combines it with order.date into an actual timestamp for chronological sort.
const parseOrderTimestamp = (order) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((order.time||"").trim());
  if(!m) return new Date(order.date||0).getTime();
  let h = parseInt(m[1],10);
  const min = parseInt(m[2],10);
  const ampm = m[3].toUpperCase();
  if(ampm==="PM"&&h!==12) h+=12;
  if(ampm==="AM"&&h===12) h=0;
  return new Date(`${order.date}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`).getTime();
};

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
// After 8 PM, default the Menu tab to tomorrow's dishes instead of today's
// (today's ordering windows are all closed by then). Skips Sunday, since
// there's no Sunday menu, landing on Monday instead. "Today" badge, the
// per-category order cutoffs, and past/future logic all still key off the
// real TODAY_DATE -- this only changes what date the tab opens to by default.
const getDefaultMenuDate = () => {
  if(TODAY_DATE.getHours() < 20) return TODAY_DATE;
  const d = new Date(TODAY_DATE);
  d.setDate(d.getDate()+1);
  if(d.getDay()===0) d.setDate(d.getDate()+1); // Sunday -> Monday
  return d;
};
const MEAL_CATS = ["ALL","BREAKFAST","LUNCH","SNACK"];


// Suggestions/replies are blocked (not just flagged) if they match this list.
// Scope is deliberately narrow: strong profanity and sexual/vulgar terms only
// -- mild insults or blunt-but-clean criticism ("this food is bad", "ang
// panget") must still go through, or people stop giving honest feedback.
// Word-boundary matching (not substring) avoids flagging innocent words that
// happen to contain a banned string. This is a wordlist, not a language
// model -- it won't catch every spacing/leetspeak evasion, but it covers the
// common, obvious cases in both English and Filipino/Tagalog.
const PROFANITY_TERMS = [
  // English -- profanity
  "fuck","fucking","fucked","fucker","motherfucker","shit","bullshit","bitch",
  "asshole","cunt","dick","pussy","cock","whore","slut","bastard",
  "nigger","nigga","faggot","fag",
  // English -- sexual/vulgar
  "porn","blowjob","handjob","orgasm","penis","vagina","boobs","titties",
  "rape","rapist","dildo","masturbate","masturbation","cum",
  // Filipino/Tagalog -- profanity
  "putangina","putang ina","tangina","puta","gago","gaga","tarantado",
  "punyeta","hinayupak","pakyu","pakshet","hayop ka",
  // Filipino/Tagalog -- sexual/vulgar
  "kantot","kantutan","iyot","titi","puke","pekpek","burat","jakol",
];
const PROFANITY_REGEX = new RegExp(
  "\\b(?:" + PROFANITY_TERMS.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|") + ")\\b",
  "i"
);
const containsProfanity = (text) => PROFANITY_REGEX.test(text);

const PLANTS = ["KF Main","Colortree","KF II (Global)"];

// dish serving units — a dish's serving size can be measured by weight,
// piece count, or cup count. The excess-repurpose math is a straight
// proportion (excess / servingSize * ingredientQty) so it's unit-agnostic;
// only labels/inputs need to know which unit is in play.
const SERVING_UNITS = [
  { id:"g",   label:"Weight (grams)", icon:"⚖️" },
  { id:"pcs", label:"Pieces",         icon:"🔢" },
  { id:"cup", label:"Cups",           icon:"🥤" },
];
const unitIcon = (unit) => (SERVING_UNITS.find(u=>u.id===unit)||SERVING_UNITS[0]).icon;
const unitSuffix = (unit, qty) => unit==="pcs" ? (qty===1?"pc":"pcs") : unit==="cup" ? (qty===1?"cup":"cups") : "g";
const formatServing = (qty, unit) => (qty==null||qty==="") ? "" : `${qty}${unit==="g"?"":" "}${unitSuffix(unit,qty)}`;
// same idea but for larger prepared/sold/excess quantities — grams roll up to kg, counts stay as-is
const formatQtyLong = (qty, unit) => unit==="g" ? `${(qty/1000).toFixed(2)}kg` : `${Number(qty.toFixed(2))} ${unitSuffix(unit,qty)}`;
const toProperCase = str => str.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// Uploaded photos go straight into the database as base64 text (no object
// storage), so an uncompressed phone photo lands directly in every fetch of
// that table forever. Downscale + re-encode as JPEG before storing so a
// typical product/dish/menu photo runs ~15-30KB instead of 100-165KB.
const compressImageFile = (file, maxDim=800, quality=0.7) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Could not read that image file."));
    img.onload = () => {
      let { width, height } = img;
      if(width>maxDim || height>maxDim){
        if(width>=height){ height = Math.round(height*(maxDim/width)); width = maxDim; }
        else { width = Math.round(width*(maxDim/height)); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

/* ── footer (shown on every page, fixed height so it never shifts between pages) ── */
const FOOTER_HEIGHT = 156;
const Footer = ({offsetLeft=0}) => (
  <footer style={{background:"#fff",borderTop:"1px solid #E5E7EB",flexShrink:0,height:FOOTER_HEIGHT,overflow:"hidden",display:"flex",alignItems:"center",marginLeft:offsetLeft,transition:"margin-left 0.25s"}}>
    <div style={{maxWidth:1100,margin:"0 auto",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"0 1.5rem"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24,flexWrap:"wrap"}}>
        <img src="/logos/koufu-globe.webp" alt="Kou Fu" style={{height:42,width:"auto"}} />
        <img src="/logos/koufu-mis.webp" alt="Kou Fu MIS" style={{height:30,width:"auto"}} />
        <img src="/logos/colortree-mark.png" alt="Colortree" style={{height:34,width:"auto"}} />
      </div>
      <div style={{display:"flex",gap:32,flexWrap:"wrap",justifyContent:"center",textAlign:"center"}}>
        <div style={{maxWidth:280}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:2}}>Kou Fu Color Printing Corporation</div>
          <div style={{fontSize:11,color:"#9CA3AF",lineHeight:1.4}}>Lots 6-7, Block 3, Phase 2, Mountview Industrial Complex, 4116 Carmona</div>
        </div>
        <div style={{maxWidth:280}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:2}}>Colortree Label Corporation</div>
          <div style={{fontSize:11,color:"#9CA3AF",lineHeight:1.4}}>Lot 3-5, Block 8, Phase 2, Mountview Industrial Complex, Carmona, Cavite</div>
        </div>
      </div>
      <div style={{fontSize:11,color:"#D1D5DB"}}>© 2026 KFCP MIS. All rights reserved.</div>
    </div>
  </footer>
);

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
    receipt: <><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></>,
    expense: <><path d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 7V5a2 2 0 00-2-2H8a2 2 0 00-2 2v2"/><circle cx="16" cy="13.5" r="1.5"/></>,
    scale: <><path d="M12 3v18"/><path d="M5 7l-3 7a4 4 0 008 0z"/><path d="M19 7l-3 7a4 4 0 008 0z"/><path d="M3 7h18"/><path d="M9 3h6"/></>,
    idea: <><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7c.5.4.8 1 .8 1.7v.6h6.4v-.6c0-.7.3-1.3.8-1.7A7 7 0 0012 2z"/></>,
    register: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3"/><line x1="2" y1="13" x2="22" y2="13"/><line x1="8" y1="17" x2="10" y2="17"/></>,
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
    { id:"shortorder",label:"Short Order",     icon:"menu" },
    { id:"myorders",  label:"My Orders",       icon:"orders" },
    { id:"cart",      label:"Cart",            icon:"cart" },
    { id:"visitormenu",label:"Visitor Menu",   icon:"register" },
    { id:"mgmenu",    label:"Manage Menu",     icon:"manage" },
    { id:"mgshortorder",label:"Manage Short Order", icon:"manage" },
    { id:"mgvisitormenu",label:"Manage Visitor Menu", icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",   icon:"manage" },
    { id:"otc",       label:"Over the Counter",icon:"register" },
    { id:"mgproducts",label:"Manage Groceries", icon:"products" },
    { id:"rawmaterials",label:"Raw Materials", icon:"scale" },
    { id:"dishes",    label:"Manage Dishes",   icon:"utensils" },
    { id:"receipts",  label:"Receipts",        icon:"receipt" },
    { id:"expenses",  label:"Expenses",        icon:"expense" },
    { id:"personnel", label:"Personnel",       icon:"people" },
    { id:"history",   label:"Overall History", icon:"history" },
    { id:"suggestions",label:"Suggestions",    icon:"idea" },
  ],
  "staff-admin": [
    { id:"visitormenu",label:"Visitor Menu",   icon:"register" },
    { id:"mgmenu",    label:"Manage Menu",     icon:"manage" },
    { id:"mgshortorder",label:"Manage Short Order", icon:"manage" },
    { id:"mgvisitormenu",label:"Manage Visitor Menu", icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",   icon:"manage" },
    { id:"otc",       label:"Over the Counter",icon:"register" },
    { id:"mgproducts",label:"Manage Groceries", icon:"products" },
    { id:"rawmaterials",label:"Raw Materials", icon:"scale" },
    { id:"dishes",    label:"Manage Dishes",   icon:"utensils" },
    { id:"receipts",  label:"Receipts",        icon:"receipt" },
    { id:"expenses",  label:"Expenses",        icon:"expense" },
    { id:"personnel", label:"Personnel",       icon:"people" },
    { id:"history",   label:"Overall History", icon:"history" },
    { id:"suggestions",label:"Suggestions",    icon:"idea" },
  ],
  staff: [
    { id:"mgmenu",    label:"Manage Menu",     icon:"manage" },
    { id:"mgorders",  label:"Manage Orders",   icon:"manage" },
    { id:"otc",       label:"Over the Counter",icon:"register" },
    { id:"suggestions",label:"Suggestions",    icon:"idea" },
  ],
  user: [
    { id:"menu",     label:"Menu",            icon:"menu" },
    { id:"shortorder",label:"Short Order",    icon:"menu" },
    { id:"myorders", label:"My Orders",       icon:"orders" },
    { id:"cart",     label:"Cart",            icon:"cart" },
    { id:"suggestions",label:"Suggestions",   icon:"idea" },
  ],
};
NAV.superadmin = NAV.admin;

// Module-scope (not redefined on every KFCanteen render) so React keeps the
// same component identity across renders -- otherwise every keystroke in the
// reply box would tear down and rebuild this whole subtree, dropping focus
// after each letter (had to click back into the field to type the next one).
const SuggestionThread = ({ s, suggestionReplies, replyDrafts, replyErrors, currentUserId, suggestionAuthorLabel, deleteSuggestionReply, submitSuggestionReply, setReplyDrafts, setReplyErrors }) => {
  const replies = suggestionReplies.filter(r=>r.suggestionId===s.id);
  const draft = replyDrafts[s.id]||"";
  const replyError = replyErrors[s.id]||"";
  return (
    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6"}}>
      {replies.map(r=>{
        const isAdminMsg = r.authorRole==="admin"||r.authorRole==="superadmin"||r.authorRole==="staff-admin";
        return (
          <div key={r.id} style={{background:isAdminMsg?PURPLE_LIGHT:"#F9FAFB",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
            <div style={{fontSize:12,color:"#111"}}>{r.content}</div>
            <div style={{fontSize:10,color:"#9CA3AF",marginTop:4,display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontWeight:600,color:isAdminMsg?PURPLE:"#6B7280"}}>{suggestionAuthorLabel(r.authorId,r.authorRole,r.authorName)}</span>
              <span>· {new Date(r.createdAt).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} · {new Date(r.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
              {r.authorId===currentUserId&&<button onClick={()=>deleteSuggestionReply(r.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",padding:0,marginLeft:"auto",fontSize:10,fontWeight:600}}>Delete</button>}
            </div>
          </div>
        );
      })}
      <div style={{display:"flex",gap:6,marginTop:6}}>
        <input value={draft} onChange={e=>{setReplyDrafts(prev=>({...prev,[s.id]:e.target.value})); if(replyErrors[s.id]) setReplyErrors(prev=>({...prev,[s.id]:""}));}}
          onKeyDown={e=>{if(e.key==="Enter"&&draft.trim()) submitSuggestionReply(s.id);}}
          placeholder="Write a reply..."
          style={{flex:1,fontSize:12,padding:"7px 10px",borderRadius:7,border:replyError?"1.5px solid #EF4444":"1.5px solid #E5E7EB",outline:"none",boxSizing:"border-box"}} />
        <button onClick={()=>submitSuggestionReply(s.id)} disabled={!draft.trim()}
          style={{background:draft.trim()?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:7,padding:"7px 14px",cursor:draft.trim()?"pointer":"not-allowed",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
          Reply
        </button>
      </div>
      {replyError&&<div style={{marginTop:6,fontSize:11,color:"#EF4444",fontWeight:600}}>⚠️ {replyError}</div>}
    </div>
  );
};

// Module-scope for the same reason as SuggestionThread above -- both are
// fully prop-driven already (no closures on outer state), so hoisting them
// out is a pure relocation, no logic changes.
const FixedMenuManager = ({ label, icon, items, search, setSearch, onToggle, onRemove, onAddClick, Empty }) => {
  const filtered = items.filter(i=>i.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
          <Icon name={icon} size={20} color={PURPLE} /> {label}
        </h2>
        <button onClick={onAddClick} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
          <Icon name="plus" size={14} color="#fff" /> Add Item
        </button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",marginBottom:16,maxWidth:340}}>
        <Icon name="search" size={15} color="#9CA3AF" />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items..."
          style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
        {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(item=>(
          <div key={item.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 16px",display:"flex",alignItems:"center",gap:12,opacity:item.available===false?0.7:1}}>
            <div style={{width:52,height:52,borderRadius:10,background:PURPLE_LIGHT,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
              {item.isPhoto&&item.img ? <img src={item.img} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : (item.img||"🍽️")}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
              <div style={{fontSize:12,color:"#6B7280",display:"flex",gap:8,flexWrap:"wrap",marginTop:2}}>
                {item.cat&&<span>{item.cat}</span>}
                {item.sizes&&item.sizes.length>0 ? (
                  <span style={{color:PURPLE,fontWeight:600}}>{item.sizes.map(s=>`${s.label} ₱${s.price}`).join(" · ")}</span>
                ) : (
                  <span style={{color:PURPLE,fontWeight:600}}>₱{item.price}</span>
                )}
              </div>
            </div>
            <span style={{fontSize:11,background:item.available!==false?"#D1FAE5":"#FEE2E2",color:item.available!==false?"#065F46":"#991B1B",padding:"3px 10px",borderRadius:20,fontWeight:600,whiteSpace:"nowrap"}}>
              {item.available!==false?"Available":"Unavailable"}
            </span>
            <button onClick={()=>onToggle(item.id)} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,color:"#374151",fontWeight:500,whiteSpace:"nowrap"}}>Toggle</button>
            <button onClick={()=>onRemove(item.id)} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500,flexShrink:0}}>
              <Icon name="trash" size={13} color="#991B1B" /> Remove
            </button>
          </div>
        ))}
        {filtered.length===0&&<Empty msg="No items found" sub="Try a different search, or add a new item." />}
      </div>
    </div>
  );
};

const AddFixedMenuItemModal = ({ title, newItem, setNewItem, dragOver, setDragOver, photoInputRef, handlePhotoFile, onSave, onClose, showSizes }) => {
  const usingSizes = showSizes && newItem.sizes && newItem.sizes.length>0;
  const hasValidSize = usingSizes && newItem.sizes.some(s=>s.label.trim()&&parseFloat(s.price)>0);
  const canSave = newItem.name && (usingSizes ? hasValidSize : newItem.price);
  return (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
    <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
      <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>{title}</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{padding:"22px",display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Photo</label>
          <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handlePhotoFile(e.dataTransfer.files[0]);}}
            onClick={()=>photoInputRef.current?.click()}
            style={{border:`2px dashed ${dragOver?PURPLE:"#D1D5DB"}`,borderRadius:12,padding:"1.25rem",textAlign:"center",cursor:"pointer",background:dragOver?PURPLE_LIGHT:"#FAFAFA",transition:"all 0.15s",position:"relative",minHeight:110,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
            {newItem.photo ? (
              <><img src={newItem.photo} alt="preview" style={{maxHeight:86,maxWidth:"100%",borderRadius:10,objectFit:"cover"}} />
                <button onClick={e=>{e.stopPropagation();setNewItem(p=>({...p,photo:null}));}} style={{position:"absolute",top:8,right:8,background:"#EF4444",border:"none",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </>
            ) : (
              <><div style={{width:36,height:36,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="menu" size={16} color={PURPLE} /></div>
                <div style={{fontSize:12,fontWeight:600,color:"#374151"}}>Drop photo here or click to browse</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:"#9CA3AF"}}>or use emoji:</span>
                  <input value={newItem.img} onChange={e=>setNewItem(p=>({...p,img:e.target.value}))} onClick={e=>e.stopPropagation()}
                    style={{width:48,fontSize:18,borderRadius:8,border:"1px solid #E5E7EB",padding:"3px 5px",textAlign:"center",background:"#fff"}} />
                </div>
              </>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handlePhotoFile(e.target.files[0])} />
          </div>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Item Name</label>
          <input value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="e.g. Chicken Adobo"
            style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:usingSizes?"1fr":"1fr 1fr",gap:10}}>
          <div>
            <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Category</label>
            <select value={newItem.cat} onChange={e=>setNewItem(p=>({...p,cat:e.target.value}))}
              style={{width:"100%",fontSize:13,padding:"10px 8px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
              {["BREAKFAST","LUNCH","SNACK"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          {!usingSizes&&(
            <div>
              <label style={{fontSize:12,fontWeight:600,color:"#059669",display:"block",marginBottom:6}}>Price (₱)</label>
              <input value={newItem.price} onChange={e=>setNewItem(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0"
                style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #A7F3D0",background:"#F0FDF4",color:"#111",boxSizing:"border-box",outline:"none"}} />
            </div>
          )}
        </div>
        {showSizes&&(
          <div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:"#374151",cursor:"pointer",marginBottom:usingSizes?10:0}}>
              <input type="checkbox" checked={usingSizes} onChange={e=>{
                if(e.target.checked) setNewItem(p=>({...p, sizes:[{label:"",price:""}]}));
                else setNewItem(p=>({...p, sizes:[]}));
              }} />
              This item has multiple sizes (customer must pick one)
            </label>
            {usingSizes&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {newItem.sizes.map((s,i)=>(
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input value={s.label} onChange={e=>setNewItem(p=>({...p,sizes:p.sizes.map((x,xi)=>xi===i?{...x,label:e.target.value}:x)}))}
                      placeholder="e.g. Small" style={{flex:2,fontSize:13,padding:"8px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    <input value={s.price} onChange={e=>setNewItem(p=>({...p,sizes:p.sizes.map((x,xi)=>xi===i?{...x,price:e.target.value}:x)}))}
                      placeholder="₱0.00" type="number" min="0" style={{flex:1,fontSize:13,padding:"8px 10px",borderRadius:8,border:"1.5px solid #A7F3D0",background:"#F0FDF4",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    <button onClick={()=>setNewItem(p=>({...p,sizes:p.sizes.filter((_,xi)=>xi!==i)}))} disabled={newItem.sizes.length===1}
                      style={{background:"none",border:"none",cursor:newItem.sizes.length===1?"not-allowed":"pointer",padding:4,flexShrink:0}}>
                      <Icon name="trash" size={14} color={newItem.sizes.length===1?"#D1D5DB":"#EF4444"} />
                    </button>
                  </div>
                ))}
                <button onClick={()=>setNewItem(p=>({...p,sizes:[...p.sizes,{label:"",price:""}]}))}
                  style={{alignSelf:"flex-start",background:"none",border:"none",color:PURPLE,fontSize:12,fontWeight:700,cursor:"pointer",padding:0,marginTop:2}}>
                  + Add Size
                </button>
              </div>
            )}
          </div>
        )}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={onClose} style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
          <button onClick={onSave} disabled={!canSave}
            style={{flex:2,background:canSave?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:canSave?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Icon name="plus" size={15} color="#fff" /> Add Item
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};

/* ── Food card ──
   Module-level (not defined inside KFCanteen) so it keeps a stable identity
   across renders -- a component defined inside another component's body
   gets recreated as a "new" component type on every parent re-render,
   which makes React tear down and rebuild every card in the grid instead
   of just updating them, visually looking like the page reloading. */
const FoodCard = ({item, onAdd, isPastDate, scheduledDate, cutoffPassed, isAdminLike, role}) => {
  const outOfStock = item.available===false || (item.stock!==undefined && item.stock<=0);
  const cantOrder = outOfStock || isPastDate || cutoffPassed;
  return (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden",display:"flex",flexDirection:"column",transition:"box-shadow 0.15s",opacity:cantOrder?0.7:1}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=cantOrder?"none":"0 4px 16px rgba(107,33,168,0.10)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{height:130,background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
        {item.isPhoto&&(item.img||item.photo)
          ? <img src={item.img||item.photo} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
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
          <span>{unitIcon(item.servingUnit)}</span>
          <span>{formatServing(item.grams,item.servingUnit)} per serving</span>
        </div>}
        {/* buy/sell price — admin & staff only */}
        {(isAdminLike||role==="staff-admin"||role==="staff") && item.buyPrice!=null ? (
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#EF4444",fontWeight:600}}>Buy ₱{item.buyPrice}</span>
              <span style={{fontSize:10,color:"#D1D5DB"}}>→</span>
              <span style={{fontSize:11,color:"#059669",fontWeight:600}}>Sell ₱{item.price}</span>
              <span style={{fontSize:10,color:PURPLE,fontWeight:700,background:PURPLE_LIGHT,borderRadius:10,padding:"1px 6px"}}>+₱{(item.price-item.buyPrice).toFixed(0)}</span>
            </div>
            <div style={{color:PURPLE,fontWeight:700,fontSize:16}}>₱{item.price}</div>
          </div>
        ) : item.sizes&&item.sizes.length>0 ? (
          <div style={{color:PURPLE,fontWeight:700,fontSize:16}}>From ₱{Math.min(...item.sizes.map(s=>s.price))}</div>
        ) : (
          <div style={{color:PURPLE,fontWeight:700,fontSize:16}}>₱{item.price}</div>
        )}
        {isPastDate
          ? <div style={{textAlign:"center",fontSize:12,color:"#9CA3AF",padding:"7px",background:"#F9FAFB",borderRadius:8,marginTop:"auto",fontWeight:600}}>📅 Past — View Only</div>
          : cutoffPassed
          ? <div style={{textAlign:"center",fontSize:12,color:"#92400E",padding:"7px",background:"#FEF3C7",borderRadius:8,marginTop:"auto",fontWeight:600}}>⏰ Cutoff Passed</div>
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

export default function KFCanteen() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username:"", password:"" });
  const [loginError, setLoginError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [activeTab, setActiveTab] = useState("menu");
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({ selectedUserId:"", phone:"", email:"", plant:"", password:"", confirmPassword:"", regCode:"", codeVerified:false });
  const [registerShowConfirm, setRegisterShowConfirm] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [nameSearch, setNameSearch] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerShowPass, setRegisterShowPass] = useState(false);
  const [showEmployeeCheck, setShowEmployeeCheck] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [registerType, setRegisterType] = useState(null); // "employee" | "outside"
  const [outsideForm, setOutsideForm] = useState({ name:"", email:"", phone:"", password:"", confirmPassword:"" });
  const [outsideShowPass, setOutsideShowPass] = useState(false);
  const [outsideShowConfirm, setOutsideShowConfirm] = useState(false);
  const [outsideError, setOutsideError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  useEffect(() => {
    fetchUsers().then(rows => { setUsers(rows); setUsersLoading(false); });
  }, []);
  // Restore the logged-in session after a browser refresh (currentUser is
  // otherwise pure in-memory React state, so a refresh used to always bounce
  // back to the login screen). Runs once, right after users finishes its
  // first load -- not on later realtime updates to `users`, since usersLoading
  // only flips true->false a single time. Intentionally skips the login
  // flow's credit-reset-on-16th/1st check: repeating that on every
  // refresh would let a user reset their balance back to full as many times
  // as they refresh the page that day.
  useEffect(() => {
    if(usersLoading || currentUser) return;
    const savedId = localStorage.getItem("kfcanteen_uid");
    if(!savedId) return;
    const found = users.find(u=>u.id===savedId && u.registered);
    if(!found){ localStorage.removeItem("kfcanteen_uid"); return; }
    setCurrentUser(found);
    setActiveTab(found.role==="user"?"menu":(found.role==="admin"||found.role==="superadmin")?"menu":found.role==="staff-admin"?"mgmenu":"mgorders");
  }, [usersLoading]);
  const [creditNotif, setCreditNotif] = useState(false);
  const [editCreditId, setEditCreditId] = useState(null);
  const [editCreditVal, setEditCreditVal] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [personnelTab, setPersonnelTab] = useState("registered"); // "registered" | "unregistered"
  const [editRoleId, setEditRoleId] = useState(null);
  const [editPlantId, setEditPlantId] = useState(null);
  const [editEmployeeTarget, setEditEmployeeTarget] = useState(null); // user object being edited, or null
  const [editEmployeeForm, setEditEmployeeForm] = useState({name:"",idNumber:"",department:"",position:"",company:"",phone:"",username:""});
  const [editEmployeeSubmitting, setEditEmployeeSubmitting] = useState(false);
  const [editEmployeeError, setEditEmployeeError] = useState("");
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState({done:0, total:0});
  const emptyEmployeeRow = () => ({id:Date.now()+Math.random(), idNumber:"", name:"", department:"", position:"", company:"", creditLimit:"", plant:"KF Main"});
  const [newEmployee, setNewEmployee] = useState({rows:[{id:1, idNumber:"", name:"", department:"", position:"", company:"", creditLimit:"", plant:"KF Main"}]});
  const [addEmployeeError, setAddEmployeeError] = useState("");
  const [addEmployeeSubmitting, setAddEmployeeSubmitting] = useState(false);
  const [selectedUnregisteredIds, setSelectedUnregisteredIds] = useState([]);
  const [showBulkRemoveConfirm, setShowBulkRemoveConfirm] = useState(false);
  const [bulkRemoveSubmitting, setBulkRemoveSubmitting] = useState(false);
  const [bulkRemoveError, setBulkRemoveError] = useState("");
  const [resetTargets, setResetTargets] = useState([]);
  const [resetStage, setResetStage] = useState("choose");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [selectedRegisteredIds, setSelectedRegisteredIds] = useState([]);
  const [showBulkCreditInput, setShowBulkCreditInput] = useState(false);
  const [bulkCreditLimitVal, setBulkCreditLimitVal] = useState("");
  const [bulkActionSubmitting, setBulkActionSubmitting] = useState(false);
  const [bulkActionError, setBulkActionError] = useState("");

  // menu / filter state — keyed by traditional calendar week (e.g. "2026-30"), then Mon-Sat day name
  const [menu, setMenu] = useState({});
  useEffect(() => { fetchMenu().then(setMenu); }, []);
  const [selectedDate, setSelectedDate] = useState(getDefaultMenuDate);
  const selectedDay = getDateKey(selectedDate); // the Mon-Sat day name for menu lookup
  const selectedWeekKey = getWeekKey(selectedDate);
  const [mealCat, setMealCat] = useState("ALL");
  const [menuView, setMenuView] = useState("Weekly Menu"); // "Weekly Menu" | "Groceries"
  const [searchQ, setSearchQ] = useState("");

  // cart & orders
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  useEffect(() => { fetchOrders().then(setOrders); }, []);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderRolledOver, setOrderRolledOver] = useState(false);
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [orderPlant, setOrderPlant] = useState("");

  // remarks + drink-upsell prompt shared by Short Order and Visitor Menu
  const [addOptionsItem, setAddOptionsItem] = useState(null); // {item, onConfirm(remarks, drinks, size)}
  const [addOptionsRemarks, setAddOptionsRemarks] = useState("");
  const [addOptionsDrinks, setAddOptionsDrinks] = useState({}); // {productId: qty}
  const [addOptionsSize, setAddOptionsSize] = useState(null); // {label, price} — required when item.sizes is non-empty

  // Weekly Menu cart drink upsell -- shown once at checkout time (Place Order
  // click), not per-item like addOptions above. Always skippable.
  const [showDrinkUpsell, setShowDrinkUpsell] = useState(false);
  const [drinkUpsellQtys, setDrinkUpsellQtys] = useState({}); // {productId: qty}

  // visitor menu (admin/staff-admin only, fixed menu, own inline checkout)
  const [visitorCart, setVisitorCart] = useState([]);
  const [visitorMenuDone, setVisitorMenuDone] = useState(false);
  const [visitorMgSearch, setVisitorMgSearch] = useState("");
  const [shortOrderMgSearch, setShortOrderMgSearch] = useState("");

  // over the counter (staff-encoded walk-up sale)
  const [otcType, setOtcType] = useState(null); // "employee" | "visitor" | "guard"
  const [otcDate, setOtcDate] = useState(null); // YYYY-MM-DD when backdating a past-day sale, else null (= today)
  const [showOtcDatePicker, setShowOtcDatePicker] = useState(false);
  const [otcSearch, setOtcSearch] = useState("");
  const [otcCustomer, setOtcCustomer] = useState(null); // employee user object OR {name} for guest
  const [otcCart, setOtcCart] = useState([]);
  const [otcPaymentModal, setOtcPaymentModal] = useState(false);
  const [otcDone, setOtcDone] = useState(false);
  const [otcMenuSearch, setOtcMenuSearch] = useState("");
  const [otcProductSearch, setOtcProductSearch] = useState("");

  // manage menu add form
  const [showAddItem, setShowAddItem] = useState(null);
  const [newItem, setNewItem] = useState({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"", days:[], weeks:[], dishId:null });
  const [dishOriginContext, setDishOriginContext] = useState(null); // remembers which Add Menu Item slot to return to after creating a dish from within it

  // other products category
  const [orderSearch, setOrderSearch] = useState("");
  const [orderPlantFilter, setOrderPlantFilter] = useState("All");
  const [orderShowAllDates, setOrderShowAllDates] = useState(true);
  const [orderDateFilter, setOrderDateFilter] = useState(toDateKey(new Date()));
  const [paymentModal, setPaymentModal] = useState(null);
  const [orderDetailModal, setOrderDetailModal] = useState(null);
  const [editOrderModal, setEditOrderModal] = useState(null); // {orderId, items, catalogSearch} -- working copy while staff-admin fixes an uncollected order
  const [otherCat, setOtherCat] = useState("All");
  const [filterCat, setFilterCat] = useState("All");
  const [otherProducts, setOtherProducts] = useState([]);
  useEffect(() => { fetchProducts().then(setOtherProducts); }, []);
  const [shortOrderItems, setShortOrderItems] = useState([]);
  useEffect(() => { fetchShortOrderItems().then(setShortOrderItems); }, []);
  const [visitorMenuItems, setVisitorMenuItems] = useState([]);
  useEffect(() => { fetchVisitorMenuItems().then(setVisitorMenuItems); }, []);
  const [mgDay, setMgDay] = useState(TODAY);
  const [mgDate, setMgDate] = useState(new Date(TODAY_DATE));
  const mgWeekKey = getWeekKey(mgDate);
  const mgWeekNumber = getWeekNumber(mgDate);
  const [showMgCal, setShowMgCal] = useState(false);
  const [mgCalYear, setMgCalYear] = useState(TODAY_DATE.getFullYear());
  const [mgCalMonth, setMgCalMonth] = useState(TODAY_DATE.getMonth());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [stockAddVal, setStockAddVal] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [myOrderSearch, setMyOrderSearch] = useState("");
  const [editPlantOrderId, setEditPlantOrderId] = useState(null); // orderId whose inline plant-edit is open
  const [editPlantValue, setEditPlantValue] = useState("");
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState(null); // orderId pending cancel confirmation
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window!=="undefined" ? window.innerWidth>=1024 : true);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth>=1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [historyTab, setHistoryTab] = useState("orders");
  const [salesDate, setSalesDate] = useState(TODAY_DATE);
  const [showSalesCalendar, setShowSalesCalendar] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [expenseMonth, setExpenseMonth] = useState(TODAY_DATE.getMonth());
  const [expenseYear, setExpenseYear] = useState(TODAY_DATE.getFullYear());
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseUseRange, setExpenseUseRange] = useState(false);
  const [expenseFromDate, setExpenseFromDate] = useState(toDateKey(new Date(TODAY_DATE.getFullYear(),TODAY_DATE.getMonth(),1)));
  const [expenseToDate, setExpenseToDate] = useState(toDateKey(TODAY_DATE));
  const [expenseExportType, setExpenseExportType] = useState("all");
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [scYear, setScYear] = useState(TODAY_DATE.getFullYear());
  const [scMonth, setScMonth] = useState(TODAY_DATE.getMonth());
  const [inventoryLog, setInventoryLog] = useState([]);
  useEffect(() => { fetchInventoryLog().then(setInventoryLog); }, []);
  const [newProduct, setNewProduct] = useState({ name:"", buyPrice:"", price:"", emoji:"🛍️", category:"Others", stock:"", photo:null });
  const [editProductId, setEditProductId] = useState(null);
  const [productDragOver, setProductDragOver] = useState(false);
  const productPhotoInputRef = useRef(null);
  const handleProductPhotoFile = useCallback((file) => {
    if(!file||!file.type.startsWith("image/")) return;
    compressImageFile(file).then(dataUrl=>setNewProduct(p=>({...p, photo:dataUrl})));
  }, []);
  const [productNameSuggestions, setProductNameSuggestions] = useState([]);

  // raw materials
  const [rawMaterials, setRawMaterials] = useState([]);
  useEffect(() => { fetchRawMaterials().then(setRawMaterials); }, []);
  const [rawMaterialLog, setRawMaterialLog] = useState([]);
  useEffect(() => { fetchRawMaterialLog().then(setRawMaterialLog); }, []);
  const [showAddRawMaterial, setShowAddRawMaterial] = useState(false);
  const emptyRawMaterialRow = () => ({id:Date.now()+Math.random(), name:"", unit:"kg", buyPrice:"", qty:""});
  const [rawMaterialBatch, setRawMaterialBatch] = useState({ date:toDateKey(new Date()), rows:[emptyRawMaterialRow()] });
  const [rawMaterialBatchSubmitting, setRawMaterialBatchSubmitting] = useState(false);
  const [rawMaterialSearch, setRawMaterialSearch] = useState("");
  const [rawStockModal, setRawStockModal] = useState(null);
  const [rawStockAddVal, setRawStockAddVal] = useState("");

  // dishes (recipes)
  const [dishes, setDishes] = useState([]);
  useEffect(() => { fetchDishes().then(setDishes); }, []);
  const [showAddDish, setShowAddDish] = useState(false);
  const [editDishId, setEditDishId] = useState(null);
  const [newDish, setNewDish] = useState({ name:"", cat:"LUNCH", price:"", img:"🍽️", photo:null, grams:"", servingUnit:"g" });
  const [dishDragOver, setDishDragOver] = useState(false);
  const dishPhotoInputRef = useRef(null);
  const handleDishPhotoFile = useCallback((file) => {
    if(!file||!file.type.startsWith("image/")) return;
    compressImageFile(file).then(dataUrl=>setNewDish(p=>({...p, photo:dataUrl})));
  }, []);
  const [dishSearch, setDishSearch] = useState("");
  const [dishLinkSearch, setDishLinkSearch] = useState("");

  // close canteen / excess repurpose-or-waste
  const [plantCloses, setPlantCloses] = useState([]);
  useEffect(() => { fetchPlantCloses().then(setPlantCloses); }, []);
  const [excessDecisions, setExcessDecisions] = useState([]);
  useEffect(() => { fetchExcessDecisions().then(setExcessDecisions); }, []);

  // suggestion box — everyone can submit; admin sees all submissions
  // anonymized, superadmin sees who wrote each one (for moderation)
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => { fetchSuggestions().then(setSuggestions); }, []);
  const [newSuggestionText, setNewSuggestionText] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionReplies, setSuggestionReplies] = useState([]);
  useEffect(() => { fetchSuggestionReplies().then(setSuggestionReplies); }, []);
  const [replyDrafts, setReplyDrafts] = useState({}); // { [suggestionId]: draftText }
  const [replyErrors, setReplyErrors] = useState({}); // { [suggestionId]: errorText }

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closePlant, setClosePlant] = useState("");
  const [excessInputs, setExcessInputs] = useState({}); // menuItemId -> typed leftover qty (string)
  const [repurposeChoiceFor, setRepurposeChoiceFor] = useState(null); // menuItemId currently choosing a repurpose target
  const [repurposeDishSearch, setRepurposeDishSearch] = useState("");
  const [repurposeTargetDish, setRepurposeTargetDish] = useState(null);

  // receipts
  const [receipts, setReceipts] = useState([]);
  useEffect(() => { fetchReceipts().then(setReceipts); }, []);

  // Realtime sync — whenever any of these tables change (from this session,
  // another admin's session, or a direct DB edit), refetch that table so
  // every open tab reflects it within moments instead of only on reload.
  useEffect(() => {
    const channel = supabase
      .channel("db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchUsers().then(rows => { setUsers(rows); setUsersLoading(false); }))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => fetchMenu().then(setMenu))
      .on("postgres_changes", { event: "*", schema: "public", table: "other_products" }, () => fetchProducts().then(setOtherProducts))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchOrders().then(setOrders))
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, () => fetchReceipts().then(setReceipts))
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_log" }, () => fetchInventoryLog().then(setInventoryLog))
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_materials" }, () => fetchRawMaterials().then(setRawMaterials))
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_material_log" }, () => fetchRawMaterialLog().then(setRawMaterialLog))
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () => fetchDishes().then(setDishes))
      .on("postgres_changes", { event: "*", schema: "public", table: "dish_ingredients" }, () => fetchDishes().then(setDishes))
      .on("postgres_changes", { event: "*", schema: "public", table: "plant_closes" }, () => fetchPlantCloses().then(setPlantCloses))
      .on("postgres_changes", { event: "*", schema: "public", table: "dish_excess_decisions" }, () => fetchExcessDecisions().then(setExcessDecisions))
      .on("postgres_changes", { event: "*", schema: "public", table: "suggestions" }, () => fetchSuggestions().then(setSuggestions))
      .on("postgres_changes", { event: "*", schema: "public", table: "suggestion_replies" }, () => fetchSuggestionReplies().then(setSuggestionReplies))
      .on("postgres_changes", { event: "*", schema: "public", table: "short_order_items" }, () => fetchShortOrderItems().then(setShortOrderItems))
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_menu_items" }, () => fetchVisitorMenuItems().then(setVisitorMenuItems))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [newReceipt, setNewReceipt] = useState({ date:toDateKey(new Date()), source:"Grocery", sourceName:"", purchaseType:"Grocery", note:"" });
  const [receiptPhotos, setReceiptPhotos] = useState([]); // [{tempId, photo, amount}]
  const [receiptDragOver, setReceiptDragOver] = useState(false);
  const receiptPhotoInputRef = useRef(null);
  const [viewReceipt, setViewReceipt] = useState(null);
  const handleReceiptPhotoFiles = useCallback((fileList) => {
    Array.from(fileList||[]).forEach(file=>{
      if(!file||!file.type.startsWith("image/")) return;
      // Larger max dimension + higher quality than product/dish photos --
      // receipts need to stay legible (prices, item lines) at higher zoom.
      compressImageFile(file, 1400, 0.8).then(dataUrl=>
        setReceiptPhotos(prev=>[...prev, { tempId:"tmp"+Date.now()+Math.random(), photo:dataUrl, amount:"" }]));
    });
  }, []);


  const cartCount = cart.reduce((s,i)=>s+i.qty,0);
  const cartTotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const role = currentUser?.role;
  // superadmin has every admin permission, plus seeing who wrote a suggestion
  const isAdminLike = role==="admin"||role==="superadmin";
  // Staff-Admin gets the same "All Suggestions" moderation view as Admin
  // (anonymized submitter identity, can reply, counts toward the awaiting-reply
  // badge) — just not the superadmin-only real-identity lookup.
  const canModerateSuggestions = isAdminLike || role==="staff-admin";

  // derived from currently-loaded orders (not a hardcoded/session-local counter) so IDs
  // stay unique across page reloads and separate browser sessions — a fixed starting ref
  // here previously caused every fresh session's first order to collide with any other
  // session's first order (both becoming "KF000023"), silently failing to save.
  const nextOrderId = () => {
    const nums = orders
      .map(o=>/^KF(\d+)$/.exec(o.id))
      .filter(Boolean)
      .map(m=>parseInt(m[1],10));
    const next = (nums.length?Math.max(...nums):22) + 1;
    return "KF" + String(next).padStart(6, "0");
  };
  const handleLogin = () => {
    const usernameInput = loginForm.username.trim();
    const found = users.find(u=>u.username===usernameInput && u.password===loginForm.password && u.registered);
    if (found) {
      // auto-reset credit on the 16th or the 1st of the month
      const today = new Date();
      const day = today.getDate();
      let updatedUser = found;
      if(day===16||day===1) {
        updatedUser = {...found, creditBalance: found.creditLimit};
        setUsers(prev=>prev.map(u=>u.id===found.id?updatedUser:u));
        dbUpdateUser(found.id,{creditBalance:found.creditLimit});
      }
      setCurrentUser(updatedUser);
      localStorage.setItem("kfcanteen_uid", updatedUser.id);
      setLoginError("");
      setActiveTab(found.role==="user"?"menu":(found.role==="admin"||found.role==="superadmin")?"menu":found.role==="staff-admin"?"mgmenu":"mgorders");
      if(updatedUser.creditBalance < 100) setCreditNotif(true);
    } else {
      // An employee whose ID number was already added by an admin but who
      // hasn't completed registration yet has no username/password set —
      // "incorrect password" is misleading for them, since they never set
      // one. Point them to registration instead of implying a typo.
      const unregisteredMatch = users.find(u=>!u.registered && u.isEmployee!==false && (u.idNumber||"").toLowerCase()===usernameInput.toLowerCase());
      if (unregisteredMatch) {
        setLoginError("This ID Number hasn't been registered yet. Tap \"Create Account\" below to register first.");
      } else {
        setLoginError("Incorrect ID Number or password.");
      }
    }
  };
  const handleLogout = () => { setCurrentUser(null); localStorage.removeItem("kfcanteen_uid"); setLoginForm({username:"",password:""}); setCart([]); setLoginError(""); setCreditNotif(false); setSidebarOpen(false); };

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
        wsData.push(["#","Order ID","Customer","Plant","Menu Date","Time","Items","Total","Payment","Status","Received At"]);
        // Data rows - one row per order, items joined in one cell
        ordersToExport.forEach(function(o, idx){
          var itemsCell = o.items.map(function(it){ return it.name+" x"+it.qty; }).join(" | ");
          wsData.push([
            idx+1,
            o.id,
            o.user,
            o.plant||"",
            o.date,
            o.time,
            itemsCell,
            o.total,
            o.paymentType||"Unpaid",
            o.receivedAt?"Received":"Pending",
            o.receivedAt||"",
          ]);
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
          {wch:4},{wch:12},{wch:22},{wch:12},{wch:12},
          {wch:10},{wch:40},{wch:10},{wch:10},{wch:10},{wch:22}
        ];

        // Find header row (row index where headers are)
        var headerRowIdx = wsData.findIndex(function(r){ return r[0]==="#"; });
        var dataRowCount = ordersToExport.length;
        var lastCol = String.fromCharCode(65 + 10); // K (11 columns: A-K)
        var headerRef = "A"+(headerRowIdx+1);
        var lastRef = lastCol+(headerRowIdx+1+dataRowCount);

        // Add autofilter so every column header has a dropdown sort/filter arrow
        ws["!autofilter"] = { ref: headerRef+":"+lastRef };

        // Freeze top rows (info block + header)
        ws["!freeze"] = { xSplit: 0, ySplit: headerRowIdx+1 };

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
        var fileName = "KFCanteen_"+toDateKey(date)+"_"+filterLabel.replace(/ /g,"_")+".xlsx";
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

  /* ── DOWNLOAD EMPLOYEE EXPENSES AS XLSX ── */
  const downloadExpensesExcel = (rows, periodLabel, exportType) => {
    try {
      var isCreditOnly = exportType==="credit";
      var grandCash = rows.reduce(function(s,r){return s+r.cash;},0);
      var grandCredit = rows.reduce(function(s,r){return s+r.credit;},0);
      var grandPending = rows.reduce(function(s,r){return s+r.pending;},0);
      var grandTotal = rows.reduce(function(s,r){return s+r.total;},0);

      var script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.onload = function() {
        var XLSX = window.XLSX;
        var wb = XLSX.utils.book_new();
        var wsData = [
          ["KFCanteen - Employee "+(isCreditOnly?"Credit":"Expense")+" Report"],
          ["Period", periodLabel],
          [],
        ];
        if(isCreditOnly){
          wsData.push(["ID Number","Name","Plant","Orders","Credit (₱)"]);
          rows.forEach(function(r){
            wsData.push([r.idNumber||"—", r.name, r.plant||"—", r.orderCount, r.credit]);
          });
          wsData.push([]);
          wsData.push(["","","","GRAND TOTAL", grandCredit]);
        } else {
          wsData.push(["ID Number","Name","Plant","Orders","Cash (₱)","Credit (₱)","Pending (₱)","Total Spent (₱)"]);
          rows.forEach(function(r){
            wsData.push([r.idNumber||"—", r.name, r.plant||"—", r.orderCount, r.cash, r.credit, r.pending, r.total]);
          });
          wsData.push([]);
          wsData.push(["","","","GRAND TOTAL", grandCash, grandCredit, grandPending, grandTotal]);
        }

        var ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = isCreditOnly
          ? [{wch:14},{wch:22},{wch:14},{wch:9},{wch:14}]
          : [{wch:14},{wch:22},{wch:14},{wch:9},{wch:12},{wch:12},{wch:12},{wch:15}];
        var headerRowIdx = wsData.findIndex(function(r){ return r[0]==="ID Number"; });
        var lastCol = isCreditOnly ? "E" : "H";
        ws["!autofilter"] = { ref: "A"+(headerRowIdx+1)+":"+lastCol+(headerRowIdx+1+rows.length) };
        ws["!freeze"] = { xSplit: 0, ySplit: headerRowIdx+1 };
        XLSX.utils.book_append_sheet(wb, ws, isCreditOnly?"Credit":"Expenses");

        var fileName = "KFCanteen_"+(isCreditOnly?"Credit":"Expenses")+"_"+periodLabel.replace(/[^A-Za-z0-9]+/g,"_")+".xlsx";
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

  const handleRegCodeSubmit = () => {
    if(!registerForm.selectedUserId){ setRegisterError("Please select your name from the list."); return; }
    const emp = users.find(u=>u.id===registerForm.selectedUserId);
    if(!emp){ setRegisterError("Employee not found."); return; }
    if(!registerForm.regCode.trim()){ setRegisterError("Please enter your registration code."); return; }
    if(registerForm.regCode.trim()!==(emp.regCode||"")){ setRegisterError("Incorrect registration code. Contact HR, MIS or General Admin for your assigned code."); return; }
    setRegisterError("");
    setRegisterForm(p=>({...p,codeVerified:true}));
  };

  const handleRegister = () => {
    if(!registerForm.selectedUserId){ setRegisterError("Please select your name from the list."); return; }
    if(!registerForm.codeVerified){ setRegisterError("Please verify your registration code first."); return; }
    const emp = users.find(u=>u.id===registerForm.selectedUserId);
    if(!emp){ setRegisterError("Employee not found."); return; }
    if(!registerForm.phone||!/^[0-9+\-\s]{7,15}$/.test(registerForm.phone)){ setRegisterError("Please enter a valid cellphone number."); return; }
    if(!registerForm.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)){ setRegisterError("Please enter a valid email address."); return; }
    if(!registerForm.plant){ setRegisterError("Please select your assigned plant."); return; }
    if(!registerForm.password){ setRegisterError("Password is required."); return; }
    if(registerForm.password !== registerForm.confirmPassword){ setRegisterError("Passwords do not match."); return; }
    setRegisterError("");
    setShowRegisterConfirm(true);
  };

  const confirmRegister = () => {
    const emp = users.find(u=>u.id===registerForm.selectedUserId);
    if(!emp){ setRegisterError("Employee not found."); setShowRegisterConfirm(false); return; }
    // Username is the employee's ID number — already enforced unique on import/add.
    const username = (emp.idNumber||"").trim() || emp.name.toLowerCase().replace(/\s+/g,".").replace(/[^a-z.]/g,"");
    const regPatch = { username, password: registerForm.password, phone: registerForm.phone.trim(), email: registerForm.email.trim(), plant: registerForm.plant, registered: true };
    setUsers(prev=>prev.map(u=>u.id===registerForm.selectedUserId?{...u,...regPatch}:u));
    dbUpdateUser(registerForm.selectedUserId, regPatch);
    setRegisterForm({ selectedUserId:"", phone:"", email:"", plant:"", password:"", confirmPassword:"", regCode:"", codeVerified:false });
    setNameSearch("");
    setRegisterError("");
    setShowRegisterConfirm(false);
    setShowRegister(false);
    setRegisterType(null);
  };

  const handleOutsideRegister = () => {
    if(!outsideForm.name.trim()){ setOutsideError("Please enter your full name."); return; }
    if(!outsideForm.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(outsideForm.email)){ setOutsideError("Please enter a valid email address."); return; }
    if(!outsideForm.phone||!/^[0-9+\-\s]{7,15}$/.test(outsideForm.phone)){ setOutsideError("Please enter a valid cellphone number."); return; }
    if(!outsideForm.password){ setOutsideError("Password is required."); return; }
    if(outsideForm.password !== outsideForm.confirmPassword){ setOutsideError("Passwords do not match."); return; }
    const name = toProperCase(outsideForm.name.trim());
    const username = name.toLowerCase().replace(/\s+/g,".").replace(/[^a-z.]/g,"");
    if(users.some(u=>u.username===username)){ setOutsideError("An account with a similar name already exists."); return; }
    const newUser = {
      id:"u"+Date.now(),
      username,
      password: outsideForm.password,
      role:"user",
      name,
      avatar: name.split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2),
      plant:"",
      idNumber:"",
      email: outsideForm.email.trim(),
      phone: outsideForm.phone.trim(),
      creditLimit:0,
      creditBalance:0,
      registered:true,
      isEmployee:false,
    };
    setUsers(prev=>[...prev, newUser]);
    dbInsertUser(newUser);
    setOutsideForm({ name:"", email:"", phone:"", password:"", confirmPassword:"" });
    setOutsideError("");
    setShowRegister(false);
    setRegisterType(null);
  };

  /* ── CART ── */
  const addToCart = (item, scheduledDate, extra) => setCart(prev=>{
    const remarks = extra&&extra.remarks ? extra.remarks : null;
    const addQty = (extra&&extra.qty) || 1;
    // Short Order items are "available anytime" (per how they're described
    // to admins/staff-admin managing them) — like Groceries, they're exempt
    // from the weekly-menu-only 6 AM cutoff and closed-plant rollover below,
    // even though they carry a .cat field the same way weekly-menu dishes do.
    const fixedMenu = !!(extra&&extra.fixedMenu);
    // items with remarks get their own cart line (unique key) rather than
    // merging into an existing entry, since different remarks on the same
    // dish shouldn't be silently combined into one note.
    const sizeLabel = (extra&&extra.sizeLabel) || null;
    const key = item.id + (scheduledDate? "_"+scheduledDate.toDateString():"") + (sizeLabel?"_sz"+sizeLabel:"") + (remarks?"_r"+Date.now()+Math.random():"");
    const ex = !remarks && prev.find(c=>c._key===key);
    if(ex) return prev.map(c=>c._key===key?{...c,qty:c.qty+addQty}:c);
    return [...prev,{...item, qty:addQty, buyPrice:item.buyPrice||null, _key:key,
      scheduledDate: scheduledDate&&isFuture(scheduledDate)?scheduledDate:null, remarks, fixedMenu, sizeLabel }];
  });
  const updateQty = (key,delta) => setCart(prev=>prev.map(c=>c._key===key?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));
  const removeFromCart = (key) => setCart(prev=>prev.filter(c=>c._key!==key));

  // shared by self-service checkout and the staff-run Over the Counter
  // sale — deducts Groceries stock and, for any item linked to a
  // dish recipe, the raw materials behind it (excess/repurposed stock
  // first, then purchased stock).
  const deductInventoryForItems = (items) => {
    setOtherProducts(prev => prev.map(p => {
      const item = items.find(c => c.id === p.id);
      if (!item) return p;
      const newStock = Math.max(0, p.stock - item.qty);
      const logEntry = {
        id:"il"+Date.now()+p.id, product:p.name, emoji:p.emoji,
        type:"OUT", qty:item.qty, before:p.stock, after:newStock,
        by:currentUser.name,
        time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
      };
      setInventoryLog(log=>[logEntry,...log]);
      dbInsertLog(logEntry);
      dbUpdateProduct(p.id, { stock:newStock, available: newStock>0 });
      return { ...p, stock: newStock, available: newStock > 0 };
    }));
    // Raw materials are manually encoded by staff-admin (Raw Materials tab) --
    // dishes no longer carry a recipe, so ordering doesn't auto-deduct them.
  };

  // Reverses deductInventoryForItems for a cancelled order. Matches by
  // productId when the order has it (set on every order placed since this
  // feature shipped); falls back to matching by product name for orders
  // placed before productId existed, since their stored items never
  // captured the product's id at all.
  const restockInventoryForItems = (items) => {
    setOtherProducts(prev => prev.map(p => {
      const item = items.find(c => (c.productId ? c.productId===p.id : c.name===p.name));
      if (!item) return p;
      const newStock = p.stock + item.qty;
      const logEntry = {
        id:"il"+Date.now()+p.id, product:p.name, emoji:p.emoji,
        type:"IN", qty:item.qty, before:p.stock, after:newStock,
        by:currentUser.name,
        time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
      };
      setInventoryLog(log=>[logEntry,...log]);
      dbInsertLog(logEntry);
      dbUpdateProduct(p.id, { stock:newStock, available: newStock>0 });
      return { ...p, stock: newStock, available: newStock > 0 };
    }));
  };

  const placeOrder = () => {
    if(!cart.length) return;
    const plant = orderPlant || currentUser.plant || "KF Main";
    // Only weekly-menu dishes (item.cat set) with no scheduled (advance)
    // date count as "today" ordering — Groceries (no .cat) never have a
    // scheduledDate either, so they must be explicitly excluded here rather
    // than lumped in as "not advance", or a Groceries-only cart would
    // wrongly get swept up in the closed/cutoff rollover below. Short Order
    // items also carry .cat but are exempt the same way Groceries is (see
    // addToCart's fixedMenu flag) since they're available anytime.
    const nonAdvanceDishes = cart.filter(c=>c.cat&&!c.scheduledDate&&!c.fixedMenu);
    // The Menu screen already blocks adding a dish to cart once its own
    // category's cutoff passes, but guard here too in case one slipped in
    // anyway (e.g. added right before its cutoff, checked out after) or the
    // plant closed since it was added — roll it onto tomorrow rather than
    // blocking the whole order or silently keeping it as a "today" order
    // that can't actually be fulfilled today. If ANY item in the cart is
    // past its own cutoff, the WHOLE order rolls to tomorrow (simplest
    // behavior — a cart is one order with one date, so a still-orderable
    // item riding along with a cut-off one also moves to tomorrow).
    const needsRollover = nonAdvanceDishes.length>0 && (!!isPlantClosed(plant) || nonAdvanceDishes.some(c=>isPastMenuCutoff(c.cat)));
    const orderDate = needsRollover
      ? toDateKey(new Date(Date.now()+86400000))
      : toDateKey(new Date());
    const order={ id:nextOrderId(), user:currentUser.name, userId:currentUser.id,
      date: orderDate,
      plant: plant,
      items:cart.map(c=>({name:c.name,qty:c.qty,price:c.price,grams:c.grams||null,servingUnit:c.servingUnit||"g",buyPrice:c.buyPrice||null,scheduledDate:c.scheduledDate?c.scheduledDate.toLocaleDateString("en-PH",{month:"short",day:"numeric"}):null,remarks:c.remarks||null,size:c.sizeLabel||null,productId:c.id||null})), total:cartTotal, time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      source: cart.some(c=>c.fixedMenu) ? "short-order" : undefined,
      placedAt: new Date().toISOString(), status:"active" };
    setOrders(prev=>[order,...prev]);
    dbInsertOrder(order);
    deductInventoryForItems(cart);
    setCart([]);
    setOrderPlant("");
    setShowPlantModal(false);
    setOrderRolledOver(needsRollover);
    setOrderPlaced(true);
    setTimeout(()=>setOrderPlaced(false),4000);
    setActiveTab("myorders");
  };

  /* ── shared remarks + drink-upsell prompt (Short Order & Visitor Menu) ── */
  // Matches "Powdered Drinks" and "Cold Drinks" (the actual category names
  // in Manage Groceries -- neither is literally "Drinks", so an exact-match
  // filter here always returned zero results everywhere this list is used.
  // Used by the per-item upsell (Short Order / Visitor Menu).
  const availableDrinks = otherProducts.filter(p=>(p.category||"").toLowerCase().includes("drink")&&p.available&&p.stock>0);
  // Weekly Menu checkout upsell only offers Cold Drinks, not Powdered Drinks.
  const availableColdDrinks = otherProducts.filter(p=>(p.category||"").toLowerCase()==="cold drinks"&&p.available&&p.stock>0);
  const openAddOptions = (item, onConfirm) => { setAddOptionsItem({item,onConfirm}); setAddOptionsRemarks(""); setAddOptionsDrinks({}); setAddOptionsSize(null); };
  const closeAddOptions = () => { setAddOptionsItem(null); setAddOptionsRemarks(""); setAddOptionsDrinks({}); setAddOptionsSize(null); };
  const confirmAddOptions = () => {
    if(!addOptionsItem) return;
    if(addOptionsItem.item.sizes&&addOptionsItem.item.sizes.length>0&&!addOptionsSize) return;
    const drinks = availableDrinks.filter(d=>(addOptionsDrinks[d.id]||0)>0).map(d=>({...d, qty:addOptionsDrinks[d.id]}));
    addOptionsItem.onConfirm(addOptionsRemarks.trim()||null, drinks, addOptionsSize);
    closeAddOptions();
  };

  /* ── VISITOR MENU (admin/staff-admin only — fixed menu, own inline checkout) ── */
  const visitorAddItem = (item, remarks) => setVisitorCart(prev=>{
    const key = item.id + (remarks?"_r"+Date.now()+Math.random():"");
    const ex = !remarks && prev.find(c=>c._key===key);
    if(ex) return prev.map(c=>c._key===key?{...c,qty:c.qty+1}:c);
    return [...prev,{...item, qty:1, _key:key, remarks:remarks||null}];
  });
  const visitorAddDrink = (item, qty) => setVisitorCart(prev=>{
    const key = item.id;
    const ex = prev.find(c=>c._key===key);
    if(ex) return prev.map(c=>c._key===key?{...c,qty:c.qty+qty}:c);
    return [...prev,{...item, qty, _key:key, remarks:null}];
  });
  const visitorUpdateQty = (key,delta) => setVisitorCart(prev=>prev.map(c=>c._key===key?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));
  const visitorCartTotal = visitorCart.reduce((s,i)=>s+i.price*i.qty,0);
  const placeVisitorOrder = () => {
    if(!visitorCart.length) return;
    const plant = currentUser.plant||"KF Main";
    const order = {
      id: nextOrderId(),
      user: currentUser.name,
      userId: currentUser.id,
      date: toDateKey(new Date()),
      plant,
      items: visitorCart.map(c=>({name:c.name,qty:c.qty,price:c.price,grams:c.grams||null,servingUnit:c.servingUnit||"g",scheduledDate:null,remarks:c.remarks||null,productId:c.id||null})),
      total: visitorCartTotal,
      time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      source: "visitor-menu",
      encodedBy: currentUser.name,
    };
    setOrders(prev=>[order,...prev]);
    dbInsertOrder(order);
    deductInventoryForItems(visitorCart);
    setVisitorCart([]);
    setVisitorMenuDone(true);
    setTimeout(()=>setVisitorMenuDone(false),3000);
  };

  /* ── OVER THE COUNTER (staff-encoded walk-up sale) ── */
  const resetOtc = () => { setOtcType(null); setOtcDate(null); setShowOtcDatePicker(false); setOtcSearch(""); setOtcCustomer(null); setOtcCart([]); setOtcPaymentModal(false); setOtcMenuSearch(""); setOtcProductSearch(""); };
  const otcAddItem = (item) => setOtcCart(prev=>{
    const ex = prev.find(c=>c.id===item.id);
    if(ex) return prev.map(c=>c.id===item.id?{...c,qty:c.qty+1}:c);
    return [...prev, {...item, qty:1}];
  });
  const otcUpdateQty = (id,delta) => setOtcCart(prev=>prev.map(c=>c.id===id?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0));
  const otcCartTotal = otcCart.reduce((s,i)=>s+i.price*i.qty,0);

  const completeOtcSale = (paymentType) => {
    if(!otcCart.length||!otcCustomer) return;
    const plant = currentUser.plant||"KF Main";
    const isEmployee = otcType==="employee";
    const order = {
      id: nextOrderId(),
      user: otcCustomer.name,
      userId: isEmployee ? otcCustomer.id : null,
      date: otcDate || toDateKey(new Date()),
      plant,
      items: otcCart.map(c=>({name:c.name,qty:c.qty,price:c.price,grams:c.grams||null,servingUnit:c.servingUnit||"g",buyPrice:c.buyPrice||null,scheduledDate:null,productId:c.id||null})),
      total: otcCartTotal,
      time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      paymentType,
      source: "otc",
      encodedBy: currentUser.name,
      guestType: isEmployee ? null : otcType,
    };
    setOrders(prev=>[order,...prev]);
    dbInsertOrder(order);
    deductInventoryForItems(otcCart);
    if(paymentType==="Credit" && isEmployee){
      // Read the LIVE balance from `users`, not otcCustomer.creditBalance --
      // otcCustomer is a one-time snapshot taken when staff searched/selected
      // the employee, and never refreshed afterward. Serving the same person
      // twice in one counter visit without clicking "Start Over" between
      // sales would otherwise compute every sale's deduction from the same
      // stale pre-first-sale balance, silently losing whatever earlier sales
      // in that visit had already deducted.
      const liveUser = users.find(u=>u.id===otcCustomer.id);
      const newBal = Math.max(0,(liveUser?.creditBalance||0)-otcCartTotal);
      setUsers(prev=>prev.map(u=>u.id===otcCustomer.id?{...u,creditBalance:newBal}:u));
      dbUpdateUser(otcCustomer.id, { creditBalance:newBal });
    }
    setOtcCart([]);
    setOtcPaymentModal(false);
    setOtcDone(true);
    setTimeout(()=>setOtcDone(false),3000);
    if(otcDate){
      // Backdating is a catch-up session -- after each sale, go back to
      // "who's this for" for the next past-day customer instead of staying
      // on this one's cart. otcDate/showOtcDatePicker are left alone so the
      // date banner and picked date persist across the whole session.
      setOtcType(null);
      setOtcCustomer(null);
      setOtcSearch("");
      setOtcMenuSearch("");
      setOtcProductSearch("");
    }
  };

  /* ── MENU MGMT ── */
  const addMenuItem = () => {
    if(!newItem.dishId||!newItem.name||!newItem.price||parseFloat(newItem.price)<=0) return;
    const days = newItem.days&&newItem.days.length ? newItem.days : [mgDay];
    const weeks = newItem.weeks&&newItem.weeks.length ? newItem.weeks : [mgWeekKey];
    let skippedDuplicates = 0;
    setMenu(prev=>{
      const next = {...prev};
      weeks.forEach(weekKey=>{
        next[weekKey] = {...(next[weekKey]||{})};
        days.forEach(day=>{
          const existingSlot = next[weekKey][day]||[];
          if(existingSlot.some(i=>i.dishId===newItem.dishId)){ skippedDuplicates++; return; }
          const item={ id:"m"+Date.now()+Math.random().toString(36).slice(2), name:newItem.name, price:parseFloat(newItem.price), available:true, img:newItem.photo||newItem.img||"🍽️", isPhoto:!!newItem.photo, cat:newItem.cat, grams:newItem.grams?Math.max(0,parseFloat(newItem.grams)):null, servingUnit:newItem.servingUnit||"g", dishId:newItem.dishId||null };
          next[weekKey][day] = [...existingSlot, item];
          dbInsertMenuItem(weekKey, day, item);
        });
      });
      return next;
    });
    setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null,grams:"",days:[],weeks:[],dishId:null});
    setShowAddItem(null);
    if(skippedDuplicates>0) alert(`This dish was already on ${skippedDuplicates} of the selected slot${skippedDuplicates>1?"s":""} — skipped to avoid duplicates.`);
  };
  const removeMenuItem = (weekKey,day,id) => { if(!window.confirm("Remove this item from the menu?")) return; setMenu(prev=>({...prev,[weekKey]:{...prev[weekKey],[day]:prev[weekKey][day].filter(i=>i.id!==id)}})); dbDeleteMenuItem(id); };
  const toggleAvail = (weekKey,day,id) => {
    const item = menu[weekKey]?.[day]?.find(i=>i.id===id);
    setMenu(prev=>({...prev,[weekKey]:{...prev[weekKey],[day]:prev[weekKey][day].map(i=>i.id===id?{...i,available:!i.available}:i)}}));
    if(item) dbUpdateMenuItem(id, { available: !item.available });
  };

  const confirmPayment = (orderId, paymentType) => {
    const order = orders.find(o=>o.id===orderId);
    if(!order) return;
    // mark served + save payment type
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,paymentType}:o));
    dbUpdateOrder(orderId, { paymentType });
    // if credit, deduct from user's credit balance -- match by the order's
    // stable userId, not by name. order.user is a frozen name snapshot from
    // when the order was placed, so matching on it breaks silently (no
    // deduction, no error) if the employee's name is ever edited afterward,
    // and worse, would deduct EVERY user sharing that name if two employees
    // happen to have the same one.
    if(paymentType==="Credit"&&order.userId){
      setUsers(prev=>prev.map(u=>{
        if(u.id!==order.userId) return u;
        const newBal = Math.max(0,(u.creditBalance||0)-order.total);
        dbUpdateUser(u.id, { creditBalance: newBal });
        // update currentUser too if it's them
        if(currentUser&&currentUser.id===u.id){
          const updated = {...currentUser, creditBalance:newBal};
          setCurrentUser(updated);
          if(newBal<100) setCreditNotif(true);
        }
        return {...u, creditBalance:newBal};
      }));
    }
    setPaymentModal(null);
  };

  /* ── self-service order edit/cancel (My Orders) ──
     Employees can move the plant or cancel their own self-placed orders
     (Weekly Menu / Short Order -- not OTC or Visitor Menu, which staff
     already completed in person) within 2 hours of placing, but ONLY while
     still Unpaid -- once staff confirms payment (confirmPayment) the
     canteen has already received/served the order, so it's locked
     regardless of how much of the 2 hours is left. Cancelling keeps the
     order in history (status:"cancelled" + cancelledAt) instead of
     deleting it, and restocks the grocery items that were deducted at
     placement. */
  const ORDER_EDIT_WINDOW_MS = 2*60*60*1000;
  const isSelfPlacedOrder = (order) => order.source!=="otc" && order.source!=="visitor-menu";
  const isOrderEditable = (order) => {
    if(!order || !order.placedAt || order.status==="cancelled") return false;
    if(!isSelfPlacedOrder(order)) return false;
    if(order.paymentType) return false; // already confirmed/served by staff
    return (Date.now()-new Date(order.placedAt).getTime()) < ORDER_EDIT_WINDOW_MS;
  };

  const editOrderPlant = (orderId, newPlant) => {
    const order = orders.find(o=>o.id===orderId);
    if(!order || !isOrderEditable(order) || !newPlant || newPlant===order.plant) return;
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,plant:newPlant}:o));
    dbUpdateOrder(orderId, { plant:newPlant });
  };

  const cancelOrder = (orderId) => {
    const order = orders.find(o=>o.id===orderId);
    // isOrderEditable already requires the order to still be Unpaid, so
    // there's never a credit deduction to reverse here -- confirmPayment
    // hasn't run yet.
    if(!order || !isOrderEditable(order)) return;
    const cancelledAt = new Date().toISOString();
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,status:"cancelled",cancelledAt}:o));
    dbUpdateOrder(orderId, { status:"cancelled", cancelledAt });
    restockInventoryForItems(order.items);
  };

  /* ── staff-admin order edit (Manage Orders) ──
     Lets staff-admin fix an order that's placed but not yet collected --
     e.g. an item turns out unavailable -- by swapping, removing, or
     adjusting quantities, for any order source (unlike the employee
     self-edit above, which is Weekly Menu/Short Order only). Only reaches
     grocery stock (dishes were never stock-tracked, same as everywhere
     else); the net qty change per product since the order was placed is
     applied as one delta so re-editing repeatedly doesn't double-count. */
  const isOrderStaffEditable = (order) => order && order.status!=="cancelled" && !order.paymentType;

  const applyInventoryDelta = (oldItems, newItems) => {
    const keyOf = (it) => it.productId || it.name;
    const deltaByKey = {}; // key -> net qty delta (new - old)
    const itemByKey = {};
    oldItems.forEach(it=>{ const k=keyOf(it); deltaByKey[k]=(deltaByKey[k]||0)-it.qty; itemByKey[k]=itemByKey[k]||it; });
    newItems.forEach(it=>{ const k=keyOf(it); deltaByKey[k]=(deltaByKey[k]||0)+it.qty; itemByKey[k]=itemByKey[k]||it; });
    setOtherProducts(prev => prev.map(p => {
      const matchKey = Object.keys(deltaByKey).find(k=>{
        const it = itemByKey[k];
        return it.productId ? it.productId===p.id : it.name===p.name;
      });
      if(!matchKey) return p;
      const delta = deltaByKey[matchKey];
      if(!delta) return p;
      const newStock = Math.max(0, p.stock - delta);
      const logEntry = {
        id:"il"+Date.now()+p.id, product:p.name, emoji:p.emoji,
        type: delta>0 ? "OUT" : "IN", qty: Math.abs(delta), before:p.stock, after:newStock,
        by:currentUser.name,
        time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
      };
      setInventoryLog(log=>[logEntry,...log]);
      dbInsertLog(logEntry);
      dbUpdateProduct(p.id, { stock:newStock, available:newStock>0 });
      return {...p, stock:newStock, available:newStock>0};
    }));
  };

  const openEditOrder = (order) => {
    if(!isOrderStaffEditable(order)) return;
    setEditOrderModal({ orderId: order.id, items: order.items.map(it=>({...it})), catalogSearch:"" });
  };

  const addItemToEditOrder = (item) => setEditOrderModal(prev=>{
    if(!prev) return prev;
    const existingIdx = prev.items.findIndex(it=>(it.productId||it.name)===(item.id||item.name));
    if(existingIdx>=0){
      return {...prev, items: prev.items.map((it,i)=>i===existingIdx?{...it,qty:it.qty+1}:it)};
    }
    const newItem = {name:item.name, qty:1, price:item.price, grams:item.grams||null, servingUnit:item.servingUnit||"g", productId:item.id||null, buyPrice:item.buyPrice||null, remarks:null, scheduledDate:null, size:null};
    return {...prev, items:[...prev.items, newItem]};
  });

  const updateEditOrderItemQty = (idx, delta) => setEditOrderModal(prev=>{
    if(!prev) return prev;
    return {...prev, items: prev.items.map((it,i)=>i===idx?{...it,qty:Math.max(0,it.qty+delta)}:it).filter(it=>it.qty>0)};
  });

  const removeEditOrderItem = (idx) => setEditOrderModal(prev=>{
    if(!prev) return prev;
    return {...prev, items: prev.items.filter((_,i)=>i!==idx)};
  });

  const saveEditOrder = () => {
    if(!editOrderModal) return;
    const order = orders.find(o=>o.id===editOrderModal.orderId);
    if(!order || !isOrderStaffEditable(order)) { setEditOrderModal(null); return; }
    const newItems = editOrderModal.items.filter(it=>it.qty>0);
    if(newItems.length===0) return; // an order can't be edited down to zero items -- Cancel it instead
    const newTotal = newItems.reduce((s,it)=>s+it.price*it.qty,0);
    applyInventoryDelta(order.items, newItems);
    setOrders(prev=>prev.map(o=>o.id===order.id?{...o,items:newItems,total:newTotal}:o));
    dbUpdateOrder(order.id, { items:newItems, total:newTotal });
    setEditOrderModal(null);
  };

  const addOtherProduct = () => {
    if(!newProduct.name||!newProduct.price||!newProduct.stock) return;
    const buyPrice = Math.max(0, parseFloat(newProduct.buyPrice)||0);
    const price = Math.max(0, parseFloat(newProduct.price)||0);
    const stock = Math.max(0, parseInt(newProduct.stock)||0);
    if(price<=0) return;
    const fields = { name:newProduct.name, buyPrice, price, emoji:newProduct.emoji||"🛍️", photo:newProduct.photo||null, isPhoto:!!newProduct.photo, category:newProduct.category||"Others", stock, available:stock>0 };
    if(editProductId){
      setOtherProducts(prev=>prev.map(p=>p.id===editProductId?{...p,...fields}:p));
      dbUpdateProduct(editProductId, fields);
    } else {
      const p = { id:"op"+Date.now(), ...fields };
      setOtherProducts(prev=>[...prev, p]);
      dbInsertProduct(p);
    }
    setNewProduct({ name:"", buyPrice:"", price:"", emoji:"🛍️", category:"Others", stock:"", photo:null });
    setProductNameSuggestions([]);
    setEditProductId(null);
    setShowAddProduct(false);
  };
  const removeOtherProduct = (id) => { if(!window.confirm("Remove this product?")) return; setOtherProducts(prev=>prev.filter(p=>p.id!==id)); dbDeleteProduct(id); };
  const toggleOtherAvail = (id) => {
    const p = otherProducts.find(pp=>pp.id===id);
    setOtherProducts(prev=>prev.map(p=>p.id===id?{...p,available:!p.available}:p));
    if(p) dbUpdateProduct(id, { available: !p.available });
  };
  const updateOtherStock = (id, delta) => setOtherProducts(prev=>prev.map(p=>{
    if(p.id!==id) return p;
    const newStock = Math.max(0, p.stock + delta);
    dbUpdateProduct(id, { stock:newStock, available: newStock>0 });
    return {...p, stock:newStock, available: newStock>0};
  }));

  /* ── SHORT ORDER items (Manage Short Order) ── */
  const [newShortOrderItem, setNewShortOrderItem] = useState({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"", sizes:[] });
  const [showAddShortOrderItem, setShowAddShortOrderItem] = useState(false);
  const [shortOrderDragOver, setShortOrderDragOver] = useState(false);
  const shortOrderPhotoInputRef = useRef(null);
  const handleShortOrderPhotoFile = useCallback((file) => {
    if(!file||!file.type.startsWith("image/")) return;
    compressImageFile(file).then(dataUrl=>setNewShortOrderItem(p=>({...p, photo:dataUrl})));
  }, []);
  const addShortOrderItem = () => {
    const validSizes = (newShortOrderItem.sizes||[]).filter(s=>s.label.trim()&&parseFloat(s.price)>0).map(s=>({label:s.label.trim(), price:parseFloat(s.price)}));
    const usingSizes = validSizes.length>0;
    if(!newShortOrderItem.name) return;
    if(!usingSizes && (!newShortOrderItem.price||parseFloat(newShortOrderItem.price)<=0)) return;
    const price = usingSizes ? Math.min(...validSizes.map(s=>s.price)) : parseFloat(newShortOrderItem.price);
    const item = { id:"so"+Date.now(), name:newShortOrderItem.name, price, available:true, img:newShortOrderItem.photo||newShortOrderItem.img||"🍽️", isPhoto:!!newShortOrderItem.photo, cat:newShortOrderItem.cat, grams:newShortOrderItem.grams?Math.max(0,parseFloat(newShortOrderItem.grams)):null, servingUnit:"g", dishId:null, sizes:validSizes };
    setShortOrderItems(prev=>[...prev, item]);
    dbInsertShortOrderItem(item);
    setNewShortOrderItem({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"", sizes:[] });
    setShowAddShortOrderItem(false);
  };
  const removeShortOrderItem = (id) => { if(!window.confirm("Remove this item?")) return; setShortOrderItems(prev=>prev.filter(i=>i.id!==id)); dbDeleteShortOrderItem(id); };
  const toggleShortOrderAvail = (id) => {
    const item = shortOrderItems.find(i=>i.id===id);
    setShortOrderItems(prev=>prev.map(i=>i.id===id?{...i,available:!i.available}:i));
    if(item) dbUpdateShortOrderItem(id, { available: !item.available });
  };

  /* ── VISITOR MENU items (Manage Visitor Menu) ── */
  const [newVisitorMenuItem, setNewVisitorMenuItem] = useState({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"" });
  const [showAddVisitorMenuItem, setShowAddVisitorMenuItem] = useState(false);
  const [visitorMenuDragOver, setVisitorMenuDragOver] = useState(false);
  const visitorMenuPhotoInputRef = useRef(null);
  const handleVisitorMenuPhotoFile = useCallback((file) => {
    if(!file||!file.type.startsWith("image/")) return;
    compressImageFile(file).then(dataUrl=>setNewVisitorMenuItem(p=>({...p, photo:dataUrl})));
  }, []);
  const addVisitorMenuItem = () => {
    if(!newVisitorMenuItem.name||!newVisitorMenuItem.price||parseFloat(newVisitorMenuItem.price)<=0) return;
    const item = { id:"vm"+Date.now(), name:newVisitorMenuItem.name, price:parseFloat(newVisitorMenuItem.price), available:true, img:newVisitorMenuItem.photo||newVisitorMenuItem.img||"🍽️", isPhoto:!!newVisitorMenuItem.photo, cat:newVisitorMenuItem.cat, grams:newVisitorMenuItem.grams?Math.max(0,parseFloat(newVisitorMenuItem.grams)):null, servingUnit:"g", dishId:null };
    setVisitorMenuItems(prev=>[...prev, item]);
    dbInsertVisitorMenuItem(item);
    setNewVisitorMenuItem({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"" });
    setShowAddVisitorMenuItem(false);
  };
  const removeVisitorMenuItem = (id) => { if(!window.confirm("Remove this item?")) return; setVisitorMenuItems(prev=>prev.filter(i=>i.id!==id)); dbDeleteVisitorMenuItem(id); };
  const toggleVisitorMenuAvail = (id) => {
    const item = visitorMenuItems.find(i=>i.id===id);
    setVisitorMenuItems(prev=>prev.map(i=>i.id===id?{...i,available:!i.available}:i));
    if(item) dbUpdateVisitorMenuItem(id, { available: !item.available });
  };

  /* ── RAW MATERIALS ── */
  // Encodes many raw materials/stock-ins at once, all under one shared date.
  // Matches by name (case-insensitive) against existing materials -- a match
  // adds the entered qty to that material's current stock, otherwise a new
  // material is created with the entered qty as its starting stock. Works
  // off a local running copy of `rawMaterials` (not the outer closure) so
  // two rows for the same new/existing material in one batch stack their
  // quantities correctly instead of one overwriting the other.
  const submitRawMaterialBatch = () => {
    const validRows = rawMaterialBatch.rows.filter(r=>r.name.trim()&&r.qty&&parseFloat(r.qty)>0);
    if(!validRows.length) return;
    setRawMaterialBatchSubmitting(true);
    const dateLabel = formatDateFull(new Date(rawMaterialBatch.date+"T00:00:00"));
    let working = rawMaterials.map(m=>({...m}));
    const newLogs = [];
    validRows.forEach(row=>{
      const qty = parseFloat(row.qty)||0;
      const buyPrice = row.buyPrice.trim()?Math.max(0,parseFloat(row.buyPrice)||0):null;
      const idx = working.findIndex(m=>m.name.trim().toLowerCase()===row.name.trim().toLowerCase());
      if(idx>=0){
        const before = working[idx].stock;
        const after = before + qty;
        working[idx] = {...working[idx], stock:after, ...(buyPrice!=null?{buyPrice}:{})};
        dbUpdateRawMaterial(working[idx].id, buyPrice!=null?{stock:after,buyPrice}:{stock:after});
        newLogs.push({ id:"rml"+Date.now()+Math.random(), rawMaterial:working[idx].name, unit:working[idx].unit, type:"IN", qty, before, after, by:currentUser.name, time:dateLabel });
      } else {
        const m = { id:"rm"+Date.now()+Math.random(), name:toProperCase(row.name.trim()), unit:row.unit, buyPrice:buyPrice||0, stock:qty };
        working.push(m);
        dbInsertRawMaterial(m);
        newLogs.push({ id:"rml"+Date.now()+Math.random(), rawMaterial:m.name, unit:m.unit, type:"IN", qty, before:0, after:qty, by:currentUser.name, time:dateLabel });
      }
    });
    setRawMaterials(working);
    setRawMaterialLog(prev=>[...newLogs.slice().reverse(),...prev]);
    newLogs.forEach(dbInsertRawMaterialLog);
    setRawMaterialBatchSubmitting(false);
    setShowAddRawMaterial(false);
    setRawMaterialBatch({ date:toDateKey(new Date()), rows:[emptyRawMaterialRow()] });
  };
  const removeRawMaterial = (id) => { if(!window.confirm("Remove this raw material? This cannot be undone.")) return; setRawMaterials(prev=>prev.filter(m=>m.id!==id)); dbDeleteRawMaterial(id); };
  const addRawStock = (id, qty) => {
    const material = rawMaterials.find(m=>m.id===id);
    if(!material||!qty||qty<=0) return;
    const before = material.stock;
    const after = before + qty;
    setRawMaterials(prev=>prev.map(m=>m.id===id?{...m,stock:after}:m));
    dbUpdateRawMaterial(id, { stock: after });
    const logEntry = { id:"rml"+Date.now(), rawMaterial:material.name, unit:material.unit, type:"IN", qty, before, after, by:currentUser.name,
      time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) };
    setRawMaterialLog(prev=>[logEntry,...prev]);
    dbInsertRawMaterialLog(logEntry);
  };

  /* ── DISHES (recipes) ── */
  const saveDish = () => {
    if(!newDish.name||!newDish.price||parseFloat(newDish.price)<=0) return;
    const dishData = { name:newDish.name, cat:newDish.cat, price:parseFloat(newDish.price), img:newDish.photo||newDish.img||"🍽️", isPhoto:!!newDish.photo, grams:newDish.grams?Math.max(0,parseFloat(newDish.grams)):null, servingUnit:newDish.servingUnit||"g" };
    if(editDishId){
      setDishes(prev=>prev.map(d=>d.id===editDishId?{...d,...dishData}:d));
      dbUpdateDish(editDishId, dishData);
    } else {
      const dish = { id:"dish"+Date.now(), ...dishData };
      setDishes(prev=>[...prev, dish]);
      dbInsertDish(dish);
      if(dishOriginContext){
        // came from Add Menu Item's "Create New Dish" shortcut — link it and go back
        setNewItem(p=>({...p,dishId:dish.id,name:dish.name,price:String(dish.price),cat:dish.cat||"LUNCH",img:dish.img,photo:dish.isPhoto?dish.img:null,grams:dish.grams?String(dish.grams):"",servingUnit:dish.servingUnit||"g"}));
        setShowAddItem(dishOriginContext);
        setDishOriginContext(null);
      }
    }
    setNewDish({ name:"", cat:"LUNCH", price:"", img:"🍽️", photo:null, grams:"", servingUnit:"g" });
    setEditDishId(null);
    setShowAddDish(false);
  };
  const closeAddDish = () => {
    setShowAddDish(false);
    setEditDishId(null);
    setNewDish({ name:"", cat:"LUNCH", price:"", img:"🍽️", photo:null, grams:"", servingUnit:"g" });
    if(dishOriginContext){
      setShowAddItem(dishOriginContext);
      setDishOriginContext(null);
    }
  };
  const removeDish = (id) => { if(!window.confirm("Remove this dish from the catalog? Any menu items still linked to it will keep showing but can no longer be edited via this dish.")) return; setDishes(prev=>prev.filter(d=>d.id!==id)); dbDeleteDish(id); };

  /* ── CLOSE CANTEEN / EXCESS REPURPOSE-OR-WASTE ── */
  const TODAY_KEY = toDateKey(TODAY_DATE);

  const isPlantClosed = (plant, date=TODAY_KEY) =>
    plantCloses.find(c=>c.plant===plant&&c.date===date&&!c.reopenedAt) || null;

  // No category has a same-day ordering cutoff -- Breakfast, Lunch, and
  // Snack are all orderable any time same-day. Same-day dishes can still
  // roll forward to tomorrow if the plant is closed (Close Canteen), just
  // never due to time of day. Kept as a function (always false) rather than
  // deleted outright since plant-closed rollover logic below still checks
  // it alongside isPlantClosed.
  const isPastMenuCutoff = () => false;

  // "qty" below means "amount in the dish's own serving_unit" — literal grams
  // for weight-tracked dishes, a plain piece/cup count otherwise.
  const getSoldQty = (plant, date, item) => orders
    .filter(o=>o.plant===plant&&o.date===date)
    .flatMap(o=>o.items)
    .filter(it=>it.name===item.name&&it.grams)
    .reduce((s,it)=>s+it.grams*it.qty,0);

  // lists today's active dishes for a plant so staff can log leftovers by eye
  // at closing time — no prepared-quantity tracking needed during the day.
  const getPlantDishList = (plant, date=TODAY_KEY) => {
    const dateObj = new Date(date+"T00:00:00");
    const day = getDateKey(dateObj);
    const weekKey = getWeekKey(dateObj);
    const todaysItems = (menu[weekKey]&&menu[weekKey][day])||[];
    return todaysItems.map(item=>{
      const soldQty = getSoldQty(plant, date, item);
      const decided = excessDecisions.find(d=>d.plant===plant&&d.date===date&&d.menuItemId===item.id);
      return { item, soldQty, decided };
    });
  };

  // repurposeTarget is null for waste, or { type:"dish", dishId, dishName } --
  // logged only, no inventory recalculation: there's no "prepared stock"
  // concept for dishes to add to, so this just records that the excess was
  // turned into another dish for accountability/waste-reduction tracking.
  // (Raw materials are manually encoded now, so there's no recipe to break
  // an excess dish down into anymore.)
  const decideExcess = (plant, date, item, excessQty, decision, repurposeTarget) => {
    const decisionEntry = {
      id:"exd"+Date.now()+item.id+Math.random().toString(36).slice(2), plant, date, menuItemId:item.id, dishName:item.name,
      excessQty, servingUnit:item.servingUnit||"g", decision, decidedBy:currentUser.name, decidedAt:new Date().toISOString(),
      repurposeTargetType: decision==="repurpose" ? repurposeTarget.type : null,
      repurposeTargetId: decision==="repurpose" && repurposeTarget.type==="dish" ? repurposeTarget.dishId : null,
      repurposeTargetName: decision==="repurpose" && repurposeTarget.type==="dish" ? repurposeTarget.dishName : null,
    };
    setExcessDecisions(prev=>[decisionEntry, ...prev]);
    dbInsertExcessDecision(decisionEntry);
  };

  const closeCanteen = (plant) => {
    const entry = { id:"pc"+Date.now(), plant, date:TODAY_KEY, closedBy:currentUser.name };
    setPlantCloses(prev=>[...prev, {...entry, closedAt:new Date().toISOString(), reopenedBy:null, reopenedAt:null}]);
    dbInsertPlantClose(entry);
    setShowCloseModal(false);
  };

  const reopenCanteen = (closeRecord) => {
    if(!window.confirm(`Reopen ${closeRecord.plant} for ${TODAY_KEY}? This unlocks ordering/closing again — it won't undo any repurpose/waste decisions already made.`)) return;
    dbReopenPlantClose(closeRecord.id, currentUser.name);
    setPlantCloses(prev=>prev.map(c=>c.id===closeRecord.id?{...c,reopenedBy:currentUser.name,reopenedAt:new Date().toISOString()}:c));
  };

  /* ── SUGGESTION BOX ── */
  const submitSuggestion = () => {
    const content = newSuggestionText.trim();
    if(!content) return;
    if(containsProfanity(content)){ setSuggestionError("Your suggestion contains language that isn't allowed here. Please rephrase and try again."); return; }
    const entry = { id:"sug"+Date.now()+Math.random().toString(36).slice(2), userId:currentUser.id, userName:currentUser.name, content, createdAt:new Date().toISOString() };
    setSuggestions(prev=>[entry, ...prev]);
    dbInsertSuggestion(entry);
    setNewSuggestionText("");
    setSuggestionError("");
  };
  const submitSuggestionReply = (suggestionId) => {
    const content = (replyDrafts[suggestionId]||"").trim();
    if(!content) return;
    if(containsProfanity(content)){ setReplyErrors(prev=>({...prev, [suggestionId]:"This reply contains language that isn't allowed here. Please rephrase and try again."})); return; }
    const entry = { id:"sr"+Date.now()+Math.random().toString(36).slice(2), suggestionId, authorId:currentUser.id, authorName:currentUser.name, authorRole:role, content, createdAt:new Date().toISOString() };
    setSuggestionReplies(prev=>[...prev, entry]);
    dbInsertSuggestionReply(entry);
    setReplyDrafts(prev=>({...prev, [suggestionId]:""}));
    setReplyErrors(prev=>({...prev, [suggestionId]:""}));
  };
  // Author-only delete. Deleting a suggestion also drops its replies — the DB
  // enforces this via ON DELETE CASCADE, so local state just mirrors it.
  const deleteSuggestion = (suggestionId) => {
    if(!window.confirm("Delete this suggestion? Its replies will be deleted too.")) return;
    setSuggestions(prev=>prev.filter(s=>s.id!==suggestionId));
    setSuggestionReplies(prev=>prev.filter(r=>r.suggestionId!==suggestionId));
    dbDeleteSuggestion(suggestionId);
  };
  const deleteSuggestionReply = (replyId) => {
    if(!window.confirm("Delete this reply?")) return;
    setSuggestionReplies(prev=>prev.filter(r=>r.id!==replyId));
    dbDeleteSuggestionReply(replyId);
  };
  // Human-readable role name used to qualify an anonymized identity, e.g.
  // "Anonymous (Customer)" — everyone can see and reply to every suggestion,
  // but only superadmin ever sees the real name behind it.
  const suggestionRoleLabel = (r) => r==="user"?"Customer":r==="staff-admin"?"Staff-Admin":r==="staff"?"Staff":r==="superadmin"?"Superadmin":"Admin";
  // How to label a thread message's author to the current viewer — admin/superadmin
  // replies always read as "Administrator" unless you ARE superadmin; the original
  // submitter's own follow-ups stay anonymized the same way the suggestion itself is.
  const suggestionAuthorLabel = (msgAuthorId, msgAuthorRole, msgAuthorName) => {
    if(msgAuthorRole==="admin"||msgAuthorRole==="superadmin"||msgAuthorRole==="staff-admin") return role==="superadmin" ? msgAuthorName : "Administrator";
    if(msgAuthorId===currentUser.id) return "You";
    return role==="superadmin" ? msgAuthorName : `Anonymous (${suggestionRoleLabel(msgAuthorRole)})`;
  };
  // A suggestion "needs an admin response" if its most recent activity
  // (last reply, or the original post if there are no replies yet) wasn't
  // authored by an admin/superadmin/staff-admin.
  const suggestionNeedsAdminResponse = (suggestionId) => {
    const replies = suggestionReplies.filter(r=>r.suggestionId===suggestionId);
    if(replies.length===0) return true;
    const last = replies[replies.length-1];
    return !(last.authorRole==="admin"||last.authorRole==="superadmin"||last.authorRole==="staff-admin");
  };
  const suggestionsAwaitingAdmin = canModerateSuggestions ? suggestions.filter(s=>suggestionNeedsAdminResponse(s.id)).length : 0;

  const addReceipts = () => {
    if(!receiptPhotos.length) return;
    const uploadedAt = new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    const newRows = receiptPhotos.map((p,i)=>({
      id:"rc"+Date.now()+i,
      photo:p.photo,
      date:newReceipt.date,
      amount:p.amount?parseFloat(p.amount):null,
      note:newReceipt.note,
      source:newReceipt.source,
      sourceName:newReceipt.sourceName.trim()||null,
      purchaseType:newReceipt.purchaseType,
      by:currentUser.name,
      uploadedAt,
    }));
    setReceipts(prev=>[...newRows,...prev]);
    newRows.forEach(dbInsertReceipt);
    setShowAddReceipt(false);
    setReceiptPhotos([]);
    setNewReceipt({ date:toDateKey(new Date()), source:"Grocery", sourceName:"", purchaseType:"Grocery", note:"" });
  };
  const removeReceipt = (id) => { if(!window.confirm("Remove this receipt? This cannot be undone.")) return; setReceipts(prev=>prev.filter(r=>r.id!==id)); dbDeleteReceipt(id); };

  /* ── FILTERED ITEMS ── */
  const visibleItems = useMemo(()=>{
    let items = (menu[selectedWeekKey]&&menu[selectedWeekKey][selectedDay])||[];
    if(mealCat!=="ALL") items=items.filter(i=>i.cat===mealCat);
    if(searchQ.trim()) items=items.filter(i=>i.name.toLowerCase().includes(searchQ.toLowerCase()));
    return items;
  },[menu,selectedWeekKey,selectedDay,mealCat,searchQ]);

  const otherCats = ["All",...new Set(otherProducts.map(p=>p.category))];
  const visibleOthers = useMemo(()=>{
    let items = otherCat==="All"?otherProducts:otherProducts.filter(p=>p.category===otherCat);
    if(searchQ.trim()) items=items.filter(i=>i.name.toLowerCase().includes(searchQ.toLowerCase()));
    return items;
  },[otherProducts,otherCat,searchQ]);

  if (usersLoading) return (
    <div style={{minHeight:600,display:"flex",alignItems:"center",justifyContent:"center",background:BG,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{textAlign:"center",color:"#9CA3AF"}}>
        <div style={{width:40,height:40,border:`3px solid ${PURPLE_LIGHT}`,borderTopColor:PURPLE,borderRadius:"50%",margin:"0 auto 12px",animation:"spin 0.8s linear infinite"}} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        Loading KFCanteen...
      </div>
    </div>
  );

  /* ════════════════════════════════════════
     LOGIN SCREEN
  ════════════════════════════════════════ */
  if (!currentUser) return (
    <div style={{minHeight:600,display:"flex",flexDirection:"column",background:BG,fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem 1rem"}}>
      <div style={{width:420,background:"#fff",borderRadius:20,boxShadow:"0 8px 40px rgba(0,0,0,0.10)",padding:"2.5rem 2.25rem"}}>
        {/* logo */}
        <div style={{textAlign:"center",marginBottom:"1.75rem"}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:56,height:56,borderRadius:"50%",background:PURPLE_LIGHT,marginBottom:14}}>
            <Icon name="utensils" size={26} color={PURPLE} />
          </div>
          <h1 style={{fontSize:22,fontWeight:700,color:"#1a1a2e",margin:"0 0 6px"}}>{showRegister?"Create Account":"Welcome Back"}</h1>
          <p style={{color:"#9CA3AF",fontSize:13,margin:0}}>{showRegister?(registerType==="outside"?"Create your customer account":"Register as an employee"):"Sign in to order your meal"}</p>
        </div>

        {/* Employee check modal */}
        {showEmployeeCheck&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
              <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Create Account</div>
                <button onClick={()=>setShowEmployeeCheck(false)}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
              <div style={{padding:"26px 22px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:600,color:"#111",marginBottom:22,lineHeight:1.5}}>
                  Are you an employee of<br/><span style={{color:PURPLE}}>Kou Fu Color Printing Corporation</span> or <span style={{color:PURPLE}}>Colortree Label Corporation</span>?
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setRegisterType("outside");setShowRegister(true);setShowEmployeeCheck(false);}}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700}}>
                    No
                  </button>
                  <button onClick={()=>{setRegisterType("employee");setShowRegister(true);setShowEmployeeCheck(false);}}
                    style={{flex:1,background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700}}>
                    Yes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Registration review/confirm modal */}
        {showRegisterConfirm&&(()=>{const emp=users.find(u=>u.id===registerForm.selectedUserId); return emp&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
              <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Confirm Your Details</div>
                <button onClick={()=>setShowRegisterConfirm(false)}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
              <div style={{padding:"22px"}}>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:16}}>Please check that everything below is correct before completing your registration.</div>
                <div style={{background:"#F9FAFB",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {label:"Name", value:emp.name},
                    {label:"ID Number", value:emp.idNumber||"—"},
                    {label:"Username", value:(emp.idNumber||"").trim()||"(from name)"},
                    {label:"Cellphone Number", value:registerForm.phone},
                    {label:"Email Address", value:registerForm.email},
                    {label:"Assigned Plant", value:registerForm.plant},
                  ].map(row=>(
                    <div key={row.label} style={{display:"flex",justifyContent:"space-between",gap:12}}>
                      <span style={{fontSize:12,color:"#9CA3AF",fontWeight:600}}>{row.label}</span>
                      <span style={{fontSize:13,color:"#111",fontWeight:600,textAlign:"right"}}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:10,marginTop:20}}>
                  <button onClick={()=>setShowRegisterConfirm(false)}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700}}>
                    Edit Details
                  </button>
                  <button onClick={confirmRegister}
                    style={{flex:1,background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700}}>
                    Confirm & Register
                  </button>
                </div>
              </div>
            </div>
          </div>
        );})()}

        {!showRegister ? (
          <>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>ID Number</label>
              <input value={loginForm.username} onChange={e=>setLoginForm(p=>({...p,username:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Enter your ID Number"
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
              Don't have an account? <span onClick={()=>{
                setShowEmployeeCheck(true);
                setLoginError("");
                // Clear any leftover state from a previous registration attempt
                setRegisterForm({ selectedUserId:"", phone:"", email:"", plant:"", password:"", confirmPassword:"", regCode:"", codeVerified:false });
                setNameSearch("");
                setNameSuggestions([]);
                setRegisterError("");
                setShowRegisterConfirm(false);
                setOutsideForm({ name:"", email:"", phone:"", password:"", confirmPassword:"" });
                setOutsideError("");
              }} style={{color:PURPLE_MID,fontWeight:600,cursor:"pointer"}}>Create Account</span>
            </p>
          </>
        ) : registerType==="outside" ? (
          <>
            {/* Outside customer — basic info registration */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Full Name</label>
              <input value={outsideForm.name} onChange={e=>setOutsideForm(p=>({...p,name:e.target.value}))}
                placeholder="Enter your full name"
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Email Address</label>
              <input value={outsideForm.email} onChange={e=>setOutsideForm(p=>({...p,email:e.target.value}))}
                placeholder="e.g. juan@email.com" type="email"
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Cellphone Number</label>
              <input value={outsideForm.phone} onChange={e=>setOutsideForm(p=>({...p,phone:e.target.value}))}
                placeholder="e.g. 09171234567" type="tel" maxLength={15}
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Create Password</label>
              <div style={{position:"relative"}}>
                <input type={outsideShowPass?"text":"password"} value={outsideForm.password}
                  onChange={e=>setOutsideForm(p=>({...p,password:e.target.value}))} placeholder="Create a password"
                  style={{width:"100%",padding:"11px 42px 11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                <button onClick={()=>setOutsideShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer"}}>
                  <Icon name={outsideShowPass?"eyeoff":"eye"} size={18} color="#9CA3AF" />
                </button>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Confirm Password</label>
              <div style={{position:"relative"}}>
                <input type={outsideShowConfirm?"text":"password"} value={outsideForm.confirmPassword}
                  onChange={e=>setOutsideForm(p=>({...p,confirmPassword:e.target.value}))} placeholder="Re-enter your password"
                  style={{width:"100%",padding:"11px 42px 11px 14px",borderRadius:10,border:outsideForm.confirmPassword?(outsideForm.password===outsideForm.confirmPassword?"1.5px solid #10B981":"1.5px solid #EF4444"):"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                <button onClick={()=>setOutsideShowConfirm(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer"}}>
                  <Icon name={outsideShowConfirm?"eyeoff":"eye"} size={18} color="#9CA3AF" />
                </button>
              </div>
              {outsideForm.confirmPassword&&(
                <div style={{fontSize:11,marginTop:4,color:outsideForm.password===outsideForm.confirmPassword?"#059669":"#EF4444"}}>
                  {outsideForm.password===outsideForm.confirmPassword?"✅ Passwords match":"❌ Passwords do not match"}
                </div>
              )}
            </div>
            {outsideError&&<p style={{color:"#EF4444",fontSize:12,margin:"4px 0 8px",display:"flex",alignItems:"center",gap:5}}>⚠️ {outsideError}</p>}
            <button onClick={handleOutsideRegister} style={{width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:6}}>Complete Registration</button>
            <p style={{textAlign:"center",marginTop:14,fontSize:13,color:"#9CA3AF"}}>
              Already have an account? <span onClick={()=>{setShowRegister(false);setRegisterType(null);setOutsideError("");}} style={{color:PURPLE_MID,fontWeight:600,cursor:"pointer"}}>Sign In</span>
            </p>
          </>
        ) : (
          <>
            {/* Step indicator */}
            <div style={{display:"flex",gap:8,marginBottom:18,alignItems:"center"}}>
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.selectedUserId?PURPLE:PURPLE_LIGHT}} />
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.codeVerified?PURPLE:PURPLE_LIGHT}} />
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.codeVerified&&registerForm.phone?PURPLE:PURPLE_LIGHT}} />
              <div style={{flex:1,height:4,borderRadius:4,background:registerForm.password&&registerForm.confirmPassword&&registerForm.password===registerForm.confirmPassword?PURPLE:PURPLE_LIGHT}} />
            </div>

            {/* Step 1: Search name */}
            {!registerForm.selectedUserId ? (
              <div style={{position:"relative"}}>
                <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Search Your ID Number</label>
                <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:10,padding:"10px 14px",background:"#fff"}}>
                  <Icon name="search" size={16} color="#9CA3AF" />
                  <input value={nameSearch}
                    onChange={e=>{
                      const v=e.target.value; setNameSearch(v);
                      if(v.trim().length>=2){
                        setNameSuggestions(users.filter(u=>!u.registered&&
                          (u.idNumber||"").toLowerCase().includes(v.toLowerCase())
                        ));
                      } else setNameSuggestions([]);
                    }}
                    placeholder="Type your ID number to search..."
                    style={{border:"none",outline:"none",fontSize:14,color:"#111",width:"100%",background:"none"}} />
                </div>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Only employees added by admin can register</div>
                {nameSuggestions.length>0&&(
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",zIndex:200,overflow:"hidden",marginTop:2}}>
                    {nameSuggestions.map(u=>(
                      <button key={u.id} onMouseDown={()=>{setRegisterForm(p=>({...p,selectedUserId:u.id,plant:u.plant||""}));setNameSearch(u.name);setNameSuggestions([]);}}
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
            ) : !registerForm.codeVerified ? (
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
                    <button onClick={()=>{setRegisterForm(p=>({...p,selectedUserId:"",plant:"",regCode:"",codeVerified:false}));setNameSearch("");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#6B7280",padding:"4px 8px",borderRadius:6,border:"1px solid #E5E7EB",background:"#fff"}}>Change</button>
                  </div>
                );})()}

                {/* Registration Code -- get this from HR/MIS/General Admin,
                    it's not the same as your ID number */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Registration Code</label>
                  <input value={registerForm.regCode} onChange={e=>setRegisterForm(p=>({...p,regCode:e.target.value}))}
                    placeholder="Enter your registration code" maxLength={6}
                    style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none",fontFamily:"monospace",letterSpacing:"1px"}} />
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Contact HR, MIS or General Admin for your assigned code.</div>
                </div>

                {registerError&&<p style={{color:"#EF4444",fontSize:12,margin:"4px 0 8px",display:"flex",alignItems:"center",gap:5}}>⚠️ {registerError}</p>}
                <button onClick={handleRegCodeSubmit} style={{width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:6}}>Proceed</button>
              </>
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
                    <button onClick={()=>{setRegisterForm(p=>({...p,selectedUserId:"",plant:"",regCode:"",codeVerified:false}));setNameSearch("");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#6B7280",padding:"4px 8px",borderRadius:6,border:"1px solid #E5E7EB",background:"#fff"}}>Change</button>
                  </div>
                );})()}

                {/* Contact Number */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Cellphone Number</label>
                  <input value={registerForm.phone} onChange={e=>setRegisterForm(p=>({...p,phone:e.target.value}))}
                    placeholder="e.g. 09171234567" type="tel" maxLength={15}
                    style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                </div>

                {/* Email */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Email Address</label>
                  <input value={registerForm.email} onChange={e=>setRegisterForm(p=>({...p,email:e.target.value}))}
                    placeholder="e.g. juan.delacruz@email.com" type="email"
                    style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                </div>

                {/* Assigned Plant */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Which plant are you assigned to?</label>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {PLANTS.map(p=>(
                      <label key={p} onClick={()=>setRegisterForm(prev=>({...prev,plant:p}))}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:registerForm.plant===p?"1.5px solid "+PURPLE:"1.5px solid #E5E7EB",background:registerForm.plant===p?PURPLE_LIGHT:"#fff",cursor:"pointer"}}>
                        <input type="radio" name="registerPlant" checked={registerForm.plant===p} onChange={()=>setRegisterForm(prev=>({...prev,plant:p}))}
                          style={{accentColor:PURPLE,width:16,height:16,cursor:"pointer"}} />
                        <span style={{fontSize:14,fontWeight:600,color:registerForm.plant===p?PURPLE:"#374151"}}>{p}</span>
                      </label>
                    ))}
                  </div>
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

            {registerForm.codeVerified&&registerError&&<p style={{color:"#EF4444",fontSize:12,margin:"4px 0 8px",display:"flex",alignItems:"center",gap:5}}>⚠️ {registerError}</p>}
            {registerForm.selectedUserId&&registerForm.codeVerified&&(
              <button onClick={handleRegister} style={{width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:6}}>Complete Registration</button>
            )}
            <p style={{textAlign:"center",marginTop:14,fontSize:13,color:"#9CA3AF"}}>
              Already have an account? <span onClick={()=>{setShowRegister(false);setRegisterType(null);setRegisterError("");}} style={{color:PURPLE_MID,fontWeight:600,cursor:"pointer"}}>Sign In</span>
            </p>
          </>
        )}

      </div>
    </div>
    <Footer />
    </div>
  );

  /* ════════════════════════════════════════
     TOP NAVBAR
  ════════════════════════════════════════ */
  const navItems = NAV[role]||NAV.user;

  const Navbar = () => (
    <>
      {/* ── Top Bar ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",display:"flex",alignItems:"center",padding:"0 1rem",position:"sticky",top:0,zIndex:50,height:52,flexShrink:0,marginLeft:isDesktop?240:0,transition:"margin-left 0.25s"}}>
        {/* Hamburger — mobile/tablet only, sidebar is persistent on desktop */}
        {!isDesktop&&(
          <button onClick={()=>setSidebarOpen(p=>!p)}
            style={{background:"none",border:"none",cursor:"pointer",padding:"6px 8px",marginRight:10,borderRadius:8,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}
            aria-label="Toggle menu">
            <span style={{display:"block",width:20,height:2,background:sidebarOpen?PURPLE:"#374151",borderRadius:2,transition:"all 0.2s"}} />
            <span style={{display:"block",width:20,height:2,background:sidebarOpen?PURPLE:"#374151",borderRadius:2,transition:"all 0.2s"}} />
            <span style={{display:"block",width:20,height:2,background:sidebarOpen?PURPLE:"#374151",borderRadius:2,transition:"all 0.2s"}} />
          </button>
        )}

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
          {(role==="user"||isAdminLike)&&(
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

      {/* ── Sidebar overlay (mobile/tablet only — desktop sidebar is persistent, no overlay needed) ── */}
      {sidebarOpen&&!isDesktop&&(
        <div onClick={()=>setSidebarOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:98,top:52}} />
      )}

      {/* ── Sidebar — persistent on desktop (≥1024px), off-canvas overlay below that ── */}
      <div style={{
        position:"fixed",top:52,left:0,bottom:0,width:240,
        background:"#fff",borderRight:"1px solid #E5E7EB",
        zIndex:99,transform:(sidebarOpen||isDesktop)?"translateX(0)":"translateX(-100%)",
        transition:"transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        display:"flex",flexDirection:"column",overflowY:"auto",
        boxShadow:(sidebarOpen&&!isDesktop)?"4px 0 20px rgba(0,0,0,0.08)":"none",
      }}>
        {/* User info header */}
        <div style={{padding:"16px",borderBottom:"1px solid #F3F4F6",background:PURPLE_LIGHT}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:PURPLE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>
              {currentUser.avatar}
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:"#111",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{currentUser.name}</div>
              <div style={{fontSize:11,color:PURPLE,fontWeight:600,textTransform:"capitalize"}}>{role==="user"?"Customer":role==="staff-admin"?"Staff-Admin":role==="staff"?"Staff":role==="superadmin"?"Superadmin":"Admin"}</div>
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
                onClick={()=>{ if(n.id==="mgorders"){ setOrderSearch(""); setOrderPlantFilter("All"); setOrderShowAllDates(true); setOrderDateFilter(toDateKey(new Date())); } setActiveTab(n.id); setSidebarOpen(false); }}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 16px",border:"none",background:isActive?PURPLE_LIGHT:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`3px solid ${isActive?PURPLE:"transparent"}`,transition:"all 0.1s"}}>
                <Icon name={n.icon} size={17} color={isActive?PURPLE:"#6B7280"} />
                <span style={{fontSize:14,fontWeight:isActive?600:400,color:isActive?PURPLE:"#374151"}}>{n.label}</span>
                {n.id==="cart"&&cartCount>0&&<span style={{marginLeft:"auto",background:PURPLE,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{cartCount}</span>}
                {n.id==="suggestions"&&canModerateSuggestions&&suggestionsAwaitingAdmin>0&&<span style={{marginLeft:"auto",background:"#EF4444",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{suggestionsAwaitingAdmin}</span>}
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


  /* ── Empty state ── */
  const Empty = ({msg="No items found",sub="Try adjusting your filters or search terms."}) => (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"4rem 2rem",textAlign:"center"}}>
      <div style={{marginBottom:12}}><Icon name="search" size={36} color="#D1D5DB" /></div>
      <div style={{fontWeight:600,fontSize:15,color:"#374151",marginBottom:4}}>{msg}</div>
      <div style={{fontSize:13,color:"#9CA3AF"}}>{sub}</div>
    </div>
  );

  /* ── remarks + drink-upsell prompt, shared by Short Order & Visitor Menu ── */
  /* ── fixed (non-dated) menu manager — shared by Manage Short Order & Manage Visitor Menu ── */

  /* ════════════════════════════════════════
     RENDER TABS
  ════════════════════════════════════════ */
  const renderTab = () => {
    /* ── MENU TAB (user/staff/admin) ── */
    if(activeTab==="menu") return (
      <div>
        <Hero />
        {menuView==="Weekly Menu"&&currentUser.plant&&isSameDay(selectedDate,TODAY_DATE)&&isPlantClosed(currentUser.plant)&&(
          <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#92400E",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
            🔒 {currentUser.plant} is closed for today. Dishes you order now will be scheduled for tomorrow instead.
          </div>
        )}
        {/* Inlined (not a separately-invoked component) so the search input
            doesn't lose focus on every keystroke -- see SuggestionThread's
            comment near the top of the file for why. */}
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:4}}>
            {["Weekly Menu","Groceries"].map(v=>(
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
        {menuView==="Weekly Menu" ? (
          <div>
            <DatePicker />
            <MealCatPills />
            {visibleItems.length===0 ? <Empty /> : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
                {visibleItems.map(item=><FoodCard key={item.id} item={item} onAdd={addToCart}
                  isPastDate={isPast(selectedDate)&&!isSameDay(selectedDate,TODAY_DATE)}
                  scheduledDate={isFuture(selectedDate)?selectedDate:null}
                  cutoffPassed={isSameDay(selectedDate,TODAY_DATE)&&isPastMenuCutoff(item.cat)}
                  isAdminLike={isAdminLike} role={role} />)}
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
                {visibleOthers.map(item=><FoodCard key={item.id} item={item} onAdd={addToCart} isAdminLike={isAdminLike} role={role} />)}
              </div>
            )}
          </div>
        )}
      </div>
    );

    /* ── SHORT ORDER TAB (fixed, non-dated menu — all ordering roles) ── */
    if(activeTab==="shortorder") {
      const visibleShortOrder = shortOrderItems.filter(i=>i.name.toLowerCase().includes(searchQ.toLowerCase()));
      return (
        <div>
          <div style={{marginBottom:16}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="menu" size={20} color={PURPLE} /> Short Order
            </h2>
            <div style={{fontSize:13,color:"#6B7280",marginTop:4}}>Fixed menu, available anytime — no need to wait for a specific day.</div>
          </div>
          {visibleShortOrder.length===0 ? <Empty msg="No Short Order items yet" sub="Ask an Admin or Staff-Admin to add items in Manage Short Order." /> : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
              {visibleShortOrder.map(item=><FoodCard key={item.id} item={item}
                onAdd={()=>openAddOptions(item, (remarks,drinks,size)=>{
                  const cartItem = size ? {...item, price:size.price} : item;
                  addToCart(cartItem, null, {remarks, fixedMenu:true, sizeLabel:size?size.label:null});
                  drinks.forEach(d=>addToCart(d, null, {qty:d.qty, fixedMenu:true}));
                })} isAdminLike={isAdminLike} role={role} />)}
            </div>
          )}
        </div>
      );
    }

    /* ── VISITOR MENU TAB (admin/staff-admin only — fixed menu, own inline checkout) ── */
    if(activeTab==="visitormenu") {
      const visibleVisitorMenu = visitorMenuItems.filter(i=>i.available!==false);
      return (
        <div>
          <div style={{marginBottom:16}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="register" size={20} color={PURPLE} /> Special Menu for Visitor
            </h2>
            <div style={{fontSize:13,color:"#6B7280",marginTop:4}}>Fixed menu for walk-in guests. Orders placed here are recorded under your own account.</div>
          </div>
          {visitorMenuDone&&(
            <div style={{background:"#D1FAE5",border:"1px solid #6EE7B7",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#065F46",fontWeight:600}}>
              ✅ Order placed successfully.
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1fr 340px":"1fr",gap:16}}>
            <div>
              {visibleVisitorMenu.length===0 ? <Empty msg="No Visitor Menu items yet" sub="Ask an Admin or Staff-Admin to add items in Manage Visitor Menu." /> : (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>
                  {visibleVisitorMenu.map(item=><FoodCard key={item.id} item={item}
                    onAdd={()=>openAddOptions(item, (remarks,drinks)=>{
                      visitorAddItem(item, remarks);
                      drinks.forEach(d=>visitorAddDrink(d, d.qty));
                    })} isAdminLike={isAdminLike} role={role} />)}
                </div>
              )}
            </div>
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:16,alignSelf:"flex-start",position:isDesktop?"sticky":"static",top:70}}>
              <div style={{fontWeight:700,fontSize:15,color:"#111",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <Icon name="cart" size={16} color={PURPLE} /> Order Summary
              </div>
              {visitorCart.length===0 ? (
                <div style={{fontSize:13,color:"#9CA3AF",textAlign:"center",padding:"1.5rem 0"}}>No items yet.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                  {visitorCart.map(c=>(
                    <div key={c._key} style={{display:"flex",flexDirection:"column",gap:4,paddingBottom:8,borderBottom:"1px solid #F3F4F6"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <span style={{fontSize:13,fontWeight:600,color:"#111",flex:1,minWidth:0}}>{c.name}</span>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <button onClick={()=>visitorUpdateQty(c._key,-1)} style={{width:22,height:22,borderRadius:6,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>−</button>
                          <span style={{minWidth:16,textAlign:"center",fontSize:12,fontWeight:700}}>{c.qty}</span>
                          <button onClick={()=>visitorUpdateQty(c._key,1)} style={{width:22,height:22,borderRadius:6,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+</button>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:PURPLE,minWidth:50,textAlign:"right"}}>₱{c.price*c.qty}</span>
                      </div>
                      {c.remarks&&<div style={{fontSize:11,color:"#6B7280",fontStyle:"italic"}}>📝 {c.remarks}</div>}
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800,color:"#111",marginBottom:14}}>
                <span>Total</span><span>₱{visitorCartTotal}</span>
              </div>
              <button onClick={placeVisitorOrder} disabled={!visitorCart.length}
                style={{width:"100%",background:visitorCart.length?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"12px",cursor:visitorCart.length?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                Place Order
              </button>
            </div>
          </div>
        </div>
      );
    }

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
                {item.isPhoto&&(item.img||item.photo)
                  ? <img src={item.img||item.photo} alt={item.name} style={{width:40,height:40,borderRadius:8,objectFit:"cover",flexShrink:0}} />
                  : <span style={{fontSize:28}}>{item.img||item.emoji}</span>
                }
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:"#111"}}>
                    {item.name}
                    {item.sizeLabel&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>{item.sizeLabel}</span>}
                    {item.scheduledDate&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>📅 {item.scheduledDate instanceof Date?formatDateLabel(item.scheduledDate):item.scheduledDate}</span>}
                  </div>
                  {item.grams&&<div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#6B7280",background:"#F3F4F6",borderRadius:20,padding:"1px 7px",margin:"2px 0"}}>{unitIcon(item.servingUnit)} {formatServing(item.grams,item.servingUnit)} per serving</div>}
                  {item.remarks&&<div style={{fontSize:11,color:"#6B7280",fontStyle:"italic",margin:"2px 0"}}>📝 {item.remarks}</div>}
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
              <button onClick={()=>{
                if(availableColdDrinks.length>0){ setDrinkUpsellQtys({}); setShowDrinkUpsell(true); }
                else { setShowPlantModal(true); setOrderPlant(currentUser.plant||"KF Main"); }
              }} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"11px 28px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:12}}>
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
        <div style={{fontSize:12,color:"#9CA3AF",marginBottom:16}}>Weekly Menu and Short Order orders can have their plant changed or be cancelled within 2 hours of placing them, as long as the canteen hasn't received/confirmed the order yet.</div>
        {myOrders.length===0 ? (
          <Empty msg="No orders yet" sub="Place an order from the menu to see it here." />
        ) : filteredMyOrders.length===0 ? (
          <Empty msg="No orders match" sub="Try a different search term." />
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {filteredMyOrders.map(order=>(
              <div key={order.id} style={{background:"#fff",borderRadius:14,border:"1px solid "+(order.status==="cancelled"?"#FECACA":"#E5E7EB"),padding:"16px 18px",opacity:order.status==="cancelled"?0.7:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#111",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      Order #{order.id}
                      {order.source==="otc"&&<span style={{fontSize:10,background:"#FEF3C7",color:"#92400E",fontWeight:700,padding:"1px 8px",borderRadius:10}}>🧾 Over the Counter</span>}
                      {order.source==="short-order"&&<span style={{fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 8px",borderRadius:10}}>🍽️ Short Order</span>}
                      {order.source==="visitor-menu"&&<span style={{fontSize:10,background:"#DBEAFE",color:"#1E40AF",fontWeight:700,padding:"1px 8px",borderRadius:10}}>🙋 Visitor Menu</span>}
                      {isSelfPlacedOrder(order)&&order.source!=="short-order"&&<span style={{fontSize:10,background:"#F3F4F6",color:"#374151",fontWeight:700,padding:"1px 8px",borderRadius:10}}>🛒 Weekly Menu</span>}
                    </div>
                    <div style={{fontSize:12,color:"#9CA3AF"}}>{order.date} · {order.time} · 📍 {order.plant}</div>
                  </div>
                  {order.status==="cancelled"
                    ? <span style={{background:"#FEE2E2",color:"#991B1B",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>🚫 Cancelled</span>
                    : order.paymentType
                      ? <span style={{background:order.paymentType==="Credit"?PURPLE_LIGHT:"#D1FAE5",color:order.paymentType==="Credit"?PURPLE:"#065F46",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{order.paymentType==="Credit"?"💳 Credit":"💵 Cash"}</span>
                      : <span style={{background:"#FEF3C7",color:"#92400E",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>⏳ Unpaid</span>}
                </div>
                {order.items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#374151",padding:"4px 0",alignItems:"flex-start"}}>
                    <div>
                      <span>{it.name} × {it.qty}</span>
                      {it.size&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>{it.size}</span>}
                      {it.scheduledDate&&<span style={{marginLeft:6,fontSize:11,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10}}>📅 {it.scheduledDate}</span>}
                      {it.grams&&<div style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,color:"#9CA3AF",marginLeft:6}}>{unitIcon(it.servingUnit)} {formatServing(it.grams,it.servingUnit)}/serving</div>}
                      {it.remarks&&<div style={{fontSize:11,color:"#6B7280",fontStyle:"italic"}}>📝 {it.remarks}</div>}
                    </div>
                    <span style={{fontWeight:600,flexShrink:0}}>₱{it.price*it.qty}</span>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #F3F4F6",marginTop:10,paddingTop:10,display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:15}}>
                  <span>Total</span><span style={{color:PURPLE}}>₱{order.total}</span>
                </div>

                {order.status==="cancelled" ? (
                  <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6",fontSize:11,color:"#991B1B"}}>
                    🚫 Cancelled {order.cancelledAt?"on "+new Date(order.cancelledAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date(order.cancelledAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}
                  </div>
                ) : isOrderEditable(order) && (
                  editPlantOrderId===order.id ? (
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <select value={editPlantValue} onChange={e=>setEditPlantValue(e.target.value)}
                        style={{fontSize:12,padding:"7px 10px",borderRadius:7,border:"1px solid #E5E7EB",color:"#111",background:"#fff"}}>
                        {PLANTS.map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                      <button onClick={()=>{editOrderPlant(order.id, editPlantValue);setEditPlantOrderId(null);}}
                        style={{background:PURPLE,color:"#fff",border:"none",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>Save</button>
                      <button onClick={()=>setEditPlantOrderId(null)}
                        style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>Cancel</button>
                    </div>
                  ) : cancelConfirmOrderId===order.id ? (
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6"}}>
                      <div style={{background:"#FEF2F2",borderRadius:9,padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#991B1B",fontWeight:600}}>Cancel this order? This can't be undone.</span>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{cancelOrder(order.id);setCancelConfirmOrderId(null);}}
                            style={{background:"#DC2626",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>Yes, Cancel</button>
                          <button onClick={()=>setCancelConfirmOrderId(null)}
                            style={{background:"#fff",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>Keep Order</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F3F4F6",display:"flex",gap:8}}>
                      <button onClick={()=>{setEditPlantOrderId(order.id);setEditPlantValue(order.plant);}}
                        style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>📍 Edit Plant</button>
                      <button onClick={()=>setCancelConfirmOrderId(order.id)}
                        style={{background:"#FEF2F2",color:"#DC2626",border:"1px solid #FECACA",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>✕ Cancel Order</button>
                    </div>
                  )
                )}
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
            <Icon name="manage" size={20} color={PURPLE} /> Manage Weekly Menu {(role==="staff"||role==="staff-admin")&&<span style={{fontSize:13,fontWeight:500,color:PURPLE,background:PURPLE_LIGHT,padding:"2px 10px",borderRadius:20,marginLeft:6}}>📍 {currentUser.plant}</span>}
          </h2>
          <button onClick={()=>{setNewItem(p=>({...p,days:[mgDay],weeks:[mgWeekKey]}));setShowAddItem(mgDay);}} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            <Icon name="plus" size={14} color="#fff" /> Add Item
          </button>
        </div>
        {/* date picker */}
        <div style={{position:"relative",marginBottom:16,display:"inline-block"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"8px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
              <span>📅</span>
              <span style={{fontWeight:600,fontSize:14,color:"#374151"}}>{mgDate.toLocaleDateString("en-PH",{weekday:"short",year:"numeric",month:"2-digit",day:"2-digit"})}</span>
              {isSameDay(mgDate,TODAY_DATE)&&<span style={{fontSize:11,background:"#D1FAE5",color:"#065F46",padding:"2px 8px",borderRadius:10,fontWeight:600}}>Today</span>}
            </div>
            <button onClick={()=>setShowMgCal(p=>!p)}
              style={{display:"flex",alignItems:"center",gap:6,background:showMgCal?PURPLE:"#fff",color:showMgCal?"#fff":PURPLE,border:"1.5px solid "+PURPLE,borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>
              🗓 {showMgCal?"Close":"Change Date"}
            </button>
          </div>
          {showMgCal&&(
            <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:100,background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",minWidth:280}}>
              <div style={{background:PURPLE,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <button onClick={()=>{if(mgCalMonth===0){setMgCalMonth(11);setMgCalYear(y=>y-1);}else setMgCalMonth(m=>m-1);}}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16}}>{"<"}</button>
                <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{new Date(mgCalYear,mgCalMonth).toLocaleDateString("en-PH",{month:"long",year:"numeric"})}</span>
                <button onClick={()=>{if(mgCalMonth===11){setMgCalMonth(0);setMgCalYear(y=>y+1);}else setMgCalMonth(m=>m+1);}}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",color:"#fff",fontSize:16}}>{">"}</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",padding:"6px 0",fontSize:11,fontWeight:700,color:d==="Su"?"#EF4444":"#6B7280"}}>{d}</div>)}
              </div>
              <div style={{padding:"4px 6px 8px"}}>
                {(()=>{
                  const firstDay=new Date(mgCalYear,mgCalMonth,1).getDay();
                  const daysInMonth=new Date(mgCalYear,mgCalMonth+1,0).getDate();
                  const daysInPrev=new Date(mgCalYear,mgCalMonth,0).getDate();
                  const cells=[];
                  for(let i=0;i<firstDay;i++) cells.push({day:daysInPrev-firstDay+1+i,type:"prev"});
                  for(let d=1;d<=daysInMonth;d++) cells.push({day:d,type:"curr"});
                  const rem=42-cells.length;
                  for(let i=1;i<=rem;i++) cells.push({day:i,type:"next"});
                  const weeks=[];
                  for(let w=0;w<cells.length/7;w++) weeks.push(cells.slice(w*7,(w+1)*7));
                  return weeks.map((week,wi)=>(
                    <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                      {week.map((cell,ci)=>{
                        if(cell.type!=="curr") return <div key={ci} style={{textAlign:"center",padding:"6px 2px",fontSize:12,color:"#D1D5DB"}}>{cell.day}</div>;
                        const cd=new Date(mgCalYear,mgCalMonth,cell.day);
                        const isSel=isSameDay(cd,mgDate);
                        const isT=isSameDay(cd,TODAY_DATE);
                        const isSun=cd.getDay()===0;
                        return(
                          <div key={ci} onClick={()=>{if(!isSun){setMgDate(cd);setMgDay(DAY_NAMES[cd.getDay()]);setShowMgCal(false);}}}
                            style={{textAlign:"center",padding:"5px 2px",cursor:isSun?"not-allowed":"pointer",opacity:isSun?0.35:1}}>
                            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:"50%",fontSize:13,fontWeight:(isSel||isT)?700:400,background:isSel?PURPLE:isT?PURPLE_LIGHT:"transparent",color:isSel?"#fff":isSun?"#EF4444":"#374151",border:isT&&!isSel?"1.5px solid "+PURPLE:"none"}}>{cell.day}</div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
              <div style={{borderTop:"1px solid #E5E7EB",padding:"8px",textAlign:"center"}}>
                <button onClick={()=>{setMgDate(new Date(TODAY_DATE));setMgDay(TODAY);setMgCalYear(TODAY_DATE.getFullYear());setMgCalMonth(TODAY_DATE.getMonth());setShowMgCal(false);}}
                  style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:PURPLE,fontWeight:600}}>
                  Today: {TODAY_DATE.toLocaleDateString("en-PH",{month:"2-digit",day:"2-digit",year:"numeric"})}
                </button>
              </div>
            </div>
          )}
        </div>
        {/* ── ADD ITEM MODAL ── */}
        {showAddItem===mgDay&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
              <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Menu Item</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>
                    {(newItem.days&&newItem.days.length?newItem.days.join(", "):mgDay)} · Week {(newItem.weeks&&newItem.weeks.length?newItem.weeks:[mgWeekKey]).map(wk=>wk.split("-")[1]).join(", ")}{newItem.dishId?" · "+newItem.cat:""}
                  </div>
                </div>
                <button onClick={()=>{setShowAddItem(null);setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null,grams:"",days:[],weeks:[],dishId:null});setDishLinkSearch("");}}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
              <div style={{padding:"22px"}}>
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Add to Week(s)</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {[0,1,2,3,4].map(i=>{
                      const d = new Date(mgDate); d.setDate(d.getDate()+i*7);
                      const wk = getWeekKey(d);
                      const wn = getWeekNumber(d);
                      const isSel = (newItem.weeks||[]).includes(wk);
                      return (
                        <button key={wk} type="button"
                          onClick={()=>setNewItem(p=>{
                            const cur = p.weeks||[];
                            return {...p, weeks: cur.includes(wk) ? cur.filter(x=>x!==wk) : [...cur,wk]};
                          })}
                          style={{padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(isSel?PURPLE:"#E5E7EB"),background:isSel?PURPLE:"#fff",color:isSel?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                          Week {wn}{i===0?" (This Week)":""}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>Identified by traditional calendar week number. Select multiple weeks to add the same item to each.</div>
                </div>
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Add to Day(s)</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {DAYS.map(d=>{
                      const isSel = (newItem.days||[]).includes(d);
                      return (
                        <button key={d} type="button"
                          onClick={()=>setNewItem(p=>{
                            const cur = p.days||[];
                            return {...p, days: cur.includes(d) ? cur.filter(x=>x!==d) : [...cur,d]};
                          })}
                          style={{padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(isSel?PURPLE:"#E5E7EB"),background:isSel?PURPLE:"#fff",color:isSel?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                          {d.slice(0,3)}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>Item will be added to the selected week(s) × day(s) combination.</div>
                </div>
                <div style={{marginBottom:18,position:"relative"}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Link to Dish</label>
                  {newItem.dishId ? (()=>{ const linked = dishes.find(d=>d.id===newItem.dishId); return linked && (
                    <div style={{display:"flex",alignItems:"center",gap:10,background:PURPLE_LIGHT,borderRadius:10,padding:"10px 14px"}}>
                      <div style={{width:36,height:36,borderRadius:8,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#fff",fontSize:20}}>
                        {linked.isPhoto&&linked.img ? <img src={linked.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : linked.img}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#111"}}>{linked.name}</div>
                        <div style={{fontSize:11,color:PURPLE}}>{linked.cat} · dish catalog price ₱{linked.price}</div>
                      </div>
                      <button onClick={()=>setNewItem(p=>({...p,dishId:null,name:"",price:"",img:"🍽️",photo:null,cat:"LUNCH",grams:""}))}
                        style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600,color:"#6B7280"}}>Unlink</button>
                    </div>
                  );})() : (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"9px 12px",background:"#fff"}}>
                        <Icon name="search" size={14} color="#9CA3AF" />
                        <input value={dishLinkSearch} onChange={e=>setDishLinkSearch(e.target.value)} placeholder="Search dish catalog..."
                          style={{border:"none",outline:"none",fontSize:13,color:"#111",width:"100%",background:"none"}} />
                      </div>
                      <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>Every menu item must come from the dish catalog for its name and photo.</div>
                      {dishLinkSearch.trim().length>=1&&(
                        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",zIndex:250,overflow:"hidden",marginTop:2,maxHeight:220,overflowY:"auto"}}>
                          {dishes.filter(d=>d.name.toLowerCase().includes(dishLinkSearch.toLowerCase())).map(d=>(
                            <button key={d.id} onMouseDown={()=>{
                              setNewItem(p=>({...p,dishId:d.id,name:d.name,price:String(d.price),cat:d.cat||"LUNCH",img:d.img,photo:d.isPhoto?d.img:null,grams:d.grams?String(d.grams):"",servingUnit:d.servingUnit||"g"}));
                              setDishLinkSearch("");
                            }} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"none",borderBottom:"1px solid #F3F4F6",background:"none",cursor:"pointer",textAlign:"left"}}>
                              <span style={{fontSize:18}}>{d.isPhoto?"🍽️":d.img}</span>
                              <span style={{fontSize:13,fontWeight:600,color:"#111"}}>{d.name}</span>
                              <span style={{fontSize:11,color:"#9CA3AF",marginLeft:"auto"}}>{d.cat}</span>
                            </button>
                          ))}
                          {dishes.filter(d=>d.name.toLowerCase().includes(dishLinkSearch.toLowerCase())).length===0&&(
                            <div style={{padding:"12px"}}>
                              <div style={{fontSize:12,color:"#9CA3AF",marginBottom:8}}>No dishes found.</div>
                              <button onMouseDown={()=>{
                                setDishOriginContext(showAddItem);
                                setShowAddItem(null);
                                setNewDish(p=>({...p,name:toProperCase(dishLinkSearch),cat:newItem.cat||"LUNCH"}));
                                setShowAddDish(true);
                                setDishLinkSearch("");
                              }} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:PURPLE_LIGHT,color:PURPLE,border:"none",borderRadius:8,padding:"9px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                                <Icon name="plus" size={13} color={PURPLE} /> Create New Dish
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {newItem.dishId&&(
                  <div style={{marginBottom:18}}>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Price for this Menu Slot (₱)</label>
                    <input value={newItem.price} onChange={e=>setNewItem(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0" step="0.01"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Starts at the dish catalog price — change it to price this slot differently.</div>
                  </div>
                )}
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button onClick={()=>{setShowAddItem(null);setNewItem({name:"",price:"",img:"🍽️",cat:"LUNCH",photo:null,grams:"",days:[],weeks:[],dishId:null});setDishLinkSearch("");}}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                  {(()=>{
                    const dayCount = newItem.days&&newItem.days.length?newItem.days.length:1;
                    const weekCount = newItem.weeks&&newItem.weeks.length?newItem.weeks.length:1;
                    const total = dayCount*weekCount;
                    const canSubmit = !!newItem.dishId&&newItem.name&&newItem.price;
                    return (
                      <button onClick={addMenuItem} disabled={!canSubmit}
                        style={{flex:2,background:canSubmit?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:canSubmit?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                        <Icon name="plus" size={15} color="#fff" /> Add to {total} Slot{total>1?"s":""}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {((menu[mgWeekKey]&&menu[mgWeekKey][mgDay])||[]).map(item=>(
            <div key={item.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 16px",display:"flex",alignItems:"center",gap:12,opacity:item.available?1:0.6}}>
              <div style={{width:52,height:52,borderRadius:10,background:PURPLE_LIGHT,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {item.isPhoto&&item.img ? <img src={item.img} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{fontSize:26}}>{item.img}</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{item.name}</div>
                <div style={{fontSize:12,color:"#6B7280"}}>{item.cat} · ₱{item.price}{item.grams?` · ${unitIcon(item.servingUnit)} ${formatServing(item.grams,item.servingUnit)}/serving`:""}</div>
              </div>
              <span style={{fontSize:11,background:item.available?"#D1FAE5":"#FEE2E2",color:item.available?"#065F46":"#991B1B",padding:"3px 10px",borderRadius:20,fontWeight:600}}>
                {item.available?"Available":"Unavailable"}
              </span>
              <button onClick={()=>toggleAvail(mgWeekKey,mgDay,item.id)} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,color:"#374151",fontWeight:500}}>Toggle</button>
              {(isAdminLike||role==="staff-admin")&&<button onClick={()=>removeMenuItem(mgWeekKey,mgDay,item.id)} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500}}>
                <Icon name="trash" size={13} color="#991B1B" /> Remove
              </button>}
            </div>
          ))}
          {((menu[mgWeekKey]&&menu[mgWeekKey][mgDay])||[]).length===0&&<Empty msg={`No items for ${mgDay}, Week ${mgWeekNumber}`} sub="Click '+ Add Item' to add one." />}
        </div>
      </div>
      );
    }

    /* ── MANAGE SHORT ORDER (admin/staff-admin) ── */
    if(activeTab==="mgshortorder") return (
      <div>
        <FixedMenuManager label="Manage Short Order" icon="menu" items={shortOrderItems}
          search={shortOrderMgSearch} setSearch={setShortOrderMgSearch}
          onToggle={toggleShortOrderAvail} onRemove={removeShortOrderItem}
          onAddClick={()=>setShowAddShortOrderItem(true)} Empty={Empty} />
        {showAddShortOrderItem&&(
          <AddFixedMenuItemModal title="Add Short Order Item" newItem={newShortOrderItem} setNewItem={setNewShortOrderItem}
            dragOver={shortOrderDragOver} setDragOver={setShortOrderDragOver} photoInputRef={shortOrderPhotoInputRef}
            handlePhotoFile={handleShortOrderPhotoFile} onSave={addShortOrderItem}
            onClose={()=>{setShowAddShortOrderItem(false);setNewShortOrderItem({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"", sizes:[] });}}
            showSizes />
        )}
      </div>
    );

    /* ── MANAGE VISITOR MENU (admin/staff-admin) ── */
    if(activeTab==="mgvisitormenu") return (
      <div>
        <FixedMenuManager label="Manage Visitor Menu" icon="register" items={visitorMenuItems}
          search={visitorMgSearch} setSearch={setVisitorMgSearch}
          onToggle={toggleVisitorMenuAvail} onRemove={removeVisitorMenuItem}
          onAddClick={()=>setShowAddVisitorMenuItem(true)} Empty={Empty} />
        {showAddVisitorMenuItem&&(
          <AddFixedMenuItemModal title="Add Visitor Menu Item" newItem={newVisitorMenuItem} setNewItem={setNewVisitorMenuItem}
            dragOver={visitorMenuDragOver} setDragOver={setVisitorMenuDragOver} photoInputRef={visitorMenuPhotoInputRef}
            handlePhotoFile={handleVisitorMenuPhotoFile} onSave={addVisitorMenuItem}
            onClose={()=>{setShowAddVisitorMenuItem(false);setNewVisitorMenuItem({ name:"", price:"", img:"🍽️", cat:"LUNCH", photo:null, grams:"" });}} />
        )}
      </div>
    );

    /* ── MANAGE ORDERS (staff/admin) ── */
    if(activeTab==="mgorders") {
      const filteredOrders = orders.filter(o=>{
        const plantMatch = (role==="staff") ? (o.plant===currentUser.plant)
          : (role==="staff-admin") ? (orderPlantFilter==="All"||o.plant===orderPlantFilter)
          : true;
        const searchMatch = o.id.toLowerCase().includes(orderSearch.toLowerCase()) ||
          o.user.toLowerCase().includes(orderSearch.toLowerCase()) ||
          (o.plant||"").toLowerCase().includes(orderSearch.toLowerCase()) ||
          (o.userId && (users.find(u=>u.id===o.userId)||{}).idNumber||"").toLowerCase().includes(orderSearch.toLowerCase());
        const dateMatch = orderShowAllDates || o.date===orderDateFilter;
        return plantMatch && searchMatch && dateMatch;
      });
      return (
        <div>
          {/* close canteen modal */}
          {showCloseModal&&(()=>{
            const p = closePlant;
            const alreadyClosed = isPlantClosed(p);
            const dayOrders = orders.filter(o=>o.plant===p&&o.date===TODAY_KEY);
            const cashT = dayOrders.filter(o=>o.paymentType==="Cash").reduce((s,o)=>s+o.total,0);
            const creditT = dayOrders.filter(o=>o.paymentType==="Credit").reduce((s,o)=>s+o.total,0);
            const unpaidT = dayOrders.filter(o=>!o.paymentType).reduce((s,o)=>s+o.total,0);
            const productOuts = {};
            dayOrders.forEach(o=>o.items.forEach(it=>{
              if(it.grams) return; // dish, not an "other product"
              productOuts[it.name] = (productOuts[it.name]||0)+it.qty;
            }));
            const dishList = getPlantDishList(p);
            const withInput = dishList.filter(({item,decided})=>!decided&&(parseFloat(excessInputs[item.id])||0)>0);
            const undecidedTyped = withInput.length;
            return (
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
                <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
                  <div style={{background:"#111827",padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>🔒 Close Canteen</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>{TODAY_DATE.toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})}</div>
                    </div>
                    <button onClick={()=>setShowCloseModal(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
                  </div>
                  <div style={{padding:"22px"}}>
                    {isAdminLike&&(
                      <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
                        {PLANTS.map(pl=>(
                          <button key={pl} onClick={()=>setClosePlant(pl)} disabled={!!alreadyClosed}
                            style={{padding:"6px 14px",borderRadius:20,border:"1px solid #E5E7EB",background:closePlant===pl?PURPLE:"#fff",color:closePlant===pl?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:alreadyClosed?"not-allowed":"pointer"}}>
                            {pl}
                          </button>
                        ))}
                      </div>
                    )}
                    {alreadyClosed ? (
                      <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:10,padding:"14px",fontSize:13,color:"#92400E",fontWeight:600,marginBottom:8}}>
                        {p} is already closed for today by {alreadyClosed.closedBy}. Reopen it from Manage Orders first if you need to redo this.
                      </div>
                    ) : (
                      <>
                        <div style={{fontWeight:700,fontSize:14,color:"#111",marginBottom:8}}>Today's Sales — {p}</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:18}}>
                          <div style={{background:"#F0FDF4",borderRadius:10,padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:17,fontWeight:800,color:"#059669"}}>₱{cashT}</div>
                            <div style={{fontSize:10,color:"#065F46",fontWeight:600}}>💵 Cash</div>
                          </div>
                          <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:17,fontWeight:800,color:PURPLE}}>₱{creditT}</div>
                            <div style={{fontSize:10,color:PURPLE,fontWeight:600}}>💳 Credit</div>
                          </div>
                          <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:17,fontWeight:800,color:"#92400E"}}>₱{unpaidT}</div>
                            <div style={{fontSize:10,color:"#92400E",fontWeight:600}}>⏳ Unpaid</div>
                          </div>
                        </div>

                        <div style={{fontWeight:700,fontSize:14,color:"#111",marginBottom:8}}>Groceries Sold Today</div>
                        {Object.keys(productOuts).length===0 ? (
                          <div style={{fontSize:12,color:"#9CA3AF",marginBottom:18}}>No grocery sales today.</div>
                        ) : (
                          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
                            {Object.entries(productOuts).map(([name,qty])=>(
                              <div key={name} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,padding:"5px 10px",fontSize:12,color:"#374151"}}>
                                {name} <strong>×{qty}</strong>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#111"}}>Excess Dishes</div>
                          <div style={{fontSize:11,color:"#9CA3AF"}}>Count today's leftovers by eye and log them below</div>
                        </div>
                        {dishList.length===0 ? (
                          <div style={{fontSize:12,color:"#9CA3AF",marginBottom:18}}>No dishes on today's menu.</div>
                        ) : (
                          <>
                          {undecidedTyped>1&&(
                            <div style={{display:"flex",gap:8,marginBottom:10}}>
                              <button onClick={()=>withInput.forEach(({item})=>decideExcess(p,TODAY_KEY,item,parseFloat(excessInputs[item.id]),"waste"))}
                                style={{flex:1,background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:7,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                                🗑️ Waste All ({undecidedTyped})
                              </button>
                            </div>
                          )}
                          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
                            {dishList.map(({item,soldQty,decided})=>{
                              const unit = item.servingUnit||"g";
                              const typedQty = parseFloat(excessInputs[item.id])||0;
                              return (
                              <div key={item.id} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 14px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontWeight:600,fontSize:13,color:"#111"}}>{item.name}</div>
                                    <div style={{fontSize:11,color:"#6B7280"}}>Sold today: {formatQtyLong(soldQty,unit)}</div>
                                  </div>
                                  {decided ? (
                                    <div style={{fontSize:12,fontWeight:600,color:decided.decision==="repurpose"?"#059669":"#991B1B",textAlign:"right"}}>
                                      {decided.decision==="repurpose"
                                        ? `🔁 ${formatQtyLong(decided.excessQty,unit)} → ${decided.repurposeTargetType==="dish"?decided.repurposeTargetName:"Raw Materials"}`
                                        : `🗑️ ${formatQtyLong(decided.excessQty,unit)} wasted`}
                                    </div>
                                  ) : (
                                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                                      <label style={{fontSize:11,color:"#6B7280",fontWeight:600,whiteSpace:"nowrap"}}>Excess ({unitSuffix(unit,2)})</label>
                                      <input type="number" min="0" step={unit==="g"?"1":"0.5"} placeholder="0"
                                        value={excessInputs[item.id]||""}
                                        onChange={e=>setExcessInputs(prev=>({...prev,[item.id]:e.target.value}))}
                                        style={{width:60,fontSize:12,padding:"5px 7px",borderRadius:7,border:"1px solid #E5E7EB",textAlign:"center"}} />
                                    </div>
                                  )}
                                </div>
                                {!decided&&typedQty>0&&(
                                  repurposeChoiceFor===item.id ? (
                                    <div style={{marginTop:8,background:"#fff",border:"1px solid #E5E7EB",borderRadius:8,padding:8}}>
                                      <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:6}}>Repurpose {formatQtyLong(typedQty,unit)} of {item.name} to:</div>
                                      <div style={{display:"flex",gap:6,marginBottom:repurposeTargetDish!==null?0:6}}>
                                        <button onClick={()=>{setRepurposeTargetDish(repurposeTargetDish?null:{});setRepurposeDishSearch("");}}
                                          style={{flex:1,background:repurposeTargetDish?PURPLE:"#F3F4F6",color:repurposeTargetDish?"#fff":"#374151",border:"none",borderRadius:6,padding:"6px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                                          🍽️ Another Dish
                                        </button>
                                        <button onClick={()=>{setRepurposeChoiceFor(null);setRepurposeTargetDish(null);}}
                                          style={{background:"#F3F4F6",border:"none",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11,color:"#6B7280"}}>Cancel</button>
                                      </div>
                                      {repurposeTargetDish&&(
                                        <div style={{position:"relative"}}>
                                          <input value={repurposeTargetDish.name||repurposeDishSearch} onChange={e=>{setRepurposeDishSearch(e.target.value);setRepurposeTargetDish({});}}
                                            placeholder="Search which dish this becomes..."
                                            style={{width:"100%",fontSize:12,padding:"6px 9px",borderRadius:6,border:"1.5px solid "+PURPLE,boxSizing:"border-box",outline:"none"}} />
                                          {repurposeDishSearch.trim()&&!repurposeTargetDish.id&&(
                                            <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:8,marginTop:4,maxHeight:140,overflowY:"auto"}}>
                                              {dishes.filter(d=>d.id!==item.dishId&&d.name.toLowerCase().includes(repurposeDishSearch.toLowerCase())).map(d=>(
                                                <button key={d.id} onClick={()=>setRepurposeTargetDish({id:d.id,name:d.name})}
                                                  style={{width:"100%",textAlign:"left",padding:"7px 9px",border:"none",background:"none",cursor:"pointer",fontSize:12,borderBottom:"1px solid #F3F4F6"}}>
                                                  {d.name}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                          {repurposeTargetDish.id&&(
                                            <button onClick={()=>{decideExcess(p,TODAY_KEY,item,typedQty,"repurpose",{type:"dish",dishId:repurposeTargetDish.id,dishName:repurposeTargetDish.name});setRepurposeChoiceFor(null);setRepurposeTargetDish(null);}}
                                              style={{marginTop:6,width:"100%",background:PURPLE,color:"#fff",border:"none",borderRadius:6,padding:"7px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                                              Confirm → {repurposeTargetDish.name}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{display:"flex",gap:8,marginTop:8}}>
                                      <button onClick={()=>setRepurposeChoiceFor(item.id)}
                                        style={{flex:1,background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:7,padding:"7px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                                        🔁 Repurpose
                                      </button>
                                      <button onClick={()=>decideExcess(p,TODAY_KEY,item,typedQty,"waste")}
                                        style={{flex:1,background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:7,padding:"7px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                                        🗑️ Waste
                                      </button>
                                    </div>
                                  )
                                )}
                              </div>
                              );
                            })}
                          </div>
                          </>
                        )}
                        {undecidedTyped>0&&<div style={{fontSize:12,color:"#F59E0B",fontWeight:600,marginBottom:10}}>⚠️ {undecidedTyped} dish{undecidedTyped>1?"es":""} with a leftover amount typed but not yet logged — Repurpose or Waste it, or it won't be recorded.</div>}
                        <button onClick={()=>closeCanteen(p)}
                          style={{width:"100%",background:"#111827",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontSize:14,fontWeight:700}}>
                          🔒 Confirm Close for {p}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          {/* order item detail modal */}
          {orderDetailModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setOrderDetailModal(null)}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:440,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>{orderDetailModal.id}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>{orderDetailModal.user} · {orderDetailModal.date} · {orderDetailModal.time}</div>
                  </div>
                  <button onClick={()=>setOrderDetailModal(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
                </div>
                <div style={{padding:"18px 22px",overflowY:"auto"}}>
                  <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
                    {orderDetailModal.items.map((it,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,paddingBottom:12,borderBottom:i<orderDetailModal.items.length-1?"1px solid #F3F4F6":"none"}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:13,color:"#111"}}>
                            {it.name}
                            {it.size&&<span style={{marginLeft:6,fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 6px",borderRadius:8}}>{it.size}</span>}
                          </div>
                          <div style={{fontSize:12,color:"#6B7280",marginTop:3}}>₱{it.price} × {it.qty}</div>
                          {it.scheduledDate&&<div style={{fontSize:11,color:PURPLE,marginTop:3}}>📅 {it.scheduledDate}</div>}
                          {it.remarks&&<div style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic",marginTop:3}}>📝 {it.remarks}</div>}
                        </div>
                        <div style={{fontWeight:700,fontSize:14,color:PURPLE,whiteSpace:"nowrap"}}>₱{(it.price*it.qty)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:14,borderTop:"2px solid #F3F4F6"}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#111"}}>Total</span>
                    <span style={{fontWeight:800,fontSize:19,color:PURPLE}}>₱{orderDetailModal.total}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* edit order modal -- staff-admin fixing an uncollected order */}
          {editOrderModal&&(()=>{
            const order = orders.find(o=>o.id===editOrderModal.orderId);
            if(!order) return null;
            const total = editOrderModal.items.reduce((s,it)=>s+it.price*it.qty,0);
            const orderDateObj = new Date(order.date+"T00:00:00");
            const wk = getWeekKey(orderDateObj), dy = getDateKey(orderDateObj);
            const menuDishes = ((menu[wk]&&menu[wk][dy])||[]).filter(i=>i.available);
            const catalog = [
              ...menuDishes.map(i=>({...i,_cat:"Weekly Menu"})),
              ...otherProducts.filter(p=>p.available&&p.stock>0).map(p=>({...p,_cat:"Groceries"})),
              ...shortOrderItems.filter(i=>i.available!==false).map(i=>({...i,_cat:"Short Order"})),
              ...visitorMenuItems.filter(i=>i.available!==false).map(i=>({...i,_cat:"Visitor Menu"})),
            ];
            const search = editOrderModal.catalogSearch.trim().toLowerCase();
            const matches = search ? catalog.filter(c=>c.name.toLowerCase().includes(search)).slice(0,8) : [];
            return (
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setEditOrderModal(null)}>
                <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:460,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
                  <div style={{background:"#111827",padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>✏️ Edit {order.id}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>{order.user} · {order.date}</div>
                    </div>
                    <button onClick={()=>setEditOrderModal(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
                  </div>
                  <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
                    <div style={{fontSize:12,color:"#9CA3AF",marginBottom:10}}>Remove or adjust items that turned out unavailable, or add a replacement below.</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                      {editOrderModal.items.map((it,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:9,padding:"8px 10px"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:"#111"}}>{it.name}{it.size&&<span style={{marginLeft:6,fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 6px",borderRadius:8}}>{it.size}</span>}</div>
                            <div style={{fontSize:11,color:"#6B7280"}}>₱{it.price} each</div>
                          </div>
                          <button onClick={()=>updateEditOrderItemQty(i,-1)} style={{width:24,height:24,borderRadius:6,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>−</button>
                          <span style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:700}}>{it.qty}</span>
                          <button onClick={()=>updateEditOrderItemQty(i,1)} style={{width:24,height:24,borderRadius:6,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>+</button>
                          <span style={{fontWeight:700,fontSize:13,color:PURPLE,minWidth:50,textAlign:"right"}}>₱{it.price*it.qty}</span>
                          <button onClick={()=>removeEditOrderItem(i)} style={{background:"#FEE2E2",border:"none",borderRadius:6,width:24,height:24,cursor:"pointer",color:"#991B1B",fontSize:13,fontWeight:700}}>✕</button>
                        </div>
                      ))}
                      {editOrderModal.items.length===0&&<div style={{fontSize:12,color:"#9CA3AF",textAlign:"center",padding:"1rem 0"}}>No items left — add a replacement below, or close this and Cancel the order instead.</div>}
                    </div>

                    <div style={{position:"relative",marginBottom:8}}>
                      <input value={editOrderModal.catalogSearch} onChange={e=>setEditOrderModal(prev=>({...prev,catalogSearch:e.target.value}))}
                        placeholder="Search to add a replacement item..."
                        style={{width:"100%",fontSize:13,padding:"9px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",boxSizing:"border-box",outline:"none"}} />
                      {matches.length>0&&(
                        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1px solid #E5E7EB",borderRadius:9,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",maxHeight:220,overflowY:"auto",zIndex:10}}>
                          {matches.map(m=>(
                            <button key={m._cat+m.id} onClick={()=>{addItemToEditOrder(m);setEditOrderModal(prev=>({...prev,catalogSearch:""}));}}
                              style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,textAlign:"left",padding:"8px 12px",border:"none",background:"none",cursor:"pointer",borderBottom:"1px solid #F3F4F6"}}>
                              <span style={{fontSize:13,color:"#111"}}>{m.name} <span style={{fontSize:10,color:"#9CA3AF"}}>· {m._cat}</span></span>
                              <span style={{fontSize:12,fontWeight:700,color:PURPLE,whiteSpace:"nowrap"}}>₱{m.price}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{padding:"16px 22px",borderTop:"1px solid #F3F4F6",flexShrink:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#111"}}>New Total</span>
                      <span style={{fontWeight:800,fontSize:19,color:PURPLE}}>₱{total}</span>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <button onClick={()=>setEditOrderModal(null)} style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                      <button onClick={saveEditOrder} disabled={editOrderModal.items.length===0}
                        style={{flex:2,background:editOrderModal.items.length===0?"#C4B5FD":PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:editOrderModal.items.length===0?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
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
                    <div style={{borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,border:"1px solid "+(u.creditBalance<paymentModal.orderTotal?"#FCD34D":"#A7F3D0"),background:u.creditBalance<paymentModal.orderTotal?"#FEF3C7":"#F0FDF4",color:u.creditBalance<paymentModal.orderTotal?"#92400E":"#065F46"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>💳 Credit Balance</span>
                        <span style={{fontWeight:700,fontSize:15}}>₱{(u.creditBalance||0).toLocaleString()}</span>
                      </div>
                      {u.creditBalance<paymentModal.orderTotal&&(
                        <div style={{marginTop:6,fontSize:12,fontWeight:600,color:"#EF4444",display:"flex",alignItems:"center",gap:4}}>
                          ⚠️ Insufficient! Short by ₱{(paymentModal.orderTotal-(u.creditBalance||0)).toLocaleString()} — Credit is disabled
                        </div>
                      )}
                    </div>
                  ):null;})()}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <button onClick={()=>confirmPayment(paymentModal.orderId,"Cash")}
                      style={{background:"#F0FDF4",color:"#065F46",border:"2px solid #A7F3D0",borderRadius:12,padding:"18px 12px",cursor:"pointer",fontWeight:700,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <span style={{fontSize:28}}>💵</span>
                      <span>Cash</span>
                      <span style={{fontSize:11,fontWeight:400,color:"#6B7280"}}>No credit deduction</span>
                    </button>
                    {(()=>{
                      const u=users.find(uu=>uu.name===paymentModal.userName);
                      const insufficient = u&&u.creditBalance<paymentModal.orderTotal;
                      return(
                        <button
                          onClick={()=>{ if(insufficient) return; confirmPayment(paymentModal.orderId,"Credit"); }}
                          disabled={!!insufficient}
                          style={{background:insufficient?"#F3F4F6":PURPLE_LIGHT,color:insufficient?"#9CA3AF":PURPLE,border:"2px solid "+(insufficient?"#E5E7EB":PURPLE+"44"),borderRadius:12,padding:"18px 12px",cursor:insufficient?"not-allowed":"pointer",fontWeight:700,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6,opacity:insufficient?0.7:1}}>
                          <span style={{fontSize:28}}>💳</span>
                          <span>Credit</span>
                          <span style={{fontSize:11,fontWeight:400,color:insufficient?"#EF4444":"#6B7280"}}>
                            {insufficient?"Not enough balance":"Deducts from balance"}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
      )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="manage" size={20} color={PURPLE} /> Manage Orders {(role==="staff"||role==="staff-admin")&&<span style={{fontSize:13,fontWeight:500,color:PURPLE,background:PURPLE_LIGHT,padding:"2px 10px",borderRadius:20,marginLeft:6}}>📍 {currentUser.plant}</span>}
            </h2>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              {/* search bar */}
              <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220}}>
                <Icon name="search" size={15} color="#9CA3AF" />
                <input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} placeholder="Search by name, order ID, plant, or ID number..."
                  style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
              </div>
              {(isAdminLike||role==="staff-admin"||role==="staff")&&(
                <button onClick={()=>{setClosePlant((role==="staff"||role==="staff-admin")?currentUser.plant:(closePlant||"KF Main"));setExcessInputs({});setRepurposeChoiceFor(null);setShowCloseModal(true);}}
                  style={{background:"#111827",color:"#fff",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
                  🔒 Close Canteen
                </button>
              )}
            </div>
          </div>

          {/* close status per relevant plant(s) */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {((role==="staff"||role==="staff-admin")?[currentUser.plant]:PLANTS).map(p=>{
              const closeRec = isPlantClosed(p);
              if(!closeRec) return null;
              return (
                <div key={p} style={{display:"flex",alignItems:"center",gap:8,background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:9,padding:"7px 12px",fontSize:12,color:"#92400E",fontWeight:600}}>
                  🔒 {p} closed for today by {closeRec.closedBy}
                  <button onClick={()=>reopenCanteen(closeRec)} style={{background:"#fff",border:"1px solid #FCD34D",borderRadius:6,padding:"3px 9px",cursor:"pointer",fontSize:11,color:"#92400E",fontWeight:700}}>Reopen</button>
                </div>
              );
            })}
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

          {/* Date filter */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14,flexWrap:"wrap"}}>
            <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13,color:"#374151",fontWeight:600}}>
              <input type="checkbox" checked={orderShowAllDates} onChange={e=>setOrderShowAllDates(e.target.checked)}
                style={{width:15,height:15,cursor:"pointer"}} />
              Show all records (ignore date)
            </label>
            {!orderShowAllDates&&(
              <input type="date" value={orderDateFilter} onChange={e=>setOrderDateFilter(e.target.value)}
                style={{padding:"7px 12px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",background:"#fff"}} />
            )}
          </div>

          {/* Plant filter for staff-admin */}
          {role==="staff-admin"&&(
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
              {["All",...PLANTS].map(p=>(
                <button key={p} onClick={()=>setOrderPlantFilter(p)}
                  style={{padding:"5px 14px",borderRadius:20,border:"1px solid #E5E7EB",background:orderPlantFilter===p?PURPLE:"#fff",color:orderPlantFilter===p?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>
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

          {filteredOrders.length===0 ? (
            <Empty msg="No orders found" sub="Try a different name, order ID, or plant — or check &quot;Show all records&quot; if you're filtering by date." />
          ) : (
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#F9FAFB"}}>
                    {["Order ID","Customer","Plant","Items","Total","Time","Status","Action"].map(h=>(
                      <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.slice().sort((a,b)=>{
                    // Priority 1: Unpaid (needs Collect Payment) — always on top
                    // Priority 2: Paid — bottom
                    const pa = a.paymentType ? 1 : 0;
                    const pb = b.paymentType ? 1 : 0;
                    if(pa!==pb) return pa-pb;
                    // Within each group, most-recently-placed first. order.time
                    // is a display string like "5:46 AM" -- comparing it as
                    // text breaks across the AM/PM boundary (e.g. "07:35 PM"
                    // sorts before "11:12 AM" as plain strings), so parse it
                    // into an actual date+time before comparing.
                    return parseOrderTimestamp(b) - parseOrderTimestamp(a);
                  }).map(order=>(
                    <tr key={order.id} onClick={()=>setOrderDetailModal(order)} style={{borderBottom:"1px solid #F3F4F6",cursor:"pointer",opacity:order.status==="cancelled"?0.55:1}}>
                      <td style={{padding:"11px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:11,whiteSpace:"nowrap"}}>{order.id}</td>
                      <td style={{padding:"11px 14px",fontWeight:600,color:"#111",whiteSpace:"nowrap"}}>
                        {order.user}{order.guestType&&<span style={{color:"#9CA3AF",fontWeight:400}}> ({order.guestType==="guard"?"Guard":"Visitor"})</span>}
                        {order.source==="otc"&&<div style={{fontSize:10,background:"#FEF3C7",color:"#92400E",fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🧾 OTC</div>}
                        {order.source==="short-order"&&<div style={{fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🍽️ Short Order</div>}
                        {order.source==="visitor-menu"&&<div style={{fontSize:10,background:"#DBEAFE",color:"#1E40AF",fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🙋 Visitor Menu</div>}
                        {order.status==="cancelled"&&<div style={{fontSize:10,background:"#FEE2E2",color:"#991B1B",fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🚫 Cancelled{order.cancelledAt?" "+new Date(order.cancelledAt).toLocaleDateString("en-PH",{month:"short",day:"numeric"})+" "+new Date(order.cancelledAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}</div>}
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        {order.plant&&<span style={{background:PURPLE_LIGHT,color:PURPLE,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,whiteSpace:"nowrap"}}>📍 {order.plant}</span>}
                      </td>
                      <td style={{padding:"11px 14px",color:"#6B7280",minWidth:180}}>
                        {order.items.map((it,i)=>(
                          <div key={i} style={{fontSize:12,lineHeight:1.7,whiteSpace:"nowrap"}}>
                            {it.name} ×{it.qty}
                            {it.size&&<span style={{marginLeft:6,fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 6px",borderRadius:8}}>{it.size}</span>}
                            {it.scheduledDate&&<span style={{marginLeft:6,fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 6px",borderRadius:8}}>📅 {it.scheduledDate}</span>}
                            {it.remarks&&<div style={{fontSize:10,color:"#9CA3AF",fontStyle:"italic",whiteSpace:"normal"}}>📝 {it.remarks}</div>}
                          </div>
                        ))}
                      </td>
                      <td style={{padding:"11px 14px",fontWeight:700,color:PURPLE,whiteSpace:"nowrap"}}>₱{order.total}</td>
                      <td style={{padding:"11px 14px",color:"#9CA3AF",whiteSpace:"nowrap"}}>{order.time}</td>
                      <td style={{padding:"11px 14px"}}>
                        {order.status==="cancelled"
                          ? <span style={{background:"#FEE2E2",color:"#991B1B",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:10,whiteSpace:"nowrap"}}>🚫 Cancelled</span>
                          : order.paymentType
                            ? <span style={{background:order.paymentType==="Credit"?PURPLE_LIGHT:"#D1FAE5",color:order.paymentType==="Credit"?PURPLE:"#065F46",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:10,whiteSpace:"nowrap"}}>
                                {order.paymentType==="Credit"?"💳 Credit":"💵 Cash"}
                              </span>
                            : <span style={{background:"#FEF3C7",color:"#92400E",fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:10,whiteSpace:"nowrap"}}>⏳ Unpaid</span>
                        }
                      </td>
                      <td style={{padding:"11px 14px"}} onClick={e=>e.stopPropagation()}>
                        {order.status==="cancelled"
                          ? <span style={{fontSize:11,color:"#991B1B",whiteSpace:"nowrap"}}>🚫 Cancelled</span>
                          : !order.paymentType
                            ? <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>setPaymentModal({orderId:order.id,orderTotal:order.total,userName:order.user,userId:order.userId})}
                                  style={{background:PURPLE,color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
                                  💰 Collect
                                </button>
                                <button onClick={()=>openEditOrder(order)}
                                  style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
                                  ✏️ Edit
                                </button>
                              </div>
                            : <span style={{fontSize:11,color:"#9CA3AF",whiteSpace:"nowrap"}}>✅ Paid</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                      const stockLogEntry = {
                        id:"il"+Date.now(), product:stockModal.name, emoji:stockModal.emoji,
                        type:"IN", qty, before, after,
                        by:currentUser.name,
                        time: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
                      };
                      setInventoryLog(prev=>[stockLogEntry,...prev]);
                      dbInsertLog(stockLogEntry);
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
              <Icon name="products" size={20} color={PURPLE} /> Manage Groceries
            </h2>
            <button onClick={()=>{setEditProductId(null);setNewProduct({name:"",buyPrice:"",price:"",emoji:"🛍️",category:"Others",stock:"",photo:null});setShowAddProduct(true);}} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
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
                  <div style={{width:52,height:52,borderRadius:10,background:PURPLE_LIGHT,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
                    {p.isPhoto&&p.photo ? <img src={p.photo} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : p.emoji}
                  </div>
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
                  {/* edit info button */}
                  <button onClick={()=>{
                    setEditProductId(p.id);
                    setNewProduct({ name:p.name, buyPrice:String(p.buyPrice||0), price:String(p.price), emoji:p.isPhoto?"🛍️":(p.emoji||"🛍️"), category:p.category||"Others", stock:String(p.stock), photo:p.isPhoto?p.photo:null });
                    setShowAddProduct(true);
                  }} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#374151",fontSize:12,fontWeight:500,whiteSpace:"nowrap"}}>
                    <Icon name="edit" size={12} color="#374151" /> Edit
                  </button>
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
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>{editProductId?"Edit Grocery Item":"Add Grocery Item"}</div>
                  <button onClick={()=>{setShowAddProduct(false);setEditProductId(null);setNewProduct({name:"",buyPrice:"",price:"",emoji:"🛍️",category:"Others",stock:"",photo:null});setProductNameSuggestions([]); }}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:"22px",display:"flex",flexDirection:"column",gap:14}}>
                  {/* photo dropzone */}
                  <div>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Product Photo</label>
                    <div onDragOver={e=>{e.preventDefault();setProductDragOver(true);}} onDragLeave={()=>setProductDragOver(false)}
                      onDrop={e=>{e.preventDefault();setProductDragOver(false);handleProductPhotoFile(e.dataTransfer.files[0]);}}
                      onClick={()=>productPhotoInputRef.current?.click()}
                      style={{border:`2px dashed ${productDragOver?PURPLE:"#D1D5DB"}`,borderRadius:12,padding:"1.25rem",textAlign:"center",cursor:"pointer",background:productDragOver?PURPLE_LIGHT:"#FAFAFA",transition:"all 0.15s",position:"relative",minHeight:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
                      {newProduct.photo ? (
                        <><img src={newProduct.photo} alt="preview" style={{maxHeight:96,maxWidth:"100%",borderRadius:10,objectFit:"cover"}} />
                          <button onClick={e=>{e.stopPropagation();setNewProduct(p=>({...p,photo:null}));}} style={{position:"absolute",top:8,right:8,background:"#EF4444",border:"none",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                        </>
                      ) : (
                        <><div style={{width:40,height:40,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="products" size={18} color={PURPLE} /></div>
                          <div style={{fontSize:12,fontWeight:600,color:"#374151"}}>Drop photo here or click to browse</div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:11,color:"#9CA3AF"}}>or use emoji:</span>
                            <input value={newProduct.emoji} onChange={e=>setNewProduct(p=>({...p,emoji:e.target.value}))} onClick={e=>e.stopPropagation()}
                              style={{width:48,fontSize:18,borderRadius:8,border:"1px solid #E5E7EB",padding:"3px 5px",textAlign:"center",background:"#fff"}} />
                          </div>
                        </>
                      )}
                      <input ref={productPhotoInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleProductPhotoFile(e.target.files[0])} />
                    </div>
                  </div>
                  {/* name with suggestions */}
                  <div style={{position:"relative"}}>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Product Name</label>
                    <input value={newProduct.name}
                      onChange={e=>{
                        const v=e.target.value; setNewProduct(p=>({...p,name:v}));
                        if(v.trim().length>=2) setProductNameSuggestions(otherProducts.filter(p=>p.name.toLowerCase().includes(v.toLowerCase())));
                        else setProductNameSuggestions([]);
                      }}
                      onBlur={()=>setTimeout(()=>setProductNameSuggestions([]),150)}
                      placeholder="e.g. Nova Chips" autoComplete="off"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    {productNameSuggestions.length>0&&(
                      <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",zIndex:250,overflow:"hidden",marginTop:2}}>
                        {productNameSuggestions.map(p=>(
                          <button key={p.id} onMouseDown={()=>{setNewProduct(prev=>({...prev,name:p.name}));setProductNameSuggestions([]);}}
                            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"none",borderBottom:"1px solid #F3F4F6",background:"none",cursor:"pointer",textAlign:"left"}}>
                            <span style={{fontSize:18}}>{p.emoji}</span>
                            <span style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{p.name}</div>
                              <div style={{fontSize:11,color:"#6B7280"}}>{p.category} · {p.stock} in stock</div>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {newProduct.name.trim()&&otherProducts.some(p=>p.name.toLowerCase()===newProduct.name.trim().toLowerCase())&&(
                      <div style={{marginTop:6,fontSize:11,color:"#92400E",background:"#FEF3C7",borderRadius:7,padding:"6px 10px"}}>
                        ⚠️ "{newProduct.name.trim()}" already exists in the system.
                      </div>
                    )}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Category</label>
                      <select value={newProduct.category} onChange={e=>setNewProduct(p=>({...p,category:e.target.value}))}
                        style={{width:"100%",fontSize:13,padding:"10px 8px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
                        {["Chips","Biscuit","Instant Noodles","Instant Coffee","Powdered Drinks","Cold Drinks","Others"].map(c=><option key={c}>{c}</option>)}
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
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>{editProductId?"Stock":"Initial Stock"}</label>
                    <input value={newProduct.stock} onChange={e=>setNewProduct(p=>({...p,stock:e.target.value}))} placeholder="0" type="number" min="0"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:4}}>
                    <button onClick={()=>{setShowAddProduct(false);setEditProductId(null);setNewProduct({name:"",buyPrice:"",price:"",emoji:"🛍️",category:"Others",stock:"",photo:null});setProductNameSuggestions([]); }}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button onClick={addOtherProduct} disabled={!newProduct.name||!newProduct.price||!newProduct.stock}
                      style={{flex:2,background:newProduct.name&&newProduct.price&&newProduct.stock?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:newProduct.name&&newProduct.price&&newProduct.stock?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <Icon name="plus" size={15} color="#fff" /> {editProductId?"Save Changes":"Add Product"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── RAW MATERIALS (admin/staff-admin) ── */
    if(activeTab==="rawmaterials") {
      const displayedMaterials = rawMaterials.filter(m=>m.name.toLowerCase().includes(rawMaterialSearch.toLowerCase()));
      const totalValue = rawMaterials.reduce((s,m)=>s+m.stock*m.buyPrice,0);
      return (
        <div>
          {/* Add Stock modal */}
          {rawStockModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Stock</div>
                  <button onClick={()=>{setRawStockModal(null);setRawStockAddVal("");}} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:"24px 22px"}}>
                  <div style={{background:"#F9FAFB",borderRadius:10,padding:"12px 16px",marginBottom:20}}>
                    <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{rawStockModal.name}</div>
                    <div style={{fontSize:12,color:"#6B7280"}}>Current stock: <strong style={{color:PURPLE}}>{rawStockModal.stock} {rawStockModal.unit}</strong></div>
                  </div>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>How much to add ({rawStockModal.unit})?</label>
                  <input value={rawStockAddVal} onChange={e=>setRawStockAddVal(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&rawStockAddVal){addRawStock(rawStockModal.id,parseFloat(rawStockAddVal)||0);setRawStockModal(null);setRawStockAddVal("");}}}
                    type="number" min="0" step="0.01" placeholder="e.g. 10" autoFocus
                    style={{width:"100%",fontSize:18,fontWeight:700,padding:"12px 14px",borderRadius:9,border:`1.5px solid ${PURPLE}`,background:"#fff",color:"#111",boxSizing:"border-box",outline:"none",textAlign:"center"}} />
                  {rawStockAddVal&&parseFloat(rawStockAddVal)>0&&(
                    <div style={{marginTop:10,background:PURPLE_LIGHT,borderRadius:8,padding:"8px 12px",textAlign:"center",fontSize:13,color:PURPLE,fontWeight:600}}>
                      New stock will be: {rawStockModal.stock + (parseFloat(rawStockAddVal)||0)} {rawStockModal.unit}
                    </div>
                  )}
                  <div style={{display:"flex",gap:10,marginTop:16}}>
                    <button onClick={()=>{setRawStockModal(null);setRawStockAddVal("");}} style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button onClick={()=>{addRawStock(rawStockModal.id,parseFloat(rawStockAddVal)||0);setRawStockModal(null);setRawStockAddVal("");}} disabled={!rawStockAddVal||parseFloat(rawStockAddVal)<=0}
                      style={{flex:2,background:rawStockAddVal&&parseFloat(rawStockAddVal)>0?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:rawStockAddVal&&parseFloat(rawStockAddVal)>0?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                      + Add Stock
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="scale" size={20} color={PURPLE} /> Raw Materials
            </h2>
            <button onClick={()=>{setRawMaterialBatch({date:toDateKey(new Date()),rows:[emptyRawMaterialRow()]});setShowAddRawMaterial(true);}} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              <Icon name="plus" size={14} color="#fff" /> Encode Stock
            </button>
          </div>

          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:120}}>
              <span style={{fontSize:20,fontWeight:800,color:PURPLE}}>{rawMaterials.length}</span>
              <span style={{fontSize:11,color:"#6B7280",fontWeight:600,textAlign:"center"}}>Total Materials</span>
            </div>
            <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:120}}>
              <span style={{fontSize:20,fontWeight:800,color:"#059669"}}>₱{totalValue.toFixed(2)}</span>
              <span style={{fontSize:11,color:"#6B7280",fontWeight:600,textAlign:"center"}}>Total Stock Value</span>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220,maxWidth:320,marginBottom:16}}>
            <Icon name="search" size={15} color="#9CA3AF" />
            <input value={rawMaterialSearch} onChange={e=>setRawMaterialSearch(e.target.value)} placeholder="Search raw materials..."
              style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
            {rawMaterialSearch&&<button onClick={()=>setRawMaterialSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {displayedMaterials.map(m=>(
              <div key={m.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:10,background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <Icon name="scale" size={20} color={PURPLE} />
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,color:"#111"}}>{m.name}</div>
                  <div style={{fontSize:12,color:"#6B7280"}}>₱{m.buyPrice.toFixed(2)} / {m.unit}</div>
                  {m.excessStock>0&&(
                    <div style={{marginTop:2}}>
                      <div style={{fontSize:11,color:"#059669",fontWeight:600}}>🔁 +{m.excessStock.toFixed(2)} {m.unit} excess (repurposed, no cost)</div>
                      {rawMaterialLog.filter(l=>l.rawMaterial===m.name&&l.source==="excess").slice(0,4).map(l=>(
                        <div key={l.id} style={{fontSize:10,color:"#9CA3AF",marginTop:1}}>· {l.note||`+${l.qty.toFixed(2)} ${l.unit}`}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"center",minWidth:70}}>
                  <div style={{fontSize:16,fontWeight:800,color:"#111"}}>{m.stock}</div>
                  <div style={{fontSize:10,color:"#9CA3AF"}}>{m.unit} in stock</div>
                </div>
                <button onClick={()=>{setRawStockModal(m);setRawStockAddVal("");}}
                  style={{background:PURPLE_LIGHT,color:PURPLE,border:`1px solid ${PURPLE}44`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                  <Icon name="plus" size={12} color={PURPLE} /> Add Stock
                </button>
                <button onClick={()=>removeRawMaterial(m.id)} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500,flexShrink:0}}>
                  <Icon name="trash" size={13} color="#991B1B" /> Remove
                </button>
              </div>
            ))}
            {displayedMaterials.length===0&&<Empty msg="No raw materials found" sub="Add ingredients like rice, meat, or vegetables to start tracking recipes." />}
          </div>

          {/* Encode Stock modal -- bulk entry, one shared date for the whole batch */}
          {showAddRawMaterial&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:520,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Encode Stock</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>Fill in each row — click "+ Add Another" to add more</div>
                  </div>
                  <button onClick={()=>{setShowAddRawMaterial(false);setRawMaterialBatch({date:toDateKey(new Date()),rows:[emptyRawMaterialRow()]});}}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,flexShrink:0}}>×</button>
                </div>

                <div style={{overflowY:"auto",flex:1,padding:"16px 22px"}}>
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Date</label>
                    <input value={rawMaterialBatch.date} onChange={e=>setRawMaterialBatch(p=>({...p,date:e.target.value}))} type="date"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Applies to every row below.</div>
                  </div>

                  {rawMaterialBatch.rows.map((row,idx)=>{
                    const setField = (field,v)=>setRawMaterialBatch(p=>({...p,rows:p.rows.map(r=>r.id===row.id?{...r,[field]:v}:r)}));
                    const fieldStyle = {padding:"9px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",width:"100%",boxSizing:"border-box"};
                    const labelStyle = {fontSize:11,fontWeight:600,color:"#6B7280",display:"block",marginBottom:4};
                    const existing = row.name.trim() ? rawMaterials.find(m=>m.name.trim().toLowerCase()===row.name.trim().toLowerCase()) : null;
                    return (
                    <div key={row.id} style={{border:"1px solid #E5E7EB",borderRadius:10,padding:"14px",marginBottom:12,position:"relative",background:"#F9FAFB"}}>
                      {rawMaterialBatch.rows.length>1&&(
                        <button onClick={()=>setRawMaterialBatch(p=>({...p,rows:p.rows.filter(r=>r.id!==row.id)}))}
                          style={{position:"absolute",top:10,right:10,width:26,height:26,borderRadius:7,border:"none",background:"#FEE2E2",color:"#EF4444",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          ×
                        </button>
                      )}
                      <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:10,letterSpacing:"0.4px"}}>ITEM {idx+1}</div>
                      <div style={{marginBottom:10}}>
                        <label style={labelStyle}>Name</label>
                        <input value={row.name} onChange={e=>setField("name",e.target.value)} placeholder="e.g. Rice" style={fieldStyle} />
                        {existing&&<div style={{fontSize:11,color:PURPLE,marginTop:4,fontWeight:600}}>Matches existing material — adds to its current stock of {existing.stock} {existing.unit}.</div>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                        <div>
                          <label style={labelStyle}>Unit</label>
                          <select value={row.unit} onChange={e=>setField("unit",e.target.value)} disabled={!!existing} style={{...fieldStyle,background:existing?"#F3F4F6":"#fff",cursor:existing?"not-allowed":"pointer"}}>
                            {["kg","L","ml","bundle","plastic","bag"].map(u=><option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Cost/Unit (₱)</label>
                          <input value={row.buyPrice} onChange={e=>setField("buyPrice",e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" style={fieldStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Quantity</label>
                          <input value={row.qty} onChange={e=>setField("qty",e.target.value)} type="number" min="0" step="0.01" placeholder="0" style={fieldStyle} />
                        </div>
                      </div>
                    </div>
                    );
                  })}

                  <button onClick={()=>setRawMaterialBatch(p=>({...p,rows:[...p.rows,emptyRawMaterialRow()]}))}
                    style={{width:"100%",padding:"10px",border:"1.5px dashed #D1D5DB",borderRadius:9,background:"#F9FAFB",color:"#6B7280",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:4}}>
                    <Icon name="plus" size={14} color="#6B7280" /> Add Another
                  </button>
                </div>

                <div style={{padding:"16px 22px",borderTop:"1px solid #E5E7EB",flexShrink:0}}>
                  {rawMaterialBatch.rows.filter(r=>r.name.trim()&&r.qty).length>0&&(
                    <div style={{background:PURPLE_LIGHT,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:PURPLE}}>
                      ✅ <strong>{rawMaterialBatch.rows.filter(r=>r.name.trim()&&r.qty).length}</strong> item{rawMaterialBatch.rows.filter(r=>r.name.trim()&&r.qty).length>1?"s":""} ready to encode
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>{setShowAddRawMaterial(false);setRawMaterialBatch({date:toDateKey(new Date()),rows:[emptyRawMaterialRow()]});}}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button disabled={!rawMaterialBatch.rows.some(r=>r.name.trim()&&r.qty)||rawMaterialBatchSubmitting} onClick={submitRawMaterialBatch}
                      style={{flex:2,background:(rawMaterialBatch.rows.some(r=>r.name.trim()&&r.qty)&&!rawMaterialBatchSubmitting)?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:(rawMaterialBatch.rows.some(r=>r.name.trim()&&r.qty)&&!rawMaterialBatchSubmitting)?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <Icon name="plus" size={15} color="#fff" /> {rawMaterialBatchSubmitting?"Encoding...":"Encode Stock"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── DISHES (recipes, admin/staff-admin) ── */
    if(activeTab==="dishes") {
      const displayedDishes = dishes.filter(d=>d.name.toLowerCase().includes(dishSearch.toLowerCase()));
      const openAddDish = () => { setEditDishId(null); setNewDish({name:"",cat:"LUNCH",price:"",img:"🍽️",photo:null,grams:"",servingUnit:"g"}); setShowAddDish(true); };
      const openEditDish = (d) => { setEditDishId(d.id); setNewDish({name:d.name,cat:d.cat||"LUNCH",price:String(d.price),img:d.img,photo:d.isPhoto?d.img:null,grams:d.grams?String(d.grams):"",servingUnit:d.servingUnit||"g"}); setShowAddDish(true); };
      return (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="utensils" size={20} color={PURPLE} /> Manage Dishes
            </h2>
            <button onClick={openAddDish} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              <Icon name="plus" size={14} color="#fff" /> Add Dish
            </button>
          </div>
          <div style={{fontSize:12,color:"#6B7280",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
            💡 Dishes are reusable catalog entries. Every weekly menu item is linked to a dish (via <strong>Manage Menu → Add Item</strong>) for its name, photo, and default price.
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220,maxWidth:320,marginBottom:16}}>
            <Icon name="search" size={15} color="#9CA3AF" />
            <input value={dishSearch} onChange={e=>setDishSearch(e.target.value)} placeholder="Search dishes..."
              style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
            {dishSearch&&<button onClick={()=>setDishSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:12}}>
            {displayedDishes.map(d=>{
              return (
                <div key={d.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:44,height:44,borderRadius:10,background:PURPLE_LIGHT,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                      {d.isPhoto&&d.img ? <img src={d.img} alt={d.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : d.img}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#111"}}>{d.name}</div>
                      <div style={{fontSize:11,color:"#6B7280"}}>{d.cat} · ₱{d.price}{d.grams?` · ${unitIcon(d.servingUnit)} ${formatServing(d.grams,d.servingUnit)}/serving`:""}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button onClick={()=>openEditDish(d)} style={{flex:1,background:PURPLE_LIGHT,color:PURPLE,border:"none",borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                      <Icon name="edit" size={12} color={PURPLE} /> Edit
                    </button>
                    <button onClick={()=>removeDish(d.id)} style={{flex:1,background:"#FEE2E2",border:"none",borderRadius:7,padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:600}}>
                      <Icon name="trash" size={12} color="#991B1B" /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {displayedDishes.length===0&&<Empty msg="No dishes yet" sub="Create a dish and give it a recipe to start tracking raw materials." />}
        </div>
      );
    }

    /* ── RECEIPTS (staff-admin) ── */
    if(activeTab==="receipts") {
      const sortedReceipts = [...receipts].sort((a,b)=> new Date(b.date)-new Date(a.date));
      const totalAmount = receipts.reduce((s,r)=>s+(r.amount||0),0);
      return (
        <div>
          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="receipt" size={20} color={PURPLE} /> Receipts
            </h2>
            {(isAdminLike||role==="staff-admin")&&(
              <button onClick={()=>{setNewReceipt({date:toDateKey(new Date()),source:"Grocery",sourceName:"",purchaseType:"Grocery",note:""});setReceiptPhotos([]);setShowAddReceipt(true);}}
                style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                <Icon name="plus" size={14} color="#fff" /> Add Receipts
              </button>
            )}
          </div>

          {/* summary stats */}
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:110}}>
              <span style={{fontSize:20,fontWeight:800,color:PURPLE}}>{receipts.length}</span>
              <span style={{fontSize:11,color:"#6B7280",fontWeight:600,textAlign:"center"}}>Total Receipts</span>
            </div>
            <div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:110}}>
              <span style={{fontSize:20,fontWeight:800,color:"#059669"}}>₱{totalAmount.toFixed(2)}</span>
              <span style={{fontSize:11,color:"#6B7280",fontWeight:600,textAlign:"center"}}>Total Amount</span>
            </div>
          </div>

          {/* receipt cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:12}}>
            {sortedReceipts.map(r=>(
              <div key={r.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                <div onClick={()=>setViewReceipt(r)} style={{cursor:"pointer",height:130,background:"#F9FAFB",overflow:"hidden"}}>
                  <img src={r.photo} alt="receipt" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                </div>
                <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#111"}}>
                      {new Date(r.date+"T00:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}
                    </div>
                    {r.source&&<span style={{fontSize:10,background:r.source==="Supplier"?"#E0F2FE":PURPLE_LIGHT,color:r.source==="Supplier"?"#0369A1":PURPLE,fontWeight:600,padding:"1px 7px",borderRadius:8,whiteSpace:"nowrap"}}>{r.source}</span>}
                  </div>
                  {r.sourceName&&<div style={{fontSize:11,color:"#6B7280",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sourceName}</div>}
                  {r.purchaseType&&<span style={{alignSelf:"flex-start",fontSize:10,background:r.purchaseType==="Raw Materials"?"#FEF3C7":"#D1FAE5",color:r.purchaseType==="Raw Materials"?"#92400E":"#065F46",fontWeight:600,padding:"1px 7px",borderRadius:8,whiteSpace:"nowrap"}}>{r.purchaseType}</span>}
                  {r.amount!=null&&<div style={{fontSize:12,color:"#059669",fontWeight:600}}>₱{r.amount.toFixed(2)}</div>}
                  {r.note&&<div style={{fontSize:12,color:"#6B7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.note}</div>}
                  <div style={{fontSize:11,color:"#9CA3AF"}}>by {r.by}</div>
                  <button onClick={()=>removeReceipt(r.id)} style={{marginTop:4,background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4,color:"#991B1B",fontSize:11,fontWeight:500}}>
                    <Icon name="trash" size={12} color="#991B1B" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          {sortedReceipts.length===0&&<Empty msg="No receipts yet" sub="Attach a photo of a purchase receipt to get started." />}

          {/* ADD RECEIPTS MODAL */}
          {showAddReceipt&&(isAdminLike||role==="staff-admin")&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:520,maxHeight:"90vh",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add Receipts</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>Attach one or more photos — each becomes its own receipt</div>
                  </div>
                  <button onClick={()=>setShowAddReceipt(false)}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{padding:"22px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Receipt Photos</label>
                    <div onDragOver={e=>{e.preventDefault();setReceiptDragOver(true);}} onDragLeave={()=>setReceiptDragOver(false)}
                      onDrop={e=>{e.preventDefault();setReceiptDragOver(false);handleReceiptPhotoFiles(e.dataTransfer.files);}}
                      onClick={()=>receiptPhotoInputRef.current?.click()}
                      style={{border:`2px dashed ${receiptDragOver?PURPLE:"#D1D5DB"}`,borderRadius:12,padding:"1.25rem",textAlign:"center",cursor:"pointer",background:receiptDragOver?PURPLE_LIGHT:"#FAFAFA",transition:"all 0.15s",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
                      <div style={{width:40,height:40,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="receipt" size={18} color={PURPLE} /></div>
                      <div style={{fontSize:13,fontWeight:600,color:"#374151"}}>Drop photos here or click to browse</div>
                      <div style={{fontSize:12,color:"#9CA3AF"}}>Select multiple files at once · JPG, PNG, WEBP</div>
                      <input ref={receiptPhotoInputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{handleReceiptPhotoFiles(e.target.files);e.target.value="";}} />
                    </div>
                  </div>

                  {receiptPhotos.length>0&&(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#374151"}}>{receiptPhotos.length} photo{receiptPhotos.length>1?"s":""} attached</div>
                      {receiptPhotos.map(p=>(
                        <div key={p.tempId} style={{display:"flex",alignItems:"center",gap:10,background:"#F9FAFB",borderRadius:10,padding:"8px 10px"}}>
                          <img src={p.photo} alt="receipt" style={{width:48,height:48,borderRadius:8,objectFit:"cover",flexShrink:0}} />
                          <div style={{flex:1,position:"relative"}}>
                            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#9CA3AF"}}>₱</span>
                            <input value={p.amount} onChange={e=>{const v=e.target.value;setReceiptPhotos(prev=>prev.map(pp=>pp.tempId===p.tempId?{...pp,amount:v}:pp));}}
                              placeholder="Amount (optional)" type="number" min="0" step="0.01"
                              style={{width:"100%",fontSize:13,padding:"8px 10px 8px 24px",borderRadius:8,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                          </div>
                          <button onClick={()=>setReceiptPhotos(prev=>prev.filter(pp=>pp.tempId!==p.tempId))}
                            style={{background:"#FEE2E2",border:"none",borderRadius:7,width:30,height:30,cursor:"pointer",color:"#991B1B",fontSize:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Date</label>
                      <input value={newReceipt.date} onChange={e=>setNewReceipt(p=>({...p,date:e.target.value}))} type="date"
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    </div>
                    <div>
                      <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Purchased From</label>
                      <select value={newReceipt.source} onChange={e=>setNewReceipt(p=>({...p,source:e.target.value}))}
                        style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
                        <option value="Grocery">Grocery</option>
                        <option value="Supplier">Supplier</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>{newReceipt.source} Name <span style={{fontWeight:400,color:"#9CA3AF"}}>(optional)</span></label>
                    <input value={newReceipt.sourceName} onChange={e=>setNewReceipt(p=>({...p,sourceName:e.target.value}))}
                      placeholder={newReceipt.source==="Supplier"?"e.g. ABC Meat Supplier":"e.g. SM Supermarket"}
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Purchase Type</label>
                    <div style={{display:"flex",gap:8}}>
                      {["Raw Materials","Grocery"].map(t=>(
                        <button key={t} type="button" onClick={()=>setNewReceipt(p=>({...p,purchaseType:t}))}
                          style={{flex:1,padding:"9px 12px",borderRadius:9,border:"1.5px solid "+(newReceipt.purchaseType===t?PURPLE:"#E5E7EB"),background:newReceipt.purchaseType===t?PURPLE:"#fff",color:newReceipt.purchaseType===t?"#fff":"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>What the purchase is for — ingredients for cooking vs. resale snacks/drinks.</div>
                  </div>
                  <div>
                    <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Note <span style={{fontWeight:400,color:"#9CA3AF"}}>(applies to all photos in this batch)</span></label>
                    <input value={newReceipt.note} onChange={e=>setNewReceipt(p=>({...p,note:e.target.value}))} placeholder="e.g. Weekly stock restock"
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:4}}>
                    <button onClick={()=>setShowAddReceipt(false)}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button onClick={addReceipts} disabled={!receiptPhotos.length}
                      style={{flex:2,background:receiptPhotos.length?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:receiptPhotos.length?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <Icon name="plus" size={15} color="#fff" /> Save {receiptPhotos.length||""} Receipt{receiptPhotos.length===1?"":"s"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW RECEIPT MODAL */}
          {viewReceipt&&(
            <div onClick={()=>setViewReceipt(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>
                    {new Date(viewReceipt.date+"T00:00:00").toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})}
                  </div>
                  <button onClick={()=>setViewReceipt(null)}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <img src={viewReceipt.photo} alt="receipt full" style={{width:"100%",maxHeight:420,objectFit:"contain",background:"#F9FAFB"}} />
                <div style={{padding:"16px 22px",display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {viewReceipt.source&&<span style={{fontSize:11,background:viewReceipt.source==="Supplier"?"#E0F2FE":PURPLE_LIGHT,color:viewReceipt.source==="Supplier"?"#0369A1":PURPLE,fontWeight:600,padding:"2px 9px",borderRadius:10}}>{viewReceipt.source}{viewReceipt.sourceName?" · "+viewReceipt.sourceName:""}</span>}
                    {viewReceipt.purchaseType&&<span style={{fontSize:11,background:viewReceipt.purchaseType==="Raw Materials"?"#FEF3C7":"#D1FAE5",color:viewReceipt.purchaseType==="Raw Materials"?"#92400E":"#065F46",fontWeight:600,padding:"2px 9px",borderRadius:10}}>{viewReceipt.purchaseType}</span>}
                  </div>
                  {viewReceipt.amount!=null&&<div style={{fontSize:14,color:"#059669",fontWeight:700}}>₱{viewReceipt.amount.toFixed(2)}</div>}
                  {viewReceipt.note&&<div style={{fontSize:13,color:"#374151"}}>{viewReceipt.note}</div>}
                  <div style={{fontSize:12,color:"#9CA3AF"}}>Uploaded by {viewReceipt.by} · {viewReceipt.uploadedAt}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── EXPENSES (admin/staff-admin) ── */
    if(activeTab==="expenses") {
      const employees = users.filter(u=>u.isEmployee!==false&&u.registered&&u.role!=="superadmin");
      const monthPrefix = expenseYear+"-"+String(expenseMonth+1).padStart(2,"0");
      const monthOrders = orders.filter(o=>o.date&&o.date.startsWith(monthPrefix));
      const monthLabel = new Date(expenseYear,expenseMonth).toLocaleDateString("en-PH",{month:"long",year:"numeric"});
      const isCurrentMonth = expenseYear===TODAY_DATE.getFullYear()&&expenseMonth===TODAY_DATE.getMonth();

      const rangeOrders = orders.filter(o=>o.date&&o.date>=expenseFromDate&&o.date<=expenseToDate);
      const rangeLabel = formatDateFull(new Date(expenseFromDate+"T00:00:00"))+" – "+formatDateFull(new Date(expenseToDate+"T00:00:00"));

      const periodOrders = expenseUseRange ? rangeOrders : monthOrders;
      const periodLabel = expenseUseRange ? rangeLabel : monthLabel;

      const allRows = employees.map(emp=>{
        const empOrders = periodOrders.filter(o=>o.userId===emp.id);
        const cash = empOrders.filter(o=>o.paymentType==="Cash").reduce((s,o)=>s+o.total,0);
        const credit = empOrders.filter(o=>o.paymentType==="Credit").reduce((s,o)=>s+o.total,0);
        const pending = empOrders.filter(o=>!o.paymentType).reduce((s,o)=>s+o.total,0);
        return { id:emp.id, idNumber:emp.idNumber, name:emp.name, avatar:emp.avatar, plant:emp.plant, orderCount:empOrders.length, cash, credit, pending, total:cash+credit };
      }).sort((a,b)=>b.total-a.total);

      const rows = allRows.filter(r=>
        r.name.toLowerCase().includes(expenseSearch.toLowerCase())||
        (r.plant||"").toLowerCase().includes(expenseSearch.toLowerCase())||
        (r.idNumber||"").toLowerCase().includes(expenseSearch.toLowerCase())
      );

      const grandCash = rows.reduce((s,r)=>s+r.cash,0);
      const grandCredit = rows.reduce((s,r)=>s+r.credit,0);
      const grandPending = rows.reduce((s,r)=>s+r.pending,0);
      const grandTotal = rows.reduce((s,r)=>s+r.total,0);

      return (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="expense" size={20} color={PURPLE} /> Employee Expenses
            </h2>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <select value={expenseExportType} onChange={e=>setExpenseExportType(e.target.value)}
                style={{padding:"9px 10px",borderRadius:9,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",background:"#fff",cursor:"pointer",fontWeight:600}}>
                <option value="all">All Details</option>
                <option value="credit">Credit Only</option>
              </select>
              <button onClick={()=>downloadExpensesExcel(rows, periodLabel, expenseExportType)} disabled={rows.length===0}
                style={{background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",cursor:rows.length===0?"not-allowed":"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6,opacity:rows.length===0?0.6:1}}>
                ⬇️ Download Excel
              </button>
            </div>
          </div>

          {/* period selector: calendar month vs custom range */}
          <div style={{display:"flex",gap:4,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:4,marginBottom:12,width:"fit-content"}}>
            <button onClick={()=>setExpenseUseRange(false)} style={{padding:"7px 16px",borderRadius:7,border:"none",background:!expenseUseRange?PURPLE:"transparent",color:!expenseUseRange?"#fff":"#6B7280",fontWeight:!expenseUseRange?700:400,fontSize:13,cursor:"pointer"}}>
              Calendar Month
            </button>
            <button onClick={()=>setExpenseUseRange(true)} style={{padding:"7px 16px",borderRadius:7,border:"none",background:expenseUseRange?PURPLE:"transparent",color:expenseUseRange?"#fff":"#6B7280",fontWeight:expenseUseRange?700:400,fontSize:13,cursor:"pointer"}}>
              Custom Range
            </button>
          </div>

          {!expenseUseRange ? (
            /* month navigator */
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"6px 6px"}}>
                <button onClick={()=>{ if(expenseMonth===0){setExpenseMonth(11);setExpenseYear(y=>y-1);} else setExpenseMonth(m=>m-1); }}
                  style={{background:"none",border:"none",borderRadius:7,width:30,height:30,cursor:"pointer",fontSize:16,color:PURPLE,display:"flex",alignItems:"center",justifyContent:"center"}}>{"<"}</button>
                <span style={{fontWeight:600,fontSize:14,color:"#374151",minWidth:150,textAlign:"center"}}>📅 {monthLabel}</span>
                <button onClick={()=>{ if(expenseMonth===11){setExpenseMonth(0);setExpenseYear(y=>y+1);} else setExpenseMonth(m=>m+1); }}
                  style={{background:"none",border:"none",borderRadius:7,width:30,height:30,cursor:"pointer",fontSize:16,color:PURPLE,display:"flex",alignItems:"center",justifyContent:"center"}}>{">"}</button>
              </div>
              {isCurrentMonth
                ? <span style={{fontSize:11,background:"#D1FAE5",color:"#065F46",padding:"2px 8px",borderRadius:10,fontWeight:600}}>This Month</span>
                : <button onClick={()=>{setExpenseMonth(TODAY_DATE.getMonth());setExpenseYear(TODAY_DATE.getFullYear());}}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:PURPLE,fontWeight:600}}>
                    Back to This Month
                  </button>
              }
            </div>
          ) : (
            /* custom date range */
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"8px 12px"}}>
                <span style={{fontSize:12,color:"#6B7280",fontWeight:600}}>From</span>
                <input type="date" value={expenseFromDate} max={expenseToDate} onChange={e=>setExpenseFromDate(e.target.value)}
                  style={{border:"none",outline:"none",fontSize:13,color:"#111"}} />
                <span style={{fontSize:12,color:"#6B7280",fontWeight:600}}>To</span>
                <input type="date" value={expenseToDate} min={expenseFromDate} onChange={e=>setExpenseToDate(e.target.value)}
                  style={{border:"none",outline:"none",fontSize:13,color:"#111"}} />
              </div>
            </div>
          )}

          {/* summary */}
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            {[
              {label:"💵 Cash",      value:grandCash,    color:"#059669"},
              {label:"💳 Credit",    value:grandCredit,  color:PURPLE},
              {label:"⏳ Pending",   value:grandPending, color:"#F59E0B"},
              {label:"Total Spent",  value:grandTotal,   color:"#111"},
            ].map(s=>(
              <div key={s.label} style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:120}}>
                <span style={{fontSize:18,fontWeight:800,color:s.color}}>₱{s.value.toLocaleString()}</span>
                <span style={{fontSize:11,color:"#6B7280",fontWeight:600,textAlign:"center"}}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* search */}
          <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220,maxWidth:320,marginBottom:16}}>
            <Icon name="search" size={15} color="#9CA3AF" />
            <input value={expenseSearch} onChange={e=>setExpenseSearch(e.target.value)} placeholder="Search employee, plant, ID..."
              style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
            {expenseSearch&&<button onClick={()=>setExpenseSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
          </div>

          {/* table */}
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#F9FAFB"}}>
                  {["Employee","ID No.","Plant","Orders","Cash","Credit","Pending","Total Spent"].map(h=>(
                    <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length===0&&<tr><td colSpan={8} style={{padding:"2rem",textAlign:"center",color:"#9CA3AF"}}>No employees found.</td></tr>}
                {rows.map(r=>(
                  <tr key={r.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:PURPLE,flexShrink:0}}>{r.avatar}</div>
                        <span style={{fontWeight:600,color:"#111",fontSize:13}}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12,whiteSpace:"nowrap"}}>{r.idNumber||"—"}</td>
                    <td style={{padding:"12px 14px"}}><span style={{background:PURPLE_LIGHT,color:PURPLE,fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20,whiteSpace:"nowrap"}}>{r.plant||"—"}</span></td>
                    <td style={{padding:"12px 14px",color:"#374151",fontWeight:600}}>{r.orderCount}</td>
                    <td style={{padding:"12px 14px",color:"#059669",fontWeight:600,whiteSpace:"nowrap"}}>₱{r.cash.toLocaleString()}</td>
                    <td style={{padding:"12px 14px",color:PURPLE,fontWeight:600,whiteSpace:"nowrap"}}>₱{r.credit.toLocaleString()}</td>
                    <td style={{padding:"12px 14px",color:r.pending>0?"#F59E0B":"#9CA3AF",fontWeight:600,whiteSpace:"nowrap"}}>₱{r.pending.toLocaleString()}</td>
                    <td style={{padding:"12px 14px",color:"#111",fontWeight:700,whiteSpace:"nowrap"}}>₱{r.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,background:"#F9FAFB",borderRadius:10,border:"1px solid #E5E7EB",padding:"10px 14px",fontSize:12,color:"#6B7280"}}>
            💡 "Total Spent" counts only paid orders (Cash + Credit). Pending shows orders placed but not yet paid.
          </div>
        </div>
      );
    }

    /* ── PERSONNEL (admin) ── */
    if(activeTab==="personnel") {
      const employees = users.filter(u=>u.isEmployee!==false&&u.role!=="superadmin");
      const outsideCustomers = users.filter(u=>u.isEmployee===false);
      const byName = (a,b)=>a.name.localeCompare(b.name);
      const unregistered = employees.filter(u=>!u.registered).sort(byName);
      const registered = employees.filter(u=>u.registered).sort(byName);
      const searchTerm = personnelSearch;
      const filteredUsers = (personnelTab==="unregistered"?unregistered:registered).filter(u=>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.username||"").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.plant||"").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.idNumber||"").toLowerCase().includes(searchTerm.toLowerCase())
      );
      const filteredCustomers = outsideCustomers.filter(u=>
        u.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (u.email||"").toLowerCase().includes(customerSearch.toLowerCase()) ||
        (u.phone||"").toLowerCase().includes(customerSearch.toLowerCase())
      );
      return (
        <div>
          {/* Import Excel Modal */}
          {showImportModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:560,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden",maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
                {/* Header */}
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>📥 Import Employees via Excel</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>Upload .xlsx file to bulk-add unregistered employees</div>
                  </div>
                  <button onClick={()=>setShowImportModal(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>

                <div style={{padding:"22px",overflowY:"auto",flex:1}}>
                  {/* Download Template */}
                  <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"14px 16px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:PURPLE}}>Step 1: Download the template</div>
                      <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>Fill in employee details and save as .xlsx</div>
                    </div>
                    <button onClick={()=>{
                      var wb = null;
                      function doDownload() {
                        wb = window.XLSX.utils.book_new();
                        var wsData = [
                          ["SECTION/DEPT.","EMPLOYEE NO.","POSITION","EMPLOYEE NAME","COMPANY","CREDIT LIMIT"],
                          ["ACCOUNTING","KF-24-0001","STAFF","Juan Dela Cruz","KOU FU COLOR PRINTING CORPORATION","500"],
                          ["QA","CT-24-0002","OPERATOR","Maria Santos","COLORTREE LABEL CORPORATION","500"],
                        ];
                        var ws = window.XLSX.utils.aoa_to_sheet(wsData);
                        ws["!cols"] = [{wch:16},{wch:14},{wch:14},{wch:24},{wch:32},{wch:14}];
                        window.XLSX.utils.book_append_sheet(wb, ws, "Employees");
                        window.XLSX.writeFile(wb, "KFCanteen_Employee_Template.xlsx");
                      }
                      if(window.XLSX){ doDownload(); return; }
                      var s=document.createElement("script");
                      s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                      s.onload=doDownload;
                      document.head.appendChild(s);
                    }} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600,flexShrink:0}}>
                      ⬇️ Download Template
                    </button>
                  </div>

                  {/* Column guide */}
                  <div style={{background:"#F9FAFB",borderRadius:10,padding:"12px 16px",marginBottom:18,fontSize:12}}>
                    <div style={{fontWeight:700,color:"#374151",marginBottom:8}}>📋 Expected Columns (matches your HR export format):</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      {[
                        {col:"SECTION/DEPT.", desc:"Employee's department", req:true},
                        {col:"EMPLOYEE NO.", desc:"Employee ID — must be unique", req:true},
                        {col:"POSITION", desc:"Job title", req:false},
                        {col:"EMPLOYEE NAME", desc:"Full name of employee", req:true},
                        {col:"COMPANY", desc:"Employer company as shown in HR records", req:false},
                        {col:"CREDIT LIMIT", desc:"Per-employee credit limit and starting balance", req:true},
                      ].map(c=>(
                        <div key={c.col} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                          <span style={{fontFamily:"monospace",background:"#E5E7EB",padding:"1px 6px",borderRadius:4,fontSize:11,flexShrink:0,color:"#374151"}}>{c.col}</span>
                          <span style={{color:"#6B7280"}}>{c.desc} {c.req&&<span style={{color:"#EF4444"}}>*</span>}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:8,fontSize:11,color:"#9CA3AF"}}>* Required fields. Company is informational only — it does not set the Plant. Plant (KF Main, Colortree, KF II (Global)) is assigned by an admin afterwards in the Employees table. Rows with an Employee No. that already exists in the system are skipped automatically to avoid duplicates.</div>
                  </div>

                  {/* Upload area */}
                  <div style={{marginBottom:16}}>
                    <div style={{fontWeight:600,fontSize:13,color:"#374151",marginBottom:8}}>Step 2: Upload your filled file</div>
                    <label style={{display:"block",border:"2px dashed #D1D5DB",borderRadius:10,padding:"24px",textAlign:"center",cursor:"pointer",background:"#F9FAFB",transition:"border-color 0.2s"}}>
                      <div style={{fontSize:28,marginBottom:8}}>📂</div>
                      <div style={{fontWeight:600,fontSize:13,color:"#374151"}}>Click to upload .xlsx file</div>
                      <div style={{fontSize:12,color:"#9CA3AF",marginTop:4}}>Only .xlsx files are supported</div>
                      <input type="file" accept=".xlsx" style={{display:"none"}} onChange={e=>{
                        var file = e.target.files[0];
                        if(!file) return;
                        setImportError("");
                        function processFile() {
                          var reader = new FileReader();
                          reader.onload = function(ev) {
                            try {
                              var wb = window.XLSX.read(ev.target.result, {type:"binary"});
                              var ws = wb.Sheets[wb.SheetNames[0]];
                              var rows = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
                              if(!rows.length){ setImportError("File is empty or unreadable."); return; }

                              // normalize headers (trim + uppercase) so trailing spaces / minor
                              // variants across different exports (e.g. "COMPANY " vs "COMPANY")
                              // don't break column matching
                              var headerIndex = {};
                              (rows[0]||[]).forEach(function(h, idx){ headerIndex[String(h).trim().toUpperCase()] = idx; });
                              function col(row, key) {
                                var idx = headerIndex[key];
                                return idx==null ? "" : String(row[idx]==null?"":row[idx]).trim();
                              }

                              var valid = [], errors = [], skippedDup = 0;
                              var seenIds = {};
                              for (var i=1; i<rows.length; i++) {
                                var row = rows[i];
                                if(!row || row.every(function(c){return String(c==null?"":c).trim()==="";})) continue;
                                var idNum = col(row,"EMPLOYEE NO.") || col(row,"EMPLOYEE NO") || col(row,"ID_NUMBER") || col(row,"ID NUMBER");
                                var name = col(row,"EMPLOYEE NAME") || col(row,"NAME");
                                var department = col(row,"SECTION/DEPT.") || col(row,"SECTION/DEPT") || col(row,"DEPARTMENT");
                                var position = col(row,"POSITION");
                                var company = col(row,"COMPANY");
                                var creditLimitRaw = col(row,"CREDIT LIMIT") || col(row,"CREDIT_LIMIT");
                                var rowCreditLimit = creditLimitRaw!==""&&!isNaN(parseFloat(creditLimitRaw)) ? parseFloat(creditLimitRaw) : null;

                                if(!idNum||!name){ errors.push("Row "+(i+1)+": missing Employee No. or Employee Name"); continue; }
                                if(rowCreditLimit==null){ errors.push("Row "+(i+1)+": missing or invalid CREDIT LIMIT"); continue; }
                                if(seenIds[idNum]){ skippedDup++; continue; }
                                if(users.some(function(u){ return (u.idNumber||"").trim()===idNum; })){ skippedDup++; continue; }

                                seenIds[idNum] = true;
                                // Plant is intentionally left unassigned here — an admin assigns
                                // it manually afterwards (e.g. KF II (Global) has no source spreadsheet).
                                valid.push({ idNumber:idNum, name:toProperCase(name), department, position, company, creditLimit:rowCreditLimit, plant:"", role:"user" });
                              }
                              if(skippedDup>0){ errors.push(skippedDup+" row"+(skippedDup>1?"s":"")+" skipped — Employee No. already exists in the system."); }
                              if(errors.length) { setImportError(errors.slice(0,5).join("\n")+(errors.length>5?"\n...and "+(errors.length-5)+" more":"")); }
                              setImportPreview(valid);
                            } catch(err) {
                              setImportError("Could not read file. Make sure it is a valid .xlsx file.");
                            }
                          };
                          reader.readAsBinaryString(file);
                        }
                        if(window.XLSX){ processFile(); return; }
                        var s=document.createElement("script");
                        s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                        s.onload=processFile;
                        document.head.appendChild(s);
                      }} />
                    </label>
                  </div>

                  {/* Error */}
                  {importError&&(
                    <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#991B1B",whiteSpace:"pre-line"}}>
                      ⚠️ {importError}
                    </div>
                  )}

                  {/* Preview */}
                  {importPreview.length>0&&(
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:"#374151",marginBottom:8}}>
                        ✅ {importPreview.length} employee{importPreview.length>1?"s":""} ready to import
                      </div>
                      <div style={{border:"1px solid #E5E7EB",borderRadius:10,maxHeight:200,overflow:"auto"}}>
                        <table style={{width:"100%",minWidth:720,borderCollapse:"collapse",fontSize:12}}>
                          <thead>
                            <tr style={{background:"#F9FAFB"}}>
                              {["ID Number","Name","Department","Position","Company","Credit Limit"].map(h=>(
                                <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:600,color:"#6B7280",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap",position:"sticky",top:0,background:"#F9FAFB"}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.map((e,i)=>(
                              <tr key={i} style={{borderBottom:"1px solid #F3F4F6"}}>
                                <td style={{padding:"7px 12px",fontFamily:"monospace",color:"#374151",whiteSpace:"nowrap"}}>{e.idNumber}</td>
                                <td style={{padding:"7px 12px",fontWeight:600,color:"#111",whiteSpace:"nowrap"}}>{e.name}</td>
                                <td style={{padding:"7px 12px",color:"#6B7280",whiteSpace:"nowrap"}}>{e.department||"—"}</td>
                                <td style={{padding:"7px 12px",color:"#6B7280",whiteSpace:"nowrap"}}>{e.position||"—"}</td>
                                <td style={{padding:"7px 12px",color:PURPLE,fontWeight:500,whiteSpace:"nowrap"}}>{e.company||"—"}</td>
                                <td style={{padding:"7px 12px",color:"#059669",whiteSpace:"nowrap"}}>₱{e.creditLimit.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload progress */}
                {importSubmitting&&(
                  <div style={{padding:"0 22px 14px",flexShrink:0}}>
                    <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <span style={{width:14,height:14,borderRadius:"50%",border:"2px solid "+PURPLE,borderTopColor:"transparent",animation:"spin 0.8s linear infinite",display:"inline-block"}} />
                        <span style={{fontSize:13,fontWeight:600,color:PURPLE}}>
                          Uploading employees to database... {importProgress.done} of {importProgress.total} saved
                        </span>
                      </div>
                      <div style={{width:"100%",height:8,borderRadius:6,background:"#fff",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:6,background:PURPLE,width:(importProgress.total?Math.round(importProgress.done/importProgress.total*100):0)+"%",transition:"width 0.2s"}} />
                      </div>
                      <div style={{fontSize:11,color:"#6B7280",marginTop:6}}>Please don't close this window until the upload finishes.</div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div style={{padding:"14px 22px",borderTop:"1px solid #E5E7EB",display:"flex",gap:10,flexShrink:0}}>
                  <button disabled={importSubmitting} onClick={()=>setShowImportModal(false)}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:importSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:600,opacity:importSubmitting?0.6:1}}>Cancel</button>
                  <button disabled={importPreview.length===0||importSubmitting} onClick={async ()=>{
                    // Employee No. duplicates already filtered out while building the
                    // preview; this re-check is just a safety net against the system
                    // having changed since then.
                    var toImport = importPreview.filter(function(emp) {
                      return !users.some(function(u){ return (u.idNumber||"").trim()===emp.idNumber; });
                    });
                    var newUsers = toImport.map(function(emp) {
                      var creditLimit = emp.creditLimit;
                      return {
                        id:"u"+Date.now()+Math.random(),
                        username:null,password:"",
                        role:emp.role,
                        name:emp.name,
                        avatar:emp.name.split(" ").filter(Boolean).map(function(w){return w[0];}).join("").slice(0,2).toUpperCase(),
                        plant:"",
                        idNumber:emp.idNumber,
                        department:emp.department||"",
                        position:emp.position||"",
                        company:emp.company||"",
                        phone:"",
                        creditLimit:creditLimit,
                        creditBalance:creditLimit,
                        registered:false,
                        isEmployee:true,
                        regCode:generateRegCode(),
                      };
                    });
                    if(!newUsers.length){ setShowImportModal(false); setImportPreview([]); return; }
                    var CHUNK_SIZE = 25;
                    setImportSubmitting(true);
                    setImportError("");
                    setImportProgress({done:0, total:newUsers.length});
                    var savedUsers = [];
                    var failMsg = "";
                    for(var i=0;i<newUsers.length;i+=CHUNK_SIZE){
                      var chunk = newUsers.slice(i, i+CHUNK_SIZE);
                      var result = await dbInsertUsers(chunk);
                      if(!result.success){
                        failMsg = result.error&&result.error.message ? result.error.message : "Unknown error";
                        break;
                      }
                      savedUsers = savedUsers.concat(chunk);
                      setImportProgress({done:savedUsers.length, total:newUsers.length});
                    }
                    setImportSubmitting(false);
                    if(savedUsers.length) setUsers(prev=>[...prev,...savedUsers]);
                    if(failMsg){
                      setImportError("Saved "+savedUsers.length+" of "+newUsers.length+" employees, then stopped: "+failMsg+". The rest were not imported — you can re-upload the same file and already-saved Employee Nos. will be skipped automatically.");
                      return;
                    }
                    setShowImportModal(false);
                    setImportPreview([]);
                    setImportProgress({done:0,total:0});
                  }} style={{flex:2,background:(importPreview.length>0&&!importSubmitting)?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:(importPreview.length>0&&!importSubmitting)?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                    {importSubmitting ? "Uploading..." : "Import "+(importPreview.length>0?importPreview.length+" Employee"+(importPreview.length>1?"s":""):"")}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  <button onClick={()=>{setShowAddEmployeeModal(false);setNewEmployee({rows:[emptyEmployeeRow()]});}}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>

                {/* Scrollable rows */}
                <div style={{overflowY:"auto",flex:1,padding:"16px 22px"}}>
                  {(newEmployee.rows||[emptyEmployeeRow()]).map((row,idx)=>{
                    const setField = (field,v)=>setNewEmployee(p=>({...p,rows:p.rows.map(r=>r.id===row.id?{...r,[field]:v}:r)}));
                    const fieldStyle = {padding:"9px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",width:"100%",boxSizing:"border-box"};
                    const labelStyle = {fontSize:11,fontWeight:600,color:"#6B7280",display:"block",marginBottom:4};
                    return (
                    <div key={row.id} style={{border:"1px solid #E5E7EB",borderRadius:10,padding:"14px",marginBottom:12,position:"relative",background:"#F9FAFB"}}>
                      {(newEmployee.rows||[]).length>1&&(
                        <button onClick={()=>setNewEmployee(p=>({...p,rows:p.rows.filter(r=>r.id!==row.id)}))}
                          style={{position:"absolute",top:10,right:10,width:26,height:26,borderRadius:7,border:"none",background:"#FEE2E2",color:"#EF4444",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          ×
                        </button>
                      )}
                      <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",marginBottom:10,letterSpacing:"0.4px"}}>EMPLOYEE {idx+1}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div>
                          <label style={labelStyle}>ID Number</label>
                          <input value={row.idNumber} onChange={e=>setField("idNumber",e.target.value.toUpperCase())} placeholder="e.g. KF2301005" style={fieldStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Full Name</label>
                          <input value={row.name} onChange={e=>setField("name",e.target.value)} onBlur={e=>setField("name",toProperCase(e.target.value))} placeholder="e.g. Juan dela Cruz" style={fieldStyle} />
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div>
                          <label style={labelStyle}>Department</label>
                          <input value={row.department} onChange={e=>setField("department",e.target.value)} placeholder="e.g. Accounting" style={fieldStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Position</label>
                          <input value={row.position} onChange={e=>setField("position",e.target.value)} placeholder="e.g. Staff" style={fieldStyle} />
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                        <div>
                          <label style={labelStyle}>Company</label>
                          <input value={row.company} onChange={e=>setField("company",e.target.value)} placeholder="e.g. Kou Fu Color Printing" style={fieldStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Credit Limit</label>
                          <input value={row.creditLimit} onChange={e=>setField("creditLimit",e.target.value)} type="number" min="0" placeholder="1000" style={fieldStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Plant</label>
                          <select value={row.plant} onChange={e=>setField("plant",e.target.value)} style={{...fieldStyle,background:"#fff",cursor:"pointer"}}>
                            {PLANTS.map(p=><option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    );
                  })}

                  {/* Add another row */}
                  <button onClick={()=>setNewEmployee(p=>({...p,rows:[...(p.rows||[]),emptyEmployeeRow()]}))}
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
                  {addEmployeeError&&(
                    <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#991B1B"}}>
                      ⚠️ {addEmployeeError}
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>{setShowAddEmployeeModal(false);setAddEmployeeError("");setNewEmployee({rows:[emptyEmployeeRow()]});}}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button disabled={!(newEmployee.rows||[]).some(r=>r.name.trim())||addEmployeeSubmitting} onClick={async ()=>{
                      var validRows = (newEmployee.rows||[]).filter(r=>r.name.trim());
                      if(!validRows.length) return;
                      var newUsers = validRows.map(r=>{
                        var name=toProperCase(r.name);
                        var initials=name.split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2);
                        var creditLimit = (r.creditLimit!==""&&!isNaN(parseFloat(r.creditLimit))) ? parseFloat(r.creditLimit) : 1000;
                        return {id:"u"+Date.now()+Math.random(),username:null,password:"",role:"user",name,avatar:initials,plant:r.plant,idNumber:r.idNumber.trim(),department:r.department.trim(),position:r.position.trim(),company:r.company.trim(),phone:"",creditLimit,creditBalance:creditLimit,registered:false,isEmployee:true,regCode:generateRegCode()};
                      });
                      setAddEmployeeSubmitting(true);
                      setAddEmployeeError("");
                      const result = await dbInsertUsers(newUsers);
                      setAddEmployeeSubmitting(false);
                      if(!result.success){
                        setAddEmployeeError("Could not save to the database — nothing was added. "+(result.error&&result.error.message?result.error.message:"Please try again.")+" If this keeps happening, tell your admin to check the database setup.");
                        return;
                      }
                      setUsers(prev=>[...prev,...newUsers]);
                      setShowAddEmployeeModal(false);
                      setNewEmployee({rows:[emptyEmployeeRow()]});
                    }} style={{flex:2,background:((newEmployee.rows||[]).some(r=>r.name.trim())&&!addEmployeeSubmitting)?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:((newEmployee.rows||[]).some(r=>r.name.trim())&&!addEmployeeSubmitting)?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                      {addEmployeeSubmitting?"Saving...":"Save All Employees"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Employee Modal */}
          {editEmployeeTarget&&(()=>{
            const fieldStyle = {padding:"9px 10px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:13,color:"#111",outline:"none",width:"100%",boxSizing:"border-box"};
            const labelStyle = {fontSize:11,fontWeight:600,color:"#6B7280",display:"block",marginBottom:4};
            return (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Edit Employee</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>{editEmployeeTarget.name}</div>
                  </div>
                  <button disabled={editEmployeeSubmitting} onClick={()=>setEditEmployeeTarget(null)}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:editEmployeeSubmitting?"not-allowed":"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>
                <div style={{padding:"22px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label style={labelStyle}>Full Name</label>
                      <input value={editEmployeeForm.name} onChange={e=>setEditEmployeeForm(p=>({...p,name:e.target.value}))} style={fieldStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>ID Number</label>
                      <input value={editEmployeeForm.idNumber} onChange={e=>setEditEmployeeForm(p=>({...p,idNumber:e.target.value.toUpperCase()}))} style={fieldStyle} />
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label style={labelStyle}>Department</label>
                      <input value={editEmployeeForm.department} onChange={e=>setEditEmployeeForm(p=>({...p,department:e.target.value}))} style={fieldStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Position</label>
                      <input value={editEmployeeForm.position} onChange={e=>setEditEmployeeForm(p=>({...p,position:e.target.value}))} style={fieldStyle} />
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                    <div>
                      <label style={labelStyle}>Company</label>
                      <input value={editEmployeeForm.company} onChange={e=>setEditEmployeeForm(p=>({...p,company:e.target.value}))} style={fieldStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input value={editEmployeeForm.phone} onChange={e=>setEditEmployeeForm(p=>({...p,phone:e.target.value}))} style={fieldStyle} />
                    </div>
                  </div>
                  <div style={{marginBottom:16}}>
                    <label style={labelStyle}>Username</label>
                    <input value={editEmployeeForm.username} onChange={e=>setEditEmployeeForm(p=>({...p,username:e.target.value.trim()}))} style={fieldStyle} placeholder="Login username" />
                  </div>
                  {editEmployeeError&&(
                    <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#991B1B"}}>⚠️ {editEmployeeError}</div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button disabled={editEmployeeSubmitting} onClick={()=>setEditEmployeeTarget(null)}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:editEmployeeSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                    <button disabled={!editEmployeeForm.name.trim()||editEmployeeSubmitting} onClick={async ()=>{
                      const name = toProperCase(editEmployeeForm.name.trim());
                      if(!name){ setEditEmployeeError("Name is required."); return; }
                      const username = editEmployeeForm.username.trim();
                      if(username){
                        const taken = users.some(u=>u.id!==editEmployeeTarget.id&&(u.username||"").toLowerCase()===username.toLowerCase());
                        if(taken){ setEditEmployeeError("That username is already taken by another account."); return; }
                      }
                      const updates = { name, idNumber:editEmployeeForm.idNumber.trim(), department:editEmployeeForm.department.trim(), position:editEmployeeForm.position.trim(), company:editEmployeeForm.company.trim(), phone:editEmployeeForm.phone.trim(), username: username||null };
                      setEditEmployeeSubmitting(true);
                      setEditEmployeeError("");
                      const result = await dbUpdateUser(editEmployeeTarget.id, updates);
                      setEditEmployeeSubmitting(false);
                      if(result&&result.success===false){
                        setEditEmployeeError("Could not save — "+(result.error&&result.error.message?result.error.message:"please try again."));
                        return;
                      }
                      setUsers(prev=>prev.map(uu=>uu.id===editEmployeeTarget.id?{...uu,...updates}:uu));
                      setEditEmployeeTarget(null);
                    }} style={{flex:2,background:(editEmployeeForm.name.trim()&&!editEmployeeSubmitting)?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:(editEmployeeForm.name.trim()&&!editEmployeeSubmitting)?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
                      {editEmployeeSubmitting?"Saving...":"Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="people" size={20} color={PURPLE} /> Employees
            </h2>
            <div style={{display:"flex",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220}}>
                <Icon name="search" size={15} color="#9CA3AF" />
                <input value={personnelSearch} onChange={e=>setPersonnelSearch(e.target.value)} placeholder="Search name, plant..."
                  style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
                {personnelSearch&&<button onClick={()=>setPersonnelSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
              </div>
              {isAdminLike&&(
                <>
                  <button onClick={()=>setShowAddEmployeeModal(true)} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                    <Icon name="plus" size={14} color="#fff" /> Add Employee
                  </button>
                  <button onClick={()=>{setShowImportModal(true);setImportPreview([]);setImportError("");}} style={{background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                    📥 Import Excel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tab pills */}
          <div style={{display:"flex",gap:4,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:4,marginBottom:16,width:"fit-content"}}>
            <button onClick={()=>{setPersonnelTab("registered");setPersonnelSearch("");}} style={{padding:"7px 16px",borderRadius:7,border:"none",background:personnelTab!=="unregistered"?PURPLE:"transparent",color:personnelTab!=="unregistered"?"#fff":"#6B7280",fontWeight:personnelTab!=="unregistered"?700:400,fontSize:13,cursor:"pointer"}}>
              Registered ({registered.length})
            </button>
            <button onClick={()=>{setPersonnelTab("unregistered");setPersonnelSearch("");}} style={{padding:"7px 16px",borderRadius:7,border:"none",background:personnelTab==="unregistered"?"#EF4444":"transparent",color:personnelTab==="unregistered"?"#fff":"#6B7280",fontWeight:personnelTab==="unregistered"?700:400,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              Unregistered ({unregistered.length})
              {unregistered.length>0&&<span style={{background:"#EF4444",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{unregistered.length}</span>}
            </button>
          </div>

          {/* Unregistered employees notice */}
          {personnelTab==="unregistered"&&unregistered.length>0&&(
            <div style={{background:"#FEF3C7",borderRadius:10,border:"1px solid #FCD34D",padding:"12px 16px",marginBottom:16,fontSize:13,color:"#92400E",display:"flex",alignItems:"center",gap:10}}>
              ⚠️ These employees have been added but haven't registered yet. Ask them to register using their name.
            </div>
          )}

          {/* Bulk selection bar */}
          {personnelTab==="unregistered"&&selectedUnregisteredIds.length>0&&(
            <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:PURPLE,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <span><strong>{selectedUnregisteredIds.length}</strong> employee{selectedUnregisteredIds.length>1?"s":""} selected</span>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setSelectedUnregisteredIds([])} style={{background:"#fff",color:"#6B7280",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                  Clear
                </button>
                <button onClick={()=>{setShowBulkRemoveConfirm(true);setBulkRemoveError("");}} style={{background:"#EF4444",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                  <Icon name="trash" size={13} color="#fff" /> Remove Selected
                </button>
              </div>
            </div>
          )}

          {/* Bulk remove confirmation modal */}
          {showBulkRemoveConfirm&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:"#EF4444",padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Remove Employees</div>
                  <button disabled={bulkRemoveSubmitting} onClick={()=>setShowBulkRemoveConfirm(false)}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:bulkRemoveSubmitting?"not-allowed":"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>
                <div style={{padding:"22px"}}>
                  <div style={{fontSize:14,color:"#374151",marginBottom:16,lineHeight:1.5}}>
                    Remove <strong>{selectedUnregisteredIds.length}</strong> unregistered employee{selectedUnregisteredIds.length>1?"s":""}? This cannot be undone — they'll need to be re-added or re-imported.
                  </div>
                  {bulkRemoveError&&(
                    <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#991B1B"}}>
                      ⚠️ {bulkRemoveError}
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button disabled={bulkRemoveSubmitting} onClick={()=>setShowBulkRemoveConfirm(false)}
                      style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px",cursor:bulkRemoveSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                      Cancel
                    </button>
                    <button disabled={bulkRemoveSubmitting} onClick={async ()=>{
                      setBulkRemoveSubmitting(true);
                      setBulkRemoveError("");
                      const result = await dbDeleteUsers(selectedUnregisteredIds);
                      setBulkRemoveSubmitting(false);
                      if(!result.success){
                        setBulkRemoveError("Could not remove — "+(result.error&&result.error.message?result.error.message:"unknown error")+". Please try again.");
                        return;
                      }
                      setUsers(prev=>prev.filter(u=>!selectedUnregisteredIds.includes(u.id)));
                      setSelectedUnregisteredIds([]);
                      setShowBulkRemoveConfirm(false);
                    }} style={{flex:1,background:"#EF4444",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:bulkRemoveSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                      {bulkRemoveSubmitting?"Removing...":"Remove"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bulk selection bar — Registered tab */}
          {personnelTab!=="unregistered"&&selectedRegisteredIds.length>0&&(
            <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:PURPLE}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                <span><strong>{selectedRegisteredIds.length}</strong> employee{selectedRegisteredIds.length>1?"s":""} selected</span>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>{setSelectedRegisteredIds([]);setShowBulkCreditInput(false);setBulkActionError("");}} style={{background:"#fff",color:"#6B7280",border:"1px solid #E5E7EB",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                    Clear
                  </button>
                  <button disabled={bulkActionSubmitting} onClick={()=>{setShowBulkCreditInput(p=>!p);setBulkCreditLimitVal("");setBulkActionError("");}}
                    style={{background:"#fff",color:PURPLE,border:"1px solid "+PURPLE,borderRadius:7,padding:"6px 12px",cursor:bulkActionSubmitting?"not-allowed":"pointer",fontSize:12,fontWeight:600}}>
                    Set Limit
                  </button>
                  <button disabled={bulkActionSubmitting} onClick={async ()=>{
                    setBulkActionSubmitting(true);
                    setBulkActionError("");
                    const targets = users.filter(u=>selectedRegisteredIds.includes(u.id));
                    const results = await Promise.all(targets.map(u=>dbUpdateUser(u.id,{creditBalance:u.creditLimit})));
                    setBulkActionSubmitting(false);
                    const failed = results.filter(r=>!r.success);
                    if(failed.length){ setBulkActionError(failed.length+" of "+targets.length+" failed to update. Please try again."); return; }
                    setUsers(prev=>prev.map(uu=>selectedRegisteredIds.includes(uu.id)?{...uu,creditBalance:uu.creditLimit}:uu));
                    setSelectedRegisteredIds([]);
                  }} style={{background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:7,padding:"6px 12px",cursor:bulkActionSubmitting?"not-allowed":"pointer",fontSize:12,fontWeight:600}}>
                    {bulkActionSubmitting?"Working...":"Reset Credit to Limit"}
                  </button>
                  <button disabled={bulkActionSubmitting} onClick={()=>{
                    setResetTargets(users.filter(u=>selectedRegisteredIds.includes(u.id)));
                    setResetStage("choose");setResetError("");setResetNewPassword("");setResetConfirmPassword("");
                  }} style={{background:"#FEF3C7",color:"#92400E",border:"none",borderRadius:7,padding:"6px 12px",cursor:bulkActionSubmitting?"not-allowed":"pointer",fontSize:12,fontWeight:600}}>
                    Reset Account
                  </button>
                </div>
              </div>
              {showBulkCreditInput&&(
                <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,paddingTop:10,borderTop:"1px solid rgba(107,33,168,0.15)"}}>
                  <span style={{fontSize:12,fontWeight:600}}>New credit limit for all selected:</span>
                  <input value={bulkCreditLimitVal} onChange={e=>setBulkCreditLimitVal(e.target.value)} type="number" min="0" placeholder="e.g. 1000"
                    style={{width:100,fontSize:13,padding:"5px 8px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none"}} />
                  <button disabled={bulkActionSubmitting||!bulkCreditLimitVal} onClick={async ()=>{
                    const newLimit = parseFloat(bulkCreditLimitVal);
                    if(!(newLimit>=0)) { setBulkActionError("Enter a valid credit limit."); return; }
                    setBulkActionSubmitting(true);
                    setBulkActionError("");
                    const results = await Promise.all(selectedRegisteredIds.map(id=>dbUpdateUser(id,{creditLimit:newLimit})));
                    setBulkActionSubmitting(false);
                    const failed = results.filter(r=>!r.success);
                    if(failed.length){ setBulkActionError(failed.length+" of "+selectedRegisteredIds.length+" failed to update. Please try again."); return; }
                    setUsers(prev=>prev.map(uu=>selectedRegisteredIds.includes(uu.id)?{...uu,creditLimit:newLimit}:uu));
                    setSelectedRegisteredIds([]);
                    setShowBulkCreditInput(false);
                  }} style={{background:PURPLE,color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:(bulkActionSubmitting||!bulkCreditLimitVal)?"not-allowed":"pointer",fontSize:12,fontWeight:600}}>
                    {bulkActionSubmitting?"Saving...":"Apply"}
                  </button>
                </div>
              )}
              {bulkActionError&&(
                <div style={{marginTop:10,background:"#FEE2E2",borderRadius:7,padding:"8px 12px",fontSize:12,color:"#991B1B"}}>⚠️ {bulkActionError}</div>
              )}
            </div>
          )}

          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#F9FAFB"}}>
                  {isAdminLike&&(
                    <th style={{padding:"11px 14px",width:36}}>
                      <input type="checkbox"
                        checked={filteredUsers.length>0&&filteredUsers.every(u=>(personnelTab==="unregistered"?selectedUnregisteredIds:selectedRegisteredIds).includes(u.id))}
                        onChange={e=>{
                          const setSel = personnelTab==="unregistered" ? setSelectedUnregisteredIds : setSelectedRegisteredIds;
                          if(e.target.checked) setSel(prev=>Array.from(new Set([...prev,...filteredUsers.map(u=>u.id)])));
                          else setSel(prev=>prev.filter(id=>!filteredUsers.some(u=>u.id===id)));
                        }}
                        style={{width:15,height:15,cursor:"pointer"}} />
                    </th>
                  )}
                  {(personnelTab==="unregistered"
                    ? (isAdminLike?["ID No.","Name","Department","Company","Plant","Reg. Code","Status","Action"]:["ID No.","Name","Department","Company","Plant","Reg. Code","Status"])
                    : (isAdminLike?["ID No.","Name","Role","Credit Limit","Balance","Actions","Company","Plant","Department","Phone","Username"]:["ID No.","Name","Role","Credit Limit","Balance","Company","Plant","Department","Phone","Username"])
                  ).map(h=>(<th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length===0&&<tr><td colSpan={(personnelTab==="unregistered"?9:12)-(isAdminLike?0:1)} style={{padding:"2rem",textAlign:"center",color:"#9CA3AF"}}>No personnel found.</td></tr>}
                {personnelTab==="unregistered" ? filteredUsers.map(u=>(
                  <tr key={u.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                    {isAdminLike&&(
                      <td style={{padding:"12px 14px"}}>
                        <input type="checkbox" checked={selectedUnregisteredIds.includes(u.id)}
                          onChange={e=>{
                            if(e.target.checked) setSelectedUnregisteredIds(prev=>[...prev,u.id]);
                            else setSelectedUnregisteredIds(prev=>prev.filter(id=>id!==u.id));
                          }}
                          style={{width:15,height:15,cursor:"pointer"}} />
                      </td>
                    )}
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12,fontWeight:600}}>{u.idNumber||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#EF4444",flexShrink:0}}>{u.avatar}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,color:"#111",fontSize:13}}>{u.name}</div>
                          {u.position&&<div style={{fontSize:11,color:"#9CA3AF"}}>{u.position}</div>}
                        </div>
                        {isAdminLike&&(
                          <button onClick={()=>{setEditEmployeeTarget(u);setEditEmployeeForm({name:u.name||"",idNumber:u.idNumber||"",department:u.department||"",position:u.position||"",company:u.company||"",phone:u.phone||"",username:u.username||""});setEditEmployeeError("");}}
                            style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:2,flexShrink:0}}>
                            <Icon name="edit" size={12} color="#9CA3AF" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{padding:"12px 14px",color:"#374151",fontSize:12,whiteSpace:"nowrap"}}>{u.department||"—"}</td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{u.company||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      {isAdminLike&&editPlantId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select defaultValue={u.plant||""} onChange={e=>{ const newPlant=e.target.value; setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,plant:newPlant}:uu)); dbUpdateUser(u.id,{plant:newPlant}); setEditPlantId(null); }}
                            style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none",cursor:"pointer"}}>
                            <option value="">Unassigned</option>
                            {PLANTS.map(p=><option key={p} value={p}>{p}</option>)}
                          </select>
                          <button onClick={()=>setEditPlantId(null)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{background:u.plant?PURPLE_LIGHT:"#F3F4F6",color:u.plant?PURPLE:"#9CA3AF",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>{u.plant||"Unassigned"}</span>
                          {isAdminLike&&(
                            <button onClick={()=>setEditPlantId(u.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:2}}>
                              <Icon name="edit" size={12} color="#9CA3AF" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px 14px",color:"#374151",fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>{u.regCode||"—"}</td>
                    <td style={{padding:"12px 14px"}}><span style={{background:"#FEE2E2",color:"#991B1B",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>Pending Registration</span></td>
                    {isAdminLike&&(
                      <td style={{padding:"12px 14px"}}>
                        <button onClick={()=>{if(!window.confirm(`Remove ${u.name} from the employee list?`))return;setUsers(prev=>prev.filter(uu=>uu.id!==u.id));dbDeleteUser(u.id);setSelectedUnregisteredIds(prev=>prev.filter(id=>id!==u.id));}} style={{background:"#FEE2E2",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:12,fontWeight:500}}>
                          <Icon name="trash" size={13} color="#991B1B" /> Remove
                        </button>
                      </td>
                    )}
                  </tr>
                )) : filteredUsers.map(u=>(
                  <tr key={u.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                    {isAdminLike&&(
                      <td style={{padding:"12px 14px"}}>
                        <input type="checkbox" checked={selectedRegisteredIds.includes(u.id)}
                          onChange={e=>{
                            if(e.target.checked) setSelectedRegisteredIds(prev=>[...prev,u.id]);
                            else setSelectedRegisteredIds(prev=>prev.filter(id=>id!==u.id));
                          }}
                          style={{width:15,height:15,cursor:"pointer"}} />
                      </td>
                    )}
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{u.idNumber||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:PURPLE,flexShrink:0}}>{u.avatar}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,color:"#111",fontSize:13}}>{u.name}</div>
                          {u.position&&<div style={{fontSize:11,color:"#9CA3AF"}}>{u.position}</div>}
                        </div>
                        {isAdminLike&&(
                          <button onClick={()=>{setEditEmployeeTarget(u);setEditEmployeeForm({name:u.name||"",idNumber:u.idNumber||"",department:u.department||"",position:u.position||"",company:u.company||"",phone:u.phone||"",username:u.username||""});setEditEmployeeError("");}}
                            style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:2,flexShrink:0}}>
                            <Icon name="edit" size={12} color="#9CA3AF" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      {isAdminLike&&editRoleId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select defaultValue={u.role} onChange={e=>{ const newRole=e.target.value; setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,role:newRole}:uu)); dbUpdateUser(u.id,{role:newRole}); setEditRoleId(null); }}
                            style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none",cursor:"pointer"}}>
                            <option value="user">Customer</option>
                            <option value="staff">Staff</option>
                            <option value="staff-admin">Staff-Admin</option>
                            <option value="admin">Admin</option>
                            {role==="superadmin"&&<option value="superadmin">Superadmin</option>}
                          </select>
                          <button onClick={()=>setEditRoleId(null)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{background:u.role==="superadmin"?"#FEF3C7":u.role==="admin"?PURPLE_LIGHT:u.role==="staff"?"#E0F2FE":"#D1FAE5",color:u.role==="superadmin"?"#92400E":u.role==="admin"?PURPLE:u.role==="staff"?"#0369A1":"#065F46",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>
                            {u.role==="user"?"Customer":u.role==="staff-admin"?"Staff-Admin":u.role==="staff"?"Staff":u.role==="superadmin"?"Superadmin":"Admin"}
                          </span>
                          {/* only a superadmin can change another superadmin's role — prevents a regular admin from demoting/tampering with the moderation-trusted tier. Staff-admin never gets role-edit at all -- Personnel is view-only for them. */}
                          {isAdminLike&&(role==="superadmin"||u.role!=="superadmin")&&(
                            <button onClick={()=>setEditRoleId(u.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:2}}>
                              <Icon name="edit" size={12} color="#9CA3AF" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      {isAdminLike&&editCreditId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <input value={editCreditVal} onChange={e=>setEditCreditVal(e.target.value)} type="number" min="0"
                            style={{width:75,fontSize:13,padding:"4px 7px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none"}} />
                          <button onClick={()=>{const parsed=parseFloat(editCreditVal);const newLimit=(!isNaN(parsed)&&parsed>=0)?parsed:u.creditLimit;setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,creditLimit:newLimit}:uu));dbUpdateUser(u.id,{creditLimit:newLimit});setEditCreditId(null);}}
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
                    {isAdminLike&&(
                      <td style={{padding:"12px 14px"}}>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          <button onClick={()=>{setEditCreditId(u.id);setEditCreditVal(String(u.creditLimit||0));}}
                            style={{background:PURPLE_LIGHT,color:PURPLE,border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            Set Limit
                          </button>
                          <button onClick={()=>{setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,creditBalance:uu.creditLimit}:uu));dbUpdateUser(u.id,{creditBalance:u.creditLimit});}}
                            style={{background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            Reset
                          </button>
                          <button onClick={()=>{setResetTargets([u]);setResetStage("choose");setResetError("");setResetNewPassword("");setResetConfirmPassword("");}}
                            style={{background:"#FEF3C7",color:"#92400E",border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            Reset Account
                          </button>
                        </div>
                      </td>
                    )}
                    <td style={{padding:"12px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{u.company||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      {isAdminLike&&editPlantId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select defaultValue={u.plant||""} onChange={e=>{ const newPlant=e.target.value; setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,plant:newPlant}:uu)); dbUpdateUser(u.id,{plant:newPlant}); setEditPlantId(null); }}
                            style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none",cursor:"pointer"}}>
                            <option value="">Unassigned</option>
                            {PLANTS.map(p=><option key={p} value={p}>{p}</option>)}
                          </select>
                          <button onClick={()=>setEditPlantId(null)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{background:u.plant?PURPLE_LIGHT:"#F3F4F6",color:u.plant?PURPLE:"#9CA3AF",fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:20}}>{u.plant||"Unassigned"}</span>
                          {isAdminLike&&(
                            <button onClick={()=>setEditPlantId(u.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:2}}>
                              <Icon name="edit" size={12} color="#9CA3AF" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px 14px",color:"#374151",fontSize:12,whiteSpace:"nowrap"}}>{u.department||"—"}</td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{u.phone||"—"}</td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12}}>{u.username||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:12,background:"#F0FDF4",borderRadius:10,border:"1px solid #A7F3D0",padding:"10px 14px",fontSize:12,color:"#065F46"}}>
            💡 Credit balances auto-reset to each user's limit on the <strong>16th</strong> and <strong>1st</strong> of every month.
          </div>

          {/* Reset Account modal — resetTargets is an array so this covers both the single-row
              "Reset Account" button and the bulk action from the selection bar above */}
          {resetTargets.length>0&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Reset Account{resetTargets.length>1?"s":""}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>
                      {resetTargets.length===1 ? resetTargets[0].name : resetTargets.length+" employees selected"}
                    </div>
                  </div>
                  <button disabled={resetSubmitting} onClick={()=>setResetTargets([])}
                    style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:resetSubmitting?"not-allowed":"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>

                {resetStage==="choose"&&(
                  <div style={{padding:"22px"}}>
                    <div style={{fontSize:13,color:"#6B7280",marginBottom:16}}>What do you want to reset?</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      <button onClick={()=>setResetStage("confirm-details")}
                        style={{textAlign:"left",background:"#FEF3C7",border:"1.5px solid #FCD34D",borderRadius:10,padding:"14px 16px",cursor:"pointer"}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#92400E"}}>🔄 Reset Employee Details</div>
                        <div style={{fontSize:12,color:"#92400E",marginTop:4,lineHeight:1.4}}>Clears login, phone, email, and plant assignment. Returns them to Unregistered so they can register again. Order history and credit balance are kept.</div>
                      </button>
                      <button onClick={()=>setResetStage("set-password")}
                        style={{textAlign:"left",background:PURPLE_LIGHT,border:"1.5px solid "+PURPLE,borderRadius:10,padding:"14px 16px",cursor:"pointer"}}>
                        <div style={{fontWeight:700,fontSize:14,color:PURPLE}}>🔑 Reset Password Only</div>
                        <div style={{fontSize:12,color:PURPLE,marginTop:4,lineHeight:1.4}}>Keeps them registered with all their details — just sets a new password{resetTargets.length>1?" (the same one for everyone selected)":""}.</div>
                      </button>
                    </div>
                  </div>
                )}

                {resetStage==="confirm-details"&&(
                  <div style={{padding:"22px"}}>
                    <div style={{fontSize:14,color:"#374151",marginBottom:16,lineHeight:1.5}}>
                      This will clear {resetTargets.length===1 ? <><strong>{resetTargets[0].name}</strong>'s</> : <><strong>{resetTargets.length}</strong> employees'</>} username, password, phone, email, and plant assignment, and move them back to <strong>Unregistered</strong>. Their order history and credit balance will <strong>not</strong> be affected.
                    </div>
                    {resetError&&(
                      <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#991B1B"}}>
                        ⚠️ {resetError}
                      </div>
                    )}
                    <div style={{display:"flex",gap:10}}>
                      <button disabled={resetSubmitting} onClick={()=>setResetStage("choose")}
                        style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px",cursor:resetSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                        Back
                      </button>
                      <button disabled={resetSubmitting} onClick={async ()=>{
                        setResetSubmitting(true);
                        setResetError("");
                        const patch = { username:null, password:"", phone:"", email:"", plant:"", registered:false, regCode:generateRegCode() };
                        const ids = resetTargets.map(t=>t.id);
                        const results = await Promise.all(ids.map(id=>dbUpdateUser(id, patch)));
                        setResetSubmitting(false);
                        const failed = results.filter(r=>!r.success);
                        if(failed.length){
                          setResetError((failed.length)+" of "+ids.length+" failed — "+(failed[0].error&&failed[0].error.message?failed[0].error.message:"unknown error")+". Please try again.");
                          return;
                        }
                        setUsers(prev=>prev.map(uu=>ids.includes(uu.id)?{...uu,...patch}:uu));
                        setSelectedRegisteredIds([]);
                        setResetTargets([]);
                      }} style={{flex:1,background:"#EF4444",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:resetSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                        {resetSubmitting?"Resetting...":"Yes, Reset Details"}
                      </button>
                    </div>
                  </div>
                )}

                {resetStage==="set-password"&&(
                  <div style={{padding:"22px"}}>
                    {resetTargets.length>1&&(
                      <div style={{background:"#FEF3C7",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#92400E"}}>
                        ⚠️ This sets the same password for all {resetTargets.length} selected employees.
                      </div>
                    )}
                    <div style={{marginBottom:12}}>
                      <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>New Password</label>
                      <input type="text" value={resetNewPassword} onChange={e=>setResetNewPassword(e.target.value)} placeholder="Enter new password"
                        style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:13,fontWeight:500,color:"#374151",display:"block",marginBottom:6}}>Confirm New Password</label>
                      <input type="text" value={resetConfirmPassword} onChange={e=>setResetConfirmPassword(e.target.value)} placeholder="Re-enter new password"
                        style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111",background:"#fff",boxSizing:"border-box",outline:"none"}} />
                    </div>
                    {resetError&&(
                      <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#991B1B"}}>
                        ⚠️ {resetError}
                      </div>
                    )}
                    <div style={{display:"flex",gap:10}}>
                      <button disabled={resetSubmitting} onClick={()=>setResetStage("choose")}
                        style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px",cursor:resetSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                        Back
                      </button>
                      <button disabled={resetSubmitting} onClick={async ()=>{
                        if(!resetNewPassword){ setResetError("Please enter a new password."); return; }
                        if(resetNewPassword!==resetConfirmPassword){ setResetError("Passwords do not match."); return; }
                        setResetSubmitting(true);
                        setResetError("");
                        const ids = resetTargets.map(t=>t.id);
                        const results = await Promise.all(ids.map(id=>dbUpdateUser(id, {password:resetNewPassword})));
                        setResetSubmitting(false);
                        const failed = results.filter(r=>!r.success);
                        if(failed.length){
                          setResetError((failed.length)+" of "+ids.length+" failed — "+(failed[0].error&&failed[0].error.message?failed[0].error.message:"unknown error")+". Please try again.");
                          return;
                        }
                        setUsers(prev=>prev.map(uu=>ids.includes(uu.id)?{...uu,password:resetNewPassword}:uu));
                        setSelectedRegisteredIds([]);
                        setResetTargets([]);
                      }} style={{flex:1,background:PURPLE,color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:resetSubmitting?"not-allowed":"pointer",fontSize:14,fontWeight:700}}>
                        {resetSubmitting?"Saving...":"Save New Password"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── OUTSIDE CUSTOMERS (separate table) ── */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"28px 0 16px",flexWrap:"wrap",gap:12}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="people" size={20} color={PURPLE} /> Outside Customers ({outsideCustomers.length})
            </h2>
            <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 14px",background:"#fff",minWidth:220}}>
              <Icon name="search" size={15} color="#9CA3AF" />
              <input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search name, email, phone..."
                style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
              {customerSearch&&<button onClick={()=>setCustomerSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
            </div>
          </div>

          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#F9FAFB"}}>
                  {(isAdminLike?["Name","Email","Phone","Username","Credit Limit","Balance","Actions"]:["Name","Email","Phone","Username","Credit Limit","Balance"]).map(h=>(
                    <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length===0&&<tr><td colSpan={isAdminLike?7:6} style={{padding:"2rem",textAlign:"center",color:"#9CA3AF"}}>No outside customers found.</td></tr>}
                {filteredCustomers.map(u=>(
                  <tr key={u.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:"#E0F2FE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#0369A1",flexShrink:0}}>{u.avatar}</div>
                        <span style={{fontWeight:600,color:"#111",fontSize:13}}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{u.email||"—"}</td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{u.phone||"—"}</td>
                    <td style={{padding:"12px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:12}}>{u.username||"—"}</td>
                    <td style={{padding:"12px 14px"}}>
                      {isAdminLike&&editCreditId===u.id ? (
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <input value={editCreditVal} onChange={e=>setEditCreditVal(e.target.value)} type="number" min="0"
                            style={{width:75,fontSize:13,padding:"4px 7px",borderRadius:7,border:"1.5px solid "+PURPLE,outline:"none"}} />
                          <button onClick={()=>{const parsed=parseFloat(editCreditVal);const newLimit=(!isNaN(parsed)&&parsed>=0)?parsed:u.creditLimit;setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,creditLimit:newLimit}:uu));dbUpdateUser(u.id,{creditLimit:newLimit});setEditCreditId(null);}}
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
                    </td>
                    {isAdminLike&&(
                      <td style={{padding:"12px 14px"}}>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          <button onClick={()=>{setEditCreditId(u.id);setEditCreditVal(String(u.creditLimit||0));}}
                            style={{background:PURPLE_LIGHT,color:PURPLE,border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            Set Limit
                          </button>
                          <button onClick={()=>{setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,creditBalance:uu.creditLimit}:uu));dbUpdateUser(u.id,{creditBalance:u.creditLimit});}}
                            style={{background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            Reset
                          </button>
                          <button onClick={()=>{if(!window.confirm(`Remove ${u.name}'s account? This cannot be undone.`))return;setUsers(prev=>prev.filter(uu=>uu.id!==u.id));dbDeleteUser(u.id);}}
                            style={{background:"#FEE2E2",border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"#991B1B",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            <Icon name="trash" size={12} color="#991B1B" /> Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
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
            {[{id:"orders",label:"📋 Orders"},...((isAdminLike||role==="staff-admin")?[{id:"inventory",label:"📦 Inventory"}]:[])].map(t=>(
              <button key={t.id} onClick={()=>setHistoryTab(t.id)}
                style={{padding:"8px 20px",borderRadius:8,border:"none",background:historyTab===t.id?PURPLE:"transparent",color:historyTab===t.id?"#fff":"#6B7280",fontWeight:historyTab===t.id?700:400,fontSize:13,cursor:"pointer"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── ORDERS TAB ── */}
          {historyTab==="orders"&&(()=>{
            const selDateStr = toDateKey(salesDate);
            const allDayOrders = orders.filter(o=>o.date===selDateStr);
            const hs = historySearch.toLowerCase().trim();
            const dayOrders = hs
              ? allDayOrders.filter(o=>
                  o.id.toLowerCase().includes(hs)||
                  o.user.toLowerCase().includes(hs)||
                  (o.plant||"").toLowerCase().includes(hs)
                )
              : allDayOrders;
            const cashOrders    = dayOrders.filter(o=>o.paymentType==="Cash");
            const creditOrders  = dayOrders.filter(o=>o.paymentType==="Credit");
            const pendingOrders = dayOrders.filter(o=>!o.paymentType);
            const cashTotal    = cashOrders.reduce((s,o)=>s+o.total,0);
            const creditTotal  = creditOrders.reduce((s,o)=>s+o.total,0);
            const pendingTotal = pendingOrders.reduce((s,o)=>s+o.total,0);
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
                    🗓 {showSalesCalendar?"Close":"Change Date"}
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
                            const cellStr = toDateKey(cellDate);
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
                    {label:"Total Collected", value:"₱"+(cashTotal+creditTotal),   color:PURPLE,    sub:(cashOrders.length+creditOrders.length)+" paid orders"},
                    {label:"💵 Cash Sales",   value:"₱"+cashTotal,  color:"#059669", sub:cashOrders.length+" orders"},
                    {label:"💳 Credit Sales", value:"₱"+creditTotal,color:"#0891B2", sub:creditOrders.length+" orders"},
                    {label:"Unpaid (Pending)", value:"₱"+pendingTotal, color:"#F59E0B", sub:pendingOrders.length+" orders"},
                  ].map(s=>(
                    <div key={s.label} style={{background:"#fff",borderRadius:12,border:"1px solid #E5E7EB",padding:"1rem",textAlign:"center"}}>
                      <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:11,color:"#374151",marginTop:2,fontWeight:600}}>{s.label}</div>
                      <div style={{fontSize:10,color:"#9CA3AF"}}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Search bar */}
                <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:10,padding:"8px 14px",marginBottom:12}}>
                  <Icon name="search" size={15} color="#9CA3AF" />
                  <input value={historySearch} onChange={e=>setHistorySearch(e.target.value)}
                    placeholder="Search by order ID, customer name, or plant..."
                    style={{border:"none",outline:"none",fontSize:13,color:"#111",width:"100%",background:"none"}} />
                  {historySearch&&<button onClick={()=>setHistorySearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:0}}>✕</button>}
                </div>

                {/* orders table for selected day */}
                {allDayOrders.length===0 ? (
                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"3rem",textAlign:"center"}}>
                    <div style={{fontSize:32,marginBottom:8}}>📭</div>
                    <div style={{fontWeight:600,color:"#374151"}}>No orders on this date</div>
                    <div style={{fontSize:13,color:"#9CA3AF",marginTop:4}}>Select a date with a 🟢 dot to see its orders</div>
                  </div>
                ) : dayOrders.length===0 ? (
                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"2rem",textAlign:"center"}}>
                    <div style={{fontSize:13,color:"#9CA3AF"}}>No results for "{historySearch}"</div>
                  </div>
                ) : (
                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead>
                        <tr style={{background:"#F9FAFB"}}>
                          {["Order ID","Customer","Plant","Items","Total","Payment","Time"].map(h=>(
                            <th key={h} style={{padding:"11px 14px",textAlign:"left",fontWeight:600,color:"#6B7280",fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:"1px solid #E5E7EB",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dayOrders.map(order=>(
                          <tr key={order.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                            <td style={{padding:"11px 14px",color:"#6B7280",fontFamily:"monospace",fontSize:11}}>{order.id}</td>
                            <td style={{padding:"11px 14px",fontWeight:600,color:"#111"}}>
                              {order.user}{order.guestType&&<span style={{color:"#9CA3AF",fontWeight:400}}> ({order.guestType==="guard"?"Guard":"Visitor"})</span>}
                              {order.source==="otc"&&<div style={{fontSize:10,background:"#FEF3C7",color:"#92400E",fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🧾 OTC</div>}
                              {order.source==="short-order"&&<div style={{fontSize:10,background:PURPLE_LIGHT,color:PURPLE,fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🍽️ Short Order</div>}
                              {order.source==="visitor-menu"&&<div style={{fontSize:10,background:"#DBEAFE",color:"#1E40AF",fontWeight:700,padding:"1px 7px",borderRadius:10,display:"inline-block",marginLeft:6}}>🙋 Visitor Menu</div>}
                            </td>
                            <td style={{padding:"11px 14px"}}>
                              {order.plant&&<span style={{background:PURPLE_LIGHT,color:PURPLE,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,whiteSpace:"nowrap"}}>📍 {order.plant}</span>}
                            </td>
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
                          <td colSpan={4} style={{padding:"11px 14px",fontWeight:700,color:"#374151",fontSize:13}}>
                            {hs ? "Filtered Total (incl. unpaid)" : "Daily Total (incl. unpaid)"}
                          </td>
                          <td style={{padding:"11px 14px",fontWeight:800,color:PURPLE,fontSize:15}}>₱{dayTotal}</td>
                          <td colSpan={2} style={{padding:"11px 14px",fontSize:12,color:"#6B7280"}}>
                            💵 Cash: ₱{cashTotal} &nbsp;|&nbsp; 💳 Credit: ₱{creditTotal} &nbsp;|&nbsp; ⏳ Pending: ₱{pendingTotal}
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

    /* ── OVER THE COUNTER ── */
    if(activeTab==="otc") {
      // otcDate lets staff backdate a sale to an earlier day (e.g. catching up
      // on one that was never encoded) -- the dish list below pulls that
      // day's actual menu (same week_key/day lookup the customer Weekly Menu
      // tab uses), not today's, so it's accurate to what was really served.
      const otcDateObj = otcDate ? new Date(otcDate+"T00:00:00") : TODAY_DATE;
      const todaysWeekKey = getWeekKey(otcDateObj);
      const todaysDay = getDateKey(otcDateObj);
      const todaysMenuItems = ((menu[todaysWeekKey]&&menu[todaysWeekKey][todaysDay])||[]).filter(i=>i.available);
      const availableProducts = otherProducts.filter(p=>p.available&&p.stock>0);
      const todaysMenuMatches = otcMenuSearch.trim() ? todaysMenuItems.filter(i=>i.name.toLowerCase().includes(otcMenuSearch.trim().toLowerCase())) : [];
      const availableProductMatches = otcProductSearch.trim() ? availableProducts.filter(p=>p.name.toLowerCase().includes(otcProductSearch.trim().toLowerCase())) : [];
      const employeeMatches = (otcType==="employee"&&otcSearch.trim())
        ? users.filter(u=>u.isEmployee&&(((u.idNumber||"").toLowerCase().includes(otcSearch.toLowerCase()))||u.name.toLowerCase().includes(otcSearch.toLowerCase()))).slice(0,8)
        : [];
      // Re-derive the employee's live balance from `users` instead of trusting
      // otcCustomer.creditBalance, which is a one-time snapshot from when
      // staff searched/selected them and goes stale after any sale within
      // the same counter visit (see completeOtcSale for the full story).
      const otcCustomerLive = (otcType==="employee"&&otcCustomer) ? (users.find(u=>u.id===otcCustomer.id)||otcCustomer) : otcCustomer;
      const otcInsufficient = otcType==="employee"&&otcCustomerLive&&(otcCustomerLive.creditBalance||0)<otcCartTotal;

      return (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:0,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="register" size={20} color={PURPLE} /> Over the Counter
            </h2>
            {(otcType||otcCustomer)&&<button onClick={resetOtc} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>↺ Start Over</button>}
          </div>

          {otcDone&&<div style={{background:"#D1FAE5",color:"#065F46",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,fontWeight:600}}>✅ Sale completed and logged.</div>}

          {/* Backdating indicator -- stays visible through every step so staff
              never loses track of which day they're actually encoding for */}
          {otcDate&&(
            <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:PURPLE,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",maxWidth:560}}>
              <span>📅 Encoding for <strong>{formatDateFull(otcDateObj)}</strong>, not today</span>
              <button onClick={()=>setOtcDate(null)} style={{background:"#fff",border:"1px solid "+PURPLE+"44",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600,color:PURPLE,whiteSpace:"nowrap"}}>Use Today Instead</button>
            </div>
          )}

          {/* step 1: who's this for */}
          {!otcType&&(
            showOtcDatePicker ? (
              <div style={{background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:14,padding:"20px",maxWidth:340}}>
                <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Which day is this sale actually for?</label>
                <input type="date" max={toDateKey(new Date())} value={otcDate||toDateKey(new Date())}
                  onChange={e=>setOtcDate(e.target.value)}
                  style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none",marginBottom:6}} />
                <div style={{fontSize:11,color:"#9CA3AF",marginBottom:14}}>The dish list will show that day's actual menu, not today's.</div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setOtcDate(null);setShowOtcDatePicker(false);}}
                    style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:13,fontWeight:600}}>Cancel</button>
                  <button onClick={()=>setShowOtcDatePicker(false)}
                    style={{flex:2,background:PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:13,fontWeight:700}}>Confirm Date</button>
                </div>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,maxWidth:560}}>
                {[{id:"employee",label:"Employee",sub:"Cash or Credit"},{id:"visitor",label:"Visitor",sub:"Cash only"},{id:"guard",label:"Guard",sub:"Cash only"}].map(t=>(
                  <button key={t.id} onClick={()=>setOtcType(t.id)}
                    style={{background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:14,padding:"22px 16px",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:15,fontWeight:700,color:"#111"}}>{t.label}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>{t.sub}</div>
                  </button>
                ))}
                <button onClick={()=>setShowOtcDatePicker(true)}
                  style={{background:"#fff",border:"1.5px dashed #D1D5DB",borderRadius:14,padding:"22px 16px",cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:15,fontWeight:700,color:"#111"}}>Past Day</div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Backdate a sale</div>
                </button>
              </div>
            )
          )}

          {/* step 2: identify the customer */}
          {otcType&&!otcCustomer&&(
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"20px",maxWidth:420}}>
              {otcType==="employee" ? (
                <>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Search by ID Number or Name</label>
                  <input value={otcSearch} onChange={e=>setOtcSearch(e.target.value)} placeholder="e.g. KF2400101" autoFocus
                    style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",boxSizing:"border-box",outline:"none",marginBottom:10}} />
                  {employeeMatches.length>0&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {employeeMatches.map(u=>(
                        <button key={u.id} onClick={()=>setOtcCustomer(u)}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"1px solid #E5E7EB",borderRadius:9,background:"#F9FAFB",cursor:"pointer",textAlign:"left"}}>
                          <div style={{width:32,height:32,borderRadius:"50%",background:PURPLE_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:PURPLE,flexShrink:0}}>{u.avatar}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:"#111"}}>{u.name}</div>
                            <div style={{fontSize:11,color:"#9CA3AF"}}>{u.idNumber||"—"} · 💳 ₱{(u.creditBalance||0).toLocaleString()} available</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {otcSearch.trim()&&employeeMatches.length===0&&<div style={{fontSize:12,color:"#9CA3AF"}}>No employee matches "{otcSearch}".</div>}
                </>
              ) : (
                <>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>{otcType==="guard"?"Guard's Name":"Visitor's Name"}</label>
                  <input value={otcSearch} onChange={e=>setOtcSearch(e.target.value)} placeholder="Full name" autoFocus
                    onKeyDown={e=>{if(e.key==="Enter"&&otcSearch.trim()) setOtcCustomer({name:toProperCase(otcSearch.trim())});}}
                    style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",boxSizing:"border-box",outline:"none",marginBottom:10}} />
                  <button onClick={()=>otcSearch.trim()&&setOtcCustomer({name:toProperCase(otcSearch.trim())})} disabled={!otcSearch.trim()}
                    style={{width:"100%",background:otcSearch.trim()?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"10px",cursor:otcSearch.trim()?"pointer":"not-allowed",fontSize:13,fontWeight:700}}>
                    Continue
                  </button>
                </>
              )}
            </div>
          )}

          {/* step 3: items + cart */}
          {otcCustomer&&(
            <div>
              <div style={{background:PURPLE_LIGHT,borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:PURPLE,fontWeight:600}}>
                Serving: {otcCustomer.name} {otcType!=="employee"&&`(${otcType==="guard"?"Guard":"Visitor"})`}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,alignItems:"start"}}>
                <div>
                  <h3 style={{fontSize:14,fontWeight:700,color:"#111",margin:"0 0 8px"}}>{otcDate?`Menu for ${formatDateFull(otcDateObj)}`:"Today's Menu"}</h3>
                  <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 12px",background:"#fff",marginBottom:10}}>
                    <Icon name="search" size={14} color="#9CA3AF" />
                    <input value={otcMenuSearch} onChange={e=>setOtcMenuSearch(e.target.value)} placeholder="Search today's menu..."
                      style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:18}}>
                    {todaysMenuMatches.map(item=>(
                      <button key={item.id} onClick={()=>otcAddItem(item)}
                        style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px",cursor:"pointer",textAlign:"left"}}>
                        <div style={{fontWeight:600,fontSize:12,color:"#111"}}>{item.name}</div>
                        <div style={{fontSize:12,color:PURPLE,fontWeight:700,marginTop:4}}>₱{item.price}</div>
                      </button>
                    ))}
                    {!otcMenuSearch.trim()&&<div style={{fontSize:12,color:"#9CA3AF"}}>Type to search today's menu items.</div>}
                    {otcMenuSearch.trim()&&todaysMenuMatches.length===0&&<div style={{fontSize:12,color:"#9CA3AF"}}>No menu items match "{otcMenuSearch}".</div>}
                  </div>
                  <h3 style={{fontSize:14,fontWeight:700,color:"#111",margin:"0 0 8px"}}>Groceries</h3>
                  <div style={{display:"flex",alignItems:"center",gap:8,border:"1.5px solid #E5E7EB",borderRadius:9,padding:"7px 12px",background:"#fff",marginBottom:10}}>
                    <Icon name="search" size={14} color="#9CA3AF" />
                    <input value={otcProductSearch} onChange={e=>setOtcProductSearch(e.target.value)} placeholder="Search groceries..."
                      style={{border:"none",background:"none",outline:"none",fontSize:13,color:"#111",width:"100%"}} />
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                    {availableProductMatches.map(p=>(
                      <button key={p.id} onClick={()=>otcAddItem(p)}
                        style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px",cursor:"pointer",textAlign:"left"}}>
                        <div style={{fontWeight:600,fontSize:12,color:"#111"}}>{p.name}</div>
                        <div style={{fontSize:12,color:PURPLE,fontWeight:700,marginTop:4}}>₱{p.price}</div>
                      </button>
                    ))}
                    {!otcProductSearch.trim()&&<div style={{fontSize:12,color:"#9CA3AF"}}>Type to search groceries.</div>}
                    {otcProductSearch.trim()&&availableProductMatches.length===0&&<div style={{fontSize:12,color:"#9CA3AF"}}>No groceries match "{otcProductSearch}".</div>}
                  </div>
                </div>

                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"16px",position:"sticky",top:70}}>
                  <h3 style={{fontSize:14,fontWeight:700,color:"#111",margin:"0 0 10px"}}>Sale</h3>
                  {otcCart.length===0 ? (
                    <div style={{fontSize:12,color:"#9CA3AF"}}>No items added yet.</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                      {otcCart.map(item=>(
                        <div key={item.id} style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,color:"#111",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</div>
                            <div style={{fontSize:11,color:"#9CA3AF"}}>₱{item.price} × {item.qty}</div>
                          </div>
                          <button onClick={()=>otcUpdateQty(item.id,-1)} style={{width:22,height:22,borderRadius:6,border:"1px solid #E5E7EB",background:BG,cursor:"pointer",fontSize:13,fontWeight:700}}>−</button>
                          <span style={{fontSize:12,fontWeight:700,minWidth:16,textAlign:"center"}}>{item.qty}</span>
                          <button onClick={()=>otcUpdateQty(item.id,1)} style={{width:22,height:22,borderRadius:6,border:"1px solid #E5E7EB",background:BG,cursor:"pointer",fontSize:13,fontWeight:700}}>+</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{borderTop:"1px solid #F3F4F6",paddingTop:10,display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:16,color:PURPLE,marginBottom:12}}>
                    <span>Total</span><span>₱{otcCartTotal}</span>
                  </div>
                  <button onClick={()=>setOtcPaymentModal(true)} disabled={!otcCart.length}
                    style={{width:"100%",background:otcCart.length?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:otcCart.length?"pointer":"not-allowed",fontSize:13,fontWeight:700}}>
                    Complete Sale
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* payment modal */}
          {otcPaymentModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
              <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
                <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Payment</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}}>{otcCustomer.name} · ₱{otcCartTotal}</div>
                  </div>
                  <button onClick={()=>setOtcPaymentModal(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
                </div>
                <div style={{padding:"22px"}}>
                  {otcType==="employee"&&(
                    <div style={{borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,border:"1px solid "+(otcInsufficient?"#FCD34D":"#A7F3D0"),background:otcInsufficient?"#FEF3C7":"#F0FDF4",color:otcInsufficient?"#92400E":"#065F46"}}>
                      💳 Credit Balance: ₱{(otcCustomerLive.creditBalance||0).toLocaleString()}
                      {otcInsufficient&&<div style={{marginTop:4,fontWeight:600}}>⚠️ Not enough for Credit — Cash only.</div>}
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:otcType==="employee"?"1fr 1fr":"1fr",gap:12}}>
                    <button onClick={()=>completeOtcSale("Cash")}
                      style={{background:"#F0FDF4",color:"#065F46",border:"2px solid #A7F3D0",borderRadius:12,padding:"18px 12px",cursor:"pointer",fontWeight:700,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <span style={{fontSize:28}}>💵</span><span>Cash</span>
                    </button>
                    {otcType==="employee"&&(
                      <button onClick={()=>{if(otcInsufficient)return;completeOtcSale("Credit");}} disabled={otcInsufficient}
                        style={{background:otcInsufficient?"#F3F4F6":PURPLE_LIGHT,color:otcInsufficient?"#9CA3AF":PURPLE,border:"2px solid "+(otcInsufficient?"#E5E7EB":PURPLE+"44"),borderRadius:12,padding:"18px 12px",cursor:otcInsufficient?"not-allowed":"pointer",fontWeight:700,fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",gap:6,opacity:otcInsufficient?0.7:1}}>
                        <span style={{fontSize:28}}>💳</span><span>Credit</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── SUGGESTION BOX ── */
    if(activeTab==="suggestions") {
      return (
        <div>
          <h2 style={{fontSize:20,fontWeight:700,color:"#111",margin:"0 0 16px",display:"flex",alignItems:"center",gap:10}}>
            <Icon name="idea" size={20} color={PURPLE} /> Suggestions
          </h2>

          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:"18px",marginBottom:20}}>
            <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Got an idea or feedback? Tell us — it's read anonymously unless it needs to be looked into.</label>
            <textarea value={newSuggestionText} onChange={e=>{setNewSuggestionText(e.target.value); if(suggestionError) setSuggestionError("");}} placeholder="Type your suggestion..." rows={4}
              style={{width:"100%",fontSize:14,padding:"12px 14px",borderRadius:10,border:suggestionError?"1.5px solid #EF4444":"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none",resize:"vertical",fontFamily:"inherit"}} />
            {suggestionError&&<div style={{marginTop:8,fontSize:12,color:"#EF4444",fontWeight:600}}>⚠️ {suggestionError}</div>}
            <button onClick={submitSuggestion} disabled={!newSuggestionText.trim()}
              style={{marginTop:10,background:newSuggestionText.trim()?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"10px 20px",cursor:newSuggestionText.trim()?"pointer":"not-allowed",fontSize:13,fontWeight:700}}>
              Submit Suggestion
            </button>
          </div>

          <h3 style={{fontSize:15,fontWeight:700,color:"#111",margin:"0 0 4px"}}>All Suggestions</h3>
          <div style={{fontSize:12,color:"#9CA3AF",marginBottom:10}}>
            {role==="superadmin" ? "You can see who submitted each one and who replied — use this if a suggestion needs to be traced back (e.g. foul language)." : "Submitter and admin-reply identities are hidden here for privacy. They can still be looked up internally if a suggestion needs to be traced back (e.g. foul language)."}
          </div>
          {suggestions.length===0 ? (
            <Empty msg="No suggestions yet" sub="Submissions from every role will show up here." />
          ) : (
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden"}}>
              {suggestions.map(s=>{
                const needsResponse = suggestionNeedsAdminResponse(s.id);
                const submitter = users.find(u=>u.id===s.userId);
                return (
                  <div key={s.id} style={{padding:"12px 16px",borderBottom:"1px solid #F3F4F6"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{fontSize:13,color:"#111"}}>{s.content}</div>
                      {s.userId===currentUser.id&&<button onClick={()=>deleteSuggestion(s.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",padding:0,fontSize:11,fontWeight:600,flexShrink:0}}>Delete</button>}
                    </div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:6,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      {role==="superadmin"
                        ? <span style={{fontWeight:600,color:PURPLE}}>{s.userName}</span>
                        : <span style={{fontStyle:"italic"}}>Anonymous{submitter?` (${suggestionRoleLabel(submitter.role)})`:""}</span>}
                      <span>· {new Date(s.createdAt).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})} · {new Date(s.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                      {needsResponse
                        ? <span style={{background:"#FEE2E2",color:"#991B1B",fontWeight:700,padding:"1px 8px",borderRadius:20,fontSize:10}}>🕓 Awaiting admin reply</span>
                        : <span style={{background:"#D1FAE5",color:"#065F46",fontWeight:700,padding:"1px 8px",borderRadius:20,fontSize:10}}>✅ Replied</span>}
                    </div>
                    <SuggestionThread s={s} suggestionReplies={suggestionReplies} replyDrafts={replyDrafts} replyErrors={replyErrors}
                      currentUserId={currentUser.id} suggestionAuthorLabel={suggestionAuthorLabel} deleteSuggestionReply={deleteSuggestionReply}
                      submitSuggestionReply={submitSuggestionReply} setReplyDrafts={setReplyDrafts} setReplyErrors={setReplyErrors} />
                  </div>
                );
              })}
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
        <div style={{background:"#FEF3C7",borderBottom:"1px solid #FCD34D",padding:"10px 1.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,position:"sticky",top:52,zIndex:40,marginLeft:isDesktop?240:0,transition:"margin-left 0.25s"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>⚠️</span>
            <div>
              <span style={{fontWeight:700,fontSize:13,color:"#92400E"}}>Low Credit Balance! </span>
              <span style={{fontSize:13,color:"#92400E"}}>Your remaining credit is <strong>₱{currentUser.creditBalance}</strong> — below ₱100. Resets on the 16th and 1st of each month.</span>
            </div>
          </div>
          <button onClick={()=>setCreditNotif(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#92400E",flexShrink:0}}>✕</button>
        </div>
      )}
      {/* Main content */}
      <div style={{padding:"1.25rem",maxWidth:1100,margin:"0 auto",marginLeft:isDesktop?240:undefined,transition:"margin-left 0.25s"}}>
        {renderTab()}
      </div>
      {/* Remarks + drink-upsell prompt — lives at the top level so it can be
          triggered from both the Short Order and Visitor Menu tabs. Inlined
          (not a separately-invoked component) so its inputs don't lose focus
          on every keystroke -- see SuggestionThread's comment for why. */}
      {addOptionsItem&&(()=>{
        const { item } = addOptionsItem;
        const hasSizes = item.sizes&&item.sizes.length>0;
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
              <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add to Cart</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>
                    {item.name} · {hasSizes ? (addOptionsSize?`₱${addOptionsSize.price}`:`From ₱${Math.min(...item.sizes.map(s=>s.price))}`) : `₱${item.price}`}
                  </div>
                </div>
                <button onClick={closeAddOptions} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
              </div>
              <div style={{padding:"22px"}}>
                {hasSizes&&(
                  <div style={{marginBottom:18}}>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Select a size</label>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {item.sizes.map((s,i)=>{
                        const selected = addOptionsSize&&addOptionsSize.label===s.label;
                        return (
                          <button key={i} onClick={()=>setAddOptionsSize(s)}
                            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,border:selected?`2px solid ${PURPLE}`:"1px solid #E5E7EB",background:selected?PURPLE_LIGHT:"#fff",cursor:"pointer",textAlign:"left"}}>
                            <span style={{fontSize:13,fontWeight:600,color:selected?PURPLE:"#111"}}>{s.label}</span>
                            <span style={{fontSize:13,fontWeight:700,color:selected?PURPLE:"#374151"}}>₱{s.price}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Remarks (optional)</label>
                <textarea value={addOptionsRemarks} onChange={e=>setAddOptionsRemarks(e.target.value)} placeholder="e.g. no ice, extra spicy, less rice"
                  rows={2} style={{width:"100%",fontSize:13,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none",resize:"vertical",fontFamily:"inherit"}} />
                {availableDrinks.length>0&&(
                  <div style={{marginTop:18}}>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Would you like to add a drink? (optional)</label>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {availableDrinks.map(d=>{
                        const qty = addOptionsDrinks[d.id]||0;
                        return (
                          <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,background:"#F9FAFB",borderRadius:10,padding:"8px 12px"}}>
                            <span style={{fontSize:20}}>{d.isPhoto&&d.photo?<img src={d.photo} alt="" style={{width:28,height:28,borderRadius:6,objectFit:"cover"}} />:d.emoji}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{d.name}</div>
                              <div style={{fontSize:11,color:"#6B7280"}}>₱{d.price}</div>
                            </div>
                            <button onClick={()=>setAddOptionsDrinks(p=>({...p,[d.id]:Math.max(0,(p[d.id]||0)-1)}))} disabled={qty===0}
                              style={{width:26,height:26,borderRadius:7,border:"1px solid #E5E7EB",background:"#fff",cursor:qty===0?"not-allowed":"pointer",fontSize:14,color:"#374151",fontWeight:700}}>−</button>
                            <span style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:700,color:"#111"}}>{qty}</span>
                            <button onClick={()=>setAddOptionsDrinks(p=>({...p,[d.id]:(p[d.id]||0)+1}))}
                              style={{width:26,height:26,borderRadius:7,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:14,color:"#374151",fontWeight:700}}>+</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{display:"flex",gap:10,marginTop:20}}>
                  <button onClick={closeAddOptions} style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                  <button onClick={confirmAddOptions} disabled={hasSizes&&!addOptionsSize}
                    style={{flex:2,background:(hasSizes&&!addOptionsSize)?"#C4B5FD":PURPLE,color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:(hasSizes&&!addOptionsSize)?"not-allowed":"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <Icon name="plus" size={14} color="#fff" /> {hasSizes&&!addOptionsSize?"Select a size":"Add to Cart"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Weekly Menu cart drink upsell -- shown once at "Place Order" time,
          not per item. Always skippable via "No thanks, continue". */}
      {showDrinkUpsell&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Add a Drink?</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:2}}>Totally optional — skip if you don't want one</div>
              </div>
              <button onClick={()=>{setShowDrinkUpsell(false);setShowPlantModal(true);setOrderPlant(currentUser.plant||"KF Main");}}
                style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18}}>×</button>
            </div>
            <div style={{padding:"22px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {availableColdDrinks.map(d=>{
                  const qty = drinkUpsellQtys[d.id]||0;
                  return (
                    <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,background:"#F9FAFB",borderRadius:10,padding:"8px 12px"}}>
                      <span style={{fontSize:20}}>{d.isPhoto&&d.photo?<img src={d.photo} alt="" style={{width:28,height:28,borderRadius:6,objectFit:"cover"}} />:d.emoji}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{d.name}</div>
                        <div style={{fontSize:11,color:"#6B7280"}}>₱{d.price}</div>
                      </div>
                      <button onClick={()=>setDrinkUpsellQtys(p=>({...p,[d.id]:Math.max(0,(p[d.id]||0)-1)}))} disabled={qty===0}
                        style={{width:26,height:26,borderRadius:7,border:"1px solid #E5E7EB",background:"#fff",cursor:qty===0?"not-allowed":"pointer",fontSize:14,color:"#374151",fontWeight:700}}>−</button>
                      <span style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:700,color:"#111"}}>{qty}</span>
                      <button onClick={()=>setDrinkUpsellQtys(p=>({...p,[d.id]:(p[d.id]||0)+1}))}
                        style={{width:26,height:26,borderRadius:7,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:14,color:"#374151",fontWeight:700}}>+</button>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={()=>{setShowDrinkUpsell(false);setShowPlantModal(true);setOrderPlant(currentUser.plant||"KF Main");}}
                  style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>
                  No thanks, continue
                </button>
                <button onClick={()=>{
                  availableColdDrinks.forEach(d=>{ const q=drinkUpsellQtys[d.id]||0; if(q>0) addToCart(d,null,{qty:q}); });
                  setShowDrinkUpsell(false);setShowPlantModal(true);setOrderPlant(currentUser.plant||"KF Main");
                }} disabled={!Object.values(drinkUpsellQtys).some(q=>q>0)}
                  style={{flex:2,background:Object.values(drinkUpsellQtys).some(q=>q>0)?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:Object.values(drinkUpsellQtys).some(q=>q>0)?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <Icon name="plus" size={14} color="#fff" /> Add & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Add/Edit Dish modal — lives at the top level (not inside the Manage Dishes tab) so it can also
          be opened from Manage Menu's "Create New Dish" shortcut regardless of the active tab */}
      {showAddDish&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
          <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:540,maxHeight:"90vh",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{background:PURPLE,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>{editDishId?"Edit Dish":"Add Dish"}</div>
              <button onClick={closeAddDish}
                style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{padding:"22px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
              <div>
                <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Dish Photo</label>
                <div onDragOver={e=>{e.preventDefault();setDishDragOver(true);}} onDragLeave={()=>setDishDragOver(false)}
                  onDrop={e=>{e.preventDefault();setDishDragOver(false);handleDishPhotoFile(e.dataTransfer.files[0]);}}
                  onClick={()=>dishPhotoInputRef.current?.click()}
                  style={{border:`2px dashed ${dishDragOver?PURPLE:"#D1D5DB"}`,borderRadius:12,padding:"1.25rem",textAlign:"center",cursor:"pointer",background:dishDragOver?PURPLE_LIGHT:"#FAFAFA",position:"relative",minHeight:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
                  {newDish.photo ? (
                    <><img src={newDish.photo} alt="preview" style={{maxHeight:96,maxWidth:"100%",borderRadius:10,objectFit:"cover"}} />
                      <button onClick={e=>{e.stopPropagation();setNewDish(p=>({...p,photo:null}));}} style={{position:"absolute",top:8,right:8,background:"#EF4444",border:"none",borderRadius:6,color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                    </>
                  ) : (
                    <><div style={{fontSize:13,fontWeight:600,color:"#374151"}}>Drop photo here or click to browse</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"#9CA3AF"}}>or use emoji:</span>
                        <input value={newDish.img} onChange={e=>setNewDish(p=>({...p,img:e.target.value}))} onClick={e=>e.stopPropagation()} style={{width:48,fontSize:18,borderRadius:8,border:"1px solid #E5E7EB",padding:"3px 5px",textAlign:"center",background:"#fff"}} />
                      </div>
                    </>
                  )}
                  <input ref={dishPhotoInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleDishPhotoFile(e.target.files[0])} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Dish Name</label>
                  <input value={newDish.name} onChange={e=>setNewDish(p=>({...p,name:e.target.value}))} placeholder="e.g. Adobo with Rice"
                    style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                </div>
                <div>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Category</label>
                  <select value={newDish.cat} onChange={e=>setNewDish(p=>({...p,cat:e.target.value}))} style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",outline:"none"}}>
                    {["BREAKFAST","LUNCH","SNACK"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Price (₱)</label>
                  <input value={newDish.price} onChange={e=>setNewDish(p=>({...p,price:e.target.value}))} placeholder="0.00" type="number" min="0"
                    style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Serving Measured By</label>
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    {SERVING_UNITS.map(u=>(
                      <button key={u.id} type="button" onClick={()=>setNewDish(p=>({...p,servingUnit:u.id}))}
                        style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1.5px solid "+(newDish.servingUnit===u.id?PURPLE:"#E5E7EB"),background:newDish.servingUnit===u.id?PURPLE_LIGHT:"#fff",color:newDish.servingUnit===u.id?PURPLE:"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                        {u.icon} {u.label}
                      </button>
                    ))}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input value={newDish.grams} onChange={e=>setNewDish(p=>({...p,grams:e.target.value}))}
                      placeholder={newDish.servingUnit==="g"?"e.g. 370":newDish.servingUnit==="cup"?"e.g. 1":"e.g. 2"}
                      type="number" min="0" step={newDish.servingUnit==="g"?"1":"0.5"}
                      style={{width:120,fontSize:14,padding:"10px 12px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",color:"#111",boxSizing:"border-box",outline:"none"}} />
                    <span style={{fontSize:12,color:"#6B7280"}}>
                      {newDish.servingUnit==="g" ? "grams per serving" : `${unitSuffix(newDish.servingUnit,parseFloat(newDish.grams)||0)} per serving`}
                    </span>
                  </div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Used to compute leftovers at Close Canteen — how much of one serving is prepared vs. sold.</div>
                </div>
              </div>

              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button onClick={closeAddDish}
                  style={{flex:1,background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:14,fontWeight:600}}>Cancel</button>
                <button onClick={saveDish} disabled={!newDish.name||!newDish.price}
                  style={{flex:2,background:newDish.name&&newDish.price?PURPLE:"#C4B5FD",color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:newDish.name&&newDish.price?"pointer":"not-allowed",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <Icon name="plus" size={15} color="#fff" /> {editDishId?"Save Changes":"Add Dish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
              {(()=>{
                const cartHasNonAdvanceDish = cart.some(c=>c.cat&&!c.scheduledDate&&!c.fixedMenu);
                const cutoffPassed = cart.some(c=>c.cat&&!c.scheduledDate&&!c.fixedMenu&&isPastMenuCutoff(c.cat));
                return (
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
                {PLANTS.map(p=>{
                  const closedRec = cartHasNonAdvanceDish && isPlantClosed(p);
                  return (
                  <button key={p} onClick={()=>setOrderPlant(p)}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderRadius:12,border:orderPlant===p?"2px solid "+PURPLE:"1px solid #E5E7EB",background:orderPlant===p?PURPLE_LIGHT:"#fff",cursor:"pointer",textAlign:"left"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:15,color:orderPlant===p?PURPLE:"#111"}}>{p}</div>
                      {currentUser.plant===p&&<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>Your assigned plant</div>}
                      {closedRec&&<div style={{fontSize:11,color:"#92400E",marginTop:2,fontWeight:600}}>🔒 Closed today — dishes will be for tomorrow</div>}
                      {!closedRec&&cutoffPassed&&<div style={{fontSize:11,color:"#92400E",marginTop:2,fontWeight:600}}>⏰ Cutoff passed — dishes will be for tomorrow</div>}
                    </div>
                    {orderPlant===p&&<span style={{color:PURPLE,fontSize:18}}>✓</span>}
                  </button>
                  );
                })}
              </div>
                );
              })()}
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
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:PURPLE,color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:600,zIndex:200,display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 24px rgba(107,33,168,0.3)",maxWidth:360,textAlign:"center"}}>
          <Icon name="check" size={16} color="#fff" />
          {orderRolledOver
            ? "Order placed — today's dishes are no longer available (closed or past cutoff), so this is scheduled for tomorrow instead."
            : "Order placed successfully!"}
        </div>
      )}
      <Footer offsetLeft={isDesktop?240:0} />
    </div>
  );
}
