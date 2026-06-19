// Cloudflare Pages Function — serves crawler-friendly per-product OG tags.
// Real visitors are instantly redirected into the SPA (#product/<id>);
// crawlers (Facebook, Messenger, Discord, Telegram…) read the OG meta below.

const PROJECT = "genstore-87e1f";

// unwrap a Firestore REST typed value into a plain JS value
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

export async function onRequest(context) {
  const { params, request } = context;
  const id = params.id;
  const origin = new URL(request.url).origin;
  const appUrl = origin + "/#product/" + encodeURIComponent(id);

  let p = null;
  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products/${encodeURIComponent(id)}`
    );
    if (r.ok) {
      const f = (await r.json()).fields || {};
      p = {
        title:  gv(f.title) || "GENSTORE",
        price:  gv(f.price),
        brand:  gv(f.brand) || "",
        cat:    gv(f.cat) || "",
        desc:   gv(f.desc) || "",
        images: gv(f.images) || []
      };
    }
  } catch (e) { /* fall back to generic tags */ }

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
<meta property="og:url" content="${origin}/p/${encodeURIComponent(id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImg}">
<link rel="canonical" href="${origin}/p/${encodeURIComponent(id)}">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head><body style="font-family:sans-serif;background:#071428;color:#E8F4FF;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<a href="${esc(appUrl)}" style="color:#00BAFF">გადადი GENSTORE-ზე →</a>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
