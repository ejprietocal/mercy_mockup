/* ==========================================================================
   Mercy Studio · Panel — views/home.js
   Inicio (#/inicio): los bloques de la página de Inicio en el mismo orden de la tienda —
   portada (video / imagen / ninguno, textos y botón, con vista previa en vivo), franja en
   movimiento, los más vendidos, nuestro propósito + ventana "Nuestra historia", encabezado de
   reseñas y comunidad. Sección "home" (PUT /api/admin/content/home).
   También exporta ayudas que usan texts.js y discount.js (textos con acento, {descuento},
   enlaces a la tienda, índice de la página y fecha de la última modificación).
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api } from "../core/api.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import { button, canDrag, notice, pageHeader, section, toast } from "../core/ui.js";
import { dateTime, isSafeUrl, number, plural, relativeTime, siteUrl } from "../core/format.js";
import { pexelsSized } from "../core/media.js";

const REDUCE_MOTION = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Las tipografías de la tienda para las vistas previas (Kaushan Script y Lekton) las carga admin/index.html. */

/* ==========================================================================
   Ayudas compartidas (texts.js y discount.js las importan)
   ========================================================================== */

/** "Última modificación hace 5 min por Ana (9 oct 2026, 3:45 p. m.)." — o el texto de respaldo. */
export function metaSubtitle(sectionName, fallback) {
  const meta = content.sectionMeta(sectionName);
  if (!meta?.updatedAt) return fallback;
  return `Última modificación ${relativeTime(meta.updatedAt)}${meta.updatedBy ? ` por ${meta.updatedBy}` : ""} (${dateTime(meta.updatedAt)}).`;
}

/** Mantiene al día el subtítulo del encabezado después de guardar. */
export function keepMetaFresh(header, form, sectionName, fallback) {
  const el = header.querySelector(".page-subtitle");
  if (el) form.on("saved", () => { el.textContent = metaSubtitle(sectionName, fallback); });
}

/** Botón "Ver en la tienda" del encabezado (pestaña nueva). */
export function storeButton(href, label = "Ver en la tienda") {
  const b = button({ label, icon: "external", variant: "secondary", href, target: "_blank" });
  b.append(h("span.sr-only", " (se abre en una pestaña nueva)"));
  return b;
}

/** Enlace pequeño "Ver en la tienda ↗" para la columna de explicación de cada bloque. */
export function storeLink(href, label = "Ver en la tienda") {
  return h("a.ct-storelink", { href, target: "_blank", rel: "noopener" },
    h("span", label), icon("external", { size: 14 }), h("span.sr-only", " (se abre en una pestaña nueva)"));
}

/** Enlace interno del panel con flecha (p. ej. "Editar las reseñas →"). */
export function panelLink(href, label) {
  return h("a.ct-panellink", { href }, h("span", label), icon("arrow-right", { size: 14 }));
}

/**
 * Índice de la página: botones que llevan a cada bloque (no usa #anclas: el panel usa rutas hash).
 * items: [{ label, target: () => Element }]
 */
export function jumpNav(items, label = "Ir a un bloque de esta página") {
  return h("nav.ct-jump", { "aria-label": label },
    h("ul.ct-jump__list", items.map((it) => h("li", h("button.ct-jump__btn", {
      type: "button",
      onClick: () => {
        const target = it.target();
        if (!target) return;
        target.scrollIntoView({ behavior: REDUCE_MOTION ? "auto" : "smooth", block: "start" });
        const head = target.querySelector("h2");
        if (head) {
          head.setAttribute("tabindex", "-1");
          head.focus({ preventScroll: true });
        }
      },
    }, it.label)))));
}

/** Prepara un bloque section() del panel: número de orden, clase propia y enlaces al pie de la explicación. */
export function decorateSection(sec, { step, className, links = [] } = {}) {
  if (className) sec.classList.add(...className.split(" "));
  const intro = sec.querySelector(".layout-section__intro");
  if (intro && step) intro.prepend(h("span.ct-step", step));
  const desc = intro?.querySelector(".layout-section__desc");
  const ls = links.filter(Boolean);
  if (ls.length) {
    const box = h("div.ct-intro-links", ls);
    if (desc) desc.after(box);
    else intro?.append(box);
  }
  return sec;
}

/**
 * {descuento} → etiqueta del cupón de bienvenida ("15%", "$20.000"), igual que Mercy.ui.fill de la tienda:
 * sin cupón vigente el marcador desaparece sin dejar espacios dobles.
 */
export function fillDiscount(text, label) {
  const s = String(text ?? "");
  if (label) return s.replace(/\{descuento\}/g, label);
  return s.replace(/[ \t]*\{descuento\}/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Texto del contenido → nodos DOM con las convenciones de la tienda (contrato §2), sin innerHTML:
 * *palabra* → <span class="accent"> (si accent) · \n → <br> o una línea por bloque (lines).
 */
export function richNodes(text, { accent = true, lines = false } = {}) {
  const out = [];
  const rows = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  rows.forEach((line, i) => {
    const parts = [];
    let last = 0;
    if (accent) {
      line.replace(/\*([^*\n]+)\*/g, (m, word, idx) => {
        if (idx > last) parts.push(line.slice(last, idx));
        parts.push(h("span.accent", word));
        last = idx + m.length;
        return m;
      });
    }
    if (last < line.length) parts.push(line.slice(last));
    if (lines) out.push(h("span.ct-line", parts.length ? parts : " "));
    else {
      out.push(...parts);
      if (i < rows.length - 1) out.push(h("br"));
    }
  });
  return out;
}

/** Texto plano de un campo con acento (quita los asteriscos), como Mercy.ui.plain. */
export const plainText = (t) => String(t ?? "").replace(/\*([^*\n]+)\*/g, "$1").replace(/\s*\n\s*/g, " ").trim();

/**
 * Lo que ve hoy la tienda del cupón de bienvenida (GET /api/public/content, sin sesión):
 * → { label: "15%" | "", enabled: bool } o null si no se pudo consultar.
 */
export async function fetchWelcome(signal) {
  try {
    const pub = await api.get("/api/public/content", { signal, auth: false });
    const dm = pub?.discountModal || {};
    return { label: dm.welcome?.label ? String(dm.welcome.label) : "", enabled: dm.enabled !== false };
  } catch {
    return null;
  }
}

/**
 * Línea "Se verá así: …" bajo un campo que admite {descuento} (solo aparece si el texto lo usa).
 * getLabel() → etiqueta actual del cupón ("" = sin cupón vigente).
 */
export function fillHint(form, path, getLabel) {
  const out = h("span.ct-fill__text");
  const el = h("p.ct-fill", { "aria-live": "off" }, icon("eye", { size: 14 }), h("span", "Se verá así: "), out);
  const upd = () => {
    const v = String(form.get(path) ?? "");
    const uses = v.includes("{descuento}");
    el.hidden = !uses;
    if (!uses) return;
    const lbl = getLabel();
    out.textContent = fillDiscount(plainText(v), lbl) || "—";
  };
  form.on("change", ({ path: p }) => { if (!p || p === path || path.startsWith(p + ".")) upd(); });
  el.refresh = upd;
  upd();
  return el;
}

/** Inserta un elemento al final de un campo .field (debajo de su ayuda). */
export function withExtra(fieldEl, ...extra) {
  fieldEl.append(...extra.filter(Boolean));
  return fieldEl;
}

/* ==========================================================================
   Íconos de la franja (los mismos trazos de js/icons.js de la tienda)
   ========================================================================== */
const STORE_ICON_STROKE = {
  truck: '<path d="M3 6.5h10.5V16H3z"/><path d="M13.5 9.5h4.2l2.8 3.2V16h-7z"/><circle cx="7.2" cy="17.6" r="1.8"/><circle cx="17" cy="17.6" r="1.8"/>',
  heart: '<path d="M12 20.3s-7.6-4.6-7.6-10.3a4.3 4.3 0 0 1 7.6-2.7 4.3 4.3 0 0 1 7.6 2.7c0 5.7-7.6 10.3-7.6 10.3z"/>',
  shield: '<path d="M12 3l7 2.8v5.4c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13"/><path d="M12 7c-2.5 0-4-1-4-2.4S9.6 2.6 12 7zM12 7c2.5 0 4-1 4-2.4S14.4 2.6 12 7z"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.3"/>',
  cross: '<path d="M12 3v18M7 8h10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chat: '<path d="M20.5 11.6a8 8 0 0 1-11.7 7.1L4 20l1.4-4.5a8 8 0 1 1 15.1-3.9z"/>',
  ruler: '<path d="M3.5 16.5l13-13 4 4-13 13z"/><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M6.5 15h3"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4s6.3 1.8 7.2 5.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".5"/>',
};
const STORE_ICON_FILL = {
  star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/>',
  whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>',
};

/** Íconos válidos de la franja (contrato §3 IconoFranja), con su nombre para el selector. */
export const MARQUEE_ICONS = [
  ["truck", "Camión (envíos)"], ["heart", "Corazón"], ["shield", "Escudo (compra segura)"], ["star", "Estrella"],
  ["lock", "Candado (pago seguro)"], ["gift", "Regalo"], ["tag", "Etiqueta (precio)"], ["cross", "Cruz"],
  ["check", "Chulo (visto bueno)"], ["chat", "Mensaje"], ["whatsapp", "WhatsApp"], ["ruler", "Regla (tallas)"],
  ["card", "Tarjeta (pagos)"], ["user", "Persona"], ["info", "Información"],
];
const ICON_NAMES = new Set(MARQUEE_ICONS.map(([v]) => v));

/** Ícono de la tienda como <svg> (trazos propios y fijos de este archivo). */
export function storeIcon(name, size = 18) {
  const key = ICON_NAMES.has(name) ? name : "star";
  const tpl = document.createElement("template");
  tpl.innerHTML = STORE_ICON_FILL[key]
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false" class="ct-sicon">${STORE_ICON_FILL[key]}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="ct-sicon">${STORE_ICON_STROKE[key]}</svg>`;
  return tpl.content.firstChild;
}

/** Selector de ícono (select nativo accesible + vista previa del ícono elegido). */
function iconSelect(form, path) {
  return f.custom(form, path, {
    label: "Ícono",
    className: "ct-iconsel-field",
    create: ({ value, onChange, id, describedBy }) => {
      const prev = h("span.ct-iconsel__prev", { "aria-hidden": "true" });
      const sel = h("select.input.input--select.ct-iconsel__select", { id, "aria-describedby": describedBy },
        MARQUEE_ICONS.map(([v, label]) => h("option", { value: v }, label)));
      const show = (v) => {
        const k = ICON_NAMES.has(v) ? v : "star";
        if (sel.value !== k) sel.value = k;
        prev.replaceChildren(storeIcon(k, 20));
      };
      sel.addEventListener("change", () => { show(sel.value); onChange(sel.value); });
      show(value);
      return { el: h("div.ct-iconsel", prev, sel), setValue: show, focus: () => sel.focus() };
    },
  });
}

/* ==========================================================================
   Vistas previas del Inicio
   ========================================================================== */
/** Franja café con íconos y frases (vista previa de home.marquee). */
function stripItems(list, size) {
  return (list || []).filter((m) => String(m?.text || "").trim())
    .map((m) => h("span.ct-strip__item", storeIcon(m.icon, size), h("span", String(m.text).trim())));
}

/** Portada en miniatura: medio de fondo, textos, botón y franja. Se actualiza al escribir. */
function heroPreview(form) {
  const media = h("div.ct-hero__media");
  const eyebrow = h("p.ct-hero__eyebrow");
  const title = h("p.ct-hero__title");
  const sub = h("p.ct-hero__sub");
  const cta = h("span.ct-hero__cta");
  const strip = h("div.ct-hero__strip");
  const frame = h("div.ct-hero", { "aria-hidden": "true" },
    media, h("div.ct-hero__scrim"), h("div.ct-hero__inner", eyebrow, title, sub, cta), strip);

  const devices = [["desktop", "Computador"], ["phone", "Celular"]];
  const devBtns = devices.map(([id, label]) => {
    const b = h("button.ct-device__btn", { type: "button", "aria-pressed": String(id === "desktop"), onClick: () => setDevice(id) }, label);
    b.dataset.device = id;
    return b;
  });
  const setDevice = (id) => {
    frame.classList.toggle("is-phone", id === "phone");
    devBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === id)));
  };
  const status = h("p.ct-prev-cap");

  let mediaKey = null;
  function updMedia() {
    const m = form.get("hero.media") || {};
    const src = String(m.src || "").trim();
    const key = JSON.stringify([m.type, src, m.poster, m.fallbackSrc, m.fallbackPoster]);
    if (key === mediaKey) return;
    mediaKey = key;
    const ph = () => h("div.ct-hero__ph", h("span.ct-hero__mark", "FE"));
    media.replaceChildren();
    const ok = src && m.type !== "none" && isSafeUrl(src, "media");
    status.textContent = m.type === "none" ? "Fondo: degradado terracota (sin video ni imagen)."
      : !src ? (m.type === "video" ? "Aún no hay video: se ve el degradado." : "Aún no hay imagen: se ve el degradado.")
        : m.type === "video" ? "El video se reproduce sin sonido y en bucle." : "La imagen se recorta para llenar la pantalla.";
    if (!ok) { media.append(ph()); return; }
    let el;
    if (m.type === "video") {
      el = h("video.ct-hero__vid", { playsinline: true, loop: true, preload: "metadata", poster: m.poster && isSafeUrl(String(m.poster).trim(), "media") ? siteUrl(m.poster.trim()) : null });
      el.muted = true;
      el.defaultMuted = true;
      el.setAttribute("muted", "");
      el.autoplay = !REDUCE_MOTION;
      el.src = siteUrl(src);
    } else {
      el = h("img.ct-hero__img", { alt: "", decoding: "async", src: siteUrl(src) });
    }
    let triedFallback = false;
    el.addEventListener("error", () => {
      const fb = String(m.fallbackSrc || "").trim();
      if (!triedFallback && fb && isSafeUrl(fb, "media")) {
        triedFallback = true;
        if (el.tagName === "VIDEO" && m.fallbackPoster) el.poster = siteUrl(m.fallbackPoster);
        el.src = siteUrl(fb);
        if (el.tagName === "VIDEO" && !REDUCE_MOTION) el.play?.()?.catch?.(() => {});
        status.textContent = "El medio principal no cargó: se está mostrando el de respaldo.";
        return;
      }
      el.remove();
      media.append(ph());
      status.textContent = "No se pudo cargar el medio: la tienda mostrará el degradado.";
    });
    media.append(el);
    if (el.tagName === "VIDEO" && !REDUCE_MOTION) el.play?.()?.catch?.(() => {});
  }

  function updText() {
    const v = form.get("hero") || {};
    eyebrow.textContent = String(v.eyebrow || "");
    eyebrow.hidden = !eyebrow.textContent.trim();
    replace(title, richNodes(v.title, { lines: true }));
    title.hidden = !String(v.title || "").trim();
    replace(sub, richNodes(v.subtitle, { accent: false }));
    sub.hidden = !String(v.subtitle || "").trim();
    cta.textContent = String(v.ctaLabel || "").trim();
    cta.hidden = !cta.textContent;
  }

  function updStrip() {
    const items = stripItems(form.get("marquee"), 11);
    replace(strip, items, items.map((x) => x.cloneNode(true)));
    strip.hidden = !items.length;
  }

  form.on("change", ({ path }) => {
    if (!path || path === "hero" || path.startsWith("hero.media")) updMedia();
    if (!path || path.startsWith("hero")) updText();
    if (!path || path.startsWith("marquee")) updStrip();
  });
  updMedia();
  updText();
  updStrip();

  return h("div.ct-prev",
    h("div.ct-prev__bar",
      h("span.ct-prev__label", "Vista previa"),
      h("div.ct-device", { role: "group", "aria-label": "Tamaño de la vista previa" }, devBtns)),
    h("div.ct-hero-wrap", frame),
    status);
}

/** Lista de los productos que hoy salen en "Los más vendidos" (publicados, por bestRank). */
function bestSellersPreview(form, products) {
  const list = h("ol.ct-best");
  const note = h("p.ct-best__note");
  const ranked = products
    .map((p, i) => ({ p, rank: Number.isFinite(Number(p.bestRank)) && p.bestRank !== null ? Number(p.bestRank) : 1000 + i }))
    .filter((x) => x.p.status === "published")
    .sort((a, b) => a.rank - b.rank);
  const photo = (p) => {
    for (const c of p.colors || []) if (c.photos?.length) return c.photos[0].thumb || c.photos[0].src;
    return "";
  };
  const upd = () => {
    const n = Math.max(1, Math.min(12, parseInt(form.get("bestSellers.count"), 10) || 4));
    const top = ranked.slice(0, n);
    replace(list, top.map(({ p }, i) => {
      const src = photo(p);
      return h("li", h("a.ct-best__item", { href: `#/productos/${encodeURIComponent(p.id)}?tab=orden`, title: `Cambiar el puesto de «${p.name}»` },
        h("span.ct-best__pos", String(i + 1)),
        h("span.ct-best__thumb", { style: src ? null : { background: `linear-gradient(160deg, ${p.tile?.from || "#d8bea6"}, ${p.tile?.to || "#a76d4a"})` } },
          src ? h("img", { src: pexelsSized(src, 160), alt: "", loading: "lazy", decoding: "async" }) : null),
        h("span.ct-best__name", p.name),
        h("span.ct-best__rank", { title: "Puesto en Más vendidos" }, `#${number(p.bestRank ?? "—")}`)));
    }));
    note.textContent = !ranked.length
      ? "Aún no hay productos publicados: el bloque no se muestra en la tienda."
      : ranked.length < n ? `Solo hay ${plural(ranked.length, "producto publicado", "productos publicados")}: se muestran todos.` : `Así quedan hoy los ${n} primeros.`;
  };
  form.on("change", ({ path }) => { if (!path || path.startsWith("bestSellers")) upd(); });
  upd();
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Se muestran")), list, note);
}

const GOOGLE_G = '<svg xmlns="http://www.w3.org/2000/svg" class="ct-gbadge__g" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

/** Encabezado de reseñas (logo, título, estrellas y "4,9 · 320 reseñas", con coma decimal como la tienda). */
function reviewsPreview(form) {
  const t = h("span.ct-gbadge__title");
  const stars = h("span.ct-gbadge__stars");
  const score = h("span.ct-gbadge__score");
  const upd = () => {
    const rv = form.get("reviews") || {};
    const s = Math.max(0, Math.min(5, Number(rv.score) || 0));
    const c = Math.max(0, parseInt(rv.count, 10) || 0);
    t.textContent = String(rv.title || "");
    replace(stars, Array.from({ length: Math.round(s) }, () => storeIcon("star", 14)));
    stars.hidden = !s;
    score.textContent = [s ? number(s, 1) : "", c ? `${number(c)} ${c === 1 ? "reseña" : "reseñas"}` : ""].filter(Boolean).join(" · ");
    score.hidden = !score.textContent;
  };
  form.on("change", ({ path }) => { if (!path || path.startsWith("reviews")) upd(); });
  upd();
  const tpl = document.createElement("template");
  tpl.innerHTML = GOOGLE_G;
  const g = tpl.content.firstChild;
  return h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Vista previa")), h("div.ct-gbadge", { "aria-hidden": "true" }, g, t, stars, score));
}

/** Atajos para el enlace del botón: catálogo, vistas, categorías y productos publicados. */
function linkPicker(form, path, data) {
  const id = uid("ct-lp");
  const opt = (value, label) => h("option", { value }, label);
  const cats = (data.categories || []).map((c) => opt(`catalogo.html?cat=${encodeURIComponent(c.id)}`, c.name));
  const prods = (data.products || []).filter((p) => p.status === "published").map((p) => opt(`producto.html?id=${encodeURIComponent(p.id)}`, p.name));
  const sel = h("select.input.input--select.input--sm", { id },
    opt("", "Elegir una página…"),
    h("optgroup", { label: "Catálogo" },
      opt("catalogo.html", "Catálogo completo"),
      opt("catalogo.html?vista=mas-vendidos", "Los más vendidos"),
      opt("catalogo.html?vista=novedades", "Novedades")),
    cats.length ? h("optgroup", { label: "Categorías" }, cats) : null,
    prods.length ? h("optgroup", { label: "Productos" }, prods) : null);
  sel.addEventListener("change", () => {
    if (!sel.value) return;
    form.set(path, sel.value);
    sel.value = "";
  });
  return h("div.ct-linkpick", h("label.ct-linkpick__label", { for: id }, icon("link", { size: 14 }), "Atajo:"), sel);
}

/* ==========================================================================
   Vista
   ========================================================================== */
const FALLBACK_SUB = "Lo que ve la gente al entrar a la tienda: portada, frases y secciones de la página de inicio.";

export default [
  {
    path: "/inicio",
    title: "Inicio",
    async render(el, params, ctx) {
      const [value, data, welcome] = await Promise.all([
        content.section("home"),
        content.load(),
        fetchWelcome(ctx.signal),
      ]);
      const form = createForm({
        ctx,
        value,
        onSubmit: (v, { force }) => content.saveSection("home", v, { force }),
      });
      const welcomeLabel = () => welcome?.label || "";

      /* --- Portada: medio de fondo (cambia según el tipo) --- */
      const mediaSlot = h("div.stack");
      /* Póster que «acompaña» al video actual (el guardado, o el que se puso al elegir el video). Al cambiar el video,
         si el póster sigue siendo ese, es del video anterior: se reemplaza por un fotograma del nuevo (o se quita). */
      let posterOfVideo = String(form.get("hero.media.poster") || "");
      let videoNow = String(form.get("hero.media.src") || "");
      form.on("change", ({ path }) => {
        if (path) return;
        posterOfVideo = String(form.get("hero.media.poster") || ""); // tras guardar o descartar
        videoNow = String(form.get("hero.media.src") || "");
      });
      function onVideoChosen(url, item) {
        const next = String(url || "");
        if (!next || next === videoNow) return;
        videoNow = next;
        const poster = String(form.get("hero.media.poster") || "").trim();
        if (poster && poster !== posterOfVideo) return; // la persona eligió su propio póster: se respeta
        const frame = item?.thumbUrl || "";
        if (frame === poster) return;
        form.set("hero.media.poster", frame);
        posterOfVideo = frame;
        if (!poster) return;
        toast(frame
          ? "Usamos un fotograma del video nuevo como imagen mientras carga (la anterior era del otro video). Puedes cambiarla abajo."
          : "Quitamos la imagen mientras carga porque era del video anterior. Si quieres, elige una de tu video nuevo.", {
          type: "info",
          timeout: 9000,
          action: { label: "Deshacer", onClick: () => { form.set("hero.media.poster", poster); posterOfVideo = poster; } },
        });
      }
      let shownType = null;
      let prevType = form.get("hero.media.type") || "none";
      const stash = {};
      const advanced = (type) => h("details.ct-adv",
        h("summary.ct-adv__sum", icon("chevron-right", { size: 16, className: "ct-adv__chev" }), "Avanzado: ", type === "video" ? "video de respaldo" : "imagen de respaldo"),
        h("div.ct-adv__body",
          h("p.field__help", type === "video"
            ? "Se usa solo si el video principal no carga (por ejemplo, un enlace externo que dejó de funcionar). Opcional."
            : "Se usa solo si la imagen principal no carga. Opcional."),
          type === "video"
            ? [
              f.media(form, "hero.media.fallbackSrc", { label: "Video de respaldo", kind: "video", optional: true, previewBg: "dark" }),
              f.media(form, "hero.media.fallbackPoster", { label: "Póster del video de respaldo", kind: "image", optional: true, previewBg: "dark" }),
            ]
            : f.media(form, "hero.media.fallbackSrc", { label: "Imagen de respaldo", kind: "image", optional: true, previewBg: "dark" })));

      function renderMediaSlot() {
        const t = form.get("hero.media.type") || "none";
        if (t === shownType) return;
        shownType = t;
        if (t === "video") {
          replace(mediaSlot,
            f.media(form, "hero.media.src", {
              label: "Video de fondo", kind: "video", required: true, previewBg: "dark",
              help: "MP4 o WebM horizontal (16:9), sin sonido. Ideal: 10 a 20 segundos y menos de 15 MB para que cargue rápido en celulares. Se repite en bucle.",
              onChange: (url, item) => onVideoChosen(url, item),
            }),
            f.media(form, "hero.media.poster", {
              label: "Imagen mientras carga (póster)", kind: "image", optional: true, previewBg: "dark",
              help: "Se ve mientras el video carga y en celulares que no lo reproducen solos. Al subir o elegir otro video, la cambiamos por uno de sus fotogramas (si no habías puesto una tuya).",
            }),
            advanced("video"));
        } else if (t === "image") {
          replace(mediaSlot,
            f.media(form, "hero.media.src", {
              label: "Imagen de fondo", kind: "image", required: true, previewBg: "dark",
              help: "Foto horizontal de al menos 1920 px de ancho. Se recorta para llenar toda la pantalla, en computador y en celular.",
            }),
            advanced("image"));
        } else {
          replace(mediaSlot, notice({ tone: "info", message: "Sin video ni imagen: la portada usa el fondo degradado en tonos terracota con la marca de agua «FE»." }));
        }
      }

      /** Al cambiar de tipo se guarda lo elegido para ese tipo (volver atrás lo recupera) y no se mezcla un video con una imagen. */
      function switchType(next) {
        const old = prevType;
        prevType = next;
        if (old === next) return;
        stash[old] = { src: form.get("hero.media.src") || "", fallbackSrc: form.get("hero.media.fallbackSrc") || "" };
        const back = stash[next] || { src: "", fallbackSrc: "" };
        form.set("hero.media.src", back.src);
        form.set("hero.media.fallbackSrc", back.fallbackSrc);
      }

      form.on("change", ({ path }) => {
        if (!path) prevType = form.get("hero.media.type") || "none"; // tras guardar o descartar (el respaldo por tipo se conserva)
        if (!path || path === "hero.media.type" || path === "hero.media" || path === "hero") renderMediaSlot();
      });
      renderMediaSlot();

      /* --- Comunidad: avisos de {descuento} --- */
      const welcomeNote = welcome === null
        ? null
        : welcome.label && welcome.enabled
          ? notice({ tone: "info", message: `{descuento} se reemplaza por el valor del cupón de bienvenida: hoy es «${welcome.label}». El cupón y el pop-up se configuran en «Modal de descuento».`, action: button({ label: "Modal de descuento", size: "sm", href: "#/descuento" }) })
          : notice({ tone: "warning", title: "Hoy no se muestra ningún descuento", message: "El pop-up está apagado o el cupón de bienvenida no está vigente: la tienda oculta el texto destacado y el botón dice «Suscribirme». La suscripción sigue funcionando.", action: button({ label: "Modal de descuento", size: "sm", href: "#/descuento" }) });

      /* --- Reseñas visibles (para el aviso) --- */
      const visibleReviews = (data.reviews || []).filter((r) => r && r.visible !== false && (String(r.quote || "").trim() || String(r.text || "").trim())).length;

      /* --- Bloques --- */
      const header = pageHeader({
        title: "Inicio",
        breadcrumbs: [{ label: "Contenido" }],
        subtitle: metaSubtitle("home", FALLBACK_SUB),
        actions: [storeButton("../index.html")],
      });
      keepMetaFresh(header, form, "home", FALLBACK_SUB);

      const secHero = decorateSection(section({
        title: "Portada",
        description: "Lo primero que se ve, a pantalla completa: video o imagen de fondo, título, subtítulo y un botón.",
        aside: heroPreview(form),
        body: [
          f.segmented(form, "hero.media.type", {
            label: "Fondo de la portada",
            options: [{ value: "video", label: "Video", icon: "video" }, { value: "image", label: "Imagen", icon: "image" }, { value: "none", label: "Ninguno", icon: "x" }],
            help: "Si cambias de tipo, lo que habías elegido se recupera al volver (mientras no salgas de esta página).",
            onChange: (t) => switchType(t),
          }),
          mediaSlot,
          h("hr.ct-sep"),
          f.text(form, "hero.eyebrow", { label: "Texto sobre el título", maxlength: 160, recommended: 40, placeholder: "Nueva colección · Renacer", help: "Línea corta en mayúsculas pequeñas. Vacío = no se muestra." }),
          f.accentTitle(form, "hero.title", { label: "Título", multiline: true, required: true, maxlength: 160, recommended: 60 }),
          f.textarea(form, "hero.subtitle", { label: "Subtítulo", maxlength: 2000, recommended: 220, rows: 3, help: "Párrafo bajo el título. Vacío = no se muestra." }),
          f.row(
            f.text(form, "hero.ctaLabel", { label: "Texto del botón", maxlength: 40, placeholder: "Compra", help: "Vacío = sin botón." }),
            withExtra(
              f.url(form, "hero.ctaHref", { label: "Enlace del botón", kind: "link", placeholder: "catalogo.html", help: "Ej.: catalogo.html · catalogo.html?cat=hoodies · producto.html?id=fe. Vacío = catálogo." }),
              linkPicker(form, "hero.ctaHref", data)),
          ),
        ],
      }), { step: "Bloque 1 de 6", className: "ct-sec ct-sec--sticky", links: [storeLink("../index.html")] });

      const marqueeStrip = h("div.ct-strip", { "aria-hidden": "true" });
      const updMarquee = () => {
        const items = stripItems(form.get("marquee"), 16);
        replace(marqueeStrip, items.length ? items : h("span.ct-strip__empty", "Sin frases"));
      };
      form.on("change", ({ path }) => { if (!path || path.startsWith("marquee")) updMarquee(); });
      updMarquee();

      const secMarquee = decorateSection(section({
        title: "Franja en movimiento",
        description: "Cinta café que se desliza en bucle al pie de la portada, con un ícono y una frase corta por elemento. Las frases se repiten para llenar el ancho de la pantalla.",
        aside: h("div.ct-prev", h("div.ct-prev__bar", h("span.ct-prev__label", "Frases de la franja")), marqueeStrip),
        body: f.list(form, "marquee", {
          label: "Frases",
          help: canDrag() ? "Entre 1 y 10. Ordénalas con las flechas o arrastrando el asa." : "Entre 1 y 10. Ordénalas con las flechas.",
          min: 1,
          max: 10,
          addLabel: "Agregar frase",
          newItem: () => ({ icon: "star", text: "" }),
          itemLabel: (it, i) => String(it?.text || "").trim() || `Frase ${i + 1}`,
          renderItem: (p) => h("div.ct-marquee-item",
            iconSelect(form, `${p}.icon`),
            f.text(form, `${p}.text`, { label: "Texto", required: true, maxlength: 80, recommended: 32, placeholder: "Envíos a todo el país" })),
        }),
      }), { step: "Bloque 2 de 6", className: "ct-sec", links: [storeLink("../index.html")] });

      const secBest = decorateSection(section({
        title: "Los más vendidos",
        description: "Fila de productos destacados debajo de la portada. El orden sale del campo «Puesto en Más vendidos» de cada producto (el número menor va primero). Toca un producto de la lista para cambiar su puesto.",
        aside: bestSellersPreview(form, data.products || []),
        body: [
          f.row(
            f.text(form, "bestSellers.eyebrow", { label: "Texto sobre el título", maxlength: 160, placeholder: "Los favoritos", help: "Vacío = no se muestra." }),
            f.text(form, "bestSellers.title", { label: "Título", maxlength: 160, placeholder: "Los más vendidos" }),
          ),
          f.row(
            f.number(form, "bestSellers.count", { label: "Cantidad de productos", required: true, min: 1, max: 12, integer: true, help: "Entre 1 y 12." }),
            f.text(form, "bestSellers.ctaLabel", { label: "Texto del botón «Ver todo»", maxlength: 40, placeholder: "Ver todo", help: "Abre el catálogo en «Más vendidos». Vacío = sin botón." }),
          ),
          notice({ tone: "info", message: "¿Quieres cambiar qué productos salen o en qué orden? Ajusta «Puesto en Más vendidos» en la pestaña «Orden y reseñas» de cada producto.", action: button({ label: "Ver productos por puesto", size: "sm", href: "#/productos?orden=mas-vendidos" }) }),
        ],
      }), { step: "Bloque 3 de 6", className: "ct-sec", links: [storeLink("../index.html#favoritos")] });

      const secPurpose = decorateSection(section({
        title: "Nuestro propósito",
        description: "Bloque oscuro con el mensaje de la marca. Su botón abre la ventana «Nuestra historia» con el mismo texto, una cita y un botón al catálogo.",
        body: [
          f.text(form, "purpose.eyebrow", { label: "Texto sobre el título", maxlength: 160, placeholder: "Nuestro propósito", help: "Vacío = no se muestra." }),
          f.accentTitle(form, "purpose.title", { label: "Título", multiline: true, maxlength: 160 }),
          f.textarea(form, "purpose.text", { label: "Texto", maxlength: 2000, recommended: 450, rows: 4, help: "También es el primer párrafo de la ventana «Nuestra historia»." }),
          f.text(form, "purpose.buttonLabel", { label: "Texto del botón", maxlength: 40, placeholder: "Conoce la historia", help: "Abre la ventana «Nuestra historia». Vacío = sin botón ni ventana." }),
          h("div.ct-subhead", h("h3.ct-subhead__title", "Ventana «Nuestra historia»"), h("p.ct-subhead__desc", "Se abre al tocar el botón de arriba.")),
          f.text(form, "purpose.storyTitle", { label: "Título de la ventana", maxlength: 160, placeholder: "Nuestra historia", help: "Vacío = usa el texto del botón." }),
          f.accentTitle(form, "purpose.storyQuote", { label: "Cita destacada", multiline: true, maxlength: 300 }),
          f.text(form, "purpose.storyCtaLabel", { label: "Texto del botón al catálogo", maxlength: 40, placeholder: "Conoce la colección", help: "Lleva a catalogo.html. Vacío = sin botón." }),
        ],
      }), { step: "Bloque 4 de 6", className: "ct-sec", links: [storeLink("../index.html#proposito")] });

      const secReviews = decorateSection(section({
        title: "Encabezado de reseñas",
        description: "Título, estrellas y cantidad que se ven sobre las tarjetas de opiniones. Las estrellas se redondean al entero más cercano.",
        aside: reviewsPreview(form),
        body: [
          f.text(form, "reviews.title", { label: "Título", maxlength: 160, placeholder: "Reseñas de Google", help: "Aparece junto al logo de Google." }),
          f.row(
            f.number(form, "reviews.score", { label: "Puntaje promedio", required: true, min: 0, max: 5, step: 0.1, integer: false, suffix: "de 5", help: "Entre 0 y 5, con un decimal (p. ej. 4,9).", validate: (v) => (Math.round(v * 10) / 10 !== v ? "Usa máximo un decimal (p. ej. 4,9)." : null) }),
            f.number(form, "reviews.count", { label: "Cantidad de reseñas", required: true, min: 0, max: 10000000, integer: true, help: "Total de opiniones en Google." }),
          ),
          visibleReviews
            ? notice({ tone: "info", message: `Las tarjetas con las opiniones se editan en «Reseñas». Hoy hay ${plural(visibleReviews, "reseña visible", "reseñas visibles")}.`, action: button({ label: "Editar las reseñas", size: "sm", href: "#/resenas" }) })
            : notice({ tone: "warning", title: "No hay reseñas visibles", message: "Mientras no haya al menos una reseña visible, la tienda oculta este bloque completo.", action: button({ label: "Ir a Reseñas", size: "sm", href: "#/resenas" }) }),
        ],
      }), { step: "Bloque 5 de 6", className: "ct-sec", links: [storeLink("../index.html#resenas")] });

      const discountTip = "Escribe {descuento} donde quieras mostrar el valor del cupón de bienvenida.";
      const secCommunity = decorateSection(section({
        title: "Comunidad",
        description: "Bloque de suscripción antes del pie de página: la persona deja su correo y recibe el cupón de bienvenida.",
        body: [
          welcomeNote,
          f.accentTitle(form, "community.title", { label: "Título", multiline: true, maxlength: 160, discount: true, discountLabel: welcomeLabel() || "15%" }),
          f.text(form, "community.subtitle", { label: "Subtítulo", maxlength: 300, placeholder: "Tu camino de fe comienza aquí." }),
          withExtra(
            f.text(form, "community.highlight", { label: "Texto destacado del descuento", maxlength: 300, help: `En negrita, después del subtítulo. Solo se muestra si hay un descuento vigente. ${discountTip}` }),
            fillHint(form, "community.highlight", welcomeLabel)),
          f.row(
            f.text(form, "community.placeholder", { label: "Texto dentro del campo de correo", maxlength: 120, placeholder: "Introduce tu correo electrónico" }),
            withExtra(
              f.text(form, "community.buttonLabel", { label: "Texto del botón", maxlength: 60, help: "Si no hay descuento vigente y usa {descuento}, dice «Suscribirme»." }),
              fillHint(form, "community.buttonLabel", welcomeLabel)),
          ),
          f.textarea(form, "community.fine", { label: "Letra pequeña", maxlength: 500, rows: 2, help: "Debajo del formulario (aviso de privacidad)." }),
          h("div.ct-subhead", h("h3.ct-subhead__title", "Después de suscribirse"), h("p.ct-subhead__desc", "Reemplaza el formulario cuando la persona deja su correo; debajo se muestra el código del cupón para copiarlo.")),
          withExtra(
            f.text(form, "community.doneTitle", { label: "Título de confirmación", maxlength: 160, placeholder: "¡Bienvenido a Mercy!", help: "Admite *palabra* (cursiva de marca) y {descuento}." }),
            fillHint(form, "community.doneTitle", welcomeLabel)),
          f.row(
            withExtra(
              f.text(form, "community.doneMsg", { label: "Mensaje", maxlength: 300, placeholder: "Ya está aplicado a tu carrito" }),
              fillHint(form, "community.doneMsg", welcomeLabel)),
            f.text(form, "community.doneCtaLabel", { label: "Texto del botón", maxlength: 60, placeholder: "Seguir comprando", help: "Vacío = sin botón." }),
          ),
        ],
      }), { step: "Bloque 6 de 6", className: "ct-sec", links: [storeLink("../index.html#comunidad")] });

      const blocks = [
        ["Portada", secHero], ["Franja", secMarquee], ["Más vendidos", secBest],
        ["Propósito", secPurpose], ["Reseñas", secReviews], ["Comunidad", secCommunity],
      ];
      el.append(h("div.page.page--form.ct-page",
        header,
        jumpNav(blocks.map(([label, sec]) => ({ label, target: () => sec }))),
        blocks.map(([, sec]) => sec)));
    },
  },
];
