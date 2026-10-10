/* ==========================================================================
   Mercy Studio — producto.js
   Pantalla de detalle de producto:  producto.html?id=<id>
   Comentarios aplicados: C23/C24 (stock / no disponible), C25 (etiqueta de color
   encima), C26/C27 (solo "Agregar al carrito"), C28 (acordeones ítem por ítem +
   Medidas/Tallas), C32/C34 (envío), C43 (tachón diagonal), C44 (carrito overlay).
   Galería: fotos (1–4) del COLOR seleccionado + diapositiva de video al final; se rehace
   al cambiar de color. Sin fotos en ningún color: 3 degradados + video (como siempre).
   ========================================================================== */
(function () {
  "use strict";

  const M = window.Mercy;
  const U = M.ui, D = M.data, S = M.store, I = M.icons.svg;
  const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;

  const SUFFIX = " — " + M.config.brand;
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const id = U.qs().get("id");
  const p = id ? D.byId(id) : null;
  /* Enlace con un id anterior (producto renombrado: el botón del hero, un enlace compartido…): se muestra la prenda
     y la dirección pasa al id actual (sin recargar). */
  if (p && p.id !== id && window.history && history.replaceState) {
    try {
      const q = U.qs();
      q.set("id", p.id);
      history.replaceState(history.state, "", location.pathname + "?" + q.toString() + location.hash);
    } catch (e) { /* file:// en algunos navegadores */ }
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function setMeta(title, desc) {
    document.title = title;
    let m = $('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
    m.setAttribute("content", desc);
  }

  function renderCrumbs(current) {
    $("#crumbs").innerHTML =
      "<ol>" +
      '<li><a href="index.html">Inicio</a></li>' +
      '<li><a href="catalogo.html">Catálogo</a></li>' +
      '<li><span aria-current="page">' + esc(current) + "</span></li>" +
      "</ol>";
  }

  function byRankInStockFirst(a, b) {
    return (a.soldOut ? 1 : 0) - (b.soldOut ? 1 : 0) || a.bestRank - b.bestRank;
  }

  function renderCards(list, target) {
    target.innerHTML = list.map(function (x) { return U.cardHTML(x); }).join("");
  }

  /* ------------------------------------------------------------------ */
  /* Producto no encontrado                                               */
  /* ------------------------------------------------------------------ */
  function renderMissing() {
    renderCrumbs("Prenda no encontrada");
    setMeta("Prenda no encontrada" + SUFFIX, "No encontramos esa prenda. Mira la colección de " + M.config.brand + " y encuentra la que habla de ti.");
    $("#missing-icon").innerHTML = I("search", { size: 44, stroke: 1.2 });
    $("#pdp-missing").hidden = false;
    $("#related-title").textContent = "Quizá te interese";
    const list = D.PRODUCTS.slice().sort(byRankInStockFirst).slice(0, 4);
    renderCards(list, $("#related-list"));
    $("#pdp-related").hidden = false;
  }

  if (!p) { renderMissing(); return; }

  /* ------------------------------------------------------------------ */
  /* Estado de la selección                                               */
  /* ------------------------------------------------------------------ */
  const hasFits = !!(p.fits && p.fits.length);
  const hasPrints = !!(p.prints && p.prints.length);
  const hasChart = !!p.sizeChart;

  const st = {
    color: p.initialColor || p.colors.filter(function (c) { return D.colorHasStock(p, c); })[0] || p.colors[0] || "",
    fit: hasFits ? p.fits[0] : "",
    print: hasPrints ? p.prints[0].id : "",
    size: "",
    qty: 1
  };

  function availableSizes(color) {
    return p.sizes.filter(function (s) { return D.stockOf(p, color, s) > 0; });
  }
  /* Conserva la talla si sigue con stock; si no, M; si no, la primera disponible */
  function pickSize() {
    const avail = availableSizes(st.color);
    if (st.size && avail.indexOf(st.size) > -1) return st.size;
    if (avail.indexOf("M") > -1) return "M";
    return avail[0] || "";
  }
  function stockNow() { return st.size ? D.stockOf(p, st.color, st.size) : 0; }
  function isAvailable() { return !p.soldOut && !!st.size; }

  st.size = pickSize();

  /* ------------------------------------------------------------------ */
  /* Cabecera de la información                                           */
  /* ------------------------------------------------------------------ */
  setMeta(p.name + SUFFIX, (p.desc ? p.desc + " " : "") + p.name + (p.collection ? " — colección " + p.collection : "") + ". Ropa con propósito cristiano, hecha en Colombia.");
  renderCrumbs(p.name);

  /* Sin colección no se muestra "Colección …" */
  $("#p-eyebrow").textContent = p.collection ? ("Colección " + p.collection).toUpperCase() : "";
  $("#p-eyebrow").hidden = !p.collection;
  if (p.rating > 0 || p.reviews > 0) {
    $("#p-rating").innerHTML =
      '<span class="stars" aria-hidden="true">' + [1, 2, 3, 4, 5].map(function () { return I("star", { size: 15 }); }).join("") + "</span>" +
      '<span class="rating__text">' + String(p.rating.toFixed(1)).replace(".", ",") + " (" + p.reviews + ")</span>";
    $("#p-rating").setAttribute("aria-label", "Calificación " + p.rating.toFixed(1).replace(".", ",") + " de 5, " + U.pluralize(p.reviews, "reseña", "reseñas"));
  } else {
    $("#p-rating").hidden = true;
  }
  $("#p-name").textContent = p.name;
  $("#p-price").textContent = money(p.price);
  if (p.desc) { $("#p-desc").textContent = p.desc; $("#p-desc").hidden = false; }

  /* ------------------------------------------------------------------ */
  /* Galería                                                              */
  /* ------------------------------------------------------------------ */
  const track = $("#gallery-track");
  const thumbsEl = $("#gallery-thumbs");
  const dotsEl = $("#gallery-dots");
  const galleryEl = $("#gallery");
  let N_SLIDES = 4;
  let VIDEO_INDEX = 3;
  let gi = 0;
  let lockUntil = 0;
  let shownPhotos = null;          /* fotos que muestra la galería ahora (para no rehacerla si el color comparte fotos) */

  /* Diapositivas: fotos del color (1–4) + video al final. Sin fotos (o showPhotos apagado): 3 degradados + video. */
  function galleryPlan(color) {
    const photos = M.config.stockPhotos ? D.photosFor(p, color) : [];
    const n = photos.length || 3;
    const slides = [];
    for (let i = 0; i < n; i++) slides.push({ index: i, variant: photos.length ? 0 : i, video: false });
    slides.push({ index: 0, variant: photos.length ? 0 : 3, video: true });
    return { photos: photos, slides: slides };
  }

  function renderGallery() {
    const plan = galleryPlan(st.color);
    shownPhotos = plan.photos;
    N_SLIDES = plan.slides.length;
    VIDEO_INDEX = N_SLIDES - 1;
    const hasVideo = !!(p.video && p.video.src);
    const slides = [];
    const thumbs = [];
    plan.slides.forEach(function (sl, v) {
      const base = { variant: sl.variant, index: sl.index, video: sl.video, color: st.color };
      const tile = U.tileHTML(p, Object.assign({ sub: v === 0, size: "large", eager: v === 0 }, base));
      const label = sl.video ? "Video" : "Foto " + (v + 1);
      slides.push(
        '<div class="gallery__slide" role="group" aria-roledescription="diapositiva" aria-label="' + (v + 1) + " de " + N_SLIDES + " · " + label + '">' +
        (sl.video
          ? '<button type="button" class="gallery__play" data-video aria-haspopup="dialog" aria-label="Reproducir video de ' + esc(p.name) + (hasVideo ? "" : " (próximamente)") + '">' + tile + "</button>"
          : tile) +
        "</div>"
      );
      thumbs.push(
        '<button type="button" class="gallery__thumb" data-go="' + v + '" aria-current="false" aria-label="' +
        (sl.video ? "Ver video, " + N_SLIDES + " de " + N_SLIDES : "Ver foto " + (v + 1) + " de " + N_SLIDES) + '">' +
        U.tileHTML(p, Object.assign({ size: "thumb", alt: "" }, base)) + "</button>"
      );
    });
    track.innerHTML = slides.join("");
    thumbsEl.innerHTML = thumbs.join("");
    dotsEl.innerHTML = new Array(N_SLIDES + 1).join('<span class="gallery__dot"></span>');
  }

  /* Al cambiar de color: si cambian las fotos, se rehace la galería y vuelve a la foto 1 */
  function refreshGalleryForColor() {
    const next = galleryPlan(st.color).photos;
    if (next === shownPhotos || (!next.length && !shownPhotos.length)) return;
    renderGallery();
    gi = 0;
    lockUntil = Date.now() + 120;
    track.scrollTo({ left: 0, behavior: "auto" });
    syncGallery();
  }

  function renderGalleryChrome() {
    $("#gallery-prev").innerHTML = I("chevron-left", { size: 22, stroke: 2 });
    $("#gallery-next").innerHTML = I("chevron-right", { size: 22, stroke: 2 });
    $("#gallery-video-icon").innerHTML = I("play", { size: 12 });

    const fav = S.favs.has(p.id);
    $("#gallery-fav-slot").innerHTML =
      '<button type="button" class="fav-btn gallery__fav" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="' +
      (fav ? "Quitar de favoritos" : "Guardar en favoritos") + ": " + esc(p.name) + '">' + I(fav ? "heart-fill" : "heart", { size: 22 }) + "</button>";
  }

  function syncGallery() {
    $$(".gallery__thumb", thumbsEl).forEach(function (b, i) { b.setAttribute("aria-current", String(i === gi)); });
    $$(".gallery__dot", dotsEl).forEach(function (d, i) { d.classList.toggle("is-on", i === gi); });
    $("#gallery-status").textContent = (gi === VIDEO_INDEX ? "Video" : "Foto " + (gi + 1)) + ", " + (gi + 1) + " de " + N_SLIDES;
  }

  function goTo(i, opts) {
    opts = opts || {};
    gi = ((i % N_SLIDES) + N_SLIDES) % N_SLIDES;
    if (opts.scroll !== false) {
      lockUntil = Date.now() + (reduceMotion ? 60 : 520);
      track.scrollTo({ left: gi * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    }
    syncGallery();
  }

  function syncFromScroll() {
    const w = track.clientWidth || 1;
    const i = Math.max(0, Math.min(N_SLIDES - 1, Math.round(track.scrollLeft / w)));
    if (i !== gi) { gi = i; syncGallery(); }
  }

  function bindGallery() {
    let raf = 0, timer = 0;
    track.addEventListener("scroll", function () {
      if (!raf) {
        raf = requestAnimationFrame(function () { raf = 0; if (Date.now() >= lockUntil) syncFromScroll(); });
      }
      clearTimeout(timer);
      timer = setTimeout(function settle() {
        if (Date.now() < lockUntil) { timer = setTimeout(settle, 80); return; }
        syncFromScroll();
      }, 160);
    }, { passive: true });

    window.addEventListener("resize", U.debounce(function () {
      track.scrollTo({ left: gi * track.clientWidth, behavior: "auto" });
    }, 120));

    thumbsEl.addEventListener("click", function (e) {
      const b = e.target.closest("[data-go]");
      if (b) goTo(parseInt(b.getAttribute("data-go"), 10));
    });
    $("#gallery-prev").addEventListener("click", function () { goTo(gi - 1); });
    $("#gallery-next").addEventListener("click", function () { goTo(gi + 1); });

    galleryEl.addEventListener("keydown", function (e) {
      if (e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(gi + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(gi - 1); }
      else if (e.key === "Home" && e.target === track) { e.preventDefault(); goTo(0); }
      else if (e.key === "End" && e.target === track) { e.preventDefault(); goTo(N_SLIDES - 1); }
    });

    galleryEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-video], #gallery-video")) openVideo();
    });
  }

  /* Video de la prenda (p.video): reproductor real; sin video, el aviso "Video próximamente" */
  function openVideo() {
    const v = p.video && p.video.src ? p.video : null;
    if (v) {
      const poster = U.safeUrl(v.poster);
      const el = U.infoModal("video-modal", p.name,
        '<div class="video-player"><video class="video-player__el" controls playsinline preload="metadata"' + (poster ? ' poster="' + esc(poster) + '"' : "") +
        ' src="' + esc(U.safeUrl(v.src)) + '" aria-label="Video de ' + esc(p.name) + '"></video></div>');
      const video = $("video", el);
      /* Al cerrar el modal se detiene el video */
      const stop = function (e) {
        if (e.detail && e.detail.el === el) { try { video.pause(); } catch (err) {} document.removeEventListener("mercy:overlay-close", stop); }
      };
      document.addEventListener("mercy:overlay-close", stop);
      if (!reduceMotion) { const q = video.play(); if (q && q.catch) q.catch(function () {}); }
      return;
    }
    U.infoModal("video-modal", p.name,
      '<div class="video-ph" role="img" aria-label="Video próximamente">' +
      '<div class="video-ph__bg">' + U.tileHTML(p, { variant: 2, index: 2, size: "large", alt: "", color: st.color }) + "</div>" +
      '<div class="video-ph__msg"><span class="video-ph__icon">' + I("play", { size: 34 }) + "</span>" +
      "<strong>Video próximamente</strong><span>Estamos preparando el video de esta prenda.</span></div></div>");
  }

  /* ------------------------------------------------------------------ */
  /* Selectores (Fit · Color · Estampado · Talla · Cantidad)               */
  /* ------------------------------------------------------------------ */
  const fitGroup = $("#fit-group"), colorGroup = $("#color-group"), printGroup = $("#print-group"), sizeGroup = $("#size-group");

  function renderSelectors() {
    if (hasFits) {
      $("#opt-fit").hidden = false;
      fitGroup.style.setProperty("--n", String(Math.min(3, p.fits.length)));
      fitGroup.innerHTML = p.fits.map(function (f) {
        return '<button type="button" class="fit-btn" role="radio" aria-checked="false" tabindex="-1" data-fit="' + esc(f) + '">' + esc(D.FITS[f]) + "</button>";
      }).join("");
    }
    colorGroup.innerHTML = p.colors.map(function (c) {
      const col = D.color(c);
      const has = D.colorHasStock(p, c);
      return '<button type="button" class="swatch-btn' + (has ? "" : " is-out") + '" role="radio" aria-checked="false" tabindex="-1" data-color="' + esc(c) + '"' +
        ' aria-label="' + esc(col.name) + (has ? "" : " (agotado)") + '" title="' + esc(col.name) + (has ? "" : " · agotado") + '">' +
        '<span class="swatch" style="--c:' + col.hex + '"></span></button>';
    }).join("");
    if (hasPrints) {
      $("#opt-print").hidden = false;
      printGroup.innerHTML = p.prints.map(function (x) {
        return '<button type="button" class="swatch-btn" role="radio" aria-checked="false" tabindex="-1" data-print="' + esc(x.id) + '"' +
          ' aria-label="' + esc(x.name) + '" title="' + esc(x.name) + '"><span class="swatch" style="--c:' + x.hex + '"></span></button>';
      }).join("");
    }
    sizeGroup.innerHTML = p.sizes.map(function (s) {
      return '<button type="button" class="size-btn" role="radio" aria-checked="false" tabindex="-1" data-size="' + esc(s) + '">' + esc(s) + "</button>";
    }).join("");

    if (hasChart) {
      const g = $("#size-guide-btn");
      g.innerHTML = I("ruler", { size: 16 }) + "<span>Guía de tallas</span>";
      g.hidden = false;
    }
    $("#qty-slot").innerHTML = U.stepperHTML(1);
    $("#add-btn").innerHTML = '<span class="add-btn__icon">' + I("cart", { size: 22 }) + '</span><span class="add-btn__label"></span>';
  }

  function setRadio(group, attr, value) {
    $$("[" + attr + "]", group).forEach(function (b) {
      const on = b.getAttribute(attr) === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function bindRadio(group, attr, onPick) {
    group.addEventListener("click", function (e) {
      const b = e.target.closest("[" + attr + "]");
      if (b && !b.disabled) onPick(b.getAttribute(attr));
    });
    group.addEventListener("keydown", function (e) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step && e.key !== "Home" && e.key !== "End") return;
      const btns = $$("[" + attr + "]:not([disabled])", group);
      if (!btns.length) return;
      e.preventDefault();
      let i = btns.indexOf(document.activeElement);
      if (e.key === "Home") i = 0;
      else if (e.key === "End") i = btns.length - 1;
      else i = (i + step + btns.length) % btns.length;
      btns[i].focus();
      onPick(btns[i].getAttribute(attr));
    });
  }

  function refreshSizes() {
    $$("[data-size]", sizeGroup).forEach(function (b) {
      const s = b.getAttribute("data-size");
      const out = D.stockOf(p, st.color, s) <= 0 || p.soldOut;
      b.disabled = out;
      b.classList.toggle("is-out", out);
      b.setAttribute("aria-label", out ? "Talla " + s + ", agotada" : "Talla " + s);
      if (out) b.title = "Agotada";
      else b.removeAttribute("title");
    });
    setRadio(sizeGroup, "data-size", st.size);
    if (!st.size) $$("[data-size]", sizeGroup).forEach(function (b) { b.tabIndex = -1; });
  }

  function renderStatus() {
    const ok = isAvailable();
    const stock = $("#p-stock");
    stock.className = "status__stock " + (ok ? "is-in" : "is-out");
    stock.innerHTML = ok
      ? '<span class="status__dot" aria-hidden="true"></span><span>En stock · listo para enviar</span>'
      : I("ban", { size: 17, cls: "status__ban" }) + "<span>No disponible</span>";

    const ship = $("#p-ship");
    ship.className = "status__ship " + (p.envioGratis ? "is-free" : "is-paid");
    ship.innerHTML = p.envioGratis
      ? I("truck", { size: 18 }) + "<span>Envío gratis incluido</span>"
      : I("truck", { size: 18 }) + "<span>Envío no incluido · se coordina por WhatsApp</span>";
  }

  function renderQty() {
    const stock = stockNow();
    const max = Math.max(1, stock);
    st.qty = Math.max(1, Math.min(st.qty, max));
    const wrap = $("[data-stepper]", $("#qty-slot"));
    $(".stepper__value", wrap).textContent = st.qty;
    const minus = $('[data-step="-1"]', wrap), plus = $('[data-step="1"]', wrap);
    const off = !isAvailable();
    minus.disabled = off || st.qty <= 1;
    plus.disabled = off || st.qty >= max;
    const hint = $("#qty-hint");
    hint.textContent = isAvailable() && stock <= 5 ? (stock === 1 ? "Queda 1 unidad" : "Quedan " + stock + " unidades") : "";
  }

  function ctaState() {
    if (p.soldOut) return { label: "Agotado", disabled: true };
    if (!st.size) return { label: "Agotado", disabled: false, soft: true };
    return { label: "Agregar al carrito", disabled: false };
  }

  function applyCta(btn) {
    const c = ctaState();
    $(".add-btn__label, .buybar__label", btn).textContent = c.label;
    btn.disabled = !!c.disabled;
    btn.classList.toggle("is-disabled", !!c.soft);
    if (c.soft) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
  }

  function renderCta() {
    applyCta($("#add-btn"));
    const bb = $("#buybar-add");
    if (bb) applyCta(bb);
  }

  function renderMeasures() {
    const box = $("#p-measures");
    if (!hasChart) {
      box.innerHTML = '<p class="measures__single">Talla única.</p>';
      return;
    }
    const fitName = st.fit ? D.FITS[st.fit] : "";
    const chart = D.SIZE_CHARTS[p.sizeChart];
    /* Unidad de la guía: "cm" (o sin guía) → centímetros; "" → sin unidad (p. ej. tallas numéricas) */
    const unit = !chart || chart.unit === "cm" ? "centímetros" : chart.unit;
    box.innerHTML =
      '<p class="measures__intro">Medidas de la prenda' + (unit ? " en " + esc(unit) : "") + (fitName ? ' para el fit <strong>' + esc(fitName) + "</strong>" : "") + ".</p>" +
      '<div class="table-scroll">' + M.layout.sizeTableHTML(p.sizeChart, st.fit) + "</div>" +
      M.layout.sizeNoteHTML("measures__note") +
      '<button type="button" class="link-arrow measures__guide" data-guide>Ver guía de tallas completa ' + I("arrow-right", { size: 16 }) + "</button>";
    markCurrentRow();
  }
  function markCurrentRow() {
    $$("#p-measures tbody tr").forEach(function (tr) {
      const th = $("th", tr);
      tr.classList.toggle("is-current", !!th && th.textContent.trim() === st.size);
    });
  }

  function update(what) {
    what = what || {};
    $("#color-label").innerHTML = "Color: <b>" + (st.color ? esc(D.color(st.color).name) : "—") + "</b>";
    setRadio(colorGroup, "data-color", st.color);
    if (hasFits) {
      $("#fit-label").innerHTML = "Fit: <b>" + esc(D.FITS[st.fit]) + "</b>";
      setRadio(fitGroup, "data-fit", st.fit);
    }
    if (hasPrints) {
      const pr = p.prints.filter(function (x) { return x.id === st.print; })[0];
      $("#print-label").innerHTML = "Estampado: <b>" + esc(pr ? pr.name : "") + "</b>";
      setRadio(printGroup, "data-print", st.print);
    }
    $("#size-label").innerHTML = "Talla: <b>" + (st.size ? esc(st.size) : "—") + "</b>";
    refreshSizes();
    renderStatus();
    renderQty();
    renderCta();
    if (what.measures !== false) markCurrentRow();
    clearMsg();
  }

  /* ------------------------------------------------------------------ */
  /* Agregar al carrito (C26/C27)                                         */
  /* ------------------------------------------------------------------ */
  const msgEl = $("#buy-msg");
  function showMsg(text) {
    msgEl.hidden = false;
    msgEl.innerHTML = I("info", { size: 18 }) + "<span></span>";
    $("span", msgEl).textContent = text;
  }
  function clearMsg() { msgEl.hidden = true; msgEl.textContent = ""; }

  const REASONS = {
    talla: "Elige una talla para agregar la prenda al carrito.",
    "sin-stock": "Esa talla está agotada en este color. Elige otra.",
    agotado: "Esta prenda está agotada por ahora.",
    color: "Elige un color disponible.",
    producto: "No pudimos encontrar la prenda. Intenta de nuevo."
  };

  function addToCart(fromBar) {
    if (p.soldOut) return;
    let r;
    if (!st.size) {
      r = { ok: false, reason: "color-agotado" };
    } else {
      r = S.cart.add({ id: p.id, color: st.color, fit: st.fit, size: st.size, print: st.print, qty: st.qty });
    }
    if (!r.ok) {
      const text = r.reason === "color-agotado"
        ? "Este color está agotado. Prueba con otro color."
        : (REASONS[r.reason] || "No pudimos agregar la prenda. Intenta de nuevo.");
      showMsg(text);
      if (fromBar) U.toast(text, { icon: "info" });
      else msgEl.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      return;
    }
    clearMsg();
    U.toast(r.capped ? "Agregamos las unidades disponibles" : "Agregada al carrito", { icon: "check", ms: 1800 });
    M.layout.openCart();
  }

  /* ------------------------------------------------------------------ */
  /* Contenido: acordeones, historia, reseñas, relacionados                */
  /* ------------------------------------------------------------------ */
  function renderContent() {
    $$("[data-chev]").forEach(function (n) { n.innerHTML = I("chevron-down", { size: 20 }); });

    $("#p-details").innerHTML = p.details.length
      ? '<ul class="bullet-list">' + p.details.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>"
      : "<p>Pronto sumaremos más detalles de esta prenda.</p>";
    $("#p-care").innerHTML = p.care.length
      ? '<ul class="bullet-list">' + p.care.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>"
      : "<p>Lava la prenda con cuidado, en agua fría y al revés.</p>";
    renderMeasures();
    $("#p-shipping").innerHTML =
      (D.SHIPPING_INFO.trim() ? "<p>" + U.rich(D.SHIPPING_INFO, { accent: false }) + "</p>" : "") +
      '<p class="ship-flag ' + (p.envioGratis ? "is-free" : "is-paid") + '">' + I("truck", { size: 18 }) +
      "<span>" + (p.envioGratis ? "Esta prenda incluye envío gratis." : "El envío de esta prenda no está incluido: se coordina por WhatsApp.") + "</span></p>";
    $("#p-returns").innerHTML = "<p>" + U.rich(D.RETURNS_INFO, { accent: false }) + "</p>";
    U.initAccordions($("#p-acc"));

    /* La historia del diseño (solo si el producto la tiene) */
    $("#story-text").textContent = p.story;
    $("#pdp-story").hidden = !p.story;

    /* Reseñas verificadas */
    $("#g-logo").innerHTML =
      '<svg class="g-logo" viewBox="0 0 48 48" width="32" height="32" role="img" aria-label="Google"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    $("#reviews-meta").textContent = p.reviews > 0 ? p.rating.toFixed(1).replace(".", ",") + " · " + U.pluralize(p.reviews, "reseña", "reseñas") + " en Google" : "";
    $("#reviews-grid").innerHTML = D.REVIEWS.slice(0, 3).map(function (r) {
      return (
        '<article class="review-card">' +
        '<div class="review-card__who"><span class="review-card__avatar" aria-hidden="true">' + esc(r.name.charAt(0).toUpperCase()) + "</span>" +
        '<span class="review-card__id"><strong>' + esc(r.name) + "</strong>" + (r.city ? "<span>" + esc(r.city) + "</span>" : "") + "</span></div>" +
        '<span class="stars" role="img" aria-label="' + r.stars + ' de 5 estrellas">' + new Array(r.stars + 1).join(I("star", { size: 16 })) + "</span>" +
        '<p class="review-card__text">' + esc(r.text) + "</p>" +
        '<span class="review-card__verified">' + I("check", { size: 14, stroke: 2.2 }) + " Compra verificada</span>" +
        "</article>"
      );
    }).join("");
    $("#pdp-reviews").hidden = !D.REVIEWS.length;          /* sin reseñas visibles no hay sección */

    /* También te puede gustar: misma categoría primero */
    const others = D.PRODUCTS.filter(function (x) { return x.id !== p.id; });
    const same = others.filter(function (x) { return x.category === p.category; }).sort(byRankInStockFirst);
    const rest = others.filter(function (x) { return x.category !== p.category; }).sort(byRankInStockFirst);
    renderCards(same.concat(rest).slice(0, 4), $("#related-list"));
    $("#pdp-related").hidden = !others.length;
  }

  /* ------------------------------------------------------------------ */
  /* Barra pegajosa móvil                                                  */
  /* ------------------------------------------------------------------ */
  function setupBuybar() {
    if (p.soldOut) return;
    const bar = $("#buybar");
    bar.innerHTML =
      '<div class="buybar__info"><span class="buybar__name">' + esc(p.name) + '</span><span class="buybar__price">' + money(p.price) + "</span></div>" +
      '<button type="button" class="btn btn--dark buybar__btn" id="buybar-add">' + I("cart", { size: 20 }) + '<span class="buybar__label"></span></button>';
    document.body.classList.add("pdp-has-bar");
    applyCta($("#buybar-add"));
    $("#buybar-add").addEventListener("click", function () { addToCart(true); });
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (entries) {
      const e = entries[0];
      const show = !e.isIntersecting && e.boundingClientRect.top < 72;
      bar.classList.toggle("is-on", show);
      if (show) bar.removeAttribute("inert"); else bar.setAttribute("inert", "");
      document.body.classList.toggle("pdp-bar-on", show);
    }, { threshold: 0, rootMargin: "-72px 0px 0px 0px" }).observe($("#add-btn"));
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                              */
  /* ------------------------------------------------------------------ */
  renderGallery();
  renderGalleryChrome();
  renderSelectors();
  renderContent();
  bindGallery();

  bindRadio(fitGroup, "data-fit", function (v) {
    st.fit = v;
    update();
    renderMeasures();
  });
  bindRadio(colorGroup, "data-color", function (v) {
    st.color = v;
    st.size = pickSize();
    update();
    refreshGalleryForColor();          /* fotos del color elegido */
  });
  bindRadio(printGroup, "data-print", function (v) { st.print = v; update(); });
  bindRadio(sizeGroup, "data-size", function (v) { st.size = v; update(); });

  $("#qty-slot").addEventListener("click", function (e) {
    const b = e.target.closest("[data-step]");
    if (!b || b.disabled) return;
    st.qty += parseInt(b.getAttribute("data-step"), 10);
    renderQty();
    clearMsg();
  });

  $("#size-guide-btn").addEventListener("click", function () { M.layout.openSizeGuide(p.sizeChart, st.fit); });
  $("#p-measures").addEventListener("click", function (e) {
    if (e.target.closest("[data-guide]")) M.layout.openSizeGuide(p.sizeChart, st.fit);
  });
  $("#add-btn").addEventListener("click", function () { addToCart(false); });

  $("#pdp").hidden = false;
  update();
  goTo(0, { scroll: false });
  setupBuybar();
})();
