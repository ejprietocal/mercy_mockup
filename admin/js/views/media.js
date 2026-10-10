/* ==========================================================================
   Mercy Studio · Panel — views/media.js
   Biblioteca de medios (#/medios, editor y administrador), al estilo de WordPress:
   · Cuadrícula de miniaturas (videos con ícono y duración) o lista (nombre, tipo, medidas, peso, fecha, autor),
     filtro Todo / Imágenes / Videos / Sin usar, búsqueda y espacio total usado.
   · Subida de varios archivos a la vez (botón o arrastrar y soltar en cualquier parte de la vista) con progreso
     por archivo. subirArchivo (core) reduce las imágenes a 2000 px, las pasa a WebP y crea la miniatura.
   · Detalle (#/medios?archivo=<id>): vista previa o reproductor, URL con «Copiar», nombre y texto alternativo
     (se guardan solos), medidas, peso, fecha, autor y DÓNDE se usa (GET /api/admin/media/:id → usages).
   · Eliminar con confirmación; si el archivo está en uso se explica dónde y se ofrece «Eliminar de todas formas»
     (DELETE …?force=1). Selección múltiple para eliminar varios.
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api, isAbort } from "../core/api.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import { ACCEPT, checkFile, mediaApi, mediaThumb, subirArchivo } from "../core/media.js";
import {
  badge, button, confirmDialog, dataTable, describeUsage, emptyState, iconButton, modal, notice, pageHeader,
  showApiError, spinner, toast, withBusy,
} from "../core/ui.js";
import { bytes, dateTime, debounce, fold, number, plural, relativeTime, siteUrl } from "../core/format.js";

const VIEW_KEY = "mercy.medios.vista";
const PAGE = 60;            // miniaturas por tanda en la cuadrícula («Mostrar más»)
const PARALLEL = 2;         // subidas simultáneas
const FILTERS = [
  { value: "", label: "Todo" },
  { value: "image", label: "Imágenes" },
  { value: "video", label: "Videos" },
  { value: "unused", label: "Sin usar" },
];
const MIME_LABEL = {
  "image/jpeg": "JPG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WebP", "image/avif": "AVIF",
  "video/mp4": "MP4", "video/quicktime": "MOV", "video/webm": "WebM",
};
const USAGE_ICON = { products: "shirt", home: "home", discountModal: "gift", settings: "settings", texts: "text" };

/* ---------- Utilidades ---------- */
const typeLabel = (m) => `${m.kind === "video" ? "Video" : "Imagen"}${MIME_LABEL[m.mime] ? ` ${MIME_LABEL[m.mime]}` : ""}`;
const dimsLabel = (m) => (m.width && m.height ? `${number(m.width)} × ${number(m.height)} px` : "");
const absoluteUrl = (u) => { try { return new URL(siteUrl(u), location.origin).href; } catch { return u; } };

function fmtDuration(s) {
  if (!Number.isFinite(s) || s <= 0) return "";
  const t = Math.round(s);
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; }
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Dónde se ve un uso en la tienda (para el enlace «Ver en la tienda»). Productos en borrador no se ven. */
function storeHref(u) {
  const s = String(u || "");
  if (s.startsWith("products/")) {
    const id = s.slice(9);
    const p = content.data?.products?.find((x) => x.id === id);
    return p && p.status !== "published" ? null : `../producto.html?id=${encodeURIComponent(id)}`;
  }
  const sec = s.split(".")[0];
  if (["home", "discountModal", "settings", "texts"].includes(sec)) return "../";
  return null;
}

/* ---------- Duración de los videos (se lee la cabecera con preload="metadata") ---------- */
const durations = new Map();   // id → segundos | null (se conserva al volver a la vista)
const probes = [];
let probing = 0;

function whenDuration(item, cb) {
  if (durations.has(item.id)) { cb(durations.get(item.id)); return; }
  probes.push({ item, cb });
  runProbes();
}

function runProbes() {
  while (probing < 2 && probes.length) {
    const { item, cb } = probes.shift();
    if (durations.has(item.id)) { cb(durations.get(item.id)); continue; }
    probing++;
    const v = document.createElement("video");
    let done = false;
    const finish = (d) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      durations.set(item.id, d);
      v.removeAttribute("src");
      try { v.load(); } catch { /* nada */ }
      probing--;
      cb(d);
      runProbes();
    };
    const timer = setTimeout(() => finish(null), 10000);
    v.preload = "metadata";
    v.muted = true;
    v.addEventListener("loadedmetadata", () => finish(Number.isFinite(v.duration) ? v.duration : null), { once: true });
    v.addEventListener("error", () => finish(null), { once: true });
    v.src = siteUrl(item.url);
  }
}

/** Copia un texto al portapapeles (con respaldo para navegadores sin permiso). */
async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!input) return false;
    input.focus();
    input.select();
    try { return document.execCommand("copy"); } catch { return false; }
  }
}

/* ==========================================================================
   Vista
   ========================================================================== */
export default [
  {
    path: "/medios",
    title: "Biblioteca de medios",
    async render(el, params, ctx) {
      const [list] = await Promise.all([
        api.get("/api/admin/media", { signal: ctx.signal }),
        content.load().catch(() => null), // para saber qué archivos se usan (y los nombres de los productos)
      ]);
      let items = list.items || [];
      const usedOverride = new Map(); // id → bool (lo que respondió el servidor en el detalle)
      let usedBlob = "";
      const rebuildUsed = () => {
        const d = content.data;
        usedBlob = d ? JSON.stringify({ ...d, meta: null }) : "";
      };
      rebuildUsed();
      const isUsed = (m) => {
        if (usedOverride.has(m.id)) return usedOverride.get(m.id);
        return !!usedBlob && (usedBlob.includes(m.url) || (!!m.thumbUrl && usedBlob.includes(m.thumbUrl.split("?")[0])));
      };

      const kindQ = ctx.query.get("tipo");
      const st = {
        kind: FILTERS.some((x) => x.value === kindQ) ? kindQ : "",
        q: ctx.query.get("q") || "",
        view: readView(),
        limit: PAGE,
        selecting: false,
        selected: new Set(),
      };

      /* --- Subidas --- */
      const fileInput = h("input", { type: "file", accept: ACCEPT.all, multiple: true, hidden: true, "aria-hidden": "true", tabindex: "-1" });
      fileInput.addEventListener("change", () => { const files = Array.from(fileInput.files || []); fileInput.value = ""; addFiles(files); });
      const pickFiles = () => fileInput.click();

      const queue = [];
      let active = 0;
      const queueList = h("ul.mlib-queue__list");
      const queueSummary = h("p.mlib-queue__summary", { "aria-live": "polite" });
      const clearBtn = button({ label: "Limpiar lista", variant: "ghost", size: "sm", onClick: () => clearQueue() });
      const queueCard = h("section.card.mlib-queue", { hidden: true, "aria-label": "Subidas" },
        h("div.mlib-queue__head", h("h2.mlib-queue__title", "Subidas"), queueSummary, clearBtn),
        queueList);

      function addFiles(files) {
        if (!files.length) return;
        for (const file of files) {
          const job = { id: uid("up"), file, status: "queued", fraction: 0, error: null, item: null };
          const problem = checkFile(file, "all");
          if (problem) { job.status = "error"; job.error = problem; }
          job.el = jobRow(job);
          queue.push(job);
          queueList.append(job.el);
        }
        queueCard.hidden = false;
        updateQueue();
        pump();
        if (!active) finishedBatch(); // todos fallaron en la revisión local (formato, tamaño…)
      }

      function jobRow(job) {
        const r = {
          icon: h("span.mlib-job__icon"),
          state: h("span.mlib-job__state"),
          bar: h("span.progress__bar"),
          action: h("span.mlib-job__action"),
        };
        r.progress = h("span.progress.mlib-job__progress", r.bar);
        job.r = r;
        const li = h("li.mlib-job", r.icon,
          h("div.mlib-job__body",
            h("p.mlib-job__name", { title: job.file.name }, job.file.name),
            h("p.mlib-job__meta", h("span", bytes(job.file.size)), r.state),
            r.progress),
          r.action);
        paintJob(job, li);
        return li;
      }

      function paintJob(job, li = job.el) {
        const { r } = job;
        li.className = `mlib-job is-${job.status === "done" ? "done" : job.status === "error" ? "error" : job.status === "queued" ? "queued" : "busy"}`;
        const pct = job.status === "uploading" ? job.fraction : job.status === "thumb" || job.status === "done" ? 1 : job.status === "processing" ? 0.04 : 0;
        r.bar.style.width = `${Math.round(pct * 100)}%`;
        r.progress.hidden = job.status === "error" || job.status === "done";
        if (job.status === "error") {
          replace(r.icon, icon("alert-circle", { size: 20 }));
          r.state.textContent = job.error;
          replace(r.action, iconButton({ icon: "x", label: `Quitar «${job.file.name}» de la lista`, size: "sm", onClick: () => dropJob(job) }));
        } else if (job.status === "done") {
          replace(r.icon, icon("check-circle", { size: 20 }));
          r.state.textContent = "Subido";
          replace(r.action, button({ label: "Ver detalles", size: "sm", variant: "ghost", onClick: () => openDetail(job.item.id) }));
        } else {
          replace(r.icon, job.status === "queued" ? icon("clock", { size: 18 }) : spinner());
          r.state.textContent = {
            queued: "En espera",
            processing: job.file.type.startsWith("video") ? "Preparando el video…" : "Optimizando la imagen…",
            uploading: `Subiendo ${Math.round(job.fraction * 100)} %`,
            thumb: "Creando la miniatura…",
          }[job.status] || "";
          r.action.replaceChildren();
        }
      }

      function pump() {
        while (active < PARALLEL) {
          const job = queue.find((j) => j.status === "queued");
          if (!job) break;
          run(job);
        }
      }

      async function run(job) {
        active++;
        job.status = "processing";
        paintJob(job);
        try {
          const item = await subirArchivo(job.file, {
            kind: "all",
            onProgress: ({ phase, fraction }) => { job.status = phase; job.fraction = fraction || 0; paintJob(job); },
          });
          job.status = "done";
          job.item = item;
          items = [item, ...items.filter((m) => m.id !== item.id)];
          usedOverride.set(item.id, false);
          scheduleRefresh();
        } catch (e) {
          job.status = "error";
          job.error = isAbort(e) ? "Subida cancelada." : e?.message || "No se pudo subir el archivo.";
        } finally {
          active--;
          paintJob(job);
          updateQueue();
          pump();
          if (!active && !queue.some((j) => j.status === "queued")) finishedBatch();
        }
      }

      const batchToasted = new Set();
      function finishedBatch() {
        const fresh = queue.filter((j) => !batchToasted.has(j.id) && (j.status === "done" || j.status === "error"));
        if (!fresh.length) return;
        fresh.forEach((j) => batchToasted.add(j.id));
        const ok = fresh.filter((j) => j.status === "done").length;
        const bad = fresh.length - ok;
        if (!bad) {
          toast(ok === 1 ? `«${fresh[0].item.name}» se subió a la biblioteca.` : `Se subieron ${ok} archivos a la biblioteca.`);
          // Todo salió bien: la lista de subidas se recoge sola (los archivos ya están en la biblioteca)
          setTimeout(() => {
            if (active || queue.some((j) => j.status !== "done") || queueCard.contains(document.activeElement)) return;
            clearQueue({ focus: false });
          }, 7000);
        }
        else if (!ok) toast(bad === 1 ? "No se pudo subir el archivo. Revisa el motivo en la lista de subidas." : `No se pudo subir ninguno de los ${bad} archivos. Revisa los motivos en la lista de subidas.`, { type: "error" });
        else toast(`Se subieron ${ok} de ${fresh.length} archivos. Revisa los que fallaron en la lista de subidas.`, { type: "warning" });
      }

      function updateQueue() {
        const busy = queue.filter((j) => !["done", "error"].includes(j.status)).length;
        const done = queue.filter((j) => j.status === "done").length;
        const bad = queue.filter((j) => j.status === "error").length;
        queueSummary.textContent = busy
          ? `Subiendo ${plural(busy, "archivo", "archivos")}${done ? ` · ${done} listos` : ""}${bad ? ` · ${bad} con error` : ""}`
          : `${done ? `${plural(done, "archivo subido", "archivos subidos")}` : ""}${done && bad ? " · " : ""}${bad ? `${plural(bad, "con error", "con error")}` : ""}`;
        clearBtn.hidden = !!busy || !queue.length;
        queueCard.hidden = !queue.length;
      }

      function dropJob(job) {
        const i = queue.indexOf(job);
        if (i !== -1) queue.splice(i, 1);
        job.el.remove();
        updateQueue();
        (queueList.querySelector("button") || dropBtn).focus();
      }

      function clearQueue({ focus = true } = {}) {
        for (const j of queue.filter((x) => x.status === "done" || x.status === "error")) {
          queue.splice(queue.indexOf(j), 1);
          j.el.remove();
        }
        updateQueue();
        if (focus) dropBtn.focus();
      }

      // Avisar si se cierra la pestaña con subidas en curso (navegar dentro del panel no las corta)
      const onBeforeUnload = (e) => { if (active || queue.some((j) => j.status === "queued")) { e.preventDefault(); e.returnValue = ""; } };
      window.addEventListener("beforeunload", onBeforeUnload);
      ctx.onCleanup(() => window.removeEventListener("beforeunload", onBeforeUnload));

      /* --- Arrastrar y soltar en cualquier parte de la vista --- */
      const dropBtn = button({ label: "Elegir archivos", icon: "upload", variant: "secondary", onClick: pickFiles });
      const dropZone = h("div.mlib-drop", { role: "group", "aria-label": "Subir archivos" },
        h("span.mlib-drop__icon", icon("upload", { size: 26 })),
        h("div.mlib-drop__text",
          h("p.mlib-drop__title", "Arrastra fotos o videos aquí para subirlos"),
          h("p.mlib-drop__help", "Imágenes JPG, PNG, WebP, GIF o AVIF de hasta 40 MB (se optimizan a 2000 px). Videos MP4, MOV o WebM de hasta 150 MB. Puedes subir varios a la vez.")),
        dropBtn);
      const overlay = h("div.mlib-overlay", { hidden: true, "aria-hidden": "true" },
        h("div.mlib-overlay__box", icon("upload", { size: 34 }), h("p", "Suelta los archivos para subirlos a la biblioteca")));
      let dragDepth = 0;
      const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
      const onDragEnter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; overlay.hidden = false; };
      const onDragOver = (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
      const onDragLeave = (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.hidden = true; };
      const onDrop = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        overlay.hidden = true;
        addFiles(Array.from(e.dataTransfer.files || []));
      };
      for (const [t, fn] of [["dragenter", onDragEnter], ["dragover", onDragOver], ["dragleave", onDragLeave], ["drop", onDrop]]) {
        window.addEventListener(t, fn);
        ctx.onCleanup(() => window.removeEventListener(t, fn));
      }

      /* --- Barra de herramientas --- */
      const filterName = uid("mlib-f");
      const countEls = new Map();
      const filterGroup = h("fieldset.segmented.mlib-filter",
        h("legend.sr-only", "Mostrar"),
        FILTERS.map((opt) => {
          const c = h("span.mlib-filter__count");
          countEls.set(opt.value, c);
          const input = h("input.segmented__input", { type: "radio", name: filterName, value: opt.value, checked: st.kind === opt.value });
          input.addEventListener("change", () => { if (input.checked) setKind(opt.value); });
          return h("label.segmented__opt", input, h("span.segmented__label", opt.label, c));
        }));

      // Sin el contenido no se sabe qué se usa: no se ofrece «Sin usar» (el detalle sí consulta al servidor)
      if (!usedBlob) {
        filterGroup.querySelector('input[value="unused"]').closest("label").hidden = true;
        if (st.kind === "unused") st.kind = "";
      }

      const searchId = uid("mlib-q");
      const search = h("input.input.input--search", { id: searchId, type: "search", placeholder: "Buscar por nombre o texto alternativo…", value: st.q, autocomplete: "off" });
      search.addEventListener("input", debounce(() => { st.q = search.value; st.limit = PAGE; ctx.setQuery({ q: st.q.trim() || null }); refresh(); }, 150));

      const gridBtn = iconButton({ icon: "dashboard", label: "Ver como cuadrícula", variant: "ghost", size: "sm", onClick: () => setView("grid") });
      const listBtn = iconButton({ icon: "menu", label: "Ver como lista", variant: "ghost", size: "sm", onClick: () => setView("list") });
      const viewToggle = h("div.mlib-viewtoggle", { role: "group", "aria-label": "Forma de ver la biblioteca" }, gridBtn, listBtn);
      const selectBtn = button({ label: "Seleccionar varios", icon: "check", variant: "secondary", size: "sm", onClick: () => setSelecting(!st.selecting) });

      const totals = h("p.mlib-totals");
      const resultInfo = h("p.mlib-results", { "aria-live": "polite" });
      const selText = h("p.mlib-selbar__text", { "aria-live": "polite" });
      const selAllBtn = button({ label: "Seleccionar los visibles", variant: "ghost", size: "sm", onClick: () => { filtered().slice(0, st.limit).forEach((m) => st.selected.add(m.id)); refresh(); } });
      const selNoneBtn = button({ label: "Quitar selección", variant: "ghost", size: "sm", onClick: () => { st.selected.clear(); refresh(); selAllBtn.focus(); } });
      const selDelBtn = button({ label: "Eliminar", icon: "trash", variant: "danger", size: "sm", onClick: () => deleteMany(selDelBtn) });
      const selBar = h("div.mlib-selbar", { hidden: true }, selText, h("div.mlib-selbar__actions", selAllBtn, selNoneBtn, selDelBtn));
      const body = h("div.mlib-body");
      const toolbar = h("div.mlib-toolbar",
        filterGroup,
        h("div.table-search.mlib-search", h("label.sr-only", { for: searchId }, "Buscar archivos"), icon("search", { size: 16, className: "table-search__icon" }), search),
        h("div.mlib-toolbar__end", selectBtn, viewToggle));
      const libraryCard = h("section.card.mlib-card", { "aria-label": "Archivos de la biblioteca" },
        toolbar, h("div.mlib-infobar", totals, resultInfo), selBar, body);

      function setKind(v) {
        st.kind = v;
        st.limit = PAGE;
        ctx.setQuery({ tipo: v || null });
        refresh();
      }

      function setView(v) {
        if (st.view === v) return;
        st.view = v;
        saveView(v);
        refresh();
        (v === "grid" ? gridBtn : listBtn).focus();
      }

      function setSelecting(on) {
        st.selecting = on;
        st.selected.clear();
        selectBtn.querySelector(".btn__label").textContent = on ? "Cancelar selección" : "Seleccionar varios";
        selectBtn.setAttribute("aria-pressed", String(on));
        if (on && st.view !== "grid") { st.view = "grid"; saveView("grid"); }
        refresh();
      }

      function filtered() {
        const q = fold(st.q).trim();
        return items.filter((m) => {
          if (st.kind === "unused" ? isUsed(m) : st.kind && m.kind !== st.kind) return false;
          return !q || fold(`${m.name} ${m.alt || ""}`).includes(q);
        });
      }

      function updateCounts() {
        const n = { "": items.length, image: 0, video: 0, unused: 0 };
        let total = 0;
        let imgBytes = 0;
        let vidBytes = 0;
        for (const m of items) {
          total += m.bytes || 0;
          if (m.kind === "video") { n.video++; vidBytes += m.bytes || 0; } else { n.image++; imgBytes += m.bytes || 0; }
          if (!isUsed(m)) n.unused++;
        }
        for (const [k, c] of countEls) c.textContent = number(n[k]);
        replace(totals,
          icon("layers", { size: 15 }),
          items.length
            ? h("span", h("strong", `${bytes(total)} usados`), ` · ${plural(n.image, "imagen", "imágenes")} (${bytes(imgBytes)}) · ${plural(n.video, "video", "videos")} (${bytes(vidBytes)})`)
            : h("span", h("strong", "Sin archivos todavía")));
      }

      /* --- Cuerpo: cuadrícula o lista --- */
      let table = null;

      function tile(m) {
        const isVideo = m.kind === "video";
        const selected = st.selected.has(m.id);
        const used = !!usedBlob && isUsed(m);
        const durEl = isVideo ? h("span.mlib-tile__dur", { dataset: { dur: m.id } }, fmtDuration(durations.get(m.id)) || "Video") : null;
        const b = h("button.media-tile.mlib-tile", {
          type: "button",
          dataset: { id: m.id },
          "aria-pressed": st.selecting ? String(selected) : null,
          title: m.name,
          onClick: () => {
            if (st.selecting) toggleSelect(m.id);
            else openDetail(m.id);
          },
        },
        h("span.media-tile__thumb.mlib-tile__thumb", { class: isVideo && "is-video" }, mediaThumb(m, { alt: "" }),
          isVideo ? h("span.mlib-tile__play", { "aria-hidden": "true" }, icon("play", { size: 18 })) : null),
        st.selecting ? h("span.media-tile__check", { "aria-hidden": "true" }, icon("check", { size: 14, strokeWidth: 3 })) : null,
        isVideo ? h("span.media-tile__badge.mlib-tile__badge", icon("video", { size: 12 }), durEl, h("span.sr-only", " (video)")) : null,
        h("span.media-tile__name", m.name),
        h("span.media-tile__meta", [m.width && m.height ? `${m.width}×${m.height}` : "", bytes(m.bytes)].filter(Boolean).join(" · ")),
        used ? h("span.mlib-tile__used", { title: "Se usa en el sitio" }, icon("link", { size: 11 }), "En uso") : null);
        if (isVideo && !durations.has(m.id)) whenDuration(m, () => paintDuration(m.id));
        return b;
      }

      function paintDuration(id) {
        const txt = fmtDuration(durations.get(id));
        if (!txt) return;
        for (const n of el.ownerDocument.querySelectorAll(`[data-dur="${CSS.escape(id)}"]`)) n.textContent = txt;
      }

      function buildTable() {
        return dataTable({
          caption: "Archivos de la biblioteca",
          stateKey: "medios",
          search: false,
          sort: { key: "createdAt", dir: "desc" },
          pageSize: 50,
          rowKey: (m) => m.id,
          onRowClick: (m) => openDetail(m.id),
          columns: [
            {
              key: "name", label: "Archivo", sortable: true, value: (m) => m.name,
              render: (m) => h("span.mlib-cell",
                h("span.mlib-cell__thumb", { class: m.kind === "video" && "is-video" }, mediaThumb(m, { alt: "" })),
                h("span.mlib-cell__text",
                  h("button.mlib-cell__name", { type: "button", onClick: () => openDetail(m.id) }, m.name),
                  m.alt ? h("span.mlib-cell__alt", m.alt) : null)),
            },
            { key: "kind", label: "Tipo", sortable: true, value: (m) => typeLabel(m), render: (m) => h("span.nowrap", typeLabel(m)) },
            {
              key: "dims", label: "Medidas", hideOn: "mobile", value: (m) => (m.width || 0) * (m.height || 0),
              render: (m) => {
                const parts = [dimsLabel(m)];
                if (m.kind === "video") parts.push(h("span.muted", { dataset: { dur: m.id } }, fmtDuration(durations.get(m.id))));
                if (m.kind === "video" && !durations.has(m.id)) whenDuration(m, () => paintDuration(m.id));
                return h("span.mlib-dims", parts.filter(Boolean));
              },
            },
            { key: "bytes", label: "Peso", sortable: true, align: "end", value: (m) => m.bytes || 0, render: (m) => h("span.nowrap", bytes(m.bytes)) },
            {
              key: "createdAt", label: "Fecha", sortable: true, value: (m) => m.createdAt || "",
              render: (m) => h("time.nowrap", { datetime: m.createdAt, title: dateTime(m.createdAt) }, relativeTime(m.createdAt)),
            },
            { key: "createdBy", label: "Subido por", sortable: true, hideOn: "mobile", value: (m) => m.createdBy || "" },
            { key: "used", label: "Uso", value: (m) => (isUsed(m) ? 1 : 0), render: (m) => (isUsed(m) ? badge("En uso", "success", { dot: true }) : badge("Sin usar", "neutral", { dot: true })) },
          ],
          rowActions: (m) => [
            { label: "Ver detalles", icon: "eye", onClick: () => openDetail(m.id) },
            { label: "Copiar la URL", icon: "copy", onClick: async () => toast((await copyText(absoluteUrl(m.url))) ? "URL copiada." : "No se pudo copiar. Ábrelo y copia la URL a mano.", { type: "info" }) },
            { label: "Abrir el archivo", icon: "external", href: siteUrl(m.url), target: "_blank" },
            { divider: true },
            { label: "Eliminar", icon: "trash", danger: true, onClick: () => deleteOne(m) },
          ],
        });
      }

      function refresh() {
        updateCounts();
        const list = filtered();
        gridBtn.setAttribute("aria-pressed", String(st.view === "grid"));
        listBtn.setAttribute("aria-pressed", String(st.view === "list"));
        gridBtn.classList.toggle("is-active", st.view === "grid");
        listBtn.classList.toggle("is-active", st.view === "list");
        listBtn.disabled = st.selecting;
        selectBtn.hidden = !items.length;
        toolbar.hidden = !items.length;
        renderSelBar();

        if (!items.length) {
          resultInfo.textContent = "";
          table = null;
          replace(body, emptyState({
            icon: "image",
            title: "Tu biblioteca está vacía",
            message: "Sube las fotos y videos del sitio: luego los eliges en el inicio, en los productos, en el modal de descuento y en los logos.",
            action: { label: "Subir archivos", icon: "upload", onClick: pickFiles },
          }));
          return;
        }
        const filtering = !!st.kind || !!st.q.trim();
        resultInfo.textContent = filtering ? `${plural(list.length, "resultado", "resultados")} de ${number(items.length)}` : plural(items.length, "archivo", "archivos");
        if (!list.length) {
          table = null;
          replace(body, h("div.mlib-noresults", emptyState({
            icon: "search",
            title: st.kind === "unused" && !st.q.trim() ? "Todos los archivos se están usando" : "No hay archivos que coincidan",
            message: st.q.trim() ? `No encontramos archivos para «${st.q.trim()}».` : st.kind === "unused" ? "Ningún archivo de la biblioteca está sin usar." : "Prueba con otro filtro.",
            action: { label: "Ver todos los archivos", onClick: () => { st.q = ""; search.value = ""; ctx.setQuery({ q: null }); setKindRadio(""); setKind(""); }, icon: "refresh" },
            compact: true,
          })));
          return;
        }
        if (st.view === "list" && !st.selecting) {
          if (!table || !body.contains(table.el)) {
            table = buildTable();
            replace(body, table.el);
          }
          table.setRows(list);
          return;
        }
        table = null;
        const shown = list.slice(0, st.limit);
        const focusedId = document.activeElement?.closest?.(".mlib-tile")?.dataset.id;
        const grid = h("div.mlib-grid", { role: "list" }, shown.map((m) => h("div.mlib-grid__cell", { role: "listitem" }, tile(m))));
        const more = list.length > shown.length
          ? h("div.mlib-more", button({ label: `Mostrar más (${number(list.length - shown.length)} restantes)`, icon: "chevron-down", onClick: () => { st.limit += PAGE; refresh(); } }))
          : null;
        replace(body, grid, more);
        if (focusedId) body.querySelector(`.mlib-tile[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
      }
      const scheduleRefresh = debounce(refresh, 120);

      function setKindRadio(v) {
        for (const input of filterGroup.querySelectorAll("input")) input.checked = input.value === v;
      }

      /* --- Selección múltiple --- */
      function toggleSelect(id) {
        if (st.selected.has(id)) st.selected.delete(id);
        else st.selected.add(id);
        const b = body.querySelector(`.mlib-tile[data-id="${CSS.escape(id)}"]`);
        b?.setAttribute("aria-pressed", String(st.selected.has(id)));
        renderSelBar();
      }

      function renderSelBar() {
        selBar.hidden = !st.selecting;
        if (!st.selecting) return;
        const n = st.selected.size;
        selText.textContent = n ? plural(n, "archivo seleccionado", "archivos seleccionados") : "Toca los archivos que quieres eliminar.";
        selNoneBtn.hidden = !n;
        selDelBtn.disabled = !n;
        if (selDelBtn.getAttribute("aria-busy") !== "true") selDelBtn.querySelector(".btn__label").textContent = n ? `Eliminar ${n}` : "Eliminar";
      }

      async function deleteMany(btn) {
        const chosen = items.filter((m) => st.selected.has(m.id));
        if (!chosen.length) return;
        const ok = await confirmDialog({
          title: chosen.length === 1 ? "¿Eliminar el archivo?" : `¿Eliminar ${chosen.length} archivos?`,
          message: "Se borran de la biblioteca y del servidor. No se puede deshacer. Si alguno se está usando en el sitio, te preguntaremos antes de borrarlo. Las versiones del historial (Revisiones) que los usaban se verán sin ellos si las restauras.",
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        const inUse = [];
        let removed = 0;
        await withBusy(btn, async () => {
          for (const m of chosen) {
            try {
              await mediaApi.remove(m.id);
              removeLocal(m.id);
              removed++;
            } catch (e) {
              if (e?.isInUse) inUse.push({ item: m, usages: e.data?.usages || [] });
              else if (e?.status === 404) { removeLocal(m.id); removed++; }
              else showApiError(e);
            }
          }
        }, { label: "Eliminando…" });
        if (removed) toast(removed === 1 ? "Se eliminó 1 archivo." : `Se eliminaron ${removed} archivos.`);
        if (inUse.length) {
          const forced = await confirmForceMany(inUse);
          if (forced) toast(forced === 1 ? "Se eliminó 1 archivo que estaba en uso." : `Se eliminaron ${forced} archivos que estaban en uso.`, { type: "warning" });
        }
        st.selected.clear();
        if (!items.length) setSelecting(false);
        else refresh();
      }

      async function confirmForceMany(list) {
        let forced = 0;
        const m = modal({
          title: list.length === 1 ? "Un archivo está en uso" : `${list.length} archivos están en uso`,
          size: "md",
          content: [
            h("p.modal__text", "Estos archivos aparecen en el sitio. Si los eliminas, en esos lugares se verá un espacio vacío o una imagen rota hasta que elijas otro archivo."),
            h("ul.mlib-inuse", list.map(({ item, usages }) => h("li",
              h("strong", item.name),
              h("ul.usage-list", usages.map((u) => { const d = describeUsage(u); return h("li", d.href ? h("a", { href: d.href }, d.label) : d.label); }))))),
          ],
          actions: [
            { label: "Conservarlos", value: false },
            {
              label: "Eliminar de todas formas",
              variant: "danger",
              onClick: async () => {
                for (const { item } of list) {
                  await mediaApi.remove(item.id, { force: true });
                  removeLocal(item.id);
                  forced++;
                }
              },
              value: true,
            },
          ],
        });
        await m.result;
        return forced;
      }

      /* --- Eliminar --- */
      function removeLocal(id) {
        items = items.filter((m) => m.id !== id);
        st.selected.delete(id);
        usedOverride.delete(id);
      }

      /** Elimina un archivo: confirma; si está en uso explica dónde y ofrece forzar. → true si se borró. */
      async function deleteOne(m, { usages = null, btn = null } = {}) {
        if (usages && usages.length) return confirmForce(m, usages);
        const ok = await confirmDialog({
          title: "¿Eliminar este archivo?",
          message: `«${m.name}» se borrará de la biblioteca y del servidor. No se puede deshacer. Si una versión del historial (Revisiones) lo usaba y la restauras, ese lugar quedará sin imagen o sin video.`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return false;
        try {
          await withBusy(btn, () => mediaApi.remove(m.id), { label: "Eliminando…" });
        } catch (e) {
          if (e?.isInUse) return confirmForce(m, e.data?.usages || []);
          showApiError(e);
          return false;
        }
        afterDelete(m);
        return true;
      }

      async function confirmForce(m, usages) {
        const list = usages.map((u) => ({ u, ...describeUsage(u) }));
        const dlg = modal({
          title: "Este archivo está en uso",
          size: "md",
          content: [
            h("p.modal__text", `«${m.name}» aparece en ${plural(list.length, "lugar", "lugares")} del sitio:`),
            h("ul.usage-list", list.map((it) => h("li", it.href ? h("a", { href: it.href }, it.label) : it.label))),
            notice({ tone: "warning", message: "Si lo eliminas, ahí se verá un espacio vacío o una imagen rota hasta que elijas otro archivo. Lo recomendable es reemplazarlo primero desde esa sección." }),
          ],
          actions: [
            { label: "Conservarlo", value: false },
            { label: "Eliminar de todas formas", variant: "danger", onClick: () => mediaApi.remove(m.id, { force: true }), value: true },
          ],
        });
        const r = await dlg.result;
        if (r !== true) return false;
        afterDelete(m, { forced: true });
        return true;
      }

      function afterDelete(m, { forced = false } = {}) {
        removeLocal(m.id);
        if (detail?.id === m.id) detail.close();
        toast(forced ? `«${m.name}» se eliminó. Revisa los lugares donde estaba.` : `«${m.name}» se eliminó.`, { type: forced ? "warning" : "success" });
        refresh();
        requestAnimationFrame(() => (body.querySelector(".mlib-tile, .mlib-cell__name") || dropBtn).focus({ preventScroll: true }));
      }

      /* ======================================================================
         Detalle de un archivo
         ====================================================================== */
      let detail = null;

      function openDetail(id) {
        const item = items.find((m) => m.id === id);
        if (!item) {
          toast("Ese archivo ya no existe en la biblioteca.", { type: "warning" });
          ctx.setQuery({ archivo: null });
          return;
        }
        if (detail) { detail.show(item); return; }
        detail = createDetail(item);
      }

      function createDetail(first) {
        let current = first;
        let form = null;
        let again = false;
        let usagesReq = 0;
        let currentUsages = null;

        const wrap = h("div.mlib-detail");
        const m = modal({
          title: first.name,
          size: "xl",
          className: "mlib-modal",
          content: wrap,
          onClose: () => {
            flush();
            detail = null;
            if (ctx.isCurrent) ctx.setQuery({ archivo: null });
          },
        });
        const titleEl = m.el.querySelector(".modal__title");
        m.el.addEventListener("keydown", (e) => {
          if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
          if (e.target.closest("input, textarea, select, video, [role='menu']")) return;
          if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
          if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
        });

        function navList() {
          const list = filtered();
          return list.some((x) => x.id === current.id) ? list : items;
        }

        function step(dir) {
          const list = navList();
          const i = list.findIndex((x) => x.id === current.id);
          const next = list[i + dir];
          if (next) show(next, { focusNav: dir < 0 ? "prev" : "next" });
        }

        function flush() {
          if (!form || !form.dirty || form.saving) return;
          const v = form.get();
          const name = String(v.name || "").trim();
          if (!name || [...name].length > 120 || [...String(v.alt || "")].length > 160) {
            toast("No se guardó el cambio del nombre o del texto alternativo porque no es válido.", { type: "warning" });
            return;
          }
          const was = form;
          was.submit().then((ok) => { if (ok) toast(`Se guardaron los cambios de «${name}».`); });
        }

        function show(item, { focusNav } = {}) {
          flush();
          current = item;
          titleEl.textContent = item.name;
          if (ctx.isCurrent) ctx.setQuery({ archivo: item.id });
          render(focusNav);
        }

        function render(focusNav) {
          const item = current;
          const isVideo = item.kind === "video";
          const list = navList();
          const idx = list.findIndex((x) => x.id === item.id);

          /* Vista previa */
          let preview;
          if (isVideo) {
            preview = h("video.mlib-preview__video", {
              src: siteUrl(item.url), controls: true, playsinline: true, preload: "metadata",
              poster: item.thumbUrl ? siteUrl(item.thumbUrl) : null, "aria-label": `Video «${item.name}»`,
            });
            preview.addEventListener("loadedmetadata", () => {
              if (Number.isFinite(preview.duration)) { durations.set(item.id, preview.duration); paintDuration(item.id); }
            }, { once: true });
          } else {
            preview = h("img.mlib-preview__img", { src: siteUrl(item.url), alt: item.alt || "", decoding: "async" });
            preview.addEventListener("error", () => preview.replaceWith(h("div.mlib-preview__broken", icon("alert", { size: 24 }), h("p", "No se pudo cargar la vista previa."))), { once: true });
          }

          /* Datos */
          const dur = isVideo ? fmtDuration(durations.get(item.id)) : "";
          const facts = h("dl.kv.mlib-facts",
            h("dt", "Tipo"), h("dd", typeLabel(item)),
            dimsLabel(item) ? [h("dt", "Medidas"), h("dd", dimsLabel(item))] : null,
            isVideo ? [h("dt", "Duración"), h("dd", { dataset: { dur: item.id } }, dur || "—")] : null,
            h("dt", "Peso"), h("dd", bytes(item.bytes)),
            h("dt", "Subido"), h("dd", h("time", { datetime: item.createdAt, title: relativeTime(item.createdAt) }, dateTime(item.createdAt)), h("span.muted", ` · ${relativeTime(item.createdAt)}`)),
            h("dt", "Subido por"), h("dd", item.createdBy || "—"));
          if (isVideo && !durations.has(item.id)) whenDuration(item, () => paintDuration(item.id));

          /* URL */
          const urlId = uid("mlib-url");
          const full = absoluteUrl(item.url);
          const urlInput = h("input.input.input--sm.mono.mlib-url__input", { id: urlId, type: "text", value: full, readOnly: true, spellcheck: "false" });
          urlInput.addEventListener("focus", () => urlInput.select());
          const copyBtn = button({ label: "Copiar", icon: "copy", size: "sm", onClick: async () => {
            const ok = await copyText(full, urlInput);
            replace(copyBtn.querySelector(".btn__label"), ok ? "Copiada" : "Copiar");
            toast(ok ? "URL copiada al portapapeles." : "No se pudo copiar automáticamente: la URL quedó seleccionada, cópiala con Ctrl/Cmd + C.", { type: ok ? "success" : "info" });
            setTimeout(() => { if (copyBtn.isConnected) replace(copyBtn.querySelector(".btn__label"), "Copiar"); }, 2200);
          } });
          const urlBox = h("div.field.mlib-url",
            h("label.field__label", { for: urlId }, "URL del archivo"),
            h("div.mlib-url__row", urlInput, copyBtn),
            h("p.field__help", "Sirve para pegarla en otro lugar. Dentro del panel, elige el archivo con el botón «Elegir»."),
            h("a.mlib-url__open", { href: siteUrl(item.url), target: "_blank", rel: "noopener" }, icon("external", { size: 14 }), "Abrir en una pestaña nueva"));

          /* Nombre y texto alternativo (se guardan solos) */
          const status = h("p.mlib-save", { "aria-live": "polite" });
          const setStatus = (kind, text) => {
            status.className = `mlib-save is-${kind}`;
            replace(status, kind === "saving" ? spinner() : kind === "saved" ? icon("check-circle", { size: 15 }) : kind === "error" ? icon("alert-circle", { size: 15 }) : icon("info", { size: 15 }), h("span", text));
          };
          form = createForm({
            value: { name: item.name || "", alt: item.alt || "" },
            saveBar: false,
            guard: false,
            successMessage: null,
            onSubmit: async (v) => {
              const it = await mediaApi.update(item.id, { name: v.name.trim(), alt: (v.alt || "").trim() });
              items = items.map((x) => (x.id === it.id ? it : x));
              if (current.id === it.id) { current = it; if (titleEl.isConnected) titleEl.textContent = it.name; }
              scheduleRefresh();
              return { name: it.name, alt: it.alt };
            },
          });
          const myForm = form;
          // Estado visible: «Guardando…» → «Cambios guardados.» o, si algo falló (también la validación del navegador), el aviso.
          const settle = () => setTimeout(() => {
            if (!status.isConnected || myForm.saving) return;
            if (myForm.dirty) setStatus("error", "No se guardó: revisa el campo marcado.");
            else setStatus("saved", "Cambios guardados.");
          }, 30);
          myForm.on("state", ({ saving }) => { if (saving) setStatus("saving", "Guardando…"); else settle(); });
          const save = async () => {
            if (myForm.saving) { again = true; return; }
            if (!myForm.dirty) return;
            await myForm.submit();
            settle();
            if (again) { again = false; save(); }
          };
          setStatus("idle", "Los cambios se guardan solos al salir del campo.");
          const formEl = myForm.element(
            f.text(myForm, "name", { label: "Nombre", required: true, maxlength: 120, help: "Solo se ve en el panel: sirve para encontrar el archivo." }),
            isVideo ? null : f.textarea(myForm, "alt", {
              label: "Texto alternativo", maxlength: 160, rows: 2, optional: true,
              placeholder: "Ej.: Camiseta Fe color crema, vista de frente",
              help: "Describe la imagen para lectores de pantalla y Google. Se copia al elegir esta imagen como foto de un producto.",
            }),
            status);
          formEl.addEventListener("change", () => save());
          formEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") settle(); });

          /* Dónde se usa */
          const usageBody = h("div.mlib-usage__body", h("p.mlib-usage__loading", spinner(), h("span", "Buscando dónde se usa…")));
          const usageBox = h("section.mlib-usage", { "aria-label": "Dónde se usa" }, h("h3.mlib-side__title", "Dónde se usa"), usageBody);

          const delBtn = button({ label: "Eliminar permanentemente", icon: "trash", variant: "ghost", size: "sm", className: "mlib-delete", onClick: () => deleteOne(current, { usages: currentUsages, btn: delBtn }) });

          const prevBtn = iconButton({ icon: "chevron-left", label: "Archivo anterior", variant: "secondary", size: "sm", disabled: idx <= 0, className: "mlib-nav__prev", onClick: () => step(-1) });
          const nextBtn = iconButton({ icon: "chevron-right", label: "Archivo siguiente", variant: "secondary", size: "sm", disabled: idx === -1 || idx >= list.length - 1, className: "mlib-nav__next", onClick: () => step(1) });

          replace(wrap,
            h("div.mlib-preview", { class: isVideo ? "is-video" : "bg-checker" }, preview),
            h("div.mlib-side",
              h("div.mlib-nav", prevBtn, h("span.mlib-nav__count", idx >= 0 ? `${number(idx + 1)} de ${number(list.length)}` : ""), nextBtn,
                h("span.mlib-nav__hint.muted.small", "Usa ← y → para pasar de archivo")),
              facts,
              usageBox,
              formEl,
              urlBox,
              h("div.mlib-side__danger", delBtn)));

          if (focusNav) {
            const target = focusNav === "prev" ? prevBtn : nextBtn;
            (target.disabled ? (focusNav === "prev" ? nextBtn : prevBtn) : target).focus();
          }
          loadUsages(item, usageBody);
        }

        async function loadUsages(item, box) {
          const my = ++usagesReq;
          currentUsages = null;
          try {
            const r = await mediaApi.get(item.id);
            if (my !== usagesReq || !box.isConnected) return;
            currentUsages = r.usages || [];
            usedOverride.set(item.id, currentUsages.length > 0);
            scheduleRefresh();
            if (!currentUsages.length) {
              replace(box, h("p.mlib-usage__none", icon("check-circle", { size: 16 }),
                h("span", "No se usa en el contenido actual del sitio: puedes eliminarlo sin afectar la tienda de hoy. Si una versión anterior (Revisiones) lo usaba y la restauras, ahí se verá sin este archivo.")));
              return;
            }
            replace(box,
              h("p.small.muted", `Se usa en ${plural(currentUsages.length, "lugar", "lugares")}. Si lo eliminas, ahí quedará un hueco.`),
              h("ul.mlib-usage__list", currentUsages.map((u) => {
                const d = describeUsage(u);
                const sh = storeHref(u);
                const sec = u.startsWith("products/") ? "products" : u.split(".")[0];
                return h("li.mlib-usage__item",
                  h("span.mlib-usage__icon", icon(USAGE_ICON[sec] || "link", { size: 15 })),
                  d.href ? h("a.mlib-usage__link", { href: d.href }, d.label) : h("span", d.label),
                  sh ? h("a.mlib-usage__store", { href: sh, target: "_blank", rel: "noopener", title: "Ver en la tienda (pestaña nueva)" }, icon("external", { size: 13 }), h("span", "Ver en la tienda")) : null);
              })));
          } catch (e) {
            if (my !== usagesReq || !box.isConnected || isAbort(e)) return;
            if (e?.status === 404) {
              replace(box, notice({ tone: "warning", message: "Este archivo ya no existe: otra persona lo eliminó." }));
              removeLocal(item.id);
              scheduleRefresh();
              return;
            }
            replace(box, h("div.mlib-usage__error",
              h("p.small", icon("alert-circle", { size: 15 }), h("span", e?.message || "No se pudo consultar dónde se usa.")),
              button({ label: "Reintentar", icon: "refresh", size: "sm", variant: "ghost", onClick: () => loadUsages(item, box) })));
          }
        }

        if (ctx.isCurrent) ctx.setQuery({ archivo: first.id });
        render();
        return { get id() { return current.id; }, show, close: () => m.close(null) };
      }

      /* --- Montaje --- */
      el.append(h("div.page.mlib",
        pageHeader({
          title: "Biblioteca de medios",
          breadcrumbs: [{ label: "Medios" }],
          subtitle: "Fotos y videos del sitio. Los que subas aquí los puedes elegir en el inicio, en los productos, en el modal de descuento y en los logos.",
          actions: [button({ label: "Subir archivos", icon: "upload", variant: "primary", onClick: pickFiles })],
        }),
        dropZone,
        queueCard,
        libraryCard,
        fileInput,
        overlay));
      refresh();

      const wanted = ctx.query.get("archivo");
      if (wanted) setTimeout(() => { if (ctx.isCurrent) openDetail(wanted); }, 60);

      return () => { if (detail) detail.close(); };
    },
  },
];
