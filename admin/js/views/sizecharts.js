/* ==========================================================================
   Mercy Studio · Panel — views/sizecharts.js
   Guía de tallas (#/tallas): una guía por tipo de prenda (Camisetas, Hoodies…) con sus columnas
   (Talla, Pecho, Largo…), una tabla de filas por horma y la vista previa como en la tienda.
   · Guardar = PUT /api/admin/content/sizeCharts con TODAS las guías ({ items } + errorPrefix "items").
   · Todas las guías quedan montadas (ocultas las no elegidas): un error del servidor abre la guía,
     la pestaña de la horma y la celda correspondientes.
   · Las categorías eligen su guía (#/categorias); una guía en uso no se puede borrar ni cambiar de id.
   · ?guia=<id> abre esa guía (lo usan Categorías y Hormas).
   · Celdas: Enter / flechas para moverse; pegar desde una hoja de cálculo llena varias filas.
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { content } from "../core/store.js";
import { fields as f } from "../core/forms.js";
import { badge, button, card, confirmDialog, emptyState, iconButton, menu, notice, tabs, toast } from "../core/ui.js";
import { clone, plural } from "../core/format.js";
import { STORE, autoId, blockedDialog, header, idField, listForm, liveRegistry, maxChars, uniqueSlug, usagePhrase } from "./taxonomies.js";

const enc = encodeURIComponent;
const MAX_GUIDES = 30;
const MIN_COLS = 2;
const MAX_COLS = 8;
const MAX_ROWS = 30;
const CELL_MAX = 12;

/* ---------- Celdas ---------- */
/** Texto escrito → número (acepta coma decimal, 1 decimal como el servidor) o texto corto ("51–53"). */
function parseCell(raw) {
  const t = String(raw ?? "").trim();
  if (t === "") return "";
  if (/^\d+(?:[.,]\d*)?$/.test(t)) return Math.round(Number(t.replace(",", ".")) * 10) / 10;
  return t;
}
/** Valor guardado → texto del campo (coma decimal). */
const showCell = (v) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v));
/** Valor guardado → texto como lo muestra la tienda: coma decimal es-CO, igual que measure() de js/layout.js
 *  (52.5 → "52,5"; en textos "50.5-52" → "50,5-52", solo decimales de 1–2 cifras para no tocar "1.000"). */
const storeCell = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return isFinite(v) ? String(v).replace(".", ",") : "";
  return String(v).replace(/(\d)\.(\d{1,2})(?!\d)/g, "$1,$2");
};
const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
const len = (s) => [...String(s ?? "")].length;

/** ¿La guía tiene al menos una fila con talla? (sin filas, la tienda no la publica) */
const rowsWithSize = (list) => (Array.isArray(list) ? list.filter((r) => Array.isArray(r) && !isBlank(r[0])) : []);
const hasRows = (g) => Object.values(g?.rows || {}).some((list) => rowsWithSize(list).length > 0);
const countRows = (g) => Object.values(g?.rows || {}).reduce((s, list) => s + (Array.isArray(list) ? list.length : 0), 0);

const DEFAULT_SIZES = ["S", "M", "L", "XL"];

export default [
  {
    path: "/tallas",
    title: "Guía de tallas",
    async render(el, params, ctx) {
      const data = await content.load({ force: true });
      const fits = data.fits || [];
      const categories = data.categories || [];
      const products = data.products || [];
      const note = String(data.texts?.sizeGuideNote || "").trim();
      const form = listForm(ctx, "sizeCharts", await content.section("sizeCharts"), { successMessage: "Guía de tallas guardada. Ya se ve en la tienda." });
      const live = liveRegistry(form);

      const fitName = (id) => fits.find((x) => x.id === id)?.name || id;
      const guide = (gi) => form.get(`items.${gi}`);
      const guides = () => form.get("items") || [];
      const catsUsing = (id) => (id ? categories.filter((c) => c.sizeChart === id) : []);
      const productsIn = (catId) => products.filter((p) => p.category === catId);

      /* ---------- Estado de la pantalla ---------- */
      let sel = Math.max(0, guides().findIndex((g) => g.id === ctx.query.get("guia")));
      const fitTab = new Map();       // índice de guía → horma visible
      const tabsOf = new Map();       // índice de guía → componente de pestañas
      const listEl = h("ul.sc-guides", { role: "tablist", "aria-orientation": "vertical", "aria-label": "Guías de tallas" });
      const panelsEl = h("div.sc-panels");
      const previewEl = h("div.sc-pv", { "aria-live": "off" });
      const tabId = (gi) => `sc-tab-${gi}`;
      const panelId = (gi) => `sc-panel-${gi}`;

      const currentFit = (gi) => {
        const keys = Object.keys(guide(gi)?.rows || {});
        const k = fitTab.get(gi);
        return keys.includes(k) ? k : keys[0] || null;
      };

      /* ---------- Selección ---------- */
      function select(gi, { focus = false } = {}) {
        const n = guides().length;
        if (!n) return;
        sel = Math.min(Math.max(0, gi), n - 1);
        listEl.querySelectorAll(".sc-guide").forEach((b, i) => {
          b.setAttribute("aria-selected", String(i === sel));
          b.tabIndex = i === sel ? 0 : -1;
          b.classList.toggle("is-on", i === sel);
        });
        panelsEl.querySelectorAll(":scope > .sc-panel").forEach((p, i) => { p.hidden = i !== sel; });
        const g = guide(sel);
        ctx.setQuery({ guia: g && !g._new && g.id ? g.id : null });
        renderPreview();
        updateStoreLink();
        if (focus) listEl.querySelectorAll(".sc-guide")[sel]?.focus();
      }

      listEl.addEventListener("keydown", (e) => {
        const n = guides().length;
        let to = null;
        // Vertical en escritorio y horizontal en el celular: sirven las cuatro flechas
        if (e.key === "ArrowDown" || e.key === "ArrowRight") to = (sel + 1) % n;
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = (sel - 1 + n) % n;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = n - 1;
        if (to === null) return;
        e.preventDefault();
        select(to, { focus: true });
      });

      /* ---------- Lista de guías ---------- */
      function guideButton(gi) {
        const p = `items.${gi}`;
        const name = h("span.sc-guide__name");
        const meta = h("span.sc-guide__meta");
        const cats = h("span.sc-guide__cats");
        const errMark = h("span.sc-guide__err", { hidden: true }, icon("alert-circle", { size: 15 }), h("span.sr-only", " (tiene errores)"));
        const btn = h("button.sc-guide", { type: "button", role: "tab", id: tabId(gi), "aria-controls": panelId(gi), onClick: () => select(gi) },
          h("span.sc-guide__icon", icon("ruler", { size: 18 })),
          h("span.sc-guide__text", h("span.sc-guide__row", name, errMark), meta, cats));
        live(btn, () => {
          const g = form.get(p);
          if (!g) return;
          name.textContent = g.name || "Guía sin nombre";
          const keys = Object.keys(g.rows || {});
          meta.textContent = [g.unit || "cm", plural(keys.length, "horma", "hormas"), plural(countRows(g), "fila", "filas")].join(" · ");
          const used = g._new ? [] : catsUsing(g.id);
          replace(cats, g._new ? badge("Nueva", "accent") : used.length ? `Categorías: ${used.map((c) => c.name).join(", ")}` : h("span.sc-guide__none", "Sin categoría"));
        });
        // Errores del servidor que no tienen un campo más preciso
        form.register({
          path: p,
          el: btn,
          sync() {},
          setError(msg) { btn.classList.toggle("has-error", !!msg); btn.title = msg || ""; },
          focus() { select(gi, { focus: true }); },
        });
        return h("li", { role: "presentation" }, btn);
      }

      /* Marca en la lista las guías que tienen campos con error */
      const markErrors = () => {
        const btns = listEl.querySelectorAll(".sc-guide");
        panelsEl.querySelectorAll(":scope > .sc-panel").forEach((panel, i) => {
          const bad = !!panel.querySelector('[aria-invalid="true"]') || btns[i]?.classList.contains("has-error");
          const mark = btns[i]?.querySelector(".sc-guide__err");
          if (mark) mark.hidden = !bad;
        });
      };
      let markQueued = false;
      const observer = new MutationObserver(() => {
        if (markQueued) return;
        markQueued = true;
        queueMicrotask(() => { markQueued = false; markErrors(); });
      });
      observer.observe(panelsEl, { subtree: true, attributes: true, attributeFilter: ["aria-invalid"] });
      ctx.onCleanup(() => observer.disconnect());

      /* ---------- Panel de una guía ---------- */
      function guidePanel(gi) {
        const panel = h("section.sc-panel", { id: panelId(gi), role: "tabpanel", "aria-labelledby": tabId(gi), hidden: gi !== sel, "data-reveal": "" });
        panel.addEventListener("reveal", () => select(gi));
        fillPanel(panel, gi);
        return panel;
      }

      function fillPanel(panel, gi) {
        tabsOf.delete(gi);
        replace(panel, dataCard(gi), measuresCard(gi));
      }

      /** Vuelve a dibujar una guía (tras agregar/quitar columnas, hormas o filas) y enfoca `focusSel`. */
      function redrawGuide(gi, focusSel) {
        const panel = panelsEl.querySelector(`#${panelId(gi)}`);
        if (!panel) return renderAll();
        fillPanel(panel, gi);
        renderPreview();
        if (focusSel) requestAnimationFrame(() => panel.querySelector(focusSel)?.focus());
      }

      function dataCard(gi) {
        const p = `items.${gi}`;
        const g = guide(gi);
        const used = g._new ? [] : catsUsing(g.id);
        const n = guides().length;
        const actions = menu({
          label: "Acciones de la guía",
          items: [
            { label: "Subir en la lista", icon: "arrow-up", disabled: gi === 0, onClick: () => moveGuide(gi, gi - 1) },
            { label: "Bajar en la lista", icon: "arrow-down", disabled: gi === n - 1, onClick: () => moveGuide(gi, gi + 1) },
            { divider: true },
            { label: "Duplicar guía", icon: "copy", disabled: n >= MAX_GUIDES, onClick: () => duplicateGuide(gi) },
            { label: "Eliminar guía", icon: "trash", danger: true, onClick: () => removeGuide(gi) },
          ],
        });
        let usage;
        if (g._new) {
          usage = notice({ tone: "info", message: "Guía nueva: después de guardarla, elígela en Categorías para que se abra desde la ficha de esos productos." });
        } else if (used.length) {
          usage = h("div.sc-usage",
            icon("folder", { size: 16 }),
            h("p", used.length === 1 ? "La usa la categoría " : "La usan las categorías ",
              used.map((c, i) => [i ? (i === used.length - 1 ? " y " : ", ") : "", h("a", { href: "#/categorias" }, c.name), ` (${plural(productsIn(c.id).length, "producto", "productos")})`]),
              ". Se abre con «Guía de tallas» y en «Medidas» de la ficha de producto."));
        } else {
          usage = notice({ tone: "warning", message: "Ninguna categoría usa esta guía. Elígela en Categorías para que se abra desde la ficha de producto; mientras tanto solo aparece en la guía general del pie de página." , action: button({ label: "Ir a Categorías", size: "sm", href: "#/categorias" }) });
        }
        return card({
          title: "Datos de la guía",
          actions,
          body: [
            f.row(
              f.text(form, `${p}.name`, { label: "Nombre", required: true, validate: maxChars(60), placeholder: "Ej.: Camisetas", help: "Pestaña de la guía en la tienda.", onChange: autoId(form, p) }),
              idField(form, p, { item: g, usedBy: usagePhrase("la", [[used.length, "categoría", "categorías"]]) }),
              f.text(form, `${p}.unit`, { label: "Unidad", validate: maxChars(10), placeholder: "cm", help: "Va junto a cada medida: «Pecho (cm)»." }),
              { cols: 3 }),
            usage,
          ],
        });
      }

      function measuresCard(gi) {
        return card({
          title: "Medidas",
          description: "Una tabla por horma. Usa Enter o las flechas para moverte entre celdas; también puedes pegar filas copiadas de una hoja de cálculo.",
          body: [columnsEditor(gi), fitsEditor(gi)],
        });
      }

      /* ---------- Columnas ---------- */
      function columnsEditor(gi) {
        const p = `items.${gi}`;
        const head = guide(gi).head || [];
        const err = h("p.field__error", { hidden: true });
        const items = head.map((_, ci) => columnChip(gi, ci));
        const box = h("fieldset.field.field--group.sc-cols",
          h("legend.field__label", "Columnas"),
          h("p.field__help", "La primera es la talla; las demás son las medidas que verá la clienta (entre 2 y 8 columnas)."),
          h("ol.sc-cols__list", items),
          h("div.sc-cols__foot",
            button({ label: "Agregar columna", icon: "plus", size: "sm", disabled: head.length >= MAX_COLS, onClick: () => addColumn(gi) }),
            h("span.list-field__limit", `${head.length}/${MAX_COLS}`)),
          err);
        form.register({
          path: `${p}.head`,
          el: box,
          sync() {},
          setError(msg) {
            err.hidden = !msg;
            replace(err, msg ? [icon("alert-circle", { size: 14 }), h("span", msg)] : null);
          },
          focus() { box.querySelector("input")?.focus(); },
          validate: () => {
            const n = (form.get(`${p}.head`) || []).length;
            return n < MIN_COLS ? "Agrega al menos una medida además de la talla." : n > MAX_COLS ? `Máximo ${MAX_COLS} columnas.` : null;
          },
        });
        return box;
      }

      function columnChip(gi, ci) {
        const path = `items.${gi}.head.${ci}`;
        const id = uid("sc-col");
        const errId = `${id}-e`;
        const input = h("input.input.input--sm.sc-cols__input", { id, type: "text", autocomplete: "off", placeholder: ci ? "Medida" : "Talla", "aria-describedby": errId, dataset: { path } });
        const err = h("span.sc-cols__err", { id: errId, hidden: true });
        const rm = ci === 0
          ? h("span.sc-cols__lock", { title: "La columna de la talla no se puede quitar" }, icon("lock", { size: 13 }))
          : iconButton({ icon: "x", label: "Quitar columna", size: "sm", className: "sc-cols__rm", onClick: () => removeColumn(gi, ci) });
        const li = h("li.sc-cols__item", { class: ci === 0 && "is-first" }, h("span.sc-cols__num", { "aria-hidden": "true" }, ci === 0 ? "1" : String(ci + 1)), input, rm, err);
        live(input, () => {
          const name = form.get(path) || "";
          input.setAttribute("aria-label", ci === 0 ? "Nombre de la columna de la talla" : `Nombre de la columna ${ci + 1}`);
          if (ci) rm.setAttribute("aria-label", `Quitar la columna «${name || ci + 1}»`);
          if (ci) rm.title = `Quitar la columna «${name || ci + 1}»`;
        });
        let entry;
        input.addEventListener("input", () => form.set(path, input.value, { source: entry }));
        input.addEventListener("blur", () => { const v = String(form.get(path) ?? ""); if (v.trim() !== v) form.set(path, v.trim()); });
        entry = {
          path,
          el: li,
          sync: () => { input.value = form.get(path) ?? ""; },
          setError(msg) {
            li.classList.toggle("has-error", !!msg);
            input.setAttribute("aria-invalid", msg ? "true" : "false");
            err.hidden = !msg;
            err.textContent = msg || "";
          },
          focus: () => input.focus(),
          validate: () => {
            const v = String(form.get(path) ?? "").trim();
            if (!v) return "Escribe el nombre de la columna.";
            if (len(v) > 30) return "Máximo 30 caracteres.";
            const head = form.get(`items.${gi}.head`) || [];
            if (head.some((x, j) => j !== ci && String(x ?? "").trim().toLowerCase() === v.toLowerCase())) return "Ya hay otra columna con este nombre.";
            return null;
          },
        };
        form.register(entry);
        entry.sync();
        return li;
      }

      function addColumn(gi) {
        form.update(`items.${gi}`, (g) => {
          g.head = [...(g.head || []), ""];
          for (const k of Object.keys(g.rows || {})) g.rows[k] = g.rows[k].map((r) => [...r, ""]);
          return g;
        });
        const n = guide(gi).head.length;
        redrawGuide(gi, `.sc-cols__item:nth-child(${n}) input`);
      }

      async function removeColumn(gi, ci) {
        const g = guide(gi);
        const name = g.head[ci] || `columna ${ci + 1}`;
        if ((g.head || []).length <= MIN_COLS) {
          toast("La guía necesita al menos una medida además de la talla.", { type: "warning" });
          return;
        }
        const filled = Object.values(g.rows || {}).reduce((s, list) => s + list.filter((r) => !isBlank(r[ci])).length, 0);
        if (filled) {
          const ok = await confirmDialog({
            title: `¿Quitar la columna «${name}»?`,
            message: `Se borrarán sus ${plural(filled, "valor", "valores")} en todas las hormas de esta guía.`,
            confirmLabel: "Quitar columna",
            danger: true,
          });
          if (!ok) return;
        }
        form.update(`items.${gi}`, (x) => {
          x.head.splice(ci, 1);
          for (const k of Object.keys(x.rows || {})) x.rows[k] = x.rows[k].map((r) => r.filter((_, j) => j !== ci));
          return x;
        });
        redrawGuide(gi, ".sc-cols__foot .btn");
      }

      /* ---------- Hormas (pestañas) ---------- */
      function fitsEditor(gi) {
        const g = guide(gi);
        const keys = Object.keys(g.rows || {});
        const available = fits.filter((x) => !keys.includes(x.id));
        const addBtn = button({ label: "Agregar horma", icon: "plus", size: "sm", disabled: !available.length, title: available.length ? null : "Ya están todas las hormas" });
        if (available.length) {
          menu({ trigger: addBtn, label: "Hormas disponibles", items: available.map((x) => ({ label: x.name, icon: "scissors", onClick: () => addFit(gi, x.id) })) });
        }
        if (!fits.length) {
          return notice({ tone: "warning", title: "Aún no hay hormas", message: "Las filas de la guía son por horma (Regular, Oversize…). Crea al menos una en Hormas.", action: button({ label: "Ir a Hormas", size: "sm", href: "#/hormas" }) });
        }
        if (!keys.length) {
          return h("div.sc-nofits", emptyState({ icon: "ruler", compact: true, title: "Esta guía aún no tiene medidas", message: "Agrega una horma para empezar su tabla. Sin filas, la guía no aparece en la tienda.", action: addBtn }));
        }
        const t = tabs({
          label: `Hormas de la guía «${g.name || "sin nombre"}»`,
          className: "sc-fit-tabs",
          active: currentFit(gi),
          onChange: (k) => { fitTab.set(gi, k); renderPreview(); },
          items: keys.map((k) => ({ id: k, label: fitName(k), badge: (g.rows[k] || []).length, content: () => fitPanel(gi, k) })),
        });
        tabsOf.set(gi, t);
        const list = t.el.querySelector(".tabs__list");
        const bar = h("div.sc-fitbar");
        list.before(bar);
        bar.append(list, h("div.sc-fitbar__add", addBtn));
        return t.el;
      }

      function addFit(gi, fitId) {
        const from = currentFit(gi);
        const g = guide(gi);
        const ncols = (g.head || []).length;
        const copied = from && (g.rows[from] || []).length ? clone(g.rows[from]) : DEFAULT_SIZES.map((s) => [s, ...Array(Math.max(0, ncols - 1)).fill("")]);
        form.update(`items.${gi}`, (x) => {
          const rows = { ...(x.rows || {}), [fitId]: copied };
          // Pestañas en el orden de Hormas
          const order = fits.map((ft) => ft.id);
          x.rows = Object.fromEntries(Object.keys(rows).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((k) => [k, rows[k]]));
          return x;
        });
        fitTab.set(gi, fitId);
        redrawGuide(gi, ".sc-fit-tabs .tabs__tab[aria-selected='true']");
        toast(from && copied.length ? `Agregaste ${fitName(fitId)} con las filas de ${fitName(from)}: ajusta las medidas.` : `Agregaste ${fitName(fitId)}: escribe sus medidas.`, { type: "info" });
      }

      async function removeFit(gi, k) {
        const g = guide(gi);
        const n = (g.rows[k] || []).length;
        const ok = await confirmDialog({
          title: `¿Quitar la horma «${fitName(k)}» de esta guía?`,
          message: n ? `Se quitarán sus ${plural(n, "fila", "filas")} de la guía «${g.name || "sin nombre"}» cuando guardes.` : "Se quitará de esta guía cuando guardes.",
          confirmLabel: "Quitar horma",
          danger: true,
        });
        if (!ok) return;
        form.update(`items.${gi}`, (x) => { delete x.rows[k]; return x; });
        fitTab.delete(gi);
        redrawGuide(gi, ".sc-fitbar .tabs__tab[aria-selected='true'], .sc-nofits .btn");
      }

      /** Menú "Copiar filas de otra horma" (de esta guía o de otra). */
      function copyMenu(gi, k) {
        const own = Object.keys(guide(gi).rows || {}).filter((x) => x !== k && (guide(gi).rows[x] || []).length);
        const others = [];
        guides().forEach((g, j) => {
          if (j === gi) return;
          for (const x of Object.keys(g.rows || {})) if ((g.rows[x] || []).length) others.push({ j, x, g });
        });
        const items = [
          ...own.map((x) => ({ label: `${fitName(x)} (${plural(guide(gi).rows[x].length, "fila", "filas")})`, icon: "copy", onClick: () => copyRows(gi, k, gi, x) })),
          others.length && own.length ? { divider: true } : null,
          others.length ? { header: h("span.sc-menu-head", "De otra guía") } : null,
          ...others.map(({ j, x, g }) => ({ label: `${g.name || "Sin nombre"} · ${fitName(x)}`, icon: "copy", onClick: () => copyRows(gi, k, j, x) })),
        ].filter(Boolean);
        const trigger = button({ label: "Copiar filas de…", icon: "copy", size: "sm", disabled: !items.length, title: items.length ? null : "No hay otras hormas con filas" });
        if (items.length) menu({ trigger, label: "Copiar filas de otra horma", items });
        return trigger;
      }

      async function copyRows(gi, k, sgi, sk) {
        const dest = guide(gi);
        const src = guide(sgi);
        const ncols = (dest.head || []).length;
        const n = (dest.rows[k] || []).length;
        const srcLabel = sgi === gi ? fitName(sk) : `${src.name || "otra guía"} · ${fitName(sk)}`;
        if (n) {
          const ok = await confirmDialog({
            title: `¿Reemplazar las filas de ${fitName(k)}?`,
            message: `Las ${plural(n, "fila", "filas")} de ${fitName(k)} se cambiarán por una copia de ${srcLabel}.`,
            confirmLabel: "Reemplazar",
            danger: true,
          });
          if (!ok) return;
        }
        const rows = clone(src.rows[sk] || []).slice(0, MAX_ROWS).map((r) => Array.from({ length: ncols }, (_, c) => (r[c] === undefined ? "" : r[c])));
        form.set(`items.${gi}.rows.${k}`, rows);
        redrawGuide(gi, ".sc-fit-tabs .tabs__panel:not([hidden]) .sc-cell input");
        const lost = sgi !== gi && (src.head || []).length > ncols;
        toast(`Se copiaron ${plural(rows.length, "fila", "filas")} de ${srcLabel}.${lost ? " Las columnas que sobraban no se copiaron." : ""}`, { type: lost ? "warning" : "success" });
      }

      /* ---------- Tabla de filas de una horma ---------- */
      function fitPanel(gi, k) {
        const fp = `items.${gi}.rows.${k}`;
        const fitErr = h("p.field__error", { hidden: true });
        const issues = issueList(gi, k);
        const tools = h("div.sc-fit__tools",
          copyMenu(gi, k),
          button({ label: `Quitar ${fitName(k)}`, icon: "trash", size: "sm", variant: "ghost", className: "sc-danger", onClick: () => removeFit(gi, k) }));
        const wrap = h("div.sc-fit", tools, fitErr, rowsTable(gi, k, issues), issues.el);
        form.register({
          path: fp,
          el: wrap,
          sync() {},
          setError(msg) {
            fitErr.hidden = !msg;
            replace(fitErr, msg ? [icon("alert-circle", { size: 14 }), h("span", msg)] : null);
          },
          focus() { wrap.querySelector(".sc-cell input, .sc-grid__foot .btn")?.focus(); },
          validate: () => ((form.get(fp) || []).length > MAX_ROWS ? `Máximo ${MAX_ROWS} filas por horma.` : null),
        });
        return wrap;
      }

      /** Resumen de errores de las celdas (debajo de la tabla), con botón para ir a cada una. */
      function issueList(gi, k) {
        const map = new Map(); // ruta → { label, msg, focus }
        const el = h("div.sc-issues", { hidden: true, role: "alert" });
        let queued = false;
        const draw = () => {
          queued = false;
          el.hidden = !map.size;
          replace(el, map.size ? [
            h("p.sc-issues__title", icon("alert-circle", { size: 15 }), map.size === 1 ? "Revisa esta celda:" : `Revisa estas ${map.size} celdas:`),
            h("ul", [...map.values()].slice(0, 8).map((it) => h("li", h("button.sc-issues__btn", { type: "button", onClick: it.focus }, h("strong", it.label), ` ${it.msg}`)))),
          ] : null);
        };
        return {
          el,
          set(path, item) {
            if (item) map.set(path, item);
            else map.delete(path);
            if (!queued) { queued = true; queueMicrotask(draw); }
          },
        };
      }

      function rowsTable(gi, k, issues) {
        const p = `items.${gi}`;
        const fp = `${p}.rows.${k}`;
        const head = guide(gi).head || [];
        const rows = form.get(fp) || [];
        const g = guide(gi);
        const thead = h("thead", h("tr",
          h("th.sc-grid__drag", { scope: "col" }, h("span.sr-only", "Mover")),
          head.map((_, ci) => live(h("th", { scope: "col", class: ci === 0 && "is-size" }), (th) => {
            const hd = form.get(`${p}.head`) || [];
            const unit = String(form.get(`${p}.unit`) || "").trim();
            if (ci >= hd.length) return;
            th.textContent = (String(hd[ci] || "").trim() || (ci ? `Columna ${ci + 1}` : "Talla")) + (ci && unit ? ` (${unit})` : "");
          })),
          h("th.sc-grid__actions", { scope: "col" }, h("span.sr-only", "Acciones"))));
        const tbody = h("tbody");
        rows.forEach((_, r) => tbody.append(rowEl(gi, k, r, head.length, tbody, issues)));
        if (!rows.length) tbody.append(h("tr", h("td.sc-grid__empty", { colspan: head.length + 2 }, "Sin filas. Agrega la primera talla.")));
        return h("div.sc-grid-box",
          h("div.sc-grid-scroll", h("table.sc-grid", h("caption.sr-only", `Medidas de «${g.name || "guía sin nombre"}», horma ${fitName(k)}`), thead, tbody)),
          h("div.sc-grid__foot",
            button({ label: "Agregar fila", icon: "plus", size: "sm", disabled: rows.length >= MAX_ROWS, onClick: () => addRow(gi, k) }),
            h("span.list-field__limit", `${rows.length}/${MAX_ROWS}`)));
      }

      function rowEl(gi, k, r, ncols, tbody, issues) {
        const fp = `items.${gi}.rows.${k}`;
        const rp = `${fp}.${r}`;
        const total = (form.get(fp) || []).length;
        const tr = h("tr.sc-row", { dataset: { r } });
        const handle = h("span.sc-handle", { title: "Arrastra para ordenar", "aria-hidden": "true" }, icon("grip", { size: 16 }));
        tr.append(h("td.sc-grid__drag", handle));
        const sizeOf = () => String((form.get(rp) || [])[0] ?? "").trim();
        const rowLabel = () => `Fila ${r + 1}${sizeOf() ? ` (${sizeOf()})` : ""}`;
        for (let ci = 0; ci < ncols; ci++) tr.append(cell(gi, k, r, ci, tbody, issues, rowLabel));
        const up = iconButton({ icon: "arrow-up", label: `Subir la fila ${r + 1}`, size: "sm", className: "sc-row__up", disabled: r === 0, onClick: () => moveRow(gi, k, r, r - 1, ".sc-row__up") });
        const down = iconButton({ icon: "arrow-down", label: `Bajar la fila ${r + 1}`, size: "sm", className: "sc-row__down", disabled: r === total - 1, onClick: () => moveRow(gi, k, r, r + 1, ".sc-row__down") });
        const rm = iconButton({ icon: "trash", label: `Quitar la fila ${r + 1}`, size: "sm", className: "sc-row__rm", onClick: () => removeRow(gi, k, r) });
        // En el celular, las mismas acciones en un menú "⋯" (ocupa menos ancho)
        const more = menu({
          label: "Acciones de la fila",
          size: "sm",
          items: () => [
            { label: "Subir", icon: "arrow-up", disabled: r === 0, onClick: () => moveRow(gi, k, r, r - 1, ".sc-row__more") },
            { label: "Bajar", icon: "arrow-down", disabled: r === total - 1, onClick: () => moveRow(gi, k, r, r + 1, ".sc-row__more") },
            { divider: true },
            { label: "Quitar fila", icon: "trash", danger: true, onClick: () => removeRow(gi, k, r) },
          ],
        });
        more.classList.add("sc-row__more");
        tr.append(h("td.sc-grid__actions", h("div.sc-row__actions", up, down, rm, more)));
        // Nombres accesibles con la talla actual
        const names = () => {
          const t = rowLabel().toLowerCase();
          up.setAttribute("aria-label", `Subir la ${t}`);
          down.setAttribute("aria-label", `Bajar la ${t}`);
          rm.setAttribute("aria-label", `Quitar la ${t}`);
          rm.title = `Quitar la ${t}`;
          more.setAttribute("aria-label", `Acciones de la ${t}`);
          more.title = `Acciones de la ${t}`;
        };
        tr.addEventListener("focusin", names);
        names();
        // Errores de la fila completa (p. ej. "Cada fila debe tener 4 columnas.")
        form.register({
          path: rp,
          el: tr,
          sync() {},
          setError(msg) {
            tr.classList.toggle("is-invalid", !!msg);
            issues.set(rp, msg ? { label: rowLabel(), msg, focus: () => tr.querySelector("input")?.focus() } : null);
          },
          focus() { tr.querySelector("input")?.focus(); },
        });
        // Arrastrar para ordenar (desde el asa)
        handle.addEventListener("pointerdown", () => { tr.draggable = true; });
        tr.addEventListener("dragstart", (e) => {
          if (!tr.draggable) { e.preventDefault(); return; }
          tbody.dataset.dragFrom = String(r);
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", String(r)); } catch { /* Safari */ }
          requestAnimationFrame(() => tr.classList.add("is-dragging"));
        });
        tr.addEventListener("dragend", () => {
          tr.draggable = false;
          tr.classList.remove("is-dragging");
          delete tbody.dataset.dragFrom;
          tbody.querySelectorAll("[data-drop]").forEach((x) => x.removeAttribute("data-drop"));
        });
        tr.addEventListener("dragover", (e) => {
          if (tbody.dataset.dragFrom === undefined) return;
          e.preventDefault();
          const b = tr.getBoundingClientRect();
          tr.dataset.drop = e.clientY > b.top + b.height / 2 ? "after" : "before";
        });
        tr.addEventListener("dragleave", () => tr.removeAttribute("data-drop"));
        tr.addEventListener("drop", (e) => {
          if (tbody.dataset.dragFrom === undefined) return;
          e.preventDefault();
          const from = Number(tbody.dataset.dragFrom);
          let to = tr.dataset.drop === "after" ? r + 1 : r;
          if (from < to) to -= 1;
          tr.removeAttribute("data-drop");
          moveRow(gi, k, from, to, ".sc-handle");
        });
        return tr;
      }

      function cell(gi, k, r, ci, tbody, issues, rowLabel) {
        const fp = `items.${gi}.rows.${k}`;
        const path = `${fp}.${r}.${ci}`;
        const colName = () => {
          const hd = form.get(`items.${gi}.head`) || [];
          return String(hd[ci] || "").trim() || (ci ? `Columna ${ci + 1}` : "Talla");
        };
        const label = () => (ci === 0 ? `Talla de la fila ${r + 1}` : `${colName()}, ${rowLabel().toLowerCase()}`);
        const errId = uid("sc-ce");
        const input = h("input.sc-cell__input", {
          type: "text", autocomplete: "off", spellcheck: "false", inputmode: ci ? "decimal" : "text",
          placeholder: ci ? "" : "Talla", "aria-describedby": errId, "aria-label": label(), dataset: { path },
        });
        const err = h("span.sr-only", { id: errId });
        const td = h("td.sc-cell", { class: ci === 0 && "sc-cell--size" }, input, err);
        let entry;
        input.addEventListener("focus", () => input.setAttribute("aria-label", label()));
        input.addEventListener("input", () => form.set(path, ci ? parseCell(input.value) : input.value, { source: entry }));
        input.addEventListener("blur", () => {
          const v = form.get(path);
          if (ci === 0 && typeof v === "string" && v.trim() !== v) form.set(path, v.trim());
          else if (showCell(v) !== input.value) input.value = showCell(v);
        });
        // Moverse como en una hoja de cálculo
        input.addEventListener("keydown", (e) => {
          let dr = 0;
          if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) dr = 1;
          else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) dr = -1;
          if (!dr) return;
          const next = tbody.querySelectorAll(":scope > tr.sc-row")[r + dr]?.querySelectorAll("input")[ci];
          if (next) { e.preventDefault(); next.focus(); next.select(); }
          else if (e.key === "Enter") e.preventDefault();
        });
        // Pegar varias celdas (tabuladores / saltos de línea de una hoja de cálculo)
        input.addEventListener("paste", (e) => {
          const text = e.clipboardData?.getData("text") || "";
          if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
          e.preventDefault();
          pasteBlock(gi, k, r, ci, text);
        });
        entry = {
          path,
          el: td,
          sync: () => { input.value = showCell(form.get(path)); },
          setError(msg) {
            td.classList.toggle("is-invalid", !!msg);
            input.setAttribute("aria-invalid", msg ? "true" : "false");
            err.textContent = msg || "";
            td.title = msg || "";
            issues.set(path, msg ? { label: `${rowLabel()} · ${colName()}:`, msg, focus: () => input.focus() } : null);
          },
          focus: () => input.focus(),
          validate: () => {
            const v = form.get(path);
            if (ci === 0) {
              const s = String(v ?? "").trim();
              if (!s) return "Escribe la talla.";
              if (len(s) > CELL_MAX) return `Máximo ${CELL_MAX} caracteres.`;
              const rows = form.get(fp) || [];
              if (rows.some((row, j) => j !== r && String(row?.[0] ?? "").trim().toLowerCase() === s.toLowerCase())) return "Talla repetida en esta horma.";
              return null;
            }
            if (typeof v === "number") return v < 0 || v > 10000 ? "Usa un número entre 0 y 10.000." : null;
            if (len(String(v ?? "").trim()) > CELL_MAX) return `Máximo ${CELL_MAX} caracteres.`;
            return null;
          },
        };
        form.register(entry);
        entry.sync();
        return td;
      }

      function pasteBlock(gi, k, r, ci, text) {
        const fp = `items.${gi}.rows.${k}`;
        const ncols = (guide(gi).head || []).length;
        const lines = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
        const rows = clone(form.get(fp) || []);
        let cut = false;
        let used = 0;
        lines.forEach((cells, i) => {
          const ri = r + i;
          if (ri >= MAX_ROWS) { cut = true; return; }
          while (rows.length <= ri) rows.push(Array(ncols).fill(""));
          cells.forEach((raw, j) => {
            const cj = ci + j;
            if (cj >= ncols) { cut = true; return; }
            rows[ri][cj] = cj === 0 ? String(raw).trim() : parseCell(raw);
          });
          used++;
        });
        form.set(fp, rows);
        redrawGuide(gi, `.tabs__panel:not([hidden]) tr.sc-row:nth-child(${r + 1}) td.sc-cell:nth-of-type(${ci + 2}) input`);
        toast(`Se pegaron ${plural(used, "fila", "filas")}.${cut ? " Lo que no cabía en la tabla se omitió." : ""}`, { type: cut ? "warning" : "success" });
      }

      function addRow(gi, k) {
        const fp = `items.${gi}.rows.${k}`;
        const ncols = (guide(gi).head || []).length;
        const rows = clone(form.get(fp) || []);
        if (rows.length >= MAX_ROWS) return;
        rows.push(Array(ncols).fill(""));
        form.set(fp, rows);
        redrawGuide(gi, `.tabs__panel:not([hidden]) tr.sc-row:nth-child(${rows.length}) input`);
      }

      function moveRow(gi, k, from, to, focusClass) {
        const fp = `items.${gi}.rows.${k}`;
        const rows = clone(form.get(fp) || []);
        if (to < 0 || to >= rows.length || from === to) return;
        const [x] = rows.splice(from, 1);
        rows.splice(to, 0, x);
        form.set(fp, rows);
        redrawGuide(gi, `.tabs__panel:not([hidden]) tr.sc-row:nth-child(${to + 1}) ${focusClass}:not([disabled]), .tabs__panel:not([hidden]) tr.sc-row:nth-child(${to + 1}) input`);
      }

      function removeRow(gi, k, r) {
        const fp = `items.${gi}.rows.${k}`;
        const before = clone(form.get(fp) || []);
        const rows = before.slice();
        const [gone] = rows.splice(r, 1);
        form.set(fp, rows);
        const next = Math.min(r, rows.length - 1);
        redrawGuide(gi, next >= 0 ? `.tabs__panel:not([hidden]) tr.sc-row:nth-child(${next + 1}) .sc-row__rm` : ".tabs__panel:not([hidden]) .sc-grid__foot .btn");
        const talla = String(gone?.[0] ?? "").trim();
        toast(talla ? `Quitaste la fila «${talla}».` : "Quitaste la fila.", {
          type: "info",
          action: { label: "Deshacer", onClick: () => { if (guide(gi)?.rows?.[k]) { form.set(fp, before); redrawGuide(gi, `.tabs__panel:not([hidden]) tr.sc-row:nth-child(${r + 1}) input`); } } },
        });
      }

      /* ---------- Guías: agregar, duplicar, mover, eliminar ---------- */
      function addGuide() {
        if (guides().length >= MAX_GUIDES) { toast(`Máximo ${MAX_GUIDES} guías.`, { type: "warning" }); return; }
        const fit = fits[0]?.id;
        const g = {
          id: "", name: "", head: ["Talla", "Pecho", "Largo"], unit: "cm",
          rows: fit ? { [fit]: DEFAULT_SIZES.map((s) => [s, "", ""]) } : {},
          _new: true, _auto: true,
        };
        form.set("items", [...guides(), g]);
        sel = guides().length - 1;
        renderAll(`#${panelId(sel)} input[name$=".name"]`);
      }

      function duplicateGuide(gi) {
        if (guides().length >= MAX_GUIDES) return;
        const src = clone(guide(gi));
        const name = [...`${src.name || "Guía"} (copia)`].slice(0, 60).join("");
        const copy = { ...src, name, _new: true, _auto: true };
        copy.id = uniqueSlug(name, guides(), -1);
        const list = guides().slice();
        list.splice(gi + 1, 0, copy);
        form.set("items", list);
        shiftMaps(gi + 1, +1);
        sel = gi + 1;
        renderAll(`#${panelId(sel)} input[name$=".name"]`);
        toast(`Duplicaste «${src.name || "la guía"}». Cambia el nombre y guarda.`, { type: "info" });
      }

      function moveGuide(from, to) {
        const list = guides().slice();
        if (to < 0 || to >= list.length) return;
        const [x] = list.splice(from, 1);
        list.splice(to, 0, x);
        const a = fitTab.get(from);
        const b = fitTab.get(to);
        fitTab.delete(from); fitTab.delete(to);
        if (a !== undefined) fitTab.set(to, a);
        if (b !== undefined) fitTab.set(from, b);
        form.set("items", list);
        sel = to;
        renderAll();
        requestAnimationFrame(() => listEl.querySelectorAll(".sc-guide")[to]?.focus());
      }

      async function removeGuide(gi) {
        const g = guide(gi);
        const used = g._new ? [] : catsUsing(g.id);
        const name = g.name || g.id || "sin nombre";
        if (used.length) {
          blockedDialog({
            title: `No puedes eliminar «${name}»`,
            message: `${used.length === 1 ? "La usa la categoría" : "La usan las categorías"} ${used.map((c) => c.name).join(", ")}. En Categorías, elige otra guía (o «Sin guía de tallas») para ${used.length === 1 ? "ella" : "ellas"} y vuelve a intentarlo.`,
            places: used.map((c) => ({ label: `Categoría «${c.name}»`, href: "#/categorias" })),
          });
          return;
        }
        if (!g._new || countRows(g)) {
          const ok = await confirmDialog({
            title: `¿Eliminar la guía «${name}»?`,
            message: `Se eliminará con sus ${plural(countRows(g), "fila", "filas")} cuando guardes los cambios.`,
            confirmLabel: "Eliminar guía",
            danger: true,
          });
          if (!ok) return;
        }
        const list = guides().slice();
        list.splice(gi, 1);
        form.set("items", list);
        shiftMaps(gi, -1);
        sel = Math.max(0, Math.min(gi, list.length - 1));
        renderAll();
        requestAnimationFrame(() => (listEl.querySelectorAll(".sc-guide")[sel] || addGuideBtn).focus());
      }

      /** Ajusta las pestañas recordadas cuando se inserta (+1) o quita (−1) una guía en `at`. */
      function shiftMaps(at, d) {
        const next = new Map();
        for (const [i, v] of fitTab) {
          if (d < 0 && i === at) continue;
          next.set(i >= at ? i + d : i, v);
        }
        fitTab.clear();
        for (const [i, v] of next) fitTab.set(i, v);
      }

      /* ---------- Vista previa (como el modal de la tienda) ---------- */
      function renderPreview() {
        const all = guides();
        const g = all[sel];
        if (!g) { replace(previewEl, null); return; }
        const pub = all.map((x, i) => ({ x, i })).filter(({ x }) => hasRows(x));
        const keys = Object.keys(g.rows || {}).filter((k) => rowsWithSize(g.rows[k]).length);
        let fit = currentFit(sel);
        if (!keys.includes(fit)) fit = keys[0];
        const head = (g.head || []).map((x) => String(x ?? "").trim());
        const unit = String(g.unit || "").trim();
        const rows = fit ? rowsWithSize(g.rows[fit]) : [];
        const cols = head.length;
        const pill = (label, on, onClick, sm) => h("button.sc-pv__btn", { type: "button", class: [on && "is-on", sm && "is-sm"], "aria-pressed": String(on), onClick }, label);
        replace(previewEl,
          h("p.sc-pv__title", "Guía de tallas"),
          pub.length ? h("div.sc-pv__seg", { role: "group", "aria-label": "Guías" }, pub.map(({ x, i }) => pill(x.name || "Sin nombre", i === sel, () => select(i)))) : null,
          !hasRows(g)
            ? h("p.sc-pv__empty", icon("info", { size: 16 }), "Esta guía no tiene filas con talla: no aparece en la tienda.")
            : [
              h("div.sc-pv__seg", { role: "group", "aria-label": "Hormas" }, keys.map((k) => pill(fitName(k), k === fit, () => {
                fitTab.set(sel, k);
                tabsOf.get(sel)?.select(k);
                renderPreview();
              }, true))),
              h("div.sc-pv__scroll", h("table.sc-pv__table",
                h("thead", h("tr", head.map((t, i) => h("th", { scope: "col" }, (t || "") + (i && unit ? ` (${unit})` : ""))))),
                h("tbody", rows.map((r) => {
                  const cells = r.slice(1, Math.max(cols, 1)).map(storeCell);
                  while (cells.length < cols - 1) cells.push("");
                  return h("tr", h("th", { scope: "row" }, String(r[0]).trim()), cells.map((v) => h("td", v)));
                })))),
            ],
          note ? h("p.sc-pv__note", noteParts(note)) : null);
      }

      function noteParts(text) {
        const m = /\s*(\([^()]*\))$/.exec(text);
        return m ? [text.slice(0, m.index), " ", h("em", m[1])] : text;
      }
      form.on("change", ({ path }) => {
        if (path === "") renderAll(); // Descartar / guardado: el valor pudo cambiar de forma
        else renderPreview();
      });

      /* ---------- "Ver en la tienda": un producto que usa la guía elegida ---------- */
      const storeBtn = button({ label: "Ver en la tienda", icon: "external", href: `${STORE}catalogo.html`, target: "_blank" });
      function updateStoreLink() {
        const g = guide(sel);
        const cats = g && !g._new ? catsUsing(g.id).map((c) => c.id) : [];
        const p = products.find((x) => x.status === "published" && cats.includes(x.category));
        storeBtn.href = p ? `${STORE}producto.html?id=${enc(p.id)}` : `${STORE}catalogo.html`;
        storeBtn.title = p ? `Abre «${p.name}»: toca «Guía de tallas» para ver la tabla.` : "Abre el catálogo: la guía general está en el pie de página.";
      }

      /* ---------- Dibujo completo ---------- */
      const addGuideBtn = button({ label: "Nueva guía", icon: "plus", size: "sm", variant: "primary", onClick: addGuide });
      const listCard = card({ title: "Guías", className: "sc-guides-card", body: [listEl, h("div.sc-guides__foot", addGuideBtn)] });
      const previewCard = card({
        title: "Vista previa",
        description: "Así se ve el modal «Guía de tallas» de la tienda. Toca las pestañas para cambiar de guía o de horma.",
        className: "sc-preview-card",
        body: [previewEl, h("p.sc-pv-foot", icon("info", { size: 14 }), h("span", "La nota de abajo de la tabla se edita en ", h("a", { href: "#/textos" }, "Textos del sitio"), "."))],
      });
      const emptyBox = h("div");
      const layout = h("div.sc-layout",
        h("div.sc-layout__side", listCard),
        h("div.sc-layout__main", panelsEl, previewCard));

      function renderAll(focusSel) {
        // Si el foco estaba en un campo (p. ej. al guardar con Ctrl/Cmd+S), se recupera en el campo nuevo
        const act = document.activeElement;
        const key = layout.contains(act) ? act.dataset?.path || act.getAttribute("name") : null;
        if (!focusSel && key) focusSel = `[data-path="${CSS.escape(key)}"], [name="${CSS.escape(key)}"]`;
        const n = guides().length;
        tabsOf.clear();
        layout.hidden = !n;
        replace(emptyBox, n ? null : card({
          body: emptyState({
            icon: "ruler",
            title: "Aún no hay guías de tallas",
            message: "Crea una guía para cada tipo de prenda (camisetas, hoodies…) y asígnala a sus categorías.",
            action: { label: "Crear guía", icon: "plus", onClick: addGuide },
          }),
        }));
        if (!n) { replace(listEl, null); replace(panelsEl, null); return; }
        sel = Math.min(Math.max(0, sel), n - 1);
        replace(listEl, guides().map((_, gi) => guideButton(gi)));
        replace(panelsEl, guides().map((_, gi) => guidePanel(gi)));
        addGuideBtn.disabled = n >= MAX_GUIDES;
        select(sel);
        markErrors();
        if (focusSel) requestAnimationFrame(() => document.querySelector(focusSel)?.focus());
      }

      el.append(h("div.page",
        header({
          title: "Guía de tallas",
          subtitle: "Tablas de medidas por tipo de prenda y horma. Se abren con «Guía de tallas» en la ficha de producto, en «Medidas» y desde el pie de página.",
          actions: [storeBtn], // «Nueva guía» va una sola vez: debajo de la lista de guías
          form,
          section: "sizeCharts",
        }),
        emptyBox,
        layout));
      renderAll();
    },
  },
];
