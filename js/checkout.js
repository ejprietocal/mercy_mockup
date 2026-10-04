/* ==========================================================================
   Mercy Studio — checkout.js
   Pantalla "Finalizar compra":
     · Carrito editable (móvil) y resumen (escritorio)         · C44 / TRUE
     · Contacto + dirección (Departamento → Ciudad)            · C30
     · Validación obligatoria: no deja avanzar                 · C31
     · Envío único (domicilio), estado según carrito           · C32 C33 C34 C46
     · ¿Es un regalo? con mensaje y límite de caracteres       · C45
     · Pago por transferencia con logo del banco               · C35
     · Código de descuento (MERCY15)                           · P22 / C29
     · Confirmar: mensaje de WhatsApp + modal de vista previa
   ========================================================================== */
(function () {
  "use strict";

  const M = window.Mercy;
  const U = M.ui, S = M.store, D = M.data, C = M.config, I = M.icons.svg, V = U.validators;
  const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;
  const STORE_KEY = "checkout";

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
        '<span class="pay-row__logo" aria-hidden="true">' + M.icons.bank(m.id) + "</span></label>"
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
        '<a class="co-line__thumb" href="' + pUrl(p) + '" tabindex="-1" aria-hidden="true">' + U.tileHTML(p, { size: "thumb", alt: "" }) + "</a>" +
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
        '<li class="sum-line"><div class="sum-line__thumb">' + U.tileHTML(p, { size: "thumb", alt: "" }) + "</div>" +
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
      shipEl.innerHTML = '<div class="ship-status ship-status--free"><span class="ship-status__label">' + I("truck", { size: 18 }) + "ENVÍO GRATIS</span></div>";
    } else if (sh.status === "not-included") {
      shipEl.innerHTML = '<div class="ship-status ship-status--not"><span class="ship-status__label">' + I("truck", { size: 18 }) +
        'ENVÍO NO INCLUIDO</span><span class="ship-status__note">Tiene un costo adicional que se coordina por WhatsApp</span></div>';
    } else {
      shipEl.innerHTML = "";
    }
  }

  function renderTotals() {
    const sh = S.cart.shipping();
    const disc = S.cart.discountAmount();
    const notIncluded = sh.status === "not-included";
    totalsEl.innerHTML =
      "<div><dt>Subtotal</dt><dd>" + money(S.cart.subtotal()) + "</dd></div>" +
      (disc ? '<div class="is-disc"><dt>Descuento ' + S.discount.percent() + "%</dt><dd>−" + money(disc) + "</dd></div>" : "") +
      "<div><dt>Envío</dt><dd" + (sh.status === "free" ? ' class="is-ship-free"' : "") + ">" + (sh.status === "free" ? "Gratis" : "No incluido") + "</dd></div>" +
      '<div class="is-total"><dt>Total</dt><dd>' + money(S.cart.total()) + (notIncluded ? "<small>+ envío por coordinar</small>" : "") + "</dd></div>";
  }

  /* Código de descuento (MERCY15) */
  function renderCoupon() {
    if (S.discount.couponApplied()) {
      couponEl.innerHTML =
        '<p class="coupon__applied">' + I("tag", { size: 18 }) +
        "<span><strong>" + esc(S.discount.code()) + "</strong> aplicado · " + S.discount.percent() + "% de descuento</span>" +
        '<button type="button" class="co-link" data-coupon-remove aria-label="Quitar código de descuento">Quitar</button></p>';
      couponEl.classList.remove("has-error");
      return;
    }
    couponEl.innerHTML =
      '<label class="visually-hidden" for="co-coupon">Código de descuento</label>' +
      '<div class="coupon__row"><input class="input" id="co-coupon" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Código de descuento">' +
      '<button type="button" class="btn btn--dark" data-coupon-apply>Aplicar</button></div>' +
      '<button type="button" class="co-link coupon__ask" data-discount-open>¿Aún no tienes código? Obtén ' + S.discount.percent() + "% de descuento</button>";
  }
  function applyCoupon() {
    const input = $("#co-coupon");
    if (!input) return;
    const code = input.value.trim();
    if (!code) { setErr(input, "Escribe tu código de descuento."); input.focus(); return; }
    if (S.discount.applyCoupon(code)) {
      statusEl.textContent = "Código aplicado: " + S.discount.percent() + "% de descuento.";
      U.toast("¡Código aplicado! " + S.discount.percent() + "% de descuento", { icon: "check" });
    } else {
      setErr(input, "Ese código no es válido. Revisa e inténtalo de nuevo.");
      input.focus();
    }
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
    const disc = S.cart.discountAmount();
    const val = function (f) { return f.el.value.trim(); };
    const F = {}; FIELDS.forEach(function (f) { F[f.key] = val(f); });
    const pay = D.PAYMENT_METHODS.filter(function (m) { return m.id === currentPay(); })[0];
    const L = [];
    L.push("Hola Mercy Studio 👋, quiero confirmar mi pedido:", "", "*MI PEDIDO*");
    items.forEach(function (it, i) {
      L.push((i + 1) + ". " + it.product.name + " — " + variantText(it) + " — x" + it.qty + " — " + money(it.lineTotal));
    });
    L.push("", "Subtotal: " + money(S.cart.subtotal()));
    if (disc) L.push("Descuento " + S.discount.percent() + "% (" + S.discount.code() + "): −" + money(disc));
    L.push("Envío: " + (sh.status === "free" ? "GRATIS" : "NO INCLUIDO (costo adicional, se coordina por WhatsApp)"));
    L.push("*TOTAL: " + money(S.cart.total()) + "*" + (sh.status === "free" ? "" : " + envío por coordinar"));
    L.push("", "*DATOS DEL CLIENTE*", "Nombre: " + F.name, "Cédula: " + F.cedula.replace(/\D/g, ""), "Celular: " + groupPhone(F.phone));
    const addr = [F.address, F.building, F.apt].filter(Boolean).join(", ");
    L.push("", "*DIRECCIÓN DE ENTREGA*", addr, "Barrio: " + F.barrio, F.city + ", " + F.dept, "Envío a domicilio (2–4 días hábiles)");
    if (giftOn) {
      L.push("", "*REGALO*: Sí");
      L.push(giftMsg.value.trim() ? "Mensaje: “" + giftMsg.value.trim() + "”" : "Sin mensaje personalizado");
    }
    L.push("", "*MÉTODO DE PAGO*: " + (pay ? pay.name + " (transferencia)" : ""), "", "¡Gracias! Quedo atento(a) para coordinar el pago y el envío.");
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
          '<h2 class="co-modal__title">¡Tu pedido <span class="accent">está</span> listo!</h2>' +
          '<p class="co-modal__lead">Este es el mensaje que enviaremos a WhatsApp. Revísalo: allí coordinamos el pago y el envío contigo.</p>' +
          '<pre class="co-preview" data-co-preview tabindex="0" aria-label="Vista previa del mensaje de WhatsApp"></pre>' +
          '<div class="co-modal__actions">' +
          '<a class="btn btn--whatsapp btn--lg" data-co-open-wa data-autofocus target="_blank" rel="noopener" href="#">' + I("whatsapp", { size: 20 }) + "Abrir WhatsApp</a>" +
          '<button type="button" class="btn btn--outline btn--lg" data-co-copy>' + I("copy", { size: 18 }) + "Copiar mensaje</button></div>" +
          '<p class="co-modal__status" role="status" data-co-modal-status></p>'
      });
      $(".co-modal__title", modal).id = "co-modal-title";
      modal.setAttribute("aria-labelledby", "co-modal-title");
      modal.removeAttribute("aria-label");
      $("[data-co-copy]", modal).addEventListener("click", function () { copyText(lastMessage); });
      $("[data-co-open-wa]", modal).addEventListener("click", function () {
        /* Abrir WhatsApp = pedido enviado: se vacía el carrito y se limpia el formulario guardado */
        if (!sent) {
          sent = true;
          clearSaved();
          S.cart.clear();
          $("[data-co-modal-status]", modal).textContent = "Abrimos WhatsApp en otra pestaña. Cuando termines, cierra esta ventana.";
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
  function submit() {
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
    openModal(buildMessage());
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

    /* Estado compartido */
    document.addEventListener("mercy:cart", function () {
      renderCartLines(); renderSumLines(); renderShipping(); renderTotals(); refreshView();
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

  function init() {
    placeSummaryBox();
    $$("[data-icon]").forEach(function (el) {
      el.innerHTML = I(el.getAttribute("data-icon"), { size: parseInt(el.getAttribute("data-size"), 10) || 20, stroke: parseFloat(el.getAttribute("data-stroke")) || undefined });
    });
    fillDepartments();
    renderPayments();
    restore();
    bind();
    renderAll();
  }
  init();
})();
