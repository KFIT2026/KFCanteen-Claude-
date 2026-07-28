// Generates realistic-looking (but synthetic) demo images for dishes and receipts,
// so the demo doesn't rely on plain emoji or 1x1 placeholder photos.
// Writes base64 data-URL PNGs into a JSON file for the seed script to consume.
const sharp = require("sharp");
const fs = require("fs");

const OUT = __dirname + "\\demo-images.json";

// ── dish "photo" — a warm stylized plate illustration, no baked-in text (like a real photo) ──
function dishSVG({ bg1, bg2, plateColor, foodColor, accentColor }) {
  return `
<svg width="640" height="480" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="plate" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${plateColor}"/>
    </radialGradient>
  </defs>
  <rect width="640" height="480" fill="url(#bg)"/>
  <ellipse cx="320" cy="260" rx="230" ry="150" fill="#00000022"/>
  <ellipse cx="320" cy="250" rx="220" ry="145" fill="url(#plate)" stroke="#ffffff" stroke-width="6"/>
  <ellipse cx="320" cy="250" rx="150" ry="98" fill="${foodColor}"/>
  <ellipse cx="270" cy="225" rx="34" ry="20" fill="${accentColor}" opacity="0.85"/>
  <ellipse cx="355" cy="255" rx="40" ry="24" fill="${accentColor}" opacity="0.7"/>
  <ellipse cx="300" cy="280" rx="28" ry="16" fill="${accentColor}" opacity="0.6"/>
  <g opacity="0.55" stroke="#ffffff" stroke-width="5" stroke-linecap="round">
    <path d="M290 150 C285 130, 300 120, 295 100" fill="none"/>
    <path d="M320 148 C315 128, 330 118, 325 98" fill="none"/>
    <path d="M350 150 C345 130, 360 120, 355 100" fill="none"/>
  </g>
</svg>`;
}

const DISH_THEMES = {
  "Adobo with Rice":        { bg1:"#7C2D12", bg2:"#B45309", plateColor:"#FDE68A", foodColor:"#78350F", accentColor:"#F3F4F6" },
  "Tinola with Rice":       { bg1:"#065F46", bg2:"#10B981", plateColor:"#D1FAE5", foodColor:"#FDE68A", accentColor:"#FFFBEB" },
  "Lechon Kawali & Rice":   { bg1:"#92400E", bg2:"#D97706", plateColor:"#FEF3C7", foodColor:"#C2410C", accentColor:"#FFEDD5" },
  "Kare-kare & Rice":       { bg1:"#78350F", bg2:"#A16207", plateColor:"#FEF9C3", foodColor:"#A16207", accentColor:"#FEF3C7" },
  "Bangus Sisig & Rice":    { bg1:"#7F1D1D", bg2:"#DC2626", plateColor:"#FEE2E2", foodColor:"#991B1B", accentColor:"#FFF7ED" },
  "Pandesal":               { bg1:"#B45309", bg2:"#F59E0B", plateColor:"#FFF7ED", foodColor:"#D97706", accentColor:"#FEF3C7" },
};

// ── receipt "photo" — a printed paper receipt look ──
function receiptSVG({ store, address, date, items, total, paymentMethod }) {
  const lineHeight = 26;
  const itemsStartY = 210;
  const itemLines = items.map((it, i) => {
    const y = itemsStartY + i * lineHeight;
    const qtyPrice = `${it.qty} x ${it.price.toFixed(2)}`;
    return `
      <text x="30" y="${y}" font-family="Courier New, monospace" font-size="15" fill="#1a1a1a">${it.name}</text>
      <text x="370" y="${y}" font-family="Courier New, monospace" font-size="15" fill="#1a1a1a" text-anchor="end">${(it.qty*it.price).toFixed(2)}</text>
      <text x="30" y="${y+16}" font-family="Courier New, monospace" font-size="11" fill="#666">${qtyPrice}</text>
    `;
  }).join("");
  const totalY = itemsStartY + items.length * lineHeight + 30;
  return `
<svg width="400" height="${totalY+140}" viewBox="0 0 400 ${totalY+140}" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="${totalY+140}" fill="#fafaf7"/>
  <rect width="400" height="${totalY+140}" fill="#fafaf7" opacity="0.98"/>
  <text x="200" y="45" font-family="Courier New, monospace" font-size="20" font-weight="bold" fill="#111" text-anchor="middle">${store}</text>
  <text x="200" y="66" font-family="Courier New, monospace" font-size="11" fill="#555" text-anchor="middle">${address}</text>
  <text x="200" y="86" font-family="Courier New, monospace" font-size="11" fill="#555" text-anchor="middle">${date}</text>
  <line x1="20" y1="105" x2="380" y2="105" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="30" y="130" font-family="Courier New, monospace" font-size="12" font-weight="bold" fill="#333">ITEM</text>
  <text x="370" y="130" font-family="Courier New, monospace" font-size="12" font-weight="bold" fill="#333" text-anchor="end">AMOUNT</text>
  <line x1="20" y1="145" x2="380" y2="145" stroke="#ccc" stroke-width="1"/>
  ${itemLines}
  <line x1="20" y1="${totalY-14}" x2="380" y2="${totalY-14}" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="30" y="${totalY+10}" font-family="Courier New, monospace" font-size="17" font-weight="bold" fill="#111">TOTAL</text>
  <text x="370" y="${totalY+10}" font-family="Courier New, monospace" font-size="17" font-weight="bold" fill="#111" text-anchor="end">₱${total.toFixed(2)}</text>
  <text x="30" y="${totalY+34}" font-family="Courier New, monospace" font-size="12" fill="#555">Payment: ${paymentMethod}</text>
  <line x1="20" y1="${totalY+55}" x2="380" y2="${totalY+55}" stroke="#999" stroke-width="1" stroke-dasharray="2,3"/>
  <text x="200" y="${totalY+80}" font-family="Courier New, monospace" font-size="12" fill="#777" text-anchor="middle">Thank you for your purchase!</text>
</svg>`;
}

const RECEIPTS = [
  { key:"meat", store:"MANILA FRESH MEAT SUPPLIER", address:"Carmona, Cavite", date:new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}),
    items:[{name:"Chicken Thigh (kg)",qty:15,price:180},{name:"Pork Belly (kg)",qty:10,price:220},{name:"Beef Cubes (kg)",qty:5,price:320}],
    total:15*180+10*220+5*320, paymentMethod:"Cash" },
  { key:"grocery", store:"PUREGOLD CARMONA", address:"Mountview Industrial Complex, Carmona", date:new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}),
    items:[{name:"Nova Chips",qty:20,price:8},{name:"Coca-Cola 1.5L",qty:12,price:50},{name:"Rebisco Biscuit",qty:30,price:7}],
    total:20*8+12*50+30*7, paymentMethod:"Cash" },
  { key:"rice", store:"GOLDEN GRAIN RICE SUPPLIER", address:"Carmona, Cavite", date:new Date(Date.now()-86400000).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}),
    items:[{name:"Well-Milled Rice (kg)",qty:50,price:55}],
    total:50*55, paymentMethod:"Bank Transfer" },
  { key:"produce", store:"CARMONA WET MARKET", address:"Public Market, Carmona, Cavite", date:new Date(Date.now()-86400000).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}),
    items:[{name:"Garlic (kg)",qty:3,price:120},{name:"Onion (kg)",qty:4,price:90},{name:"Cooking Oil (L)",qty:6,price:95}],
    total:3*120+4*90+6*95, paymentMethod:"Cash" },
];

async function main() {
  const result = { dishes: {}, receipts: {} };

  for (const [name, theme] of Object.entries(DISH_THEMES)) {
    const svg = dishSVG(theme);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    result.dishes[name] = "data:image/png;base64," + png.toString("base64");
    console.log("dish image:", name, png.length, "bytes");
  }

  for (const r of RECEIPTS) {
    const svg = receiptSVG(r);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    result.receipts[r.key] = { photo: "data:image/png;base64," + png.toString("base64"), meta: r };
    console.log("receipt image:", r.key, png.length, "bytes");
  }

  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log("wrote", OUT);
}
main().catch(e => console.error(e));
