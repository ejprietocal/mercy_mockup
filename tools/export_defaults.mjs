// HISTÓRICO — generó la PRIMERA versión de js/defaults.js (contenido de fábrica, esquema de docs/ADMIN-CONTRATO.md §3)
// a partir del mockup original (js/config.js + js/data.js + textos fijos de index.html / layout.js).
// Uso único, ya ejecutado sobre el commit 3ffef8f. NO lo vuelvas a ejecutar para regenerar js/defaults.js: desde entonces
// ese archivo se edita a mano (textos de interfaz, medios de pago, píxel de Meta…) y esto lo sobrescribiría con la versión
// del mockup. Los js/config.js y js/data.js actuales ya no sirven de entrada (derivan de defaults.js), por eso pide las dos rutas.
// Se conserva como referencia de cómo se armó el contenido inicial; sigue el esquema vigente (hasta 10 fotos por color,
// estampados tal cual y fotos por combinación color + estampado si la entrada las trajera).
//   git show 3ffef8f:js/config.js > /tmp/c.js; git show 3ffef8f:js/data.js > /tmp/d.js; node tools/export_defaults.mjs /tmp/c.js /tmp/d.js
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cfgPath, dataPath] = process.argv.slice(2);
if (!cfgPath || !dataPath) {
  console.error("Uso: node tools/export_defaults.mjs <config.js del mockup original> <data.js del mockup original>\n" +
    "Herramienta histórica: sobrescribe js/defaults.js (ver el comentario al inicio del archivo).");
  process.exit(1);
}

const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(cfgPath, "utf8"), sandbox);
vm.runInContext(readFileSync(dataPath, "utf8"), sandbox);
const C = sandbox.Mercy.config;
const D = sandbox.Mercy.data;
if (!C || !D || !D.PRODUCTS) throw new Error("No se pudo leer Mercy.config / Mercy.data del mockup original");

const STAMP = "2026-10-09T00:00:00.000Z";
const MAX_PHOTOS = 10;   // por color base y por combinación color + estampado (MAX_PHOTOS_PER_COLOR / _PER_PRINT del servidor)
const BY = "Sistema";
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const pexels = (id) => "https://images.pexels.com/photos/" + id + "/pexels-photo-" + id + ".jpeg";
const photo = (e) => (typeof e === "object"
  ? { src: pexels(e.id), thumb: "", alt: "", zoom: e.zoom, ox: e.ox || "50%", oy: e.oy || "50%" }
  : { src: pexels(e), thumb: "", alt: "", zoom: null, ox: null, oy: null });

/* Color que corresponde a la prenda de cada foto de vista previa (las demás usan las del primer color con fotos). */
const PHOTO_COLOR = {
  gracia: "terracota", fe: "crema", "salmo-23": "negro", renacer: "verde", esperanza: "crema", amen: "negro",
  "jesus-es-el-camino": "negro", paz: "negro", misericordia: "crema", luz: "crema", gloria: "ladrillo",
  "gorra-proposito": "crema", "manilla-fe": "negro"
};
/* Tote: foto 1 = tote crema, foto 2 = tote negro, foto 3 = detalle del crema */
const PHOTO_SPLIT = { "tote-mercy": { crema: [0, 2], negro: [1] } };

const collections = [];
D.PRODUCTS.forEach((p) => {
  if (p.collection && !collections.some((c) => c.name === p.collection)) collections.push({ id: slug(p.collection), name: p.collection, description: "" });
});
const collectionId = (name) => (collections.find((c) => c.name === name) || {}).id || "";

const SIZE_CHART_NAMES = { camisetas: "Camisetas", blusas: "Blusas", hoodies: "Hoodies" };

const products = D.PRODUCTS.map((p) => {
  const split = PHOTO_SPLIT[p.id];
  const prints = (p.prints || []).map((x) => ({ id: x.id, name: x.name, hex: x.hex.toLowerCase() }));
  const colors = p.colors.map((c) => {
    let photos = [];
    if (split) photos = (split[c] || []).map((i) => p.photos[i]).filter(Boolean).slice(0, MAX_PHOTOS).map(photo);
    else if (PHOTO_COLOR[p.id] === c || (!PHOTO_COLOR[p.id] && c === p.colors[0])) photos = p.photos.slice(0, MAX_PHOTOS).map(photo);
    /* Fotos por combinación color + estampado ({ [color]: { [estampado]: [entradas] } }), igual que el servidor: solo estampados
       de la prenda, en su orden, sin listas vacías; sin ninguna, la clave no existe. El mockup original no trae ninguna. */
    const own = (p.printPhotos && p.printPhotos[c]) || {};
    const printPhotos = {};
    prints.forEach((x) => {
      const list = (Array.isArray(own[x.id]) ? own[x.id] : []).filter(Boolean).slice(0, MAX_PHOTOS).map(photo);
      if (list.length) printPhotos[x.id] = list;
    });
    const stock = {};
    p.sizes.forEach((s) => { stock[s] = D.stockOf(p, c, s); });
    return Object.keys(printPhotos).length ? { color: c, photos, printPhotos, stock } : { color: c, photos, stock };
  });
  const t = p.tile || {};
  return {
    id: p.id, ref: p.ref, name: p.name, status: "published",
    category: p.category, collection: collectionId(p.collection),
    fits: p.fits.slice(), sizes: p.sizes.slice(),
    price: p.price, badge: p.badge || "", envioGratis: !!p.envioGratis,
    soldOut: p.id === "amen",
    bestRank: p.bestRank, newRank: p.newRank, rating: p.rating, reviewsCount: p.reviews,
    colors,
    prints,
    video: null,
    tile: { from: t.from, to: t.to, lines: t.lines.slice(), sub: t.sub || "", stacked: !!t.stacked, small: !!t.small, fs: t.fs || null },
    tags: (p.tags || []).slice(), desc: p.desc || "", story: p.story || "",
    details: [], care: [],
    createdAt: STAMP, updatedAt: STAMP, updatedBy: BY
  };
});

const DETAILS = {};
D.PRODUCTS.forEach((p) => { if (!DETAILS[p.category]) DETAILS[p.category] = p.details.slice(); });

const content = {
  schemaVersion: 1,
  meta: { updatedAt: STAMP, updatedBy: BY, sections: {} },
  settings: {
    brand: C.brand,
    whatsapp: C.whatsapp,
    whatsappDisplay: C.whatsappDisplay,
    whatsappGreeting: "Hola Mercy Studio 👋",
    social: { instagram: C.social.instagram, tiktok: C.social.tiktok, facebook: C.social.facebook },
    logo: { terracota: C.logo.terracota, beige: C.logo.beige, oscuro: C.logo.oscuro },
    seo: {
      title: "Mercy Studio — Viste con propósito",
      description: "Mercy Studio: prendas con propósito. Cada diseño cuenta una historia de fe, identidad y esperanza. Envíos a todo el país."
    },
    giftMaxChars: C.giftMaxChars,
    pageSize: C.pageSize,
    showPhotos: !!C.stockPhotos,
    showAdminLink: true
  },
  home: {
    hero: {
      media: {
        type: C.heroMedia.type || "none",
        src: C.heroMedia.src || "",
        poster: C.heroMedia.poster || "",
        fallbackSrc: (C.heroMedia.fallback && C.heroMedia.fallback.src) || "",
        fallbackPoster: (C.heroMedia.fallback && C.heroMedia.fallback.poster) || ""
      },
      eyebrow: "Nueva colección · Renacer",
      title: "Lo que crees,\nahora lo *vistes*",
      subtitle: "Prendas con propósito. Cada diseño cuenta una historia de fe, identidad y esperanza — pensadas para que tu mensaje también se lleve puesto.",
      ctaLabel: "Compra",
      ctaHref: "catalogo.html"
    },
    marquee: D.MARQUEE.map((m) => ({ icon: m.icon, text: m.text })),
    bestSellers: { eyebrow: "Los favoritos", title: "Los más vendidos", count: 4, ctaLabel: "Ver todo" },
    purpose: {
      eyebrow: "Nuestro propósito",
      title: "Más que una prenda, un mensaje que *llevas puesto*",
      text: "Mercy Studio existe para usar la moda como un medio para comunicar la Palabra de Dios, expresar nuestra fe de manera auténtica y creativa, y llevar el mensaje de Cristo a más personas. Creamos prendas con propósito, recordando que Mercy es el medio; Cristo es siempre el centro.",
      buttonLabel: "Conoce la historia",
      storyTitle: "Nuestra historia",
      storyQuote: "La moda es el medio. Cristo es el mensaje",
      storyCtaLabel: "Conoce la colección"
    },
    reviews: { title: "Reseñas de Google", score: 4.9, count: 320 },
    community: {
      title: "Sé parte de nuestra *comunidad* Mercy",
      subtitle: "Tu camino de fe comienza aquí.",
      highlight: "Obtén un {descuento} de descuento en tu primer pedido.",
      placeholder: "Introduce tu correo electrónico",
      buttonLabel: "Obtén un {descuento} de descuento",
      fine: "Al registrarte aceptas recibir novedades de Mercy Studio. Puedes darte de baja cuando quieras.",
      doneTitle: "¡Bienvenido a Mercy!",
      doneMsg: "Ya está aplicado a tu carrito",
      doneCtaLabel: "Seguir comprando"
    }
  },
  discountModal: {
    enabled: true,
    autoOpen: true,
    delayMs: C.discountPopupDelay,
    showOnCartOpen: C.discountOnCartOpen !== false,
    image: C.discountImage || "",
    title: "Tu camino de *fe* comienza aquí",
    offerText: "Obtén un {descuento} de descuento en tu primer pedido",
    placeholder: "Introduce tu correo electrónico",
    buttonLabel: "Obtén un {descuento} de descuento",
    fine: "Al registrarte aceptas recibir novedades de Mercy Studio. Puedes darte de baja cuando quieras.",
    successTitle: "¡Bienvenido a Mercy!",
    successOffer: "Tu código de {descuento} ya está aplicado",
    successFine: "Se descuenta automáticamente en tu primer pedido.",
    successButton: "Seguir mirando",
    couponCode: C.discount.code
  },
  texts: {
    topStrip: ["Viste con propósito", "Envíos a toda Colombia", "Compra segura"],
    footerTagline: "La moda es el medio. Cristo es el mensaje",
    footerLegal: "© 2026 Mercy Studio · Hecho con propósito en Colombia",
    searchSuggestions: ["Camisetas", "Hoodies", "Oversize", "Terracota", "JECVV"],
    shippingInfo: D.SHIPPING_INFO,
    returnsInfo: D.RETURNS_INFO,
    care: D.PRODUCTS[0].care.slice(),
    sizeGuideNote: "Medidas de la prenda en centímetros, tomadas en plano. Pueden variar ±1 cm. (Valores de ejemplo.)",
    catalog: {
      eyebrow: "Catálogo",
      allTitle: "Toda la *Colección*",
      subtitle: "Fe, propósito y misericordia",
      bestTitle: "Los más vendidos",
      newTitle: "Novedades"
    }
  },
  colors: Object.keys(D.COLORS).map((k) => ({ id: D.COLORS[k].id, name: D.COLORS[k].name, hex: D.COLORS[k].hex.toLowerCase() })),
  fits: Object.keys(D.FITS).map((k) => ({ id: k, name: D.FITS[k] })),
  categories: D.CATEGORIES.map((c) => ({
    id: c.id, name: c.name, details: DETAILS[c.id] || [], sizeChart: D.SIZE_CHARTS[c.id] ? c.id : "", inFooter: c.id !== "gorras"
  })),
  collections,
  sizeCharts: Object.keys(D.SIZE_CHARTS).map((k) => {
    const ch = D.SIZE_CHARTS[k];
    const rows = {};
    Object.keys(ch).filter((f) => f !== "head").forEach((f) => { rows[f] = ch[f].map((r) => r.slice()); });
    return { id: k, name: SIZE_CHART_NAMES[k] || k, head: ch.head.slice(), unit: "cm", rows };
  }),
  reviews: D.REVIEWS.map((r, i) => ({ id: "r" + (i + 1), name: r.name, city: r.city, stars: r.stars, quote: r.quote, text: r.text, visible: true })),
  products
};

const coupons = [{
  id: "c-mercy15", code: C.discount.code, description: "15 % en el primer pedido (pop-up de bienvenida)",
  type: "percent", value: C.discount.percent, active: true, startsAt: null, endsAt: null,
  minSubtotal: 0, maxUses: null, usesCount: 0, appliesTo: "all", categoryIds: [], productIds: [],
  createdAt: STAMP, updatedAt: STAMP, createdBy: BY
}];

/* --- Impresión legible: objetos en varias líneas, listas de primitivos en una sola ------------- */
const ID = /^[A-Za-z_$][\w$]*$/;
function fmt(v, ind) {
  const pad = "  ".repeat(ind), pad1 = "  ".repeat(ind + 1);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    /* lista de primitivos -> una línea; cualquier otra -> un elemento por línea */
    if (v.every((x) => x === null || typeof x !== "object")) return "[" + v.map((x) => fmt(x, 0)).join(", ") + "]";
    return "[\n" + v.map((x) => pad1 + fmt(x, ind + 1)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(v);
  if (!keys.length) return "{}";
  const k = (key) => (ID.test(key) ? key : JSON.stringify(key));
  const simple = keys.every((key) => v[key] === null || typeof v[key] !== "object");
  if (simple) {
    const one = "{ " + keys.map((key) => k(key) + ": " + fmt(v[key], 0)).join(", ") + " }";
    if (one.length + pad.length < 190) return one;
  }
  return "{\n" + keys.map((key) => pad1 + k(key) + ": " + fmt(v[key], ind + 1)).join(",\n") + "\n" + pad + "}";
}

const out =
`/* ==========================================================================
   Mercy Studio — defaults.js
   Contenido DE FÁBRICA del sitio (esquema: docs/ADMIN-CONTRATO.md §3).
   · La tienda lo usa cuando no hay servidor (abrir index.html con doble clic).
   · El servidor lo usa para crear data/content.json y data/coupons.json la primera vez.
   Con el servidor en marcha, el contenido real se edita desde el panel (/admin), NO aquí.
   Generado por tools/export_defaults.mjs a partir del mockup original. Precios, stock y textos = DATOS DE EJEMPLO.
   ========================================================================== */
window.Mercy = window.Mercy || {};

Mercy.DEFAULT_CONTENT = ${fmt(content, 0)};

Mercy.DEFAULT_COUPONS = ${fmt(coupons, 0)};
`;
writeFileSync(resolve(ROOT, "js/defaults.js"), out);
console.log("js/defaults.js:", out.length, "bytes ·", products.length, "productos ·", collections.length, "colecciones");
