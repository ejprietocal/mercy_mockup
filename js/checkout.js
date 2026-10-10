/* ==========================================================================
   Mercy Studio — checkout.js
   Pantalla "Finalizar compra":
     · Carrito editable (móvil) y resumen (escritorio)         · C44 / TRUE
     · Contacto + dirección (Departamento → Ciudad)            · C30
     · Validación obligatoria: no deja avanzar                 · C31
     · Envío único (domicilio), estado según carrito           · C32 C33 C34 C46
     · ¿Es un regalo? con mensaje y límite de caracteres       · C45
     · Pago por transferencia con logo del banco               · C35
     · Código de descuento (cupones del panel: %, fijo, por categoría/producto, compra mínima) · P22 / C29
     · Confirmar: con cupón se vuelve a VALIDAR (no suma usos); si ya no vale se quita y NO se continúa.
       Luego mensaje de WhatsApp + modal de vista previa. El uso del cupón se cuenta al ENVIAR («Abrir WhatsApp»):
       cerrar la vista previa o confirmar en otra pestaña no gasta usos.
   ========================================================================== */
(function () {
  "use strict";

  const M = window.Mercy;
  const U = M.ui, S = M.store, D = M.data, C = M.config, I = M.icons.svg, V = U.validators;
  const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;
  const STORE_KEY = "checkout";
  const tx = U.tx;

  /* --- Elementos ---------------------------------------------------------- */
  const form = $("#co-form");
  const layoutEl = $("[data-co-layout]");
  const introEl = $("[data-co-intro]");
  const reqNote = $("[data-co-reqnote]");
  const emptyEl = $("[data-co-empty]");
  const successEl = $("[data-co-success]");
  const alertEl = $("#co-alert");
  const alertList = $("[data-co-alert-list]");
  const confirmErr = $("[data-co-confirm-err]");
  const statusEl = $("[data-co-status]");
  const cartLinesEl = $("[data-co-cart-lines]");
  const sumLinesEl = $("[data-co-lines]");
  const couponEl = $("[data-co-coupon]");
  const totalsEl = $("[data-co-totals]");
  const shipEl = $("[data-co-ship]");
  const payEl = $("[data-co-pay]");
  const dept = $("#co-dept"), city = $("#co-city");
  const giftSwitch = $("#gift-switch"), giftPanel = $("#gift-panel"), giftMsg = $("#gift-msg");
  const giftCount = $("[data-gift-count]"), giftLive = $("[data-gift-live]");

  let sent = false;          /* el usuario ya abrió WhatsApp con su pedido */
  let couponBusy = false;    /* validando un código */
  let confirming = false;    /* validando el cupón al confirmar */
  const confirmBtn = $("#co-confirm");
  const CONFIRM_ERR_TEXT = confirmErr.textContent;
  let modal = null;
  let lastMessage = "";
  let refocus = null;        /* {key, step} para devolver el foco tras repintar el carrito */

  const reducedMotion = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  /* --- Validación ------------------------------------------------------------ */
  function req(msg, min) {
    return function (v) {
      v = String(v || "").trim();
      if (!v) return msg;
      return min && v.length < min ? msg : "";
    };
  }
  const FIELDS = [
    { id: "co-name", key: "name", label: "Nombre completo", validate: V.name },
    { id: "co-cedula", key: "cedula", label: "Cédula (CC)", validate: V.cedula },
    { id: "co-phone", key: "phone", label: "Celular", validate: V.phone },
    { id: "co-dept", key: "dept", label: "Departamento", validate: req("Selecciona tu departamento.") },
    { id: "co-city", key: "city", label: "Ciudad", validate: function (v) {
        if (city.disabled) return "Primero elige tu departamento.";
        return req("Selecciona tu ciudad.")(v);
      } },
    { id: "co-address", key: "address", label: "Dirección", validate: req("Escribe tu dirección completa (ej. Calle 45 # 12-30).", 5) },
    { id: "co-building", key: "building", label: "Unidad / Edificio", optional: true },
    { id: "co-apt", key: "apt", label: "Apto / Casa", optional: true },
    { id: "co-barrio", key: "barrio", label: "Barrio", validate: req("Escribe el nombre de tu barrio.", 2) }
  ];
  FIELDS.forEach(function (f) { f.el = $("#" + f.id); });
  const REQUIRED = FIELDS.filter(function (f) { return !f.optional; });

  function currentPay() {
    const r = $('input[name="pago"]:checked', payEl);
    return r ? r.value : "";
  }
  function payValidate() { return currentPay() ? "" : "Elige un método de pago para continuar."; }

  /* Envuelve U.setError y conecta el mensaje con aria-describedby */
  function setErr(el, msg) {
    U.setError(el, msg);
    const field = el.closest(".field") || el.parentElement;
    const p = field.querySelector(".field__error");
    if (p) {
      if (!p.id) p.id = (el.id || "co") + "-err";
      if (msg) el.setAttribute("aria-describedby", p.id); else el.removeAttribute("aria-describedby");
    }
    if (!alertEl.hidden) refreshAlert();
    return !msg;
  }
  function validateField(f) { return setErr(f.el, f.validate(f.el.value)); }
  function validatePay() { return setErr(payEl, payValidate()); }

  /* Aviso resumen accesible */
  function refreshAlert() {
    const bad = REQUIRED.filter(function (f) { return f.el.getAttribute("aria-invalid") === "true"; })
      .map(function (f) { return { id: f.id, label: f.label }; });
    if (payEl.getAttribute("aria-invalid") === "true") bad.push({ id: "co-pay", label: "Método de pago" });
    if (!bad.length) { alertEl.hidden = true; confirmErr.hidden = true; alertList.innerHTML = ""; return; }
    alertList.innerHTML = bad.map(function (b) { return '<li><a href="#' + b.id + '" data-co-goto="' + b.id + '">' + esc(b.label) + "</a></li>"; }).join("");
  }
  function focusField(id) {
    const el = id === "co-pay" ? ($('input[name="pago"]', payEl)) : $("#" + id);
    if (!el) return;
    try { el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); } catch (e) {}
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }

  /* --- Persistencia en sesión (se limpia al confirmar) ---------------------------- */
  function readSaved() {
    try { return JSON.parse(S.session.get(STORE_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  let giftOn = false;
  function save() {
    if (sent) return;
    const o = {};
    FIELDS.forEach(function (f) { o[f.key] = f.el.value; });
    o.gift = giftOn; o.giftMsg = giftMsg.value; o.pay = currentPay();
    S.session.set(STORE_KEY, JSON.stringify(o));
  }
  function clearSaved() { S.session.set(STORE_KEY, ""); }

  /* --- Departamento → Ciudad (C30) ---------------------------------------------------- */
  function fillDepartments() {
    const names = Object.keys(D.DEPARTMENTS).sort(function (a, b) { return a.localeCompare(b, "es"); });
    dept.innerHTML = '<option value="">Selecciona tu departamento</option>' +
      names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
  }
  function fillCities(dep, selected) {
    const list = dep && D.DEPARTMENTS[dep] ? D.DEPARTMENTS[dep].slice().sort(function (a, b) { return a.localeCompare(b, "es"); }) : [];
    city.disabled = !list.length;
    city.innerHTML = '<option value="">' + (list.length ? "Selecciona tu ciudad" : "Primero el departamento") + "</option>" +
      list.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
    city.value = selected && list.indexOf(selected) > -1 ? selected : "";
    if (!list.length) setErr(city, "");
  }

  /* --- Pago (C35) --------------------------------------------------------------------------- */
  function renderPayments() {
    payEl.innerHTML = D.PAYMENT_METHODS.map(function (m) {
      return (
        '<label class="pay-row">' +
        '<input type="radio" name="pago" value="' + esc(m.id) + '">' +
        '<span class="pay-row__txt"><strong>' + esc(m.name) + "</strong><small>" + esc(m.hint) + "</small></span>" +
        '<span class="pay-row__logo" aria-hidden="true">' + M.icons.bank(m.logo || m.id) + "</span></label>"
      );
    }).join("");
    syncPayRows();
  }
  function syncPayRows() {
    $$(".pay-row", payEl).forEach(function (row) {
      row.classList.toggle("is-on", $("input", row).checked);
    });
  }

  /* --- Carrito / resumen ----------------------------------------------------------------------- */
  function variantText(it) {
    return [it.color.name, it.fitName, it.size === "Única" ? "" : "Talla " + it.size, it.print ? "Estampado " + it.print.name : ""]
      .filter(Boolean).join(" · ");
  }
  function pUrl(p) { return "producto.html?id=" + encodeURIComponent(p.id); }

  function renderCartLines() {
    const items = S.cart.items();
    $("[data-co-count]").textContent = S.cart.count();
    cartLinesEl.innerHTML = items.map(function (it) {
      const p = it.product;
      return (
        '<li class="co-line" data-key="' + esc(it.key) + '">' +
        '<a class="co-line__thumb" href="' + pUrl(p) + '" tabindex="-1" aria-hidden="true">' + U.tileHTML(p, { size: "thumb", alt: "", color: it.colorId }) + "</a>" +
        '<div class="co-line__info">' +
        '<p class="co-line__name"><a href="' + pUrl(p) + '">' + esc(p.name) + "</a></p>" +
        '<p class="co-line__variant">' + esc(variantText(it)) + "</p>" +
        '<div class="co-line__row">' + U.stepperHTML(it.qty) + '<span class="co-line__price">' + money(it.lineTotal) + "</span></div></div>" +
        '<button type="button" class="icon-btn icon-btn--sm co-line__remove" data-co-remove aria-label="Quitar ' + esc(p.name) + ' del carrito">' + I("trash", { size: 18 }) + "</button></li>"
      );
    }).join("");
    if (refocus) {
      const row = $('.co-line[data-key="' + (window.CSS && CSS.escape ? CSS.escape(refocus.key) : refocus.key) + '"]', cartLinesEl);
      const btn = row && (refocus.step ? $('[data-step="' + refocus.step + '"]', row) : null);
      if (btn) btn.focus({ preventScroll: true });
      refocus = null;
    }
  }

  function renderSumLines() {
    sumLinesEl.innerHTML = S.cart.items().map(function (it) {
      const p = it.product;
      return (
        '<li class="sum-line"><div class="sum-line__thumb">' + U.tileHTML(p, { size: "thumb", alt: "", color: it.colorId }) + "</div>" +
        '<div class="sum-line__info"><p class="sum-line__name">' + esc(p.name) + "</p>" +
        '<p class="sum-line__variant">' + esc(variantText(it)) + "</p>" +
        '<p class="sum-line__qty">Cantidad: ' + it.qty + "</p></div>" +
        '<span class="sum-line__price">' + money(it.lineTotal) + "</span></li>"
      );
    }).join("");
  }

  /* Envío según el carrito (C32 C34) */
  function renderShipping() {
    const sh = S.cart.shipping();
    if (sh.status === "free") {
      shipEl.innerHTML = '<div class="ship-status ship-status--free"><span class="ship-status__label">' + I("truck", { size: 18 }) + esc(tx("shipping.checkoutFree", "ENVÍO GRATIS")) + "</span></div>";
    } else if (sh.status === "not-included") {
      shipEl.innerHTML = '<div class="ship-status ship-status--not"><span class="ship-status__label">' + I("truck", { size: 18 }) +
        esc(tx("shipping.checkoutPaid", "ENVÍO NO INCLUIDO")) + '</span><span class="ship-status__note">' + esc(tx("shipping.checkoutPaidNote", "Tiene un costo adicional que se coordina por WhatsApp")) + "</span></div>";
    } else {
      shipEl.innerHTML = "";
    }
  }

  /* "Descuento (CÓDIGO · 15%)" o "(CÓDIGO · $20.000)"; sin descuento efectivo (mínimo no alcanzado / sin productos
     participantes) solo "Descuento (CÓDIGO)": no promete un valor que no se aplica */
  function discLabel(info) { return "Descuento (" + info.code + (info.amount ? " · " + info.label : "") + ")"; }

  function renderTotals() {
    const sh = S.cart.shipping();
    const info = S.cart.discountInfo();
    const notIncluded = sh.status === "not-included";
    totalsEl.innerHTML =
      "<div><dt>Subtotal</dt><dd>" + money(S.cart.subtotal()) + "</dd></div>" +
      (info.coupon
        ? '<div class="is-disc' + (info.amount ? "" : " is-zero") + '" data-co-disc><dt>' + esc(discLabel(info)) + "</dt><dd>" + (info.amount ? "−" + money(info.amount) : money(0)) + "</dd></div>"
        : "") +
      "<div><dt>Envío</dt><dd" + (sh.status === "free" ? ' class="is-ship-free"' : "") + ">" + (sh.status === "free" ? "Gratis" : "No incluido") + "</dd></div>" +
      '<div class="is-total"><dt>Total</dt><dd>' + money(S.cart.total()) + (notIncluded ? "<small>" + esc(tx("shipping.pending", "+ envío por coordinar")) + "</small>" : "") + "</dd></div>";
  }

  /* Código de descuento: aplicado (con aviso si no llega al mínimo / no aplica) o campo para escribirlo.
     Debajo del campo: "¿Aún no tienes código?" (abre el pop-up) solo si la clienta NO se ha suscrito, con el modal de
     descuento activo y un cupón de bienvenida vigente; si ya se suscribió y su código no está aplicado (lo cambió por
     otro o lo quitó), "Usar mi código X" (lo aplica de verdad); si ya lo usó en un pedido, nada. */
  function renderCoupon() {
    const info = S.cart.discountInfo();
    if (info.coupon) {
      const c = info.coupon;
      /* Sin descuento efectivo (mínimo no alcanzado / sin productos participantes) la caja va en neutro y no promete el valor */
      couponEl.innerHTML =
        '<p class="coupon__applied' + (info.amount ? "" : " is-pending") + '">' + I("tag", { size: 18 }) +
        "<span><strong>" + esc(c.code) + "</strong> " + (info.amount ? "aplicado · " + esc(c.label) + " de descuento" : "agregado · aún sin descuento") + "</span>" +
        '<button type="button" class="co-link" data-coupon-remove aria-label="Quitar código de descuento">Quitar</button></p>' +
        (info.message
          ? '<p class="coupon__note" data-coupon-note>' + I("info", { size: 16 }) + "<span>" + esc(info.message) + "</span></p>"
          : info.partial ? '<p class="coupon__note coupon__note--soft" data-coupon-note>Aplica solo a los productos participantes.</p>' : "");
      couponEl.classList.remove("has-error");
      return;
    }
    /* Conserva lo escrito (y el estado de espera) si se repinta mientras tanto */
    const prev = $("#co-coupon", couponEl);
    const typed = prev ? prev.value : "";
    const mine = S.discount.pendingClaim();
    const ask = mine
      ? '<button type="button" class="co-link coupon__ask" data-claimed-apply>Usar mi código ' + esc(mine.code) + " (" + esc(mine.label) + " de descuento)</button>"
      : !S.discount.claimed() && C.discountEnabled && S.discount.welcomeLabel()
        ? '<button type="button" class="co-link coupon__ask" data-discount-open>' + esc(U.fill(tx("checkout.noCodeCta", "¿Aún no tienes código? Obtén {descuento} de descuento"))) + "</button>"
        : "";
    couponEl.innerHTML =
      '<label class="visually-hidden" for="co-coupon">Código de descuento</label>' +
      '<div class="coupon__row"><input class="input" id="co-coupon" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="Código de descuento">' +
      '<button type="button" class="btn btn--dark" data-coupon-apply>Aplicar</button></div>' + ask;
    const inp = $("#co-coupon", couponEl);
    inp.value = typed;
    if (couponBusy) setCouponBusy(true);
  }
  function setCouponBusy(on) {
    const inp = $("#co-coupon", couponEl), btn = $("[data-coupon-apply]", couponEl);
    if (on) couponEl.setAttribute("aria-busy", "true"); else couponEl.removeAttribute("aria-busy");
    if (inp) inp.readOnly = on;
    if (btn) { btn.disabled = on; btn.textContent = on ? "Aplicando…" : "Aplicar"; }
  }
  function applyCoupon(given) {
    const input = $("#co-coupon");
    if (!input || couponBusy) return;
    const code = given || input.value.trim();
    if (!code) { setErr(input, "Escribe tu código de descuento."); input.focus(); return; }
    couponBusy = true;
    setCouponBusy(true);
    statusEl.textContent = "Validando el código…";
    S.discount.applyCoupon(code).then(function (r) {
      couponBusy = false;
      setCouponBusy(false);
      if (r.ok) {
        const info = S.cart.discountInfo();
        const msg = info.amount
          ? "Código " + r.coupon.code + " aplicado: " + r.coupon.label + " de descuento."
          : "Código " + r.coupon.code + " aplicado. " + info.message;
        statusEl.textContent = msg;
        U.toast(info.amount ? "¡Código aplicado! " + r.coupon.label + " de descuento" : info.message, { icon: info.amount ? "check" : "info", ms: info.amount ? 2600 : 4200 });
        const rm = $("[data-coupon-remove]", couponEl); if (rm) rm.focus({ preventScroll: true });
        return;
      }
      const inp = $("#co-coupon");
      if (inp) { setErr(inp, r.message); inp.focus(); }
      statusEl.textContent = r.message;
    });
  }

  /* Vista según el carrito: vacío / formulario / éxito */
  function refreshView() {
    if (sent) return;
    const empty = S.cart.count() === 0;
    layoutEl.hidden = empty;
    emptyEl.hidden = !empty;
    reqNote.hidden = empty;
  }

  function renderAll() {
    renderCartLines(); renderSumLines(); renderShipping(); renderTotals(); renderCoupon(); refreshView();
  }

  /* --- Mensaje de WhatsApp (paso 8) -------------------------------------------------------------- */
  function groupPhone(v) {
    const d = String(v || "").replace(/\D/g, "");
    return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3") : d;
  }
  function buildMessage() {
    const items = S.cart.items();
    const sh = S.cart.shipping();
    const info = S.cart.discountInfo();
    const val = function (f) { return f.el.value.trim(); };
    const F = {}; FIELDS.forEach(function (f) { F[f.key] = val(f); });
    const pay = D.PAYMENT_METHODS.filter(function (m) { return m.id === currentPay(); })[0];
    const L = [];
    L.push(U.waGreeting(U.fill(tx("checkout.waIntro", ", quiero confirmar mi pedido:"))), "", "*MI PEDIDO*");
    items.forEach(function (it, i) {
      L.push((i + 1) + ". " + it.product.name + " — " + variantText(it) + " — x" + it.qty + " — " + money(it.lineTotal));
    });
    L.push("", "Subtotal: " + money(S.cart.subtotal()));
    if (info.amount) L.push(discLabel(info) + ": −" + money(info.amount));
    L.push("Envío: " + (sh.status === "free" ? "GRATIS" : "NO INCLUIDO (costo adicional, se coordina por WhatsApp)"));
    L.push("*TOTAL: " + money(S.cart.total()) + "*" + (sh.status === "free" ? "" : " + envío por coordinar"));
    L.push("", "*DATOS DEL CLIENTE*", "Nombre: " + F.name, "Cédula: " + F.cedula.replace(/\D/g, ""), "Celular: " + groupPhone(F.phone));
    const addr = [F.address, F.building, F.apt].filter(Boolean).join(", ");
    L.push("", "*DIRECCIÓN DE ENTREGA*", addr, "Barrio: " + F.barrio, F.city + ", " + F.dept, tx("shipping.method", "Envío a domicilio") + " (" + tx("shipping.time", "2–4 días hábiles") + ")");
    if (giftOn) {
      L.push("", "*REGALO*: Sí");
      L.push(giftMsg.value.trim() ? "Mensaje: “" + giftMsg.value.trim() + "”" : "Sin mensaje personalizado");
    }
    L.push("", "*MÉTODO DE PAGO*: " + (pay ? pay.name + " (transferencia)" : ""), "", U.fill(tx("checkout.waClosing", "¡Gracias! Quedo atento(a) para coordinar el pago y el envío.")));
    return L.join("\n");
  }

  /* --- Modal de confirmación -------------------------------------------------------------------------- */
  function copyText(text) {
    const done = function () { U.toast("Mensaje copiado", { icon: "check" }); };
    const fallback = function () {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { U.toast("No se pudo copiar. Selecciona el texto y cópialo.", { icon: "info" }); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function openModal(message) {
    lastMessage = message;
    if (!modal) {
      modal = U.createModal({
        id: "co-modal", cls: "modal--order", label: "Tu pedido está listo",
        html:
          '<button type="button" class="modal__close" data-close aria-label="Cerrar">' + I("close", { size: 22 }) + "</button>" +
          '<h2 class="co-modal__title">' + U.rich(tx("checkout.previewTitle", "¡Tu pedido *está* listo!")) + "</h2>" +
          '<p class="co-modal__lead">' + U.rich(tx("checkout.previewText", "Este es el mensaje que enviaremos a WhatsApp. Revísalo: allí coordinamos el pago y el envío contigo."), { accent: false, fill: true }) + "</p>" +
          '<pre class="co-preview" data-co-preview tabindex="0" aria-label="Vista previa del mensaje de WhatsApp"></pre>' +
          '<div class="co-modal__actions">' +
          '<a class="btn btn--whatsapp btn--lg" data-co-open-wa data-autofocus target="_blank" rel="noopener" href="#">' + I("whatsapp", { size: 20 }) + esc(tx("checkout.openLabel", "Abrir WhatsApp")) + "</a>" +
          '<button type="button" class="btn btn--outline btn--lg" data-co-copy>' + I("copy", { size: 18 }) + esc(tx("checkout.copyLabel", "Copiar mensaje")) + "</button></div>" +
          '<p class="co-modal__status" role="status" data-co-modal-status></p>'
      });
      $(".co-modal__title", modal).id = "co-modal-title";
      modal.setAttribute("aria-labelledby", "co-modal-title");
      modal.removeAttribute("aria-label");
      $("[data-co-copy]", modal).addEventListener("click", function () { copyText(lastMessage); });
      $("[data-co-open-wa]", modal).addEventListener("click", function () {
        /* Abrir WhatsApp = pedido enviado: se cuenta el uso del cupón (si hubo descuento), se vacía el carrito y se
           limpia el formulario guardado. El canje va en segundo plano (keepalive): el enlace se abre igual. */
        if (!sent) {
          sent = true;
          /* Píxel de Meta: el pedido salió a WhatsApp (Lead estándar + evento propio con el total) */
          if (M.pixel && M.pixel.enabled) {
            const ids = S.cart.items().map(function (it) { return it.product.id; });
            M.pixel.track("Lead", { content_ids: ids, content_type: "product", num_items: S.cart.count(), value: S.cart.total(), currency: "COP" });
            M.pixel.custom("PedidoWhatsApp", { content_ids: ids, value: S.cart.total(), currency: "COP" });
          }
          if (S.cart.count() && S.cart.discountInfo().amount) S.discount.redeem();
          clearSaved();
          S.cart.clear();
          S.discount.removeCoupon();          /* el código ya se usó en este pedido */
          $("[data-co-modal-status]", modal).textContent = tx("checkout.afterOpenText", "Abrimos WhatsApp en otra pestaña. Cuando termines, cierra esta ventana.");
        }
      });
    }
    $("[data-co-preview]", modal).textContent = message;
    $("[data-co-open-wa]", modal).href = U.waLink(message);
    $("[data-co-modal-status]", modal).textContent = "";
    U.overlay.open(modal, { onClose: onModalClose });
  }

  function onModalClose() {
    if (sent) showSuccess();
  }

  function showSuccess() {
    layoutEl.hidden = true; emptyEl.hidden = true; introEl.hidden = true;
    successEl.hidden = false;
    window.scrollTo(0, 0);
    const t = $("#co-success-title");
    if (t) t.focus({ preventScroll: true });
  }

  /* --- Confirmar ----------------------------------------------------------------------------------------- */
  function setConfirmBusy(on) {
    if (!confirmBtn) return;
    confirmBtn.disabled = on;
    if (on) confirmBtn.setAttribute("aria-busy", "true"); else confirmBtn.removeAttribute("aria-busy");
    const label = confirmBtn.querySelector("span:last-child");
    if (label) {
      if (on) { if (confirmBtn.__label == null) confirmBtn.__label = label.textContent; label.textContent = "Confirmando…"; }
      else if (confirmBtn.__label != null) { label.textContent = confirmBtn.__label; confirmBtn.__label = null; }
    }
  }
  /* El cupón ya no vale al confirmar: se quitó (los totales se recalculan con el evento) → se explica y NO se continúa */
  function couponRejected(r) {
    const msg = "Quitamos el código " + r.code + ": " + r.message + " Revisa el nuevo total antes de confirmar.";
    confirmErr.textContent = msg;
    confirmErr.hidden = false;
    statusEl.textContent = msg;
    U.toast("Quitamos el código " + r.code + ": " + r.message, { icon: "info", ms: 5000 });
    const inp = $("#co-coupon");
    if (inp) { setErr(inp, r.message); }
    try { couponEl.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); } catch (e) {}
  }

  function submit() {
    if (confirming) return;
    confirmErr.textContent = CONFIRM_ERR_TEXT;
    let firstBad = null;
    REQUIRED.forEach(function (f) { if (!validateField(f) && !firstBad) firstBad = f.id; });
    if (!validatePay() && !firstBad) firstBad = "co-pay";
    if (firstBad) {
      alertEl.hidden = false;
      refreshAlert();
      confirmErr.hidden = false;
      focusField(firstBad);
      return;
    }
    alertEl.hidden = true; confirmErr.hidden = true;
    if (!S.cart.count()) { refreshView(); return; }
    save();
    const info = S.cart.discountInfo();
    /* Sin descuento efectivo no hace falta validar. Con descuento se vuelve a validar el código (NO suma usos: el uso
       se cuenta al abrir WhatsApp, así cerrar la vista previa o confirmar otra vez no lo gasta). */
    if (!info.amount) { openModal(buildMessage()); return; }
    confirming = true;
    setConfirmBusy(true);
    S.discount.revalidate().then(function (r) {
      confirming = false;
      setConfirmBusy(false);
      if (r.removed) { couponRejected(r); return; }
      /* ok, o sin red (r.network): se continúa igual; el pedido se coordina por WhatsApp */
      openModal(buildMessage());
    });
  }

  /* --- Regalo (C45) ----------------------------------------------------------------------------------------- */
  const GIFT_MAX = C.giftMaxChars || 180;
  function setGift(on) {
    giftOn = !!on;
    giftSwitch.setAttribute("aria-checked", String(giftOn));
    giftPanel.hidden = !giftOn;
  }
  function updateGiftCount(announce) {
    if (giftMsg.value.length > GIFT_MAX) giftMsg.value = giftMsg.value.slice(0, GIFT_MAX);   /* pegado / autocompletado */
    const n = giftMsg.value.length;
    giftCount.textContent = n + "/" + GIFT_MAX;
    giftCount.classList.toggle("is-limit", n >= GIFT_MAX);
    if (n >= GIFT_MAX) {
      if (announce && !giftLive.dataset.limit) giftLive.textContent = "Llegaste al límite de " + GIFT_MAX + " caracteres.";
      giftLive.dataset.limit = "1";
    } else {
      giftLive.textContent = "";
      delete giftLive.dataset.limit;
    }
  }

  /* --- Eventos ------------------------------------------------------------------------------------------------- */
  function bind() {
    /* Validar al salir de cada campo y limpiar el error al corregir */
    FIELDS.forEach(function (f) {
      if (f.optional) return;
      f.el.addEventListener("blur", function () { validateField(f); });
      f.el.addEventListener("input", function () { if (f.el.getAttribute("aria-invalid") === "true") validateField(f); });
    });
    form.addEventListener("input", save);
    form.addEventListener("change", save);

    dept.addEventListener("change", function () {
      fillCities(dept.value, "");
      validateField(FIELDS[3]);
      if (city.getAttribute("aria-invalid") === "true") setErr(city, "");
      save();
    });
    city.addEventListener("change", function () { validateField(FIELDS[4]); });

    payEl.addEventListener("change", function () { syncPayRows(); validatePay(); save(); });

    giftSwitch.addEventListener("click", function () {
      setGift(!giftOn);
      if (giftOn) giftMsg.focus();
      save();
    });
    giftMsg.maxLength = GIFT_MAX;
    giftMsg.addEventListener("input", function () { updateGiftCount(true); });

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    /* Enlaces del resumen de errores */
    alertEl.addEventListener("click", function (e) {
      const a = e.target.closest("[data-co-goto]");
      if (!a) return;
      e.preventDefault();
      focusField(a.getAttribute("data-co-goto"));
    });

    /* Carrito editable (móvil) */
    cartLinesEl.addEventListener("click", function (e) {
      const row = e.target.closest(".co-line");
      if (!row) return;
      const key = row.getAttribute("data-key");
      const it = S.cart.items().filter(function (x) { return x.key === key; })[0];
      if (!it) return;
      const step = e.target.closest("[data-step]");
      if (step) {
        const dir = parseInt(step.getAttribute("data-step"), 10);
        const next = it.qty + dir;
        refocus = { key: key, step: String(dir) };
        if (next < 1) { refocus = null; S.cart.remove(key); return; }
        if (next > it.stock) { refocus = null; U.toast("Solo quedan " + it.stock + " unidades de esta talla", { icon: "info" }); return; }
        S.cart.setQty(key, next);
        return;
      }
      if (e.target.closest("[data-co-remove]")) {
        U.toast("Quitamos " + it.product.name + " de tu carrito", { icon: "trash" });
        S.cart.remove(key);
      }
    });

    /* Cupón */
    couponEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-coupon-apply]")) applyCoupon();
      else if (e.target.closest("[data-claimed-apply]")) { const mine = S.discount.pendingClaim(); if (mine) applyCoupon(mine.code); }
      else if (e.target.closest("[data-coupon-remove]")) {
        S.discount.removeCoupon();
        statusEl.textContent = "Código de descuento quitado.";
        const inp = $("#co-coupon"); if (inp) inp.focus();
      }
    });
    couponEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.id === "co-coupon") { e.preventDefault(); applyCoupon(); }
    });
    couponEl.addEventListener("input", function (e) {
      if (e.target.id === "co-coupon" && e.target.getAttribute("aria-invalid") === "true") setErr(e.target, "");
    });

    /* Estado compartido (el aviso del cupón depende del carrito: compra mínima / productos participantes) */
    document.addEventListener("mercy:cart", function () {
      renderCartLines(); renderSumLines(); renderShipping(); renderTotals(); refreshView();
      if (S.discount.couponApplied()) renderCoupon();
    });
    document.addEventListener("mercy:discount", function () { renderCoupon(); renderTotals(); });
  }

  /* --- Inicio ----------------------------------------------------------------------------------------------------- */
  function restore() {
    const s = readSaved();
    FIELDS.forEach(function (f) { if (s[f.key] != null && f.el.tagName !== "SELECT") f.el.value = s[f.key]; });
    if (s.dept && D.DEPARTMENTS[s.dept]) { dept.value = s.dept; fillCities(s.dept, s.city); } else fillCities("", "");
    if (s.gift) setGift(true);
    if (s.giftMsg) giftMsg.value = String(s.giftMsg).slice(0, GIFT_MAX);
    if (s.pay) {
      const r = $('input[name="pago"][value="' + s.pay + '"]', payEl);
      if (r) { r.checked = true; syncPayRows(); }
    }
    updateGiftCount(false);
  }

  /* Orden de tabulación = orden visual: en móvil los totales/cupón van entre el envío y el pago,
     en escritorio dentro del resumen (se mueve el nodo según el ancho). */
  function placeSummaryBox() {
    const box = $(".sum-box"), pay = $(".co-step--pay"), confirm = $(".co__confirm");
    const wide = window.matchMedia("(min-width: 900px)");
    const place = function () {
      if (wide.matches) confirm.parentNode.insertBefore(box, confirm);
      else pay.parentNode.insertBefore(box, pay);
    };
    place();
    if (wide.addEventListener) wide.addEventListener("change", place); else if (wide.addListener) wide.addListener(place);
  }

  /* Textos administrables de la página (texts.checkout / texts.shipping): el HTML trae los de fábrica y aquí se reemplazan */
  function applyTexts() {
    const fill = U.fill;
    const set = function (sel, val, html) { const n = $(sel); if (!n) return; if (html) n.innerHTML = val; else n.textContent = val; };
    document.title = U.plain(tx("checkout.title", "Finalizar *compra*")) + " — " + C.brand;
    let meta = $('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.setAttribute("content", fill(tx("checkout.metaDescription", "Finaliza tu compra en {marca} como invitado: completa tus datos, elige el pago y confirma tu pedido por WhatsApp.")));
    set(".co__title", U.rich(tx("checkout.title", "Finalizar *compra*")), true);
    set(".co__sub", fill(tx("checkout.subtitle", "Compra como invitado — sin registro obligatorio.")));
    set("#co-empty-title", tx("checkout.emptyTitle", "Tu carrito está vacío"));
    set("[data-co-empty] .empty__text", tx("checkout.emptyText", "Agrega tus prendas favoritas para poder finalizar tu compra."));
    set("[data-co-empty] .btn", tx("checkout.emptyCta", "Seguir mirando"));
    set("#co-success-title", U.rich(tx("checkout.successTitle", "¡Gracias por tu *pedido*!")), true);
    set(".co-success__text", fill(tx("checkout.successText", "Lo enviamos a WhatsApp. Allí coordinamos contigo el pago por transferencia y el envío a tu dirección.")));
    set(".co-success__actions .btn--primary", tx("checkout.successHome", "Volver al inicio"));
    set(".co-success__actions .btn--outline", tx("checkout.successCta", "Seguir mirando"));
    set("#h-ship", tx("checkout.shipTitle", "Método de envío"));
    set(".ship-card__name", tx("shipping.method", "Envío a domicilio"));
    set(".ship-card__desc", [tx("shipping.time", "2–4 días hábiles"), tx("shipping.coordination", "Coordinamos por WhatsApp")].filter(function (s) { return s.trim(); }).join(" · "));
    set(".co-note p", fill(tx("checkout.note", "Verifica que la dirección de entrega, productos y tallas seleccionados estén correctos y completos.")));
    set("#gift-label", tx("checkout.giftTitle", "¿Es un regalo?"));
    set("#gift-hint", tx("checkout.giftHint", "Agrega un mensaje personalizado (opcional)."));
    set('label[for="gift-msg"]', esc(tx("checkout.giftLabel", "Mensaje personalizado")) + ' <span class="opt">(opcional)</span>', true);
    if (giftMsg) giftMsg.setAttribute("placeholder", tx("checkout.giftPlaceholder", "Escribe aquí el mensaje que acompañará tu regalo…"));
    set("#h-pay", tx("checkout.payTitle", "Pago"));
    set("#pay-lead", tx("checkout.payLead", "Elige cómo vas a pagar por transferencia:"));
    set("#pay-hint span:last-child", fill(tx("checkout.payHint", "Aquí no se cobra nada. El método que elijas llega a {marca} dentro de tu mensaje de WhatsApp y por ese chat te enviamos los datos para transferir.")));
    set("#co-confirm span:last-child", tx("checkout.confirmLabel", "Confirmar pedido por WhatsApp"));
    set(".co__legal", fill(tx("checkout.confirmHelp", "Te llevaremos a WhatsApp con el resumen de tu pedido para coordinar pago y envío.")));
  }

  function init() {
    applyTexts();
    placeSummaryBox();
    $$("[data-icon]").forEach(function (el) {
      el.innerHTML = I(el.getAttribute("data-icon"), { size: parseInt(el.getAttribute("data-size"), 10) || 20, stroke: parseFloat(el.getAttribute("data-stroke")) || undefined });
    });
    fillDepartments();
    renderPayments();
    restore();
    bind();
    renderAll();
    /* Píxel de Meta: llegó al pago con prendas en el carrito */
    if (M.pixel && M.pixel.enabled && S.cart.count()) {
      M.pixel.track("InitiateCheckout", { content_ids: S.cart.items().map(function (it) { return it.product.id; }), content_type: "product", num_items: S.cart.count(), value: S.cart.total(), currency: "COP" });
    }
  }
  init();
})();
