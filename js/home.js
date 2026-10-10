/* ==========================================================================
   Mercy Studio — home.js  (pantalla INICIO)
   Hero (media configurable + franja en movimiento) · Los más vendidos ·
   Propósito (modal "Nuestra historia") · Reseñas · Comunidad + 15 % de descuento.
   Todos los textos salen de Mercy.content.home (panel → Inicio); el HTML estático
   de index.html es solo el marcado inicial y se sobrescribe aquí.
   Depende de: config, data, icons, ui, store, layout (ya cargados).
   ========================================================================== */
(function () {
  const U = Mercy.ui, D = Mercy.data, S = Mercy.store, C = Mercy.config;
  const I = Mercy.icons.svg;
  const $ = U.$, $$ = U.$$, esc = U.esc, rich = U.rich, fill = U.fill;
  const CT = Mercy.content || {};
  const H = CT.home || {};
  function txt(v, d) { return v == null ? d : String(v); }
  /* Pone texto (o HTML ya escapado con rich) en un nodo; si queda vacío, lo oculta */
  function put(el, html, asText) {
    if (!el) return;
    if (asText) el.textContent = html; else el.innerHTML = html;
    el.hidden = !String(html).trim();
  }
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------------
     1 · HERO — video / imagen configurable (C36)
     ---------------------------------------------------------------------- */
  /* <title> y meta description del Inicio (settings.seo) */
  function applySeo() {
    const seo = (CT.settings && CT.settings.seo) || {};
    if (seo.title && String(seo.title).trim()) document.title = String(seo.title).trim();
    if (seo.description != null) {
      let m = $('meta[name="description"]');
      if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
      m.setAttribute("content", String(seo.description));
    }
  }

  function renderHeroText() {
    const hero = H.hero || {};
    put($(".hero__eyebrow"), txt(hero.eyebrow, ""), true);
    const title = $("#hero-title");
    if (title) {
      title.innerHTML = rich(txt(hero.title, ""), { lines: "hero__line" });
      title.hidden = !txt(hero.title, "").trim();
    }
    put($(".hero__sub"), rich(txt(hero.subtitle, ""), { accent: false }));
    const cta = $(".hero__cta");
    if (cta) {
      const label = txt(hero.ctaLabel, "").trim();
      cta.textContent = label;
      cta.setAttribute("href", U.safeUrl(hero.ctaHref) || "catalogo.html");
      cta.hidden = !label;
    }
  }

  function mountHeroMedia() {
    const box = $("[data-hero-media]");
    const m = C.heroMedia || {};
    if (!box || !m.src || m.type === "none") return;     // sin material: se queda el placeholder
    const placeholder = $("[data-hero-placeholder]", box);
    let el;
    if (m.type === "video") {
      el = document.createElement("video");
      el.className = "hero__video";
      el.muted = true; el.defaultMuted = true; el.loop = true; el.playsInline = true;
      el.setAttribute("muted", ""); el.setAttribute("playsinline", ""); el.setAttribute("aria-hidden", "true");
      el.preload = "auto";
      if (m.poster) el.poster = U.safeUrl(m.poster);
      if (!reduceMotion) el.autoplay = true;
      el.src = U.safeUrl(m.src);
    } else {
      el = document.createElement("img");
      el.className = "hero__img"; el.alt = ""; el.decoding = "async"; el.src = U.safeUrl(m.src);
    }
    if (!el.getAttribute("src")) return;
    let triedFallback = false;
    el.addEventListener("error", function () {
      if (!triedFallback && m.fallback && U.safeUrl(m.fallback.src)) {      /* intenta el medio de respaldo */
        triedFallback = true;
        if (m.fallback.poster && el.tagName === "VIDEO") el.poster = U.safeUrl(m.fallback.poster);
        el.src = U.safeUrl(m.fallback.src);
        if (el.tagName === "VIDEO" && !reduceMotion) { const q = el.play(); if (q && q.catch) q.catch(function () {}); }
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

  /* Franja café en movimiento (C37): grupo duplicado => bucle continuo sin saltos. Sin frases se oculta. */
  function renderMarquee() {
    const track = $("[data-marquee-track]");
    const sr = $("[data-marquee-sr]");
    if (!track) return;
    const items = D.MARQUEE || [];
    const bar = $("[data-marquee]");
    if (bar) bar.hidden = !items.length;
    document.body.classList.toggle("no-marquee", !items.length);
    if (!items.length) { track.innerHTML = ""; if (sr) sr.innerHTML = ""; return; }
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
    const bs = H.bestSellers || {};
    const section = grid.closest("section") || grid.parentNode;
    put($(".eyebrow", section), txt(bs.eyebrow, ""), true);
    put($("#favs-title"), txt(bs.title, ""), true);
    const all = $(".favs__all", section);
    if (all) {
      const label = txt(bs.ctaLabel, "").trim();
      all.innerHTML = esc(label) + ' <span data-icon="arrow-right" data-size="16"></span>';
      all.hidden = !label;
    }
    const count = Math.max(1, Math.min(12, parseInt(bs.count, 10) || 4));
    const top = D.PRODUCTS.slice().sort(function (a, b) { return a.bestRank - b.bestRank; }).slice(0, count);
    if (section) section.hidden = !top.length;
    grid.innerHTML = top.map(function (p) { return U.cardHTML(p, { meta: true, sub: true }); }).join("");
    /* El enlace de la foto duplica al del nombre: se saca del orden de tabulación y del árbol accesible */
    $$(".pcard__media", grid).forEach(function (a) { a.setAttribute("tabindex", "-1"); a.setAttribute("aria-hidden", "true"); });
    U.syncFavButtons();
    const allIcon = $(".favs__all [data-icon]");
    if (allIcon) allIcon.innerHTML = I(allIcon.getAttribute("data-icon"), { size: +allIcon.getAttribute("data-size") || 16 });
  }

  /* ----------------------------------------------------------------------
     3 · PROPÓSITO — modal "Nuestra historia" (C15, C19)
     ---------------------------------------------------------------------- */
  function bindPurpose() {
    const pu = H.purpose || {};
    const btn = $("[data-story]");
    const textEl = $("[data-purpose-text]");
    put($("#proposito .eyebrow"), txt(pu.eyebrow, ""), true);
    put($("#purpose-title"), rich(txt(pu.title, "")));
    put(textEl, rich(txt(pu.text, ""), { accent: false }));
    if (!btn || !textEl) return;
    const label = txt(pu.buttonLabel, "").trim();
    btn.textContent = label;
    btn.hidden = !label;
    btn.addEventListener("click", function () {
      const quote = txt(pu.storyQuote, "").trim();
      const cta = txt(pu.storyCtaLabel, "").trim();
      const html =
        (txt(pu.text, "").trim() ? '<p class="story__lead">' + rich(pu.text, { accent: false }) + "</p>" : "") +
        (quote ? '<p class="story__quote">' + rich(quote) + "</p>" : "") +
        (cta ? '<a class="btn btn--primary story__cta" href="catalogo.html">' + esc(cta) + "</a>" : "");
      U.infoModal("historia", txt(pu.storyTitle, "").trim() || label, html);
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
    const rv = H.reviews || {};
    const section = $("#resenas");
    /* Sin reseñas visibles la sección completa se oculta */
    if (section) section.hidden = !D.REVIEWS.length;
    if (!D.REVIEWS.length) { if (list) list.innerHTML = ""; return; }
    const score = Math.max(0, Math.min(5, Number(rv.score) || 0));
    const count = Math.max(0, parseInt(rv.count, 10) || 0);
    const titleSpan = $("#reviews-title > span:not([class])");
    if (titleSpan) titleSpan.textContent = txt(rv.title, "");
    if (head) {
      head.innerHTML = starsHTML(Math.round(score), 18);
      head.setAttribute("aria-label", Math.round(score) + " de 5 estrellas");
      head.hidden = !score;
    }
    const scoreEl = $(".reviews__score", section);
    if (scoreEl) {
      scoreEl.textContent = [score ? score.toFixed(1).replace(".", ",") : "", count ? U.pluralize(count, "reseña", "reseñas").replace(/^\d+/, U.thousands(count)) : ""].filter(Boolean).join(" · ");
      scoreEl.hidden = !scoreEl.textContent;
    }
    if (!list) return;
    list.innerHTML = D.REVIEWS.map(function (r) {
      return (
        "<li><article class=\"review-card\">" +
        '<div class="stars review-card__stars" role="img" aria-label="' + r.stars + ' de 5 estrellas">' + starsHTML(r.stars, 16) + "</div>" +
        '<blockquote class="review-card__quote">“' + esc(r.quote) + "”</blockquote>" +
        '<div class="review-card__who"><span class="review-card__avatar" aria-hidden="true">' + esc(r.name.charAt(0).toUpperCase()) + "</span>" +
        '<span class="review-card__name"><strong>' + esc(r.name) + "</strong>" + (r.city ? "<span>" + esc(r.city) + "</span>" : "") + "</span>" +
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
     5 · COMUNIDAD + cupón de bienvenida (C20, C21, P22) — suscribe aunque no haya cupón
     ---------------------------------------------------------------------- */
  /* Textos de la comunidad (home.community); {descuento} = cupón de bienvenida */
  function renderCommunityText() {
    const cm = H.community || {};
    put($("#community-title"), rich(txt(cm.title, ""), { fill: true }));
    const sub = $(".community__sub");
    if (sub) {
      const a = rich(txt(cm.subtitle, ""), { fill: true, accent: false });
      const hl = C.discountEnabled ? rich(txt(cm.highlight, ""), { fill: true, accent: false }) : "";
      put(sub, a + (a && hl ? " " : "") + (hl ? "<strong>" + hl + "</strong>" : ""));
    }
    const input = $("#community-email");
    if (input) input.setAttribute("placeholder", txt(cm.placeholder, ""));
    const submit = $(".community__submit");
    if (submit) {
      let label = txt(cm.buttonLabel, "");
      if (!C.discountEnabled && /\{descuento\}/.test(label)) label = "Suscribirme";
      submit.textContent = fill(label);
    }
    put($(".community__fine"), rich(txt(cm.fine, ""), { fill: true, accent: false }));
    put($(".community__done-title"), rich(txt(cm.doneTitle, ""), { fill: true }));
    put($(".community__done-msg"), rich(txt(cm.doneMsg, ""), { fill: true, accent: false }));
    const go = $(".community__go");
    if (go) { const l = txt(cm.doneCtaLabel, "").trim(); go.textContent = l; go.hidden = !l; }
  }

  function bindCommunity() {
    const form = $("[data-community-form]");
    const formWrap = $("[data-community-form-wrap]");
    const done = $("[data-community-done]");
    if (!form || !formWrap || !done) return;
    renderCommunityText();
    const check = $(".community__check", done);
    if (check) check.innerHTML = I("check", { size: 28, stroke: 2.4 });
    const copyIcon = $("[data-copy-icon]", done);
    if (copyIcon) copyIcon.innerHTML = I("copy", { size: 16 });
    const codeEl = $("[data-community-code]", done);
    const codeBox = codeEl ? codeEl.closest(".community__code") : null;
    const doneMsg = $(".community__done-msg", done);
    const doneMsgHTML = doneMsg ? doneMsg.innerHTML : "";
    /* Suscrito sin cupón (modal de descuento apagado o sin cupón de bienvenida vigente): solo agradecimiento */
    const THANKS = "¡Gracias por suscribirte! Te contaremos las novedades de " + (C.brand || "Mercy Studio") + ".";
    /* Con código pero sin aplicar ahora (lo quitó o lo cambió por otro): no se dice «Ya está aplicado a tu carrito» */
    const PENDING = "Este es tu código de bienvenida. Escríbelo en el checkout para usarlo.";

    function sync() {
      const claimed = S.discount.claimed();
      formWrap.hidden = claimed;
      done.hidden = !claimed;
      /* Código REAL recibido al suscribirse (Mercy.store.discount.claimedCode) */
      const code = S.discount.claimedCode();
      if (codeEl) codeEl.textContent = code;
      if (codeBox) codeBox.hidden = !code;
      if (doneMsg) {
        if (!code) put(doneMsg, esc(THANKS));
        else if (S.discount.claimedApplied()) put(doneMsg, doneMsgHTML);
        else put(doneMsg, esc(PENDING));
      }
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
      const short = long.length > 26 ? "Tu correo electrónico" : long;
      const setPh = function () { emailInput.setAttribute("placeholder", mq.matches ? short : long); };
      setPh();
      if (mq.addEventListener) mq.addEventListener("change", setPh); else if (mq.addListener) mq.addListener(setPh);
    }

    /* bindForm valida el correo (obligatorio, formato), lo registra (API o modo local) y llama a onOk solo si salió bien */
    Mercy.discount.bindForm(form, function (r) {
      sync();
      U.toast(r.coupon ? "¡Listo! Tu descuento del " + r.coupon.label + " quedó aplicado" : THANKS, { icon: "check" });
      const copy = $("[data-copy-code]", done);
      const go = $(".community__go", done);
      if (r.coupon && copy) copy.focus(); else if (go && !go.hidden) go.focus();
    }, "community");
    /* Sincroniza si se reclama desde el pop-up (o en otra pestaña) */
    document.addEventListener("mercy:discount", sync);
  }

  /* ----------------------------------------------------------------------
     Inicio
     ---------------------------------------------------------------------- */
  function init() {
    applySeo();
    renderHeroText();
    syncStripHeight();
    renderMarquee();
    liftFabOverMarquee();
    mountHeroMedia();
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
