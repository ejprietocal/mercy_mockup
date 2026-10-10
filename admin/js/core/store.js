/* ==========================================================================
   Mercy Studio · Panel — core/store.js
   Caché del contenido del sitio (GET /api/admin/content) para todas las vistas.
   · content.load()                 → contenido completo (se reutiliza 60 s; { force: true } lo recarga)
   · content.section("home")        → COPIA editable de la sección (y recuerda su versión base)
   · content.saveSection("home", v) → PUT con X-Base-Updated-At (409 si otra persona guardó antes)
   · Productos: createProduct, updateProduct, deleteProduct, duplicateProduct (mantienen la caché al día)
   · content.invalidate() tras restaurar revisiones o cuando otra acción cambie el contenido.
   ========================================================================== */
import { api } from "./api.js";
import { clone } from "./format.js";

const MAX_AGE = 60 * 1000;
let data = null;
let loadedAt = 0;
let pending = null;
const bases = new Map();      // sección → updatedAt leído por el editor abierto
const listeners = new Set();

function emit(reason) {
  for (const fn of listeners) {
    try { fn(data, reason); } catch (e) { console.error(e); }
  }
}

const enc = encodeURIComponent;

export const content = {
  /** Contenido completo en caché (o null si aún no se cargó). NO lo modifiques: usa section()/clone(). */
  get data() { return data; },

  /** Carga el contenido (reutiliza la caché si tiene menos de `maxAge` ms). */
  async load({ force = false, maxAge = MAX_AGE } = {}) {
    if (!force && data && Date.now() - loadedAt < maxAge) return data;
    if (pending) return pending;
    pending = api.get("/api/admin/content")
      .then((d) => {
        data = d;
        loadedAt = Date.now();
        emit("load");
        return d;
      })
      .finally(() => { pending = null; });
    return pending;
  },

  /** Marca la caché como vieja (la próxima load() pide al servidor). */
  invalidate() {
    loadedAt = 0;
    bases.clear();
  },

  /** Avisa cada vez que cambia la caché: fn(data, motivo). Devuelve la función para dejar de escuchar. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** { updatedAt, updatedBy } de una sección (según la caché). */
  sectionMeta(name) {
    return data?.meta?.sections?.[name] || null;
  },

  /** Copia editable de una sección; recuerda su versión para detectar ediciones concurrentes al guardar. */
  async section(name, opts) {
    const d = await this.load(opts);
    bases.set(name, d.meta?.sections?.[name]?.updatedAt || null);
    return clone(d[name]);
  },

  /**
   * Guarda una sección completa. Devuelve el valor normalizado por el servidor (úsalo para form.reset()).
   * opts.force = true guarda aunque otra persona haya cambiado la sección (sobrescribe).
   */
  async saveSection(name, value, { force = false, base } = {}) {
    const b = base !== undefined ? base : bases.has(name) ? bases.get(name) : this.sectionMeta(name)?.updatedAt;
    const headers = !force && b ? { "X-Base-Updated-At": b } : {};
    const r = await api.put(`/api/admin/content/${enc(name)}`, value, { headers });
    const prevSections = data?.meta?.sections || {};
    if (data) {
      data = { ...data, [name]: r.value, meta: r.meta };
      // Cambios en cascada (p. ej. borrar una horma quita sus filas de la guía de tallas): recargar después
      const others = Object.keys(r.meta?.sections || {}).filter((s) => s !== name && r.meta.sections[s]?.updatedAt !== prevSections[s]?.updatedAt);
      if (others.length) loadedAt = 0;
    }
    bases.set(name, r.meta?.sections?.[name]?.updatedAt || null);
    emit("section:" + name);
    return clone(r.value);
  },

  /* ---------- Productos ---------- */
  /** Lista de productos (de la caché; incluye borradores). */
  async products(opts) {
    const d = await this.load(opts);
    return d.products;
  },

  /** Un producto fresco del servidor (GET /api/admin/products/:id) → copia editable. */
  async product(id) {
    const { item } = await api.get(`/api/admin/products/${enc(id)}`);
    replaceInCache(id, item);
    return clone(item);
  },

  /** POST /api/admin/products → item creado (201). */
  async createProduct(value) {
    const { item } = await api.post("/api/admin/products", value);
    if (data) data = { ...data, products: [...data.products, item] };
    emit("product:create");
    return clone(item);
  },

  /**
   * PUT /api/admin/products/:id. `id` es el id ACTUAL (si value.id es otro, el servidor lo renombra).
   * La versión base es value.updatedAt (la que se cargó en el editor) salvo { force: true }.
   */
  async updateProduct(id, value, { force = false, base } = {}) {
    const b = base !== undefined ? base : value?.updatedAt;
    const headers = !force && b ? { "X-Base-Updated-At": b } : {};
    const { item } = await api.put(`/api/admin/products/${enc(id)}`, value, { headers });
    replaceInCache(id, item);
    emit("product:update");
    return clone(item);
  },

  async deleteProduct(id) {
    await api.del(`/api/admin/products/${enc(id)}`);
    if (data) data = { ...data, products: data.products.filter((p) => p.id !== id) };
    emit("product:delete");
    return true;
  },

  /** POST /api/admin/products/:id/duplicate → copia en borrador. */
  async duplicateProduct(id) {
    const { item } = await api.post(`/api/admin/products/${enc(id)}/duplicate`);
    if (data) {
      const list = data.products.slice();
      const i = list.findIndex((p) => p.id === id);
      list.splice(i === -1 ? list.length : i + 1, 0, item);
      data = { ...data, products: list };
    }
    emit("product:create");
    return clone(item);
  },
};

function replaceInCache(oldId, item) {
  if (!data) return;
  const list = data.products.slice();
  const i = list.findIndex((p) => p.id === oldId);
  if (i === -1) list.push(item);
  else list[i] = item;
  data = { ...data, products: list };
}

/** Mapa id → elemento de una lista de la caché (colors, fits, categories, collections, sizeCharts…). */
export function byId(listName) {
  return new Map((data?.[listName] || []).map((x) => [x.id, x]));
}
