/* ==========================================================================
   Mercy Studio — home.js  (pantalla INICIO)
   Hero (media configurable + franja en movimiento) · Los más vendidos ·
   Propósito (modal "Nuestra historia") · Reseñas · Comunidad + 15 % de descuento.
   Depende de: config, data, icons, ui, store, layout (ya cargados).
   ========================================================================== */
(function () {
  const U = Mercy.ui, D = Mercy.data, S = Mercy.store, C = Mercy.config;
  const I = Mercy.icons.svg;
  const $ = U.$, $$ = U.$$, esc = U.esc;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------------
     1 · HERO — video / imagen configurable (C36)
     ---------------------------------------------------------------------- */
  function mountHeroMedia() {
    const box = $("[data-hero-media]");
    const m = C.heroMedia || {};
    if (!box || !m.src) return;                      // sin material: se queda el placeholder
    const placeholder = $("[data-hero-placeholder]", box);
    let el;
    if (m.type === "video") {
      el = document.createElement("video");
      el.className = "hero__video";
      el.muted = true; el.defaultMuted = true; el.loop = true; el.playsInline = true;
      el.setAttribute("muted", ""); el.setAttribute("playsinline", ""); el.setAttribute("aria-hidden", "true");
      el.preload = "auto";
      if (m.poster) el.poster = m.poster;
      if (!reduceMotion) el.autoplay = true;
      el.src = m.src;
    } else {
      el = document.createElement("img");
      el.className = "hero__img"; el.alt = ""; el.decoding = "async"; el.src = m.src;
    }
    let triedFallback = false;
    el.addEventListener("error", function () {
      if (!triedFallback && m.fallback && m.fallback.src) {      /* intenta el video de respaldo */
        triedFallback = true;
        if (m.fallback.poster) el.poster = m.fallback.poster;
        el.src = m.fallback.src;
        if (!reduceMotion) { const q = el.play(); if (q && q.catch) q.catch(function () {}); }
        return;
      }
      el.remove(); if (placeholder) placeholder.hidden = false;
    });
    box.appendChild(el);
    if (placeholder) placeholder.hidden = true;
    if (el.tagName === "VIDEO" && !reduceMotion) { const p = el.play(); if (p && p.catch) p.catch(function () {}); }
  }

  /* La franja superior puede partirse en 2-3 líneas en móvil: se mide su altura real para que el hero
     ocupe exactamente la pantalla (C36) y la franja en movimiento no quede recortada. */
  function syncStripHeight() {
    const strip = $(".topstrip");
    if (!strip) return;
    const set = function () {
      const h = Math.round(strip.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--strip-h", h + "px");
    };
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(strip);
    else window.addEventListener("resize", set);
  }

  /* El botón flotante de WhatsApp no debe tapar la franja en movimiento mientras ésta está a la vista */
  function liftFabOverMarquee() {
    const bar = $(".marquee");
    if (!bar || !window.IntersectionObserver) return;
    new IntersectionObserver(function (entries) {
      document.body.classList.toggle("is-marquee-visible", entries[0].isIntersecting);
    }, { threshold: 0 }).observe(bar);
  }

  /* Franja café en movimiento (C37): grupo duplicado => bucle continuo sin saltos */
  function renderMarquee() {
    const track = $("[data-marquee-track]");
    const sr = $("[data-marquee-sr]");
    if (!track) return;
    const items = D.MARQUEE || [];
    if (sr) sr.innerHTML = items.map(function (it) { return "<li>" + esc(it.text) + "</li>"; }).join("");
    /* Cada grupo repite los 4 ítems 3 veces para cubrir pantallas anchas; el segundo grupo es copia exacta. */
    function group(isCopy) {
      let h = "";
      for (let r = 0; r < 3; r++) {
        h += items.map(function (it) {
          return '<span class="marquee__item' + (r || isCopy ? " marquee__item--dup" : "") + '">' + I(it.icon, { size: 20 }) + "<span>" + esc(it.text) + "</span></span>";
        }).join("");
      }
      return '<div class="marquee__group">' + h + "</div>";
    }
    track.innerHTML = group(false) + group(true);
  }

  /* ----------------------------------------------------------------------
     2 · LOS MÁS VENDIDOS (C10–C14): 4 primeros por bestRank
     ---------------------------------------------------------------------- */
  function renderFavs() {
    const grid = $("[data-favs-grid]");
    if (!grid) return;
    const top = D.PRODUCTS.slice().sort(function (a, b) { return a.bestRank - b.bestRank; }).slice(0, 4);
    grid.innerHTML = top.map(function (p) { return U.cardHTML(p, { meta: true, sub: true }); }).join("");
    /* El enlace de la foto duplica al del nombre: se saca del orden de tabulación y del árbol accesible */
    $$(".pcard__media", grid).forEach(function (a) { a.setAttribute("tabindex", "-1"); a.setAttribute("aria-hidden", "true"); });
    U.syncFavButtons();
  }

  /* ----------------------------------------------------------------------
     3 · PROPÓSITO — modal "Nuestra historia" (C15, C19)
     ---------------------------------------------------------------------- */
  function bindPurpose() {
    const btn = $("[data-story]");
    const textEl = $("[data-purpose-text]");
    if (!btn || !textEl) return;
    btn.addEventListener("click", function () {
      const html =
        '<p class="story__lead">' + esc(textEl.textContent.trim()) + "</p>" +
        '<p class="story__quote">La moda es el medio. <span class="accent">Cristo</span> es el mensaje.</p>' +
        '<a class="btn btn--primary story__cta" href="catalogo.html">Conoce la colección</a>';
      U.infoModal("historia", "Nuestra historia", html);
    });
  }

  /* Scroll suave a #proposito (desde el menú lateral o con #hash) */
  function scrollToHash(hash, smooth) {
    const target = hash && document.getElementById(hash.replace(/^#/, ""));
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 68) + 1;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth && !reduceMotion ? "smooth" : "auto" });
  }
  function bindAnchors() {
    document.addEventListener("click", function (e) {
      const a = e.target.closest('a[href*="#proposito"]');
      if (!a) return;
      const url = new URL(a.getAttribute("href"), location.href);
      if (url.pathname !== location.pathname) return;       // enlace a otra página: navegación normal
      e.preventDefault();
      const inMenu = a.closest(".drawer");
      if (inMenu) Mercy.layout.close("menu");
      setTimeout(function () {
        scrollToHash("#proposito", true);
        try { history.replaceState(null, "", "#proposito"); } catch (err) {}
        const t = document.getElementById("proposito");
        if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
      }, inMenu ? 380 : 0);
    });
    if (location.hash === "#proposito") {
      const go = function () { scrollToHash("#proposito", false); };
      go(); window.addEventListener("load", go); setTimeout(go, 400);
    }
  }

  /* ----------------------------------------------------------------------
     4 · RESEÑAS (Google): escritorio 3 columnas · móvil carrusel scroll-snap
     ---------------------------------------------------------------------- */
  function starsHTML(n, size) {
    let h = "";
    for (let i = 0; i < n; i++) h += I("star", { size: size || 16 });
    return h;
  }
  function renderReviews() {
    const list = $("[data-reviews-list]");
    const head = $("[data-reviews-stars]");
    if (head) head.innerHTML = starsHTML(5, 18);
    if (!list) return;
    list.innerHTML = D.REVIEWS.map(function (r) {
      return (
        "<li><article class=\"review-card\">" +
        '<div class="stars review-card__stars" role="img" aria-label="' + r.stars + ' de 5 estrellas">' + starsHTML(r.stars, 16) + "</div>" +
        '<blockquote class="review-card__quote">“' + esc(r.quote) + "”</blockquote>" +
        '<div class="review-card__who"><span class="review-card__avatar" aria-hidden="true">' + esc(r.name.charAt(0)) + "</span>" +
        '<span class="review-card__name"><strong>' + esc(r.name) + "</strong><span>" + esc(r.city) + "</span></span>" +
        '<span class="review-card__verified">' + I("check", { size: 14, stroke: 2.2 }) + " Compra verificada</span></div>" +
        "</article></li>"
      );
    }).join("");
    initDots();
  }
  function initDots() {
    const sc = $("[data-reviews-scroller]");
    const dots = $("[data-reviews-dots]");
    const items = $$("[data-reviews-list] > li");
    if (!sc || !dots || !items.length) return;
    dots.innerHTML = items.map(function (_, i) { return '<span class="reviews__dot' + (i === 0 ? " is-on" : "") + '"></span>'; }).join("");
    const ds = $$(".reviews__dot", dots);
    function update() {
      const max = sc.scrollWidth - sc.clientWidth;
      let idx = 0;
      if (max > 0) {
        const step = max / (items.length - 1);
        idx = Math.round(sc.scrollLeft / step);
      }
      ds.forEach(function (d, i) { d.classList.toggle("is-on", i === idx); });
    }
    sc.addEventListener("scroll", U.debounce(update, 40), { passive: true });
    window.addEventListener("resize", U.debounce(update, 100));
  }

  /* ----------------------------------------------------------------------
     5 · COMUNIDAD + 15 % (C20, C21, P22)
     ---------------------------------------------------------------------- */
  function bindCommunity() {
    const form = $("[data-community-form]");
    const formWrap = $("[data-community-form-wrap]");
    const done = $("[data-community-done]");
    if (!form || !formWrap || !done) return;
    const check = $(".community__check", done);
    if (check) check.innerHTML = I("check", { size: 28, stroke: 2.4 });
    const copyIcon = $("[data-copy-icon]", done);
    if (copyIcon) copyIcon.innerHTML = I("copy", { size: 16 });
    const codeEl = $("[data-community-code]", done);
    if (codeEl) codeEl.textContent = S.discount.code();

    function sync() {
      const claimed = S.discount.claimed();
      formWrap.hidden = claimed;
      done.hidden = !claimed;
      if (!claimed) {                                  // p. ej. Mercy.store.reset()
        const input = $("input", form);
        if (input) { input.value = ""; U.setError(input, ""); }
      }
    }
    sync();

    /* En pantallas muy angostas el marcador largo se corta: versión corta del mismo texto */
    const emailInput = $("input", form);
    if (emailInput && window.matchMedia) {
      const long = emailInput.getAttribute("placeholder");
      const mq = window.matchMedia("(max-width: 380px)");
      const setPh = function () { emailInput.setAttribute("placeholder", mq.matches ? "Tu correo electrónico" : long); };
      setPh();
      if (mq.addEventListener) mq.addEventListener("change", setPh); else if (mq.addListener) mq.addListener(setPh);
    }

    /* bindForm valida el correo (obligatorio, formato) y llama a onOk solo si es válido */
    Mercy.discount.bindForm(form, function () {
      sync();
      U.toast("¡Listo! Tu descuento del " + S.discount.percent() + "% quedó aplicado", { icon: "check" });
      const copy = $("[data-copy-code]", done); if (copy) copy.focus();
    });
    /* Sincroniza si se reclama desde el pop-up (o en otra pestaña) */
    document.addEventListener("mercy:discount", sync);
  }

  /* ----------------------------------------------------------------------
     Inicio
     ---------------------------------------------------------------------- */
  function init() {
    syncStripHeight();
    liftFabOverMarquee();
    mountHeroMedia();
    renderMarquee();
    renderFavs();
    bindPurpose();
    bindAnchors();
    renderReviews();
    bindCommunity();
    /* 6 · pop-up de bienvenida (una vez por sesión) */
    Mercy.discount.scheduleAutoOpen();
  }
  init();
})();
