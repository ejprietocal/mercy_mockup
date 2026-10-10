/* ==========================================================================
   Mercy Studio · Panel — core/dom.js
   Ayudas mínimas para construir DOM sin plantillas HTML (seguro con la CSP del panel):
   · h("button.btn.btn--primary", { onClick, "aria-label": "…" }, "Texto", otroNodo)
     Los textos SIEMPRE se insertan como texto (nunca HTML). Para HTML de confianza: { html: "…" }.
   · $ / $$ selectores, uid() ids únicos para label/for y aria-*, clear(), on().
   Regla de la CSP: nada de atributos on* en el HTML; los eventos se enlazan aquí (addEventListener).
   ========================================================================== */

const PROPS = new Set(["value", "checked", "selected", "disabled", "hidden", "indeterminate", "multiple", "readOnly", "required", "open"]);
let seq = 0;

/** Id único para enlazar label/for, aria-describedby, aria-controls… */
export function uid(prefix = "m") {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

/** Agrega hijos (textos, nodos, listas anidadas; ignora null/false/true/undefined). */
export function append(el, ...children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, ...c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

function isAttrs(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Node);
}

/**
 * Crea un elemento.
 *   h("div.card.card--wide", { id, class: ["x", cond && "y"], style: { "--w": "40%" }, dataset: { id: 1 },
 *      onClick: fn, "aria-label": "…", html: "<b>confiable</b>", ref: (el) => … }, ...hijos)
 * Atributos con valor false/null/undefined se omiten; true = atributo vacío (p. ej. hidden: true).
 */
export function h(tag, attrs, ...children) {
  let classes = [];
  if (tag.includes(".")) {
    const parts = tag.split(".");
    tag = parts.shift() || "div";
    classes = parts;
  }
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(" ");
  if (!isAttrs(attrs)) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) setAttrs(el, attrs);
  append(el, ...children);
  return el;
}

/** Aplica atributos/propiedades/eventos con la misma semántica de h(). */
export function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class" || k === "className") {
      const list = (Array.isArray(v) ? v : [v]).flat().filter(Boolean).join(" ");
      if (list) el.className = el.className ? `${el.className} ${list}` : list;
    } else if (k === "style") {
      if (typeof v === "string") el.setAttribute("style", v);
      else for (const [sk, sv] of Object.entries(v)) {
        if (sv === null || sv === undefined || sv === false) continue;
        if (sk.startsWith("--")) el.style.setProperty(sk, String(sv));
        else el.style[sk] = sv;
      }
    } else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv);
    } else if (k === "html") {
      el.innerHTML = v; // SOLO contenido de confianza (íconos propios)
    } else if (k === "text") {
      el.textContent = String(v);
    } else if (k === "ref") {
      if (typeof v === "function") v(el);
    } else if (k === "on" && typeof v === "object") {
      for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    } else if (/^on[A-Z]/.test(k) && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (PROPS.has(k)) {
      el[k] = v;
      if (v === true && k !== "value") el.setAttribute(k === "readOnly" ? "readonly" : k, "");
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Vacía un elemento. */
export function clear(el) {
  el.replaceChildren();
  return el;
}

/**
 * Reemplaza los hijos con la misma semántica de h() (acepta listas anidadas e ignora null/false).
 * OJO: el.replaceChildren() nativo NO acepta listas ni null (los convierte en texto "null").
 */
export function replace(el, ...children) {
  el.replaceChildren();
  return append(el, ...children);
}

/** addEventListener que devuelve la función para quitarlo. */
export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** Elementos que pueden recibir foco con Tab dentro de `root` (visibles). */
export function focusables(root) {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary, video[controls]';
  return $$(sel, root).filter((el) => !el.closest("[hidden], [inert]") && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

/** Texto solo para lectores de pantalla. */
export const srOnly = (text) => h("span.sr-only", text);
