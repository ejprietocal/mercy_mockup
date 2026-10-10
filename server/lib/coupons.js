/* ==========================================================================
   Mercy Studio — server/lib/coupons.js
   Cupones (coupons.json): vigencia en hora de Colombia (fechas inclusivas, UTC-5),
   etiqueta pública ("15%" / "$20.000"), validar/redimir (atómico en la cola) y CRUD.
   El cupón de bienvenida es el que indica content.discountModal.couponCode.
   ========================================================================== */
import { err } from "./http.js";
import { refsFrom, validateCoupon } from "./validate.js";
import { colombiaToday, formatCOP, formatDateEs, newId, nowIso } from "./util.js";

export const REASONS = ["not_found", "inactive", "not_started", "expired", "exhausted"];

export function couponLabel(c) {
  return c.type === "percent" ? `${c.value}%` : formatCOP(c.value);
}

/** null = vigente; si no, la razón (not_found, inactive, not_started, expired, exhausted). */
export function couponStatus(c, today = colombiaToday()) {
  if (!c) return "not_found";
  if (!c.active) return "inactive";
  if (c.startsAt && today < c.startsAt) return "not_started";
  if (c.endsAt && today > c.endsAt) return "expired";
  if (c.maxUses != null && c.usesCount >= c.maxUses) return "exhausted";
  return null;
}

export function reasonMessage(reason, c) {
  switch (reason) {
    case "inactive": return "Este cupón no está activo.";
    case "not_started": return `Este cupón estará disponible desde el ${formatDateEs(c.startsAt)}.`;
    case "expired": return `Este cupón venció el ${formatDateEs(c.endsAt)}.`;
    case "exhausted": return "Este cupón ya alcanzó su límite de usos.";
    default: return "Este cupón no existe. Revisa que esté bien escrito.";
  }
}

/**
 * Lo que recibe la tienda (§3 "Cupón público"). Sin `description` (nota interna del equipo) ni datos
 * de gestión (vigencia, usos, autor): lo recibe cualquiera que valide un código.
 */
export function publicCoupon(c) {
  return {
    code: c.code,
    type: c.type,
    value: c.value,
    label: couponLabel(c),
    appliesTo: c.appliesTo,
    categoryIds: c.categoryIds,
    productIds: c.productIds,
    minSubtotal: c.minSubtotal,
  };
}

const normCode = (code) => (typeof code === "string" ? code.trim().toUpperCase() : "");

export class CouponService {
  constructor(app) {
    this.app = app;
    this.db = app.db;
  }

  get list() { return this.db.get("coupons"); }
  byId(id) { return this.list.find((c) => c.id === id) || null; }
  byCode(code) {
    const k = normCode(code);
    return k ? this.list.find((c) => c.code === k) || null : null;
  }

  /**
   * Cupón de bienvenida VIGENTE (o null): el de discountModal.couponCode, solo si el modal está activo
   * (`enabled: false` = no hay descuento de bienvenida: ni `welcome` público ni cupón al suscribirse).
   */
  welcome(content = this.app.content.data) {
    const dm = content?.discountModal;
    if (!dm || dm.enabled === false) return null;
    const c = this.byCode(dm.couponCode);
    return c && !couponStatus(c) ? c : null;
  }

  /** → { ok: true, coupon } | { ok: false, reason, message } */
  check(code) {
    const c = this.byCode(code);
    const reason = couponStatus(c);
    if (reason) return { ok: false, reason, message: reasonMessage(reason, c) };
    return { ok: true, coupon: publicCoupon(c) };
  }

  /** Igual que check y, si es válido, suma 1 a usesCount (dentro de la cola: nunca se pasa de maxUses). */
  redeem(code) {
    return this.db.tx(async () => {
      const r = this.check(code);
      if (!r.ok) return r;
      const c = this.byCode(code);
      c.usesCount = (c.usesCount || 0) + 1;
      await this.db.save("coupons");
      return { ok: true, coupon: publicCoupon(c) };
    });
  }

  stats() {
    const today = colombiaToday();
    return { total: this.list.length, active: this.list.filter((c) => !couponStatus(c, today)).length };
  }

  #validate(body) {
    const { value, fields } = validateCoupon(body, refsFrom(this.app.content.data));
    if (Object.keys(fields).length) throw err.validation(fields);
    return value;
  }

  create(body, user) {
    return this.db.tx(async () => {
      const v = this.#validate(body);
      if (this.byCode(v.code)) throw err.conflict(`Ya existe un cupón con el código «${v.code}».`, { fields: { code: "Ya existe un cupón con este código." } });
      const now = nowIso();
      const item = { id: newId("c-"), ...v, usesCount: 0, createdAt: now, updatedAt: now, createdBy: user.name };
      await this.db.set("coupons", [item, ...this.list]);
      await this.app.activity.log(user, "create", "coupon", item.id, `Cupón «${item.code}» creado`);
      return item;
    });
  }

  /**
   * usesCount lo maneja el servidor (se ignora en el cuerpo); `resetUses: true` lo vuelve a 0.
   * Si cambia el código del cupón de bienvenida, discountModal.couponCode se actualiza también.
   * Concurrencia: `baseUpdatedAt` (cabecera X-Base-Updated-At = item.updatedAt leído) distinto del actual → 409
   * `conflict` con `current` (otra persona lo cambió; p. ej. «Desactivar» desde un listado abierto hace rato).
   * Los canjes (usesCount) NO cambian updatedAt: no generan conflictos.
   */
  update(id, body, user, { baseUpdatedAt } = {}) {
    return this.db.tx(async () => {
      const old = this.byId(id);
      if (!old) throw err.notFound("El cupón no existe.");
      if (baseUpdatedAt && baseUpdatedAt !== old.updatedAt) {
        throw err.conflict(`Otra persona guardó cambios en el cupón «${old.code}» mientras lo editabas. Recarga para ver la versión actual (tus cambios no se guardaron).`, { current: old });
      }
      const v = this.#validate(body);
      const dup = this.byCode(v.code);
      if (dup && dup.id !== id) throw err.conflict(`Ya existe un cupón con el código «${v.code}».`, { fields: { code: "Ya existe un cupón con este código." } });
      const item = {
        id,
        ...v,
        usesCount: body && body.resetUses === true ? 0 : old.usesCount || 0,
        createdAt: old.createdAt,
        updatedAt: nowIso(),
        createdBy: old.createdBy,
      };
      await this.db.set("coupons", this.list.map((c) => (c.id === id ? item : c)));
      await this.app.activity.log(user, "update", "coupon", id, `Cupón «${item.code}» actualizado`);
      const content = this.app.content.data;
      if (old.code !== item.code && content.discountModal.couponCode === old.code) {
        await this.app.content.setWelcomeCodeInTx(item.code, user);
      }
      return item;
    });
  }

  remove(id, user) {
    return this.db.tx(async () => {
      const old = this.byId(id);
      if (!old) throw err.notFound("El cupón no existe.");
      if (this.app.content.data.discountModal.couponCode === old.code) {
        throw err.inUse(`«${old.code}» es el cupón de bienvenida del modal de descuento. Elige otro cupón en «Modal de descuento» antes de eliminarlo.`, {
          usages: ["discountModal.couponCode"],
        });
      }
      await this.db.set("coupons", this.list.filter((c) => c.id !== id));
      await this.app.activity.log(user, "delete", "coupon", id, `Cupón «${old.code}» eliminado`);
      return { ok: true };
    });
  }

  /**
   * Dentro de una tx de contenido: renombra o quita productos en las listas productIds.
   * `changes` = Map(idViejo → idNuevo | null). Un cupón «Productos» que queda SIN productos se desactiva
   * (si no, seguiría «vigente» sin aplicar nunca) y se registra en la actividad. Devuelve los cupones que cambiaron:
   * [{ id, code, deactivated }].
   */
  async remapProductRefsInTx(changes, user, { names = new Map() } = {}) {
    if (!changes.size) return [];
    const out = [];
    const now = nowIso();
    const next = this.list.map((c) => {
      if (!c.productIds?.some((p) => changes.has(p))) return c;
      const ids = [...new Set(c.productIds.map((p) => (changes.has(p) ? changes.get(p) : p)).filter(Boolean))];
      const deactivated = c.appliesTo === "products" && !ids.length && c.active;
      out.push({ id: c.id, code: c.code, deactivated, gone: c.productIds.filter((p) => changes.has(p) && !changes.get(p)) });
      return { ...c, productIds: ids, ...(deactivated ? { active: false } : {}), updatedAt: now };
    });
    if (!out.length) return [];
    await this.db.set("coupons", next);
    for (const r of out.filter((x) => x.deactivated)) {
      const gone = r.gone.map((p) => `«${names.get(p) || p}»`).join(", ");
      await this.app.activity.log(user, "update", "coupon", r.id, `Cupón «${r.code}» desactivado: se quedó sin productos (ya no existe ${gone})`);
    }
    return out.map(({ gone, ...r }) => r);
  }

  /** Conteo de cupones que usan cada categoría / producto (para que el panel bloquee ids en uso, también al editor). */
  usage() {
    const categories = {};
    const products = {};
    for (const c of this.list) {
      if (c.appliesTo === "categories") for (const id of c.categoryIds || []) categories[id] = (categories[id] || 0) + 1;
      if (c.appliesTo === "products") for (const id of c.productIds || []) products[id] = (products[id] || 0) + 1;
    }
    return { categories, products };
  }
}
