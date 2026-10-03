/* ==========================================================================
   Mercy Studio — store.js
   Estado global persistente (localStorage): carrito, favoritos y descuento.
   Eventos: "mercy:cart", "mercy:favs", "mercy:discount" (document).
   Reglas de negocio:
     · Envío (C34): si NINGÚN producto del carrito incluye envío => "ENVÍO NO INCLUIDO";
       si AL MENOS UNO lo incluye => "ENVÍO GRATIS".
     · Descuento: 15 % del primer pedido (código MERCY15) al registrar el correo.
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  const KEY = Mercy.config.storageKey;
  const data = Mercy.data;

  /* --- Persistencia segura ------------------------------------------------ */
  let memory = null;
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* modo privado / file:// restringido */ }
    return memory;
  }
  function write(state) {
    memory = state;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function fresh() {
    return { v: 1, cart: [], favs: [], discount: { email: "", claimedAt: 0, coupon: false }, giftNote: "" };
  }
  let state = Object.assign(fresh(), read() || {});
  state.discount = Object.assign(fresh().discount, state.discount || {});
  /* Limpia entradas de productos que ya no existen */
  state.cart = (state.cart || []).filter(function (l) { return data.byId(l.id); });
  state.favs = (state.favs || []).filter(function (id) { return data.byId(id); });

  function emit(name, detail) {
    write(state);
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  /* Sincroniza entre pestañas */
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = Object.assign(fresh(), JSON.parse(e.newValue));
      document.dispatchEvent(new CustomEvent("mercy:cart"));
      document.dispatchEvent(new CustomEvent("mercy:favs"));
      document.dispatchEvent(new CustomEvent("mercy:discount"));
    } catch (err) {}
  });

  /* --- Carrito ------------------------------------------------------------ */
  function lineKey(l) { return [l.id, l.color, l.fit || "", l.size, l.print || ""].join("|"); }

  const cart = {
    items: function () {
      return state.cart.map(function (l) {
        const p = data.byId(l.id);
        const stock = data.stockOf(p, l.color, l.size);
        return {
          key: l.key, product: p, id: p.id, color: data.color(l.color), colorId: l.color,
          fit: l.fit || "", fitName: l.fit ? data.FITS[l.fit] : "", size: l.size,
          print: l.print ? (p.prints || []).filter(function (x) { return x.id === l.print; })[0] || null : null,
          qty: l.qty, stock: stock, unitPrice: p.price, lineTotal: p.price * l.qty
        };
      });
    },
    count: function () { return state.cart.reduce(function (n, l) { return n + l.qty; }, 0); },
    subtotal: function () {
      return state.cart.reduce(function (n, l) { return n + data.byId(l.id).price * l.qty; }, 0);
    },
    /* add({ id, color, fit, size, print, qty }) -> { ok, reason?, capped?, item? } */
    add: function (sel) {
      const p = data.byId(sel.id);
      if (!p) return { ok: false, reason: "producto" };
      if (p.soldOut) return { ok: false, reason: "agotado" };
      const color = sel.color || p.colors[0];
      const size = sel.size;
      const fit = p.fits && p.fits.length ? (sel.fit || p.fits[0]) : "";
      const print = p.prints ? (sel.print || p.prints[0].id) : "";
      if (p.colors.indexOf(color) < 0) return { ok: false, reason: "color" };
      if (!size || p.sizes.indexOf(size) < 0) return { ok: false, reason: "talla" };
      const stock = data.stockOf(p, color, size);
      if (stock <= 0) return { ok: false, reason: "sin-stock" };
      const qty = Math.max(1, parseInt(sel.qty, 10) || 1);
      const key = lineKey({ id: p.id, color: color, fit: fit, size: size, print: print });
      let line = state.cart.filter(function (l) { return l.key === key; })[0];
      let capped = false;
      if (line) {
        const want = line.qty + qty;
        line.qty = Math.min(want, stock);
        capped = want > stock;
      } else {
        line = { key: key, id: p.id, color: color, fit: fit, size: size, print: print, qty: Math.min(qty, stock) };
        capped = qty > stock;
        state.cart.push(line);
      }
      emit("mercy:cart", { action: "add", key: key });
      return { ok: true, capped: capped, key: key };
    },
    setQty: function (key, qty) {
      const line = state.cart.filter(function (l) { return l.key === key; })[0];
      if (!line) return;
      const stock = data.stockOf(data.byId(line.id), line.color, line.size);
      line.qty = Math.max(1, Math.min(parseInt(qty, 10) || 1, stock || 1));
      emit("mercy:cart", { action: "qty", key: key });
    },
    remove: function (key) {
      state.cart = state.cart.filter(function (l) { return l.key !== key; });
      emit("mercy:cart", { action: "remove", key: key });
    },
    clear: function () { state.cart = []; emit("mercy:cart", { action: "clear" }); },

    /* C34 */
    shipping: function () {
      if (!state.cart.length) return { status: "none", label: "", note: "" };
      const anyFree = state.cart.some(function (l) { return data.byId(l.id).envioGratis; });
      return anyFree
        ? { status: "free", label: "ENVÍO GRATIS", short: "Gratis", note: "Tu pedido incluye envío gratis." }
        : { status: "not-included", label: "ENVÍO NO INCLUIDO", short: "No incluido", note: "El envío tiene un costo adicional que se coordina por WhatsApp." };
    },
    discountAmount: function () {
      if (!discount.couponApplied()) return 0;
      return Math.round(cart.subtotal() * Mercy.config.discount.percent / 100);
    },
    total: function () { return Math.max(0, cart.subtotal() - cart.discountAmount()); }
  };

  /* --- Favoritos ---------------------------------------------------------- */
  const favs = {
    has: function (id) { return state.favs.indexOf(id) > -1; },
    list: function () { return state.favs.map(data.byId).filter(Boolean); },
    count: function () { return state.favs.length; },
    toggle: function (id) {
      const i = state.favs.indexOf(id);
      if (i > -1) state.favs.splice(i, 1); else state.favs.push(id);
      emit("mercy:favs", { id: id, on: i < 0 });
      return i < 0;
    }
  };

  /* --- Descuento (15 % primer pedido) -------------------------------------- */
  const discount = {
    claimed: function () { return !!state.discount.claimedAt; },
    email: function () { return state.discount.email || ""; },
    code: function () { return Mercy.config.discount.code; },
    percent: function () { return Mercy.config.discount.percent; },
    couponApplied: function () { return !!state.discount.coupon; },
    /* Registra el correo (ya validado) y aplica el cupón automáticamente. */
    claim: function (email) {
      state.discount.email = String(email).trim();
      state.discount.claimedAt = state.discount.claimedAt || 1;
      state.discount.coupon = true;
      emit("mercy:discount", { action: "claim" });
      return discount.code();
    },
    /* Aplica un código escrito a mano. Devuelve true si es válido. */
    applyCoupon: function (code) {
      const ok = String(code || "").trim().toUpperCase() === Mercy.config.discount.code;
      if (ok) { state.discount.coupon = true; emit("mercy:discount", { action: "coupon" }); }
      return ok;
    },
    removeCoupon: function () { state.discount.coupon = false; emit("mercy:discount", { action: "remove" }); }
  };

  /* --- Sesión (solo pestaña actual) ---------------------------------------- */
  const session = {
    get: function (k) { try { return sessionStorage.getItem("mercy." + k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem("mercy." + k, v); } catch (e) {} }
  };

  Mercy.store = {
    cart: cart, favs: favs, discount: discount, session: session,
    reset: function () { state = fresh(); emit("mercy:cart"); emit("mercy:favs"); emit("mercy:discount"); }
  };
})();
