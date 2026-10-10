/* ==========================================================================
   Mercy Studio — server/lib/social.js
   Páginas de la tienda con etiquetas para redes (Open Graph / Twitter) y feed de catálogo para Meta.
   · Facebook, Instagram y WhatsApp no ejecutan JavaScript: leen el HTML tal cual. Por eso el servidor escribe en el
     <head> de index.html, catalogo.html, producto.html (según ?id=) y checkout.html el título, la descripción, la
     imagen y la URL canónica calculados del contenido (settings.seo, texts.catalog / texts.checkout, el producto y
     su primera foto). El JavaScript de la tienda pone después los mismos valores (coherente con y sin servidor).
   · GET /api/public/feed-meta.csv: productos publicados en el formato de catálogo de Meta (Commerce Manager).
   · URL absolutas: PUBLIC_URL si está definida; si no, host y protocolo de la petición (X-Forwarded-* con TRUST_PROXY).
   ========================================================================== */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { requestHost, sendBody } from "./http.js";
import { STORE_CSP } from "./static.js";

const PAGE_FILES = { "/": "index.html", "/index.html": "index.html", "/catalogo.html": "catalogo.html", "/producto.html": "producto.html", "/checkout.html": "checkout.html" };
export const isStorePage = (pathname) => Object.prototype.hasOwnProperty.call(PAGE_FILES, pathname);

const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Texto plano de un campo con *acento* o saltos de línea (como Mercy.ui.plain). */
const plain = (s) => String(s ?? "").replace(/\*([^*\n]+)\*/g, "$1").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
/** texts.<ruta>: vacío o ausente = `def` (misma regla que Mercy.ui.tx en la tienda). */
function tx(texts, path, def) {
  let v = texts;
  for (const k of path.split(".")) v = v == null ? undefined : v[k];
  const s = v == null ? "" : String(v).trim();
  return s || def;
}

/** Origen público (sin barra final): PUBLIC_URL o lo que ve la petición. */
export function publicOrigin(ctx) {
  const cfg = ctx.app.config;
  if (cfg.publicUrl) return cfg.publicUrl;
  const host = requestHost(ctx.req, cfg.trustProxy) || `127.0.0.1:${cfg.port}`;
  return `${ctx.secure ? "https" : "http"}://${host}`;
}

/** URL absoluta de una foto o ruta del sitio (http(s) tal cual; /uploads/… y assets/… con el origen). "" si no es segura. */
export function absUrl(origin, u) {
  const s = String(u ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return "https:" + s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
  return origin + (s.startsWith("/") ? s : "/" + s);
}

/** Fotos del producto: primero las del primer color que tenga, luego las de los demás (sin repetir). */
export function productPhotos(p) {
  const out = [];
  for (const c of p.colors || []) for (const ph of c.photos || []) if (ph && ph.src && !out.includes(ph.src)) out.push(ph.src);
  return out;
}
export const productImage = (p) => productPhotos(p)[0] || "";

export function stockTotal(p) {
  let n = 0;
  for (const c of p.colors || []) for (const v of Object.values(c.stock || {})) n += Number(v) || 0;
  return n;
}
export const isAvailable = (p) => !p.soldOut && stockTotal(p) > 0;

/** Producto publicado por id actual o anterior (formerIds). */
function productOf(data, id) {
  if (!id) return null;
  const list = (data.products || []).filter((p) => p.status === "published");
  return list.find((p) => p.id === id) || list.find((p) => (p.formerIds || []).includes(id)) || null;
}

/** Descripción para buscadores de un producto (misma composición que js/producto.js). */
export function productDescription(data, p, brand) {
  const col = (data.collections || []).find((c) => c.id === p.collection);
  const suffix = tx(data.texts, "product.metaSuffix", "").replace(/\{marca\}/g, brand);
  return `${plain(p.desc) ? plain(p.desc) + " " : ""}${p.name}${col ? " — colección " + col.name : ""}.${suffix ? " " + suffix : ""}`;
}

/** Metadatos de una página de la tienda → { brand, type, url, title, description, image, imageAlt, robots, extra } */
export function pageMeta(data, origin, name, query) {
  const st = data.settings || {}, texts = data.texts || {}, seo = st.seo || {};
  const brand = plain(st.brand) || "Mercy Studio";
  const fill = (s) => String(s ?? "").replace(/\{marca\}/g, brand);
  const logo = absUrl(origin, st.logo?.terracota || "");
  const base = { brand, type: "website", image: logo, imageAlt: brand, robots: "", extra: [] };
  if (name === "index.html") {
    const media = data.home?.hero?.media || {};
    const heroImg = media.type === "image" ? media.src : media.type === "video" ? media.poster : "";
    return { ...base, url: `${origin}/`, title: plain(seo.title) || brand, description: plain(seo.description), image: absUrl(origin, heroImg) || logo };
  }
  if (name === "catalogo.html") {
    const label = plain(tx(texts, "catalog.eyebrow", "")) || "Catálogo";
    const first = (data.products || []).find((p) => p.status === "published" && productImage(p));
    return { ...base, url: `${origin}/catalogo.html`, title: `${label} — ${brand}`, description: plain(fill(tx(texts, "catalog.metaDescription", seo.description))), image: first ? absUrl(origin, productImage(first)) || logo : logo };
  }
  if (name === "checkout.html") {
    return { ...base, url: `${origin}/checkout.html`, title: `${plain(tx(texts, "checkout.title", "Finalizar compra"))} — ${brand}`, description: plain(fill(tx(texts, "checkout.metaDescription", ""))), robots: "noindex" };
  }
  const id = String(query?.get?.("id") || "").trim();
  const p = productOf(data, id);
  if (!p) {
    return { ...base, url: `${origin}/producto.html`, title: `Prenda no encontrada — ${brand}`, description: `No encontramos esa prenda. Mira la colección de ${brand} y encuentra la que habla de ti.`, robots: "noindex" };
  }
  const img = productImage(p);
  return {
    ...base,
    type: "product",
    url: `${origin}/producto.html?id=${encodeURIComponent(p.id)}`,
    title: `${p.name} — ${brand}`,
    description: productDescription(data, p, brand),
    image: absUrl(origin, img) || logo,
    imageAlt: p.name,
    extra: [
      ["product:price:amount", String(Number(p.price) || 0)],
      ["product:price:currency", "COP"],
      ["product:availability", isAvailable(p) ? "in stock" : "out of stock"],
      ["product:retailer_item_id", p.id],
      ["product:brand", brand],
    ],
  };
}

function tagsHTML(m) {
  const t = [];
  const prop = (k, v) => { if (v) t.push(`<meta property="${k}" content="${escAttr(v)}">`); };
  const name = (k, v) => { if (v) t.push(`<meta name="${k}" content="${escAttr(v)}">`); };
  t.push(`<link rel="canonical" href="${escAttr(m.url)}">`);
  if (m.robots) name("robots", m.robots);
  prop("og:type", m.type);
  prop("og:site_name", m.brand);
  prop("og:locale", "es_CO");
  prop("og:url", m.url);
  prop("og:title", m.title);
  prop("og:description", m.description);
  prop("og:image", m.image);
  if (m.image) prop("og:image:alt", m.imageAlt || m.title);
  for (const [k, v] of m.extra || []) prop(k, v);
  name("twitter:card", m.image ? "summary_large_image" : "summary");
  name("twitter:title", m.title);
  name("twitter:description", m.description);
  name("twitter:image", m.image);
  return t.join("\n  ");
}

/** Escribe título, descripción y etiquetas sociales en el <head> (reemplaza las del archivo). */
export function injectHead(html, m) {
  let out = String(html);
  const titleTag = `<title>${escAttr(m.title)}</title>`;
  out = /<title>[\s\S]*?<\/title>/i.test(out) ? out.replace(/<title>[\s\S]*?<\/title>/i, () => titleTag) : out.replace(/<head>/i, () => `<head>\n  ${titleTag}`);
  const descTag = `<meta name="description" content="${escAttr(m.description)}">`;
  out = /<meta\s+name="description"[^>]*>/i.test(out) ? out.replace(/<meta\s+name="description"[^>]*>/i, () => descTag) : out.replace(titleTag, () => `${titleTag}\n  ${descTag}`);
  const block = `<!-- Redes sociales (Open Graph), generado por el servidor -->\n  ${tagsHTML(m)}\n`;
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, () => block + "</head>") : out;
}

/** Feed de catálogo para Meta (CSV): solo productos publicados; precio «79900.00 COP»; enlaces y fotos absolutos. */
export function metaFeedCsv(data, origin) {
  const cols = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "additional_image_link", "brand", "product_type"];
  const q = (v) => `"${String(v ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
  const st = data.settings || {};
  const brand = plain(st.brand) || "Mercy Studio";
  const logo = absUrl(origin, st.logo?.terracota || "");
  const cats = new Map((data.categories || []).map((c) => [c.id, c.name]));
  const rows = [cols.join(",")];
  for (const p of data.products || []) {
    if (p.status !== "published") continue;
    const photos = productPhotos(p).map((u) => absUrl(origin, u)).filter(Boolean);
    const image = photos[0] || logo;
    if (!image) continue; // Meta exige imagen
    const desc = plain(p.desc) || plain(p.story) || productDescription(data, p, brand);
    rows.push([
      p.id, p.name, desc, isAvailable(p) ? "in stock" : "out of stock", "new", `${(Number(p.price) || 0).toFixed(2)} COP`,
      `${origin}/producto.html?id=${encodeURIComponent(p.id)}`, image, photos.slice(1, 11).join(","), brand, cats.get(p.category) || "",
    ].map(q).join(","));
  }
  return rows.join("\n") + "\n";
}

/** Sirve las páginas de la tienda con el <head> completado. Devuelve false si el archivo no existe (lo maneja el estático). */
export function createPages({ rootDir }) {
  const files = new Map(); // nombre → { key, html }
  async function read(name) {
    const full = join(rootDir, name);
    const st = await stat(full);
    const key = `${st.mtimeMs}|${st.size}`;
    const hit = files.get(name);
    if (hit && hit.key === key) return hit.html;
    const html = await readFile(full, "utf8");
    files.set(name, { key, html });
    return html;
  }
  return async function servePage(ctx) {
    const name = PAGE_FILES[ctx.pathname];
    let html;
    try { html = await read(name); } catch { return false; }
    const m = pageMeta(ctx.app.content.data, publicOrigin(ctx), name, ctx.query);
    const body = Buffer.from(injectHead(html, m), "utf8");
    const tag = `"${createHash("sha1").update(body).digest("hex").slice(0, 24)}"`;
    const headers = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      ETag: tag,
      Vary: "Accept-Encoding",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": STORE_CSP,
    };
    const inm = ctx.req.headers["if-none-match"];
    if (inm && inm.split(",").some((s) => s.trim().replace(/^W\//, "") === tag)) { sendBody(ctx, 304, "", headers); return true; }
    sendBody(ctx, 200, body, headers);
    return true;
  };
}
