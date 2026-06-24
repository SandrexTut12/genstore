/* jshint esversion:11 */
"use strict";

// ============ CONFIG ============
const CONFIG = {
  facebook  : "https://www.facebook.com/profile.php?id=61590242855257",
  messenger : "https://m.me/1093496020521668",
  instagram : "https://www.instagram.com/genstore856/",
  whatsapp  : "500700362",
  phone     : "",
  adminRoute: atob("I2FkbWlucGFuZWw="),
  adminEmail: atob("dHV0YXJhc2h2aWxpc0BnbWFpbC5jb20=")
};

// ============ FILTER SPEC OPTIONS (mirrors admin panel dropdowns) ============
const SPEC_OPTS = {
  cat: ["ლეპტოპი","ტელეფონი","ტაბლეტი","კონსოლი","აქსესუარი","სხვა"],
  brand: [
    "Apple","Samsung","Dell","HP","Lenovo","Asus","Acer","MSI",
    "Sony","LG","Huawei","Xiaomi","Microsoft","Toshiba","Razer",
    "Google","Nokia","OnePlus","Nintendo","Alienware","Gigabyte","Panasonic","Fujitsu"
  ],
  cpu: [
    "Intel Core i3","Intel Core i5","Intel Core i7","Intel Core i9",
    "Intel Core Ultra 5","Intel Core Ultra 7","Intel Celeron","Intel Pentium",
    "AMD Ryzen 3","AMD Ryzen 5","AMD Ryzen 7","AMD Ryzen 9","AMD Athlon","Snapdragon"
  ],
  gpu: ["Integrated","NVIDIA","AMD"],
  ram: ["4GB","8GB","12GB","16GB","32GB","64GB"],
  storage: [
    "128GB M.2 SSD","256GB M.2 SSD","512GB M.2 SSD","1TB M.2 SSD",
    "128GB SATA SSD","256GB SATA SSD","512GB SATA SSD","1TB SATA SSD",
    "128GB HDD","256GB HDD","512GB HDD","1TB HDD"
  ],
  screen: ["11.6\"","13.3\"","13.5\"","14\"","15.6\"","16\"","17.3\""],
  resolution: [
    "1280×800","1366×768","1600×900",
    "1920×1080","1920×1200",
    "2560×1440","2560×1600","3440×1440",
    "2880×1800","3000×2000","3024×1964",
    "3840×2160"
  ],
  os: [
    "Windows 11 Home","Windows 11 Pro","Windows 10 Home","Windows 10 Pro",
    "Windows 8.1","Windows 7","macOS","Linux","Chrome OS","No OS"
  ]
};

// ============ CONSTANTS ============
const COND = {
  new    : { label: "ახალი",           cls: "new"     },
  likenew: { label: "როგორც ახალი", cls: "likenew" },
  used   : { label: "ნახმარი",       cls: "used"    }
};

const CATS = [
  "ლეპტოპი",
  "ტელეფონი",
  "ტაბლეტი",
  "კონსოლი",
  "აქსესუარი",
  "სხვა"
];

// ============ FIREBASE ============
firebase.initializeApp({
  apiKey:            "AIzaSyDtEb7AUpgwSwJ70IfDZi4iMosd8nO55Ww",
  authDomain:        "genstore-87e1f.firebaseapp.com",
  projectId:         "genstore-87e1f",
  storageBucket:     "genstore-87e1f.firebasestorage.app",
  messagingSenderId: "516453888895",
  appId:             "1:516453888895:web:e85d78189f33b5757ce04a"
});
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;
firebase.auth().onAuthStateChanged(async u => {
  currentUser = u;
  updateUserHeader();
  if (u) {
    await loadFavorites();
    // re-render only if user has favorites so hearts fill in
    if (dataLoaded && favorites.size > 0) renderGrid();
  } else {
    favorites.clear();
  }
  const h = location.hash;
  if (u && (h === "#login" || h === "#register")) { goProfile(); return; }
  if (!u && h === "#profile") { goLogin(); return; }
});

// ============ STORAGE ============
const CACHE_KEY = "gs_cache_v1";

function getCached() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

async function dbList() {
  try {
    const snap = await db.collection("products").get();
    const data = snap.docs.map(d => d.data()).sort((a, b) => a.id < b.id ? -1 : 1);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch (e) { return []; }
}

async function dbSave(p) {
  const delays = [0, 1500, 4000]; // retry with backoff on transient throttling
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
    try {
      await db.collection("products").doc(p.id).set(p);
      return true;
    } catch (e) {
      console.error(`dbSave attempt ${i + 1} failed:`, e.code, e.message);
      if (e.code === "resource-exhausted" && i < delays.length - 1) {
        toast("Firebase დაკავებულია, ვცდილობ თავიდან…");
        continue;
      }
      const msg = e.code === "resource-exhausted"
        ? "Firebase-ის უფასო ლიმიტი ამოიწურა — სცადე ცოტა ხანში"
        : (e.message || e.code || "უცნობი შეცდომა");
      toast("შენახვა ვერ მოხერხდა: " + msg);
      return false;
    }
  }
  return false;
}

// ============ SERVICE DB ============
const SVC_STATUS = {
  new: "ახალი", priced: "ფასი გაიგზავნა",
  confirmed: "დადასტურდა", ordered: "შეკვეთილია", done: "დასრულდა"
};

async function dbSvcList() {
  try {
    const snap = await db.collection("service_orders").get();
    return snap.docs.map(d => d.data()).sort((a, b) => b.created - a.created);
  } catch { return []; }
}

async function dbSvcSave(order) {
  try { await db.collection("service_orders").doc(order.id).set(order); return true; }
  catch (e) { toast("შეცდომა: " + (e.message || e.code)); return false; }
}

async function dbSvcDelete(id) {
  try { await db.collection("service_orders").doc(id).delete(); return true; }
  catch { return false; }
}

// ============ SERVICE PAGE ============
let svcPhotos = [null, null];

function goService() { location.hash = "#service"; }

async function onSvcPhoto(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const compressed = await recompressDataUrl(ev.target.result, 900, 0.75);
    svcPhotos[idx] = compressed;
    const inner = $id("svcPhotoInner" + idx);
    if (inner) inner.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}


async function submitServiceOrder(e) {
  e.preventDefault();
  const laptop       = ($id("svcLaptop")       || {}).value?.trim();
  const detail       = ($id("svcDetail")       || {}).value?.trim();
  const contact      = ($id("svcContact")      || {}).value?.trim();
  const note         = ($id("svcNote")         || {}).value?.trim();
  const install = ($id("svcInstall") || {}).checked;
  if (!laptop)  { toast("მიუთითეთ ლეპტოპის მოდელი"); return; }
  if (!detail)  { toast("მიუთითეთ საჭირო დეტალი"); return; }
  if (!contact) { toast("მიუთითეთ საკონტაქტო ნომერი"); return; }

  const order = {
    id: "svc_" + Date.now(),
    uid: currentUser ? currentUser.uid : null,
    laptop, detail, install: !!install, installPrice: 0,
    contact, note: note || "",
    photos: svcPhotos.filter(Boolean),
    status: "new", created: Date.now()
  };
  const ok = await dbSvcSave(order);
  if (!ok) return;

  $id("svcForm").reset();
  svcPhotos = [null, null];
  [0, 1].forEach(i => {
    const inner = $id("svcPhotoInner" + i);
    const labels = ["ლეპტოპი (მთლიანი)", "სერიული ნომერი"];
    const icons = [
      `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
      `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`
    ];
    if (inner) inner.innerHTML = icons[i] + `<span>${labels[i]}</span>`;
  });
  const s = $id("svcSuccess");
  if (s) { s.classList.remove("hidden"); setTimeout(() => s.classList.add("hidden"), 6000); }
  toast("შეკვეთა გაიგზავნა!");
}

// ============ ADMIN — SERVICE ORDERS ============
async function renderSvcAdminList() {
  const box = $id("svcAdminList");
  if (!box) return;
  box.innerHTML = '<div class="svc-empty-msg">იტვირთება...</div>';
  const orders = await dbSvcList();

  const badge = $id("svcBadge");
  const newCnt = orders.filter(o => o.status === "new").length;
  if (badge) { badge.textContent = newCnt || ""; badge.classList.toggle("hidden", !newCnt); }

  if (!orders.length) {
    box.innerHTML = '<div class="svc-empty-msg">შეკვეთები არ არის</div>';
    return;
  }

  box.innerHTML = orders.map(o => {
    const date = new Date(o.created).toLocaleDateString("ka-GE");
    const opts = Object.entries(SVC_STATUS).map(([v, l]) =>
      `<option value="${v}"${o.status === v ? " selected" : ""}>${l}</option>`).join("");
    const waNum = (o.contact || "").replace(/\D/g, "");
    const waFull = waNum.startsWith("995") ? waNum : "995" + waNum;
    return `<div class="svc-order">
      <div class="svc-order-top">
        <div>
          <div class="svc-order-laptop">${esc(o.laptop)}</div>
          <div class="svc-order-parts">
            <span class="svc-part-tag">${esc(o.detail || (o.parts || []).join(", "))}</span>
            ${o.install ? `<span class="svc-part-tag install">+ მონტაჟი${o.installPrice ? " — " + o.installPrice + "₾" : ""}</span>` : ""}
          </div>
        </div>
        <span class="svc-status ${o.status}">${esc(SVC_STATUS[o.status] || o.status)}</span>
      </div>
      <div class="svc-order-meta">${esc(o.contact)} &nbsp;·&nbsp; ${date}</div>
      ${o.note ? `<div class="svc-order-note">${esc(o.note)}</div>` : ""}
      ${o.photos && o.photos.length ? `<div class="svc-order-photos">${o.photos.map((ph, i) => `<img src="${ph}" class="svc-order-photo" title="${i===0?"ლეპტოპი":"სერიული ნომერი"}" onclick="openSvcPhotoModal(this.src)">`).join("")}</div>` : ""}
      <div class="svc-order-price-row">
        <div class="svc-price-col">
          <span class="svc-price-lbl">დეტალი</span>
          <input class="svc-price-input" type="number" min="0" placeholder="₾"
            value="${o.price || ""}" id="svcPrice_${o.id}">
        </div>
        ${o.install ? `<div class="svc-price-col">
          <span class="svc-price-lbl">მონტაჟი</span>
          <input class="svc-price-input" type="number" min="0" placeholder="₾"
            value="${o.installPrice || ""}" id="svcInstallPrice_${o.id}">
        </div>` : ""}
        <button class="btn btn-ghost btn-sm svc-wa-btn" onclick="sendSvcPrice('${o.id}','${waFull}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WA-ით გაგზავნა
        </button>
      </div>
      ${(o.status === "ordered" || o.orderUrl) ? `
      <div class="svc-order-url-row">
        <input class="svc-url-input" type="url" placeholder="შეკვეთის URL (სად შეუკვეთე)..."
          value="${esc(o.orderUrl || "")}" id="svcOrderUrl_${o.id}">
        <button class="btn btn-ghost btn-sm" onclick="saveOrderUrl('${o.id}')">შენახვა</button>
        ${o.orderUrl ? `<a href="${o.orderUrl}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" title="გახსნა">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>` : ""}
      </div>` : ""}
      <div class="svc-order-actions">
        <select class="fp-select svc-status-sel" onchange="setSvcStatus('${o.id}',this.value)">${opts}</select>
        <button class="btn btn-danger btn-sm" onclick="deleteSvcOrder('${o.id}')">წაშლა</button>
      </div>
    </div>`;
  }).join("");
}

async function setSvcStatus(id, status) {
  const orders = await dbSvcList();
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.status = status;
  const priceEl = $id("svcPrice_" + id);
  if (priceEl && priceEl.value) o.price = Number(priceEl.value);
  const ipEl = $id("svcInstallPrice_" + id);
  if (ipEl && ipEl.value) o.installPrice = Number(ipEl.value);
  await dbSvcSave(o);
  renderSvcAdminList();
}

async function saveOrderUrl(id) {
  const orders = await dbSvcList();
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const urlEl = $id("svcOrderUrl_" + id);
  o.orderUrl = urlEl ? urlEl.value.trim() : "";
  const priceEl = $id("svcPrice_" + id);
  if (priceEl && priceEl.value) o.price = Number(priceEl.value);
  const ipEl = $id("svcInstallPrice_" + id);
  if (ipEl && ipEl.value) o.installPrice = Number(ipEl.value);
  await dbSvcSave(o);
  toast("URL შენახულია ✓");
  renderSvcAdminList();
}

async function sendSvcPrice(id, waNum) {
  const orders = await dbSvcList();
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const priceEl = $id("svcPrice_" + id);
  const price = priceEl ? priceEl.value.trim() : (o.price || "");
  if (!price) { toast("ჯერ ჩაწერე ფასი"); return; }

  const ipEl = $id("svcInstallPrice_" + id);
  const installPrice = ipEl ? (Number(ipEl.value) || 0) : (o.installPrice || 0);
  if (priceEl && price) { o.price = Number(price); o.status = "priced"; }
  if (o.install) o.installPrice = installPrice;
  await dbSvcSave(o);

  const detail = o.detail || (o.parts || []).join(", ");
  const installLine = o.install
    ? `\nმონტაჟი: ${installPrice ? installPrice + "₾" : "ფასი შეგვეთანხმება"}`
    : "";
  const msg = `გამარჯობა! თქვენი შეკვეთა — ${o.laptop} (${detail}).\n\nდეტალის ფასი: ${price}₾${installLine}\n\nდაგვიდასტურეთ და შევუკვეთავთ. მადლობა!`;
  window.open("https://wa.me/" + waNum + "?text=" + encodeURIComponent(msg), "_blank");
  renderSvcAdminList();
}

function openSvcPhotoModal(src) {
  const ov = document.createElement("div");
  ov.className = "svc-photo-overlay";
  ov.innerHTML = `<img src="${src}" class="svc-photo-modal-img">`;
  ov.onclick = () => ov.remove();
  document.body.appendChild(ov);
}

async function deleteSvcOrder(id) {
  if (!confirm("შეკვეთა წაიშლება. გავაგრძელო?")) return;
  await dbSvcDelete(id);
  renderSvcAdminList();
}

// recompress a base64 data-URL image to fit smaller dimensions / quality
function recompressDataUrl(dataUrl, maxDim, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h >= w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// shrink product images only if needed to stay under Firestore's ~1MB doc limit
async function fitProductSize(p, limit = 980000) {
  const size = () => new Blob([JSON.stringify(p)]).size;
  const steps = [[1200, 0.85], [1100, 0.8], [1000, 0.75], [900, 0.68], [800, 0.6], [700, 0.52], [600, 0.45]];
  for (const [dim, q] of steps) {
    if (size() <= limit) break;
    p.images = await Promise.all(
      p.images.map(im => (typeof im === "string" && im.startsWith("data:"))
        ? recompressDataUrl(im, dim, q) : im)
    );
  }
  return size() <= limit;
}

async function dbRemove(id) {
  try {
    await db.collection("products").doc(id).delete();
  } catch (e) {}
}

async function getSettings() {
  try {
    const doc = await db.collection("meta").doc("settings").get();
    return doc.exists ? doc.data() : {};
  } catch (e) { return {}; }
}

async function saveSettings(s) {
  try {
    await db.collection("meta").doc("settings").set(s);
  } catch (e) {}
}

// ============ STATE ============
let PRODUCTS    = [];
let favorites   = new Set();
let activeCat   = "ყველა";
let searchQ     = "";
let sortBy      = "new";
let specFilters = { cat: new Set(), brand: new Set(), cpu: new Set(), gpu: new Set(), ram: new Set(), storage: new Set(), screen: new Set(), resolution: new Set(), os: new Set() };
let priceFloor  = 0, priceCeil = 0;   // overall bounds
let priceMin    = 0, priceMax = 0;    // selected range
let dataLoaded  = false;
let previewMode = false;
let editingId   = null;
let formImgs    = [];
let modalImgs   = [];
let modalIdx    = 0;
let adminPage   = 1;
let storePage   = 1;
const PAGE_SIZE = 12;
let mobileGrid  = Number(localStorage.getItem("gs_mgrid") || 1);

const _specMap = {};
let _ttPinned = false, _ttHideTimer = null, _ttActiveId = null;

const IC_GRID1 = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="5" rx="1"/></svg>`;
const IC_GRID2 = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="2" y="3" width="9" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/></svg>`;

function getPageSize() {
  return (window.innerWidth <= 720 && mobileGrid === 2) ? 24 : PAGE_SIZE;
}

function syncGridToggleBtn() {
  const btn  = $id("gridToggle");
  const grid = $id("grid");
  const is2  = mobileGrid === 2;
  if (btn) { btn.innerHTML = is2 ? IC_GRID2 : IC_GRID1; btn.classList.toggle("active", is2); }
  if (grid) grid.classList.toggle("grid-2col", is2);
}

function toggleMobileGrid() {
  mobileGrid = mobileGrid === 1 ? 2 : 1;
  localStorage.setItem("gs_mgrid", mobileGrid);
  storePage = 1;
  syncGridToggleBtn();
  renderGrid();
}

// ============ HELPERS ============
function $id(id) { return document.getElementById(id); }
function fmtPrice(n) { return Number(n).toLocaleString("en-US") + " ₾"; }

// discount % when an old (higher) price is set
function discountPct(p) {
  if (!p.oldPrice || p.oldPrice <= p.price) return 0;
  return Math.round((p.oldPrice - p.price) / p.oldPrice * 100);
}
// is the sale countdown still running?
function saleActive(p) {
  return p.saleEnds && Number(p.saleEnds) > Date.now();
}
// human countdown like "2დ 5სთ 12წთ" or "00:14:32"
function fmtCountdown(ms) {
  if (ms <= 0) return "0";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}დ ${h}სთ ${m}წთ`;
  const pad = n => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let toastTimer;
function toast(msg) {
  const el = $id("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// ============ STOREFRONT ============
function renderChips() {
  const el = $id("chips");
  if (!el) return;
  const cats = ["ყველა", ...Array.from(new Set(PRODUCTS.map(p => p.cat)))];
  el.innerHTML = cats.map(c => {
    const active = c === activeCat ? " active" : "";
    return `<button class="chip${active}" onclick="setCat(this)">${esc(c)}</button>`;
  }).join("");
}

function setCat(btn) {
  activeCat = btn.textContent;
  storePage = 1;
  renderChips();
  renderGrid();
}

function onSearch(val) {
  searchQ = val.toLowerCase().trim();
  storePage = 1;
  const cl = $id("searchClear");
  if (cl) cl.classList.toggle("hidden", !searchQ);
  renderGrid();
}

function getFiltered() {
  return PRODUCTS
    .filter(p => {
      if (p.hidden && !previewMode) return false;  // draft — hidden unless preview
      if (priceCeil > 0 && (p.price < priceMin || p.price > priceMax)) return false;
      for (const [key, vals] of Object.entries(specFilters)) {
        if (!vals.size) continue;
        const sv = key === "cat"
          ? (p.cat || "").toLowerCase()
          : key === "brand"
          ? (p.brand || "").toLowerCase()
          : ((p.specs || {})[key] || "").toLowerCase();
        if (![...vals].some(v => sv.includes(v.toLowerCase()))) return false;
      }
      if (searchQ) {
        const s   = p.specs || {};
        const hay = (p.title + " " + (p.brand || "") + " " + p.cat + " " + (p.desc || "") + " " +
                     (s.cpu || "") + " " + (s.gpu || "") + " " + (s.ram || "") + " " +
                     (s.storage || "") + " " + (s.os || "")).toLowerCase();
        if (!hay.includes(searchQ)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // sold always sink to the bottom
      const as = !!a.sold, bs = !!b.sold;
      if (as !== bs) return as ? 1 : -1;
      if (as && bs) {
        if (sortBy === "price-asc")  return a.price - b.price;
        if (sortBy === "price-desc") return b.price - a.price;
        if (sortBy === "discount")   return discountPct(b) - discountPct(a);
        return (b.soldAt || 0) - (a.soldAt || 0);
      }
      if (sortBy === "price-asc")  return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      if (sortBy === "discount")   return discountPct(b) - discountPct(a);
      return (b.created || 0) - (a.created || 0);  // "new"
    });
}

// ---- filter bar (sort + price range) ----
function updatePriceBounds() {
  const prices = PRODUCTS.filter(p => !p.hidden || previewMode).map(p => Number(p.price) || 0);
  if (!prices.length) { priceCeil = 0; return; }
  priceFloor = Math.min(...prices);
  priceCeil  = Math.max(...prices);
  // keep current selection if still valid, otherwise reset to full range
  if (priceMin < priceFloor || priceMin > priceCeil || priceMax === 0) priceMin = priceFloor;
  if (priceMax > priceCeil  || priceMax < priceFloor || priceMax === 0) priceMax = priceCeil;
  const lo = $id("priceMinRange"), hi = $id("priceMaxRange");
  if (lo && hi) {
    lo.min = hi.min = priceFloor;
    lo.max = hi.max = priceCeil;
    lo.value = priceMin;
    hi.value = priceMax;
  }
  syncPriceUI();
}

function syncPriceUI() {
  const label = $id("priceLabel");
  if (label) label.textContent = `${fmtPrice(priceMin)} – ${fmtPrice(priceMax)}`;
  const priceCnt = $id("fpCntPrice");
  if (priceCnt && priceCeil > 0) {
    const atDefault = priceMin === priceFloor && priceMax === priceCeil;
    priceCnt.textContent = atDefault ? "" : `: ${fmtPrice(priceMin)}–${fmtPrice(priceMax)}`;
    priceCnt.style.color = atDefault ? "" : "var(--brand)";
  }
  const fill = $id("rangeFill");
  if (fill && priceCeil > priceFloor) {
    const span = priceCeil - priceFloor;
    const l = (priceMin - priceFloor) / span * 100;
    const r = (priceMax - priceFloor) / span * 100;
    fill.style.left  = l + "%";
    fill.style.right = (100 - r) + "%";
  } else if (fill) {
    fill.style.left = "0%"; fill.style.right = "0%";
  }
  const clear = $id("fbClear");
  const specDirty = Object.values(specFilters).some(s => s.size > 0);
  const dirty = priceMin !== priceFloor || priceMax !== priceCeil || specDirty;
  if (clear) clear.classList.toggle("show", dirty);
}

function onSort(val) {
  sortBy = val;
  storePage = 1;
  syncPriceUI();
  renderGrid();
}

const SORT_LBLS = { new: "უახლესი", "price-asc": "ფასი ↑ იაფი", "price-desc": "ფასი ↓ ძვირი", discount: "ფასდაკლება" };

function selectSort(val) {
  sortBy = val;
  storePage = 1;
  document.querySelectorAll("[id^='sortOpt-']").forEach(b => {
    b.classList.toggle("active", b.id === "sortOpt-" + val);
  });
  const lbl = $id("fpSortLbl");
  if (lbl) lbl.textContent = SORT_LBLS[val] || val;
  syncPriceUI();
  renderGrid();
}

function onPriceRange(which) {
  const lo = $id("priceMinRange"), hi = $id("priceMaxRange");
  if (!lo || !hi) return;
  let a = Number(lo.value), b = Number(hi.value);
  if (a > b) { if (which === "min") a = b; else b = a; lo.value = a; hi.value = b; }
  priceMin = a; priceMax = b;
  storePage = 1;
  syncPriceUI();
  renderGrid();
}

function toggleFilters() {
  const panel = $id("filterPanel");
  const btn   = $id("fbToggle");
  const open  = panel.classList.toggle("open");
  btn.classList.toggle("active", open);
  if (open) renderFpDropdowns();
  else closeAllFpDd();
}

function renderFpDropdowns() {
  for (const key of Object.keys(SPEC_OPTS)) {
    renderFpDdList(key);
    updateFpDdBtn(key);
  }
  document.querySelectorAll("[id^='sortOpt-']").forEach(b => {
    b.classList.toggle("active", b.id === "sortOpt-" + sortBy);
  });
  const lbl = $id("fpSortLbl");
  if (lbl) lbl.textContent = SORT_LBLS[sortBy] || sortBy;
}

function renderFpDdList(key) {
  const box = $id("fpList-" + key);
  if (!box) return;
  box.innerHTML = SPEC_OPTS[key].map(v => {
    const on = specFilters[key].has(v);
    return `<button class="fp-chip${on?" active":""}" data-key="${esc(key)}" data-val="${esc(v)}" onclick="fpChipClick(this)">${esc(v)}</button>`;
  }).join("");
}

function fpChipClick(btn) {
  toggleSpecChip(btn.dataset.key, btn.dataset.val);
}

function updateFpDdBtn(key) {
  const cnt = $id("fpCnt-" + key);
  if (!cnt) return;
  const n = specFilters[key].size;
  cnt.textContent = n ? " (" + n + ")" : "";
  cnt.style.color = n ? "var(--brand)" : "";
}

function toggleFpDd(key) {
  const dd = $id("fpDd-" + key);
  if (!dd) return;
  const wasOpen = dd.classList.contains("open");
  closeAllFpDd();
  if (!wasOpen) {
    dd.classList.add("open");
    if (key === "sort") {
      document.querySelectorAll("[id^='sortOpt-']").forEach(b => {
        b.classList.toggle("active", b.id === "sortOpt-" + sortBy);
      });
    } else if (key !== "price") {
      renderFpDdList(key);
    }
    // position dropdown using visualViewport for accurate mobile height
    const list = dd.querySelector(".fp-dd-list");
    if (list) {
      const vp = window.visualViewport || { height: window.innerHeight, width: window.innerWidth };
      const btnRect = dd.getBoundingClientRect();
      const pctBelow = ((vp.height - btnRect.bottom) / vp.height * 100) - 2;
      const pctAbove = (btnRect.top / vp.height * 100) - 2;
      if (pctBelow >= 15) {
        list.style.top = "calc(100% + 6px)"; list.style.bottom = "auto";
        list.style.maxHeight = Math.max(pctBelow, 15) + "vh";
      } else {
        list.style.top = "auto"; list.style.bottom = "calc(100% + 6px)";
        list.style.maxHeight = Math.max(pctAbove, 15) + "vh";
      }
      list.style.left = "0"; list.style.right = "auto";
      requestAnimationFrame(() => {
        const r = list.getBoundingClientRect();
        if (r.right > vp.width - 8) { list.style.left = "auto"; list.style.right = "0"; }
      });
    }
  }
}

function closeAllFpDd() {
  document.querySelectorAll(".fp-dd.open").forEach(el => el.classList.remove("open"));
}

function toggleSpecChip(key, val) {
  const s = specFilters[key];
  s.has(val) ? s.delete(val) : s.add(val);
  storePage = 1;
  renderFpDdList(key);
  updateFpDdBtn(key);
  syncPriceUI();
  renderGrid();
}

function clearFilters() {
  activeCat = "ყველა";
  renderChips();
  priceMin = priceFloor; priceMax = priceCeil;
  const lo = $id("priceMinRange"), hi = $id("priceMaxRange");
  if (lo && hi) { lo.value = priceFloor; hi.value = priceCeil; }
  Object.keys(specFilters).forEach(k => { specFilters[k].clear(); updateFpDdBtn(k); });
  renderFpDropdowns();
  storePage = 1;
  syncPriceUI();
  renderGrid();
}

function renderGrid() {
  const list  = getFiltered();
  const grid  = $id("grid");
  const empty = $id("empty");

  if (PRODUCTS.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="big">ვერაფერი მოიძებნა</div>
      <div>შეცვალე ფილტრი ან საძიებო სიტყვა.</div>
    </div>`;
    return;
  }

  const ps = getPageSize();
  const totalPages = Math.ceil(list.length / ps);
  if (storePage > totalPages) storePage = Math.max(1, totalPages);
  const pageList = list.slice((storePage - 1) * ps, storePage * ps);

  grid.innerHTML = pageList.map((p, idx) => {
    const onld = `onload="this.closest('.imgwrap').classList.remove('img-loading')"`;
    const img = p.images && p.images.length
      ? (p.images.length > 1
        ? `<div class="img-scroll-track">${p.images.map((src, i) => `<img src="${src}" alt="${esc(p.title)}" loading="lazy"${i === 0 ? " " + onld : ""}>`).join("")}</div>`
        : `<img src="${p.images[0]}" alt="${esc(p.title)}" loading="lazy" ${onld}>`)
      : `<div class="noimg">ფოტო არ არის</div>`;
    const saleOn = !p.saleEnds || saleActive(p);
    const displayPrice = (!saleOn && p.oldPrice) ? p.oldPrice : p.price;
    const old = (p.oldPrice && saleOn)
      ? `<span class="old">${fmtPrice(p.oldPrice)}</span>`
      : "";
    const dpct = discountPct(p);
    const discountBadge = (dpct > 0 && !p.sold && saleOn)
      ? `<span class="badge-discount">-${dpct}%</span>` : "";
    const timer = (dpct > 0 && !p.sold && saleActive(p))
      ? `<div class="img-timer countdown" data-ends="${p.saleEnds}"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="ct">${fmtCountdown(Number(p.saleEnds) - Date.now())}</span></div>`
      : "";
    const s = p.specs || {};
    const SPEC_CLR = {
      cpu:"#60AAFF", gpu:"#A78BFA", ram:"#00BAFF",
      storage:"#FFB830", screen:"#2DD4BF", resolution:"#F472B6", os:"#94A3B8"
    };
    function mkIcon(key, val) {
      if (key === "battery") {
        const m   = val && val.match(/(\d+)\s*%/);
        const pct = m ? Math.min(100, parseInt(m[1])) : 100;
        const clr = pct > 60 ? "#00E5A0" : pct > 30 ? "#FFB830" : "#FF5C78";
        const fw  = Math.round(pct * 14 / 100);
        return `<svg class="si" viewBox="0 0 22 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x=".75" y=".75" width="18.5" height="10.5" rx="2" stroke="${clr}" stroke-width="1.5"/>
          <path d="M19.5 4v4" stroke="${clr}" stroke-width="1.5" stroke-linecap="round"/>
          <rect x="2.5" y="2.5" width="${fw}" height="7" rx="1" fill="${clr}"/>
        </svg>`;
      }
      const c = SPEC_CLR[key] || "currentColor";
      const icons = {
        cpu:     `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>`,
        gpu:     `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="1" y="6" width="22" height="12" rx="2"/><rect x="5" y="10" width="4" height="4" rx="1"/><rect x="13" y="10" width="4" height="4" rx="1"/><path d="M6 6V4M10 6V4M14 6V4M18 6V4"/></svg>`,
        ram:     `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="1" y="7" width="22" height="10" rx="1"/><path d="M6 7V5M10 7V5M14 7V5M18 7V5M6 17v2M10 17v2M14 17v2M18 17v2"/></svg>`,
        storage: `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><ellipse cx="12" cy="6" rx="10" ry="3"/><path d="M2 6v6c0 1.66 4.48 3 10 3s10-1.34 10-3V6"/><path d="M2 12v6c0 1.66 4.48 3 10 3s10-1.34 10-3v-6"/></svg>`,
        screen:      `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
        resolution:  `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M7 8h10M7 12h6"/></svg>`,
        os:          `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`
      };
      return icons[key] || "";
    }
    const specDefs = [
      { key:"cpu",        val: s.cpu },
      { key:"gpu",        val: s.gpu },
      { key:"ram",        val: s.ram },
      { key:"storage",    val: s.storage },
      { key:"screen",     val: s.screen },
      { key:"resolution", val: s.resolution },
      { key:"battery",    val: s.battery },
      { key:"os",         val: s.os }
    ].filter(x => x.val);
    const specBtn = specDefs.length ? (() => {
      _specMap[p.id] = { title: p.title, defs: specDefs };
      return `<button class="spec-btn" onmouseenter="showSpecTT(event,'${p.id}')" onmouseleave="schedHideSpecTT()" onclick="clickSpecTT(event,'${p.id}')"><svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>სპეციფიკაცია</button>`;
    })() : "";
    const soldOverlay = p.sold ? `<div class="sold-overlay"><span>გაყიდულია</span></div>` : "";
    const isFav = favorites.has(p.id);
    const favBtn = `<button class="fav-btn${isFav ? " active" : ""}" data-id="${p.id}" onclick="toggleFavorite('${p.id}',event)" title="${isFav ? "ფავორიტებიდან ამოღება" : "ფავორიტებში დამატება"}"><svg viewBox="0 0 24 24" width="15" height="15" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>`;
    return `<div class="card reveal${p.sold ? " sold" : ""}" style="animation-delay:${Math.min(idx, 11) * 45}ms" onclick="openProduct('${p.id}')">
  <div class="imgwrap${p.images && p.images.length ? " img-loading" : ""}">${img}${discountBadge}${soldOverlay}${timer}${favBtn}</div>
  <div class="body">
    <span class="name">${esc(p.title)}</span>
    ${specBtn}
    <div class="price-row">
      <span class="price"><span class="now">${fmtPrice(displayPrice)}</span>${old}</span>
    </div>
  </div>
</div>`;
  }).join("");

  startCountdowns();
  initCardScroll();

  const pager = $id("store-pagination");
  if (totalPages <= 1) {
    pager.innerHTML = `<button class="pg-btn active">1</button>`;
    pager.style.display = "flex";
  } else {
    const maxVisible = 5;
    let start = Math.max(1, storePage - Math.floor(maxVisible / 2));
    let end   = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    let btns = "";
    btns += `<button class="pg-btn pg-arrow"${storePage === 1 ? " disabled" : ` onclick="setStorePage(${storePage - 1})"`}>&#8592;</button>`;
    if (start > 1)
      btns += `<button class="pg-btn" onclick="setStorePage(1)">1</button>${start > 2 ? '<span class="pg-dots">…</span>' : ""}`;
    for (let i = start; i <= end; i++)
      btns += `<button class="pg-btn${i === storePage ? " active" : ""}" onclick="setStorePage(${i})">${i}</button>`;
    if (end < totalPages)
      btns += `${end < totalPages - 1 ? '<span class="pg-dots">…</span>' : ""}<button class="pg-btn" onclick="setStorePage(${totalPages})">${totalPages}</button>`;
    btns += `<button class="pg-btn pg-arrow"${storePage === totalPages ? " disabled" : ` onclick="setStorePage(${storePage + 1})"`}>&#8594;</button>`;

    pager.innerHTML = btns;
    pager.style.display = "flex";
  }
}

// ---- countdown ticker (cards + modal) ----
let countdownTimer = null;
function startCountdowns() {
  if (countdownTimer) return;
  countdownTimer = setInterval(() => {
    const els = document.querySelectorAll(".countdown[data-ends]");
    if (!els.length) { clearInterval(countdownTimer); countdownTimer = null; return; }
    let expired = false;
    els.forEach(el => {
      const ends = Number(el.getAttribute("data-ends"));
      const left = ends - Date.now();
      const ct = el.querySelector(".ct");
      if (left <= 0) { expired = true; el.classList.add("ended"); if (ct) ct.textContent = "დასრულდა"; }
      else if (ct) ct.textContent = fmtCountdown(left);
    });
    if (expired) { clearInterval(countdownTimer); countdownTimer = null; renderGrid(); }
  }, 1000);
}

// ---- card image auto-scroll on hover/touch ----
function initCardScroll() {
  document.querySelectorAll(".card .imgwrap").forEach(wrap => {
    const track = wrap.querySelector(".img-scroll-track");
    if (!track) return;

    // Tear down previous init (resize support)
    if (wrap._scrollAbort) { wrap._scrollAbort.abort(); wrap._scrollAbort = null; }
    if (wrap._scrollRaf)   { cancelAnimationFrame(wrap._scrollRaf); wrap._scrollRaf = null; }
    const origCount = wrap._scrollOrigCount || track.children.length;
    wrap._scrollOrigCount = origCount;
    while (track.children.length > origCount) track.lastChild.remove();
    track.style.transform = "";
    track.style.transition = "";

    const w = wrap.clientWidth;
    if (!w) return;
    Array.from(track.children).forEach(img => { img.style.width = w + "px"; });
    Array.from(track.children).forEach(img => track.appendChild(img.cloneNode(true)));
    const loopW = w * origCount;
    let raf = null;
    let offset = 0;

    function startScroll(speed) {
      track.style.transition = "";
      function step() {
        offset += speed;
        if (offset >= loopW) offset -= loopW;
        track.style.transform = `translateX(-${offset}px)`;
        raf = requestAnimationFrame(step);
        wrap._scrollRaf = raf;
      }
      raf = requestAnimationFrame(step);
      wrap._scrollRaf = raf;
    }
    function stopScroll() {
      if (raf) { cancelAnimationFrame(raf); raf = null; wrap._scrollRaf = null; }
      track.style.transition = "transform 0.5s ease";
      track.style.transform = "translateX(0)";
      offset = 0;
      setTimeout(() => { track.style.transition = ""; }, 500);
    }

    const ac = new AbortController();
    wrap._scrollAbort = ac;
    const sig = ac.signal;
    wrap.addEventListener("mouseenter", () => startScroll(0.75), { signal: sig });
    wrap.addEventListener("mouseleave", stopScroll, { signal: sig });
    wrap.addEventListener("touchstart", () => startScroll(2), { passive: true, signal: sig });
    wrap.addEventListener("touchend",   stopScroll, { passive: true, signal: sig });
    wrap.addEventListener("touchcancel", stopScroll, { passive: true, signal: sig });
  });
}

let _scrollResizeTid;
window.addEventListener('resize', () => {
  clearTimeout(_scrollResizeTid);
  _scrollResizeTid = setTimeout(initCardScroll, 200);
});

// ---- loading skeletons ----
function showSkeletons(n = 8) {
  const grid = $id("grid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: n }, () => `
    <div class="card skel">
      <div class="imgwrap skel-box"></div>
      <div class="body">
        <div class="skel-line w70"></div>
        <div class="skel-line w90"></div>
        <div class="skel-line w40"></div>
      </div>
    </div>`).join("");
}

// ============ PRODUCT MODAL ============
// ---- pretty slugs from title + specs (no random id). MUST stay identical to worker.js ----
function slugParts(p) {
  const s = p.specs || {};
  return [p.title, s.cpu, s.ram, s.storage].filter(Boolean).join(" ");
}
// build id<->slug maps over ALL products; identical names get -2, -3 … by created order
function slugMaps() {
  const sorted = PRODUCTS.slice().sort((a, b) =>
    ((a.created || 0) - (b.created || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const counts = {}, byId = {}, bySlug = {};
  for (const p of sorted) {
    let base = slugify(slugParts(p)) || p.id;
    counts[base] = (counts[base] || 0) + 1;
    const slug = counts[base] === 1 ? base : base + "-" + counts[base];
    byId[p.id] = slug; bySlug[slug] = p.id;
  }
  return { byId, bySlug };
}
function slugForId(id) { return slugMaps().byId[id] || id; }
function idForSlug(seg) {
  const raw = decodeURIComponent(seg || "");
  const hit = slugMaps().bySlug[raw];
  if (hit) return hit;
  // fallback for older links that had the id appended at the end
  return raw.includes("-") ? raw.slice(raw.lastIndexOf("-") + 1) : raw;
}
function onPagesHost() { return location.hostname.endsWith("github.io"); }

// opening updates the URL → on Cloudflare a pretty /p/<slug>, on GitHub Pages a hash
function openProduct(id) {
  if (onPagesHost()) {
    location.hash = "#product/" + encodeURIComponent(id);   // → hashchange → route()
    return;
  }
  history.pushState({ pid: id }, "", "/p/" + slugForId(id));
  renderProductModal(id);
}

function renderProductModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) { closeModalDom(); return; }

  modalImgs = p.images || [];
  modalIdx  = 0;

  const mSaleOn = !p.saleEnds || saleActive(p);
  const mDisplayPrice = (!mSaleOn && p.oldPrice) ? p.oldPrice : p.price;
  const old = (p.oldPrice && mSaleOn) ? `<span class="old">${fmtPrice(p.oldPrice)}</span>` : "";
  const fb  = getFb();

  const mainImg = modalImgs.length
    ? `<img id="modalMain" src="${modalImgs[0]}" alt="${esc(p.title)}">`
    : `<div class="noimg">ფოტო არ არის</div>`;

  const arrows = modalImgs.length > 1
    ? `<button class="gallery-prev" onclick="event.stopPropagation();galleryNav(-1)">&#10094;</button>
       <button class="gallery-next" onclick="event.stopPropagation();galleryNav(1)">&#10095;</button>`
    : "";

  const thumbs = modalImgs.length > 1
    ? `<div class="thumbs">${modalImgs.map((src, i) =>
        `<img src="${src}" class="${i === 0 ? "active" : ""}" onclick="swapImg(${i})">`
      ).join("")}</div>`
    : "";

  const messengerRef = encodeURIComponent(slugForId(p.id));
  const ctaFb = `<a class="btn btn-cta btn-cta-fb" href="${CONFIG.messenger}?ref=${messengerRef}" target="_blank" rel="noopener">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259 6.559-6.963 3.13 3.259 5.889-3.259-6.559 6.963z"/></svg>
    Messenger
  </a>`;
  const igUser = (CONFIG.instagram || "").replace(/https?:\/\/(www\.)?instagram\.com\/?/,"").replace(/\//g,"");
  const igDmUrl = igUser ? `https://ig.me/m/${igUser}` : CONFIG.instagram;
  const ctaIg = CONFIG.instagram
    ? `<a class="btn btn-cta btn-cta-ig" href="${igDmUrl}" target="_blank" rel="noopener">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
    Instagram
  </a>` : "";
  const productUrl = getProductUrl(p.id);
  const waMsg = encodeURIComponent(`გამარჯობა! მაინტერესებს: ${p.title} — ${p.price}₾\n${productUrl}`);
  const ctaWa = CONFIG.whatsapp
    ? `<a class="btn btn-cta btn-cta-wa" href="https://wa.me/995${CONFIG.whatsapp.replace(/\D/g,"")}?text=${waMsg}" target="_blank" rel="noopener">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    WhatsApp
  </a>` : "";
  const ctaPhone = CONFIG.phone
    ? `<a class="btn btn-ghost" href="tel:${CONFIG.phone}">დარეკვა ${esc(CONFIG.phone)}</a>`
    : "";

  const fbBanner = p.fbPost
    ? `<div class="fb-cta">
        <div class="fb-cta-txt">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#1877F2"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
          <span>იხილე ეს პროდუქტი ჩვენს Facebook გვერდზე</span>
        </div>
        <a class="fb-cta-btn" href="${esc(p.fbPost)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
          Facebook-ზე ნახვა
        </a>
      </div>`
    : "";

  const s = p.specs || {};
  const specRows = [
    ["CPU",      s.cpu],
    ["GPU",      s.gpu],
    ["RAM",      s.ram],
    ["SSD/HDD",  s.storage],
    ["ეკრანი",      s.screen],
    ["რეზოლუცია",  s.resolution],
    ["ბატარეა",    s.battery],
    ["OS",          s.os]
  ].filter(([, v]) => v);
  const specTable = specRows.length
    ? `<div class="spec-table">${specRows.map(([k, v]) =>
        `<div class="spec-row"><span class="spec-key">${k}</span><span class="spec-val">${esc(v)}</span></div>`
      ).join("")}</div>`
    : "";

  const mdpct = discountPct(p);
  const mDiscBadge = (mdpct > 0 && !p.sold && mSaleOn) ? `<span class="mdisc">-${mdpct}%</span>` : "";
  const mTimer = (mdpct > 0 && !p.sold && saleActive(p))
    ? `<div class="msale-timer countdown" data-ends="${p.saleEnds}">
         <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
         ფასდაკლება მთავრდება: <span class="ct">${fmtCountdown(Number(p.saleEnds) - Date.now())}</span>
       </div>`
    : "";

  $id("modalMount").innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-top">
      <div class="gallery-side">
        <div class="gallery">
          <div class="main" onclick="openLightbox()">
            ${mainImg}
            ${arrows}
          </div>
          ${thumbs}
        </div>
        ${fbBanner}
      </div>
      <div class="modal-info">
        <div class="modal-top-actions">
          <button class="modal-share" onclick="shareProduct('${p.id}')" title="გაზიარება">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
          </button>
          <button class="modal-close" onclick="closeModal()">&#215;</button>
        </div>
        <div class="mcat">${[p.brand, p.cat].filter(Boolean).map(esc).join(" · ")}</div>
        <h2>${esc(p.title)}</h2>
        <div class="mprice">
          <span class="now">${fmtPrice(mDisplayPrice)}</span>${old}${mDiscBadge}
        </div>
        ${mTimer}
        ${specTable}
        ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ""}
        ${p.sold ? `<div class="sold-badge-modal">გაყიდულია</div>` : `<div class="cta">${ctaFb}${ctaIg}${ctaWa}${ctaPhone}</div>`}
      </div>
    </div>
  </div>
</div>`;

  document.body.style.overflow = "hidden";
  startCountdowns();
}

// pretty url slug from a title (real id stays appended at the end)
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getProductUrl(id) {
  const onPages = location.hostname.endsWith("github.io");
  return onPages
    ? location.origin + location.pathname + "#product/" + encodeURIComponent(id)
    : location.origin + "/p/" + slugForId(id);
}

// share current product — native share sheet or copy link
async function shareProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  const url = getProductUrl(id);
  const data = {
    title: p ? p.title : "GENSTORE",
    text:  p ? `${p.title} — ${fmtPrice(p.price)}` : "GENSTORE",
    url
  };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast("ლინკი დაკოპირდა 📋");
  } catch (e) {
    try { await navigator.clipboard.writeText(url); toast("ლინკი დაკოპირდა 📋"); }
    catch { toast("ლინკი: " + url); }
  }
}

function galleryNav(dir) {
  if (!modalImgs.length) return;
  modalIdx = (modalIdx + dir + modalImgs.length) % modalImgs.length;
  updateGallery();
}

function swapImg(idx) {
  modalIdx = idx;
  updateGallery();
}

function updateGallery() {
  const main = $id("modalMain");
  if (main) main.src = modalImgs[modalIdx];
  document.querySelectorAll(".thumbs img").forEach((img, i) =>
    img.classList.toggle("active", i === modalIdx)
  );
}

function closeModalDom() {
  $id("modalMount").innerHTML = "";
  document.body.style.overflow = "";
}

function closeModal() {
  if (location.hash.startsWith("#product/")) {
    location.hash = "";              // → hashchange → route() clears it
  } else if (location.pathname.startsWith("/p/")) {
    history.pushState({}, "", "/");  // back to clean root
    closeModalDom();
  } else {
    closeModalDom();
  }
}

// ── Spec tooltip ──────────────────────────────────────────
const _SPEC_LBLS = {cpu:"CPU",gpu:"GPU",ram:"RAM",storage:"SSD/HDD",screen:"ეკრანი",resolution:"რეზოლუცია",battery:"ბატარეა",os:"OS"};
const _SPEC_CLR2 = {cpu:"#60AAFF",gpu:"#A78BFA",ram:"#00BAFF",storage:"#FFB830",screen:"#2DD4BF",resolution:"#F472B6",battery:"#00E5A0",os:"#94A3B8"};

function buildSpecTT(id) {
  const d = _specMap[id];
  if (!d) return "";
  const rows = d.defs.map(x => {
    const bm = x.key==="battery" && x.val.match(/(\d+)\s*%/);
    const clr = x.key==="battery" ? (bm&&parseInt(bm[1])>60?"#00E5A0":bm&&parseInt(bm[1])>30?"#FFB830":"#FF5C78") : (_SPEC_CLR2[x.key]||"var(--brand)");
    const battIco = bm ? `<svg class="si" style="margin-left:4px;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="${clr}" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="18" height="11" rx="2"/><path d="M22 11v3"/><rect x="4" y="9" width="${Math.round(parseInt(bm[1])*.08)}" height="7" fill="${clr}" rx="1" stroke="none"/></svg>` : "";
    return `<div class="stt-row"><span class="stt-dot" style="background:${clr}"></span><span class="stt-lbl">${_SPEC_LBLS[x.key]||x.key}</span><span class="stt-val">${esc(x.val)}${battIco}</span></div>`;
  }).join("");
  return `<div class="stt-head">${esc(d.title)}</div><div class="stt-body">${rows}</div>`;
}

function posSpecTT(btn, tt) {
  const r = btn.getBoundingClientRect();
  const TW = 272;
  let left = r.left + r.width / 2 - TW / 2;
  if (left < 6) left = 6;
  if (left + TW > window.innerWidth - 6) left = window.innerWidth - TW - 6;
  const th = tt.offsetHeight || 180;
  let top = r.top - th - 10;
  if (top < 6) top = r.bottom + 8;
  tt.style.cssText = `top:${top}px;left:${left}px;width:${TW}px`;
}

function showSpecTT(e, id) {
  clearTimeout(_ttHideTimer);
  _ttActiveId = id;
  const tt = $id("specTooltip");
  tt.innerHTML = buildSpecTT(id);
  tt.classList.remove("hidden");
  posSpecTT(e.currentTarget, tt);
  e.stopPropagation();
}

function schedHideSpecTT() {
  _ttHideTimer = setTimeout(() => { if (!_ttPinned) hideSpecTT(); }, 140);
}

function cancelHideSpecTT() {
  clearTimeout(_ttHideTimer);
}

function clickSpecTT(e, id) {
  const tt = $id("specTooltip");
  const open = !tt.classList.contains("hidden") && _ttActiveId === id;
  if (open && _ttPinned) { hideSpecTT(); }
  else { _ttPinned = true; showSpecTT(e, id); }
  e.stopPropagation();
}

function hideSpecTT() {
  const tt = $id("specTooltip");
  if (tt) tt.classList.add("hidden");
  _ttPinned = false; _ttActiveId = null;
}

document.addEventListener("click", e => {
  if (!e.target.closest("#specTooltip") && !e.target.closest(".spec-btn")) hideSpecTT();
});
window.addEventListener("scroll", () => hideSpecTT(), { passive: true });
// ──────────────────────────────────────────────────────────

document.addEventListener("keydown", e => {
  if (e.key === "Escape")     { closeLightbox(); closeModal(); closeSearchOverlay(); hideSpecTT(); }
  if (e.key === "ArrowRight") { lbNav(1);  galleryNav(1); }
  if (e.key === "ArrowLeft")  { lbNav(-1); galleryNav(-1); }
});

// ============ LIGHTBOX ============
function openLightbox() {
  if (!modalImgs.length) return;
  const mount = document.getElementById("lightbox");
  if (!mount) return;
  mount.innerHTML = `
    <img src="${modalImgs[modalIdx]}" alt="" onclick="event.stopPropagation()">
    <button class="lb-close" onclick="closeLightbox()">&#215;</button>
    ${modalImgs.length > 1
      ? `<button class="lb-nav lb-prev" onclick="event.stopPropagation();lbNav(-1)">&#10094;</button>
         <button class="lb-nav lb-next" onclick="event.stopPropagation();lbNav(1)">&#10095;</button>`
      : ""}
  `;
  mount.style.display = "flex";
  mount.onclick = closeLightbox;
}
function lbNav(dir) {
  if (!modalImgs.length || !document.querySelector("#lightbox img")) return;
  modalIdx = (modalIdx + dir + modalImgs.length) % modalImgs.length;
  document.querySelector("#lightbox img").src = modalImgs[modalIdx];
  updateGallery();
}
function closeLightbox() {
  const mount = document.getElementById("lightbox");
  if (mount) { mount.innerHTML = ""; mount.style.display = "none"; }
}

// ============ ROUTING ============
function goStore()    { previewMode = false; const b=$id("previewBanner"); if(b) b.classList.add("hidden"); clearSearch(); clearFilters(); location.hash = ""; }
function goAdmin()    { location.hash = CONFIG.adminRoute; }
function goLogin()    { location.hash = "#login"; }
function goRegister() { location.hash = "#register"; }
function goProfile()  { location.hash = "#profile"; }
function goPreview() {
  previewMode = true;
  location.hash = "";
  updatePriceBounds();
  priceMin = priceFloor;
  priceMax = priceCeil;
  syncPriceUI();
  renderGrid();
  const b = $id("previewBanner");
  if (b) b.classList.remove("hidden");
}

function openSearchOverlay() {
  const ov = $id("searchOverlay");
  if (!ov) return;
  ov.classList.remove("hidden");
  setTimeout(() => {
    const inp = $id("searchOverlayInput");
    if (inp) { inp.value = searchQ; inp.focus(); inp.select(); }
  }, 80);
}
function closeSearchOverlay() {
  const ov = $id("searchOverlay");
  if (ov) ov.classList.add("hidden");
}
function clearSearch() {
  searchQ = "";
  [$id("searchInput"), $id("searchOverlayInput")].forEach(el => { if (el) el.value = ""; });
  onSearch("");
}
function onSearchOverlayBg(e) { if (e.target === e.currentTarget) closeSearchOverlay(); }

function route() {
  const h = location.hash;
  const isAdmin    = h === CONFIG.adminRoute;
  const isService  = h === "#service";
  const isLogin    = h === "#login";
  const isRegister = h === "#register";
  const isProfile  = h === "#profile";

  $id("view-store").classList.toggle("hidden", isAdmin || isService || isLogin || isRegister || isProfile);
  $id("view-admin").classList.toggle("hidden", !isAdmin);
  $id("view-service").classList.toggle("hidden", !isService);
  const vl = $id("view-login");    if (vl) vl.classList.toggle("hidden", !isLogin);
  const vr = $id("view-register"); if (vr) vr.classList.toggle("hidden", !isRegister);
  const vp = $id("view-profile");  if (vp) vp.classList.toggle("hidden", !isProfile);

  if (isService) { closeModalDom(); return; }

  if (isAdmin) {
    closeModalDom();
    const user = firebase.auth().currentUser;
    if (user) {
      $id("admin-login").classList.add("hidden");
      $id("admin-dash").classList.remove("hidden");
      renderAdminList();
      renderSvcAdminList();
    } else {
      $id("admin-login").classList.remove("hidden");
      $id("admin-dash").classList.add("hidden");
      setTimeout(() => $id("userInput").focus(), 50);
    }
    return;
  }

  if (isLogin) {
    closeModalDom();
    if (currentUser) { goProfile(); return; }
    return;
  }

  if (isRegister) {
    closeModalDom();
    if (currentUser) { goProfile(); return; }
    return;
  }

  if (isProfile) {
    closeModalDom();
    renderProfile();
    return;
  }

  // product deep-link — hash (GitHub Pages) or pretty path (Cloudflare)
  const pm = location.pathname.match(/^\/p\/([^\/]+)\/?$/);
  if (h.startsWith("#product/")) {
    renderProductModal(decodeURIComponent(h.slice("#product/".length)));
  } else if (pm) {
    renderProductModal(idForSlug(pm[1]));
  } else {
    closeModalDom();
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("popstate", route);

// footer: visible only at very top or very bottom, hidden in between
(function() {
  const footer = document.querySelector('footer');
  window.addEventListener('scroll', function() {
    const y = window.scrollY;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (y < 60 || y >= maxY - 10) {
      footer.classList.remove('footer-hidden');
    } else {
      footer.classList.add('footer-hidden');
    }
  }, { passive: true });
})();

// ============ AUTH (Firebase) ============
async function doLogin() {
  const email = $id("userInput").value.trim();
  const pw    = $id("pwInput").value;
  const err   = $id("pwErr");
  err.textContent = "";
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pw);
    $id("pwInput").value   = "";
    $id("userInput").value = "";
    route();
  } catch(e) {
    err.textContent = "არასწორი ელ-ფოსტა ან პაროლი";
  }
}

async function logout() {
  await firebase.auth().signOut();
  goStore();
}

// ---- user login page ----
async function doUserLogin() {
  const email = $id("loginEmail").value.trim();
  const pw    = $id("loginPw").value;
  const err   = $id("loginErr");
  if (err) err.textContent = "";
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pw);
    afterUserLogin();
  } catch(e) {
    if (err) err.textContent = "არასწორი ელ-ფოსტა ან პაროლი";
  }
}

async function doRegister() {
  const name  = $id("regName").value.trim();
  const email = $id("regEmail").value.trim();
  const pw    = $id("regPw").value;
  const pw2   = $id("regPw2").value;
  const err   = $id("regErr");
  if (err) err.textContent = "";
  if (!name) { if (err) err.textContent = "სახელი სავალდებულოა"; return; }
  if (pw.length < 6) { if (err) err.textContent = "პაროლი მინ. 6 სიმბოლო"; return; }
  if (pw !== pw2)    { if (err) err.textContent = "პაროლები არ ემთხვევა"; return; }
  try {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, pw);
    await cred.user.updateProfile({ displayName: name });
    await db.collection("users").doc(cred.user.uid).set({ name, email, created: Date.now() });
    afterUserLogin();
  } catch(e) {
    if (err) err.textContent = e.code === "auth/email-already-in-use"
      ? "ეს ელ-ფოსტა უკვე რეგისტრირებულია"
      : (e.message || "შეცდომა");
  }
}

async function signInGoogle() {
  try {
    await firebase.auth().signInWithPopup(googleProvider);
    afterUserLogin();
  } catch(e) {
    if (e.code !== "auth/popup-closed-by-user") {
      const err = $id("loginErr") || $id("regErr");
      if (err) err.textContent = "Google შესვლა ვერ მოხერხდა";
    }
  }
}

function afterUserLogin() {
  const user = firebase.auth().currentUser;
  if (user && user.email === CONFIG.adminEmail) goAdmin();
  else goProfile();
}

async function logoutUser() {
  await firebase.auth().signOut();
  favorites.clear();
  goStore();
}

function onUserBtnClick() {
  if (currentUser) goProfile(); else goLogin();
}

function updateUserHeader() {
  const btn = $id("btnUser");
  if (!btn) return;
  const user = currentUser;
  if (user) {
    const initials = (user.displayName || user.email || "U")[0].toUpperCase();
    btn.innerHTML = user.photoURL
      ? `<img src="${esc(user.photoURL)}" class="user-avatar-img">`
      : `<span class="user-initials">${initials}</span>`;
    btn.classList.add("logged-in");
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    btn.classList.remove("logged-in");
  }
}

// ---- favorites ----
async function loadFavorites() {
  if (!currentUser) { favorites.clear(); return; }
  try {
    const doc = await db.collection("users").doc(currentUser.uid).get();
    favorites = new Set(doc.exists ? (doc.data().favorites || []) : []);
  } catch { favorites.clear(); }
}

async function toggleFavorite(id, e) {
  e.stopPropagation();
  if (!currentUser) { goLogin(); return; }
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  await db.collection("users").doc(currentUser.uid).set({ favorites: [...favorites] }, { merge: true });
  document.querySelectorAll(`.fav-btn[data-id="${id}"]`).forEach(btn => {
    btn.classList.toggle("active", favorites.has(id));
    btn.querySelector("svg").setAttribute("fill", favorites.has(id) ? "currentColor" : "none");
  });
}

// ---- profile ----
async function renderProfile() {
  const user = currentUser;
  if (!user) { goLogin(); return; }

  const name  = user.displayName || user.email || "მომხმარებელი";
  const email = user.email || "";

  const nameEl     = $id("profName");
  const emailEl    = $id("profEmail");
  const avatarEl   = $id("profAvatar");
  const adminLink  = $id("profAdminLink");

  if (nameEl)   nameEl.textContent  = name;
  if (emailEl)  emailEl.textContent = email;
  if (avatarEl) {
    avatarEl.innerHTML = user.photoURL
      ? `<img src="${esc(user.photoURL)}" class="prof-avatar-img">`
      : (name[0] || "U").toUpperCase();
  }
  if (adminLink) adminLink.classList.toggle("hidden", email !== CONFIG.adminEmail);

  // Favorites
  await loadFavorites();
  const favBox = $id("profFavGrid");
  if (favBox) {
    const favProducts = PRODUCTS.filter(p => favorites.has(p.id) && !p.hidden);
    if (!favProducts.length) {
      favBox.innerHTML = '<div class="prof-empty">ფავორიტები ცარიელია</div>';
    } else {
      favBox.innerHTML = favProducts.map(p => {
        const img = p.images && p.images.length ? p.images[0] : null;
        return `<div class="prof-fav-card" onclick="openProduct('${p.id}')">
          ${img ? `<img src="${img}" class="prof-fav-img" alt="${esc(p.title)}">` : '<div class="prof-fav-noimg"></div>'}
          <div class="prof-fav-title">${esc(p.title)}</div>
          <div class="prof-fav-price">${fmtPrice(p.price)}</div>
        </div>`;
      }).join("");
    }
  }

  // Service orders
  const ordBox = $id("profOrderList");
  if (ordBox) {
    ordBox.innerHTML = '<div class="prof-empty">იტვირთება...</div>';
    try {
      const snap = await db.collection("service_orders").where("uid", "==", user.uid).get();
      const orders = snap.docs.map(d => d.data()).sort((a, b) => b.created - a.created);
      if (!orders.length) {
        ordBox.innerHTML = '<div class="prof-empty">სერვის შეკვეთები არ არის</div>';
      } else {
        ordBox.innerHTML = orders.map(o => {
          const date  = new Date(o.created).toLocaleDateString("ka-GE");
          const label = SVC_STATUS[o.status] || o.status;
          const priceRow = o.price
            ? `<div class="prof-order-price">ფასი: <b>${o.price}₾</b>${o.install && o.installPrice ? ` + მონტაჟი: <b>${o.installPrice}₾</b>` : ""}</div>`
            : "";
          return `<div class="prof-order">
            <div class="prof-order-top">
              <div>
                <div class="prof-order-laptop">${esc(o.laptop)}</div>
                <div class="prof-order-detail">${esc(o.detail)}</div>
              </div>
              <span class="svc-status ${o.status}">${esc(label)}</span>
            </div>
            ${priceRow}
            <div class="prof-order-date">${date}</div>
          </div>`;
        }).join("");
      }
    } catch {
      ordBox.innerHTML = '<div class="prof-empty">შეცდომა</div>';
    }
  }
}

// ============ PRODUCT FORM ============
function getFb() {
  return CONFIG.facebook && CONFIG.facebook !== "https://www.facebook.com/"
    ? CONFIG.facebook
    : "https://www.facebook.com/";
}

function resetForm() {
  editingId = null;
  formImgs  = [];
  $id("formTitle").textContent = "ახალი პროდუქტის დამატება";
  $id("fTitle").value   = "";
  $id("fBrand").value   = "";
  $id("fPrice").value   = "";
  $id("fOld").value     = "";
  $id("fDesc").value    = "";
  $id("fFbPost").value  = "";
  $id("fSaleEnds").value = "";
  $id("fHidden").checked = false;
  $id("fCPUBrand").selectedIndex = 0;
  $id("fCPUModel").value  = "";
  $id("fGPUBrand").value  = "Integrated";
  $id("fGPUModel").value  = "";
  $id("fRAM").selectedIndex     = 0;
  $id("fRAMType").selectedIndex = 0;
  $id("fStorage").selectedIndex = 0;
  $id("fScreenSize").selectedIndex = 0;
  $id("fScreenInfo").value = "";
  $id("fResolution").selectedIndex = 0;
  $id("fBattery").value = "";
  $id("fOS").value      = "";
  $id("fCat").selectedIndex = 0;
  renderPreviews();
}

function renderPreviews() {
  $id("previews").innerHTML = formImgs.map((src, i) =>
    `<div class="pv${i === 0 ? " pv-main" : ""}">
      <img src="${src}" alt="">
      ${i === 0
        ? `<span class="pv-badge">&#9733; მთავარი</span>`
        : `<button class="pv-star" onclick="setMain(${i})" title="მთავარ ფოტოდ დაყენება">&#9733;</button>`
      }
      <button class="pv-crop" onclick="cropExisting(${i})" title="კადრირება">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
      </button>
      <button class="rm" onclick="removeImg(${i})">&#215;</button>
    </div>`
  ).join("");
}

function setMain(i) {
  const [img] = formImgs.splice(i, 1);
  formImgs.unshift(img);
  renderPreviews();
}

function removeImg(i) {
  formImgs.splice(i, 1);
  renderPreviews();
}

// ============ CROPPER (canvas-based, no external library) ============
let cropQueue   = [];
let cropResults = [];
let cropEditIdx = -1;

const C = {
  img: null, scale: 1, fitScale: 1, minScale: 0.3, maxScale: 5,
  ox: 0, oy: 0, rot: 0, flipH: false, ar: 4/3,
  cropW: 0, cropH: 0,
  drag: false, lx: 0, ly: 0, pd: 0,
};

function openCropQueue(files) {
  cropQueue = Array.from(files); cropResults = [];
  processCropQueue();
}

function processCropQueue() {
  if (!cropQueue.length) {
    for (const r of cropResults) if (formImgs.length < 10) formImgs.push(r);
    renderPreviews();
    if (cropResults.length) toast(cropResults.length + " ფოტო დაემატა");
    return;
  }
  const total = cropResults.length + cropQueue.length;
  $id("cropCounter").textContent = (cropResults.length + 1) + " / " + total;
  const reader = new FileReader();
  reader.onload = e => showCropModal(e.target.result);
  reader.readAsDataURL(cropQueue[0]);
}

function showCropModal(src) {
  C.rot = 0; C.flipH = false; C.ox = 0; C.oy = 0; C.ar = 1;
  document.querySelectorAll(".crop-ratio-btn").forEach(b => b.classList.remove("active"));
  const dflt = document.querySelector(".crop-ratio-btn[data-ratio='1:1']");
  if (dflt) dflt.classList.add("active");
  $id("cropOverlay").classList.remove("hidden");
  _loadCropImg(src);
}

function _loadCropImg(src) {
  const img = new Image();
  img.onload = () => {
    C.img = img;
    const cv   = $id("cropCanvas");
    const wrap = $id("cropCanvasWrap");
    cv.width   = wrap.offsetWidth  || 640;
    cv.height  = wrap.offsetHeight || 420;
    _calcBox();
    const ia = img.naturalWidth / img.naturalHeight;
    C.scale = ia > C.ar ? C.cropH / img.naturalHeight : C.cropW / img.naturalWidth;
    C.fitScale  = C.scale;
    C.minScale  = C.scale * 0.35;
    C.maxScale  = C.scale * 5;
    const sl = $id("cropZoomSlider");
    if (sl) {
      sl.min   = C.minScale.toFixed(4);
      sl.max   = C.maxScale.toFixed(4);
      sl.step  = (C.fitScale * 0.01).toFixed(5);
      sl.value = C.fitScale.toFixed(4);
    }
    _syncSlider();
    _draw();
  };
  img.src = src;
}

function _calcBox() {
  const cv = $id("cropCanvas"); if (!cv) return;
  const pad = 32, mw = cv.width - pad*2, mh = cv.height - pad*2;
  if (mw / C.ar <= mh) { C.cropW = mw; C.cropH = mw / C.ar; }
  else                  { C.cropH = mh; C.cropW = mh * C.ar; }
}

function _draw() {
  const cv = $id("cropCanvas"); if (!cv || !C.img) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height, cx = W/2, cy = H/2;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(cx + C.ox, cy + C.oy);
  ctx.rotate(C.rot * Math.PI / 180);
  if (C.flipH) ctx.scale(-1, 1);
  ctx.scale(C.scale, C.scale);
  ctx.drawImage(C.img, -C.img.naturalWidth/2, -C.img.naturalHeight/2);
  ctx.restore();
  const bx = cx - C.cropW/2, by = cy - C.cropH/2;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, W, by);
  ctx.fillRect(0, by + C.cropH, W, H);
  ctx.fillRect(0, by, bx, C.cropH);
  ctx.fillRect(bx + C.cropW, by, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, C.cropW, C.cropH);
  ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(bx + C.cropW*i/3, by);       ctx.lineTo(bx + C.cropW*i/3, by + C.cropH);
    ctx.moveTo(bx, by + C.cropH*i/3);       ctx.lineTo(bx + C.cropW, by + C.cropH*i/3);
  }
  ctx.stroke();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
  const hs = 14;
  [[bx,by,1,1],[bx+C.cropW,by,-1,1],[bx,by+C.cropH,1,-1],[bx+C.cropW,by+C.cropH,-1,-1]].forEach(([x,y,dx,dy]) => {
    ctx.beginPath(); ctx.moveTo(x, y+dy*hs); ctx.lineTo(x, y); ctx.lineTo(x+dx*hs, y); ctx.stroke();
  });
}

function initCropEvents() {
  const cv = $id("cropCanvas");
  if (!cv) return;
  cv.addEventListener("mousedown", e => { C.drag=true; C.lx=e.clientX; C.ly=e.clientY; cv.style.cursor="grabbing"; });
  window.addEventListener("mousemove", e => { if (!C.drag) return; C.ox+=e.clientX-C.lx; C.oy+=e.clientY-C.ly; C.lx=e.clientX; C.ly=e.clientY; _draw(); });
  window.addEventListener("mouseup", () => { C.drag=false; cv.style.cursor="grab"; });
  cv.addEventListener("wheel", e => { e.preventDefault(); const z=e.deltaY>0?0.91:1.1; C.scale=Math.max(C.minScale,Math.min(C.maxScale,C.scale*z)); _draw(); _syncSlider(); }, {passive:false});
  cv.addEventListener("touchstart", e => { e.preventDefault(); if(e.touches.length===1){C.drag=true;C.lx=e.touches[0].clientX;C.ly=e.touches[0].clientY;}else if(e.touches.length===2){C.pd=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);} }, {passive:false});
  cv.addEventListener("touchmove", e => { e.preventDefault(); if(e.touches.length===1&&C.drag){C.ox+=e.touches[0].clientX-C.lx;C.oy+=e.touches[0].clientY-C.ly;C.lx=e.touches[0].clientX;C.ly=e.touches[0].clientY;_draw();}else if(e.touches.length===2){const d=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);C.scale=Math.max(C.minScale,Math.min(C.maxScale,C.scale*(d/C.pd)));C.pd=d;_draw();_syncSlider();} }, {passive:false});
  cv.addEventListener("touchend", () => { C.drag=false; });
}

function cropExisting(i) {
  cropEditIdx = i;
  C.rot = 0; C.flipH = false; C.ox = 0; C.oy = 0; C.ar = 1;
  document.querySelectorAll(".crop-ratio-btn").forEach(b => b.classList.remove("active"));
  const dflt = document.querySelector(".crop-ratio-btn[data-ratio='1:1']");
  if (dflt) dflt.classList.add("active");
  $id("cropOverlay").classList.remove("hidden");
  _loadCropImg(formImgs[i]);
}

function saveCrop() {
  if (!C.img) return;
  const K = Math.min(3, 1200 / Math.max(C.cropW, C.cropH));
  const ow = Math.round(C.cropW * K), oh = Math.round(C.cropH * K);
  const oc = document.createElement("canvas"); oc.width = ow; oc.height = oh;
  const octx = oc.getContext("2d");
  octx.save();
  octx.translate(ow/2 + C.ox*K, oh/2 + C.oy*K);
  octx.rotate(C.rot * Math.PI / 180);
  if (C.flipH) octx.scale(-1, 1);
  octx.scale(C.scale * K, C.scale * K);
  octx.drawImage(C.img, -C.img.naturalWidth/2, -C.img.naturalHeight/2);
  octx.restore();
  const result = oc.toDataURL("image/jpeg", 0.85);
  if (cropEditIdx >= 0) {
    formImgs[cropEditIdx] = result; cropEditIdx = -1;
    closeCropModal(); renderPreviews(); toast("ფოტო განახლდა");
  } else {
    cropResults.push(result); cropQueue.shift();
    closeCropModal(); processCropQueue();
  }
}

async function skipCrop() {
  if (cropEditIdx >= 0) { cropEditIdx = -1; closeCropModal(); return; }
  const file = cropQueue.shift();
  closeCropModal();
  cropResults.push(await compressImage(file));
  processCropQueue();
}

function closeCropModal() {
  C.img = null;
  $id("cropOverlay").classList.add("hidden");
}

function cropRotate(deg) { C.rot = (C.rot + deg + 360) % 360; _draw(); }
function cropFlip()      { C.flipH = !C.flipH; _draw(); }

function setCropZoomSlider(val) {
  C.scale = Math.max(C.minScale, Math.min(C.maxScale, +val));
  _draw();
  _syncSlider();
}

function _syncSlider() {
  const sl = $id("cropZoomSlider"); if (sl) sl.value = C.scale;
  const pct = C.fitScale ? Math.round(C.scale / C.fitScale * 100) : 100;
  const v = $id("cropZoomVal"); if (v) v.textContent = pct + "%";
}

function setCropRatio(ratio, key) {
  C.ar = isNaN(ratio) ? (C.img ? C.img.naturalWidth / C.img.naturalHeight : 4/3) : ratio;
  _calcBox(); _draw();
  document.querySelectorAll(".crop-ratio-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(".crop-ratio-btn[data-ratio='" + key + "']");
  if (btn) btn.classList.add("active");
}

function compressImage(file, maxDim = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFiles(files) {
  const imgs = Array.from(files).filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  let added = 0;
  for (const file of imgs) {
    if (formImgs.length >= 10) break;
    formImgs.push(await compressImage(file));
    added++;
  }
  renderPreviews();
  if (added) toast(added + " ფოტო დაემატა");
}

async function saveProduct() {
  const title = $id("fTitle").value.trim();
  const price = $id("fPrice").value;

  if (!title) {
    toast("შეიყვანე სათაური");
    $id("fTitle").focus();
    return;
  }
  if (price === "" || Number(price) < 0) {
    toast("შეიყვანე ფასი");
    $id("fPrice").focus();
    return;
  }

  const specs = {
    cpu    : [$id("fCPUBrand").value, $id("fCPUModel").value.trim()].filter(Boolean).join(" "),
    gpu    : [$id("fGPUBrand").value, $id("fGPUModel").value.trim()].filter(Boolean).join(" "),
    ram    : [$id("fRAM").value, $id("fRAMType").value].filter(Boolean).join(" "),
    storage: $id("fStorage").value,
    screen     : [$id("fScreenSize").value, $id("fScreenInfo").value.trim()].filter(Boolean).join(" "),
    resolution : $id("fResolution").value,
    battery    : $id("fBattery").value.trim(),
    os     : $id("fOS").value
  };

  const existing = editingId ? PRODUCTS.find(x => x.id === editingId) : null;
  const p = {
    id      : editingId || uid(),
    title,
    brand   : $id("fBrand").value.trim(),
    price   : Number(price),
    oldPrice: $id("fOld").value ? Number($id("fOld").value) : null,
    cat     : $id("fCat").value,
    cond    : "used",
    specs,
    desc    : $id("fDesc").value.trim(),
    fbPost  : $id("fFbPost").value.trim(),
    saleEnds: $id("fSaleEnds").value ? new Date($id("fSaleEnds").value).getTime() : null,
    hidden  : $id("fHidden").checked,
    images  : formImgs.slice(),
    created : existing?.created || Date.now(),
    sold    : existing?.sold    || false,
    soldAt  : existing?.soldAt  || null,
  };

  const isNew = !editingId;

  try {
    const sizeMB = s => (new Blob([JSON.stringify(s)]).size / 1048576).toFixed(2);
    console.log("[save] images:", p.images.length, "doc size before shrink:", sizeMB(p), "MB");

    // keep the document under Firestore's ~1MB per-doc limit
    const fits = await fitProductSize(p);
    console.log("[save] doc size after shrink:", sizeMB(p), "MB, fits:", fits);
    if (!fits) {
      toast("ფოტო ძალიან დიდია (" + sizeMB(p) + "MB). შეამცირე რაოდენობა");
      return;
    }

    console.log("[save] writing to Firestore…");
    const ok = await dbSave(p);
    console.log("[save] dbSave result:", ok);
    if (!ok) return;

    formImgs = p.images.slice();
    PRODUCTS = await dbList();
    if (isNew) adminPage = 1;
    resetForm();
    updatePriceBounds();
    renderAdminList();
    renderChips();
    renderGrid();
    toast(isNew ? "დაემატა" : "განახლდა");
  } catch (e) {
    console.error("[save] unexpected error:", e);
    toast("შეცდომა: " + (e.message || e));
  }
}

function editProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  const s = p.specs || {};
  $id("formTitle").textContent = "რედაქტირება — " + p.title;
  $id("fTitle").value   = p.title;
  $id("fBrand").value   = p.brand   || "";
  $id("fPrice").value   = p.price;
  $id("fOld").value     = p.oldPrice || "";
  $id("fDesc").value    = p.desc || "";
  $id("fFbPost").value  = p.fbPost || "";
  $id("fHidden").checked = !!p.hidden;
  if (p.saleEnds) {
    const d = new Date(Number(p.saleEnds));
    const tzOff = d.getTimezoneOffset() * 60000;
    $id("fSaleEnds").value = new Date(d.getTime() - tzOff).toISOString().slice(0, 16);
  } else {
    $id("fSaleEnds").value = "";
  }
  const cpuOpts = ["Intel Core i3","Intel Core i5","Intel Core i7","Intel Core i9","Intel Core Ultra 5","Intel Core Ultra 7","Intel Celeron","Intel Pentium","AMD Ryzen 3","AMD Ryzen 5","AMD Ryzen 7","AMD Ryzen 9","AMD Athlon"];
  const cpuMatch = cpuOpts.find(o => (s.cpu||"").startsWith(o));
  $id("fCPUBrand").value = cpuMatch || "";
  $id("fCPUModel").value = cpuMatch ? (s.cpu||"").slice(cpuMatch.length).trim() : (s.cpu||"");

  const gpuBrands = ["Integrated","NVIDIA","AMD"];
  const gpuMatch  = gpuBrands.find(b => (s.gpu||"").startsWith(b));
  $id("fGPUBrand").value = gpuMatch || "Integrated";
  $id("fGPUModel").value = gpuMatch ? (s.gpu||"").slice(gpuMatch.length).trim() : "";

  const ramStr  = s.ram || "";
  const ramType = (ramStr.match(/DDR\d/i) || [""])[0].toUpperCase();
  const ramSize = ramStr.replace(/DDR\d/i, "").trim();
  $id("fRAM").value     = ramSize;
  $id("fRAMType").value = ramType;
  $id("fStorage").value = s.storage || "";

  const screenSizes = ['11.6"','12"','13.3"','14"','15.6"','16"','17.3"'];
  const screenMatch = screenSizes.find(sz => (s.screen||"").startsWith(sz));
  $id("fScreenSize").value = screenMatch || "";
  $id("fScreenInfo").value = screenMatch ? (s.screen||"").slice(screenMatch.length).trim() : (s.screen||"");

  $id("fResolution").value = s.resolution || "";
  $id("fBattery").value    = s.battery    || "";
  $id("fOS").value         = s.os         || "";
  $id("fCat").value     = p.cat;
  formImgs = (p.images || []).slice();
  renderPreviews();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStorePage(p) {
  storePage = p;
  renderGrid();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function toggleSold(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const msg = p.sold ? `„${p.title}" — ისევ გამოვფინო?` : `„${p.title}" — გაყიდულად მოვნიშნო?`;
  if (!confirm(msg)) return;
  p.sold   = !p.sold;
  p.soldAt = p.sold ? Date.now() : null;
  await dbSave(p);
  PRODUCTS = await dbList();
  updatePriceBounds();
  renderAdminList();
  renderGrid();
  toast(p.sold ? "გაყიდულია" : "ისევ გამოფინდა");
}

async function toggleHidden(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const msg = p.hidden ? `„${p.title}" — გამოვაჩინო?` : `„${p.title}" — დავმალო?`;
  if (!confirm(msg)) return;
  p.hidden = !p.hidden;
  await dbSave(p);
  PRODUCTS = await dbList();
  updatePriceBounds();
  renderAdminList();
  renderGrid();
  toast(p.hidden ? "დაიდრაფტა" : "გამოჩნდა");
}

async function deleteProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  const name = p ? p.title : "";
  if (!confirm("წავშალო „" + name + "“?")) return;
  await dbRemove(id);
  PRODUCTS = await dbList();
  if (editingId === id) resetForm();
  updatePriceBounds();
  renderAdminList();
  renderChips();
  renderGrid();
  toast("წაიშალა");
}

function renderAdminList() {
  $id("prodCount").textContent = PRODUCTS.length;
  const list = PRODUCTS.slice().sort((a, b) => {
    if (!!a.sold !== !!b.sold) return a.sold ? 1 : -1;
    return (b.created || 0) - (a.created || 0);
  });

  if (list.length === 0) {
    $id("prodList").innerHTML = `<div style="color:var(--muted);font-size:14px">
      ჯერ პროდუქტი არ არის დამატებული.
    </div>`;
    return;
  }

  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  if (adminPage > totalPages) adminPage = totalPages;
  const start = (adminPage - 1) * PAGE_SIZE;
  const page  = list.slice(start, start + PAGE_SIZE);

  const rows = page.map(p => {
    const imgEl = p.images && p.images[0]
      ? `<img src="${p.images[0]}" alt="${esc(p.title)}">`
      : `<div class="nophoto"></div>`;
    const icEdit = `<svg class="bic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const icSold = `<svg class="bic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    const icUnsold = `<svg class="bic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const icDel = `<svg class="bic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
    const dpct = discountPct(p);
    const adminSaleOn = !p.saleEnds || saleActive(p);
    const adminDisplayPrice = (!adminSaleOn && p.oldPrice) ? p.oldPrice : p.price;
    const icHide = `<svg class="bic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    return `<div class="prod-row${p.sold ? " prod-sold" : ""}${p.hidden ? " prod-hidden" : ""}">
  ${imgEl}
  <div class="prod-body">
    <div class="prod-meta">
      <div class="m">${p.sold ? '<span class="row-sold-tag">გაყიდულია</span> ' : ''}${p.hidden ? '<span class="row-draft-tag">დამალული</span> ' : ''}${dpct > 0 && adminSaleOn ? `<span class="row-disc-tag">-${dpct}%</span> ` : ''}${esc(p.cat)} · <span class="row-price">${fmtPrice(adminDisplayPrice)}</span></div>
      <div class="t">${esc(p.title)}</div>
    </div>
    <div class="prod-actions">
      <button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')" title="რედაქტირება">${icEdit}<span class="blabel">რედაქტ.</span></button>
      <button class="btn btn-sm btn-cyan" onclick="toggleHidden('${p.id}')" title="${p.hidden ? "გამოჩენა" : "დამალვა"}">${p.hidden ? icUnsold : icHide}<span class="blabel">${p.hidden ? "გამოჩენა" : "დამალვა"}</span></button>
      <button class="btn btn-sold btn-sm${p.sold ? " active" : ""}" onclick="toggleSold('${p.id}')" title="${p.sold ? "ისევ გამოფინე" : "გაყიდულია"}">${p.sold ? icUnsold : icSold}<span class="blabel">${p.sold ? "გამოფინე" : "გაყიდულია"}</span></button>
      <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')" title="წაშლა">${icDel}<span class="blabel">წაშლა</span></button>
    </div>
  </div>
</div>`;
  }).join("");

  const pagination = totalPages > 1 ? `
    <div class="pagination">
      <button class="btn btn-ghost btn-sm" onclick="setAdminPage(${adminPage - 1})" ${adminPage === 1 ? "disabled" : ""}>&#8592;</button>
      ${Array.from({length: totalPages}, (_, i) => `
        <button class="btn btn-sm ${i + 1 === adminPage ? "btn-primary" : "btn-ghost"}" onclick="setAdminPage(${i + 1})">${i + 1}</button>
      `).join("")}
      <button class="btn btn-ghost btn-sm" onclick="setAdminPage(${adminPage + 1})" ${adminPage === totalPages ? "disabled" : ""}>&#8594;</button>
    </div>` : "";

  $id("prodList").innerHTML = rows + pagination;
}

function setAdminPage(p) {
  const total = Math.ceil(PRODUCTS.length / PAGE_SIZE);
  if (p < 1 || p > total) return;
  adminPage = p;
  renderAdminList();
}


// ============ FORM BINDING ============
function bindForm() {
  const drop = $id("drop");
  const fi   = $id("fileInput");

  drop.addEventListener("click", () => fi.click());
  fi.addEventListener("change", () => { handleFiles(fi.files); fi.value = ""; });

  drop.addEventListener("dragenter", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragover",  e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault();
    drop.classList.remove("over");
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  });
}

// ============ INIT ============
async function migrate() {
  const CAT_MAP = {
    "ლეპტოპები":   "ლეპტოპი",
    "ტელეფონები":  "ტელეფონი",
    "ტაბლეტები":   "ტაბლეტი",
    "კონსოლები":   "კონსოლი",
    "აქსესუარები": "აქსესუარი"
  };
  let changed = false;
  for (const p of PRODUCTS) {
    if (CAT_MAP[p.cat]) {
      p.cat = CAT_MAP[p.cat];
      await dbSave(p);
      changed = true;
    }
  }
  if (changed) PRODUCTS = await dbList();
}

// ============ THEME ============
const SUN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const MOON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("gs_theme", t);
  const svg = t === "dark" ? SUN_SVG : MOON_SVG;
  ["themeToggle", "themeToggleSvc"].forEach(id => { const b = $id(id); if (b) b.innerHTML = svg; });
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}

function initTheme() {
  applyTheme(localStorage.getItem("gs_theme") || "light");
}

async function init() {
  document.addEventListener("contextmenu", e => e.preventDefault());
  // clear search on every load so Chrome doesn't restore previous value
  ["searchInput","searchOverlayInput"].forEach(id => { const el=$id(id); if(el) el.value=""; });
  initTheme();
  syncGridToggleBtn();
  const yr = new Date().getFullYear();
  $id("year").textContent = yr;
  const ys = $id("yearSvc"); if (ys) ys.textContent = yr;

  const fb = getFb();
  $id("topContact").href = fb;
  $id("socialFb").href   = fb;
  $id("socialIg").href   = CONFIG.instagram || "#";
  $id("socialWa").href   = CONFIG.whatsapp
    ? "https://wa.me/995" + CONFIG.whatsapp.replace(/\D/g, "")
    : "#";

  // show cached data instantly while Firebase loads
  const cached = getCached();
  if (cached) {
    PRODUCTS = cached;
    updatePriceBounds();
    renderChips();
    renderGrid();
  } else {
    showSkeletons();
  }

  // fetch settings + products in parallel
  const [s, fresh] = await Promise.all([getSettings(), dbList()]);
  if (s.user)     storedUser = s.user;
  if (s.password) storedPass = s.password;

  const sortedSpecs = s => Object.keys(s||{}).sort().map(k => k+"="+s[k]).join(",");
  const prodHash = arr => [...arr]
    .sort((a, b) => a.id < b.id ? -1 : 1)
    .map(p => [p.id, p.title, p.price, p.oldPrice ?? "", p.sold, p.hidden,
               p.saleEnds ?? "", p.cat, (p.images||[]).join(","),
               sortedSpecs(p.specs)].join("|"))
    .join("||");
  if (prodHash(fresh) !== prodHash(PRODUCTS) || !cached) {
    PRODUCTS = fresh;
    await migrate();
    updatePriceBounds();
    renderChips();
    renderGrid();
  }
  dataLoaded = true;

  bindForm();
  initCropEvents();
  route();
}

init();
