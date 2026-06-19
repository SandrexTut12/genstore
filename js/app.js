/* jshint esversion:11 */
"use strict";

// ============ CONFIG ============
const CONFIG = {
  facebook  : "https://www.facebook.com/profile.php?id=61590242855257",
  messenger : "https://m.me/1093496020521668",
  instagram : "https://www.instagram.com/genstore856/",
  whatsapp  : "500700362",
  phone     : "",
  adminUser : "admin",
  adminPass : "genstore",
  skipLogin : true   // true = პაროლი არ სჭირდება, false = პაროლი სავალდებულოა
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

// ============ STORAGE ============
const CACHE_KEY = "gs_cache_v1";

function getCached() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

async function dbList() {
  try {
    const snap = await db.collection("products").get();
    const data = snap.docs.map(d => d.data());
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
let activeCat   = "ყველა";
let searchQ     = "";
let sortBy      = "new";
let priceFloor  = 0, priceCeil = 0;   // overall bounds
let priceMin    = 0, priceMax = 0;    // selected range
let dataLoaded  = false;
let authed      = false;
let editingId   = null;
let formImgs    = [];
let modalImgs   = [];
let modalIdx    = 0;
let adminPage   = 1;
let storePage   = 1;
const PAGE_SIZE = 12;

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
  const cats = ["ყველა", ...Array.from(new Set(PRODUCTS.map(p => p.cat)))];
  $id("chips").innerHTML = cats.map(c => {
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
  renderGrid();
}

function getFiltered() {
  return PRODUCTS
    .filter(p => {
      if (p.hidden) return false;                 // draft — not shown on storefront
      if (activeCat !== "ყველა" && p.cat !== activeCat) return false;
      if (priceCeil > 0 && (p.price < priceMin || p.price > priceMax)) return false;
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
      if (a.sold !== b.sold) return a.sold ? 1 : -1;
      if (a.sold && b.sold)  return (b.soldAt || 0) - (a.soldAt || 0);
      if (sortBy === "price-asc")  return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      if (sortBy === "discount")   return discountPct(b) - discountPct(a);
      return (b.created || 0) - (a.created || 0);  // "new"
    });
}

// ---- filter bar (sort + price range) ----
function updatePriceBounds() {
  const prices = PRODUCTS.filter(p => !p.hidden).map(p => Number(p.price) || 0);
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
  const dirty = sortBy !== "new" || priceMin !== priceFloor || priceMax !== priceCeil;
  if (clear) clear.classList.toggle("show", dirty);
}

function onSort(val) {
  sortBy = val;
  storePage = 1;
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

function clearFilters() {
  sortBy = "new";
  const sel = $id("sortSelect"); if (sel) sel.value = "new";
  priceMin = priceFloor; priceMax = priceCeil;
  const lo = $id("priceMinRange"), hi = $id("priceMaxRange");
  if (lo && hi) { lo.value = priceFloor; hi.value = priceCeil; }
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

  const totalPages = Math.ceil(list.length / PAGE_SIZE);
  if (storePage > totalPages) storePage = Math.max(1, totalPages);
  const pageList = list.slice((storePage - 1) * PAGE_SIZE, storePage * PAGE_SIZE);

  grid.innerHTML = pageList.map((p, idx) => {
    const img = p.images && p.images[0]
      ? `<img src="${p.images[0]}" alt="${esc(p.title)}" loading="lazy">`
      : `<div class="noimg">ფოტო არ არის</div>`;
    const old = p.oldPrice
      ? `<span class="old">${fmtPrice(p.oldPrice)}</span>`
      : "";
    const dpct = discountPct(p);
    const discountBadge = (dpct > 0 && !p.sold)
      ? `<span class="badge-discount">-${dpct}%</span>` : "";
    const timer = (dpct > 0 && !p.sold && saleActive(p))
      ? `<div class="sale-timer countdown" data-ends="${p.saleEnds}">
           <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
           <span class="ct">${fmtCountdown(Number(p.saleEnds) - Date.now())}</span>
         </div>`
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
    const specLine = specDefs.length
      ? `<div class="spec-chips">${specDefs.map(x => {
          const m = x.key==="battery" && x.val.match(/(\d+)\s*%/);
          const pct = m ? parseInt(m[1]) : null;
          const clr = x.key==="battery" ? (pct>60?"#00E5A0":pct>30?"#FFB830":"#FF5C78") : (SPEC_CLR[x.key]||"currentColor");
          return `<span class="spec-chip" style="--cc:${clr}">${mkIcon(x.key,x.val)}${esc(x.val)}</span>`;
        }).join("")}</div>`
      : "";
    const soldOverlay = p.sold
      ? `<div class="sold-overlay"><span>გაიყიდა</span></div>`
      : "";
    return `<div class="card reveal${p.sold ? " sold" : ""}" style="animation-delay:${Math.min(idx, 11) * 45}ms" onclick="openProduct('${p.id}')">
  <div class="imgwrap">${img}${discountBadge}${soldOverlay}</div>
  <div class="body">
    <span class="name">${esc(p.title)}</span>
    ${specLine}
    ${timer}
    <span class="price"><span class="now">${fmtPrice(p.price)}</span>${old}</span>
  </div>
</div>`;
  }).join("");

  startCountdowns();

  const pager = $id("store-pagination");
  if (totalPages > 1) {
    const maxVisible = 5;
    let start = Math.max(1, storePage - Math.floor(maxVisible / 2));
    let end   = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    let btns = "";
    if (storePage > 1)
      btns += `<button class="pg-btn pg-arrow" onclick="setStorePage(${storePage - 1})">&#8592;</button>`;
    if (start > 1)
      btns += `<button class="pg-btn" onclick="setStorePage(1)">1</button>${start > 2 ? '<span class="pg-dots">…</span>' : ""}`;
    for (let i = start; i <= end; i++)
      btns += `<button class="pg-btn${i === storePage ? " active" : ""}" onclick="setStorePage(${i})">${i}</button>`;
    if (end < totalPages)
      btns += `${end < totalPages - 1 ? '<span class="pg-dots">…</span>' : ""}<button class="pg-btn" onclick="setStorePage(${totalPages})">${totalPages}</button>`;
    if (storePage < totalPages)
      btns += `<button class="pg-btn pg-arrow" onclick="setStorePage(${storePage + 1})">&#8594;</button>`;

    pager.innerHTML = btns;
    pager.style.display = "flex";
  } else {
    pager.innerHTML = "";
    pager.style.display = "none";
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
// opening just sets the URL hash → route() renders (so links are shareable)
function openProduct(id) {
  location.hash = "#product/" + encodeURIComponent(id);
}

function renderProductModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) { closeModalDom(); return; }

  modalImgs = p.images || [];
  modalIdx  = 0;

  const old = p.oldPrice ? `<span class="old">${fmtPrice(p.oldPrice)}</span>` : "";
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

  const ctaFb = `<a class="btn btn-cta btn-cta-fb" href="${CONFIG.messenger || fb}" target="_blank" rel="noopener">
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
  const waMsg = encodeURIComponent(`გამარჯობა! მაინტერესებს: ${p.title} - ${p.price}₾`);
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
  const mDiscBadge = (mdpct > 0 && !p.sold) ? `<span class="mdisc">-${mdpct}%</span>` : "";
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
          <span class="now">${fmtPrice(p.price)}</span>${old}${mDiscBadge}
        </div>
        ${mTimer}
        ${specTable}
        ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ""}
        ${p.sold ? `<div class="sold-badge-modal">გაიყიდა</div>` : `<div class="cta">${ctaFb}${ctaIg}${ctaWa}${ctaPhone}</div>`}
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

// share current product — native share sheet or copy link
async function shareProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  // GitHub Pages can't render per-product previews → use the hash link there.
  // On Cloudflare use /p/<slug>-<id> (pretty slug + real id at the end).
  const onPages = location.hostname.endsWith("github.io");
  let url;
  if (onPages) {
    url = location.origin + location.pathname + "#product/" + encodeURIComponent(id);
  } else {
    const slug = p ? slugify(p.title) : "";
    url = location.origin + "/p/" + (slug ? slug + "-" + id : id);
  }
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
    location.hash = "";   // → route() clears the modal
  } else {
    closeModalDom();
  }
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape")     { closeLightbox(); closeModal(); }
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
function goStore() { location.hash = ""; }
function goAdmin() { location.hash = "#admin"; }

function route() {
  const h = location.hash;
  const isAdmin = h === "#admin";
  $id("view-store").classList.toggle("hidden", isAdmin);
  $id("view-admin").classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    closeModalDom();
    if (authed || CONFIG.skipLogin) {
      authed = true;
      $id("admin-login").classList.add("hidden");
      $id("admin-dash").classList.remove("hidden");
      renderAdminList();
    } else {
      $id("admin-login").classList.remove("hidden");
      $id("admin-dash").classList.add("hidden");
      setTimeout(() => $id("pwInput").focus(), 50);
    }
    return;
  }

  // product deep-link (shareable URL)
  if (h.startsWith("#product/")) {
    const id = decodeURIComponent(h.slice("#product/".length));
    renderProductModal(id);
  } else {
    closeModalDom();
  }
}

window.addEventListener("hashchange", route);

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

// ============ AUTH ============
let storedUser = CONFIG.adminUser;
let storedPass = CONFIG.adminPass;

function doLogin() {
  const u  = $id("userInput").value.trim();
  const pw = $id("pwInput").value;
  if (u === storedUser && pw === storedPass) {
    authed = true;
    $id("pwErr").textContent = "";
    $id("pwInput").value = "";
    $id("userInput").value = "";
    route();
  } else {
    $id("pwErr").textContent = "არასწორი მომხმარებელი ან პაროლი";
  }
}

function logout() { authed = false; goStore(); }

function changePassword() {
  const np = prompt("ახალი პაროლი:");
  if (np && np.trim()) {
    storedPass = np.trim();
    saveSettings({ user: storedUser, password: storedPass });
    toast("პაროლი შეიცვალა");
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
  p.sold   = !p.sold;
  p.soldAt = p.sold ? Date.now() : null;
  await dbSave(p);
  PRODUCTS = await dbList();
  updatePriceBounds();
  renderAdminList();
  renderGrid();
  toast(p.sold ? "გაიყიდა" : "ისევ გამოფინდა");
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
    return `<div class="prod-row${p.sold ? " prod-sold" : ""}${p.hidden ? " prod-hidden" : ""}">
  ${imgEl}
  <div class="prod-body">
    <div class="prod-meta">
      <div class="m">${p.sold ? '<span class="row-sold-tag">გაიყიდა</span> ' : ''}${p.hidden ? '<span class="row-draft-tag">დამალული</span> ' : ''}${dpct > 0 ? `<span class="row-disc-tag">-${dpct}%</span> ` : ''}${esc(p.cat)} · <span class="row-price">${fmtPrice(p.price)}</span></div>
      <div class="t">${esc(p.title)}</div>
    </div>
    <div class="prod-actions">
      <button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')" title="რედაქტირება">${icEdit}<span class="blabel">რედაქტ.</span></button>
      <button class="btn btn-sold btn-sm${p.sold ? " active" : ""}" onclick="toggleSold('${p.id}')" title="${p.sold ? "ისევ გამოფინე" : "გაიყიდა"}">${p.sold ? icUnsold : icSold}<span class="blabel">${p.sold ? "გამოფინე" : "გაიყიდა"}</span></button>
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
  const btn = $id("themeToggle");
  if (btn) btn.innerHTML = t === "dark" ? SUN_SVG : MOON_SVG;
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}

function initTheme() {
  applyTheme(localStorage.getItem("gs_theme") || "light");
}

async function init() {
  initTheme();
  $id("year").textContent = new Date().getFullYear();

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

  if (JSON.stringify(fresh) !== JSON.stringify(PRODUCTS) || !cached) {
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
