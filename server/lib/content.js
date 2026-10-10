/* ==========================================================================
   Mercy Studio — server/lib/content.js
   Contenido del sitio (content.json):
   · Siembra desde js/defaults.js (node:vm) la primera vez + revisión "Contenido inicial".
   · Contenido público (§4.1): sin borradores, sin meta.sections, sin couponCode, con welcome y __source.
   · Cambios de secciones y productos: validación estricta, integridad (in_use), concurrencia
     (X-Base-Updated-At), meta por sección, revisión (instantánea) y actividad.
   · Restaurar revisiones (sin tocar el cupón de bienvenida; sin dejar cupones con categorías/productos que ya no existen).
   · Productos renombrados: `formerIds` (ids anteriores) para que enlaces, carritos y favoritos viejos sigan funcionando.
   · Cuerpos público (JSON/JS) y del panel en caché por versión, con su gzip (se comprime una vez por cambio).
   Regla: el contenido en caché NUNCA se modifica en sitio; cada cambio arma un objeto nuevo.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { err } from "./http.js";
import { couponLabel } from "./coupons.js";
import {
  SECTION_NAMES, SECTIONS, formerIdsOf, refsFrom, validateContent, validateCoupon, validateProduct, validateSection,
} from "./validate.js";
import { colombiaToday, deepEqual, formatDateTimeEs, isPlainObject, nowIso } from "./util.js";
import { INITIAL_SUMMARY } from "./revisions.js";

const SYSTEM = { id: null, name: "Sistema" };
export const RESEED_SUMMARY = "Contenido de fábrica (content.json se creó de nuevo)";
export const BASELINE_SUMMARY = "Contenido existente al arrancar (sin historial previo)";
export const LOW_STOCK = 10; // unidades totales o menos = "poco stock" en el escritorio

/** Ejecuta js/defaults.js en un sandbox y devuelve copias JSON puras de DEFAULT_CONTENT / DEFAULT_COUPONS. */
export function loadFactoryDefaults(file) {
  const code = readFileSync(file, "utf8");
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file, timeout: 2000 });
  const M = sandbox.Mercy;
  if (!M || !isPlainObject(M.DEFAULT_CONTENT)) throw new Error(`${file} no define Mercy.DEFAULT_CONTENT`);
  return JSON.parse(JSON.stringify({ content: M.DEFAULT_CONTENT, coupons: Array.isArray(M.DEFAULT_COUPONS) ? M.DEFAULT_COUPONS : [] }));
}

const etag = (s) => `"${createHash("sha1").update(s).digest("base64url")}"`;
const fieldsList = (fields, n = 12) => Object.entries(fields).slice(0, n).map(([k, v]) => `  · ${k}: ${v}`).join("\n");
const hasErrors = (fields) => Object.keys(fields).length > 0;
const stripStamp = ({ createdAt, updatedAt, updatedBy, ...rest }) => rest;
/** Resumen corto de una revisión para citarla («Contenido inicial»). */
const shortSummary = (s) => { const t = String(s || "").trim(); return t.length > 80 ? t.slice(0, 79).trimEnd() + "…" : t; };

/**
 * Pone `formerIds` (ids anteriores, los gestiona el servidor) en el producto validado `v`: la clave va justo antes de
 * las marcas de fecha y solo existe si hay alguno (orden estable para comparar con deepEqual).
 */
function withFormerIds(v, list) {
  const { formerIds, createdAt, updatedAt, updatedBy, ...rest } = v;
  const ids = formerIdsOf(list, v.id);
  const stamps = Object.fromEntries(Object.entries({ createdAt, updatedAt, updatedBy }).filter(([, x]) => x !== undefined));
  return { ...rest, ...(ids.length ? { formerIds: ids } : {}), ...stamps };
}

function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " y " + names[names.length - 1];
}
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

export function productStock(p) {
  return (p.colors || []).reduce((sum, c) => sum + Object.values(c.stock || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
}

export class ContentService {
  constructor(app) {
    this.app = app;
    this.db = app.db;
    this._pub = null;
  }

  get data() { return this.db.get("content"); }

  /* ---------- Arranque / siembra ----------
     · js/defaults.js SOLO se lee si falta content.json o coupons.json (nunca se vuelve a sembrar encima
       de datos existentes: cambiar js/defaults.js no toca un sitio ya en marcha).
     · Revisiones: «Contenido inicial» (fijada) al sembrar la primera vez; si content.json se borró y se
       vuelve a crear, otra instantánea fijada «Contenido de fábrica (…)»; si hay contenido pero no historial,
       una revisión base (no es el contenido de fábrica, por eso no se llama «Contenido inicial»). */
  async init() {
    const { defaultsPath, log } = this.app.config;
    const coupons = await this.db.load("coupons", []);
    const content = await this.db.load("content", null);
    let factory = null;
    const getFactory = () => (factory ??= loadFactoryDefaults(defaultsPath));

    if (!content.exists) {
      const f = getFactory();
      const codes = new Set((coupons.exists ? coupons.value : f.coupons).map((c) => String(c.code || "").toUpperCase()));
      let raw = f.content;
      let { value, fields } = validateContent(raw, { couponCodes: codes });
      // content.json recreado con los cupones de siempre: si el cupón de bienvenida de fábrica ya no existe
      // (se renombró o borró), el modal queda sin cupón en lugar de impedir el arranque.
      if (coupons.exists && fields["discountModal.couponCode"]) {
        log(`[datos] Aviso: el cupón de bienvenida de fábrica «${raw?.discountModal?.couponCode}» no existe en coupons.json; el modal de descuento queda sin cupón (elígelo en el panel → Modal de descuento).`);
        raw = { ...raw, discountModal: { ...raw.discountModal, couponCode: "" } };
        ({ value, fields } = validateContent(raw, { couponCodes: codes }));
      }
      if (hasErrors(fields)) throw new Error(`El contenido de fábrica (js/defaults.js) no pasa la validación:\n${fieldsList(fields)}`);
      const now = nowIso();
      value.meta = { updatedAt: now, updatedBy: SYSTEM.name, sections: Object.fromEntries(SECTIONS.map((s) => [s, { updatedAt: now, updatedBy: SYSTEM.name }])) };
      value.products = value.products.map((p) => ({ ...p, createdAt: p.createdAt || now, updatedAt: p.updatedAt || now, updatedBy: p.updatedBy || SYSTEM.name }));
      await this.db.set("content", value);
      log(`[datos] content.json creado con el contenido de fábrica (${value.products.length} productos).`);
    } else {
      const { fields } = validateContent(this.data, { couponCodes: new Set(this.db.get("coupons").map((c) => c.code)) });
      if (hasErrors(fields)) log(`[datos] Aviso: content.json tiene ${Object.keys(fields).length} campo(s) fuera del esquema (se sirven igual):\n${fieldsList(fields, 5)}`);
    }

    if (!coupons.exists) {
      const f = getFactory();
      const refs = refsFrom(this.data);
      const now = nowIso();
      const list = f.coupons.flatMap((raw, i) => {
        const { value, fields } = validateCoupon(raw, refs);
        if (hasErrors(fields)) {
          const msg = `El cupón de fábrica #${i + 1} (${raw?.code || "sin código"}) no pasa la validación:\n${fieldsList(fields)}`;
          // Sitio nuevo: js/defaults.js es incoherente → error. Contenido ya existente (p. ej. se borró una
          // categoría que el cupón usaba): se omite ese cupón y se avisa, sin impedir el arranque.
          if (!content.exists) throw new Error(msg);
          log(`[datos] Aviso: ${msg}\n  (se omite)`);
          return [];
        }
        return [{
          id: typeof raw.id === "string" && /^[a-z0-9-]{1,60}$/.test(raw.id) ? raw.id : `c-${i + 1}`,
          ...value,
          usesCount: Number.isInteger(raw.usesCount) && raw.usesCount >= 0 ? raw.usesCount : 0,
          createdAt: raw.createdAt || now,
          updatedAt: raw.updatedAt || now,
          createdBy: raw.createdBy || SYSTEM.name,
        }];
      });
      await this.db.set("coupons", list);
      log(`[datos] coupons.json creado (${list.length} cupón/es de fábrica).`);
    }

    if (!content.exists) {
      const first = !this.app.revisions.count;
      await this.app.revisions.add({ user: SYSTEM, summary: first ? INITIAL_SUMMARY : RESEED_SUMMARY, content: this.data, pinned: true });
      if (!first) log(`[datos] Historial: se agregó la revisión «${RESEED_SUMMARY}».`);
    } else if (!this.app.revisions.count) {
      await this.app.revisions.add({ user: SYSTEM, summary: BASELINE_SUMMARY, content: this.data });
    }
  }

  /* ---------- Contenido público (§4.1) ---------- */
  toPublic(content = this.data) {
    const { schemaVersion, meta, products, discountModal, ...rest } = content;
    const { couponCode, ...dm } = discountModal || {};
    const w = this.app.coupons.welcome(content);
    return {
      schemaVersion,
      meta: { updatedAt: meta?.updatedAt || null },
      ...rest,
      discountModal: { ...dm, welcome: w ? { label: couponLabel(w), type: w.type, value: w.value } : null },
      products: (products || []).filter((p) => p.status === "published").map(({ updatedBy, ...p }) => p),
      __source: "server",
    };
  }

  /**
   * Cuerpo público (JSON y JS) con ETag; caché por versión de contenido/cupones y fecha de Colombia.
   * gzJson()/gzJs(): versión comprimida, calculada UNA vez por versión (no en cada visita: gzipSync bloquea).
   */
  publicPayload() {
    const key = `${this.db.version("content")}|${this.db.version("coupons")}|${colombiaToday()}`;
    if (this._pub?.key === key) return this._pub;
    const json = JSON.stringify(this.toPublic()).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const js = `window.MercyContent = ${json};\n`;
    const p = { key, json, js, etagJson: etag(json), etagJs: etag(js) };
    p.gzJson = () => (p._gzJson ??= gzipSync(json));
    p.gzJs = () => (p._gzJs ??= gzipSync(js));
    this._pub = p;
    return p;
  }

  /** GET /api/admin/content: JSON completo (y su gzip) en caché por versión del contenido. */
  adminPayload() {
    const key = this.db.version("content");
    if (this._admin?.key === key) return this._admin;
    const json = JSON.stringify(this.data);
    const p = { key, json };
    p.gz = () => (p._gz ??= gzipSync(json));
    this._admin = p;
    return p;
  }

  /* ---------- Escritura (llamar SIEMPRE dentro de db.tx) ---------- */
  async _commit(next, user, { summary, sections = [], activity } = {}) {
    const now = nowIso();
    const by = user?.name || SYSTEM.name;
    const prevSections = this.data?.meta?.sections || {};
    const metaSections = { ...prevSections };
    for (const s of sections) metaSections[s] = { updatedAt: now, updatedBy: by };
    next.meta = { updatedAt: now, updatedBy: by, sections: metaSections };
    await this.db.set("content", next);
    await this.app.revisions.add({ user, summary, content: next });
    if (activity) await this.app.activity.log(user, activity.action, activity.entity, activity.entityId, activity.label || summary);
    return next;
  }

  /**
   * Comprueba que lo que se quita de una sección no esté en uso. Puede devolver cambios en cascada.
   * Renombre = en la MISMA posición de la lista el id cambió por uno nuevo (así edita el panel el id de un elemento):
   * el mensaje dice «cambiar el id» (no «eliminar») y, en las hormas, las filas de las guías de tallas pasan al id nuevo.
   */
  #checkRemovals(section, cur, nextList) {
    if (!["colors", "fits", "categories", "collections", "sizeCharts"].includes(section)) return {};
    const curList = cur[section] || [];
    const curIds = new Set(curList.map((x) => x.id));
    const keep = new Set(nextList.map((x) => x.id));
    const removed = curList.filter((x) => !keep.has(x.id));
    if (!removed.length) return {};
    const renamedTo = new Map();
    curList.forEach((x, i) => {
      const n = nextList[i];
      if (!keep.has(x.id) && n && n.id && !curIds.has(n.id)) renamedTo.set(x.id, n.id);
    });
    const usages = new Set();
    const products = new Map();
    const blocked = [];
    const counts = { products: new Set(), coupons: new Set(), categories: new Set() };
    let cascade = {};
    const blockedItems = [];
    for (const item of removed) {
      const before = usages.size;
      const useP = (p) => { usages.add(`products/${p.id}`); products.set(p.id, p.name); counts.products.add(p.id); };
      if (section === "colors") cur.products.filter((p) => p.colors.some((c) => c.color === item.id)).forEach(useP);
      if (section === "fits") cur.products.filter((p) => p.fits.includes(item.id)).forEach(useP);
      if (section === "collections") cur.products.filter((p) => p.collection === item.id).forEach(useP);
      if (section === "categories") {
        cur.products.filter((p) => p.category === item.id).forEach(useP);
        for (const c of this.app.coupons.list) {
          if (c.appliesTo === "categories" && c.categoryIds.includes(item.id)) { usages.add(`coupons/${c.code}`); counts.coupons.add(c.code); }
        }
      }
      if (section === "sizeCharts") {
        for (const cat of cur.categories) if (cat.sizeChart === item.id) { usages.add(`categories/${cat.id}`); counts.categories.add(cat.id); }
      }
      if (usages.size > before) { blocked.push(`«${item.name}»`); blockedItems.push(item); }
    }
    if (blocked.length) {
      const parts = [];
      if (counts.products.size) {
        const names = [...products.values()];
        parts.push(`${plural(counts.products.size, "producto", "productos")}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` y ${names.length - 3} más` : ""}`);
      }
      if (counts.coupons.size) parts.push(`${plural(counts.coupons.size, "cupón", "cupones")}: ${[...counts.coupons].join(", ")}`);
      if (counts.categories.size) parts.push(`${plural(counts.categories.size, "categoría", "categorías")}: ${[...counts.categories].join(", ")}`);
      const verb = blockedItems.every((it) => renamedTo.has(it.id)) ? "cambiar el id de" : "eliminar";
      throw err.inUse(`No puedes ${verb} ${joinNames(blocked)} porque ${blocked.length === 1 ? "está" : "están"} en uso (${parts.join(" · ")}).`, {
        usages: [...usages],
        products: [...products].map(([id, name]) => ({ id, name })),
      });
    }
    // Hormas: una eliminada deja de tener filas en las guías de tallas (cascada, sin bloquear); una RENOMBRADA
    // conserva sus filas con el id nuevo (antes el renombre las borraba en silencio).
    if (section === "fits") {
      const gone = new Set(removed.map((f) => f.id));
      const charts = cur.sizeCharts.map((sc) => {
        if (!Object.keys(sc.rows).some((k) => gone.has(k))) return sc;
        const rows = {};
        for (const [k, v] of Object.entries(sc.rows)) {
          if (!gone.has(k)) rows[k] = v;
          else if (renamedTo.has(k) && !Object.hasOwn(sc.rows, renamedTo.get(k))) rows[renamedTo.get(k)] = v;
        }
        return { ...sc, rows };
      });
      if (!deepEqual(charts, cur.sizeCharts)) cascade = { sizeCharts: charts };
    }
    return cascade;
  }

  /* ---------- Secciones ---------- */
  updateSection(section, value, user, { baseUpdatedAt } = {}) {
    if (!SECTIONS.includes(section)) return Promise.reject(err.notFound("Esa sección no existe."));
    if (section === "settings" && user.role !== "admin") return Promise.reject(err.forbidden("Solo un administrador puede cambiar los ajustes generales."));
    return this.db.tx(async () => {
      const cur = this.data;
      const curMeta = cur.meta?.sections?.[section];
      if (baseUpdatedAt && curMeta?.updatedAt && baseUpdatedAt !== curMeta.updatedAt) {
        throw err.conflict(`Otra persona guardó cambios en «${SECTION_NAMES[section]}» mientras editabas. Recarga para ver la versión actual (tus cambios no se guardaron).`, {
          current: { value: cur[section], meta: cur.meta },
        });
      }
      let input = value;
      if (section === "discountModal" && user.role !== "admin") {
        input = { ...(isPlainObject(value) ? value : {}), couponCode: cur.discountModal?.couponCode || "" };
      }
      const { value: v, fields } = validateSection(section, input, refsFrom(cur, this.app.coupons.list));
      if (hasErrors(fields)) throw err.validation(fields);
      const cascade = this.#checkRemovals(section, cur, v);
      if (deepEqual(v, cur[section])) return { section, value: cur[section], meta: cur.meta, changed: false };
      const next = { ...cur, [section]: v, ...cascade };
      const label = `Sección «${SECTION_NAMES[section]}» actualizada`;
      await this._commit(next, user, {
        summary: label,
        sections: [section, ...Object.keys(cascade)],
        activity: { action: "update", entity: "section", entityId: section, label },
      });
      return { section, value: next[section], meta: next.meta, changed: true };
    });
  }

  /** Lo usa CouponService al renombrar el cupón de bienvenida (ya dentro de una tx). */
  async setWelcomeCodeInTx(code, user) {
    const cur = this.data;
    const next = { ...cur, discountModal: { ...cur.discountModal, couponCode: code } };
    const label = `Sección «${SECTION_NAMES.discountModal}» actualizada (cupón de bienvenida: ${code})`;
    await this._commit(next, user, { summary: label, sections: ["discountModal"], activity: { action: "update", entity: "section", entityId: "discountModal", label } });
  }

  /* ---------- Productos ---------- */
  getProduct(id) { return this.data.products.find((p) => p.id === id) || null; }

  #validateProduct(body) {
    const { value, fields } = validateProduct(body, refsFrom(this.data));
    if (hasErrors(fields)) throw err.validation(fields);
    return value;
  }

  createProduct(body, user) {
    return this.db.tx(async () => {
      const cur = this.data;
      const v = withFormerIds(this.#validateProduct(body), []);   // un producto nuevo no tiene ids anteriores
      if (cur.products.some((p) => p.id === v.id)) {
        throw err.conflict(`Ya existe un producto con el id «${v.id}».`, { fields: { id: "Ya existe un producto con este id." } });
      }
      const now = nowIso();
      const item = { ...v, createdAt: now, updatedAt: now, updatedBy: user.name };
      const label = `Producto «${item.name}» creado`;
      await this._commit({ ...cur, products: [...cur.products, item] }, user, {
        summary: label, activity: { action: "create", entity: "product", entityId: item.id, label },
      });
      return item;
    });
  }

  updateProduct(id, body, user, { baseUpdatedAt } = {}) {
    return this.db.tx(async () => {
      const cur = this.data;
      const idx = cur.products.findIndex((p) => p.id === id);
      if (idx === -1) throw err.notFound("El producto no existe.");
      const old = cur.products[idx];
      if (baseUpdatedAt && baseUpdatedAt !== old.updatedAt) {
        throw err.conflict("Otra persona guardó cambios en este producto mientras lo editabas. Recarga para ver la versión actual (tus cambios no se guardaron).", { current: old });
      }
      const input = isPlainObject(body) ? { ...body, id: body.id === undefined || body.id === null || body.id === "" ? id : body.id } : body;
      let v = this.#validateProduct(input);
      const renamed = v.id !== id;
      if (renamed && cur.products.some((p) => p.id === v.id)) {
        throw err.conflict(`Ya existe un producto con el id «${v.id}».`, { fields: { id: "Ya existe un producto con este id." } });
      }
      // formerIds lo gestiona el servidor (se ignora el del cuerpo): se conservan y, al renombrar, se suma el id anterior
      v = withFormerIds(v, [...(old.formerIds || []), ...(renamed ? [id] : [])]);
      if (deepEqual(v, stripStamp(old))) return old;
      const item = { ...v, createdAt: old.createdAt || nowIso(), updatedAt: nowIso(), updatedBy: user.name };
      const products = cur.products.slice();
      products[idx] = item;
      const label = renamed ? `Producto «${item.name}» actualizado (id «${id}» → «${item.id}»)` : `Producto «${item.name}» actualizado`;
      await this._commit({ ...cur, products }, user, { summary: label, activity: { action: "update", entity: "product", entityId: item.id, label } });
      if (renamed) await this.app.coupons.remapProductRefsInTx(new Map([[id, item.id]]), user);
      return item;
    });
  }

  deleteProduct(id, user) {
    return this.db.tx(async () => {
      const cur = this.data;
      const old = cur.products.find((p) => p.id === id);
      if (!old) throw err.notFound("El producto no existe.");
      const label = `Producto «${old.name}» eliminado`;
      await this._commit({ ...cur, products: cur.products.filter((p) => p.id !== id) }, user, {
        summary: label, activity: { action: "delete", entity: "product", entityId: id, label },
      });
      // Se quita de los cupones «Productos»; el que se queda sin productos se desactiva (→ couponsDeactivated)
      const changed = await this.app.coupons.remapProductRefsInTx(new Map([[id, null]]), user, { names: new Map([[id, old.name]]) });
      const off = changed.filter((c) => c.deactivated).map((c) => c.code);
      return off.length ? { ok: true, couponsDeactivated: off } : { ok: true };
    });
  }

  duplicateProduct(id, user) {
    return this.db.tx(async () => {
      const cur = this.data;
      const idx = cur.products.findIndex((p) => p.id === id);
      if (idx === -1) throw err.notFound("El producto no existe.");
      const old = cur.products[idx];
      const taken = new Set(cur.products.map((p) => p.id));
      const base = `${old.id.slice(0, 50).replace(/-+$/, "")}-copia`;
      let newId = base;
      for (let n = 2; taken.has(newId); n++) newId = `${base}-${n}`;
      const now = nowIso();
      const name = `${old.name} (copia)`.slice(0, 120);
      const { formerIds, ...copy } = structuredClone(stripStamp(old));   // la copia es otro producto: sin ids anteriores
      const item = { ...copy, id: newId, name, status: "draft", createdAt: now, updatedAt: now, updatedBy: user.name };
      const products = cur.products.slice();
      products.splice(idx + 1, 0, item);
      const label = `Producto «${item.name}» creado (copia de «${old.name}»)`;
      await this._commit({ ...cur, products }, user, { summary: label, activity: { action: "create", entity: "product", entityId: item.id, label } });
      return item;
    });
  }

  /* ---------- Revisiones ---------- */
  /**
   * Restaura una instantánea. Los cupones NO forman parte de las revisiones, así que:
   * · discountModal.couponCode queda SIEMPRE el vigente (una instantánea vieja podría traer un código que ya no existe
   *   —pop-up apagado y modal imposible de guardar— o que ahora es de OTRO cupón);
   * · si la versión quitaría una categoría que usa un cupón → 409 in_use (igual que al borrarla en Categorías);
   * · los productos que desaparecen se quitan de los cupones (o se cambian por su id en la versión, si fue un renombre);
   *   un cupón «Productos» que se queda sin productos se desactiva.
   * → { content, coupons: [{ id, code, deactivated }], missingMedia: ["/uploads/…"] } (archivos que ya no existen).
   */
  restore(revisionId, user) {
    return this.db.tx(async () => {
      const rev = await this.app.revisions.get(revisionId);
      if (!rev || !isPlainObject(rev.content)) throw err.notFound("La revisión no existe.");
      const cur = this.data;
      const coupons = this.app.coupons.list;
      const dm0 = isPlainObject(rev.content.discountModal) ? rev.content.discountModal : {};
      const raw = { ...rev.content, discountModal: { ...dm0, couponCode: cur.discountModal?.couponCode || "" } };
      const norm = validateContent(raw, { couponCodes: new Set(coupons.map((c) => c.code)) });
      // Si la instantánea quedó fuera del esquema actual (p. ej. una regla nueva más estricta), se restaura tal cual.
      const snap = hasErrors(norm.fields) ? structuredClone(raw) : norm.value;
      const snapProducts = Array.isArray(snap.products) ? snap.products : [];

      // Categorías que quitaría la versión y que usa algún cupón → no se restaura
      const snapCats = new Set((Array.isArray(snap.categories) ? snap.categories : []).map((x) => x.id));
      const goneCats = (cur.categories || []).filter((x) => !snapCats.has(x.id));
      const blocked = coupons.filter((c) => c.appliesTo === "categories" && (c.categoryIds || []).some((id) => goneCats.some((g) => g.id === id)));
      if (blocked.length) {
        const cats = goneCats.filter((g) => blocked.some((c) => c.categoryIds.includes(g.id))).map((g) => `«${g.name}»`);
        const one = cats.length === 1;
        throw err.inUse(
          `No se puede restaurar esta versión: quitaría ${one ? "la categoría" : "las categorías"} ${joinNames(cats)}, que ${one ? "está" : "están"} en uso ` +
          `(${plural(blocked.length, "cupón", "cupones")}: ${blocked.map((c) => c.code).join(", ")}). Cambia o elimina ${blocked.length === 1 ? "ese cupón" : "esos cupones"} y vuelve a intentarlo.`,
          { usages: blocked.map((c) => `coupons/${c.code}`), products: [] },
        );
      }

      // Productos actuales que no están en la versión: ¿renombre (en cualquier sentido, por formerIds) o se van?
      const snapIds = new Set(snapProducts.map((p) => p.id));
      const curIds = new Set(cur.products.map((p) => p.id));
      const productChanges = new Map();   // id actual → id en la versión | null
      for (const p of cur.products) {
        if (snapIds.has(p.id)) continue;
        const fwd = snapProducts.find((x) => !curIds.has(x.id) && (x.formerIds || []).includes(p.id));
        const back = (p.formerIds || []).slice().reverse().find((f) => snapIds.has(f) && !curIds.has(f));
        productChanges.set(p.id, fwd?.id || back || null);
      }
      // El producto que vuelve a su id anterior conserva el actual como «anterior» (enlaces y carritos de ese tiempo)
      const extraFormer = new Map();
      for (const [from, to] of productChanges) if (to) extraFormer.set(to, [...(extraFormer.get(to) || []), from]);

      const now = nowIso();
      const changedSections = SECTIONS.filter((x) => !deepEqual(snap[x], cur[x]));
      const curById = new Map(cur.products.map((p) => [p.id, p]));
      const products = snapProducts.map((p0) => {
        const p = extraFormer.has(p0.id) ? withFormerIds(p0, [...(p0.formerIds || []), ...extraFormer.get(p0.id)]) : p0;
        const before = curById.get(p.id);
        const same = before && deepEqual(stripStamp(before), stripStamp(p));
        return same ? before : { ...p, createdAt: p.createdAt || now, updatedAt: now, updatedBy: user.name };
      });
      const next = { ...snap, products };
      const when = formatDateTimeEs(rev.at);
      const what = shortSummary(rev.summary);
      await this._commit(next, user, {
        summary: `Restaurado desde la revisión del ${when} («${what}»)`,
        sections: changedSections,
        activity: { action: "restore", entity: "revision", entityId: rev.id, label: `Contenido restaurado desde la revisión del ${when} («${what}»)` },
      });
      const names = new Map(cur.products.map((p) => [p.id, p.name]));
      const changed = await this.app.coupons.remapProductRefsInTx(productChanges, user, { names });
      return { content: next, coupons: changed, missingMedia: await this.app.media.missingUploads(next) };
    });
  }

  /* ---------- Escritorio ---------- */
  productStats() {
    const ps = this.data.products;
    let soldOut = 0;
    let lowStock = 0;
    for (const p of ps) {
      const total = productStock(p);
      if (p.soldOut || total === 0) soldOut++;
      else if (total <= LOW_STOCK) lowStock++;
    }
    return {
      total: ps.length,
      published: ps.filter((p) => p.status === "published").length,
      draft: ps.filter((p) => p.status !== "published").length,
      soldOut,
      lowStock,
    };
  }
}
