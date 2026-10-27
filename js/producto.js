/* ==========================================================================
   Mercy Studio — producto.js
   Pantalla de detalle de producto:  producto.html?id=<id>[&color=<id>&print=<id>&fit=<id>]
   (color / print / fit válidos fijan la variante con la que abre: enlaces del carrito y del checkout; print y fit solo
   si ese color los lleva). Cada color tiene sus estampados: el selector «Estampado» muestra los del color elegido y no
   sale si ese color no lleva ninguno. Cada color viene en sus hormas: con un fit elegido, los colores que no vienen en
   él salen tachados y no se pueden elegir (al cambiar a un fit en que no viene el color elegido, pasa al primero que sí).
   Comentarios aplicados: C23/C24 (stock / no disponible), C25 (etiqueta de color
   encima), C26/C27 (solo "Agregar al carrito"), C28 (acordeones ítem por ítem +
   Medidas/Tallas), C32/C34 (envío), C43 (tachón diagonal), C44 (carrito overlay).
   Galería: fotos (hasta 10) de la combinación COLOR + ESTAMPADO elegida o, si no tiene, las del
   color (Mercy.data.photosFor; no se mezclan ni se toman de otro color) + diapositiva de video al final SOLO si la
   prenda tiene video. Se rehace al cambiar de color o de estampado si cambia el juego de fotos.
   Sin fotos: 3 degradados (+ video si lo hay). Con una sola diapositiva no hay flechas, puntos
   ni miniaturas.
   ========================================================================== */
(function () {
  "use strict";

  const M = window.Mercy;
  const U = M.ui, D = M.data, S = M.store, I = M.icons.svg;
  const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;

  const SUFFIX = " — " + M.config.brand;
  const tx = U.tx;
  /* Insignia «Compra verificada» de cada reseña (texts.product.verifiedLabel): vacío = sin insignia */
  const VERIFIED = (function () { const t = M.content && M.content.texts && M.content.texts.product; const v = t ? t.verifiedLabel : undefined; return v == null ? "Compra verificada" : String(v).trim(); })();
  function verifiedHTML() { return VERIFIED ? '<span class="review-card__verified">' + I("check", { size: 14, stroke: 2.2 }) + " " + esc(VERIFIED) + "</span>" : ""; }
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
  const hasChart = !!p.sizeChart;

  /* Estampado válido para un color: el pedido si ese color lo lleva; si no, su primero ("" = el color no lleva) */
  function printFor(color, want) {
    const list = D.printsOf(p, color);
    return list.some(function (x) { return x.id === want; }) ? want : (list.length ? list[0].id : "");
  }

  /* Fit válido para un color: el pedido si ese color viene en él; si no, su primero ("" = la prenda no tiene hormas) */
  function fitFor(color, want) {
    const list = D.fitsOf(p, color);
    return list.indexOf(want) > -1 ? want : (list[0] || "");
  }
  function colorHasFit(color, fit) { return !fit || D.fitsOf(p, color).indexOf(fit) > -1; }

  /* Variante pedida en la dirección (?color=&print=&fit=, p. ej. desde el carrito): solo si existe en la prenda */
  const askColor = U.qs().get("color"), askPrint = U.qs().get("print"), askFit = U.qs().get("fit");
  const startColor = askColor && p.colors.indexOf(askColor) > -1 ? askColor
    : p.initialColor || p.colors.filter(function (c) { return D.colorHasStock(p, c); })[0] || p.colors[0] || "";
  const st = {
    color: startColor,
    fit: fitFor(startColor, askFit),
    print: printFor(startColor, askPrint),
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
  setMeta(p.name + SUFFIX, (p.desc ? p.desc + " " : "") + p.name + (p.collection ? " — colección " + p.collection : "") + ". " + U.fill(tx("product.metaSuffix", "Ropa con propósito cristiano, hecha en Colombia.")));
  renderCrumbs(p.name);

  /* Sin colección no se muestra "Colección …" */
  $("#p-eyebrow").textContent = p.collection ? (tx("product.collectionLabel", "Colección") + " " + p.collection).toUpperCase() : "";
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
  const HAS_VIDEO = !!(p.video && p.video.src);
  let N_SLIDES = 4;
  let VIDEO_INDEX = -1;            /* -1 = sin diapositiva de video (la prenda no tiene) */
  let gi = 0;
  let lockUntil = 0;
  let shownKey = null;             /* juego de fotos que muestra la galería ahora (para no rehacerla si no cambia) */
  let shownPhotos = [];            /* esas fotos (las abre el visor «Ver foto completa») */
  const expandBtn = $("#gallery-expand");

  /* Diapositivas: fotos del color + estampado (hasta 10) + video al final si lo hay.
     Sin fotos (o showPhotos apagado): 3 degradados (+ video si lo hay). */
  function galleryPlan(color, print) {
    const photos = M.config.stockPhotos ? D.photosFor(p, color, print) : [];
    const n = photos.length || 3;
    const slides = [];
    for (let i = 0; i < n; i++) slides.push({ index: i, variant: photos.length ? 0 : i, video: false });
    if (HAS_VIDEO) slides.push({ index: 0, variant: photos.length ? 0 : 3, video: true });
    return { photos: photos, slides: slides };
  }
  /* Clave del juego de fotos por CONTENIDO (dos variantes pueden traer fotos iguales en listas distintas) */
  function photosKey(photos) {
    return photos.map(function (ph) { return [ph.src, ph.zoom, ph.ox, ph.oy, ph.fit].join("|"); }).join("\n");
  }

  function renderGallery() {
    const plan = galleryPlan(st.color, st.print);
    shownKey = photosKey(plan.photos);
    shownPhotos = plan.photos;
    N_SLIDES = plan.slides.length;
    VIDEO_INDEX = HAS_VIDEO ? N_SLIDES - 1 : -1;
    const slides = [];
    const thumbs = [];
    plan.slides.forEach(function (sl, v) {
      const base = { variant: sl.variant, index: sl.index, video: sl.video, color: st.color, print: st.print };
      const tile = U.tileHTML(p, Object.assign({ sub: v === 0, size: "large", eager: v === 0 }, base));
      const label = sl.video ? "Video" : "Foto " + (v + 1);
      slides.push(
        '<div class="gallery__slide" role="group" aria-roledescription="diapositiva" aria-label="' + (v + 1) + " de " + N_SLIDES + " · " + label + '">' +
        (sl.video
          ? '<button type="button" class="gallery__play" data-video aria-haspopup="dialog" aria-label="Reproducir video de ' + esc(p.name) + '">' + tile + "</button>"
          /* Foto real: tocarla abre el visor. Fuera del orden de tabulación (con teclado: botón «Ver foto completa» o Enter en el carrusel) */
          : plan.photos.length
            ? '<button type="button" class="gallery__zoom" data-zoom="' + v + '" tabindex="-1" aria-haspopup="dialog" aria-label="Ver foto ' + (v + 1) + ' completa">' + tile + "</button>"
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

    /* Una sola diapositiva (1 foto, sin video): sin flechas, puntos ni miniaturas, y el escenario deja de ser carrusel */
    const single = N_SLIDES <= 1;
    $("#gallery-prev").hidden = single;
    $("#gallery-next").hidden = single;
    dotsEl.hidden = single;
    thumbsEl.hidden = single;
    galleryEl.classList.toggle("is-single", single);
    if (single) galleryEl.removeAttribute("aria-roledescription"); else galleryEl.setAttribute("aria-roledescription", "carrusel");
    track.tabIndex = single ? -1 : 0;
    track.setAttribute("aria-label", (HAS_VIDEO ? "Fotos y video de la prenda" : "Fotos de la prenda") + (single ? "" : ". Usa las flechas del teclado para cambiar.") +
      (plan.photos.length && !single ? " Enter abre la foto completa." : ""));
  }

  /* Al cambiar de color o de estampado: si cambia el juego de fotos, se rehace la galería y vuelve a la foto 1 */
  function refreshGallery() {
    const next = galleryPlan(st.color, st.print).photos;
    if ((!next.length && !shownKey) || photosKey(next) === shownKey) return;
    renderGallery();
    gi = 0;
    lockUntil = Date.now() + 120;
    track.scrollTo({ left: 0, behavior: "auto" });
    thumbsEl.scrollTo({ left: 0, top: 0, behavior: "auto" });
    /* Si había un desplazamiento suave en curso (flecha, miniatura…), Chrome puede dejar el track a medio camino entre
       dos fotos: se repite el reinicio en el siguiente cuadro (el bloqueo de 120 ms lo cubre) */
    requestAnimationFrame(function () {
      track.scrollTo({ left: 0, behavior: "auto" });
      thumbsEl.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
    syncGallery();
  }

  function renderGalleryChrome() {
    $("#gallery-prev").innerHTML = I("chevron-left", { size: 22, stroke: 2 });
    $("#gallery-next").innerHTML = I("chevron-right", { size: 22, stroke: 2 });
    expandBtn.innerHTML = I("expand", { size: 20, stroke: 2 });
    /* Chip «Ver video»: solo si la prenda tiene video */
    $("#gallery-video").hidden = !HAS_VIDEO;
    if (HAS_VIDEO) $("#gallery-video-icon").innerHTML = I("play", { size: 12 });

    const fav = S.favs.has(p.id);
    $("#gallery-fav-slot").innerHTML =
      '<button type="button" class="fav-btn gallery__fav" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="' +
      (fav ? "Quitar de favoritos" : "Guardar en favoritos") + ": " + esc(p.name) + '">' + I(fav ? "heart-fill" : "heart", { size: 22 }) + "</button>";
  }

  /* Mantiene la miniatura activa a la vista DENTRO de su contenedor (columna con scroll en escritorio, fila en móvil).
     Se calcula el desplazamiento del contenedor a mano: scrollIntoView podría mover también la página. */
  function revealThumb(smooth) {
    const b = thumbsEl.children[gi];
    if (!b || thumbsEl.hidden) return;
    const c = thumbsEl.getBoundingClientRect(), r = b.getBoundingClientRect();
    if (!c.width && !c.height) return;
    const cs = getComputedStyle(thumbsEl);
    const pad = function (side) { return parseFloat(cs["padding" + side]) || 0; };
    /* Posición del botón dentro del contenido desplazable */
    const x = r.left - c.left - thumbsEl.clientLeft + thumbsEl.scrollLeft;
    const y = r.top - c.top - thumbsEl.clientTop + thumbsEl.scrollTop;
    let left = thumbsEl.scrollLeft, top = thumbsEl.scrollTop;
    if (x < left + pad("Left")) left = x - pad("Left");
    else if (x + r.width > left + thumbsEl.clientWidth - pad("Right")) left = x + r.width - thumbsEl.clientWidth + pad("Right");
    if (y < top + pad("Top")) top = y - pad("Top");
    else if (y + r.height > top + thumbsEl.clientHeight - pad("Bottom")) top = y + r.height - thumbsEl.clientHeight + pad("Bottom");
    left = Math.max(0, Math.min(left, thumbsEl.scrollWidth - thumbsEl.clientWidth));
    top = Math.max(0, Math.min(top, thumbsEl.scrollHeight - thumbsEl.clientHeight));
    if (Math.abs(left - thumbsEl.scrollLeft) < 1 && Math.abs(top - thumbsEl.scrollTop) < 1) return;
    thumbsEl.scrollTo({ left: left, top: top, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
  }

  function syncGallery() {
    $$(".gallery__thumb", thumbsEl).forEach(function (b, i) { b.setAttribute("aria-current", String(i === gi)); });
    $$(".gallery__dot", dotsEl).forEach(function (d, i) { d.classList.toggle("is-on", i === gi); });
    $("#gallery-status").textContent = (gi === VIDEO_INDEX ? "Video" : "Foto " + (gi + 1)) + ", " + (gi + 1) + " de " + N_SLIDES;
    expandBtn.hidden = !shownPhotos.length || gi === VIDEO_INDEX;   /* degradados o video: no hay foto que ampliar */
    revealThumb(true);
  }

  function goTo(i, opts) {
    opts = opts || {};
    const from = gi;
    gi = ((i % N_SLIDES) + N_SLIDES) % N_SLIDES;
    if (opts.scroll !== false) {
      /* El desplazamiento suave dura más cuanto más lejos va (hasta ~1,4 s con 10 fotos + video): el bloqueo crece con
         la distancia para que el scroll intermedio no marque fotos de paso (estado aria, puntos, miniatura activa) */
      lockUntil = Date.now() + (reduceMotion ? 60 : Math.min(1800, 420 + 110 * Math.abs(gi - from)));
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
    /* Fin real del desplazamiento (navegadores con scrollend): si llegó a la foto destino se suelta el bloqueo en seguida;
       si se interrumpió a medio camino, sigue el bloqueo y lo resuelve el temporizador de arriba */
    track.addEventListener("scrollend", function () {
      if (Date.now() < lockUntil && Math.round(track.scrollLeft / (track.clientWidth || 1)) !== gi) return;
      lockUntil = 0;
      syncFromScroll();
    }, { passive: true });

    window.addEventListener("resize", U.debounce(function () {
      track.scrollTo({ left: gi * track.clientWidth, behavior: "auto" });
      revealThumb(false);             /* la columna pasa a fila (o al revés) al cruzar 900 px */
    }, 120));

    thumbsEl.addEventListener("click", function (e) {
      const b = e.target.closest("[data-go]");
      if (b) goTo(parseInt(b.getAttribute("data-go"), 10));
    });
    $("#gallery-prev").addEventListener("click", function () { goTo(gi - 1); });
    $("#gallery-next").addEventListener("click", function () { goTo(gi + 1); });

    galleryEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target === track && shownPhotos.length && gi !== VIDEO_INDEX) { e.preventDefault(); openViewer(gi); return; }
      if (N_SLIDES <= 1 || e.target.closest("input, textarea, select")) return;   /* una sola foto: nada que recorrer */
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(gi + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(gi - 1); }
      else if (e.key === "Home" && e.target === track) { e.preventDefault(); goTo(0); }
      else if (e.key === "End" && e.target === track) { e.preventDefault(); goTo(N_SLIDES - 1); }
    });

    galleryEl.addEventListener("click", function (e) {
      const z = e.target.closest("[data-zoom]");
      if (z) { openViewer(parseInt(z.getAttribute("data-zoom"), 10)); return; }
      if (e.target.closest("#gallery-expand")) { openViewer(gi); return; }
      if (HAS_VIDEO && e.target.closest("[data-video], #gallery-video")) openVideo();
    });
  }

  /* Video de la prenda (p.video): reproductor real. Sin video no hay diapositiva ni chip que lo abran. */
  function openVideo() {
    const v = HAS_VIDEO ? p.video : null;
    if (!v) return;
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
  }

  /* ------------------------------------------------------------------ */
  /* Visor «Ver foto completa»                                             */
  /* La galería llena su marco (recorta las fotos muy altas o anchas); el visor muestra la foto ENTERA a pantalla
     completa. Flechas, teclado o deslizar para pasar de foto; clic (mouse), doble toque, rueda o pellizco para
     acercar; arrastrar para mover la foto acercada; deslizar hacia abajo, Esc o «Cerrar» para salir. */
  /* ------------------------------------------------------------------ */
  const MAX_ZOOM = 4;
  let viewer = null;
  let vPhotos = [], vi = 0;
  let zs = 1, zx = 0, zy = 0;      /* acercamiento y desplazamiento (px desde el centro) de la foto del visor */

  function buildViewer() {
    const el = U.createModal({
      id: "photo-viewer", cls: "modal--viewer", label: "Fotos de " + p.name,
      html:
        '<div class="viewer">' +
          '<div class="viewer__stage"><img class="viewer__img" alt="" decoding="async" draggable="false"></div>' +
          '<div class="viewer__bar">' +
            '<p class="viewer__count" aria-live="polite"></p>' +
            '<button type="button" class="viewer__btn" data-vzoom aria-pressed="false" aria-label="Acercar"></button>' +
            '<button type="button" class="viewer__btn" data-close data-autofocus aria-label="Cerrar">' + I("close", { size: 24 }) + "</button>" +
          "</div>" +
          '<button type="button" class="viewer__nav viewer__nav--prev" data-vgo="-1" aria-label="Foto anterior">' + I("chevron-left", { size: 26, stroke: 2 }) + "</button>" +
          '<button type="button" class="viewer__nav viewer__nav--next" data-vgo="1" aria-label="Foto siguiente">' + I("chevron-right", { size: 26, stroke: 2 }) + "</button>" +
        "</div>"
    });
    const stage = $(".viewer__stage", el), img = $(".viewer__img", el), zoomBtn = $("[data-vzoom]", el), count = $(".viewer__count", el);

    function clamp() {
      zs = Math.max(1, Math.min(MAX_ZOOM, zs));
      if (zs === 1) { zx = 0; zy = 0; return; }
      const mx = Math.max(0, (img.offsetWidth * zs - stage.clientWidth) / 2);
      const my = Math.max(0, (img.offsetHeight * zs - stage.clientHeight) / 2);
      zx = Math.max(-mx, Math.min(mx, zx));
      zy = Math.max(-my, Math.min(my, zy));
    }
    function apply(anim) {
      clamp();
      img.classList.toggle("is-anim", !!anim && !reduceMotion);
      img.style.transform = zs === 1 ? "" : "translate(" + zx + "px, " + zy + "px) scale(" + zs + ")";
      stage.classList.toggle("is-zoomed", zs > 1);
      const on = zs > 1;
      if (zoomBtn.getAttribute("aria-pressed") !== String(on) || !zoomBtn.firstChild) {
        zoomBtn.setAttribute("aria-pressed", String(on));
        zoomBtn.setAttribute("aria-label", on ? "Alejar" : "Acercar");
        zoomBtn.innerHTML = I(on ? "minus" : "plus", { size: 22 });
      }
    }
    /* Acerca a `s` dejando quieto el punto (cx, cy) de la pantalla (la foto está centrada en el escenario) */
    function zoomAt(s, cx, cy, anim) {
      const r = stage.getBoundingClientRect();
      const px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2);
      const k = Math.max(1, Math.min(MAX_ZOOM, s)) / zs;
      zx = px - (px - zx) * k;
      zy = py - (py - zy) * k;
      zs *= k;
      apply(anim);
    }
    function zoomCenter(s, anim) {
      const r = stage.getBoundingClientRect();
      zoomAt(s, r.left + r.width / 2, r.top + r.height / 2, anim);
    }
    function toggleZoom(cx, cy) {
      if (zs > 1) { zs = 1; apply(true); } else zoomAt(2.5, cx, cy, true);
    }

    function show(i) {
      const n = vPhotos.length;
      vi = ((i % n) + n) % n;
      const ph = vPhotos[vi];
      zs = 1;
      img.classList.add("is-loading");
      img.onload = img.onerror = function () { img.classList.remove("is-loading"); };
      img.src = U.safeUrl(D.photoUrl(ph, 2000));
      if (img.complete) img.classList.remove("is-loading");
      img.alt = ph.alt || p.name + ", foto " + (vi + 1) + " de " + n;
      count.innerHTML = n > 1 ? '<span aria-hidden="true">' + (vi + 1) + " / " + n + '</span><span class="visually-hidden">Foto ' + (vi + 1) + " de " + n + "</span>" : "";
      $$(".viewer__nav", el).forEach(function (b) { b.hidden = n <= 1; });
      apply();
      /* Las vecinas se piden de antemano para que pasar de foto no espere a la red */
      if (n > 1) [vi + 1, vi - 1].forEach(function (j) { const q = vPhotos[(j + n) % n]; if (q) (new Image()).src = U.safeUrl(D.photoUrl(q, 2000)); });
    }
    function close() { U.overlay.close(el); }

    el.addEventListener("click", function (e) {
      const go = e.target.closest("[data-vgo]");
      if (go) show(vi + parseInt(go.getAttribute("data-vgo"), 10));
      else if (e.target.closest("[data-vzoom]")) zoomCenter(zs > 1 ? 1 : 2.5, true);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" && vPhotos.length > 1) { e.preventDefault(); show(vi + 1); }
      else if (e.key === "ArrowLeft" && vPhotos.length > 1) { e.preventDefault(); show(vi - 1); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomCenter(zs * 1.5, true); }
      else if (e.key === "-") { e.preventDefault(); zoomCenter(zs / 1.5, true); }
    });
    /* Rueda del mouse / pellizco del trackpad (llega como rueda con ctrlKey) */
    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomAt(zs * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY);
    }, { passive: false });

    /* Punteros: 1 dedo = deslizar (sin acercar) o mover (acercada); 2 dedos = pellizco; toque doble = acercar/alejar */
    const pts = new Map();
    let drag = null, pinch = null, lastTap = 0, lastX = 0, lastY = 0;
    const two = function () { const a = Array.from(pts.values()); return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; };
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const t = two(); pinch = { d: t.d, s: zs, x: t.x, y: t.y }; drag = null; img.style.translate = ""; }
      else if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, zx: zx, zy: zy, moved: false, type: e.pointerType };
    });
    stage.addEventListener("pointermove", function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const t = two();
        zx += t.x - pinch.x; zy += t.y - pinch.y; pinch.x = t.x; pinch.y = t.y;   /* el centro del pellizco arrastra */
        zoomAt(pinch.s * t.d / pinch.d, t.x, t.y);
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      if (zs > 1) { zx = drag.zx + dx; zy = drag.zy + dy; apply(); }
      else if (drag.type !== "mouse") img.style.translate = (Math.abs(dx) >= Math.abs(dy) ? dx + "px 0" : "0 " + Math.max(0, dy) + "px");   /* sigue al dedo */
    });
    function release(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pinch) {
        if (pts.size < 2) pinch = null;
        /* El dedo que queda sigue moviendo la foto (sin contar como deslizar ni como toque) */
        if (pts.size === 1) { const q = Array.from(pts.values())[0]; drag = { x: q.x, y: q.y, zx: zx, zy: zy, moved: true, type: "touch", afterPinch: true }; }
        return;
      }
      const d = drag;
      drag = null;
      img.style.translate = "";
      if (!d || e.type === "pointercancel") return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (d.moved) {
        if (zs > 1 || d.afterPinch || d.type === "mouse") return;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (vPhotos.length > 1) show(vi + (dx < 0 ? 1 : -1)); }
        else if (dy > 90 && dy > Math.abs(dx)) close();
        return;
      }
      if (d.type === "mouse") {
        /* Mouse: clic en la foto = acercar/alejar; clic en el fondo sin acercar = cerrar */
        if (e.target === img) toggleZoom(e.clientX, e.clientY);
        else if (zs === 1) close();
        return;
      }
      const now = Date.now();
      if (now - lastTap < 320 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 30) { lastTap = 0; toggleZoom(e.clientX, e.clientY); return; }
      lastTap = now; lastX = e.clientX; lastY = e.clientY;
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);

    window.addEventListener("resize", U.debounce(function () { if (U.overlay.isOpen(el)) apply(); }, 120));
    return { el: el, show: show };
  }

  function openViewer(i) {
    if (!shownPhotos.length || i < 0 || i >= shownPhotos.length) return;
    if (!viewer) viewer = buildViewer();
    vPhotos = shownPhotos.slice();
    const fromSlide = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-zoom]");
    U.overlay.open(viewer.el, {
      /* Al cerrar, la galería queda en la última foto vista (sin animación) */
      onClose: function () {
        if (vi !== gi && vi < N_SLIDES && vi !== VIDEO_INDEX) {
          gi = vi;
          lockUntil = Date.now() + 120;
          track.scrollTo({ left: gi * track.clientWidth, behavior: "auto" });
          syncGallery();
          const b = fromSlide && track.children[gi] && track.children[gi].querySelector("[data-zoom]");
          if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
        }
      }
    });
    viewer.show(i);
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
    /* Etiquetas y tachado de cada color: refreshColors (dependen del fit elegido) */
    colorGroup.innerHTML = p.colors.map(function (c) {
      return '<button type="button" class="swatch-btn" role="radio" aria-checked="false" tabindex="-1" data-color="' + esc(c) + '">' +
        '<span class="swatch" style="--c:' + D.color(c).hex + '"></span></button>';
    }).join("");
    renderPrints();
    sizeGroup.innerHTML = p.sizes.map(function (s) {
      return '<button type="button" class="size-btn" role="radio" aria-checked="false" tabindex="-1" data-size="' + esc(s) + '">' + esc(s) + "</button>";
    }).join("");

    if (hasChart) {
      const g = $("#size-guide-btn");
      g.innerHTML = I("ruler", { size: 16 }) + "<span>" + esc(tx("help.sizeGuide", "Guía de tallas")) + "</span>";
      g.hidden = false;
    }
    $("#qty-slot").innerHTML = U.stepperHTML(1);
    $("#add-btn").innerHTML = '<span class="add-btn__icon">' + I("cart", { size: 22 }) + '</span><span class="add-btn__label"></span>';
  }

  /* Estampados del color elegido (se rehace al cambiar de color); sin ninguno, el selector no se muestra */
  function renderPrints() {
    const list = D.printsOf(p, st.color);
    $("#opt-print").hidden = !list.length;
    printGroup.innerHTML = list.map(function (x) {
      return '<button type="button" class="swatch-btn" role="radio" aria-checked="false" tabindex="-1" data-print="' + esc(x.id) + '"' +
        ' aria-label="' + esc(x.name) + '" title="' + esc(x.name) + '"><span class="swatch" style="--c:' + x.hex + '"></span></button>';
    }).join("");
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

  /* Colores: agotado = tachado pero se puede elegir (para ver sus fotos); no viene en el fit elegido = tachado y
     deshabilitado, con un aviso debajo (p. ej. «Rojo Burdeo no viene en fit Oversize.») */
  function refreshColors() {
    const fitName = st.fit ? D.FITS[st.fit] : "";
    const missing = [];
    $$("[data-color]", colorGroup).forEach(function (b) {
      const c = b.getAttribute("data-color");
      const name = D.color(c).name;
      const na = !colorHasFit(c, st.fit);
      const out = !D.colorHasStock(p, c);
      if (na) missing.push(name);
      b.disabled = na;
      b.classList.toggle("is-out", na || out);
      const why = na ? "no viene en fit " + fitName : out ? "agotado" : "";
      b.setAttribute("aria-label", name + (why ? " (" + why + ")" : ""));
      b.title = name + (why ? " · " + why : "");
    });
    setRadio(colorGroup, "data-color", st.color);
    const hint = $("#color-hint");
    hint.hidden = !missing.length;
    hint.textContent = missing.length
      ? (missing.length === 1 ? missing[0] + " no viene" : missing.slice(0, -1).join(", ") + " y " + missing[missing.length - 1] + " no vienen") + " en fit " + fitName + "."
      : "";
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
      ? '<span class="status__dot" aria-hidden="true"></span><span>' + esc(tx("product.stockIn", "En stock · listo para enviar")) + "</span>"
      : I("ban", { size: 17, cls: "status__ban" }) + "<span>" + esc(tx("product.stockOut", "No disponible")) + "</span>";

    const ship = $("#p-ship");
    ship.className = "status__ship " + (p.envioGratis ? "is-free" : "is-paid");
    ship.innerHTML = p.envioGratis
      ? I("truck", { size: 18 }) + "<span>" + esc(tx("shipping.productFree", "Envío gratis incluido")) + "</span>"
      : I("truck", { size: 18 }) + "<span>" + esc(tx("shipping.productPaid", "Envío no incluido · se coordina por WhatsApp")) + "</span>";
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
    hint.textContent = isAvailable() && stock <= 5 ? (stock === 1 ? tx("product.lowStockOne", "Queda 1 unidad") : U.vars(tx("product.lowStockMany", "Quedan {n} unidades"), { n: stock })) : "";
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
      '<button type="button" class="link-arrow measures__guide" data-guide>' + esc(tx("product.sizeGuideLink", "Ver guía de tallas completa")) + " " + I("arrow-right", { size: 16 }) + "</button>";
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
    refreshColors();
    if (hasFits) {
      $("#fit-label").innerHTML = "Fit: <b>" + esc(D.FITS[st.fit]) + "</b>";
      setRadio(fitGroup, "data-fit", st.fit);
    }
    const pr = D.printsOf(p, st.color).filter(function (x) { return x.id === st.print; })[0];
    if (pr) {
      $("#print-label").innerHTML = "Estampado: <b>" + esc(pr.name) + "</b>";
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
    /* El stock es por color × talla: otras líneas del carrito (otro estampado u horma) ya tienen todas las unidades */
    tope: "Ya tienes en el carrito todas las unidades disponibles de esta talla en este color.",
    agotado: "Esta prenda está agotada por ahora.",
    color: "Elige un color disponible.",
    horma: "Ese color no viene en el fit elegido. Elige otro color u otro fit.",
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

    /* Títulos administrables de la ficha (texts.product / texts.help) */
    const setT = function (sel, t) { const n = $(sel); if (n) n.textContent = t; };
    setT("#acc-detalles-h > span:first-child", tx("product.detailsTitle", "Detalles"));
    setT("#acc-cuidados-h > span:first-child", tx("product.careTitle", "Cuidados de la prenda"));
    setT("#acc-medidas-h > span:first-child", tx("product.sizesTitle", "Medidas / Tallas"));
    setT("#acc-envios-h > span:first-child", tx("help.shipping", "Envíos"));
    setT("#acc-cambios-h > span:first-child", tx("help.returns", "Cambios y devoluciones"));
    setT("#story-title", tx("product.storyTitle", "La historia del diseño"));
    setT("#reviews-title", tx("product.reviewsTitle", "Reseñas verificadas"));
    setT("#related-title", tx("product.relatedTitle", "También te puede gustar"));
    setT("#gallery-video > span:last-child", tx("product.videoChip", "Ver video"));

    $("#p-details").innerHTML = p.details.length
      ? '<ul class="bullet-list">' + p.details.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>"
      : "<p>" + esc(tx("product.detailsEmpty", "Pronto sumaremos más detalles de esta prenda.")) + "</p>";
    $("#p-care").innerHTML = p.care.length
      ? '<ul class="bullet-list">' + p.care.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>"
      : "<p>" + esc(tx("product.careEmpty", "Lava la prenda con cuidado, en agua fría y al revés.")) + "</p>";
    renderMeasures();
    $("#p-shipping").innerHTML =
      (D.SHIPPING_INFO.trim() ? "<p>" + U.rich(D.SHIPPING_INFO, { accent: false }) + "</p>" : "") +
      '<p class="ship-flag ' + (p.envioGratis ? "is-free" : "is-paid") + '">' + I("truck", { size: 18 }) +
      "<span>" + esc(p.envioGratis ? tx("shipping.detailFree", "Esta prenda incluye envío gratis.") : tx("shipping.detailPaid", "El envío de esta prenda no está incluido: se coordina por WhatsApp.")) + "</span></p>";
    $("#p-returns").innerHTML = "<p>" + U.rich(D.RETURNS_INFO, { accent: false }) + "</p>";
    U.initAccordions($("#p-acc"));

    /* La historia del diseño (solo si el producto la tiene) */
    $("#story-text").textContent = p.story;
    $("#pdp-story").hidden = !p.story;

    /* Reseñas verificadas */
    $("#g-logo").innerHTML =
      '<svg class="g-logo" viewBox="0 0 48 48" width="32" height="32" role="img" aria-label="Google"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    const src = tx("product.reviewsSource", "reseñas en Google");
    $("#reviews-meta").textContent = p.reviews > 0 ? p.rating.toFixed(1).replace(".", ",") + " · " + U.thousands(p.reviews) + " " + (p.reviews === 1 ? src.replace(/^reseñas\b/i, "reseña") : src) : "";
    $("#reviews-grid").innerHTML = D.REVIEWS.slice(0, 3).map(function (r) {
      return (
        '<article class="review-card">' +
        '<div class="review-card__who"><span class="review-card__avatar" aria-hidden="true">' + esc(r.name.charAt(0).toUpperCase()) + "</span>" +
        '<span class="review-card__id"><strong>' + esc(r.name) + "</strong>" + (r.city ? "<span>" + esc(r.city) + "</span>" : "") + "</span></div>" +
        '<span class="stars" role="img" aria-label="' + r.stars + ' de 5 estrellas">' + new Array(r.stars + 1).join(I("star", { size: 16 })) + "</span>" +
        '<p class="review-card__text">' + esc(r.text) + "</p>" +
        verifiedHTML() +
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
  /* Píxel de Meta: vista de la prenda */
  if (M.pixel && M.pixel.enabled) M.pixel.track("ViewContent", { content_ids: [p.id], content_name: p.name, content_type: "product", value: p.price, currency: "COP" });

  /* Cambia de color: si el color nuevo no lleva el estampado elegido, pasa a su primero (o a ninguno) */
  function setColor(v) {
    st.color = v;
    const next = printFor(v, st.print);
    const samePrints = D.printsOf(p, v).map(function (x) { return x.id; }).join("|") === $$("[data-print]", printGroup).map(function (b) { return b.getAttribute("data-print"); }).join("|");
    st.print = next;
    if (!samePrints) renderPrints();
    st.size = pickSize();
  }

  bindRadio(fitGroup, "data-fit", function (v) {
    st.fit = v;
    /* El color elegido no viene en ese fit: pasa al primero que sí (con stock, si hay) */
    const moved = !colorHasFit(st.color, v);
    if (moved) {
      const ok = p.colors.filter(function (c) { return colorHasFit(c, v); });
      setColor(ok.filter(function (c) { return D.colorHasStock(p, c); })[0] || ok[0] || st.color);
    }
    update();
    renderMeasures();
    if (moved) refreshGallery();
  });
  bindRadio(colorGroup, "data-color", function (v) {
    setColor(v);
    update();
    refreshGallery();                  /* fotos del color (+ estampado) elegido */
  });
  bindRadio(printGroup, "data-print", function (v) {
    st.print = v;
    update();
    refreshGallery();                  /* fotos de la combinación, o las del color si no tiene */
  });
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
