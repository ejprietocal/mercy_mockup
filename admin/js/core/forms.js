/* ==========================================================================
   Mercy Studio · Panel — core/forms.js
   Formularios enlazados a un valor por rutas ("hero.title", "marquee.0.text", "colors.1.photos"):
   · createForm({ value, ctx, onSubmit }) → Form: copia de trabajo, "sucio" vs. inicial, errores del servidor
     en el campo correcto (y foco en el primero), barra fija "Cambios sin guardar · Descartar · Guardar"
     con Ctrl/Cmd+S, estado "Guardando…", manejo de 409 (conflicto) y 422 (validación).
   · fields.*(form, ruta, opciones) → elemento .field listo para insertar:
     text, textarea, number, money, select, checkbox, switch, radio, segmented, chips (multiselect), tags,
     color, date, url, password, accentTitle, list (repetible), media, photos, custom, row, readonly.
   Ver admin/README.md para ejemplos.
   ========================================================================== */
import { $, append, h, replace, uid } from "./dom.js";
import { icon } from "./icons.js";
import { ApiError, isAbort } from "./api.js";
import { content } from "./store.js";
import { button, confirmDialog, iconButton, modal, revealElement, showApiError, spinner, toast } from "./ui.js";
import {
  HEX_RE, URL_MESSAGES, charCount, clone, deepEqual, escapeHtml, getPath, isSafeUrl, number, setPath, siteUrl,
} from "./format.js";
import { mediaField, photoListField } from "./media.js";

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

/* ==========================================================================
   Form
   ========================================================================== */
export class Form {
  /**
   * @param {object} o
   *  value          valor inicial (se copia)
   *  ctx            contexto de la vista (protección de salida, limpieza, recargar en conflicto)
   *  onSubmit       async (valor, { force, form }) → valor guardado (normalizado por el servidor) | undefined
   *  saveBar        true = barra fija inferior (UNA por página); false = usa form.actions()
   *  saveLabel      "Guardar" · successMessage "Cambios guardados." (null = sin aviso)
   *  errorPrefix    prefijo para las rutas de error del servidor (p. ej. "items" si el valor es { items: [...] })
   *  validate       (valor) → { "ruta": "mensaje" } validación extra antes de enviar
   *  guard          false = no preguntar al salir con cambios
   *  onReload       qué hacer al elegir "Recargar" en un conflicto (por defecto recarga la vista)
   *  onSaved        (resultado, form) tras guardar
   */
  constructor(o = {}) {
    this.opts = {
      saveBar: true, saveLabel: "Guardar", successMessage: "Cambios guardados.", errorPrefix: "", guard: true, ...o,
    };
    this.ctx = o.ctx || null;
    this.initial = clone(o.value ?? {});
    this.value = clone(o.value ?? {});
    this.entries = [];
    this.handlers = { change: new Set(), dirty: new Set(), state: new Set(), saved: new Set() };
    this.saving = false;
    this.unmatchedErrors = [];
    this._wasDirty = false;
    this._offs = [];
    if (this.ctx) {
      if (this.opts.guard !== false) this._offs.push(this.ctx.guard(() => this.dirty));
      this.ctx.onCleanup(() => this.destroy());
    }
    if (this.opts.saveBar) {
      this.bar = createSaveBar(this);
      this._bindShortcut();
    }
  }

  /* ---------- Valor ---------- */
  get(path = "") { return path ? getPath(this.value, path) : this.value; }

  /** Cambia un valor. Los campos de esa ruta (y de sus hijos) se actualizan solos. */
  set(path, v, { source = null } = {}) {
    if (!path) this.value = v;
    else setPath(this.value, path, v);
    for (const e of [...this._live()]) {
      const under = !path || e.path === path || e.path.startsWith(path + ".");
      if (under) {
        if (e !== source) e.sync();
        e.setError(null);
      } else if (path.startsWith(e.path + ".") || e.path === "") {
        e.childChanged?.(path);
      }
    }
    this._emit("change", { path, value: v });
    this._checkDirty();
  }

  /** form.update("tags", (lista) => [...lista, "nuevo"]) */
  update(path, fn) { this.set(path, fn(clone(this.get(path)))); }

  get dirty() { return !deepEqual(this.value, this.initial); }

  /** Nuevo punto de partida (p. ej. lo que devolvió el servidor al guardar). */
  reset(value = this.value) {
    this.initial = clone(value);
    this.value = clone(value);
    this.clearErrors();
    for (const e of [...this._live()]) e.sync();
    this._emit("change", { path: "", value: this.value });
    this._checkDirty(true);
  }

  /** Vuelve al valor inicial (descarta los cambios). */
  discard() { this.reset(this.initial); }

  /* ---------- Eventos ---------- */
  /** on("change" | "dirty" | "state" | "saved", fn) → función para quitarlo */
  on(evt, fn) {
    this.handlers[evt]?.add(fn);
    return () => this.handlers[evt]?.delete(fn);
  }

  _emit(evt, data) {
    for (const fn of this.handlers[evt] || []) {
      try { fn(data, this); } catch (e) { console.error(e); }
    }
  }

  _checkDirty(force = false) {
    const d = this.dirty;
    if (force || d !== this._wasDirty) {
      this._wasDirty = d;
      // Si se vuelve a editar, el aviso «Cambios guardados.» ya no es cierto: se cierra (queda la barra de guardado)
      if (d && this._savedToast) { this._savedToast.dismiss(); this._savedToast = null; }
      this._emit("dirty", d);
    }
  }

  /* ---------- Registro de campos ---------- */
  /**
   * Conecta un control propio (que no es un fields.*) con el formulario. → función para soltarlo.
   * entry = { path, el, sync(), setError(msg|null), focus(), validate?() → msg|null, childChanged?(ruta) }
   *   path          ruta del valor ("colors.0.stock.S"); los errores del servidor con esa ruta (o hijas) caen aquí
   *   el            elemento que lo contiene (si sale del documento, el Form lo olvida solo)
   *   sync()        se llama cuando el valor cambia desde fuera (form.set, reset, descartar): vuelve a pintarlo
   *   setError()    muestra/quita el mensaje (pon aria-invalid en el control real)
   *   validate()    validación del navegador antes de enviar
   *   childChanged  (ruta) cuando cambia una ruta hija sin que cambie la propia
   */
  register(entry) {
    this.entries.push(entry);
    return () => { this.entries = this.entries.filter((x) => x !== entry); };
  }

  /** Campos vivos (descarta los que ya salieron del documento, p. ej. tras redibujar una lista). */
  _live() {
    this.entries = this.entries.filter((e) => {
      if (e.el.isConnected) { e.seen = true; return true; }
      return !e.seen;
    });
    return this.entries;
  }

  /* ---------- Errores ---------- */
  clearErrors() {
    for (const e of this.entries) e.setError(null);
    this.unmatchedErrors = [];
  }

  /**
   * Muestra errores { "ruta.del.campo": "mensaje" } (los del servidor son relativos a la sección/producto).
   * Si no hay un campo con esa ruta exacta, se muestra en el campo "padre" más cercano.
   * Devuelve la cantidad de errores mostrados y hace foco en el primero (en el orden del documento).
   */
  setErrors(fields = {}, { prefix = this.opts.errorPrefix, focus = true } = {}) {
    const live = this._live();
    const hits = [];
    const unmatched = [];
    for (const [raw, msg] of Object.entries(fields || {})) {
      const rel = raw === "_" ? "" : raw;
      const full = prefix ? (rel ? `${prefix}.${rel}` : prefix) : rel;
      let p = full;
      let target = null;
      for (;;) {
        target = live.find((e) => e.path === p && e.path !== "");
        if (target || !p) break;
        p = p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : "";
      }
      if (target) {
        if (!target._hasError) {
          target.setError(msg);
          target._hasError = true;
          hits.push(target);
        }
      } else unmatched.push({ path: raw, message: msg });
    }
    for (const t of hits) delete t._hasError;
    this.unmatchedErrors = unmatched;
    if (unmatched.length) {
      toast(unmatched.slice(0, 3).map((u) => (u.path ? `${u.path}: ${u.message}` : u.message)).join(" · "), { type: "error", title: "Hay errores en otros campos" });
    }
    if (focus && hits.length) {
      hits.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const first = hits[0];
      // Abre TODOS los ítems plegados y <details> que esconden un error (sin cambiar de pestaña: las pestañas con
      // errores quedan marcadas) y después la pestaña/contenedores del primero, que recibe el foco.
      for (const t of hits.slice(1)) revealElement(t.el, { tabs: false });
      revealElement(first.el);
      requestAnimationFrame(() => {
        first.el.scrollIntoView({ block: "center", behavior: "smooth" });
        first.focus();
      });
    }
    return hits.length + unmatched.length;
  }

  /** Validación del lado del navegador (obligatorio, longitud, números, URL…) → { ruta: mensaje } */
  validateClient() {
    const out = {};
    for (const e of this._live()) {
      if (!e.validate) continue;
      const msg = e.validate();
      if (msg && !(e.path in out)) out[e.path] = msg;
    }
    if (this.opts.validate) Object.assign(out, this.opts.validate(this.value, this) || {});
    return out;
  }

  /* ---------- Guardar ---------- */
  _setSaving(v) {
    this.saving = v;
    this._emit("state", { saving: v });
  }

  /** Valida, llama a onSubmit y maneja errores. → Promise<boolean> (true = guardado). */
  async submit({ force = false } = {}) {
    if (this.saving || !this.opts.onSubmit) return false;
    this.clearErrors();
    const errs = this.validateClient();
    const n = Object.keys(errs).length;
    if (n) {
      this.setErrors(errs, { prefix: "" });
      toast(n === 1 ? "Revisa el campo marcado." : `Revisa los ${n} campos marcados.`, { type: "error" });
      return false;
    }
    this._setSaving(true);
    try {
      const result = await this.opts.onSubmit(clone(this.value), { force, form: this });
      this.reset(result === undefined ? this.value : result);
      if (this.opts.successMessage) this._savedToast = toast(this.opts.successMessage);
      this._emit("saved", result);
      this.opts.onSaved?.(result, this);
      return true;
    } catch (e) {
      this.handleError(e);
      return false;
    } finally {
      this._setSaving(false);
    }
  }

  /** Muestra un error de guardado: 422 en los campos, 409 conflicto con diálogo, in_use con la lista de usos… */
  handleError(e) {
    if (isAbort(e)) return;
    if (!(e instanceof ApiError)) {
      console.error(e);
      toast("Ocurrió un error inesperado al guardar. Intenta de nuevo.", { type: "error" });
      return;
    }
    if (e.status === 401) {
      // Cerró el diálogo «Tu sesión se cerró» sin volver a entrar: no se guardó nada (y se dice)
      if (e.sessionDismissed) toast("No se guardaron los cambios porque tu sesión se cerró. Toca «Guardar» otra vez para volver a entrar; lo que escribiste sigue aquí.", { type: "error", title: "Sin guardar", timeout: 0 });
      return;
    }
    if (e.isValidation) {
      this.setErrors(e.fields || {});
      toast(e.message || "Revisa los campos marcados.", { type: "error" });
      return;
    }
    if (e.isConflict) {
      this._conflict(e);
      return;
    }
    if (e.status === 409 && e.fields) {
      this.setErrors(e.fields);
      toast(e.message, { type: "error" });
      return;
    }
    showApiError(e);
  }

  _conflict(e) {
    modal({
      title: "Otra persona modificó esto",
      size: "sm",
      content: [
        h("p.modal__text", e.message || "Otra persona guardó cambios mientras editabas."),
        h("p.muted", "«Recargar» trae la versión actual y descarta lo que escribiste. «Sobrescribir» guarda tu versión y reemplaza la de la otra persona."),
      ],
      actions: [
        { label: "Seguir editando", value: null },
        { label: "Sobrescribir", variant: "danger", onClick: () => { setTimeout(() => this.submit({ force: true }), 0); } },
        { label: "Recargar", variant: "primary", autofocus: true, onClick: () => { setTimeout(() => this.reload(), 0); } },
      ],
    });
  }

  /** Recarga la vista con los datos del servidor (sin preguntar por los cambios). */
  reload() {
    if (this.opts.onReload) return this.opts.onReload(this);
    content.invalidate();
    return this.ctx?.reload({ force: true });
  }

  /* ---------- Botones en línea (cuando no hay barra fija) ---------- */
  /** form.actions({ saveLabel, discardLabel, showDiscard }) → <div> con Descartar · Guardar */
  actions({ saveLabel = this.opts.saveLabel, discardLabel = "Descartar", showDiscard = true, align = "end", alwaysEnabled = false } = {}) {
    const save = button({ label: saveLabel, variant: "primary", onClick: () => this.submit() });
    const discard = showDiscard ? button({ label: discardLabel, variant: "ghost", onClick: () => this.discard() }) : null;
    const el = h("div.form-actions", { class: `is-${align}` }, discard, save);
    const lbl = save.querySelector(".btn__label");
    let sp = null;
    const upd = () => {
      save.disabled = this.saving || (!alwaysEnabled && !this.dirty);
      if (discard) discard.hidden = !this.dirty || this.saving;
      if (this.saving && !sp) { sp = spinner(); save.prepend(sp); lbl.textContent = "Guardando…"; }
      if (!this.saving && sp) { sp.remove(); sp = null; lbl.textContent = saveLabel; }
    };
    this.on("dirty", upd);
    this.on("state", upd);
    upd();
    return el;
  }

  /** Envuelve campos en un <form> (Enter en un campo de una línea = guardar). */
  element(...children) {
    const f = h("form.form", { novalidate: true, onSubmit: (e) => { e.preventDefault(); this.submit(); } }, children);
    f.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file", "color"].includes(e.target.type) && !e.target.closest(".tags")) {
        e.preventDefault();
        this.submit();
      }
    });
    return f;
  }

  _bindShortcut() {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return;
      const dlg = Array.from(document.querySelectorAll("dialog[open]")).pop();
      if (dlg && !this._live().some((x) => dlg.contains(x.el))) return;
      e.preventDefault();
      if (this.dirty && !this.saving) this.submit();
    };
    document.addEventListener("keydown", onKey);
    this._offs.push(() => document.removeEventListener("keydown", onKey));
  }

  destroy() {
    this._offs.forEach((f) => f());
    this._offs = [];
    this.bar?.destroy();
  }
}

/** Atajo: const form = createForm({ value, ctx, onSubmit }) */
export const createForm = (opts) => new Form(opts);

/* ---------- Barra fija de guardado ---------- */
function createSaveBar(form) {
  const text = h("span.savebar__text", "Cambios sin guardar");
  const msg = h("span.savebar__msg", { role: "status" }, icon("alert-circle", { size: 18 }), text);
  const discard = button({
    label: "Descartar",
    variant: "inverse",
    onClick: async () => {
      const ok = await confirmDialog({ title: "¿Descartar los cambios?", message: "Se perderán los cambios que no has guardado en esta página.", confirmLabel: "Descartar cambios", cancelLabel: "Seguir editando", danger: true });
      if (ok) form.discard();
    },
  });
  const save = button({ label: form.opts.saveLabel, variant: "primary", icon: "check", onClick: () => form.submit() });
  const kbd = h("kbd.savebar__kbd", { title: "Atajo de teclado para guardar" }, IS_MAC ? "⌘ S" : "Ctrl + S");
  const el = h("div.savebar", { role: "region", "aria-label": "Cambios sin guardar", hidden: true },
    h("div.savebar__inner", msg, h("div.savebar__actions", kbd, discard, save)));
  const host = document.querySelector(".main-col") || document.body;
  host.append(el);
  const lbl = save.querySelector(".btn__label");
  let sp = null;
  const upd = () => {
    const show = form.dirty || form.saving;
    el.hidden = !show;
    document.body.classList.toggle("has-savebar", show);
    discard.disabled = form.saving;
    save.disabled = form.saving;
    text.textContent = form.saving ? "Guardando cambios…" : "Cambios sin guardar";
    if (form.saving && !sp) { sp = spinner(); save.prepend(sp); save.querySelector(".icon")?.setAttribute("hidden", ""); lbl.textContent = "Guardando…"; }
    if (!form.saving && sp) { sp.remove(); sp = null; save.querySelector(".icon")?.removeAttribute("hidden"); lbl.textContent = form.opts.saveLabel; }
  };
  const offs = [form.on("dirty", upd), form.on("state", upd)];
  upd();
  return {
    el,
    destroy() {
      offs.forEach((f) => f());
      el.remove();
      if (!document.querySelector(".savebar:not([hidden])")) document.body.classList.remove("has-savebar");
    },
  };
}

/* ==========================================================================
   Campos
   ========================================================================== */
function isEmpty(v) {
  return v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
}

/* Elementos donde aria-required tiene sentido (en un grupo genérico no se anuncia) */
const ARIA_REQUIRED_OK = "input, select, textarea, [role='radiogroup'], [role='listbox'], [role='combobox'], [role='textbox'], [role='spinbutton'], [role='checkbox'], [role='tree'], [role='gridcell']";

/** `required` puede ser booleano o función (form) → booleano: obligatorio según otro campo (p. ej. el tipo de fondo). */
function isRequired(o, form) {
  if (typeof o.required !== "function") return !!o.required;
  try { return !!o.required(form); } catch (e) { console.error(e); return false; }
}

/**
 * Llama a fn con cada cambio del formulario mientras `el` siga en el documento; cuando sale (p. ej. al redibujar
 * una lista) se suelta solo. → función para soltarlo antes.
 */
function watchForm(form, el, fn) {
  let seen = false;
  const off = form.on("change", (data) => {
    if (!el.isConnected) { if (seen) off(); return; }
    seen = true;
    fn(data);
  });
  return off;
}

/** Validación común: required, maxlength (en caracteres, como el servidor), minlength, pattern, validate(). */
function baseValidate(o, v, form) {
  if (isRequired(o, form) && isEmpty(v)) return o.requiredMessage || "Este campo es obligatorio.";
  if (typeof v === "string" && v) {
    const n = charCount(v);
    if (o.maxlength && n > o.maxlength) return `Máximo ${o.maxlength} caracteres (tiene ${n}).`;
    if (o.minlength && n < o.minlength) return `Mínimo ${o.minlength} caracteres.`;
    if (o.pattern && !o.pattern.test(v)) return o.patternMessage || "El formato no es válido.";
  }
  if (o.validate) return o.validate(v, form) || null;
  return null;
}

/** Estructura común: label, ayuda, contador y error con ids enlazados. */
function shell(o, { group = false } = {}) {
  const id = o.id || uid("f");
  const helpId = o.help ? `${id}-help` : null;
  const errId = `${id}-err`;
  const tag = group ? "fieldset.field.field--group" : "div.field";
  const wrap = h(tag, { class: [o.className, o.width && `field--${o.width}`] });
  const req = o.required ? h("span.field__req", { "aria-hidden": "true" }, " *") : null;
  const opt = o.optional ? h("span.field__opt", " (opcional)") : null;
  const labelId = `${id}-label`;
  // La <legend> también tiene id: un control propio dentro del grupo puede usar aria-labelledby
  const label = o.label ? (group ? h("legend.field__label", { id: labelId }, o.label, req, opt) : h("label.field__label", { for: id, id: labelId }, o.label, req, opt)) : null;
  const help = o.help ? h("p.field__help", { id: helpId }, o.help) : null;
  const error = h("p.field__error", { id: errId, hidden: true });
  const describedBy = [helpId, errId].filter(Boolean).join(" ");
  return { id, helpId, errId, labelId: label ? labelId : null, wrap, label, req, help, error, describedBy, o };
}

/**
 * Enlaza un campo con el formulario.
 *   control   elemento principal (recibe aria-invalid si no hay ariaEl)
 *   ariaEl    elemento (o función que lo devuelve) que recibe aria-invalid / aria-required: el control "real"
 *   focusEl   función que devuelve dónde poner el foco (por defecto, control)
 */
function bind(form, path, s, { control, display, validate, focusEl, childChanged, ariaEl }) {
  const target = () => {
    const a = typeof ariaEl === "function" ? ariaEl() : ariaEl;
    if (a) return a;
    return focusEl && typeof focusEl !== "function" ? focusEl : control;
  };
  const entry = {
    path,
    el: s.wrap,
    sync: () => display(form.get(path)),
    setError(msg) {
      s.wrap.classList.toggle("has-error", !!msg);
      s.error.hidden = !msg;
      s.error.replaceChildren(...(msg ? [icon("alert-circle", { size: 14 }), h("span", msg)] : []));
      const c = target();
      if (c && c.setAttribute) c.setAttribute("aria-invalid", msg ? "true" : "false");
    },
    focus() {
      const c = typeof focusEl === "function" ? focusEl() : focusEl || control;
      c?.focus?.();
    },
    validate: validate ? () => validate(form.get(path)) : null,
    childChanged,
  };
  form.register(entry);
  entry.sync();
  // Obligatorio según otro campo: el asterisco y aria-required siguen al formulario
  if (typeof s.o?.required === "function") {
    const upd = () => {
      const r = isRequired(s.o, form);
      if (s.req) s.req.hidden = !r;
      const c = target();
      if (c?.matches?.(ARIA_REQUIRED_OK)) { if (r) c.setAttribute("aria-required", "true"); else c.removeAttribute("aria-required"); }
    };
    upd();
    watchForm(form, s.wrap, upd);
  }
  return entry;
}

/** Contador "12/80" (y aviso si pasa de lo recomendado). */
function counter(o, s) {
  const max = o.maxlength;
  const rec = o.recommended;
  if (!max && !rec && !o.counter) return null;
  const el = h("span.field__counter", { id: `${s.id}-count`, "aria-live": "off" });
  const update = (v) => {
    const n = charCount(v || "");
    el.textContent = max ? `${n}/${max}` : `${n}`;
    el.classList.toggle("is-over", !!max && n > max);
    el.classList.toggle("is-warn", !!rec && n > rec && (!max || n <= max));
    el.title = rec ? `Recomendado: hasta ${rec} caracteres` : "";
  };
  return { el, update };
}

/** Prefijo/sufijo pegados al input ("$", "px", "%"). */
function adorn(input, o) {
  if (!o.prefix && !o.suffix) return input;
  return h("div.input-group", o.prefix && h("span.input-group__addon", o.prefix), input, o.suffix && h("span.input-group__addon", o.suffix));
}

function foot(s, c) {
  return s.help || c ? h("div.field__foot", s.help || h("span"), c?.el) : null;
}

function autosize(ta) {
  if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("field-sizing", "content")) return;
  if (!ta.isConnected || !ta.offsetParent) return;
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

const opts = (o) => (typeof o === "function" ? o() : o) || [];

/* ---------- Texto ---------- */
function text(form, path, o = {}) {
  const s = shell(o);
  const input = h("input.input", {
    id: s.id, type: o.type || "text", name: o.name || path, placeholder: o.placeholder, autocomplete: o.autocomplete || "off",
    inputmode: o.inputmode, spellcheck: o.spellcheck === false ? "false" : null, disabled: o.disabled, readOnly: o.readOnly,
    "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null, dir: o.dir,
  });
  const c = counter(o, s);
  let entry;
  input.addEventListener("input", () => {
    const v = o.transform ? o.transform(input.value) : input.value;
    c?.update(input.value);
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  if (o.transform) input.addEventListener("blur", () => { const v = form.get(path); if ((v ?? "") !== input.value) input.value = v ?? ""; });
  entry = bind(form, path, s, {
    control: input,
    display: (v) => { input.value = v ?? ""; c?.update(input.value); },
    validate: (v) => baseValidate(o, v, form),
  });
  append(s.wrap, s.label, adorn(input, o), foot(s, c), s.error);
  return s.wrap;
}

function textarea(form, path, o = {}) {
  const s = shell(o);
  const ta = h("textarea.input.input--textarea", {
    id: s.id, name: o.name || path, rows: o.rows || 3, placeholder: o.placeholder, disabled: o.disabled,
    "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null, spellcheck: "true",
  });
  const c = counter(o, s);
  let entry;
  ta.addEventListener("input", () => {
    c?.update(ta.value);
    autosize(ta);
    form.set(path, ta.value, { source: entry });
    o.onChange?.(ta.value, form);
  });
  ta.addEventListener("focus", () => autosize(ta));
  entry = bind(form, path, s, {
    control: ta,
    display: (v) => { ta.value = v ?? ""; c?.update(ta.value); requestAnimationFrame(() => autosize(ta)); },
    validate: (v) => baseValidate(o, v, form),
  });
  append(s.wrap, s.label, ta, foot(s, c), s.error);
  return s.wrap;
}

function password(form, path, o = {}) {
  const s = shell(o);
  const input = h("input.input", { id: s.id, type: "password", name: o.name || path, autocomplete: o.autocomplete || "current-password", "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null, spellcheck: "false" });
  const toggle = h("button.input-group__btn", { type: "button", "aria-pressed": "false", "aria-label": "Mostrar contraseña", title: "Mostrar contraseña" }, icon("eye", { size: 18 }));
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    toggle.title = toggle.getAttribute("aria-label");
    toggle.replaceChildren(icon(show ? "eye-off" : "eye", { size: 18 }));
  });
  let entry;
  input.addEventListener("input", () => { form.set(path, input.value, { source: entry }); o.onChange?.(input.value, form); });
  entry = bind(form, path, s, { control: input, display: (v) => { input.value = v ?? ""; }, validate: (v) => baseValidate(o, v, form) });
  append(s.wrap, s.label, h("div.input-group.input-group--btn", input, toggle), foot(s, null), s.error);
  return s.wrap;
}

/* ---------- Números ---------- */
function numberField(form, path, o = {}) {
  const s = shell(o);
  const integer = o.integer !== false;
  const input = h("input.input.input--number", {
    id: s.id, type: "number", name: o.name || path, min: o.min, max: o.max, step: o.step ?? (integer ? 1 : "any"),
    inputmode: integer ? "numeric" : "decimal", placeholder: o.placeholder, disabled: o.disabled,
    "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null,
  });
  let entry;
  input.addEventListener("input", () => {
    const raw = input.value;
    const v = raw === "" ? null : Number(raw);
    form.set(path, Number.isNaN(v) ? null : v, { source: entry });
    o.onChange?.(v, form);
  });
  entry = bind(form, path, s, {
    control: input,
    display: (v) => { if (document.activeElement !== input || Number(input.value) !== v) input.value = v === null || v === undefined ? "" : String(v); },
    validate: (v) => {
      if (v === null || v === undefined) {
        if (isRequired(o, form) || o.nullable === false) return o.requiredMessage || "Escribe un número.";
        return null;
      }
      if (integer && !Number.isInteger(v)) return "Debe ser un número entero.";
      if (o.min !== undefined && v < o.min) return o.max !== undefined ? `Debe estar entre ${number(o.min)} y ${number(o.max)}.` : `Debe ser mayor o igual a ${number(o.min)}.`;
      if (o.max !== undefined && v > o.max) return o.min !== undefined ? `Debe estar entre ${number(o.min)} y ${number(o.max)}.` : `Debe ser menor o igual a ${number(o.max)}.`;
      return o.validate ? o.validate(v, form) : null;
    },
  });
  append(s.wrap, s.label, adorn(input, o), foot(s, null), s.error);
  return s.wrap;
}

/** Pesos colombianos: muestra "89.900" con "$" delante y guarda el entero 89900. */
function money(form, path, o = {}) {
  const s = shell(o);
  const input = h("input.input.input--money", {
    id: s.id, type: "text", name: o.name || path, inputmode: "numeric", autocomplete: "off", placeholder: o.placeholder ?? "0",
    disabled: o.disabled, "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null,
  });
  const fmt = (v) => (v === null || v === undefined || v === "" ? "" : number(v));
  let entry;
  input.addEventListener("input", () => {
    const caretFromEnd = input.value.length - (input.selectionEnd ?? input.value.length);
    const digitsRight = input.value.slice(input.value.length - caretFromEnd).replace(/\D/g, "").length;
    const digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const v = digits ? Math.min(Number(digits), 999_999_999_999) : null;
    input.value = fmt(v);
    // Mantener el cursor en el mismo dígito contado desde la derecha
    let pos = input.value.length;
    let seen = 0;
    while (pos > 0 && seen < digitsRight) { pos--; if (/\d/.test(input.value[pos])) seen++; }
    try { input.setSelectionRange(pos, pos); } catch { /* algunos tipos no lo permiten */ }
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  entry = bind(form, path, s, {
    control: input,
    display: (v) => { input.value = fmt(v); },
    validate: (v) => {
      if (v === null || v === undefined) return isRequired(o, form) || o.nullable === false ? o.requiredMessage || "Escribe un valor." : null;
      if (o.min !== undefined && v < o.min) return `Debe ser al menos $${number(o.min)}.`;
      if (o.max !== undefined && v > o.max) return `Debe ser como máximo $${number(o.max)}.`;
      return o.validate ? o.validate(v, form) : null;
    },
  });
  append(s.wrap, s.label, adorn(input, { prefix: "$", suffix: o.suffix }), foot(s, null), s.error);
  return s.wrap;
}

/* ---------- Opciones ---------- */
function select(form, path, o = {}) {
  const s = shell(o);
  const sel = h("select.input.input--select", { id: s.id, name: o.name || path, disabled: o.disabled, "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null });
  let list = [];
  const fill = () => {
    list = opts(o.options);
    const cur = form.get(path);
    replace(sel,
      o.placeholder !== undefined || o.emptyLabel !== undefined ? h("option", { value: "" }, o.emptyLabel ?? o.placeholder ?? "") : null,
      list.map((op) => h("option", { value: String(op.value), disabled: op.disabled }, op.label)),
    );
    const known = list.some((op) => String(op.value) === String(cur ?? ""));
    if (cur !== null && cur !== undefined && cur !== "" && !known) sel.append(h("option", { value: String(cur) }, `${cur} (no disponible)`));
    sel.value = String(cur ?? "");
  };
  let entry;
  sel.addEventListener("change", () => {
    const op = list.find((x) => String(x.value) === sel.value);
    const v = op ? op.value : sel.value;
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  entry = bind(form, path, s, { control: sel, display: () => fill(), validate: (v) => baseValidate(o, v, form) });
  append(s.wrap, s.label, sel, foot(s, null), s.error);
  return s.wrap;
}

function checkbox(form, path, o = {}, { asSwitch = false } = {}) {
  const s = shell({ ...o, label: null });
  const input = h("input", { id: s.id, type: "checkbox", class: asSwitch ? "switch__input" : "check__input", role: asSwitch ? "switch" : null, name: o.name || path, disabled: o.disabled, "aria-describedby": s.describedBy });
  const label = h("label", { class: asSwitch ? "switch" : "check", for: s.id },
    input,
    h("span", { class: asSwitch ? "switch__track" : "check__box", "aria-hidden": "true" }, asSwitch ? h("span.switch__thumb") : icon("check", { size: 14, strokeWidth: 3 })),
    h("span", { class: asSwitch ? "switch__label" : "check__label" }, o.label, o.description && h("span.check__desc", o.description)));
  let entry;
  input.addEventListener("change", () => {
    const v = o.invert ? !input.checked : input.checked;
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  entry = bind(form, path, s, { control: input, display: (v) => { input.checked = o.invert ? !v : !!v; }, validate: o.validate ? (v) => o.validate(v, form) : null });
  s.wrap.classList.add(asSwitch ? "field--switch" : "field--check");
  append(s.wrap, label, s.help, s.error);
  return s.wrap;
}

function choiceGroup(form, path, o = {}, variant) {
  const s = shell(o, { group: true });
  const name = uid("r");
  const box = h("div", { class: variant === "segmented" ? "segmented" : "radio-list", role: "radiogroup", "aria-describedby": s.describedBy });
  let inputs = [];
  let entry;
  const list = opts(o.options);
  for (const op of list) {
    const id = uid("ro");
    const input = h("input", { type: "radio", id, name, value: String(op.value), disabled: op.disabled || o.disabled, class: variant === "segmented" ? "segmented__input" : "radio__input" });
    input.addEventListener("change", () => {
      if (!input.checked) return;
      form.set(path, op.value, { source: entry });
      o.onChange?.(op.value, form);
    });
    inputs.push({ input, op });
    if (variant === "segmented") {
      box.append(h("label.segmented__opt", { for: id }, input, h("span.segmented__label", op.icon && icon(op.icon, { size: 16 }), op.label)));
    } else {
      box.append(h("label.radio", { for: id }, input, h("span.radio__dot", { "aria-hidden": "true" }), h("span.radio__text", h("span.radio__label", op.label), op.help && h("span.radio__help", op.help))));
    }
  }
  entry = bind(form, path, s, {
    control: box,
    focusEl: () => (inputs.find((x) => x.input.checked) || inputs[0])?.input,
    display: (v) => { for (const { input, op } of inputs) input.checked = String(op.value) === String(v); },
    validate: (v) => baseValidate(o, v, form),
  });
  append(s.wrap, s.label, box, s.help, s.error);
  return s.wrap;
}

/**
 * Chips seleccionables (varios valores). Value = lista en el orden de las opciones.
 * Un valor guardado que ya no está entre las opciones (p. ej. una categoría eliminada) se conserva y se muestra como
 * chip marcado «… (ya no existe)»: tocarlo lo quita. `o.missingLabel(valor)` da su nombre (por defecto, el valor).
 */
function chips(form, path, o = {}) {
  const s = shell(o, { group: true });
  const box = h("div.chips", { role: "group", "aria-describedby": s.describedBy });
  const searchBox = h("input.input.input--sm", { type: "search", placeholder: "Filtrar…", "aria-label": `Filtrar ${o.label || "opciones"}` });
  let list = [];
  let btns = [];
  let entry;
  const known = (v) => list.some((x) => String(x.value) === String(v));
  const render = () => {
    list = opts(o.options);
    const values = form.get(path) || [];
    const cur = new Set(values.map(String));
    btns = list.map((op) => {
      const on = cur.has(String(op.value));
      const b = h("button.chip", { type: "button", "aria-pressed": String(on), disabled: o.disabled || op.disabled, dataset: { value: String(op.value) } },
        op.color && h("span.chip__swatch", { style: { background: op.color } }),
        h("span", op.label),
        icon(on ? "check" : "plus", { size: 14, className: "chip__icon" }));
      b.addEventListener("click", () => toggle(op));
      return b;
    });
    const missing = values.filter((v) => !known(v)).map((v) => {
      const name = String(o.missingLabel ? o.missingLabel(v) || v : v);
      const b = h("button.chip.chip--missing", { type: "button", "aria-pressed": "true", disabled: o.disabled, dataset: { value: String(v), missing: "" }, title: "Ya no existe: tócalo para quitarlo de la lista" },
        icon("alert", { size: 14 }), h("span", `${name} (ya no existe)`), icon("x", { size: 14, className: "chip__icon" }));
      b.setAttribute("aria-label", `Quitar «${name}», que ya no existe`);
      b.addEventListener("click", () => dropMissing(v));
      return b;
    });
    box.replaceChildren(...btns, ...missing);
    filter();
  };
  const dropMissing = (v) => {
    const next = (form.get(path) || []).filter((x) => String(x) !== String(v));
    form.set(path, next, { source: entry });
    render();
    (box.querySelector(".chip--missing") || btns.find((b) => !b.hidden))?.focus();
    o.onChange?.(next, form);
  };
  const filter = () => {
    const q = searchBox.value.trim().toLowerCase();
    btns.forEach((b, i) => { b.hidden = !!q && !String(list[i].label).toLowerCase().includes(q); });
  };
  searchBox.addEventListener("input", filter);
  const toggle = (op) => {
    const cur = form.get(path) || [];
    const has = cur.some((v) => String(v) === String(op.value));
    if (!has && o.max && cur.length >= o.max) { toast(`Puedes elegir hasta ${o.max}.`, { type: "warning" }); return; }
    const set = new Set((has ? cur.filter((v) => String(v) !== String(op.value)) : [...cur, op.value]).map(String));
    const next = list.filter((x) => set.has(String(x.value))).map((x) => x.value);
    // Conserva valores que ya no están en las opciones (no se pierden en silencio)
    for (const v of cur) if (!list.some((x) => String(x.value) === String(v)) && String(v) !== String(op.value)) next.push(v);
    form.set(path, next, { source: entry });
    render();
    box.querySelector(`[data-value="${CSS.escape(String(op.value))}"]`)?.focus();
    o.onChange?.(next, form);
  };
  entry = bind(form, path, s, { control: box, focusEl: () => btns.find((b) => !b.hidden), display: () => render(), validate: (v) => baseValidate(o, v, form) });
  const showSearch = o.search ?? list.length > 12;
  append(s.wrap, s.label, showSearch && searchBox, box, s.help, s.error);
  return s.wrap;
}

/** Etiquetas libres: Enter o coma agregan, Retroceso borra la última. maxMessage: aviso al llegar a `max` ("Máximo 12 tallas."). */
function tags(form, path, o = {}) {
  const s = shell(o);
  const listId = o.suggestions ? uid("dl") : null;
  const input = h("input.tags__input", { id: s.id, type: "text", placeholder: o.placeholder || "Escribe y presiona Enter", autocomplete: "off", list: listId, "aria-describedby": s.describedBy, disabled: o.disabled });
  const chipsBox = h("ul.tags__list", { "aria-label": o.label ? `${o.label}: etiquetas` : "Etiquetas" });
  const box = h("div.tags", input.disabled ? { class: "is-disabled" } : null, chipsBox, input);
  box.addEventListener("click", (e) => { if (e.target === box || e.target === chipsBox) input.focus(); });
  let entry;
  const maxMsg = () => o.maxMessage || `Máximo ${o.max} etiquetas.`;
  const norm = (t) => {
    let v = String(t).replace(/\s+/g, " ").trim();
    if (o.lowercase) v = v.toLowerCase();
    if (o.maxlength) v = [...v].slice(0, o.maxlength).join("");
    return v;
  };
  const add = (raw) => {
    const parts = String(raw).split(o.separator || /[,\n;]/).map(norm).filter(Boolean);
    if (!parts.length) return;
    const cur = (form.get(path) || []).slice();
    const keys = new Set(cur.map((x) => String(x).toLowerCase()));
    for (const p of parts) {
      if (o.max && cur.length >= o.max) { toast(maxMsg(), { type: "warning" }); break; }
      if (!keys.has(p.toLowerCase())) { cur.push(p); keys.add(p.toLowerCase()); }
    }
    input.value = "";
    form.set(path, cur, { source: entry });
    render();
    o.onChange?.(cur, form);
  };
  const removeAt = (i, refocus = true) => {
    const cur = (form.get(path) || []).slice();
    cur.splice(i, 1);
    form.set(path, cur, { source: entry });
    render();
    if (refocus) input.focus();
    o.onChange?.(cur, form);
  };
  const render = () => {
    const cur = form.get(path) || [];
    chipsBox.replaceChildren(...cur.map((t, i) => h("li.tag", h("span.tag__text", String(t)),
      h("button.tag__x", { type: "button", "aria-label": `Quitar ${t}`, title: `Quitar ${t}`, onClick: () => removeAt(i) }, icon("x", { size: 12, strokeWidth: 2.4 })))));
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || (e.key === "," && !o.separator)) {
      if (input.value.trim()) { e.preventDefault(); add(input.value); } else if (e.key === "Enter") e.preventDefault();
    } else if (e.key === "Backspace" && !input.value) {
      const cur = form.get(path) || [];
      if (cur.length) removeAt(cur.length - 1);
    }
  });
  input.addEventListener("paste", (e) => {
    const t = e.clipboardData?.getData("text") || "";
    if (/[,\n;]/.test(t)) { e.preventDefault(); add(t); }
  });
  input.addEventListener("blur", () => { if (input.value.trim()) add(input.value); });
  entry = bind(form, path, s, {
    control: input,
    display: () => render(),
    validate: (v) => (o.max && (v || []).length > o.max ? maxMsg() : baseValidate(o, v, form)),
  });
  append(s.wrap, s.label, box, listId && h("datalist", { id: listId }, opts(o.suggestions).map((x) => h("option", { value: x }))), foot(s, null), s.error);
  return s.wrap;
}

/* ---------- Color ---------- */
function color(form, path, o = {}) {
  const s = shell(o);
  const picker = h("input.color-input__picker", { type: "color", "aria-label": `${o.label || "Color"}: selector`, disabled: o.disabled });
  const hex = h("input.input.color-input__hex", { id: s.id, type: "text", maxlength: 7, placeholder: "#bb3f17", autocomplete: "off", spellcheck: "false", "aria-describedby": s.describedBy, disabled: o.disabled });
  const swatch = h("span.color-input__swatch", { "aria-hidden": "true" });
  const box = h("div.color-input", h("label.color-input__picker-wrap", swatch, picker), hex);
  let entry;
  const show = (v) => {
    const ok = typeof v === "string" && HEX_RE.test(v);
    swatch.style.background = ok ? v : "transparent";
    swatch.classList.toggle("is-empty", !ok);
    if (ok) picker.value = v.toLowerCase();
  };
  picker.addEventListener("input", () => {
    const v = picker.value.toLowerCase();
    hex.value = v;
    show(v);
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  hex.addEventListener("input", () => {
    let v = hex.value.trim();
    if (/^[0-9a-fA-F]{6}$/.test(v)) v = "#" + v;
    v = HEX_RE.test(v) ? v.toLowerCase() : v;
    show(v);
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  hex.addEventListener("blur", () => { const v = form.get(path); if (typeof v === "string" && HEX_RE.test(v)) hex.value = v; });
  entry = bind(form, path, s, {
    control: hex,
    display: (v) => { hex.value = v ?? ""; show(v); },
    validate: (v) => {
      if (isEmpty(v)) return isRequired(o, form) ? o.requiredMessage || "Elige un color." : null;
      if (!HEX_RE.test(v)) return "Usa un color hexadecimal de 6 dígitos, p. ej. #bb3f17.";
      return o.validate ? o.validate(v, form) : null;
    },
  });
  append(s.wrap, s.label, box, foot(s, null), s.error);
  return s.wrap;
}

/* ---------- Fecha ---------- */
function dateField(form, path, o = {}) {
  const s = shell(o);
  const input = h("input.input.input--date", { id: s.id, type: "date", min: o.min, max: o.max, disabled: o.disabled, "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null });
  let entry;
  input.addEventListener("change", () => {
    const v = input.value || null;
    form.set(path, v, { source: entry });
    o.onChange?.(v, form);
  });
  input.addEventListener("input", () => { const v = input.value || null; if (v !== form.get(path)) form.set(path, v, { source: entry }); });
  const clearBtn = o.clearable !== false && (!o.required || typeof o.required === "function")
    ? button({ label: "Quitar fecha", variant: "link", size: "sm", onClick: () => { input.value = ""; form.set(path, null, { source: entry }); o.onChange?.(null, form); } })
    : null;
  entry = bind(form, path, s, {
    control: input,
    display: (v) => { input.value = v || ""; if (clearBtn) clearBtn.hidden = !v; },
    validate: (v) => baseValidate(o, v, form),
  });
  form.on("change", ({ path: p }) => { if (clearBtn && (p === path || !p)) clearBtn.hidden = !form.get(path); });
  append(s.wrap, s.label, h("div.date-input", input, clearBtn), foot(s, null), s.error);
  return s.wrap;
}

/* ---------- URL ---------- */
function url(form, path, o = {}) {
  const kind = o.kind || "link";
  const s = shell(o);
  const input = h("input.input", { id: s.id, type: "text", inputmode: "url", name: o.name || path, placeholder: o.placeholder || (kind === "external" ? "https://…" : "https://… o catalogo.html"), autocomplete: "off", spellcheck: "false", disabled: o.disabled, "aria-describedby": s.describedBy, "aria-required": o.required ? "true" : null });
  const open = h("a.input-group__btn", { href: "#", target: "_blank", rel: "noopener", "aria-label": "Abrir en una pestaña nueva", title: "Abrir en una pestaña nueva", hidden: true }, icon("external", { size: 16 }));
  let entry;
  const upd = (v) => {
    const ok = typeof v === "string" && v && isSafeUrl(v.trim(), kind) && !v.trim().startsWith("#");
    open.hidden = !ok;
    if (ok) open.href = /^https?:/i.test(v.trim()) ? v.trim() : siteUrl(v.trim());
  };
  input.addEventListener("input", () => { form.set(path, input.value, { source: entry }); upd(input.value); o.onChange?.(input.value, form); });
  input.addEventListener("blur", () => {
    const t = input.value.trim();
    if (t !== input.value) { input.value = t; form.set(path, t, { source: entry }); }
  });
  entry = bind(form, path, s, {
    control: input,
    display: (v) => { input.value = v ?? ""; upd(v); },
    validate: (v) => {
      const t = typeof v === "string" ? v.trim() : "";
      if (!t) return isRequired(o, form) ? o.requiredMessage || "Este campo es obligatorio." : null;
      if (!isSafeUrl(t, kind)) return URL_MESSAGES[kind];
      return o.validate ? o.validate(t, form) : null;
    },
  });
  append(s.wrap, s.label, h("div.input-group.input-group--btn", input, open), foot(s, null), s.error);
  return s.wrap;
}

/* ---------- Título con acento ---------- */
/**
 * Vista previa de un texto del contenido con las convenciones del contrato §2:
 * *palabra* → cursiva de marca · \n → línea nueva · {descuento} → etiqueta del cupón.
 */
export function renderRich(textValue, { multiline = false, discountLabel = "15%" } = {}) {
  const fmt = (line) => escapeHtml(line)
    .replace(/\*([^*\n]+)\*/g, '<span class="accent">$1</span>')
    .replace(/\{descuento\}/g, `<span class="rich-chip">${escapeHtml(discountLabel)}</span>`);
  const lines = String(textValue ?? "").replace(/\r\n?/g, "\n").split("\n");
  return multiline ? lines.map((l) => `<span class="rich-line">${fmt(l) || "&nbsp;"}</span>`).join("") : lines.map(fmt).join("<br>");
}

/**
 * fields.accentTitle(form, ruta, { label, multiline, discount, maxlength, required, …,
 *   discountLabel: "15%" | (form) => "15%" })   // función = la vista previa sigue en vivo al cupón elegido
 */
function accentTitle(form, path, o = {}) {
  const multiline = !!o.multiline;
  const dynamicLabel = typeof o.discountLabel === "function";
  // Con una función, "" (sin cupón) muestra el marcador tal cual; con un texto fijo se conserva el respaldo "15%"
  const labelOf = () => {
    if (!dynamicLabel) return o.discountLabel || "15%";
    try { return String(o.discountLabel(form) || "") || "{descuento}"; } catch (e) { console.error(e); return "{descuento}"; }
  };
  const s = shell(o);
  const ctrl = multiline
    ? h("textarea.input.input--textarea.input--title", { id: s.id, rows: o.rows || 2, placeholder: o.placeholder, "aria-describedby": `${s.describedBy} ${s.id}-tips`, "aria-required": o.required ? "true" : null })
    : h("input.input.input--title", { id: s.id, type: "text", placeholder: o.placeholder, autocomplete: "off", "aria-describedby": `${s.describedBy} ${s.id}-tips`, "aria-required": o.required ? "true" : null });
  const c = counter(o, s);
  const preview = h("div.rich-preview__body", { class: [multiline && "is-multiline", o.previewClass] });
  const tipsList = [h("span", "Escribe ", h("code", "*palabra*"), " para resaltarla con la cursiva de marca.")];
  if (multiline) tipsList.push(h("span", " Cada Enter es una línea nueva."));
  if (o.discount) tipsList.push(h("span", " ", h("code", "{descuento}"), " se reemplaza por el valor del cupón."));
  const tips = h("p.field__tips", { id: `${s.id}-tips` }, tipsList);
  const italicBtn = h("button.rich-tool", { type: "button", title: "Cursiva de marca (envuelve la selección con *)", "aria-label": "Aplicar cursiva de marca a la selección" }, icon("italic", { size: 15 }), h("span", "Cursiva de marca"));
  let entry;
  let shownLabel = labelOf();
  const upd = (v) => { shownLabel = labelOf(); preview.innerHTML = renderRich(v, { multiline, discountLabel: shownLabel }) || "&nbsp;"; c?.update(v); };
  // La etiqueta del cupón puede depender de otro campo (p. ej. el cupón de bienvenida elegido)
  if (dynamicLabel) watchForm(form, s.wrap, () => { if (labelOf() !== shownLabel) upd(ctrl.value); });
  const onInput = () => {
    upd(ctrl.value);
    if (multiline) autosize(ctrl);
    form.set(path, ctrl.value, { source: entry });
    o.onChange?.(ctrl.value, form);
  };
  ctrl.addEventListener("input", onInput);
  if (multiline) ctrl.addEventListener("focus", () => autosize(ctrl));
  italicBtn.addEventListener("click", () => {
    let a = ctrl.selectionStart ?? ctrl.value.length;
    let b = ctrl.selectionEnd ?? ctrl.value.length;
    // Los espacios de los bordes de la selección quedan fuera de los asteriscos
    while (a < b && /\s/.test(ctrl.value[a])) a++;
    while (b > a && /\s/.test(ctrl.value[b - 1])) b--;
    const sel = ctrl.value.slice(a, b);
    const word = sel || "palabra";
    const next = ctrl.value.slice(0, a) + `*${word}*` + ctrl.value.slice(b);
    ctrl.value = next;
    ctrl.focus();
    ctrl.setSelectionRange(a + 1, a + 1 + word.length);
    onInput();
  });
  entry = bind(form, path, s, {
    control: ctrl,
    display: (v) => { ctrl.value = v ?? ""; upd(v ?? ""); if (multiline) requestAnimationFrame(() => autosize(ctrl)); },
    validate: (v) => baseValidate(o, v, form),
  });
  append(s.wrap,
    h("div.field__labelrow", s.label, italicBtn),
    ctrl,
    h("div.field__foot", tips, c?.el),
    s.help,
    h("div.rich-preview", { "aria-hidden": "true" }, h("span.rich-preview__label", "Vista previa"), preview),
    s.error);
  s.wrap.classList.add("field--rich");
  return s.wrap;
}

/* ---------- Lista repetible ---------- */
/**
 * fields.list(form, "home.marquee", {
 *   label, help, min, max, addLabel: "Agregar frase", newItem: () => ({ icon: "star", text: "" }),
 *   renderItem: (itemPath, index, item, api) => Node,   // usa fields.*(form, `${itemPath}.text`, …)
 *   itemLabel: (item, i) => item.text || `Frase ${i + 1}`,
 *   sortable: true, collapsible: false, confirmRemove: false | "¿Quitar esta frase?", emptyText,
 *   initiallyOpen: (item, i) => bool,          // con collapsible: qué ítems empiezan abiertos (por defecto ninguno)
 *   itemMeta: (item, i) => Node | null,        // insignias en la cabecera; se vuelve a llamar cuando cambia el ítem
 *   beforeRemove: async (item, i) => bool,     // false = no quitar (p. ej. "está en uso"); va antes de confirmRemove
 * })
 * api del ítem: { index, remove(), moveUp(), moveDown(), toggle(), open(), close() }
 * Al redibujarse desde fuera (guardar con Ctrl/Cmd+S, Descartar…) conserva el foco del campo que se estaba editando.
 */
const FOCUSABLE_IN_ITEM = "input:not([type='hidden']), select, textarea, button, a[href], [tabindex]:not([tabindex='-1'])";

function list(form, path, o = {}) {
  const s = shell(o, { group: true });
  const sortable = o.sortable !== false;
  const ul = h("ol.list-field", { class: !sortable && "list-field--nosort", "aria-describedby": s.describedBy });
  const min = o.min ?? 0;
  const max = o.max ?? Infinity;
  const addBtn = button({ label: o.addLabel || "Agregar", icon: "plus", variant: "secondary", size: "sm", onClick: () => add() });
  const limitNote = h("span.list-field__limit");
  const empty = h("p.list-field__empty", o.emptyText || "Aún no hay elementos.");
  let entry;
  let openState = [];
  let dragFrom = null;
  const itemName = (i) => {
    const item = (form.get(path) || [])[i];
    const n = o.itemLabel ? o.itemLabel(item, i) : "";
    return n ? String(n) : `Elemento ${i + 1}`;
  };
  const items = () => form.get(path) || [];
  const startOpen = (item, i) => {
    if (!o.collapsible) return true;
    if (!o.initiallyOpen) return false;
    try { return !!o.initiallyOpen(item, i); } catch (e) { console.error(e); return false; }
  };
  const commit = (arr, focusSel) => {
    form.set(path, arr, { source: entry });
    render();
    o.onChange?.(arr, form);
    if (focusSel) requestAnimationFrame(() => { const el = focusSel(); el?.focus(); });
  };

  function add() {
    const arr = clone(items());
    if (arr.length >= max) return;
    const item = typeof o.newItem === "function" ? o.newItem(arr) : clone(o.newItem ?? "");
    arr.push(item);
    openState.push(true);
    commit(arr, () => {
      const li = ul.children[arr.length - 1];
      return li && (li.querySelector("input, textarea, select, button.list-item__toggle") || li);
    });
  }

  let removing = false;
  async function remove(i) {
    if (removing) return;
    const arr = clone(items());
    if (arr.length <= min) return;
    const before = arr[i];
    removing = true;
    try {
      if (o.beforeRemove) {
        let ok = false;
        try { ok = await o.beforeRemove(before, i); } catch (e) { console.error(e); ok = false; }
        if (!ok) return;
      }
      if (o.confirmRemove) {
        const ok = await confirmDialog({ title: typeof o.confirmRemove === "string" ? o.confirmRemove : `¿Quitar «${itemName(i)}»?`, message: "Se quitará de la lista cuando guardes los cambios.", confirmLabel: "Quitar", danger: true });
        if (!ok) return;
      }
    } finally {
      removing = false;
    }
    // Mientras se confirmaba, la lista pudo cambiar (otro guardado, Descartar…): se quita el mismo ítem
    const cur = clone(items());
    const at = cur[i] !== undefined && deepEqual(cur[i], before) ? i : cur.findIndex((x) => deepEqual(x, before));
    if (at === -1 || cur.length <= min) return;
    cur.splice(at, 1);
    openState.splice(at, 1);
    commit(cur, () => ul.children[Math.min(at, cur.length - 1)]?.querySelector(".list-item__remove:not([disabled])") || addBtn);
  }

  function move(from, to, refocusSel = ".list-item__drag") {
    const arr = clone(items());
    if (to < 0 || to >= arr.length || from === to) return;
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    const [st] = openState.splice(from, 1);
    openState.splice(to, 0, st);
    // Si la flecha quedó deshabilitada (primero/último), el foco pasa a la otra flecha
    commit(arr, () => ul.children[to]?.querySelector(`${refocusSel}:not([disabled])`) || ul.children[to]?.querySelector(".list-item__up:not([disabled]), .list-item__down:not([disabled])"));
  }

  /* Insignias de la cabecera (itemMeta): se recalculan cuando cambia algo dentro de la lista */
  function metaFor(i) {
    if (!o.itemMeta) return null;
    try { return o.itemMeta(items()[i], i) || null; } catch (e) { console.error(e); return null; }
  }
  function refreshMetas() {
    if (!o.itemMeta) return;
    Array.from(ul.children).forEach((li, i) => {
      const box = li.querySelector(":scope > .list-item__head > .list-item__meta, :scope > .list-item__controls > .list-item__meta");
      if (box) replace(box, metaFor(i));
    });
  }

  function render() {
    const arr = items();
    for (let k = openState.length; k < arr.length; k++) openState.push(startOpen(arr[k], k));
    openState.length = arr.length;
    ul.replaceChildren();
    arr.forEach((item, i) => {
      const itemPath = `${path}.${i}`;
      const api = {
        index: i,
        remove: () => remove(i),
        moveUp: () => move(i, i - 1, ".list-item__up"),
        moveDown: () => move(i, i + 1, ".list-item__down"),
        toggle: () => setOpen(i, !openState[i]),
        open: () => setOpen(i, true),
        close: () => setOpen(i, false),
      };
      const body = h("div.list-item__body", { id: uid("li-b") });
      append(body, o.renderItem ? o.renderItem(itemPath, i, item, api) : null);
      const name = itemName(i);
      const meta = o.itemMeta ? h("span.list-item__meta", metaFor(i)) : null;
      const controls = h("div.list-item__controls",
        o.collapsible ? null : meta,
        sortable && iconButton({ icon: "arrow-up", label: `Subir «${name}»`, size: "sm", className: "list-item__up", disabled: i === 0, onClick: api.moveUp }),
        sortable && iconButton({ icon: "arrow-down", label: `Bajar «${name}»`, size: "sm", className: "list-item__down", disabled: i === arr.length - 1, onClick: api.moveDown }),
        iconButton({ icon: "trash", label: `Quitar «${name}»`, size: "sm", className: "list-item__remove", disabled: arr.length <= min, onClick: api.remove }));
      const handle = sortable ? h("span.list-item__drag", { title: "Arrastra para ordenar", "aria-hidden": "true" }, icon("grip", { size: 16 })) : null;
      const li = h("li.list-item", { class: o.collapsible && "list-item--collapsible", dataset: { index: i } });
      if (o.collapsible) {
        const toggle = h("button.list-item__toggle", { type: "button", "aria-expanded": String(!!openState[i]), "aria-controls": body.id },
          icon("chevron-right", { size: 16, className: "list-item__chev" }), h("span.list-item__title", name));
        toggle.addEventListener("click", () => setOpen(i, !openState[i]));
        body.hidden = !openState[i];
        body.setAttribute("data-reveal", "");
        body.addEventListener("reveal", () => setOpen(i, true));
        li.append(h("div.list-item__head", handle, h("span.list-item__num", String(i + 1)), toggle, meta, controls), body);
      } else {
        li.append(handle, h("span.list-item__num", { "aria-hidden": "true" }, String(i + 1)), body, controls);
      }
      if (sortable) {
        handle.addEventListener("pointerdown", () => { li.draggable = true; });
        li.addEventListener("dragstart", (e) => {
          if (!li.draggable) { e.preventDefault(); return; }
          e.stopPropagation();
          dragFrom = i;
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* Safari */ }
          requestAnimationFrame(() => li.classList.add("is-dragging"));
        });
        li.addEventListener("dragend", () => { li.draggable = false; dragFrom = null; li.classList.remove("is-dragging"); ul.querySelectorAll("[data-drop]").forEach((x) => x.removeAttribute("data-drop")); });
        li.addEventListener("dragover", (e) => {
          if (dragFrom === null) return;
          e.preventDefault();
          e.stopPropagation();
          const r = li.getBoundingClientRect();
          li.dataset.drop = e.clientY > r.top + r.height / 2 ? "after" : "before";
        });
        li.addEventListener("dragleave", () => li.removeAttribute("data-drop"));
        li.addEventListener("drop", (e) => {
          if (dragFrom === null) return;
          e.preventDefault();
          e.stopPropagation();
          const after = li.dataset.drop === "after";
          li.removeAttribute("data-drop");
          let to = after ? i + 1 : i;
          if (dragFrom < to) to -= 1;
          const from = dragFrom;
          dragFrom = null;
          move(from, to);
        });
      }
      ul.append(li);
    });
    empty.hidden = arr.length > 0;
    addBtn.disabled = arr.length >= max || !!o.disabled;
    limitNote.textContent = Number.isFinite(max) ? `${arr.length}/${max}` : "";
  }

  /**
   * Redibujo pedido desde fuera (form.reset al guardar, Descartar, form.set de la lista): los ítems se vuelven a
   * crear, así que se recuerda qué campo tenía el foco (y su selección) para devolverlo al mismo lugar.
   */
  function renderKeepingFocus() {
    const act = document.activeElement;
    let keep = null;
    if (act && act !== document.body && ul.contains(act)) {
      let top = act;
      while (top && top.parentElement !== ul) top = top.parentElement;
      if (top) {
        keep = { index: Array.prototype.indexOf.call(ul.children, top), name: act.getAttribute("name"), pos: Array.from(top.querySelectorAll(FOCUSABLE_IN_ITEM)).indexOf(act), sel: null };
        try { if (typeof act.selectionStart === "number") keep.sel = [act.selectionStart, act.selectionEnd, act.selectionDirection]; } catch { /* tipos sin selección */ }
      }
    }
    render();
    if (!keep) return;
    const li = ul.children[Math.min(keep.index, ul.children.length - 1)];
    if (!li) return;
    let el = keep.name ? li.querySelector(`[name="${CSS.escape(keep.name)}"]`) : null;
    if (!el && keep.pos >= 0) el = li.querySelectorAll(FOCUSABLE_IN_ITEM)[keep.pos] || null;
    if (!el) return;
    revealElement(el, { tabs: false });
    el.focus({ preventScroll: true });
    if (keep.sel) { try { el.setSelectionRange(...keep.sel); } catch { /* no aplica */ } }
  }

  function setOpen(i, v) {
    openState[i] = v;
    const li = ul.children[i];
    if (!li) return;
    const body = li.querySelector(":scope > .list-item__body");
    const t = li.querySelector(":scope > .list-item__head .list-item__toggle");
    if (body) body.hidden = !v;
    t?.setAttribute("aria-expanded", String(v));
  }

  entry = bind(form, path, s, {
    control: ul,
    focusEl: () => ul.querySelector("input, textarea, select, button") || addBtn,
    display: () => renderKeepingFocus(),
    validate: (v) => {
      const n = (v || []).length;
      if (n < min) return min === 1 ? "Agrega al menos un elemento." : `Agrega al menos ${min} elementos.`;
      if (n > max) return `Máximo ${max} elementos.`;
      return o.validate ? o.validate(v, form) : null;
    },
    childChanged: (p) => {
      // Actualiza los títulos e insignias de los ítems (sin redibujar: no se pierde el foco al escribir)
      const rest = p.slice(path.length + 1);
      const i = Number(rest.split(".")[0]);
      if (!Number.isInteger(i)) return;
      const li = ul.children[i];
      const t = li?.querySelector(":scope > .list-item__head .list-item__title");
      if (t) t.textContent = itemName(i);
      refreshMetas();
    },
  });
  s.wrap.classList.add("field--list");
  append(s.wrap, s.label, s.help, ul, empty, h("div.list-field__foot", addBtn, limitNote), s.error);
  return s.wrap;
}

/* ---------- Medios ---------- */
/**
 * fields.media(form, "home.hero.media.src", { kind: "video"|"image", label, help, previewBg, onChange(url, item, form),
 *   required: true | (form) => bool, requiredMessage, validate: (url, form) => "mensaje" | null })
 * validate se llama SIEMPRE (también vacío, con ""): sirve para reglas que dependen de otros campos.
 */
function media(form, path, o = {}) {
  const s = shell(o);
  let entry;
  const mf = mediaField({
    kind: o.kind || "image",
    value: form.get(path) || "",
    id: s.id,
    labelledBy: s.labelId,
    label: o.label,
    previewBg: o.previewBg,
    allowUrl: o.allowUrl,
    describedBy: s.describedBy,
    onChange: (u, item) => {
      form.set(path, u, { source: entry });
      o.onChange?.(u, item, form);
    },
  });
  entry = bind(form, path, s, {
    control: mf,
    focusEl: () => mf.querySelector("button"),
    display: (v) => mf.setValue(v || ""),
    validate: (v) => {
      const t = typeof v === "string" ? v.trim() : "";
      if (!t && isRequired(o, form)) return o.requiredMessage || "Elige un archivo o pega una URL.";
      if (t && !isSafeUrl(t, "media")) return URL_MESSAGES.media;
      return o.validate ? o.validate(t, form) || null : null;
    },
  });
  if (s.label) s.label.removeAttribute("for");
  append(s.wrap, s.label, mf, s.help, s.error);
  return s.wrap;
}

/** fields.photos(form, "colors.0.photos", { max: 4, label }) — fotos de un color de producto. */
function photos(form, path, o = {}) {
  const s = shell(o, { group: true });
  let entry;
  const pl = photoListField({
    max: o.max ?? 4,
    value: form.get(path) || [],
    label: o.label,
    onChange: (arr) => {
      form.set(path, arr, { source: entry });
      o.onChange?.(arr, form);
    },
  });
  entry = bind(form, path, s, {
    control: pl,
    focusEl: () => pl.querySelector("button"),
    display: (v) => pl.setValue(v || []),
    validate: (v) => {
      const n = (v || []).length;
      if (n > (o.max ?? 4)) return `Máximo ${o.max ?? 4} fotos.`;
      if (isRequired(o, form) && !n) return o.requiredMessage || "Agrega al menos una foto.";
      return null;
    },
  });
  append(s.wrap, s.label, s.help, pl, s.error);
  return s.wrap;
}

/* ---------- Personalizado ---------- */
/**
 * fields.custom(form, ruta, { label, help, group, required, validate,
 *   create: ({ value, onChange, id, describedBy, labelId }) => ({ el, setValue(v), focus?(), control? }) })
 * Para conectar cualquier componente propio al formulario.
 *   id          ponlo en el control enfocable (el <label> apunta a él)
 *   labelId     id de la etiqueta (<label> o, con group: true, la <legend>) → aria-labelledby de un control propio
 *   control     elemento "real" que recibe aria-invalid / aria-required; por defecto `el` si es un control o tiene
 *               role, si no su primer input/select/textarea (o el primer elemento con role de grupo)
 * Con group: true, si el control tiene role (radiogroup, group, listbox…) y no tiene nombre, se le pone
 * aria-labelledby con la <legend>.
 */
const CUSTOM_CONTROL = "input, select, textarea, [role='radiogroup'], [role='group'], [role='listbox'], [role='grid'], [role='slider'], [role='spinbutton'], [role='switch'], [role='combobox']";

function custom(form, path, o = {}) {
  const s = shell(o, { group: !!o.group });
  let entry;
  const w = o.create({ value: form.get(path), id: s.id, describedBy: s.describedBy, labelId: s.labelId, onChange: (v) => { form.set(path, v, { source: entry }); o.onChange?.(v, form); } });
  const realControl = () => {
    if (w.control) return typeof w.control === "function" ? w.control() : w.control;
    if (w.el.matches?.(`${CUSTOM_CONTROL}, [role]`)) return w.el;
    return w.el.querySelector?.(CUSTOM_CONTROL) || w.el;
  };
  if (o.group && s.labelId) {
    const c = realControl();
    if (c && c.hasAttribute("role") && !c.hasAttribute("aria-label") && !c.hasAttribute("aria-labelledby")) c.setAttribute("aria-labelledby", s.labelId);
  }
  entry = bind(form, path, s, {
    control: w.el,
    ariaEl: realControl,
    focusEl: () => (w.focus ? { focus: w.focus } : w.el.querySelector("input, select, textarea, button")),
    display: (v) => w.setValue?.(v),
    validate: (v) => baseValidate(o, v, form),
  });
  append(s.wrap, s.label, w.el, foot(s, null), s.error);
  return s.wrap;
}

/** Fila de campos (2–4 columnas que se apilan en móvil). fields.row(a, b, { cols: 3 }) */
function row(...children) {
  let cfg = {};
  if (children.length && children[children.length - 1] && !(children[children.length - 1] instanceof Node) && !Array.isArray(children[children.length - 1])) cfg = children.pop();
  return h("div.form-row", { class: cfg.cols && `form-row--${cfg.cols}` }, children);
}

/** Dato de solo lectura con la misma apariencia de un campo. */
function readonly(label, value, { help } = {}) {
  return h("div.field.field--readonly", h("span.field__label", label), h("div.field__value", value ?? "—"), help && h("p.field__help", help));
}

export const fields = {
  text, textarea, password, number: numberField, money, select, checkbox,
  switch: (form, path, o) => checkbox(form, path, o, { asSwitch: true }),
  radio: (form, path, o) => choiceGroup(form, path, o, "radio"),
  segmented: (form, path, o) => choiceGroup(form, path, o, "segmented"),
  chips, multiselect: chips, tags, color, date: dateField, url, accentTitle, list, media, photos, custom, row, readonly,
};

/** Campo suelto con label (para formularios sin Form, p. ej. filtros): field({ label, help, control }) */
export function field({ label, help, control, id } = {}) {
  const cid = id || control?.id || uid("f");
  if (control && !control.id) control.id = cid;
  return h("div.field", label && h("label.field__label", { for: cid }, label), control, help && h("p.field__help", help));
}

/* Accesos de conveniencia para quien escribe vistas */
export { $ };
