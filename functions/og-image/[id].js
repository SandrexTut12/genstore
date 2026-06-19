// Cloudflare Pages Function — turns a product's stored base64 photo into a
// real fetchable image so Facebook/Discord can show it in link previews.

const PROJECT = "genstore-87e1f";

function gv(f) {
  if (!f) return undefined;
  if ("stringValue" in f) return f.stringValue;
  if ("arrayValue"  in f) return (f.arrayValue.values || []).map(gv);
  return undefined;
}

export async function onRequest(context) {
  const { params, request } = context;
  const id = String(params.id).replace(/\.(jpe?g|png|webp)$/i, "");

  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products/${encodeURIComponent(id)}`
    );
    if (r.ok) {
      const images = gv((await r.json()).fields?.images) || [];
      const first = images.find(x => typeof x === "string" && x.startsWith("data:"));
      if (first) {
        const comma = first.indexOf(",");
        const mime  = (first.slice(5, comma).split(";")[0]) || "image/jpeg";
        const b64   = first.slice(comma + 1);
        const bin   = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, {
          headers: {
            "content-type": mime,
            "cache-control": "public, max-age=86400"
          }
        });
      }
    }
  } catch (e) { /* fall through */ }

  // no image — fall back to the logo
  return Response.redirect(new URL("/assets/favicon-16x16.png", request.url).toString(), 302);
}
