// Cloudflare Worker — serves the static site + per-product OG previews.
// Static files are served automatically (ASSETS); this Worker only handles
// the dynamic routes /p/<id> (crawler OG tags) and /og-image/<id> (photo).

const PROJECT = "genstore-87e1f";

function gv(f) {
  if (!f) return undefined;
  if ("stringValue"  in f) return f.stringValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue"  in f) return f.doubleValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("nullValue"    in f) return null;
  if ("arrayValue"   in f) return (f.arrayValue.values || []).map(gv);
  if ("mapValue"     in f) {
    const o = {}, fl = f.mapValue.fields || {};
    for (const k in fl) o[k] = gv(fl[k]);
    return o;
  }
  return undefined;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function fetchFields(id) {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products/${encodeURIComponent(id)}`
  );
  if (!r.ok) return null;
  return (await r.json()).fields || null;
}

async function productPage(id, origin, selfPath) {
  const appUrl = origin + "/#product/" + encodeURIComponent(id);
  const selfUrl = origin + (selfPath || ("/p/" + encodeURIComponent(id)));
  let p = null;
  try {
    const f = await fetchFields(id);
    if (f) p = {
      title:  gv(f.title) || "GENSTORE",
      price:  gv(f.price),
      brand:  gv(f.brand) || "",
      cat:    gv(f.cat) || "",
      desc:   gv(f.desc) || "",
      images: gv(f.images) || []
    };
  } catch (e) { /* generic fallback */ }

  const title    = p ? p.title : "GENSTORE — ტექნიკის მაღაზია";
  const priceTxt = (p && p.price != null) ? Number(p.price).toLocaleString("en-US") + " ₾" : "";
  const bits = [];
  if (priceTxt) bits.push(priceTxt);
  if (p && p.brand) bits.push(p.brand);
  if (p && p.cat)   bits.push(p.cat);
  const desc = p
    ? (bits.join(" · ") || p.desc || "GENSTORE")
    : "მეორადი და ახალი ტექნიკა საუკეთესო ფასად.";
  const ogImg = (p && p.images && p.images.length)
    ? `${origin}/og-image/${encodeURIComponent(id)}`
    : `${origin}/assets/favicon-16x16.png`;

  const html = `<!DOCTYPE html><html lang="ka"><head>
<meta charset="UTF-8">
<title>${esc(title)} — GENSTORE</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="GENSTORE">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${ogImg}">
<meta property="og:url" content="${selfUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImg}">
<link rel="canonical" href="${selfUrl}">
<script>
  // redirect real visitors into the app; crawlers (no JS) stay & read OG tags above
  if (!/bot|facebookexternalhit|facebot|twitterbot|discordbot|telegrambot|whatsapp|slackbot|linkedinbot|embedly|preview|crawler|spider/i.test(navigator.userAgent)) {
    location.replace(${JSON.stringify(appUrl)});
  }
</script>
</head><body style="font-family:sans-serif;background:#071428;color:#E8F4FF;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<a href="${esc(appUrl)}" style="color:#00BAFF">გადადი GENSTORE-ზე →</a>
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }
  });
}

async function productImage(id, origin) {
  id = String(id).replace(/\.(jpe?g|png|webp)$/i, "");
  try {
    const f = await fetchFields(id);
    const images = gv(f && f.images) || [];
    const first = images.find(x => typeof x === "string" && x.startsWith("data:"));
    if (first) {
      const comma = first.indexOf(",");
      const mime  = (first.slice(5, comma).split(";")[0]) || "image/jpeg";
      const bin   = atob(first.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, {
        headers: { "content-type": mime, "cache-control": "public, max-age=86400" }
      });
    }
  } catch (e) { /* fall through */ }
  return Response.redirect(origin + "/assets/favicon-16x16.png", 302);
}

// the real Firestore id is the part after the last dash (slug has dashes,
// the uid() id never does). "macbook-air-mqj916c2c9tpd" → "mqj916c2c9tpd"
function extractId(seg) {
  const raw = decodeURIComponent(seg).replace(/\.(jpe?g|png|webp)$/i, "");
  return raw.includes("-") ? raw.slice(raw.lastIndexOf("-") + 1) : raw;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;

    let m = url.pathname.match(/^\/p\/([^\/]+)\/?$/);
    if (m) return productPage(extractId(m[1]), origin, url.pathname);

    m = url.pathname.match(/^\/og-image\/([^\/]+)\/?$/);
    if (m) return productImage(extractId(m[1]), origin);

    // everything else → static files
    return env.ASSETS.fetch(request);
  }
};
