/* ==========================================================================
   Mercy Studio — store.js
   Estado global persistente (localStorage): carrito, favoritos y descuento.
   Eventos: "mercy:cart", "mercy:favs", "mercy:discount" (document).
   Reglas de negocio:
     · Envío (C34): si NINGÚN producto del carrito incluye envío => "ENVÍO NO INCLUIDO";
       si AL MENOS UNO lo incluye => "ENVÍO GRATIS".
     · Cupones (docs/ADMIN-CONTRATO.md §3): un cupón aplicado a la vez (cupón PÚBLICO
       { code, type, value, label, appliesTo, categoryIds, productIds, minSubtotal }).
       Subtotal elegible = líneas cuyo producto cumple appliesTo; si no llega a minSubtotal → 0;
       percent → round(elegible × valor / 100) · fixed → min(valor, elegible).
     · Con servidor (Mercy.api.enabled) la suscripción y los cupones van a la API pública (§4.1):
       POST api/public/subscribe · coupons/validate · coupons/redeem.
       Sin servidor (file:// / hosting estático) se validan contra Mercy.DEFAULT_COUPONS
       (misma vigencia en hora de Colombia; sin red y sin contar usos).
     · Al cargar: limpia líneas cuyo color/talla/horma ya no exista (el panel puede borrarlos),
       ajusta cantidades al stock y revalida el cupón aplicado (si ya no vale, se quita con aviso).
       Un PRODUCTO que la tienda no encuentra (en borrador un rato, o renombrado sin alias) no se borra:
       su línea / favorito queda guardado aparte (state.parked, hasta 30 días) y vuelve solo si reaparece.
       Un id anterior (producto renombrado, products[].formerIds) se cambia por el actual (Mercy.data.byId).
     · Usos del cupón (coupons/redeem): se cuentan al ENVIAR el pedido (abrir WhatsApp), no al confirmar.
   Estado del descuento: { email, claimedAt, coupon: CupónPúblico|null, claimedCoupon, claimedUsed, checkedAt }
     (claimedCoupon = cupón recibido al suscribirse, para volver a mostrar/copiar el código;
      claimedUsed = ya se envió un pedido con ese código, o ya no es válido: no se vuelve a ofrecer «Usar mi código»).
     Estado viejo del mockup ({ email, claimedAt, coupon: true|false }, sin claimedCoupon): sin servidor se
     migra al cupón de bienvenida de fábrica (DEFAULT_CONTENT); con servidor se descarta (ese correo nunca
     llegó al servidor: la persona puede suscribirse de nuevo y recibir el cupón real).
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  const KEY = Mercy.config.storageKey;
  const data = Mercy.data;
  const money = Mercy.ui.money;
  const API = !!(Mercy.api && Mercy.api.enabled);
  const DM = (Mercy.content && Mercy.content.discountModal) || {};
  const SOURCES = ["popup", "community", "checkout"];
  /* Cupón de bienvenida de fábrica (estado guardado viejo: coupon:true). Solo sin servidor: con servidor
     js/defaults.js llega sin cupones (couponCode "") y el estado viejo se descarta (normDiscount). */
  const DEFAULT_DM = (Mercy.DEFAULT_CONTENT && Mercy.DEFAULT_CONTENT.discountModal) || {};
  const LEGACY_CODE = API ? "" : normCode(DEFAULT_DM.couponCode);
  /* Con servidor, la revalidación al cargar se hace como mucho cada minuto (salvo en el checkout, siempre):
     respeta el límite público de 60 validaciones / 10 min por IP (§4). */
  const RECHECK_MS = 60 * 1000;
  /* Líneas / favoritos de productos que no se encuentran: se guardan aparte hasta 30 días (máx. 50) */
  const PARK_MS = 30 * 24 * 3600 * 1000;
  const PARK_MAX = 50;

  /* --- Mensajes (es-CO) ---------------------------------------------------- */
  const MSG = {
    empty: "Escribe tu código de descuento.",
    not_found: "Ese código no existe.",
    inactive: "Este código no está activo.",
    not_started: "Este código aún no está vigente.",
    expired: "Este código ya venció.",
    exhausted: "Este código ya alcanzó su límite de usos.",
    network: "No pudimos validar el código. Revisa tu conexión e inténtalo de nuevo.",
    rate_limited: "Hiciste muchos intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
    notEligible: "Este código no aplica a los productos de tu carrito.",
    subscribeNetwork: "No pudimos registrar tu correo. Revisa tu conexión e inténtalo de nuevo.",
    subscribeInvalid: "Ingresa un correo válido (ej. nombre@correo.com)."
  };
  const REASONS = ["not_found", "inactive", "not_started", "expired", "exhausted"];

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
  function freshDiscount() { return { email: "", claimedAt: 0, coupon: null, claimedCoupon: null, claimedUsed: false, checkedAt: 0 }; }
  function fresh() {
    return { v: 1, cart: [], favs: [], discount: freshDiscount(), giftNote: "", parked: { cart: [], favs: [] } };
  }

  /* ======================================================================
     Cupones
     ====================================================================== */
  function normCode(c) { return String(c == null ? "" : c).trim().toUpperCase(); }
  function couponLabel(c) { return c.type === "fixed" ? money(c.value) : Math.round(c.value * 100) / 100 + "%"; }

  /* Normaliza un cupón público (API, DEFAULT_COUPONS o estado guardado). null si no sirve. */
  function publicCoupon(c) {
    if (!c || typeof c !== "object") return null;
    const code = normCode(c.code);
    const type = c.type === "fixed" || c.type === "percent" ? c.type : "";
    let value = Number(c.value);
    if (!code || !type || !isFinite(value) || value <= 0) return null;
    value = type === "percent" ? Math.min(100, value) : Math.round(value);
    const ids = function (l) { return Array.isArray(l) ? l.map(String) : []; };
    const out = {
      code: code, type: type, value: value, label: "",
      appliesTo: c.appliesTo === "categories" || c.appliesTo === "products" ? c.appliesTo : "all",
      categoryIds: ids(c.categoryIds), productIds: ids(c.productIds),
      minSubtotal: Math.max(0, Math.round(Number(c.minSubtotal) || 0))
    };
    out.label = typeof c.label === "string" && c.label.trim() ? c.label.trim() : couponLabel(out);
    return out;
  }
  function sameCoupon(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* --- Modo demostración: Mercy.DEFAULT_COUPONS (fechas inclusivas, hora de Colombia UTC-5) --- */
  function todayCO() { return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
  function localStatus(c) {
    if (!c) return "not_found";
    if (!c.active) return "inactive";
    const today = todayCO();
    if (c.startsAt && String(c.startsAt).slice(0, 10) > today) return "not_started";
    if (c.endsAt && String(c.endsAt).slice(0, 10) < today) return "expired";
    if (c.maxUses != null && (Number(c.usesCount) || 0) >= Number(c.maxUses)) return "exhausted";
    return publicCoupon(c) ? "" : "not_found";
  }
  function localCheck(code) {
    const want = normCode(code);
    const c = (Mercy.DEFAULT_COUPONS || []).filter(function (x) { return x && normCode(x.code) === want; })[0];
    const reason = localStatus(c);
    return reason ? { ok: false, reason: reason, message: MSG[reason] } : { ok: true, coupon: publicCoupon(c) };
  }
  function localWelcome() {
    const r = DM.couponCode ? localCheck(DM.couponCode) : null;
    return r && r.ok ? r.coupon : null;
  }
  /* Cupón para el estado viejo coupon:true (modo demostración): el de fábrica si sigue vigente, si no ninguno */
  function legacyCoupon() {
    const r = LEGACY_CODE ? localCheck(LEGACY_CODE) : null;
    return r && r.ok ? r.coupon : null;
  }

  /* --- API pública (rutas relativas a la raíz del sitio, junto a api/public/content.js) --- */
  function apiUrl(path) {
    const s = document.querySelector('script[src*="api/public/content.js"]');
    try { return new URL(path, s && s.src ? s.src : new URL("api/public/content.js", document.baseURI).href).href; }
    catch (e) { return "api/public/" + path; }
  }
  /* POST JSON → { status, ok, json }. status 0 = sin red / tiempo agotado. Nunca rechaza.
     opts.keepalive: la petición sigue aunque la pestaña pase a segundo plano o se cierre (canje al abrir WhatsApp). */
  function post(path, body, opts) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : 0;
    let req;
    try {
      req = fetch(apiUrl(path), {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined,
        keepalive: !!(opts && opts.keepalive)
      });
    } catch (e) { req = Promise.reject(e); }
    return Promise.resolve(req)
      .then(function (res) {
        return Promise.resolve(res.json()).catch(function () { return null; })
          .then(function (json) { return { status: res.status, ok: !!res.ok, json: json }; });
      })
      .catch(function () { return { status: 0, ok: false, json: null }; })
      .then(function (r) { clearTimeout(timer); return r; });
  }
  function errMessage(json) { return json && json.error && json.error.message ? String(json.error.message) : ""; }

  /* Valida (o redime) un código → { ok:true, coupon } | { ok:false, reason, message, network? } */
  function check(code, endpoint, opts) {
    if (!API) return Promise.resolve(localCheck(code));
    return post("coupons/" + (endpoint || "validate"), { code: code }, opts).then(function (r) {
      const j = r.json;
      if (r.ok && j && j.ok === true) {
        const c = publicCoupon(j.coupon);
        if (c) return { ok: true, coupon: c };
      }
      if (r.ok && j && j.ok === false) {
        const known = REASONS.indexOf(j.reason) > -1;
        return { ok: false, reason: known ? j.reason : String(j.reason || "not_found"), message: known ? MSG[j.reason] : (j.message || MSG.not_found) };
      }
      if (r.status === 429) return { ok: false, reason: "rate_limited", network: true, message: MSG.rate_limited };
      return { ok: false, reason: "network", network: true, message: MSG.network };
    });
  }

  /* Estado del descuento guardado. El viejo (coupon:true|false sin claimedCoupon): sin servidor se migra al
     cupón de bienvenida de fábrica; con servidor se descarta (vuelve a poder suscribirse). */
  function normDiscount(d) {
    const out = freshDiscount();
    if (!d || typeof d !== "object") return out;
    const legacy = d.coupon === true || (d.claimedCoupon === undefined && !!Number(d.claimedAt));
    if (legacy && API) return out;
    out.email = typeof d.email === "string" ? d.email : "";
    out.claimedAt = Number(d.claimedAt) || 0;
    out.checkedAt = Number(d.checkedAt) || 0;
    out.coupon = d.coupon === true ? legacyCoupon() : publicCoupon(d.coupon);
    out.claimedUsed = d.claimedUsed === true;
    if (d.claimedCoupon !== undefined) out.claimedCoupon = publicCoupon(d.claimedCoupon);
    else if (out.claimedAt) out.claimedCoupon = d.coupon === true ? out.coupon : legacyCoupon();   // estado viejo: se mostró el de fábrica
    if (d.coupon === true) out.checkedAt = 0;                                                         // revalidar el migrado
    return out;
  }

  /* ======================================================================
     Carrito: saneamiento frente al contenido actual
     ====================================================================== */
  function lineKey(l) { return [l.id, l.color, l.fit || "", l.size, l.print || ""].join("|"); }

  /* → { lines, parked, removed, capped }: quita líneas imposibles (color/talla/horma/estampado ya no existen,
     agotado), ajusta cantidades al stock y une líneas que quedan iguales. Las de un producto que NO se encuentra
     (borrador, renombrado sin alias, borrado) van a `parked` (con la fecha en que se apartaron) y vuelven solas si el
     producto reaparece; pasan 30 días y se olvidan. `removed` cuenta solo las que se veían en el carrito. */
  function sanitizeCart(list, parkedIn) {
    const out = [], byKey = {}, parked = [], now = Date.now();
    let removed = 0, capped = 0;
    const entries = (Array.isArray(list) ? list : []).map(function (l) { return { line: l, at: 0 }; })
      .concat((Array.isArray(parkedIn) ? parkedIn : []).map(function (x) { return { line: x && x.line, at: Number(x && x.at) || now }; }));
    entries.forEach(function (e) {
      const l = e.line;
      const drop = function () { if (!e.at) removed++; };
      if (!l || typeof l !== "object") return drop();
      const p = data.byId(l.id);
      if (!p) {
        if (typeof l.id === "string" && l.id && now - (e.at || now) < PARK_MS) parked.push({ line: l, at: e.at || now });
        return drop();
      }
      if (p.soldOut || p.colors.indexOf(l.color) < 0 || p.sizes.indexOf(l.size) < 0) return drop();
      let fit = "";
      if (p.fits && p.fits.length) {
        if (!l.fit) fit = p.fits[0];                        // la prenda no tenía hormas y ahora sí: la primera (como cart.add)
        else if (p.fits.indexOf(l.fit) < 0) return drop();
        else fit = l.fit;
      }
      let print = "";
      if (p.prints) {
        if (l.print && !p.prints.some(function (x) { return x.id === l.print; })) return drop();
        print = l.print || p.prints[0].id;
      }
      const stock = data.stockOf(p, l.color, l.size);
      if (stock <= 0) return drop();
      const key = lineKey({ id: p.id, color: l.color, fit: fit, size: l.size, print: print });
      let qty = Math.max(1, parseInt(l.qty, 10) || 1);
      if (byKey[key]) qty += byKey[key].qty;
      if (qty > stock) { qty = stock; capped++; }
      if (byKey[key]) { byKey[key].qty = qty; return; }
      byKey[key] = { key: key, id: p.id, color: l.color, fit: fit, size: l.size, print: print, qty: qty };
      out.push(byKey[key]);
    });
    return { lines: out, parked: parked.slice(-PARK_MAX), removed: removed, capped: capped };
  }

  /* Favoritos: ids actuales (un id anterior se cambia por el actual); los que no se encuentran, aparte (como el carrito) */
  function sanitizeFavs(list, parkedIn) {
    const out = [], parked = [], now = Date.now();
    const entries = (Array.isArray(list) ? list : []).map(function (id) { return { id: id, at: 0 }; })
      .concat((Array.isArray(parkedIn) ? parkedIn : []).map(function (x) { return { id: x && x.id, at: Number(x && x.at) || now }; }));
    entries.forEach(function (e) {
      if (typeof e.id !== "string" || !e.id) return;
      const p = data.byId(e.id);
      if (p) { if (out.indexOf(p.id) < 0) out.push(p.id); return; }
      if (now - (e.at || now) < PARK_MS && !parked.some(function (x) { return x.id === e.id; })) parked.push({ id: e.id, at: e.at || now });
    });
    return { favs: out, parked: parked.slice(-PARK_MAX) };
  }

  function load(raw) {
    const s = Object.assign(fresh(), raw && typeof raw === "object" ? raw : {});
    s.discount = normDiscount(s.discount);
    const pk = s.parked && typeof s.parked === "object" ? s.parked : {};
    const clean = sanitizeCart(s.cart, pk.cart);
    const favs = sanitizeFavs(s.favs, pk.favs);
    s.cart = clean.lines;
    s.favs = favs.favs;
    s.parked = { cart: clean.parked, favs: favs.parked };
    return { state: s, removed: clean.removed, capped: clean.capped };
  }

  const rawState = read();
  const loaded = load(rawState);
  let state = loaded.state;
  /* Se guarda si cambió algo al sanear (líneas quitadas/apartadas, ids renombrados, cantidades) */
  if (rawState && JSON.stringify(state) !== JSON.stringify(rawState)) write(state);

  function emit(name, detail) {
    write(state);
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  /* Sincroniza entre pestañas */
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = load(JSON.parse(e.newValue)).state;
      document.dispatchEvent(new CustomEvent("mercy:cart"));
      document.dispatchEvent(new CustomEvent("mercy:favs"));
      document.dispatchEvent(new CustomEvent("mercy:discount"));
    } catch (err) {}
  });

  /* --- Carrito ------------------------------------------------------------ */
  function eligible(c, p) {
    if (!c || !p) return false;
    if (c.appliesTo === "categories") return c.categoryIds.indexOf(p.category) > -1;
    if (c.appliesTo === "products") return c.productIds.indexOf(p.id) > -1;
    return true;
  }

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
    /* Descuento del cupón aplicado sobre el carrito actual (contrato §3):
       { coupon, code, label, amount, eligibleSubtotal, minSubtotal, meetsMin, partial, message } */
    discountInfo: function () {
      const c = state.discount.coupon;
      const info = {
        coupon: c, code: c ? c.code : "", label: c ? c.label : "",
        amount: 0, eligibleSubtotal: 0, minSubtotal: c ? c.minSubtotal : 0, meetsMin: true, partial: false, message: ""
      };
      if (!c || !state.cart.length) return info;
      const lines = state.cart.filter(function (l) { return eligible(c, data.byId(l.id)); });
      const sub = lines.reduce(function (n, l) { return n + data.byId(l.id).price * l.qty; }, 0);
      info.eligibleSubtotal = sub;
      info.partial = lines.length > 0 && lines.length < state.cart.length;
      info.meetsMin = sub >= c.minSubtotal;
      if (!lines.length) { info.message = MSG.notEligible; return info; }
      if (!info.meetsMin) {
        info.missing = c.minSubtotal - sub;
        info.message = "Compra mínima de " + money(c.minSubtotal) + (c.appliesTo === "all" ? "" : " en productos participantes") + " para usar este código. Te faltan " + money(info.missing) + ".";
        return info;
      }
      info.amount = c.type === "percent" ? Math.round(sub * c.value / 100) : Math.min(c.value, sub);
      return info;
    },
    discountAmount: function () { return cart.discountInfo().amount; },
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

  /* --- Descuento: suscripción + cupones ---------------------------------------- */
  const discount = {
    claimed: function () { return !!state.discount.claimedAt; },
    email: function () { return state.discount.email || ""; },
    /* Cupón aplicado (público) o null */
    applied: function () { return state.discount.coupon || null; },
    couponApplied: function () { return !!state.discount.coupon; },
    code: function () { return state.discount.coupon ? state.discount.coupon.code : ""; },
    label: function () { return state.discount.coupon ? state.discount.coupon.label : ""; },
    /* Código recibido al suscribirse (para mostrarlo/copiarlo aunque luego se quite) */
    claimedCoupon: function () { return state.discount.claimedCoupon || null; },
    claimedCode: function () { return state.discount.claimedCoupon ? state.discount.claimedCoupon.code : ""; },
    /* ¿El código recibido al suscribirse es el que está aplicado ahora? (para no decir «ya está aplicado» si no lo está) */
    claimedApplied: function () {
      const c = state.discount.claimedCoupon;
      return !!c && !!state.discount.coupon && state.discount.coupon.code === c.code;
    },
    /* Código de bienvenida que la clienta ya recibió, NO está aplicado y no ha usado en un pedido enviado → para
       ofrecer «Usar mi código X» (en vez de «¿Aún no tienes código?», que ya no aplica). null si no hay. */
    pendingClaim: function () {
      const c = state.discount.claimedCoupon;
      if (!c || state.discount.claimedUsed || !Mercy.config.discountEnabled) return null;
      return state.discount.coupon && state.discount.coupon.code === c.code ? null : c;
    },
    /* Etiqueta del cupón de bienvenida vigente ("15%", "$20.000") o "" */
    welcomeLabel: function () { return DM.welcome && DM.welcome.label ? String(DM.welcome.label) : ""; },

    /* Registra el correo y aplica el cupón de bienvenida que devuelva el servidor (o el local).
       → Promise<{ ok, coupon, message, reason? }>. Con el modal apagado (o sin cupón vigente) suscribe sin cupón. */
    claim: function (email, source) {
      const mail = String(email == null ? "" : email).trim();
      const bad = Mercy.ui.validators.email(mail);
      if (bad) return Promise.resolve({ ok: false, reason: "validation", coupon: null, message: bad });
      const src = SOURCES.indexOf(source) > -1 ? source : "popup";
      function done(raw) {
        const c = Mercy.config.discountEnabled ? publicCoupon(raw) : null;
        state.discount.email = mail;
        state.discount.claimedAt = state.discount.claimedAt || Date.now();
        state.discount.claimedCoupon = c || state.discount.claimedCoupon || null;
        if (c) { state.discount.coupon = c; state.discount.checkedAt = Date.now(); }
        emit("mercy:discount", { action: "claim", source: src });
        return { ok: true, coupon: c, message: c ? "Tu código " + c.code + " quedó aplicado." : "¡Gracias por suscribirte!" };
      }
      if (!API) return Promise.resolve(done(localWelcome()));
      return post("subscribe", { email: mail, source: src }).then(function (r) {
        if (r.ok && r.json && r.json.ok) return done(r.json.coupon);
        if (r.status === 422 || r.status === 400) return { ok: false, reason: "validation", coupon: null, message: errMessage(r.json) || MSG.subscribeInvalid };
        if (r.status === 429) return { ok: false, reason: "rate_limited", coupon: null, message: MSG.rate_limited };
        return { ok: false, reason: "network", coupon: null, message: MSG.subscribeNetwork };
      });
    },

    /* Aplica un código escrito a mano → Promise<{ ok, coupon?, reason?, message }>.
       Un código válido queda aplicado aunque el carrito no llegue al mínimo (el mensaje lo explica). */
    applyCoupon: function (code) {
      const c = normCode(code);
      if (!c) return Promise.resolve({ ok: false, reason: "empty", message: MSG.empty });
      if (!/^[A-Z0-9_-]{3,30}$/.test(c)) return Promise.resolve({ ok: false, reason: "not_found", message: MSG.not_found });
      return check(c).then(function (r) {
        if (!r.ok) {
          /* El código de bienvenida recibido ya no vale (vencido, agotado, inactivo, no existe): no se vuelve a ofrecer */
          const mine = state.discount.claimedCoupon;
          if (!r.network && mine && mine.code === c && !state.discount.claimedUsed) {
            state.discount.claimedUsed = true;
            emit("mercy:discount", { action: "claim-invalid" });
          }
          return r;
        }
        state.discount.coupon = r.coupon;
        state.discount.checkedAt = Date.now();
        emit("mercy:discount", { action: "coupon" });
        const info = cart.discountInfo();
        return { ok: true, coupon: r.coupon, message: info.message || "Código aplicado: " + r.coupon.label + " de descuento." };
      });
    },
    removeCoupon: function () {
      if (!state.discount.coupon) return;
      state.discount.coupon = null;
      emit("mercy:discount", { action: "remove" });
    },

    /* Vuelve a validar el cupón aplicado. Si ya no vale se quita (→ { ok:false, removed:true, code, reason, message });
       sin red se conserva (→ { ok:false, network:true }). */
    revalidate: function () {
      const cur = state.discount.coupon;
      if (!cur) return Promise.resolve({ ok: true, coupon: null });
      return check(cur.code).then(function (r) { return settle(cur, r); });
    },

    /* Al ENVIAR el pedido (abrir WhatsApp): con servidor suma un uso (coupons/redeem, keepalive); sin servidor solo valida.
       Misma respuesta que revalidate (si ya no vale, se quita). Si es el código recibido al suscribirse, queda
       marcado como usado (no se vuelve a ofrecer «Usar mi código»). */
    redeem: function () {
      const cur = state.discount.coupon;
      if (!cur) return Promise.resolve({ ok: true, coupon: null });
      if (state.discount.claimedCoupon && state.discount.claimedCoupon.code === cur.code && !state.discount.claimedUsed) {
        state.discount.claimedUsed = true;
        write(state);
      }
      return check(cur.code, "redeem", { keepalive: true }).then(function (r) { return settle(cur, r); });
    }
  };

  /* Aplica el resultado de validar/redimir `cur` al estado */
  function settle(cur, r) {
    if (state.discount.coupon !== cur) return r;              // cambió mientras tanto: no se toca
    state.discount.checkedAt = Date.now();
    if (r.ok) {
      state.discount.coupon = r.coupon;
      if (sameCoupon(cur, r.coupon)) write(state); else emit("mercy:discount", { action: "refresh" });
      return r;
    }
    if (r.network) { write(state); return r; }
    state.discount.coupon = null;
    emit("mercy:discount", { action: "invalid", reason: r.reason, code: cur.code });
    return { ok: false, removed: true, code: cur.code, reason: r.reason, message: r.message };
  }

  /* --- Sesión (solo pestaña actual) ---------------------------------------- */
  const session = {
    get: function (k) { try { return sessionStorage.getItem("mercy." + k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem("mercy." + k, v); } catch (e) {} }
  };

  Mercy.store = {
    cart: cart, favs: favs, discount: discount, session: session,
    reset: function () { state = fresh(); emit("mercy:cart"); emit("mercy:favs"); emit("mercy:discount"); }
  };

  /* --- Al terminar de cargar la página (ya hay header, carrito y toasts) ------------------
     Avisa si el carrito cambió por el contenido y revalida UNA vez el cupón aplicado. */
  let readyDone = false;
  function onReady() {
    if (readyDone) return;
    readyDone = true;
    const U = Mercy.ui;
    if (loaded.removed) U.toast("Actualizamos tu carrito: algunas prendas ya no están disponibles.", { icon: "info", ms: 4200 });
    else if (loaded.capped) U.toast("Ajustamos las cantidades de tu carrito al stock disponible.", { icon: "info", ms: 4200 });
    if (!state.discount.coupon) return;
    const atCheckout = /(^|\/)checkout\.html$/.test(location.pathname);
    if (API && !atCheckout && Date.now() - (state.discount.checkedAt || 0) < RECHECK_MS) return;
    discount.revalidate().then(function (r) {
      if (r && r.removed) U.toast("Quitamos el código " + r.code + ": " + r.message, { icon: "info", ms: 5000 });
    });
  }
  /* Los scripts defer corren con readyState "interactive", ANTES de DOMContentLoaded (que espera a layout.js
     y al script de la página). "load" es el respaldo si este archivo se cargara después. */
  if (document.readyState === "complete") setTimeout(onReady, 0);
  else {
    document.addEventListener("DOMContentLoaded", onReady);
    window.addEventListener("load", onReady);
  }
})();
