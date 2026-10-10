/* ==========================================================================
   Mercy Studio · Panel — core/media.js
   Medios (contrato §3 Medios y §4.3):
   · subirArchivo(file, { onProgress, kind }) → item de la biblioteca.
       Imágenes > 2000 px se reducen en el navegador a 2000 px y se codifican WebP 0,85 (GIF tal cual);
       se genera una miniatura WebP de 600 px de ancho (PUT /thumb). Videos tal cual, con progreso
       (y miniatura sacada de un fotograma si el navegador puede).
   · openMediaPicker({ kind, multiple, max }) → Promise<item[] | null>: grilla, búsqueda, filtro,
       arrastrar y soltar para subir, y "Usar URL externa".
   · mediaField({ kind, value, onChange }) → vista previa + Elegir · Subir · Pegar URL · Quitar.
   · photoListField({ max: 4, value, onChange }) → fotos de un color: ordenar (arrastrar / flechas),
       quitar, texto alternativo y encuadre, agregar varias (biblioteca, subida o URL), tope con mensaje.
   · mediaApi: list / get / update / remove (atajos de la API de medios).
   · mediaThumb / pexelsSized: miniaturas livianas (las fotos de images.pexels.com se piden en 300 px en las
       miniaturas, 600 px en la vista previa de un campo y 1200 px en el editor de encuadre).
   ========================================================================== */
import { append, h, uid } from "./dom.js";
import { icon } from "./icons.js";
import { ApiError, api, isAbort, withQuery } from "./api.js";
import { button, canDrag, emptyState, iconButton, menu, modal, promptDialog, showApiError, spinner, toast } from "./ui.js";
import { URL_MESSAGES, bytes, debounce, fileNameOf, isSafeUrl, number, siteUrl } from "./format.js";

export const MEDIA_LIMITS = {
  image: 12 * 1024 * 1024,      // máximo que acepta el servidor (después de optimizar)
  rawImage: 40 * 1024 * 1024,   // máximo que se acepta para optimizar en el navegador
  video: 150 * 1024 * 1024,
  thumb: 2 * 1024 * 1024,
  maxSide: 2000,
  thumbWidth: 600,
  quality: 0.85,
};
export const ACCEPT = {
  image: "image/jpeg,image/png,image/gif,image/webp,image/avif,.jpg,.jpeg,.png,.gif,.webp,.avif",
  video: "video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm",
};
ACCEPT.all = `${ACCEPT.image},${ACCEPT.video}`;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const EXT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** Tipo MIME de un File (por su type o por la extensión). */
export function fileType(file) {
  const t = String(file?.type || "").toLowerCase();
  if (t) return t === "image/jpg" ? "image/jpeg" : t;
  const ext = String(file?.name || "").split(".").pop().toLowerCase();
  return EXT_TYPES[ext] || "";
}

export function kindOf(file) {
  const t = fileType(file);
  if (IMAGE_TYPES.has(t)) return "image";
  if (VIDEO_TYPES.has(t)) return "video";
  return null;
}

/** Valida tipo y tamaño ANTES de subir. → mensaje de error | null */
export function checkFile(file, kind = "all") {
  const t = fileType(file);
  if (t.includes("svg")) return "Los archivos SVG no están permitidos por seguridad. Usa PNG, JPG o WebP.";
  if (t.includes("heic") || t.includes("heif")) return "Las fotos HEIC no son compatibles. Expórtala como JPG (o en el iPhone usa el formato «Más compatible»).";
  const k = kindOf(file);
  if (!k) return "Formato no permitido. Sube JPG, PNG, GIF, WebP o AVIF (imágenes) o MP4, MOV o WebM (video).";
  if (kind === "image" && k !== "image") return "Aquí solo se pueden usar imágenes (JPG, PNG, GIF, WebP o AVIF).";
  if (kind === "video" && k !== "video") return "Aquí solo se pueden usar videos (MP4, MOV o WebM).";
  if (!file.size) return "El archivo está vacío.";
  if (k === "video" && file.size > MEDIA_LIMITS.video) return `El video pesa ${bytes(file.size)}; el máximo es 150 MB. Comprímelo e intenta de nuevo.`;
  if (k === "image" && t === "image/gif" && file.size > MEDIA_LIMITS.image) return `El GIF pesa ${bytes(file.size)}; el máximo es 12 MB.`;
  if (k === "image" && file.size > MEDIA_LIMITS.rawImage) return `La imagen pesa ${bytes(file.size)}; el máximo es 40 MB.`;
  return null;
}

/* ---------- Procesamiento de imágenes en el navegador ---------- */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // algunos formatos/navegadores no lo soportan: se intenta con <img>
    }
  }
  const src = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(src);
    throw new ApiError({ status: 0, code: "client", message: "No se pudo leer la imagen. Usa un archivo JPG, PNG o WebP." });
  }
  img._revoke = () => URL.revokeObjectURL(src);
  return img;
}

const dimsOf = (src) => ({ w: src.width || src.naturalWidth, h: src.height || src.naturalHeight });

function toBlob(canvas, type, quality) {
  return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
}

async function draw(src, w, hgt, type, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hgt;
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(src, 0, 0, w, hgt);
  const blob = await toBlob(canvas, type, quality);
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

/** WebP si el navegador sabe codificarlo; si no, JPEG (o PNG si hay transparencia posible). */
async function encode(src, w, hgt, quality, { pngFallback = false } = {}) {
  const webp = await draw(src, w, hgt, "image/webp", quality);
  if (webp && webp.type === "image/webp") return webp;
  return draw(src, w, hgt, pngFallback ? "image/png" : "image/jpeg", quality);
}

const baseName = (name) => String(name || "imagen").replace(/\.[^.]+$/, "") || "imagen";
const extOf = (type) => ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[type] || "img");

/**
 * Prepara una imagen para subir: reduce a 2000 px máx. y codifica WebP 0,85 (GIF tal cual).
 * También crea la miniatura (600 px de ancho). → { blob, name, width, height, thumb }
 */
export async function processImage(file) {
  const type = fileType(file);
  const src = await decode(file);
  try {
    const { w, h: hgt } = dimsOf(src);
    let blob = file;
    let width = w;
    let height = hgt;
    let name = file.name || "imagen";
    if (type !== "image/gif") {
      const scale = Math.min(1, MEDIA_LIMITS.maxSide / Math.max(w, hgt));
      const mayHaveAlpha = type === "image/png" || type === "image/webp" || type === "image/avif";
      if (scale < 1) {
        width = Math.round(w * scale);
        height = Math.round(hgt * scale);
        blob = await encode(src, width, height, MEDIA_LIMITS.quality, { pngFallback: mayHaveAlpha });
      } else if ((type === "image/jpeg" || type === "image/png") && file.size > 400 * 1024) {
        // Ya cabe en 2000 px pero pesa mucho: WebP solo si de verdad ahorra
        const candidate = await encode(src, w, hgt, MEDIA_LIMITS.quality, { pngFallback: type === "image/png" });
        if (candidate && candidate.type === "image/webp" && candidate.size < file.size * 0.85) blob = candidate;
      }
      if (!blob) blob = file;
      if (blob !== file) name = `${baseName(name)}.${extOf(blob.type)}`;
    }
    let thumb = null;
    if (type !== "image/gif" && width > 0) {
      let tw = Math.min(MEDIA_LIMITS.thumbWidth, w);
      let th = Math.round((hgt * tw) / w);
      if (th > MEDIA_LIMITS.thumbWidth * 2) { th = MEDIA_LIMITS.thumbWidth * 2; tw = Math.round((w * th) / hgt); }
      thumb = await encode(src, tw, th, 0.8, { pngFallback: type !== "image/jpeg" });
      if (thumb && thumb.size > MEDIA_LIMITS.thumb) thumb = null;
    }
    return { blob, name, width, height, thumb };
  } finally {
    src.close?.();
    src._revoke?.();
  }
}

/** Medidas y un fotograma (miniatura) de un video local. Nunca lanza: devuelve lo que pueda. */
export async function videoInfo(file) {
  const src = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = src;
  const wait = (evt, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    v.addEventListener(evt, () => { clearTimeout(t); res(); }, { once: true });
    v.addEventListener("error", () => { clearTimeout(t); rej(new Error("error")); }, { once: true });
  });
  const out = { width: null, height: null, duration: null, thumb: null };
  try {
    await wait("loadedmetadata", 8000);
    out.width = v.videoWidth || null;
    out.height = v.videoHeight || null;
    out.duration = Number.isFinite(v.duration) ? v.duration : null;
    v.currentTime = Math.min(1, (out.duration || 2) * 0.1);
    await wait("seeked", 8000);
    if (out.width && out.height) {
      const tw = Math.min(MEDIA_LIMITS.thumbWidth, out.width);
      const th = Math.round((out.height * tw) / out.width);
      const t = await encode(v, tw, th, 0.8);
      if (t && t.size <= MEDIA_LIMITS.thumb) out.thumb = t;
    }
  } catch {
    // sin miniatura: el servidor guarda el video igual
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(src);
  }
  return out;
}

/**
 * Sube un archivo a la biblioteca (POST /api/admin/media) → item.
 *   onProgress({ phase: "processing"|"uploading"|"thumb", fraction })
 *   kind: "image" | "video" | "all" (para validar dónde se usa)
 * Lanza ApiError con mensaje en español (validación local, 413, 415…).
 */
export async function subirArchivo(file, { onProgress, signal, kind = "all" } = {}) {
  const problem = checkFile(file, kind);
  if (problem) throw new ApiError({ status: 0, code: "client", message: problem });
  const k = kindOf(file);
  onProgress?.({ phase: "processing", fraction: 0 });
  let blob = file;
  let name = file.name || (k === "video" ? "video.mp4" : "imagen");
  let width = null;
  let height = null;
  let thumb = null;
  if (k === "image") {
    const p = await processImage(file);
    ({ blob, name, width, height, thumb } = p);
    if (blob.size > MEDIA_LIMITS.image) throw new ApiError({ status: 0, code: "client", message: `La imagen optimizada pesa ${bytes(blob.size)}; el máximo es 12 MB. Usa una imagen más pequeña.` });
  } else {
    const info = await videoInfo(file);
    ({ width, height, thumb } = info);
  }
  if (signal?.aborted) throw new DOMException("Subida cancelada", "AbortError");
  const headers = { "Content-Type": blob.type || fileType(file) || "application/octet-stream", "X-File-Name": encodeURIComponent(name) };
  if (width && height) {
    headers["X-Media-Width"] = String(width);
    headers["X-Media-Height"] = String(height);
  }
  const res = await api.upload("/api/admin/media", blob, { headers, signal, onProgress: (f) => onProgress?.({ phase: "uploading", fraction: f }) });
  let item = res.item;
  if (thumb) {
    onProgress?.({ phase: "thumb", fraction: 1 });
    try {
      const r = await api.upload(`/api/admin/media/${encodeURIComponent(item.id)}/thumb`, thumb, { method: "PUT", headers: { "Content-Type": thumb.type } });
      item = r.item || item;
    } catch (e) {
      if (isAbort(e)) throw e;
      console.warn("[medios] No se pudo guardar la miniatura:", e);
    }
  }
  return item;
}

/* ---------- Atajos de la API ---------- */
export const mediaApi = {
  list: ({ kind, q } = {}) => api.get(withQuery("/api/admin/media", { kind, q })).then((r) => r.items || []),
  get: (id) => api.get(`/api/admin/media/${encodeURIComponent(id)}`), // → { item, usages }
  update: (id, { name, alt }) => api.put(`/api/admin/media/${encodeURIComponent(id)}`, { name, alt }).then((r) => r.item),
  remove: (id, { force = false } = {}) => api.del(`/api/admin/media/${encodeURIComponent(id)}${force ? "?force=1" : ""}`),
};

/* ---------- Miniaturas ---------- */
const PEXELS_RE = /^https?:\/\/images\.pexels\.com\//i;
export const PEXELS_SIZES = { thumb: 300, preview: 600, editor: 1200 };

/**
 * Fotos de images.pexels.com en el tamaño que se va a mostrar (la URL original puede pesar varios MB):
 * pexelsSized(url, 300) → "…?auto=compress&cs=tinysrgb&w=300". Otras URLs vuelven tal cual (con siteUrl()).
 * Solo cambia lo que se MUESTRA en el panel: el valor guardado sigue siendo la URL original.
 */
export function pexelsSized(url, width = PEXELS_SIZES.thumb) {
  const u = String(url || "");
  if (!PEXELS_RE.test(u)) return siteUrl(u);
  return `${u.split(/[?#]/)[0]}?auto=compress&cs=tinysrgb&w=${Math.round(width)}`;
}

/** Elemento de vista previa para un item de la biblioteca o una URL (Pexels sin miniatura → versión de 300 px). */
export function mediaThumb(itemOrUrl, { kind, alt = "", className = "", width = PEXELS_SIZES.thumb } = {}) {
  const item = typeof itemOrUrl === "string" ? { url: itemOrUrl, thumbUrl: "", kind: kind || guessKind(itemOrUrl) } : itemOrUrl || {};
  const k = item.kind || kind || guessKind(item.url);
  if (k === "video" && !item.thumbUrl) {
    return h("video", { class: ["media-thumb", className], src: siteUrl(item.url) + "#t=0.5", muted: true, playsinline: true, preload: "metadata", "aria-hidden": "true", tabindex: "-1" });
  }
  const img = h("img", { class: ["media-thumb", className], src: item.thumbUrl ? siteUrl(item.thumbUrl) : pexelsSized(item.url, width), alt, loading: "lazy", decoding: "async", draggable: "false" });
  img.addEventListener("error", () => { img.classList.add("is-broken"); img.alt = alt || "No se pudo cargar la imagen"; }, { once: true });
  return img;
}

export function guessKind(url) {
  return /\.(mp4|m4v|mov|webm)(?:[?#]|$)/i.test(String(url || "")) ? "video" : "image";
}


/* ==========================================================================
   Selector de medios
   ========================================================================== */
/**
 * openMediaPicker({ kind: "image"|"video"|"all", multiple, max, title, allowUrl, confirmLabel })
 * → Promise<item[] | null>  (null = canceló). Un item de URL externa trae { id: null, url, external: true }.
 */
export function openMediaPicker({ kind = "image", multiple = false, max, title, allowUrl = true, confirmLabel } = {}) {
  const limit = multiple ? Math.max(1, max ?? Infinity) : 1;
  let items = [];
  let selected = [];
  let filterKind = kind === "all" ? "" : kind;
  let q = "";
  let loading = true;
  let loadError = null;
  const pendings = [];

  const searchId = uid("pk-q");
  const search = h("input.input.input--search", { id: searchId, type: "search", placeholder: "Buscar por nombre o texto alternativo…", autocomplete: "off" });
  const kindSel = kind === "all"
    ? h("select.input.input--select", { "aria-label": "Tipo de archivo" }, h("option", { value: "" }, "Todos"), h("option", { value: "image" }, "Imágenes"), h("option", { value: "video" }, "Videos"))
    : null;
  const fileInput = h("input", { type: "file", accept: ACCEPT[kind] || ACCEPT.all, multiple: true, hidden: true });
  const uploadBtn = button({ label: "Subir archivos", icon: "upload", variant: "secondary", onClick: () => fileInput.click() });
  const grid = h("div.media-grid", { role: "group", "aria-label": "Archivos de la biblioteca" });
  const status = h("p.picker__status", { "aria-live": "polite" });
  const drop = h("div.picker__drop", h("div.picker__drop-hint", icon("upload", { size: 28 }), h("p", "Suelta los archivos para subirlos")), grid);

  const urlId = uid("pk-url");
  const urlInput = h("input.input", { id: urlId, type: "text", inputmode: "url", placeholder: "https://images.pexels.com/…", autocomplete: "off" });
  const urlErr = h("p.field__error", { hidden: true });
  const urlBox = allowUrl
    ? h("details.picker__url",
      h("summary", icon("link", { size: 16 }), "Usar una URL externa"),
      h("div.picker__url-body",
        h("label.field__label", { for: urlId }, kind === "video" ? "Dirección del video" : kind === "image" ? "Dirección de la imagen" : "Dirección del archivo"),
        h("div.picker__url-row", urlInput, button({ label: "Usar esta URL", variant: "primary", size: "sm", onClick: () => useUrl() })),
        h("p.field__help", "Debe empezar por https://. El archivo no se copia a la biblioteca: si lo borran de ese sitio, dejará de verse."),
        urlErr))
    : null;

  const body = h("div.picker",
    h("div.picker__bar",
      h("div.table-search", h("label.sr-only", { for: searchId }, "Buscar"), icon("search", { size: 16, className: "table-search__icon" }), search),
      kindSel, uploadBtn, fileInput),
    drop, status, urlBox);

  const m = modal({
    title: title || (multiple ? "Elegir archivos" : kind === "video" ? "Elegir un video" : "Elegir una imagen"),
    size: "xl",
    content: body,
    className: "modal--picker",
    initialFocus: search,
    actions: [
      { label: "Cancelar", value: null },
      { label: confirmLabel || (multiple ? "Agregar" : "Elegir"), variant: "primary", onClick: () => { m.close(selected.slice()); return false; } },
    ],
  });
  const confirmBtn = m.footer.querySelector(".btn--primary");
  const countEl = h("span.picker__count", { "aria-live": "polite" });
  m.footer.prepend(countEl);

  function updateFooter() {
    confirmBtn.disabled = !selected.length;
    countEl.textContent = selected.length
      ? `${selected.length} ${selected.length === 1 ? "seleccionado" : "seleccionados"}${Number.isFinite(limit) && multiple ? ` de ${limit} posibles` : ""}`
      : multiple && Number.isFinite(limit) ? `Puedes elegir hasta ${limit}` : "";
  }

  function toggle(item) {
    const i = selected.findIndex((s) => s.id === item.id);
    if (i !== -1) selected.splice(i, 1);
    else if (!multiple) selected = [item];
    else if (selected.length >= limit) { toast(`Puedes elegir hasta ${limit}.`, { type: "warning" }); return; }
    else selected.push(item);
    renderGrid();
    updateFooter();
  }

  function tile(item) {
    const on = selected.some((s) => s.id === item.id);
    const order = multiple && on ? selected.findIndex((s) => s.id === item.id) + 1 : null;
    const dims = item.width && item.height ? `${item.width}×${item.height}` : "";
    const b = h("button.media-tile", { type: "button", "aria-pressed": String(on), title: item.name, dataset: { id: item.id } },
      h("span.media-tile__thumb", mediaThumb(item, { alt: "" })),
      h("span.media-tile__check", { "aria-hidden": "true" }, order ? String(order) : icon("check", { size: 14, strokeWidth: 3 })),
      item.kind === "video" ? h("span.media-tile__badge", icon("video", { size: 12 }), "Video") : null,
      h("span.media-tile__name", item.name),
      h("span.media-tile__meta", [dims, bytes(item.bytes)].filter(Boolean).join(" · ")));
    b.addEventListener("click", () => toggle(item));
    b.addEventListener("dblclick", () => {
      if (!multiple) { selected = [item]; m.close(selected.slice()); }
    });
    return b;
  }

  function renderGrid() {
    const focusedId = document.activeElement?.closest?.(".media-tile")?.dataset.id;
    const kids = [];
    for (const p of pendings) kids.push(p.el);
    if (loading) {
      for (let i = 0; i < 8; i++) kids.push(h("div.media-tile.is-skeleton", h("span.media-tile__thumb", h("span.sk.sk--block"))));
    } else if (loadError) {
      kids.push(h("div.media-grid__full", emptyState({ icon: "alert-circle", title: "No se pudo cargar la biblioteca", message: loadError.message, action: { label: "Reintentar", icon: "refresh", onClick: load } })));
    } else if (!items.length && !pendings.length) {
      kids.push(h("div.media-grid__full", emptyState({
        icon: kind === "video" ? "video" : "image",
        title: q ? "No hay resultados" : "Tu biblioteca está vacía",
        message: q ? `No encontramos archivos para «${q}».` : canDrag() ? "Sube el primer archivo con el botón «Subir archivos» o arrastrándolo aquí." : "Sube el primer archivo con el botón «Subir archivos».",
        compact: true,
      })));
    } else {
      for (const it of items) kids.push(tile(it));
    }
    grid.replaceChildren(...kids);
    if (focusedId) grid.querySelector(`[data-id="${CSS.escape(focusedId)}"]`)?.focus();
    status.textContent = loading ? "Cargando la biblioteca…" : loadError ? "" : `${number(items.length)} ${items.length === 1 ? "archivo" : "archivos"}`;
  }

  async function load() {
    loading = true;
    loadError = null;
    renderGrid();
    try {
      items = await mediaApi.list({ kind: filterKind, q });
    } catch (e) {
      if (isAbort(e)) return;
      loadError = e;
    } finally {
      loading = false;
      renderGrid();
    }
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const problem = checkFile(file, kind);
      if (problem) { toast(`${file.name}: ${problem}`, { type: "error" }); continue; }
      const bar = h("span.progress__bar");
      const label = h("span.media-tile__meta", "Preparando…");
      const p = { el: h("div.media-tile.is-uploading", h("span.media-tile__thumb", spinner()), h("span.media-tile__name", file.name), label, h("span.progress", bar)) };
      pendings.unshift(p);
      renderGrid();
      try {
        const item = await subirArchivo(file, {
          kind,
          onProgress: ({ phase, fraction }) => {
            label.textContent = phase === "processing" ? "Optimizando…" : phase === "thumb" ? "Creando miniatura…" : `Subiendo ${Math.round(fraction * 100)} %`;
            bar.style.width = `${Math.round((phase === "uploading" ? fraction : phase === "thumb" ? 1 : 0.05) * 100)}%`;
          },
        });
        items.unshift(item);
        if (!multiple) selected = [item];
        else if (selected.length < limit) selected.push(item);
        toast(`«${item.name}» se subió a la biblioteca.`);
      } catch (e) {
        if (!isAbort(e)) toast(`${file.name}: ${e.message || "no se pudo subir."}`, { type: "error" });
      } finally {
        pendings.splice(pendings.indexOf(p), 1);
        renderGrid();
        updateFooter();
      }
    }
  }

  function useUrl() {
    const v = urlInput.value.trim();
    const ok = v && isSafeUrl(v, "media");
    urlErr.hidden = !!ok;
    urlErr.textContent = ok ? "" : v ? URL_MESSAGES.media : "Pega la dirección del archivo.";
    urlInput.setAttribute("aria-invalid", ok ? "false" : "true");
    if (!ok) { urlInput.focus(); return; }
    const k = kind === "all" ? guessKind(v) : kind;
    m.close([{ id: null, kind: k, url: v, thumbUrl: "", name: fileNameOf(v), alt: "", width: null, height: null, bytes: 0, external: true }]);
  }
  urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); useUrl(); } });

  const reSearch = debounce(() => { q = search.value.trim(); load(); }, 220);
  search.addEventListener("input", reSearch);
  kindSel?.addEventListener("change", () => { filterKind = kindSel.value; load(); });
  fileInput.addEventListener("change", () => { const f = fileInput.files; uploadFiles(f).finally(() => { fileInput.value = ""; }); });

  // Arrastrar y soltar
  let depth = 0;
  drop.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); depth++; drop.classList.add("is-over"); } });
  drop.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  drop.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("is-over"); });
  drop.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    depth = 0;
    drop.classList.remove("is-over");
    uploadFiles(e.dataTransfer.files);
  });

  updateFooter();
  load();
  return m.result.then((v) => (Array.isArray(v) && v.length ? v : null));
}

/* ==========================================================================
   Campo de un archivo (imagen o video)
   ========================================================================== */
/**
 * mediaField({ kind: "image"|"video", value: url, onChange: (url, item|null) => …, previewBg: "checker"|"dark"|"light",
 *              allowUrl, id, labelledBy, describedBy }) → elemento con .setValue(url)
 */
export function mediaField({ kind = "image", value = "", onChange, id, labelledBy, describedBy, previewBg = "checker", allowUrl = true } = {}) {
  let current = value || "";
  const root = h("div.media-field", { class: `media-field--${kind}`, role: "group", "aria-labelledby": labelledBy || null, "aria-describedby": describedBy || null });
  const preview = h("div.media-field__preview", { class: `bg-${previewBg}` });
  const name = h("p.media-field__name");
  const where = h("p.media-field__url");
  const bar = h("span.progress__bar");
  const progress = h("div.media-field__progress", { hidden: true }, h("span.media-field__progress-label"), h("span.progress", bar));
  const fileInput = h("input", { type: "file", accept: ACCEPT[kind] || ACCEPT.all, hidden: true });
  const choose = button({ label: "Elegir", icon: kind === "video" ? "video" : "image", size: "sm", attrs: { id: id ? `${id}` : null }, onClick: () => pick() });
  const uploadB = button({ label: "Subir", icon: "upload", size: "sm", onClick: () => fileInput.click() });
  const urlB = allowUrl ? button({ label: "Pegar URL", icon: "link", size: "sm", variant: "ghost", onClick: () => toggleUrl(true) }) : null;
  const removeB = button({ label: "Quitar", icon: "trash", size: "sm", variant: "ghost", onClick: () => set("", null) });
  const urlInput = h("input.input.input--sm", { type: "text", inputmode: "url", placeholder: "https://…", autocomplete: "off", "aria-label": kind === "video" ? "URL del video" : "URL de la imagen" });
  const urlErr = h("p.field__error", { hidden: true });
  const urlRow = h("div.media-field__urlrow", { hidden: true },
    h("div.media-field__urlinputs", urlInput,
      button({ label: "Usar", size: "sm", variant: "primary", onClick: () => applyUrl() }),
      button({ label: "Cancelar", size: "sm", variant: "ghost", onClick: () => toggleUrl(false) })),
    urlErr);
  append(root, preview, h("div.media-field__side", name, where, h("div.media-field__actions", choose, uploadB, urlB, removeB), urlRow, progress, fileInput));

  function set(u, item) {
    current = u || "";
    render();
    onChange?.(current, item || null);
  }

  function render() {
    preview.replaceChildren();
    preview.classList.toggle("is-empty", !current);
    if (!current) {
      preview.append(h("span.media-field__empty", icon(kind === "video" ? "video" : "image", { size: 26 }), h("span", kind === "video" ? "Sin video" : "Sin imagen")));
      name.textContent = kind === "video" ? "Ningún video elegido" : "Ninguna imagen elegida";
      where.textContent = "Elige de la biblioteca, sube un archivo o pega una URL.";
      where.classList.add("is-hint"); // ayuda completa (sin «…»): la elipsis es solo para URLs
    } else {
      if (kind === "video") {
        preview.append(h("video", { src: siteUrl(current), muted: true, playsinline: true, preload: "metadata", controls: true, "aria-label": "Vista previa del video" }));
      } else {
        const img = h("img", { src: pexelsSized(current, PEXELS_SIZES.preview), alt: "Vista previa", decoding: "async" });
        img.addEventListener("error", () => preview.replaceChildren(h("span.media-field__empty.is-error", icon("alert", { size: 22 }), h("span", "No se pudo cargar la vista previa"))), { once: true });
        preview.append(img);
      }
      where.classList.remove("is-hint");
      name.textContent = fileNameOf(current);
      let host = "";
      try { host = /^https?:/i.test(current) ? new URL(current).hostname : ""; } catch { host = "URL externa"; }
      where.textContent = host || (current.startsWith("/uploads/") ? "Biblioteca de medios" : "Archivo del sitio");
      where.title = current;
    }
    removeB.hidden = !current;
  }

  async function pick() {
    const sel = await openMediaPicker({ kind, multiple: false, allowUrl });
    if (sel && sel[0]) set(sel[0].url, sel[0]);
  }

  function toggleUrl(show) {
    urlRow.hidden = !show;
    urlErr.hidden = true;
    if (show) {
      urlInput.value = /^https?:/i.test(current) ? current : "";
      urlInput.focus();
    } else urlB?.focus();
  }

  function applyUrl() {
    const v = urlInput.value.trim();
    const ok = v && isSafeUrl(v, "media");
    urlErr.hidden = !!ok;
    urlErr.textContent = ok ? "" : v ? URL_MESSAGES.media : "Pega la dirección del archivo.";
    if (!ok) { urlInput.focus(); return; }
    urlRow.hidden = true;
    set(v, null);
    choose.focus();
  }
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyUrl(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); toggleUrl(false); }
  });

  async function uploadOne(file) {
    if (!file) return;
    const problem = checkFile(file, kind);
    if (problem) { toast(problem, { type: "error" }); return; }
    progress.hidden = false;
    const lbl = progress.querySelector(".media-field__progress-label");
    lbl.textContent = "Preparando…";
    bar.style.width = "4%";
    [choose, uploadB, urlB, removeB].forEach((b) => { if (b) b.disabled = true; });
    try {
      const item = await subirArchivo(file, {
        kind,
        onProgress: ({ phase, fraction }) => {
          lbl.textContent = phase === "processing" ? "Optimizando…" : phase === "thumb" ? "Creando miniatura…" : `Subiendo ${Math.round(fraction * 100)} %`;
          bar.style.width = `${Math.max(4, Math.round((phase === "uploading" ? fraction : phase === "thumb" ? 1 : 0.04) * 100))}%`;
        },
      });
      set(item.url, item);
      toast(`«${item.name}» se subió a la biblioteca.`);
    } catch (e) {
      if (!isAbort(e)) showApiError(e);
    } finally {
      progress.hidden = true;
      [choose, uploadB, urlB, removeB].forEach((b) => { if (b) b.disabled = false; });
    }
  }
  fileInput.addEventListener("change", () => { const f = fileInput.files?.[0]; fileInput.value = ""; uploadOne(f); });
  preview.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); preview.classList.add("is-over"); } });
  preview.addEventListener("dragleave", () => preview.classList.remove("is-over"));
  preview.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    preview.classList.remove("is-over");
    uploadOne(e.dataTransfer.files[0]);
  });

  root.setValue = (v) => { current = v || ""; render(); };
  root.getValue = () => current;
  render();
  return root;
}

/* ==========================================================================
   Fotos de un color de producto (máx. 4)
   ========================================================================== */
const normPhoto = (p) => ({
  src: String(p?.src || ""),
  thumb: String(p?.thumb || ""),
  alt: String(p?.alt || ""),
  zoom: p?.zoom === undefined || p?.zoom === "" ? null : p.zoom,
  ox: p?.ox ?? null,
  oy: p?.oy ?? null,
});

/**
 * photoListField({ max: 4, value: [{ src, thumb, alt, zoom, ox, oy }], onChange: (lista) => …, label })
 * → elemento con .setValue(lista). La primera foto es la principal.
 */
export function photoListField({ max = 4, value = [], onChange, label = "Fotos" } = {}) {
  let photos = (value || []).map(normPhoto);
  const pendings = [];
  const grid = h("ol.photo-list__grid", { "aria-label": label });
  const count = h("p.photo-list__count", { "aria-live": "polite" });
  const fileInput = h("input", { type: "file", accept: ACCEPT.image, multiple: true, hidden: true });
  const root = h("div.photo-list", grid, count, fileInput);
  let dragFrom = null;

  const emit = () => onChange?.(photos.map((p) => ({ ...p })));
  const room = () => max - photos.length - pendings.length;

  function addPhotos(list) {
    const free = room();
    const take = list.slice(0, Math.max(0, free));
    if (list.length > take.length) toast(`Solo se agregaron ${take.length} de ${list.length}: máximo ${max} fotos por color.`, { type: "warning" });
    if (!take.length) return;
    photos.push(...take.map(normPhoto));
    render();
    emit();
  }

  async function fromLibrary() {
    if (room() <= 0) return;
    const sel = await openMediaPicker({ kind: "image", multiple: true, max: room(), title: "Agregar fotos", allowUrl: true });
    if (sel) addPhotos(sel.map((it) => ({ src: it.url, thumb: it.thumbUrl || "", alt: it.alt || "" })));
  }

  async function fromUrl() {
    if (room() <= 0) return;
    const v = await promptDialog({ title: "Agregar foto por URL", label: "Dirección de la imagen", placeholder: "https://…", help: "Debe empezar por https:// o ser un archivo del sitio (/uploads/…).", confirmLabel: "Agregar", validate: (x) => (isSafeUrl(x, "media") ? null : URL_MESSAGES.media) });
    if (v) addPhotos([{ src: v }]);
  }

  async function fromFiles(fileList) {
    const files = Array.from(fileList || []);
    const free = room();
    if (files.length > free) toast(`Solo se subirán ${Math.max(0, free)} de ${files.length}: máximo ${max} fotos por color.`, { type: "warning" });
    for (const file of files.slice(0, Math.max(0, free))) {
      const problem = checkFile(file, "image");
      if (problem) { toast(`${file.name}: ${problem}`, { type: "error" }); continue; }
      const bar = h("span.progress__bar");
      const lbl = h("span.photo-tile__state", "Preparando…");
      const p = { el: h("li.photo-tile.is-uploading", h("div.photo-tile__img", spinner()), lbl, h("span.progress", bar)) };
      pendings.push(p);
      render();
      try {
        const item = await subirArchivo(file, {
          kind: "image",
          onProgress: ({ phase, fraction }) => {
            lbl.textContent = phase === "processing" ? "Optimizando…" : phase === "thumb" ? "Miniatura…" : `${Math.round(fraction * 100)} %`;
            bar.style.width = `${Math.round((phase === "uploading" ? fraction : phase === "thumb" ? 1 : 0.05) * 100)}%`;
          },
        });
        pendings.splice(pendings.indexOf(p), 1);
        photos.push(normPhoto({ src: item.url, thumb: item.thumbUrl || "", alt: item.alt || "" }));
        emit();
      } catch (e) {
        pendings.splice(pendings.indexOf(p), 1);
        if (!isAbort(e)) toast(`${file.name}: ${e.message || "no se pudo subir."}`, { type: "error" });
      } finally {
        render();
      }
    }
  }
  fileInput.addEventListener("change", () => { const f = Array.from(fileInput.files || []); fileInput.value = ""; fromFiles(f); });

  function move(from, to) {
    if (to < 0 || to >= photos.length || from === to) return;
    const [x] = photos.splice(from, 1);
    photos.splice(to, 0, x);
    render();
    emit();
  }

  function removeAt(i) {
    photos.splice(i, 1);
    render();
    emit();
    requestAnimationFrame(() => (grid.children[Math.min(i, photos.length - 1)]?.querySelector(".photo-tile__remove") || grid.querySelector(".photo-tile--add button"))?.focus());
  }

  function edit(i) {
    const ph = { ...photos[i] };
    const altId = uid("alt");
    const alt = h("input.input", { id: altId, type: "text", value: ph.alt, maxlength: 160, placeholder: "Ej.: Camiseta Fe color crema, vista de frente" });
    const useZoom = h("input", { type: "checkbox", id: uid("zc"), class: "check__input", checked: ph.zoom !== null || ph.ox !== null || ph.oy !== null });
    const num = (v, d) => (v === null || v === undefined || v === "" ? d : parseFloat(v));
    const zoom = h("input.range", { type: "range", min: 1, max: 3, step: 0.05, value: num(ph.zoom, 1), "aria-label": "Acercamiento" });
    const ox = h("input.range", { type: "range", min: 0, max: 100, step: 1, value: num(ph.ox, 50), "aria-label": "Posición horizontal del acercamiento" });
    const oy = h("input.range", { type: "range", min: 0, max: 100, step: 1, value: num(ph.oy, 50), "aria-label": "Posición vertical del acercamiento" });
    const zv = h("output.range-val");
    const xv = h("output.range-val");
    const yv = h("output.range-val");
    // El encuadre necesita detalle: la foto original (las de Pexels, en 1200 px y no en varios MB)
    const img = h("img", { src: PEXELS_RE.test(ph.src) ? pexelsSized(ph.src, PEXELS_SIZES.editor) : siteUrl(ph.thumb || ph.src), alt: "" });
    const frame = h("div.crop-preview", img);
    const controls = h("div.crop-controls",
      h("label.range-row", h("span", "Acercamiento"), zoom, zv),
      h("label.range-row", h("span", "Horizontal"), ox, xv),
      h("label.range-row", h("span", "Vertical"), oy, yv));
    const upd = () => {
      const on = useZoom.checked;
      controls.hidden = !on;
      img.style.transform = on ? `scale(${zoom.value})` : "";
      img.style.transformOrigin = on ? `${ox.value}% ${oy.value}%` : "";
      zv.textContent = `${Number(zoom.value).toFixed(2).replace(".", ",")}×`;
      xv.textContent = `${ox.value} %`;
      yv.textContent = `${oy.value} %`;
    };
    [zoom, ox, oy, useZoom].forEach((x) => x.addEventListener("input", upd));
    upd();
    const m = modal({
      title: `Foto ${i + 1}${i === 0 ? " (principal)" : ""}`,
      size: "md",
      content: h("div.photo-edit",
        frame,
        h("div.stack",
          h("div.field", h("label.field__label", { for: altId }, "Texto alternativo"), alt, h("p.field__help", "Describe la foto para personas que usan lectores de pantalla y para Google.")),
          h("div.field.field--check", h("label.check", { for: useZoom.id }, useZoom, h("span.check__box", { "aria-hidden": "true" }, icon("check", { size: 14, strokeWidth: 3 })), h("span.check__label", "Usar acercamiento (detalle de la prenda)"))),
          controls)),
      actions: [
        { label: "Cancelar", value: null },
        {
          label: "Aplicar",
          variant: "primary",
          onClick: () => {
            const on = useZoom.checked;
            photos[i] = {
              ...ph,
              alt: alt.value.trim(),
              zoom: on ? Math.round(Number(zoom.value) * 100) / 100 : null,
              ox: on ? `${ox.value}%` : null,
              oy: on ? `${oy.value}%` : null,
            };
            render();
            emit();
          },
        },
      ],
    });
    return m.result;
  }

  function render() {
    const kids = photos.map((ph, i) => {
      const n = `Foto ${i + 1}`;
      const li = h("li.photo-tile", { draggable: "true", dataset: { index: i } },
        h("div.photo-tile__img", mediaThumb({ url: ph.src, thumbUrl: ph.thumb, kind: "image" }, { alt: ph.alt || n })),
        i === 0 ? h("span.photo-tile__badge", "Principal") : h("span.photo-tile__num", { "aria-hidden": "true" }, String(i + 1)),
        ph.zoom ? h("span.photo-tile__zoom", { title: "Con acercamiento" }, icon("focus", { size: 12 })) : null,
        h("div.photo-tile__bar",
          iconButton({ icon: "arrow-left", label: `Mover ${n} a la izquierda`, size: "sm", disabled: i === 0, className: "photo-tile__left", onClick: () => { move(i, i - 1); grid.children[i - 1]?.querySelector(".photo-tile__left:not([disabled]), .photo-tile__right")?.focus(); } }),
          iconButton({ icon: "arrow-right", label: `Mover ${n} a la derecha`, size: "sm", disabled: i === photos.length - 1, className: "photo-tile__right", onClick: () => { move(i, i + 1); grid.children[i + 1]?.querySelector(".photo-tile__right:not([disabled]), .photo-tile__left")?.focus(); } }),
          iconButton({ icon: "edit", label: `Editar ${n} (texto alternativo y encuadre)`, size: "sm", onClick: () => edit(i) }),
          iconButton({ icon: "trash", label: `Quitar ${n}`, size: "sm", className: "photo-tile__remove", onClick: () => removeAt(i) })),
        h("p.photo-tile__alt", { class: !ph.alt && "is-missing", title: ph.alt || "Sin texto alternativo" }, ph.alt || "Sin texto alternativo"));
      li.addEventListener("dragstart", (e) => {
        dragFrom = i;
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* Safari */ }
        requestAnimationFrame(() => li.classList.add("is-dragging"));
      });
      li.addEventListener("dragend", () => { dragFrom = null; li.classList.remove("is-dragging"); grid.querySelectorAll("[data-drop]").forEach((x) => x.removeAttribute("data-drop")); });
      li.addEventListener("dragover", (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        li.dataset.drop = e.clientX > r.left + r.width / 2 ? "after" : "before";
      });
      li.addEventListener("dragleave", () => li.removeAttribute("data-drop"));
      li.addEventListener("drop", (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        let to = li.dataset.drop === "after" ? i + 1 : i;
        li.removeAttribute("data-drop");
        if (dragFrom < to) to -= 1;
        const from = dragFrom;
        dragFrom = null;
        move(from, to);
      });
      return li;
    });
    for (const p of pendings) kids.push(p.el);
    if (room() > 0) {
      const trigger = h("button.photo-add", { type: "button" }, icon("plus", { size: 22 }), h("span", photos.length ? "Agregar fotos" : "Agregar la primera foto"));
      kids.push(h("li.photo-tile.photo-tile--add", menu({
        trigger,
        label: "Agregar fotos",
        align: "start",
        items: [
          { label: "Elegir de la biblioteca", icon: "image", onClick: fromLibrary },
          { label: "Subir desde el equipo", icon: "upload", onClick: () => fileInput.click() },
          { label: "Pegar una URL", icon: "link", onClick: fromUrl },
        ],
      })));
    }
    grid.replaceChildren(...kids);
    const n = photos.length;
    count.replaceChildren(
      h("strong", `${n}/${max} fotos`),
      n >= max ? " · Llegaste al máximo de fotos por color. Quita una para agregar otra." : n ? ` · ${canDrag() ? "Arrastra o usa las flechas para ordenar" : "Usa las flechas para ordenar"}. La primera es la principal.` : " · Este color usará las fotos del primer color que tenga.",
    );
  }

  root.setValue = (v) => { photos = (v || []).map(normPhoto); render(); };
  root.getValue = () => photos.map((p) => ({ ...p }));
  render();
  return root;
}

