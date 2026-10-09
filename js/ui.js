/* ==========================================================================
   Mercy Studio — ui.js
   Utilidades compartidas: formato, plantillas (tile / tarjeta de producto),
   overlays (drawers y modales), acordeones, toasts y validación de formularios.
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  const icon = Mercy.icons.svg;

  /* --- Básicos ----------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
  function qs() { return new URLSearchParams(location.search); }
  function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function waLink(text) {
    return "https://wa.me/" + Mercy.config.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
  }
  function pluralize(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function logoHTML(variant, cls) {
    const src = Mercy.config.logo[variant || "terracota"];
    return '<img class="' + (cls || "logo__img") + '" src="' + src + '" alt="Mercy Studio" width="160" height="80" decoding="async">';
  }

  /* --- Tile (placeholder de foto con degradado, como en las capturas) ---- */
  function tileHTML(p, opts) {
    opts = opts || {};
    const t = p.tile;
    const v = opts.variant || 0;
    let from = t.from, to = t.to;
    if (v === 1) { from = "#e3cdb9"; to = "#b98563"; }
    if (v === 2) { from = "#8a7a6c"; to = "#2e2219"; }
    const lines = t.lines;
    const longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
    let fs = Math.max(9, 30 - 2.6 * longest);
    if (t.stacked) fs = Math.max(9, 26 - 2.2 * longest);
    if (t.small) fs = fs * 0.82;
    if (t.fs) fs = t.fs;
    let inner;
    if (t.stacked) {
      inner = '<span class="tile__line tile__line--sm">' + esc(lines[0]) + '</span><span class="tile__line tile__line--lg">' + esc(lines[1] || "") + "</span>";
    } else {
      inner = lines.map(function (l) { return '<span class="tile__line">' + esc(l) + "</span>"; }).join("");
    }
    const sub = opts.sub && t.sub ? '<span class="tile__sub">' + esc(t.sub) + "</span>" : "";
    const label = v === 3 ? '<span class="tile__play">' + icon("play", { size: 28 }) + "</span>" : "";

    /* Vista previa con fotografía real (Mercy.config.stockPhotos). Si la foto falla, vuelve al degradado con texto. */
    let photo = "";
    const photos = p.photos || [];
    if (Mercy.config.stockPhotos && photos.length) {
      const entry = photos[(v === 3 ? 0 : v) % photos.length];
      const pid = typeof entry === "object" ? entry.id : entry;
      const zoomStyle = typeof entry === "object"
        ? ' style="--zoom:' + entry.zoom + ";--ox:" + (entry.ox || "50%") + ";--oy:" + (entry.oy || "50%") + '"' : "";
      const size = opts.size || "card";
      const set = { thumb: [160, 320], card: [420, 640, 900], large: [640, 900, 1200] }[size] || [420, 640, 900];
      const sizes = { thumb: "96px", card: "(min-width: 1100px) 25vw, 50vw", large: "(min-width: 900px) 50vw, 100vw" }[size];
      const srcset = set.map(function (w) { return Mercy.data.photoUrl(pid, w) + " " + w + "w"; }).join(", ");
      photo = '<img class="tile__img"' + zoomStyle + ' src="' + Mercy.data.photoUrl(pid, set[1]) + '" srcset="' + srcset + '" sizes="' + sizes + '" alt="' +
        (opts.alt === undefined ? esc(p.name) : esc(opts.alt)) + '" loading="' + (opts.eager ? "eager" : "lazy") + '" decoding="async">';
    }
    return (
      '<div class="tile' + (t.stacked ? " tile--stacked" : "") + (photo ? " tile--photo" : "") + '" style="--tile-from:' + from + ";--tile-to:" + to + ";--tile-fs:" + fs.toFixed(2) + 'cqw">' +
      '<div class="tile__text">' + (v === 3 ? "" : inner) + sub + "</div>" + photo + label + "</div>"
    );
  }

  /* Si una foto de vista previa no carga (sin internet), se muestra de nuevo el degradado con texto. */
  document.addEventListener("error", function (e) {
    const t = e.target;
    if (t && t.classList && t.classList.contains("tile__img")) {
      const tile = t.closest(".tile");
      if (tile) tile.classList.remove("tile--photo");
      t.remove();
    }
  }, true);

  /* --- Tarjeta de producto ------------------------------------------------ */
  function cardHTML(p, opts) {
    opts = opts || {};
    const url = "producto.html?id=" + encodeURIComponent(p.id);
    const fav = Mercy.store ? Mercy.store.favs.has(p.id) : false;
    const badgeCls = p.badge === "Nuevo" ? "badge--brand" : "badge--dark";
    const badge = p.badge ? '<span class="badge ' + badgeCls + '">' + esc(p.badge) + "</span>" : "";
    const veil = p.soldOut
      ? '<span class="pcard__veil">' + icon("ban", { size: 30 }) + '<span class="pcard__veil-text">Agotado</span></span>'
      : "";
    const swatches = p.colors.map(function (c) {
      return '<span class="swatch swatch--sm" style="--c:' + Mercy.data.color(c).hex + '" title="' + esc(Mercy.data.color(c).name) + '"></span>';
    }).join("");
    const fitName = p.fits && p.fits.length ? Mercy.data.FITS[p.fits[0]] : "";
    const meta = opts.meta
      ? '<p class="pcard__meta">' + esc((fitName ? fitName + " · " : "") + pluralize(p.colors.length, "color", "colores")) + "</p>"
      : "";
    const ship = p.envioGratis
      ? '<p class="pcard__ship">' + icon("truck", { size: 14 }) + " Envío gratis</p>"
      : "";
    return (
      '<article class="pcard' + (p.soldOut ? " is-soldout" : "") + '" data-id="' + esc(p.id) + '">' +
      '<a class="pcard__media" href="' + url + '" aria-label="' + esc(p.name) + '">' +
      tileHTML(p, { sub: !!opts.sub }) + badge + veil + "</a>" +
      '<button type="button" class="fav-btn" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="' +
      (fav ? "Quitar de favoritos" : "Guardar en favoritos") + ": " + esc(p.name) + '">' +
      icon(fav ? "heart-fill" : "heart", { size: 20 }) + "</button>" +
      '<div class="pcard__body">' +
      '<h3 class="pcard__name"><a href="' + url + '">' + esc(p.name) + "</a></h3>" +
      meta +
      '<div class="pcard__swatches">' + swatches + "</div>" +
      '<p class="pcard__price' + (p.soldOut ? " is-muted" : "") + '">' + money(p.price) + "</p>" +
      ship +
      "</div></article>"
    );
  }

  /* Sincroniza el estado visual de todos los botones de favorito de la página. */
  function syncFavButtons() {
    $$("[data-fav]").forEach(function (b) {
      const on = Mercy.store.favs.has(b.getAttribute("data-fav"));
      if (b.getAttribute("aria-pressed") === String(on)) return;
      b.setAttribute("aria-pressed", String(on));
      b.innerHTML = icon(on ? "heart-fill" : "heart", { size: 20 });
      const label = b.getAttribute("aria-label") || "";
      b.setAttribute("aria-label", label.replace(/^(Guardar en favoritos|Quitar de favoritos)/, on ? "Quitar de favoritos" : "Guardar en favoritos"));
    });
  }

  /* --- Stepper de cantidad ------------------------------------------------ */
  function stepperHTML(qty, opts) {
    opts = opts || {};
    const atMax = opts.max != null && qty >= opts.max;
    return (
      '<div class="stepper' + (opts.cls ? " " + opts.cls : "") + '" data-stepper>' +
      '<button type="button" class="stepper__btn" data-step="-1" aria-label="Disminuir cantidad"' + (opts.minDisabled && qty <= 1 ? " disabled" : "") + ">" + icon("minus", { size: 14, stroke: 2 }) + "</button>" +
      '<output class="stepper__value" aria-live="polite">' + qty + "</output>" +
      '<button type="button" class="stepper__btn" data-step="1" aria-label="Aumentar cantidad"' + (atMax ? " disabled" : "") + ">" + icon("plus", { size: 14, stroke: 2 }) + "</button>" +
      "</div>"
    );
  }

  /* --- Overlays (drawers / modales) -------------------------------------- */
  const stack = [];
  let scrim = null;
  const Z = { drawer: 110, modal: 130 };

  function ensureScrim() {
    if (scrim) return scrim;
    scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.addEventListener("click", function () {
      const top = stack[stack.length - 1];
      if (top && top.el.getAttribute("data-dismiss") !== "false") overlay.close(top.el);
    });
    document.body.appendChild(scrim);
    return scrim;
  }
  function focusables(el) {
    return $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', el)
      .filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
  }
  function refreshScrim() {
    const s = ensureScrim();
    const top = stack[stack.length - 1];
    if (!top) {
      s.classList.remove("is-on");
      document.body.classList.remove("is-locked");
      return;
    }
    s.style.zIndex = String((top.el.classList.contains("modal") ? Z.modal : Z.drawer) - 1);
    s.classList.toggle("is-light", top.el.classList.contains("search-panel"));
    s.classList.add("is-on");
    document.body.classList.add("is-locked");
  }

  const overlay = {
    isOpen: function (el) { return stack.some(function (o) { return o.el === el; }); },
    open: function (el, opts) {
      opts = opts || {};
      if (!el || overlay.isOpen(el)) return;
      stack.push({ el: el, trigger: opts.trigger || document.activeElement, onClose: opts.onClose });
      el.hidden = false;
      el.removeAttribute("inert");
      el.setAttribute("aria-hidden", "false");
      /* forzar reflow para que la transición se aplique */
      void el.offsetWidth;
      el.classList.add("is-open");
      refreshScrim();
      const first = $("[data-autofocus]", el) || focusables(el)[0] || el;
      setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 60);
      document.dispatchEvent(new CustomEvent("mercy:overlay-open", { detail: { el: el } }));
    },
    close: function (el) {
      const i = stack.findIndex(function (o) { return o.el === el; });
      if (i < 0) return;
      const rec = stack.splice(i, 1)[0];
      el.classList.remove("is-open");
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("inert", "");
      refreshScrim();
      setTimeout(function () { if (!el.classList.contains("is-open")) el.hidden = true; }, 360);
      if (rec.trigger && rec.trigger.focus && document.contains(rec.trigger)) { try { rec.trigger.focus({ preventScroll: true }); } catch (e) {} }
      if (rec.onClose) rec.onClose();
      document.dispatchEvent(new CustomEvent("mercy:overlay-close", { detail: { el: el } }));
    },
    closeAll: function () { stack.slice().reverse().forEach(function (o) { overlay.close(o.el); }); },
    top: function () { return stack.length ? stack[stack.length - 1].el : null; }
  };

  document.addEventListener("keydown", function (e) {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (e.key === "Escape") {
      if (top.el.getAttribute("data-dismiss") !== "false") { e.preventDefault(); overlay.close(top.el); }
    } else if (e.key === "Tab") {
      const f = focusables(top.el);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* Cierre por cualquier elemento con data-close dentro de un overlay */
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-close]");
    if (!btn) return;
    const ov = btn.closest(".drawer, .modal, .search-panel");
    if (ov) { e.preventDefault(); overlay.close(ov); }
  });

  /* Crea un drawer (panel lateral) y lo añade al <body>. */
  function createDrawer(opts) {
    const el = document.createElement("aside");
    el.id = opts.id;
    el.className = "drawer drawer--" + (opts.side || "right") + (opts.cls ? " " + opts.cls : "");
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("inert", "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", opts.label || opts.title || "");
    el.innerHTML = opts.html || "";
    document.body.appendChild(el);
    return el;
  }
  /* Crea un modal centrado. */
  function createModal(opts) {
    const el = document.createElement("div");
    el.id = opts.id;
    el.className = "modal" + (opts.cls ? " " + opts.cls : "");
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("inert", "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", opts.label || opts.title || "");
    el.innerHTML = '<div class="modal__box">' + (opts.html || "") + "</div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) { if (e.target === el && el.getAttribute("data-dismiss") !== "false") overlay.close(el); });
    return el;
  }

  /* Modal informativo reutilizable (guía de tallas, envíos, etc.) */
  function infoModal(id, title, bodyHTML) {
    let el = document.getElementById(id);
    if (!el) {
      el = createModal({ id: id, label: title, cls: "modal--info",
        html: '<button type="button" class="modal__close" data-close aria-label="Cerrar">' + icon("close", { size: 22 }) + "</button>" +
          '<h2 class="modal__title"></h2><div class="modal__content"></div>' });
    }
    $(".modal__title", el).textContent = title;
    $(".modal__content", el).innerHTML = bodyHTML;
    overlay.open(el);
    return el;
  }

  /* --- Acordeón ----------------------------------------------------------- */
  /* Marcado:  <div class="acc" data-acc> <button class="acc__head" aria-expanded="false"> … </button> <div class="acc__panel"><div class="acc__inner">…</div></div> </div> */
  function setAcc(acc, open) {
    const head = $(".acc__head", acc);
    const panel = $(".acc__panel", acc);
    if (!head || !panel) return;
    acc.classList.toggle("is-open", open);
    head.setAttribute("aria-expanded", String(open));
    panel.setAttribute("aria-hidden", String(!open));
    if (open) panel.removeAttribute("inert"); else panel.setAttribute("inert", "");
  }
  function initAccordions(root, opts) {
    opts = opts || {};
    $$("[data-acc]", root || document).forEach(function (acc) {
      if (acc.__accInit) return;
      acc.__accInit = true;
      const head = $(".acc__head", acc);
      const startOpen = acc.hasAttribute("data-open");
      setAcc(acc, startOpen);
      head.addEventListener("click", function () {
        const willOpen = !acc.classList.contains("is-open");
        if (opts.single && willOpen) {
          $$("[data-acc]", acc.parentElement).forEach(function (o) { if (o !== acc) setAcc(o, false); });
        }
        setAcc(acc, willOpen);
      });
    });
  }

  /* --- Toast -------------------------------------------------------------- */
  function toast(msg, opts) {
    opts = opts || {};
    let box = document.getElementById("mercy-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "mercy-toasts";
      box.className = "toasts";
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = (opts.icon ? icon(opts.icon, { size: 18 }) : "") + "<span>" + esc(msg) + "</span>";
    box.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-in"); });
    setTimeout(function () {
      t.classList.remove("is-in");
      setTimeout(function () { t.remove(); }, 320);
    }, opts.ms || 2600);
  }

  /* --- Validación de formularios ------------------------------------------ */
  const validators = {
    required: function (v) { return String(v || "").trim() ? "" : "Este campo es obligatorio."; },
    email: function (v) {
      v = String(v || "").trim();
      if (!v) return "Escribe tu correo electrónico.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Ingresa un correo válido (ej. nombre@correo.com).";
    },
    phone: function (v) {
      const d = String(v || "").replace(/\D/g, "");
      if (!d) return "Escribe tu número de celular.";
      return /^3\d{9}$/.test(d) ? "" : "Celular colombiano de 10 dígitos (ej. 300 123 4567).";
    },
    cedula: function (v) {
      const d = String(v || "").replace(/\D/g, "");
      if (!d) return "Escribe tu número de documento.";
      return d.length >= 6 && d.length <= 10 ? "" : "Documento de 6 a 10 dígitos.";
    },
    name: function (v) {
      v = String(v || "").trim();
      if (!v) return "Escribe tu nombre completo.";
      return v.split(/\s+/).length >= 2 && v.length >= 5 ? "" : "Escribe nombre y apellido.";
    }
  };
  function setError(input, msg) {
    const field = input.closest(".field") || input.parentElement;
    let err = field.querySelector(".field__error");
    if (!err) {
      err = document.createElement("p");
      err.className = "field__error";
      err.setAttribute("role", "alert");
      err.id = (input.id || input.name || "campo") + "-error";
      field.appendChild(err);
    }
    if (msg) {
      field.classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", err.id);
      err.textContent = msg;
    } else {
      field.classList.remove("has-error");
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      err.textContent = "";
    }
    return !msg;
  }

  Mercy.ui = {
    $: $, $$: $$, esc: esc, money: money, norm: norm, qs: qs, debounce: debounce, waLink: waLink,
    pluralize: pluralize, icon: icon, logoHTML: logoHTML,
    tileHTML: tileHTML, cardHTML: cardHTML, syncFavButtons: syncFavButtons, stepperHTML: stepperHTML,
    overlay: overlay, createDrawer: createDrawer, createModal: createModal, infoModal: infoModal,
    initAccordions: initAccordions, setAcc: setAcc, toast: toast,
    validators: validators, setError: setError
  };
})();
