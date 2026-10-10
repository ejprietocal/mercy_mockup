/* ==========================================================================
   Mercy Studio — server/lib/validate.js
   Normalizadores ESTRICTOS (contrato §2 y §3). Cada uno:
   · construye un objeto NUEVO solo con las claves conocidas (descarta lo demás),
   · valida tipos, rangos, longitudes, slugs, hex, URLs seguras y referencias,
   · devuelve { value, fields } donde fields = { "colors.1.photos": "Máximo 4 fotos por color." }.
   Clave ausente → valor por defecto del campo; tipo incorrecto → error.
   ========================================================================== */
import { isPlainObject, newId, slugify } from "./util.js";

/* ---------- Constantes del contrato ---------- */
export const SECTIONS = ["settings", "home", "discountModal", "texts", "colors", "fits", "categories", "collections", "sizeCharts", "reviews"];
export const SECTION_NAMES = {
  settings: "Ajustes generales",
  home: "Inicio",
  discountModal: "Modal de descuento",
  texts: "Textos del sitio",
  colors: "Colores",
  fits: "Hormas",
  categories: "Categorías",
  collections: "Colecciones",
  sizeCharts: "Guía de tallas",
  reviews: "Reseñas",
};
export const MARQUEE_ICONS = ["truck", "heart", "shield", "star", "lock", "gift", "tag", "cross", "check", "chat", "whatsapp", "ruler", "card", "user", "info"];
export const MAX_PHOTOS_PER_COLOR = 4;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,30}$/;
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
const SIZE_RE = /^[\p{L}\p{N}][\p{L}\p{N} ./+-]{0,11}$/u;
const PCT_RE = /^(\d{1,3})(\.\d+)?%$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/* ---------- URLs seguras (§2) ---------- */
const BAD_URL_CHARS = /[\s"'<>\\`\u0000-\u001f\u007f]/;
const SITE_FILE_RE = /^\/?(?:uploads|assets)\/[^?#]+(?:[?#].*)?$/;
const PAGE_RE = /^\/?(?:index|catalogo|producto|checkout)\.html(?:[?#].*)?$/;

/**
 * kind: "external" (solo http/https: redes sociales) · "media" (http/https o archivos del sitio /uploads, /assets)
 *       "link" (además páginas del sitio y anclas #…).
 */
export function isSafeUrl(s, kind = "link") {
  if (typeof s !== "string" || !s || s.length > 2048 || BAD_URL_CHARS.test(s)) return false;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
    } catch {
      return false;
    }
  }
  if (kind === "external") return false;
  if (SITE_FILE_RE.test(s)) return !s.split(/[?#]/)[0].split("/").some((p) => p === ".." || p === ".");
  if (kind === "media") return false;
  return PAGE_RE.test(s) || s.startsWith("#");
}
const URL_MSG = {
  external: "Usa una dirección completa que empiece por https://",
  media: "Usa una URL https://… o un archivo de la biblioteca de medios (/uploads/…).",
  link: "Usa una URL https://…, una página del sitio (p. ej. catalogo.html) o un ancla (#…).",
};

/* ---------- Contexto de validación ---------- */
const J = (base, key) => (base === "" ? String(key) : `${base}.${key}`);
const fmtNum = (n) => (Math.abs(n) >= 10000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : String(n));

class Ctx {
  constructor() { this.fields = {}; }
  add(path, msg) {
    const k = path || "_";
    if (!(k in this.fields)) this.fields[k] = msg;
  }
  get ok() { return Object.keys(this.fields).length === 0; }

  obj(path, v) {
    if (v === undefined || v === null) return {};
    if (!isPlainObject(v)) { this.add(path, "Formato inválido (se esperaba un objeto)."); return {}; }
    return v;
  }

  text(path, v, { max = 160, required = false, multiline = false, def = "" } = {}) {
    if (v === undefined || v === null) v = def;
    if (typeof v === "number" && Number.isFinite(v)) v = String(v);
    if (typeof v !== "string") { this.add(path, "Debe ser un texto."); return def; }
    let s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\t/g, " ");
    s = multiline
      ? s.split("\n").map((l) => l.trimEnd()).join("\n").trim().replace(/\n{3,}/g, "\n\n")
      : s.replace(/\n+/g, " ").trim();
    const len = [...s].length;
    if (required && !s) this.add(path, "Este campo es obligatorio.");
    else if (len > max) this.add(path, `Máximo ${max} caracteres (tiene ${len}).`);
    return s;
  }

  /** Lista de textos: descarta los vacíos y luego valida mínimo/máximo. */
  textList(path, v, { min = 0, max = 20, itemMax = 160, multiline = false } = {}) {
    if (v === undefined || v === null) v = [];
    if (!Array.isArray(v)) { this.add(path, "Formato inválido (se esperaba una lista)."); return []; }
    const out = [];
    v.slice(0, max * 2 + 10).forEach((x, i) => {
      const s = this.text(J(path, i), x, { max: itemMax, multiline });
      if (s) out.push(s);
    });
    if (out.length > max) this.add(path, `Máximo ${max} elementos.`);
    else if (out.length < min) this.add(path, min === 1 ? "Agrega al menos un elemento." : `Agrega al menos ${min} elementos.`);
    return out.slice(0, max);
  }

  int(path, v, { min = 0, max = 1_000_000_000, def = min, nullable = false } = {}) {
    if (v === undefined) return def;
    if (v === null || v === "") {
      if (nullable) return null;
      this.add(path, "Escribe un número.");
      return def;
    }
    let n = v;
    if (typeof n === "string" && /^\s*-?\d+\s*$/.test(n)) n = Number(n);
    if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
      this.add(path, "Debe ser un número entero.");
      return def;
    }
    if (n < min || n > max) {
      this.add(path, max >= 1_000_000_000 ? `Debe ser un número entero mayor o igual a ${fmtNum(min)}.` : `Debe ser un número entero entre ${fmtNum(min)} y ${fmtNum(max)}.`);
    }
    return n;
  }

  num(path, v, { min = 0, max = 1_000_000, def = min, nullable = false, decimals = 2 } = {}) {
    if (v === undefined) return def;
    if (v === null || v === "") {
      if (nullable) return null;
      this.add(path, "Escribe un número.");
      return def;
    }
    let n = v;
    if (typeof n === "string" && /^\s*-?\d+([.,]\d+)?\s*$/.test(n)) n = Number(n.replace(",", "."));
    if (typeof n !== "number" || !Number.isFinite(n)) { this.add(path, "Debe ser un número."); return def; }
    const f = 10 ** decimals;
    n = Math.round(n * f) / f;
    if (n < min || n > max) this.add(path, `Debe ser un número entre ${fmtNum(min)} y ${fmtNum(max)}.`);
    return n;
  }

  bool(path, v, def = false) {
    if (v === undefined || v === null) return def;
    if (typeof v !== "boolean") { this.add(path, "Debe ser verdadero o falso."); return def; }
    return v;
  }

  oneOf(path, v, options, def) {
    if (v === undefined || v === null || v === "") return def;
    if (!options.includes(v)) { this.add(path, "Valor no permitido."); return def; }
    return v;
  }

  url(path, v, { kind = "media", required = false } = {}) {
    if (v === undefined || v === null) v = "";
    if (typeof v !== "string") { this.add(path, "Debe ser una URL."); return ""; }
    const s = v.trim();
    if (!s) {
      if (required) this.add(path, kind === "media" ? "Elige un archivo o pega una URL." : "Este campo es obligatorio.");
      return "";
    }
    if (!isSafeUrl(s, kind)) this.add(path, URL_MSG[kind]);
    return s;
  }

  slug(path, v, { required = true } = {}) {
    if (v === undefined || v === null) v = "";
    if (typeof v !== "string") { this.add(path, "Debe ser un texto."); return ""; }
    const s = v.trim().toLowerCase();
    if (!s) { if (required) this.add(path, "Este campo es obligatorio."); return ""; }
    if (s.length > 60 || !SLUG_RE.test(s)) this.add(path, "Usa solo letras minúsculas sin tildes, números y guiones (máx. 60 caracteres).");
    return s;
  }

  hex(path, v, def) {
    if ((v === undefined || v === null || v === "") && def !== undefined) return def;
    if (typeof v !== "string" || !HEX_RE.test(v.trim())) {
      this.add(path, "Usa un color hexadecimal de 6 dígitos, p. ej. #bb3f17.");
      return def || "#000000";
    }
    return v.trim().toLowerCase();
  }

  list(path, v, { min = 0, max = 50, item, maxMsg, minMsg } = {}) {
    if (v === undefined || v === null) v = [];
    if (!Array.isArray(v)) { this.add(path, "Formato inválido (se esperaba una lista)."); return []; }
    if (v.length > max) this.add(path, maxMsg || `Máximo ${max} elementos.`);
    else if (v.length < min) this.add(path, minMsg || (min === 1 ? "Agrega al menos un elemento." : `Agrega al menos ${min} elementos.`));
    return v.slice(0, max).map((x, i) => item(J(path, i), x, i));
  }

  uniqueBy(path, arr, key, msg = "Este id está repetido en la lista.") {
    const seen = new Set();
    arr.forEach((x, i) => {
      const k = x?.[key];
      if (k === "" || k == null) return;
      if (seen.has(k)) this.add(J(J(path, i), key), msg);
      else seen.add(k);
    });
  }

  date(path, v) {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string") { this.add(path, "Usa una fecha AAAA-MM-DD."); return null; }
    const s = v.trim().slice(0, 10);
    const m = DATE_RE.exec(s);
    if (!m) { this.add(path, "Usa una fecha AAAA-MM-DD."); return null; }
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
      this.add(path, "La fecha no existe.");
      return null;
    }
    return s;
  }
}

const result = (c, value) => ({ value, fields: c.fields });

/* ---------- Referencias ---------- */
/** Conjuntos de ids existentes (para validar referencias). `coupons` = códigos (opcional). */
export function refsFrom(content, coupons) {
  const ids = (list) => new Set((list || []).map((x) => x.id));
  return {
    colors: ids(content?.colors),
    fits: ids(content?.fits),
    categories: ids(content?.categories),
    collections: ids(content?.collections),
    sizeCharts: ids(content?.sizeCharts),
    products: ids(content?.products),
    coupons: coupons ? new Set(coupons.map((x) => x.code)) : undefined,
  };
}

/* ---------- Secciones ---------- */
function vSettings(c, v) {
  const o = c.obj("", v);
  const social = c.obj("social", o.social);
  const logo = c.obj("logo", o.logo);
  const seo = c.obj("seo", o.seo);
  let whatsapp = o.whatsapp;
  if (typeof whatsapp === "number") whatsapp = String(whatsapp);
  if (typeof whatsapp !== "string" || !/^[\d\s+().-]*$/.test(whatsapp) || !/^\d{8,15}$/.test(whatsapp.replace(/\D/g, ""))) {
    c.add("whatsapp", "Escribe el número con indicativo, solo dígitos (8 a 15). Ej.: 573001234567.");
    whatsapp = typeof whatsapp === "string" ? whatsapp.replace(/\D/g, "") : "";
  } else whatsapp = whatsapp.replace(/\D/g, "");
  return {
    brand: c.text("brand", o.brand, { max: 60, required: true }),
    whatsapp,
    whatsappDisplay: c.text("whatsappDisplay", o.whatsappDisplay, { max: 30 }),
    whatsappGreeting: c.text("whatsappGreeting", o.whatsappGreeting, { max: 300, multiline: true }),
    social: {
      instagram: c.url("social.instagram", social.instagram, { kind: "external" }),
      tiktok: c.url("social.tiktok", social.tiktok, { kind: "external" }),
      facebook: c.url("social.facebook", social.facebook, { kind: "external" }),
    },
    logo: {
      terracota: c.url("logo.terracota", logo.terracota, { required: true }),
      beige: c.url("logo.beige", logo.beige, { required: true }),
      oscuro: c.url("logo.oscuro", logo.oscuro, { required: true }),
    },
    seo: {
      title: c.text("seo.title", seo.title, { max: 160, required: true }),
      description: c.text("seo.description", seo.description, { max: 320 }),
    },
    giftMaxChars: c.int("giftMaxChars", o.giftMaxChars, { min: 20, max: 1000, def: 180 }),
    pageSize: c.int("pageSize", o.pageSize, { min: 2, max: 48, def: 6 }),
    showPhotos: c.bool("showPhotos", o.showPhotos, true),
    showAdminLink: c.bool("showAdminLink", o.showAdminLink, true),
    paymentMethods: vPaymentMethods(c, o.paymentMethods),
    metaPixelId: pixelId(c, o.metaPixelId),
  };
}

/** Identificador del píxel de Meta: vacío (la tienda no carga nada) o solo dígitos. */
function pixelId(c, v) {
  const s = c.text("metaPixelId", v, { max: 20 });
  if (s && !/^\d{5,20}$/.test(s)) c.add("metaPixelId", "Escribe solo los números del identificador del píxel (entre 5 y 20 dígitos).");
  return s;
}

/** Medios de pago del checkout (settings.paymentMethods): 1–8, id único, nombre obligatorio, logo conocido o ninguno. */
const PAYMENT_LOGOS = ["nequi", "breb", "bancolombia", "none"];
function vPaymentMethods(c, v) {
  if (v === undefined) {
    // Contenido anterior a este campo: se completa con los medios de siempre (ver también Content#init)
    return [
      { id: "nequi", name: "Nequi", hint: "Transferencia desde la app Nequi", logo: "nequi" },
      { id: "breb", name: "Bre-B", hint: "Transferencia con llave Bre-B", logo: "breb" },
      { id: "bancolombia", name: "Bancolombia Ahorros", hint: "Transferencia a cuenta de ahorros", logo: "bancolombia" },
    ];
  }
  const out = c.list("paymentMethods", v, {
    min: 1, max: 8, minMsg: "Agrega al menos un medio de pago.",
    item: (p, x, i) => {
      const o = c.obj(p, x);
      // Sin id (medio nuevo creado en el panel): se deriva del nombre
      const rawId = typeof o.id === "string" && o.id.trim() ? o.id : slugify(String(o.name || "")) || `pago-${i + 1}`;
      return {
        id: c.slug(J(p, "id"), rawId),
        name: c.text(J(p, "name"), o.name, { max: 40, required: true }),
        hint: c.text(J(p, "hint"), o.hint, { max: 120 }),
        logo: c.oneOf(J(p, "logo"), o.logo, PAYMENT_LOGOS, "none"),
      };
    },
  });
  c.uniqueBy("paymentMethods", out, "id");
  return out;
}

function vHome(c, v) {
  const o = c.obj("", v);
  const hero = c.obj("hero", o.hero);
  const media = c.obj("hero.media", hero.media);
  const type = c.oneOf("hero.media.type", media.type, ["video", "image", "none"], "none");
  const bs = c.obj("bestSellers", o.bestSellers);
  const pu = c.obj("purpose", o.purpose);
  const rv = c.obj("reviews", o.reviews);
  const cm = c.obj("community", o.community);
  return {
    hero: {
      media: {
        type,
        src: c.url("hero.media.src", media.src, { required: type !== "none" }),
        poster: c.url("hero.media.poster", media.poster),
        fallbackSrc: c.url("hero.media.fallbackSrc", media.fallbackSrc),
        fallbackPoster: c.url("hero.media.fallbackPoster", media.fallbackPoster),
      },
      eyebrow: c.text("hero.eyebrow", hero.eyebrow),
      title: c.text("hero.title", hero.title, { required: true, multiline: true }),
      subtitle: c.text("hero.subtitle", hero.subtitle, { max: 2000, multiline: true }),
      ctaLabel: c.text("hero.ctaLabel", hero.ctaLabel, { max: 40 }),
      ctaHref: c.url("hero.ctaHref", hero.ctaHref, { kind: "link" }),
    },
    marquee: c.list("marquee", o.marquee, {
      min: 1,
      max: 10,
      item: (p, x) => {
        const m = c.obj(p, x);
        return { icon: c.oneOf(J(p, "icon"), m.icon, MARQUEE_ICONS, "star"), text: c.text(J(p, "text"), m.text, { max: 80, required: true }) };
      },
    }),
    bestSellers: {
      eyebrow: c.text("bestSellers.eyebrow", bs.eyebrow),
      title: c.text("bestSellers.title", bs.title),
      count: c.int("bestSellers.count", bs.count, { min: 1, max: 12, def: 4 }),
      ctaLabel: c.text("bestSellers.ctaLabel", bs.ctaLabel, { max: 40 }),
    },
    purpose: {
      eyebrow: c.text("purpose.eyebrow", pu.eyebrow),
      title: c.text("purpose.title", pu.title, { multiline: true }),
      text: c.text("purpose.text", pu.text, { max: 2000, multiline: true }),
      buttonLabel: c.text("purpose.buttonLabel", pu.buttonLabel, { max: 40 }),
      storyTitle: c.text("purpose.storyTitle", pu.storyTitle),
      storyQuote: c.text("purpose.storyQuote", pu.storyQuote, { max: 300, multiline: true }),
      storyCtaLabel: c.text("purpose.storyCtaLabel", pu.storyCtaLabel, { max: 40 }),
    },
    reviews: {
      title: c.text("reviews.title", rv.title),
      score: c.num("reviews.score", rv.score, { min: 0, max: 5, def: 5, decimals: 1 }),
      count: c.int("reviews.count", rv.count, { min: 0, max: 10_000_000, def: 0 }),
    },
    community: {
      title: c.text("community.title", cm.title, { multiline: true }),
      subtitle: c.text("community.subtitle", cm.subtitle, { max: 300 }),
      highlight: c.text("community.highlight", cm.highlight, { max: 300 }),
      placeholder: c.text("community.placeholder", cm.placeholder, { max: 120 }),
      buttonLabel: c.text("community.buttonLabel", cm.buttonLabel, { max: 60 }),
      fine: c.text("community.fine", cm.fine, { max: 500, multiline: true }),
      doneTitle: c.text("community.doneTitle", cm.doneTitle),
      doneMsg: c.text("community.doneMsg", cm.doneMsg, { max: 300 }),
      doneCtaLabel: c.text("community.doneCtaLabel", cm.doneCtaLabel, { max: 60 }),
    },
  };
}

function vDiscountModal(c, v, refs) {
  const o = c.obj("", v);
  let code = o.couponCode;
  if (code === undefined || code === null) code = "";
  if (typeof code !== "string") { c.add("couponCode", "Debe ser un texto."); code = ""; }
  code = code.trim().toUpperCase();
  if (code && !COUPON_CODE_RE.test(code)) c.add("couponCode", "Código inválido.");
  else if (code && refs?.coupons && !refs.coupons.has(code)) c.add("couponCode", "Ese cupón no existe. Créalo primero en Cupones.");
  return {
    enabled: c.bool("enabled", o.enabled, true),
    autoOpen: c.bool("autoOpen", o.autoOpen, true),
    delayMs: c.int("delayMs", o.delayMs, { min: 0, max: 60000, def: 3500 }),
    showOnCartOpen: c.bool("showOnCartOpen", o.showOnCartOpen, true),
    image: c.url("image", o.image),
    title: c.text("title", o.title, { multiline: true }),
    offerText: c.text("offerText", o.offerText, { max: 300 }),
    placeholder: c.text("placeholder", o.placeholder, { max: 120 }),
    buttonLabel: c.text("buttonLabel", o.buttonLabel, { max: 60 }),
    fine: c.text("fine", o.fine, { max: 500, multiline: true }),
    successTitle: c.text("successTitle", o.successTitle),
    successOffer: c.text("successOffer", o.successOffer, { max: 300 }),
    successFine: c.text("successFine", o.successFine, { max: 500, multiline: true }),
    successButton: c.text("successButton", o.successButton, { max: 60 }),
    couponCode: code,
  };
}

function vTexts(c, v) {
  const o = c.obj("", v);
  const cat = c.obj("catalog", o.catalog);
  const menu = c.obj("menu", o.menu), help = c.obj("help", o.help), search = c.obj("search", o.search);
  const fav = c.obj("favorites", o.favorites), cart = c.obj("cart", o.cart), ship = c.obj("shipping", o.shipping);
  const prod = c.obj("product", o.product), co = c.obj("checkout", o.checkout), sub = c.obj("subscribe", o.subscribe);
  // Textos de interfaz (etiquetas, avisos, estados vacíos): vacío = la tienda usa el texto de fábrica (js/defaults.js)
  const t = (path, val, max = 160) => c.text(path, val, { max });
  const tm = (path, val, max = 500) => c.text(path, val, { max, multiline: true });
  return {
    topStrip: c.textList("topStrip", o.topStrip, { min: 1, max: 6, itemMax: 80 }),
    footerTagline: c.text("footerTagline", o.footerTagline),
    footerLegal: c.text("footerLegal", o.footerLegal, { max: 200 }),
    searchSuggestions: c.textList("searchSuggestions", o.searchSuggestions, { max: 10, itemMax: 40 }),
    shippingInfo: c.text("shippingInfo", o.shippingInfo, { max: 2000, multiline: true }),
    returnsInfo: c.text("returnsInfo", o.returnsInfo, { max: 2000, multiline: true }),
    care: c.textList("care", o.care, { max: 12, itemMax: 300 }),
    sizeGuideNote: c.text("sizeGuideNote", o.sizeGuideNote, { max: 500, multiline: true }),
    catalog: {
      eyebrow: c.text("catalog.eyebrow", cat.eyebrow),
      allTitle: c.text("catalog.allTitle", cat.allTitle),
      subtitle: c.text("catalog.subtitle", cat.subtitle, { max: 300 }),
      bestTitle: c.text("catalog.bestTitle", cat.bestTitle),
      newTitle: c.text("catalog.newTitle", cat.newTitle),
      metaDescription: t("catalog.metaDescription", cat.metaDescription, 320),
      loadMore: t("catalog.loadMore", cat.loadMore, 60),
      seeAll: t("catalog.seeAll", cat.seeAll, 60),
      similarTitle: t("catalog.similarTitle", cat.similarTitle),
      similarText: t("catalog.similarText", cat.similarText, 300),
      similarSearchText: t("catalog.similarSearchText", cat.similarSearchText, 300),
      emptyFiltersTitle: t("catalog.emptyFiltersTitle", cat.emptyFiltersTitle),
      emptyFiltersText: t("catalog.emptyFiltersText", cat.emptyFiltersText, 300),
      emptySearchTitle: t("catalog.emptySearchTitle", cat.emptySearchTitle),
      emptySearchText: t("catalog.emptySearchText", cat.emptySearchText, 300),
    },
    menu: { title: t("menu.title", menu.title, 40), allLabel: t("menu.allLabel", menu.allLabel, 60), whatsappLabel: t("menu.whatsappLabel", menu.whatsappLabel, 60) },
    help: { sizeGuide: t("help.sizeGuide", help.sizeGuide, 60), shipping: t("help.shipping", help.shipping, 60), returns: t("help.returns", help.returns, 60) },
    footerShopTitle: t("footerShopTitle", o.footerShopTitle, 40),
    footerHelpTitle: t("footerHelpTitle", o.footerHelpTitle, 40),
    footerFollowTitle: t("footerFollowTitle", o.footerFollowTitle, 40),
    search: {
      placeholder: t("search.placeholder", search.placeholder, 80),
      suggestionsTitle: t("search.suggestionsTitle", search.suggestionsTitle, 60),
      topTitle: t("search.topTitle", search.topTitle, 60),
      emptyText: t("search.emptyText", search.emptyText, 300),
      similarTitle: t("search.similarTitle", search.similarTitle, 60),
      maybeTitle: t("search.maybeTitle", search.maybeTitle, 60),
    },
    favorites: {
      title: t("favorites.title", fav.title, 60),
      subtitle: t("favorites.subtitle", fav.subtitle, 300),
      emptyTitle: t("favorites.emptyTitle", fav.emptyTitle),
      emptyText: t("favorites.emptyText", fav.emptyText, 300),
      emptyCta: t("favorites.emptyCta", fav.emptyCta, 40),
    },
    cart: {
      title: t("cart.title", cart.title, 60),
      emptyTitle: t("cart.emptyTitle", cart.emptyTitle),
      emptyText: t("cart.emptyText", cart.emptyText, 300),
      emptyCta: t("cart.emptyCta", cart.emptyCta, 40),
      note: t("cart.note", cart.note, 300),
      checkoutLabel: t("cart.checkoutLabel", cart.checkoutLabel, 40),
      continueLabel: t("cart.continueLabel", cart.continueLabel, 40),
    },
    shipping: {
      badge: t("shipping.badge", ship.badge, 40),
      lineFree: t("shipping.lineFree", ship.lineFree, 60),
      cartFree: t("shipping.cartFree", ship.cartFree),
      cartPaid: t("shipping.cartPaid", ship.cartPaid),
      productFree: t("shipping.productFree", ship.productFree),
      productPaid: t("shipping.productPaid", ship.productPaid),
      detailFree: t("shipping.detailFree", ship.detailFree, 300),
      detailPaid: t("shipping.detailPaid", ship.detailPaid, 300),
      ruleFree: t("shipping.ruleFree", ship.ruleFree, 300),
      rulePaid: t("shipping.rulePaid", ship.rulePaid, 300),
      method: t("shipping.method", ship.method, 60),
      time: t("shipping.time", ship.time, 60),
      coordination: t("shipping.coordination", ship.coordination, 80),
      checkoutFree: t("shipping.checkoutFree", ship.checkoutFree, 40),
      checkoutPaid: t("shipping.checkoutPaid", ship.checkoutPaid, 40),
      checkoutPaidNote: t("shipping.checkoutPaidNote", ship.checkoutPaidNote),
      pending: t("shipping.pending", ship.pending, 60),
    },
    product: {
      collectionLabel: t("product.collectionLabel", prod.collectionLabel, 40),
      stockIn: t("product.stockIn", prod.stockIn, 80),
      stockOut: t("product.stockOut", prod.stockOut, 80),
      lowStockOne: t("product.lowStockOne", prod.lowStockOne, 80),
      lowStockMany: t("product.lowStockMany", prod.lowStockMany, 80),
      videoChip: t("product.videoChip", prod.videoChip, 40),
      videoSoonTitle: t("product.videoSoonTitle", prod.videoSoonTitle, 80),
      videoSoonText: t("product.videoSoonText", prod.videoSoonText, 300),
      detailsTitle: t("product.detailsTitle", prod.detailsTitle, 60),
      careTitle: t("product.careTitle", prod.careTitle, 60),
      sizesTitle: t("product.sizesTitle", prod.sizesTitle, 60),
      sizeGuideLink: t("product.sizeGuideLink", prod.sizeGuideLink, 80),
      detailsEmpty: t("product.detailsEmpty", prod.detailsEmpty, 300),
      careEmpty: t("product.careEmpty", prod.careEmpty, 300),
      storyTitle: t("product.storyTitle", prod.storyTitle, 80),
      reviewsTitle: t("product.reviewsTitle", prod.reviewsTitle, 80),
      reviewsSource: t("product.reviewsSource", prod.reviewsSource, 60),
      verifiedLabel: t("product.verifiedLabel", prod.verifiedLabel, 60),
      relatedTitle: t("product.relatedTitle", prod.relatedTitle, 80),
      metaSuffix: t("product.metaSuffix", prod.metaSuffix, 200),
    },
    checkout: {
      metaDescription: t("checkout.metaDescription", co.metaDescription, 320),
      strip: t("checkout.strip", co.strip, 80),
      title: t("checkout.title", co.title, 80),
      subtitle: t("checkout.subtitle", co.subtitle),
      emptyTitle: t("checkout.emptyTitle", co.emptyTitle),
      emptyText: t("checkout.emptyText", co.emptyText, 300),
      emptyCta: t("checkout.emptyCta", co.emptyCta, 40),
      successTitle: t("checkout.successTitle", co.successTitle, 80),
      successText: tm("checkout.successText", co.successText),
      successHome: t("checkout.successHome", co.successHome, 40),
      successCta: t("checkout.successCta", co.successCta, 40),
      shipTitle: t("checkout.shipTitle", co.shipTitle, 60),
      note: tm("checkout.note", co.note),
      giftTitle: t("checkout.giftTitle", co.giftTitle, 60),
      giftHint: t("checkout.giftHint", co.giftHint),
      giftLabel: t("checkout.giftLabel", co.giftLabel, 60),
      giftPlaceholder: t("checkout.giftPlaceholder", co.giftPlaceholder),
      payTitle: t("checkout.payTitle", co.payTitle, 60),
      payLead: t("checkout.payLead", co.payLead),
      payHint: tm("checkout.payHint", co.payHint),
      confirmLabel: t("checkout.confirmLabel", co.confirmLabel, 60),
      confirmHelp: t("checkout.confirmHelp", co.confirmHelp, 300),
      previewTitle: t("checkout.previewTitle", co.previewTitle, 80),
      previewText: tm("checkout.previewText", co.previewText),
      openLabel: t("checkout.openLabel", co.openLabel, 40),
      copyLabel: t("checkout.copyLabel", co.copyLabel, 40),
      afterOpenText: t("checkout.afterOpenText", co.afterOpenText, 300),
      waIntro: t("checkout.waIntro", co.waIntro),
      waClosing: tm("checkout.waClosing", co.waClosing, 300),
      noCodeCta: t("checkout.noCodeCta", co.noCodeCta),
    },
    subscribe: {
      thanks: t("subscribe.thanks", sub.thanks, 300),
      codeHint: t("subscribe.codeHint", sub.codeHint, 300),
      popupCodeHint: t("subscribe.popupCodeHint", sub.popupCodeHint),
      appliedToast: t("subscribe.appliedToast", sub.appliedToast),
      subscribeLabel: t("subscribe.subscribeLabel", sub.subscribeLabel, 40),
    },
    whatsappFabText: t("whatsappFabText", o.whatsappFabText, 120),
  };
}

function idList(c, v, { min = 0, max, item }) {
  const out = c.list("", v, { min, max, item });
  c.uniqueBy("", out, "id");
  return out;
}

function vColors(c, v) {
  return idList(c, v, {
    min: 1,
    max: 60,
    item: (p, x) => {
      const o = c.obj(p, x);
      return { id: c.slug(J(p, "id"), o.id), name: c.text(J(p, "name"), o.name, { max: 40, required: true }), hex: c.hex(J(p, "hex"), o.hex) };
    },
  });
}

function vFits(c, v) {
  return idList(c, v, {
    max: 20,
    item: (p, x) => {
      const o = c.obj(p, x);
      return { id: c.slug(J(p, "id"), o.id), name: c.text(J(p, "name"), o.name, { max: 40, required: true }) };
    },
  });
}

function vCategories(c, v, refs) {
  return idList(c, v, {
    min: 1,
    max: 30,
    item: (p, x) => {
      const o = c.obj(p, x);
      let chart = o.sizeChart ?? "";
      if (typeof chart !== "string") { c.add(J(p, "sizeChart"), "Debe ser un texto."); chart = ""; }
      chart = chart.trim();
      if (chart && refs?.sizeCharts && !refs.sizeCharts.has(chart)) c.add(J(p, "sizeChart"), "Esa guía de tallas no existe.");
      return {
        id: c.slug(J(p, "id"), o.id),
        name: c.text(J(p, "name"), o.name, { max: 40, required: true }),
        details: c.textList(J(p, "details"), o.details, { max: 20, itemMax: 300 }),
        sizeChart: chart,
        inFooter: c.bool(J(p, "inFooter"), o.inFooter, true),
      };
    },
  });
}

function vCollections(c, v) {
  return idList(c, v, {
    max: 40,
    item: (p, x) => {
      const o = c.obj(p, x);
      return {
        id: c.slug(J(p, "id"), o.id),
        name: c.text(J(p, "name"), o.name, { max: 60, required: true }),
        description: c.text(J(p, "description"), o.description, { max: 2000, multiline: true }),
      };
    },
  });
}

function vSizeRow(c, p, row, cols) {
  if (!Array.isArray(row)) { c.add(p, "Cada fila debe ser una lista de valores."); return []; }
  if (row.length !== cols) c.add(p, `Cada fila debe tener ${cols} columnas.`);
  const out = [];
  for (let i = 0; i < cols; i++) {
    const cell = row[i];
    const cp = J(p, i);
    if (i === 0) { out.push(c.text(cp, cell, { max: 12, required: true })); continue; }
    if (typeof cell === "number") out.push(c.num(cp, cell, { min: 0, max: 10000, decimals: 1 }));
    else out.push(c.text(cp, cell ?? "", { max: 12 }));
  }
  return out;
}

function vSizeCharts(c, v, refs) {
  return idList(c, v, {
    max: 30,
    item: (p, x) => {
      const o = c.obj(p, x);
      const head = c.textList(J(p, "head"), o.head, { min: 2, max: 8, itemMax: 30 });
      const rowsIn = c.obj(J(p, "rows"), o.rows);
      const rows = {};
      for (const k of Object.keys(rowsIn)) {
        const rp = J(J(p, "rows"), k);
        if (!SLUG_RE.test(k) || (refs?.fits && !refs.fits.has(k))) { c.add(rp, `La horma «${k}» no existe.`); continue; }
        rows[k] = c.list(rp, rowsIn[k], { max: 30, item: (q, row) => vSizeRow(c, q, row, head.length) });
      }
      return {
        id: c.slug(J(p, "id"), o.id),
        name: c.text(J(p, "name"), o.name, { max: 60, required: true }),
        head,
        unit: c.text(J(p, "unit"), o.unit, { max: 10, def: "cm" }),   // "" = sin unidad (solo falta la clave → "cm")
        rows,
      };
    },
  });
}

function vReviews(c, v) {
  return idList(c, v, {
    max: 60,
    item: (p, x) => {
      const o = c.obj(p, x);
      const id = o.id === undefined || o.id === null || o.id === "" ? newId("r-") : o.id;
      return {
        id: c.slug(J(p, "id"), id),
        name: c.text(J(p, "name"), o.name, { max: 60, required: true }),
        city: c.text(J(p, "city"), o.city, { max: 60 }),
        stars: c.int(J(p, "stars"), o.stars, { min: 1, max: 5, def: 5 }),
        quote: c.text(J(p, "quote"), o.quote, { max: 300, multiline: true }),
        text: c.text(J(p, "text"), o.text, { max: 2000, multiline: true }),
        visible: c.bool(J(p, "visible"), o.visible, true),
      };
    },
  });
}

const SECTION_VALIDATORS = {
  settings: vSettings,
  home: vHome,
  discountModal: vDiscountModal,
  texts: vTexts,
  colors: vColors,
  fits: vFits,
  categories: vCategories,
  collections: vCollections,
  sizeCharts: vSizeCharts,
  reviews: vReviews,
};

/** Valida una sección. refs = refsFrom(contenido actual, cupones). */
export function validateSection(section, value, refs) {
  const fn = SECTION_VALIDATORS[section];
  if (!fn) throw new Error("Sección desconocida: " + section);
  const c = new Ctx();
  const out = fn(c, value, refs);
  return result(c, out);
}

/* ---------- Productos ---------- */
function vPhoto(c, p, x) {
  const o = c.obj(p, x);
  const pct = (k) => {
    const v = o[k];
    if (v === undefined || v === null || v === "") return null;
    const m = typeof v === "string" ? PCT_RE.exec(v.trim()) : null;
    if (!m || Number(m[1] + (m[2] || "")) > 100) { c.add(J(p, k), "Usa un porcentaje entre 0% y 100%."); return null; }
    return v.trim();
  };
  return {
    src: c.url(J(p, "src"), o.src, { required: true }),
    thumb: c.url(J(p, "thumb"), o.thumb),
    alt: c.text(J(p, "alt"), o.alt),
    zoom: c.num(J(p, "zoom"), o.zoom, { min: 1, max: 5, def: null, nullable: true, decimals: 2 }),
    ox: pct("ox"),
    oy: pct("oy"),
  };
}

function vTile(c, v) {
  const o = c.obj("tile", v);
  // Sin líneas se guarda [] (no una copia del nombre): la tienda y el panel muestran el nombre ACTUAL del producto
  const lines = c.textList("tile.lines", o.lines, { max: 4, itemMax: 30 });
  return {
    from: c.hex("tile.from", o.from, "#d8bea6"),
    to: c.hex("tile.to", o.to, "#a76d4a"),
    lines,
    sub: c.text("tile.sub", o.sub, { max: 60 }),
    stacked: c.bool("tile.stacked", o.stacked, false),
    small: c.bool("tile.small", o.small, false),
    fs: c.int("tile.fs", o.fs, { min: 6, max: 40, def: null, nullable: true }),
  };
}

/** Valida un producto completo. refs = refsFrom(contenido). No toca createdAt/updatedAt/updatedBy. */
export function validateProduct(value, refs) {
  const c = new Ctx();
  const o = c.obj("", value);
  const name = c.text("name", o.name, { max: 120, required: true });

  // Tallas: únicas, 1–12
  const sizes = c.list("sizes", o.sizes, {
    min: 1,
    max: 12,
    item: (p, x) => {
      const s = c.text(p, x, { max: 12, required: true });
      if (s && !SIZE_RE.test(s)) c.add(p, "Usa letras o números (p. ej. S, XL, Única, 10-12).");
      return s;
    },
  });
  sizes.forEach((s, i) => { if (s && sizes.indexOf(s) !== i) c.add(`sizes.${i}`, "Talla repetida."); });

  const category = c.slug("category", o.category);
  if (category && refs?.categories && !refs.categories.has(category)) c.add("category", "Esa categoría no existe.");

  let collection = o.collection ?? "";
  if (typeof collection !== "string") { c.add("collection", "Debe ser un texto."); collection = ""; }
  collection = collection.trim();
  if (collection && refs?.collections && !refs.collections.has(collection)) c.add("collection", "Esa colección no existe.");

  const fits = c.list("fits", o.fits, {
    max: 20,
    item: (p, x) => {
      const f = c.slug(p, x);
      if (f && refs?.fits && !refs.fits.has(f)) c.add(p, "Esa horma no existe.");
      return f;
    },
  });
  fits.forEach((f, i) => { if (fits.indexOf(f) !== i) c.add(`fits.${i}`, "Horma repetida."); });

  const colors = c.list("colors", o.colors, {
    min: 1,
    max: 12,
    minMsg: "Agrega al menos un color.",
    maxMsg: "Máximo 12 colores por producto.",
    item: (p, x) => {
      const pc = c.obj(p, x);
      const color = c.slug(J(p, "color"), pc.color);
      if (color && refs?.colors && !refs.colors.has(color)) c.add(J(p, "color"), "Ese color no existe en la paleta.");
      const photos = c.list(J(p, "photos"), pc.photos, {
        max: MAX_PHOTOS_PER_COLOR,
        maxMsg: `Máximo ${MAX_PHOTOS_PER_COLOR} fotos por color.`,
        item: (q, ph) => vPhoto(c, q, ph),
      });
      // Stock: exactamente las tallas del producto (faltantes = 0, sobrantes se eliminan)
      let stockIn = pc.stock;
      if (stockIn === undefined || stockIn === null) stockIn = {};
      if (!isPlainObject(stockIn)) { c.add(J(p, "stock"), "Formato inválido (se esperaba un objeto)."); stockIn = {}; }
      const stock = {};
      for (const s of sizes) {
        if (!s) continue;
        const raw = Object.hasOwn(stockIn, s) ? stockIn[s] : 0;
        stock[s] = c.int(`${p}.stock.${s}`, raw ?? 0, { min: 0, max: 100000, def: 0 });
      }
      return { color, photos, stock };
    },
  });
  c.uniqueBy("colors", colors, "color", "Este color ya está en el producto.");

  const prints = c.list("prints", o.prints, {
    max: 12,
    item: (p, x) => {
      const pr = c.obj(p, x);
      return { id: c.slug(J(p, "id"), pr.id), name: c.text(J(p, "name"), pr.name, { max: 40, required: true }), hex: c.hex(J(p, "hex"), pr.hex) };
    },
  });
  c.uniqueBy("prints", prints, "id");

  let video = null;
  if (o.video !== undefined && o.video !== null) {
    const vo = c.obj("video", o.video);
    const src = c.url("video.src", vo.src);
    if (src) video = { src, poster: c.url("video.poster", vo.poster) };
  }

  const id = c.slug("id", o.id);
  const value2 = {
    id,
    ref: c.text("ref", o.ref, { max: 30 }),
    name,
    status: c.oneOf("status", o.status, ["published", "draft"], "draft"),
    category,
    collection,
    fits,
    sizes,
    price: c.int("price", o.price, { min: 0, max: 100_000_000, def: 0 }),
    badge: c.text("badge", o.badge, { max: 20 }),
    envioGratis: c.bool("envioGratis", o.envioGratis, false),
    soldOut: c.bool("soldOut", o.soldOut, false),
    bestRank: c.int("bestRank", o.bestRank, { min: 0, max: 9999, def: 999 }),
    newRank: c.int("newRank", o.newRank, { min: 0, max: 9999, def: 999 }),
    rating: c.num("rating", o.rating, { min: 0, max: 5, def: 0, decimals: 1 }),
    reviewsCount: c.int("reviewsCount", o.reviewsCount, { min: 0, max: 10_000_000, def: 0 }),
    colors,
    prints,
    video,
    tile: vTile(c, o.tile),
    tags: c.textList("tags", o.tags, { max: 30, itemMax: 40 }),
    desc: c.text("desc", o.desc, { max: 2000, multiline: true }),
    story: c.text("story", o.story, { max: 2000, multiline: true }),
    details: c.textList("details", o.details, { max: 20, itemMax: 300 }),
    care: c.textList("care", o.care, { max: 12, itemMax: 300 }),
  };
  const formerIds = formerIdsOf(o.formerIds, id);
  if (formerIds.length) value2.formerIds = formerIds;
  return result(c, value2);
}

/**
 * Ids anteriores de un producto (renombres). Los gestiona el SERVIDOR (ContentService); aquí solo se limpian
 * sin marcar errores: slugs válidos, sin repetir, sin el id actual, máx. MAX_FORMER_IDS (los más recientes al final).
 * La clave solo existe si hay alguno (los productos de siempre no cambian).
 */
export const MAX_FORMER_IDS = 10;
export function formerIdsOf(list, id) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    const s = typeof x === "string" ? x.trim().toLowerCase() : "";
    if (!s || s === id || s.length > 60 || !SLUG_RE.test(s)) continue;
    const i = out.indexOf(s);
    if (i !== -1) out.splice(i, 1);
    out.push(s);
  }
  return out.slice(-MAX_FORMER_IDS);
}

/* ---------- Contenido completo (siembra / restauración) ---------- */
const CONTENT_ORDER = ["settings", "home", "discountModal", "texts", "colors", "fits", "categories", "collections", "sizeCharts", "reviews"];
const VALIDATION_ORDER = ["settings", "home", "texts", "colors", "fits", "collections", "sizeCharts", "categories", "reviews", "discountModal"];

/** Valida TODO el contenido (las referencias se resuelven contra el propio contenido). */
export function validateContent(raw, { couponCodes } = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const fields = {};
  const refs = { colors: new Set(), fits: new Set(), categories: new Set(), collections: new Set(), sizeCharts: new Set(), coupons: couponCodes };
  const sections = {};
  for (const s of VALIDATION_ORDER) {
    const r = validateSection(s, src[s], refs);
    for (const [k, m] of Object.entries(r.fields)) fields[`${s}.${k}`] = m;
    sections[s] = r.value;
    if (refs[s] instanceof Set) refs[s] = new Set(r.value.map((x) => x.id));
  }
  const products = [];
  const seen = new Set();
  (Array.isArray(src.products) ? src.products : []).forEach((p, i) => {
    const r = validateProduct(p, refs);
    for (const [k, m] of Object.entries(r.fields)) fields[`products.${i}.${k}`] = m;
    if (seen.has(r.value.id)) fields[`products.${i}.id`] = "Este id está repetido en la lista.";
    seen.add(r.value.id);
    const meta = isPlainObject(p) ? p : {};
    products.push({
      ...r.value,
      createdAt: typeof meta.createdAt === "string" ? meta.createdAt : null,
      updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : null,
      updatedBy: typeof meta.updatedBy === "string" ? meta.updatedBy : "",
    });
  });
  const meta = isPlainObject(src.meta) ? src.meta : {};
  const value = {
    schemaVersion: 1,
    meta: {
      updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : null,
      updatedBy: typeof meta.updatedBy === "string" ? meta.updatedBy : "",
      sections: isPlainObject(meta.sections) ? meta.sections : {},
    },
  };
  for (const s of CONTENT_ORDER) value[s] = sections[s];
  value.products = products;
  return { value, fields };
}

/* ---------- Cupones ---------- */
/** refs = refsFrom(contenido). Devuelve el cupón sin id/fechas/usesCount (los pone el servicio). */
export function validateCoupon(value, refs) {
  const c = new Ctx();
  const o = c.obj("", value);
  let code = o.code;
  if (typeof code !== "string") code = code == null ? "" : String(code);
  code = code.trim().toUpperCase();
  if (!code) c.add("code", "Este campo es obligatorio.");
  else if (!COUPON_CODE_RE.test(code)) c.add("code", "Usa de 3 a 30 caracteres: letras sin tildes, números, guion o guion bajo.");
  const type = c.oneOf("type", o.type, ["percent", "fixed"], "percent");
  const value2 = type === "percent"
    ? c.int("value", o.value, { min: 1, max: 100, def: 10 })
    : c.int("value", o.value, { min: 1, max: 100_000_000, def: 10000 });
  const startsAt = c.date("startsAt", o.startsAt);
  const endsAt = c.date("endsAt", o.endsAt);
  if (startsAt && endsAt && endsAt < startsAt) c.add("endsAt", "La fecha final debe ser igual o posterior a la inicial.");
  const appliesTo = c.oneOf("appliesTo", o.appliesTo, ["all", "categories", "products"], "all");
  const idsOf = (key, set, missingMsg) => {
    const out = c.list(key, o[key], {
      max: 200,
      item: (p, x) => {
        const id = c.slug(p, x);
        if (id && set && !set.has(id)) c.add(p, missingMsg);
        return id;
      },
    });
    return [...new Set(out)];
  };
  let categoryIds = idsOf("categoryIds", refs?.categories, "Esa categoría no existe.");
  let productIds = idsOf("productIds", refs?.products, "Ese producto no existe.");
  const active = c.bool("active", o.active, true);
  // Solo un cupón ACTIVO exige al menos un id: uno inactivo puede quedar sin productos (p. ej. se borró su único
  // producto y el servidor lo desactivó) y se puede seguir guardando; para activarlo hay que elegir alguno.
  if (active && appliesTo === "categories" && !categoryIds.length) c.add("categoryIds", "Elige al menos una categoría.");
  if (active && appliesTo === "products" && !productIds.length) c.add("productIds", "Elige al menos un producto.");
  if (appliesTo !== "categories") categoryIds = [];
  if (appliesTo !== "products") productIds = [];
  let maxUses = o.maxUses;
  maxUses = maxUses === undefined || maxUses === null || maxUses === "" ? null : c.int("maxUses", maxUses, { min: 1, max: 100_000_000, def: null });
  return result(c, {
    code,
    description: c.text("description", o.description),
    type,
    value: value2,
    active,
    startsAt,
    endsAt,
    minSubtotal: c.int("minSubtotal", o.minSubtotal, { min: 0, max: 100_000_000, def: 0 }),
    maxUses,
    appliesTo,
    categoryIds,
    productIds,
  });
}

/* ---------- Usuarios ---------- */
export function normalizeEmail(v) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export function validEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

/** opts.requirePassword: obligatorio al crear. `password` vacío = no cambiar. */
export function validateUser(value, { requirePassword = false, partial = false } = {}) {
  const c = new Ctx();
  const o = c.obj("", value);
  const email = normalizeEmail(o.email);
  if (!email) c.add("email", "Este campo es obligatorio.");
  else if (!validEmail(email)) c.add("email", "Escribe un correo válido.");
  const out = {
    name: c.text("name", o.name, { max: 80, required: true }),
    email,
  };
  if (!partial) {
    out.role = c.oneOf("role", o.role, ["admin", "editor"], "editor");
    out.active = c.bool("active", o.active, true);
    const pw = o.password;
    if (pw !== undefined && pw !== null && pw !== "") {
      const e = passwordError(pw);
      if (e) c.add("password", e);
      else out.password = pw;
    } else if (requirePassword) c.add("password", "Escribe una contraseña de al menos 10 caracteres.");
  }
  return result(c, out);
}

export function passwordError(pw) {
  if (typeof pw !== "string") return "La contraseña debe ser un texto.";
  if ([...pw].length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (pw.length > 200) return "La contraseña es demasiado larga (máx. 200 caracteres).";
  if (!pw.trim()) return "La contraseña no puede ser solo espacios.";
  return null;
}
