/* ==========================================================================
   Mercy Studio — layout.js
   Arma la estructura común de TODAS las páginas e inyecta:
     franja superior · header · menú lateral · búsqueda · favoritos ·
     carrito (overlay derecha→izquierda) · pop-up de descuento · footer · botón WhatsApp.
   Configuración por página en <body>:
     data-header = "hero" | "solid" | "minimal"     (por defecto "solid")
     data-footer = "full" | "none"                  (por defecto "full")
   API pública: Mercy.layout, Mercy.search, Mercy.discount
   Todos los textos, logos, redes, categorías y guías de tallas salen del contenido
   administrable (Mercy.content / Mercy.data / Mercy.config).
   Acceso al panel (contrato §6): botón con ícono de usuario en el header (settings.showAdminLink)
   + "Panel administrador" en el menú → admin/login.html (o admin/ con la cookie mercy_admin);
   con la cookie y el servidor activo, pastilla flotante "Editar esta página" → ruta del panel.
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  const U = Mercy.ui;
  const I = Mercy.icons.svg;
  const D = Mercy.data;
  const S = Mercy.store;
  const C = Mercy.config;
  const CT = Mercy.content || {};
  const TX = CT.texts || {};
  const CAT_TX = TX.catalog || {};
  const DM = CT.discountModal || {};
  const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;
  const BRAND = C.brand;
  const fill = U.fill, rich = U.rich;
  /* Agradecimiento cuando la suscripción no trae cupón (modal apagado o sin cupón de bienvenida vigente) */
  const THANKS = "¡Gracias por suscribirte! Te contaremos las novedades de " + BRAND + ".";
  function list(v) { return (Array.isArray(v) ? v : []).map(function (x) { return String(x == null ? "" : x).trim(); }).filter(Boolean); }
  function txt(v, d) { return v == null ? d : String(v); }

  const body = document.body;
  const headerMode = body.getAttribute("data-header") || "solid";
  const footerMode = body.getAttribute("data-footer") || "full";

  /* --- Acceso al panel -------------------------------------------------------
     mercy_admin=1 es una cookie indicadora SIN secreto (contrato §4): solo decide a dónde lleva el
     botón y si se muestra la barra de edición; la sesión real (mercy_sid, HttpOnly) la valida el servidor. */
  function cookie(name) {
    let raw = "";
    try { raw = document.cookie || ""; } catch (e) { return ""; }
    const hit = raw.split(/;\s*/).filter(function (c) { return c.indexOf(name + "=") === 0; })[0];
    if (!hit) return "";
    try { return decodeURIComponent(hit.slice(name.length + 1)); } catch (e) { return hit.slice(name.length + 1); }
  }
  const ADMIN_SESSION = (function () { const v = cookie("mercy_admin"); return !!v && v !== "0"; })();
  const ADMIN_HREF = ADMIN_SESSION ? "admin/" : "admin/login.html";
  /* Botón del header. En celular va junto al menú (la derecha ya tiene 3 íconos y el logo debe quedar centrado);
     desde 900 px va a la derecha, antes de favoritos. Se pintan los dos y el CSS muestra uno. */
  function adminBtnHTML(where) {
    if (!C.showAdminLink) return "";
    return '<a class="icon-btn site-header__admin site-header__admin--' + where + '" href="' + ADMIN_HREF + '" data-admin-link' +
      ' aria-label="Panel administrador" title="Panel administrador">' + I("user", { size: 24 }) + "</a>";
  }

  /* ======================================================================
     Búsqueda (C1/C2): artículos puntuales o con referencias parecidas
     ====================================================================== */
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = [], cur = [];
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function haystack(p) {
    const cat = D.CATEGORIES.filter(function (c) { return c.id === p.category; })[0];
    const parts = [p.name, p.ref, cat ? cat.name : "", p.collection || "", (p.tags || []).join(" ")]
      .concat(p.fits.map(function (f) { return D.FITS[f]; }))
      .concat(p.colors.map(function (c) { return D.color(c).name; }))
      .concat((p.prints || []).map(function (x) { return "estampado " + x.name; }));
    return U.norm(parts.join(" "));
  }
  const search = {
    run: function (query) {
      const q = U.norm(query);
      const tokens = q.split(/\s+/).filter(Boolean);
      if (!tokens.length) return { tokens: [], exact: [], similar: [] };
      const scored = [];
      D.PRODUCTS.forEach(function (p) {
        const hay = haystack(p);
        const name = U.norm(p.name);
        const ref = U.norm(p.ref);
        let score = 0, all = true;
        tokens.forEach(function (t) {
          if (ref === t) score += 10;
          else if (hay.indexOf(t) > -1) {
            score += 2;
            if (name.indexOf(t) > -1) score += 2;
            if (name.split(/\s+/).some(function (w) { return w.indexOf(t) === 0; })) score += 1;
          } else all = false;
        });
        if (all) scored.push({ p: p, score: score });
      });
      scored.sort(function (a, b) { return b.score - a.score || a.p.bestRank - b.p.bestRank; });
      const exact = scored.map(function (s) { return s.p; });

      /* Referencias parecidas: errores de tipeo, misma categoría/colección, etiquetas cercanas */
      const ids = {}; exact.forEach(function (p) { ids[p.id] = true; });
      const sims = [];
      D.PRODUCTS.forEach(function (p) {
        if (ids[p.id]) return;
        const words = haystack(p).split(/\s+/);
        let s = 0;
        tokens.forEach(function (t) {
          if (t.length < 3) return;
          words.forEach(function (w) {
            if (w.length < 3) return;
            const d = lev(t, w);
            if (d <= (t.length > 5 ? 2 : 1)) s += 3 - d;
            else if (w.indexOf(t.slice(0, 3)) === 0) s += 1;
          });
        });
        if (exact.length) {
          const first = exact[0];
          if (p.category === first.category) s += 2;
          if (p.collection && p.collection === first.collection) s += 1;
        }
        if (s > 0) sims.push({ p: p, s: s });
      });
      sims.sort(function (a, b) { return b.s - a.s || a.p.bestRank - b.p.bestRank; });
      return { tokens: tokens, exact: exact, similar: sims.map(function (x) { return x.p; }) };
    }
  };

  /* ======================================================================
     Plantillas de la estructura
     ====================================================================== */
  /* Franja café superior (texts.topStrip, unidas con " · "). Sin frases no se muestra. */
  function topStripHTML() {
    const items = list(TX.topStrip);
    if (!items.length) return "";
    const txt = items.map(esc).join(' <span aria-hidden="true">·</span> ');
    /* En móvil el texto corre en una sola línea (cinta); la copia es decorativa. En escritorio se muestra fijo y centrado. */
    return '<div class="topstrip" role="note"><div class="topstrip__track"><p class="topstrip__text">' + txt + '</p><p class="topstrip__text topstrip__text--dup" aria-hidden="true">' + txt + "</p></div></div>";
  }

  function headerHTML() {
    const logo =
      '<a class="logo" href="index.html" aria-label="' + esc(BRAND) + ' — ir al inicio" data-logo>' +
      '<img class="logo__img logo__img--dark" src="' + esc(U.safeUrl(C.logo.terracota)) + '" alt="' + esc(BRAND) + '" width="180" height="90" decoding="async">' +
      '<img class="logo__img logo__img--light" src="' + esc(U.safeUrl(C.logo.beige)) + '" alt="" aria-hidden="true" width="180" height="90" decoding="async">' +
      "</a>";
    if (headerMode === "minimal") {
      return (
        '<header class="site-header site-header--minimal" id="site-header"><div class="site-header__inner">' +
        '<div class="site-header__left"><a class="icon-btn" href="catalogo.html" data-back aria-label="Volver">' + I("arrow-left", { size: 24 }) + "</a></div>" +
        logo +
        '<div class="site-header__right"><p class="secure-note">' + I("lock", { size: 16 }) + '<span>Compra segura <span class="secure-note__long">coordinada por WhatsApp</span></span></p></div>' +
        "</div></header>"
      );
    }
    return (
      '<header class="site-header site-header--' + headerMode + '" id="site-header"><div class="site-header__inner">' +
      '<div class="site-header__left">' +
      '<button type="button" class="icon-btn icon-btn--label" data-open="menu" aria-label="Abrir menú" aria-haspopup="dialog" aria-controls="menu-drawer">' + I("menu", { size: 26 }) + '<span class="icon-btn__text">Menú</span></button>' +
      adminBtnHTML("m") +
      "</div>" +
      logo +
      '<div class="site-header__right">' +
      '<button type="button" class="icon-btn" data-open="search" aria-label="Buscar productos" aria-haspopup="dialog" aria-controls="search-panel">' + I("search", { size: 24 }) + "</button>" +
      adminBtnHTML("d") +
      '<button type="button" class="icon-btn icon-btn--badge" data-open="favs" aria-label="Tus favoritos" title="Tus favoritos" aria-haspopup="dialog" aria-controls="favs-drawer">' + I("heart", { size: 24 }) + '<span class="badge-count" data-fav-count hidden>0</span></button>' +
      '<button type="button" class="icon-btn icon-btn--badge" data-open="cart" aria-label="Abrir carrito" aria-haspopup="dialog" aria-controls="cart-drawer">' + I("cart", { size: 24 }) + '<span class="badge-count" data-cart-count hidden>0</span></button>' +
      "</div></div></header>"
    );
  }

  /* Redes (settings.social): una red sin enlace no se muestra. WhatsApp siempre. */
  const SOCIAL = [
    { key: "instagram", name: "Instagram", size: 20 },
    { key: "tiktok", name: "TikTok", size: 18 },
    { key: "facebook", name: "Facebook", size: 18 }
  ].map(function (n) { n.url = U.safeUrl(C.social[n.key]); return n; }).filter(function (n) { return n.url; });
  const WA_HELLO = U.waLink(U.waGreeting());

  function socialLinks(cls) {
    return (
      '<ul class="' + cls + '">' +
      SOCIAL.map(function (n) {
        return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener" aria-label="' + n.name + '">' + I(n.key, { size: n.size }) + "</a></li>";
      }).join("") +
      '<li><a href="' + esc(WA_HELLO) + '" target="_blank" rel="noopener" aria-label="WhatsApp">' + I("whatsapp", { size: 19 }) + "</a></li>" +
      "</ul>"
    );
  }

  function menuHTML() {
    const cats = D.CATEGORIES.map(function (c) {
      return '<li><a class="menu__link menu__link--sub" href="catalogo.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + "</a></li>";
    }).join("");
    return (
      '<header class="drawer__head drawer__head--dark"><h2 class="drawer__title">Tienda</h2>' +
      '<button type="button" class="icon-btn icon-btn--light" data-close aria-label="Cerrar menú">' + I("close", { size: 24 }) + "</button></header>" +
      '<nav class="drawer__body menu" aria-label="Menú principal"><ul>' +
      '<li><a class="menu__link" href="catalogo.html?vista=novedades">' + esc(txt(CAT_TX.newTitle, "Novedades")) + "</a></li>" +
      '<li><a class="menu__link menu__link--top" href="catalogo.html?vista=mas-vendidos">' + esc(txt(CAT_TX.bestTitle, "Los más vendidos")) + '<span class="menu__flag">Top</span></a></li>' +
      '<li><a class="menu__link" href="catalogo.html">Toda la colección</a></li>' +
      "</ul>" +
      '<ul class="menu__group">' + cats + "</ul>" +
      '<ul class="menu__group">' +
      '<li><a class="menu__link menu__link--sub" href="index.html#proposito">Nuestra historia</a></li>' +
      '<li><button type="button" class="menu__link menu__link--sub" data-info="tallas">Guía de tallas</button></li>' +
      '<li><button type="button" class="menu__link menu__link--sub" data-info="envios">Envíos</button></li>' +
      '<li><button type="button" class="menu__link menu__link--sub" data-info="cambios">Cambios y devoluciones</button></li>' +
      (C.showAdminLink
        ? '<li><a class="menu__link menu__link--sub menu__link--admin" href="' + ADMIN_HREF + '" data-admin-link>' + I("user", { size: 18 }) + "Panel administrador</a></li>"
        : "") +
      "</ul></nav>" +
      '<footer class="drawer__foot menu__foot">' + socialLinks("social social--menu") +
      '<a class="menu__wa" href="' + esc(WA_HELLO) + '" target="_blank" rel="noopener">' + I("whatsapp", { size: 18 }) + " Escríbenos por WhatsApp</a></footer>"
    );
  }

  /* Búsquedas sugeridas (texts.searchSuggestions, 0–10). Sin sugerencias el bloque no se muestra. */
  const SUGGEST = list(TX.searchSuggestions).slice(0, 10);
  function searchHTML() {
    return (
      '<div class="search-panel__bar"><div class="search-panel__field">' + I("search", { size: 22 }) +
      '<input id="search-input" type="search" data-autofocus placeholder="Busca por nombre, referencia o color…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar productos">' +
      '<button type="button" class="search-panel__clear" data-search-clear aria-label="Borrar búsqueda" hidden>' + I("close", { size: 18 }) + "</button></div>" +
      '<button type="button" class="search-panel__close" data-close>Cerrar</button></div>' +
      '<div class="search-panel__body">' +
      (SUGGEST.length
        ? '<div class="search-suggest" data-search-suggest><p class="search-label">Búsquedas sugeridas</p><div class="chips">' +
          SUGGEST.map(function (t) {
            return '<button type="button" class="chip" data-search-term="' + esc(t) + '">' + esc(t) + "</button>";
          }).join("") + "</div></div>"
        : '<div class="search-suggest" data-search-suggest hidden></div>') +
      '<div class="search-results" id="search-results" aria-live="polite"></div></div>'
    );
  }

  /* C3: resultado compacto (miniatura, nombre, referencia y precio), como la referencia de TRUE */
  function srItem(p) {
    return (
      '<a class="sr-item' + (p.soldOut ? " is-soldout" : "") + '" href="producto.html?id=' + encodeURIComponent(p.id) + '">' +
      '<span class="sr-item__thumb">' + U.tileHTML(p, { size: "thumb" }) + "</span>" +
      '<span class="sr-item__info"><span class="sr-item__name">' + esc(p.name) + "</span>" +
      '<span class="sr-item__meta">Ref. ' + esc(p.ref) + (p.soldOut ? " · Agotado" : "") + "</span>" +
      '<span class="sr-item__price">' + money(p.price) + "</span></span></a>"
    );
  }

  function renderSearch(q) {
    const out = $("#search-results");
    const suggest = $("[data-search-suggest]");
    const clear = $("[data-search-clear]");
    clear.hidden = !q;
    if (!q.trim()) {
      suggest.hidden = !SUGGEST.length;
      const top = D.PRODUCTS.slice().sort(function (a, b) { return a.bestRank - b.bestRank; }).slice(0, 4);
      out.innerHTML = '<p class="search-label">Lo más buscado</p><div class="sr-list">' + top.map(srItem).join("") + "</div>";
      return;
    }
    suggest.hidden = true;
    const r = search.run(q);
    let html = "";
    if (r.exact.length) {
      const all = '<a class="search-all" href="catalogo.html?q=' + encodeURIComponent(q.trim()) + '">' +
        (r.exact.length > 8 ? "Ver los " + r.exact.length + " resultados" : "Ver en el catálogo") + " " + I("arrow-right", { size: 16 }) + "</a>";
      html += '<div class="search-head"><p class="search-label">' + U.pluralize(r.exact.length, "resultado", "resultados") + ' para “' + esc(q.trim()) + "”</p>" + all + "</div>";
      html += '<div class="sr-list">' + r.exact.slice(0, 8).map(srItem).join("") + "</div>";
    } else {
      html += '<p class="search-empty">No encontramos nada para “<strong>' + esc(q.trim()) + "</strong>”. Prueba con otro nombre, color o referencia.</p>";
    }
    let sims = r.similar.slice(0, 4);
    if (!r.exact.length && !sims.length) sims = D.PRODUCTS.slice().sort(function (a, b) { return a.bestRank - b.bestRank; }).slice(0, 4);
    if (sims.length) {
      html += '<p class="search-label search-label--sub">' + (r.exact.length ? "Referencias parecidas" : "Quizá te interese") + '</p><div class="sr-list">' + sims.map(srItem).join("") + "</div>";
    }
    out.innerHTML = html;
  }

  /* --- Favoritos ---------------------------------------------------------- */
  function favsHTML() {
    return (
      '<header class="drawer__head"><h2 class="drawer__title">Tus favoritos <span class="drawer__count" data-fav-count-text></span></h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="Cerrar favoritos">' + I("close", { size: 24 }) + "</button></header>" +
      '<p class="drawer__lead">Guarda las prendas que te gustan con el corazón y vuelve a ellas cuando quieras.</p>' +
      '<div class="drawer__body" data-favs-body></div>'
    );
  }
  function renderFavs() {
    const list = S.favs.list();
    const body = $("[data-favs-body]");
    const count = $("[data-fav-count-text]");
    if (!body) return;
    count.textContent = list.length ? "(" + list.length + ")" : "";
    if (!list.length) {
      body.innerHTML =
        '<div class="empty">' + I("heart", { size: 42, stroke: 1.2 }) + '<p class="empty__title">Aún no tienes favoritos</p>' +
        '<p class="empty__text">Toca el corazón en cualquier prenda para guardarla aquí.</p>' +
        '<a class="btn btn--primary" href="catalogo.html">Ver colección</a></div>';
      return;
    }
    body.innerHTML = '<ul class="fav-list">' + list.map(function (p) {
      return (
        '<li class="fav-item"><a class="fav-item__thumb" href="producto.html?id=' + encodeURIComponent(p.id) + '">' + U.tileHTML(p, { size: "thumb" }) + "</a>" +
        '<div class="fav-item__info"><a class="fav-item__name" href="producto.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.name) + "</a>" +
        '<span class="fav-item__price">' + money(p.price) + "</span>" +
        (p.soldOut ? '<span class="fav-item__tag">' + I("ban", { size: 14 }) + " No disponible</span>" : "") + "</div>" +
        '<button type="button" class="icon-btn icon-btn--sm" data-fav="' + esc(p.id) + '" aria-pressed="true" aria-label="Quitar de favoritos: ' + esc(p.name) + '">' + I("heart-fill", { size: 20 }) + "</button></li>"
      );
    }).join("") + "</ul>";
  }

  /* --- Carrito (C44: overlay de derecha a izquierda) ------------------------ */
  function cartHTML() {
    return (
      '<header class="drawer__head"><h2 class="drawer__title">Carrito de compra <span class="drawer__count" data-cart-count-text></span></h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="Cerrar carrito">' + I("close", { size: 24 }) + "</button></header>" +
      '<div class="cart-ship" data-cart-ship hidden></div>' +
      '<div class="drawer__body" data-cart-body></div>' +
      '<footer class="drawer__foot cart-foot" data-cart-foot></footer>'
    );
  }
  function variantText(it) {
    return [it.color.name, it.fitName, it.size === "Única" ? "" : "Talla " + it.size, it.print ? "Estampado " + it.print.name : ""]
      .filter(Boolean).join(" · ");
  }
  function renderCart() {
    const items = S.cart.items();
    const bodyEl = $("[data-cart-body]");
    const foot = $("[data-cart-foot]");
    const ship = $("[data-cart-ship]");
    const count = $("[data-cart-count-text]");
    if (!bodyEl) return;
    count.textContent = items.length ? "(" + S.cart.count() + ")" : "";

    if (!items.length) {
      ship.hidden = true;
      bodyEl.innerHTML =
        '<div class="empty">' + I("cart", { size: 44, stroke: 1.2 }) + '<p class="empty__title">Tu carrito está vacío</p>' +
        '<p class="empty__text">Cuando agregues prendas las verás aquí.</p>' +
        '<button type="button" class="btn btn--primary" data-close>Seguir mirando</button></div>';
      foot.innerHTML = "";
      foot.hidden = true;
      return;
    }
    foot.hidden = false;

    const sh = S.cart.shipping();
    ship.hidden = false;
    ship.setAttribute("data-state", sh.status);
    ship.innerHTML = sh.status === "free"
      ? I("truck", { size: 22 }) + '<p>Tu pedido tiene <strong>ENVÍO GRATIS</strong></p>'
      : I("truck", { size: 22 }) + '<p><strong>ENVÍO NO INCLUIDO</strong><span> · costo adicional, se coordina por WhatsApp</span></p>';

    bodyEl.innerHTML = '<ul class="cart-lines">' + items.map(function (it) {
      const p = it.product;
      return (
        '<li class="cart-line" data-key="' + esc(it.key) + '">' +
        '<a class="cart-line__thumb" href="producto.html?id=' + encodeURIComponent(p.id) + '" tabindex="-1" aria-hidden="true">' + U.tileHTML(p, { size: "thumb", alt: "", color: it.colorId }) + "</a>" +
        '<div class="cart-line__info">' +
        '<a class="cart-line__name" href="producto.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.name) + "</a>" +
        '<p class="cart-line__variant">' + esc(variantText(it)) + "</p>" +
        (p.envioGratis ? '<p class="cart-line__ship">' + I("truck", { size: 13 }) + " Incluye envío gratis</p>" : "") +
        '<div class="cart-line__row">' + U.stepperHTML(it.qty) + '<span class="cart-line__price">' + money(it.lineTotal) + "</span></div></div>" +
        '<button type="button" class="icon-btn icon-btn--sm cart-line__remove" data-remove aria-label="Quitar ' + esc(p.name) + ' del carrito">' + I("trash", { size: 18 }) + "</button></li>"
      );
    }).join("") + "</ul>";

    /* Cupón aplicado: "Descuento (CÓDIGO)" con el monto; si no llega al mínimo o no aplica, el motivo.
       Sin cupón: CTA del pop-up (solo si aún no se suscribió, con el modal activo y un cupón de bienvenida vigente);
       ya suscrita con su código sin aplicar (lo quitó o lo cambió): "Usar mi código X". */
    const info = S.cart.discountInfo();
    const mine = S.discount.pendingClaim();
    let promo = "";
    if (info.coupon) {
      promo = info.amount
        ? '<p class="cart-promo is-on" data-cart-promo>' + I("tag", { size: 16 }) + " <span>Código <strong>" + esc(info.code) + "</strong> aplicado · " + esc(info.label) + " de descuento" +
          (info.partial ? " en productos participantes" : "") + "</span></p>"
        : '<p class="cart-promo is-warn" data-cart-promo>' + I("info", { size: 16 }) + " <span>Código <strong>" + esc(info.code) + "</strong> · " + esc(info.message) + "</span></p>";
    } else if (mine) {
      promo = '<button type="button" class="cart-promo" data-claimed-apply>' + I("tag", { size: 16 }) + " Usar mi código <strong>" + esc(mine.code) + "</strong> · " + esc(mine.label) + " de descuento</button>";
    } else if (C.discountEnabled && !S.discount.claimed()) {
      promo = '<button type="button" class="cart-promo" data-discount-open>' + I("tag", { size: 16 }) + " " + esc(fill(DM.offerText)) + "</button>";
    }
    foot.innerHTML =
      promo +
      '<dl class="totals"><div><dt>Subtotal</dt><dd>' + money(S.cart.subtotal()) + "</dd></div>" +
      (info.coupon
        ? '<div class="totals__disc' + (info.amount ? "" : " is-zero") + '" data-cart-disc><dt>Descuento (' + esc(info.code) + ")</dt><dd>" + (info.amount ? "−" + money(info.amount) : money(0)) + "</dd></div>"
        : "") +
      "</dl>" +
      '<p class="cart-note">El envío y los demás datos se confirman al finalizar tu compra.</p>' +
      '<a class="btn btn--whatsapp btn--block" href="checkout.html">' + I("whatsapp", { size: 20 }) + " Comprar por WhatsApp</a>" +
      '<button type="button" class="btn btn--outline btn--block" data-close>Seguir mirando</button>';
  }

  /* ======================================================================
     Pop-up de descuento (referencia: "Tu camino de fe comienza…")
     ====================================================================== */
  /* Textos e imagen desde discountModal (contrato §3); {descuento} = etiqueta del cupón de bienvenida */
  function discountModalHTML() {
    const img = U.safeUrl(C.discountImage);
    return (
      '<button type="button" class="modal__close modal__close--on-media" data-close aria-label="Cerrar">' + I("close", { size: 24 }) + "</button>" +
      (img
        ? '<div class="discount__media discount__media--img" aria-hidden="true"><img src="' + esc(img) + '" alt="" decoding="async"></div>'
        : '<div class="discount__media" aria-hidden="true"><div class="discount__sun"></div>' +
          '<svg class="discount__crosses" viewBox="0 0 120 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M60 8v34M52 17h16M30 24v22M25 30h10M90 24v22M85 30h10"/><path d="M0 52c16-5 30-4 44 0s28 5 44 1 22-5 32-1" stroke-width="2.4"/></svg></div>') +
      '<div class="discount__body">' +
      '<div class="discount__form-wrap">' +
      '<h2 class="discount__title" id="discount-title">' + rich(DM.title, { fill: true }) + "</h2>" +
      '<hr class="discount__rule">' +
      '<p class="discount__offer">' + rich(DM.offerText, { fill: true, accent: false }) + "</p>" +
      '<form class="discount__form" novalidate data-discount-form>' +
      '<div class="field"><label class="visually-hidden" for="discount-email">Correo electrónico</label>' +
      '<input class="input input--pill" id="discount-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="' + esc(DM.placeholder) + '" data-autofocus></div>' +
      '<button type="submit" class="btn btn--primary btn--pill btn--block">' + esc(fill(DM.buttonLabel)) + "</button></form>" +
      '<p class="discount__fine">' + rich(DM.fine, { fill: true, accent: false }) + "</p></div>" +
      '<div class="discount__success" data-discount-success hidden>' +
      '<div class="discount__check">' + I("check", { size: 30, stroke: 2.2 }) + "</div>" +
      '<h2 class="discount__title">' + rich(DM.successTitle, { fill: true }) + "</h2>" +
      '<div class="discount__with-code" data-discount-with-code>' +
      '<p class="discount__offer" data-discount-applied-msg>' + rich(DM.successOffer, { fill: true, accent: false }) + "</p>" +
      /* Código recibido pero NO aplicado ahora (lo quitó o lo cambió por otro): no se dice «ya está aplicado» */
      '<p class="discount__offer" data-discount-pending-msg hidden>Este es tu código de bienvenida:</p>' +
      '<div class="discount__code"><strong data-discount-code></strong>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-copy-code aria-label="Copiar el código de descuento">' + I("copy", { size: 16 }) + " Copiar</button></div>" +
      '<p class="discount__fine" data-discount-applied-fine>' + rich(DM.successFine, { fill: true, accent: false }) + "</p></div>" +
      /* Suscrito sin cupón (el de bienvenida dejó de estar vigente justo antes de enviar) */
      '<p class="discount__offer" data-discount-no-code hidden>' + esc(THANKS) + "</p>" +
      '<button type="button" class="btn btn--primary btn--pill btn--block" data-close>' + esc(fill(DM.successButton)) + "</button></div>" +
      "</div>"
    );
  }

  /* Botón en espera (petición en curso): deshabilitado + texto temporal; busy(btn, false) lo restaura */
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      if (btn.__label == null) btn.__label = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = label || "Enviando…";
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      if (btn.__label != null) { btn.innerHTML = btn.__label; btn.__label = null; }
    }
  }

  /* Enlaza un formulario de suscripción (pop-up o Comunidad). source: "popup" | "community".
     Registra el correo (Mercy.store.discount.claim → API o modo local) y llama a onOk(resultado) solo si salió bien;
     los errores (correo inválido, sin red, demasiados intentos) se muestran en el campo. */
  function bindDiscountForm(form, onOk, source) {
    if (form.__bound) return;
    form.__bound = true;
    const input = $('input[type="email"]', form);
    const btn = $('button[type="submit"]', form);
    let sending = false;
    input.addEventListener("input", function () { if (input.getAttribute("aria-invalid")) U.setError(input, U.validators.email(input.value)); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      const msg = U.validators.email(input.value);
      if (!U.setError(input, msg)) { input.focus(); return; }   /* C31: no avanza si falta el dato */
      sending = true;
      busy(btn, true, "Enviando…");
      form.setAttribute("aria-busy", "true");
      S.discount.claim(input.value, source || "popup").then(function (r) {
        sending = false;
        busy(btn, false);
        form.removeAttribute("aria-busy");
        if (!r.ok) { U.setError(input, r.message); input.focus(); return; }
        onOk && onOk(r);
      });
    });
  }

  /* Estado del pop-up: formulario o éxito (con el código REAL recibido, o solo agradecimiento si no hubo cupón).
     «Tu código … ya está aplicado» (successOffer/successFine) solo si ese código es el aplicado ahora. */
  function syncDiscountModal() {
    const el = discountUI.el;
    if (!el) return;
    const claimed = S.discount.claimed();
    const code = S.discount.claimedCode();
    const applied = S.discount.claimedApplied();
    $("[data-discount-form]", el).closest(".discount__form-wrap").hidden = claimed;
    $("[data-discount-success]", el).hidden = !claimed;
    $("[data-discount-code]", el).textContent = code;
    $("[data-discount-with-code]", el).hidden = !code;
    $("[data-discount-no-code]", el).hidden = !!code;
    $("[data-discount-applied-msg]", el).hidden = !applied;
    $("[data-discount-applied-fine]", el).hidden = !applied;
    $("[data-discount-pending-msg]", el).hidden = applied;
  }

  const discountUI = {
    el: null,
    open: function () {
      const el = discountUI.el;
      if (U.overlay.isOpen(el)) return;
      const claimed = S.discount.claimed();
      if (!claimed && !C.discountEnabled) return;          /* modal apagado o sin cupón de bienvenida vigente */
      syncDiscountModal();
      U.overlay.open(el);
    },
    close: function () { U.overlay.close(discountUI.el); },
    /* Auto-apertura en el Inicio (una vez por sesión) */
    scheduleAutoOpen: function (ms) {
      if (!C.discountAutoOpen || S.discount.claimed() || S.session.get("popupSeen")) return;
      setTimeout(function () {
        if (S.discount.claimed() || S.session.get("popupSeen") || U.overlay.top()) return;
        S.session.set("popupSeen", "1");
        discountUI.open();
      }, ms == null ? C.discountPopupDelay : ms);
    },
    bindForm: bindDiscountForm
  };

  /* ======================================================================
     Footer (C15–C19)
     ====================================================================== */
  function footerHTML() {
    const tagline = txt(TX.footerTagline, "");
    const legal = txt(TX.footerLegal, "");
    return (
      '<footer class="site-footer"><div class="site-footer__inner">' +
      '<div class="site-footer__brand">' +
      '<a class="footer-logo" href="index.html" aria-label="' + esc(BRAND) + ' — inicio"><img src="' + esc(U.safeUrl(C.logo.beige)) + '" alt="' + esc(BRAND) + '" width="170" height="85" loading="lazy" decoding="async"></a>' +
      (tagline.trim() ? '<p class="site-footer__tagline">' + rich(tagline, { accent: false }) + "</p>" : "") +
      socialLinks("social social--footer") + "</div>" +
      '<nav class="site-footer__col" aria-label="Tienda"><h2 class="site-footer__h">Tienda</h2><ul>' +
      '<li><a href="catalogo.html?vista=novedades">' + esc(txt(CAT_TX.newTitle, "Novedades")) + "</a></li>" +
      D.CATEGORIES.filter(function (c) { return c.inFooter; }).map(function (c) { return '<li><a href="catalogo.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + "</a></li>"; }).join("") +
      "</ul></nav>" +
      '<nav class="site-footer__col" aria-label="Ayuda"><h2 class="site-footer__h">Ayuda</h2><ul>' +
      '<li><button type="button" data-info="tallas">Guía de tallas</button></li>' +
      '<li><button type="button" data-info="envios">Envíos</button></li>' +
      '<li><button type="button" data-info="cambios">Cambios y devoluciones</button></li>' +
      '<li><a href="' + esc(WA_HELLO) + '" target="_blank" rel="noopener">WhatsApp' + (C.whatsappDisplay ? ": " + esc(C.whatsappDisplay) : "") + "</a></li></ul></nav>" +
      '<nav class="site-footer__col site-footer__col--follow" aria-label="Síguenos"><h2 class="site-footer__h">Síguenos</h2><ul>' +
      SOCIAL.map(function (n) { return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + n.name + "</a></li>"; }).join("") +
      '<li><a href="' + esc(WA_HELLO) + '" target="_blank" rel="noopener">WhatsApp</a></li></ul></nav>' +
      "</div>" +
      (legal.trim() ? '<div class="site-footer__legal"><p>' + rich(legal, { accent: false }) + "</p></div>" : "") + "</footer>"
    );
  }

  /* ======================================================================
     Modales informativos: guía de tallas, envíos y cambios
     ====================================================================== */
  /* Guía de tallas: `chartId` = id de la guía (categories[].sizeChart). Pestañas = guías (nombre), hormas = claves de rows. */
  function unitLabel(chart) { return chart && chart.unit ? " (" + esc(chart.unit) + ")" : ""; }
  /* Medida con coma decimal (es-CO): 52.5 → "52,5"; en textos ("50.5-52") solo decimales de 1–2 cifras (no toca "1.000") */
  function measure(v) {
    if (typeof v === "number") return isFinite(v) ? String(v).replace(".", ",") : "";
    return String(v == null ? "" : v).replace(/(\d)\.(\d{1,2})(?!\d)/g, "$1,$2");
  }
  function sizeTableHTML(chartId, fit) {
    const chart = D.SIZE_CHARTS[chartId];
    if (!chart) return "";
    const rows = chart[fit] || chart.regular || chart[chart.fits[0]] || [];
    const cols = chart.head.length;
    return (
      '<table class="size-table"><thead><tr>' + chart.head.map(function (h, i) { return '<th scope="col">' + esc(h) + (i ? unitLabel(chart) : "") + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) {
        const cells = r.slice(1, Math.max(cols, 1));
        while (cells.length < cols - 1) cells.push("");
        return '<tr><th scope="row">' + esc(r[0]) + "</th>" + cells.map(function (v) { return "<td>" + esc(measure(v)) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table>"
    );
  }
  /* Nota de la guía (texts.sizeGuideNote). Un paréntesis final se muestra en cursiva, como "(Valores de ejemplo.)" */
  function sizeNoteHTML(cls) {
    const note = txt(TX.sizeGuideNote, "").trim();
    if (!note) return "";
    return '<p class="' + cls + '">' + esc(note).replace(/\s*(\([^()]*\))$/, " <em>$1</em>") + "</p>";
  }
  function openSizeGuide(chartId, fit) {
    const ids = D.SIZE_CHART_IDS.slice();
    if (!ids.length) {
      U.infoModal("size-guide", "Guía de tallas", "<p>Pronto publicaremos la guía de tallas. Si tienes dudas con tu talla, escríbenos por WhatsApp.</p>");
      return;
    }
    chartId = D.SIZE_CHARTS[chartId] ? chartId : ids[0];
    function render(id, f) {
      const chart = D.SIZE_CHARTS[id];
      const fits = chart.fits;
      f = fits.indexOf(f) > -1 ? f : fits[0];
      const tabs = '<div class="seg" role="tablist" aria-label="Categoría">' + ids.map(function (c) {
        return '<button type="button" role="tab" class="seg__btn' + (c === id ? " is-on" : "") + '" aria-selected="' + (c === id) + '" data-sg-cat="' + esc(c) + '">' + esc(D.SIZE_CHARTS[c].name) + "</button>";
      }).join("") + "</div>";
      const fitTabs = '<div class="seg seg--sm" role="tablist" aria-label="Horma">' + fits.map(function (k) {
        return '<button type="button" role="tab" class="seg__btn' + (k === f ? " is-on" : "") + '" aria-selected="' + (k === f) + '" data-sg-fit="' + esc(k) + '">' + esc(D.FITS[k] || k) + "</button>";
      }).join("") + "</div>";
      return tabs + fitTabs + '<div class="size-guide__table">' + sizeTableHTML(id, f) + "</div>" + sizeNoteHTML("modal__note");
    }
    const el = U.infoModal("size-guide", "Guía de tallas", render(chartId, fit));
    const content = $(".modal__content", el);
    let curCat = chartId, curFit = fit;
    content.onclick = function (e) {
      const c = e.target.closest("[data-sg-cat]"), f = e.target.closest("[data-sg-fit]");
      if (c) { curCat = c.getAttribute("data-sg-cat"); curFit = null; }
      else if (f) { curFit = f.getAttribute("data-sg-fit"); }
      else return;
      content.innerHTML = render(curCat, curFit);
    };
  }
  function openInfo(kind, extra) {
    if (kind === "tallas") return openSizeGuide(extra && extra.category, extra && extra.fit);
    if (kind === "envios") {
      return U.infoModal("info-envios", "Envíos",
        (D.SHIPPING_INFO.trim() ? "<p>" + rich(D.SHIPPING_INFO, { accent: false }) + "</p>" : "") +
        '<ul class="check-list"><li>' + I("truck", { size: 18 }) + "<span><strong>Envío gratis</strong> si al menos una prenda de tu carrito lo incluye.</span></li>" +
        "<li>" + I("info", { size: 18 }) + "<span><strong>Envío no incluido</strong> cuando ninguna prenda lo incluye: el costo adicional se coordina por WhatsApp.</span></li></ul>");
    }
    if (kind === "cambios") return U.infoModal("info-cambios", "Cambios y devoluciones", "<p>" + rich(D.RETURNS_INFO, { accent: false }) + "</p>");
  }

  /* ======================================================================
     Inicialización
     ====================================================================== */
  const layout = {
    headerMode: headerMode,
    sizeTableHTML: sizeTableHTML,
    sizeNoteHTML: sizeNoteHTML,
    openSizeGuide: openSizeGuide,
    openInfo: openInfo,
    cartEl: null, menuEl: null, searchEl: null, favsEl: null,

    open: function (name) {
      const map = { menu: layout.menuEl, search: layout.searchEl, favs: layout.favsEl, cart: layout.cartEl };
      const el = map[name];
      if (!el) return;
      /* Solo un panel lateral/superior a la vez */
      ["menuEl", "searchEl", "favsEl", "cartEl"].forEach(function (k) { if (layout[k] !== el && U.overlay.isOpen(layout[k])) U.overlay.close(layout[k]); });
      if (name === "cart") renderCart();
      if (name === "favs") renderFavs();
      if (name === "search") renderSearch($("#search-input").value || "");
      U.overlay.open(el);
      const btn = $('[data-open="' + name + '"]');
      if (btn) btn.setAttribute("aria-expanded", "true");
      /* C29: al abrir el carrito vuelve a aparecer el CTA del descuento */
      if (name === "cart" && C.discountOnCartOpen !== false && !S.discount.claimed()) {
        setTimeout(function () { if (U.overlay.isOpen(layout.cartEl) && !S.discount.claimed()) discountUI.open(); }, 450);
      }
    },
    close: function (name) {
      const map = { menu: layout.menuEl, search: layout.searchEl, favs: layout.favsEl, cart: layout.cartEl };
      if (map[name]) U.overlay.close(map[name]);
    },
    openCart: function () { layout.open("cart"); },
    renderCart: renderCart,
    renderFavs: renderFavs
  };

  /* ======================================================================
     Barra de edición (sesión del panel abierta + servidor activo)
     Pastilla flotante abajo a la izquierda: "Editar esta página" → ruta del panel (contrato §7) · "Panel".
     ====================================================================== */
  function adminRoute() {
    const path = location.pathname;
    if (/(^|\/)catalogo\.html$/.test(path)) return "#/productos";
    if (/(^|\/)producto\.html$/.test(path)) {
      const raw = (U.qs().get("id") || "").trim();
      const p = raw ? D.byId(raw) : null;            /* id anterior de un producto renombrado → el actual */
      const id = p ? p.id : raw;
      return id ? "#/productos/" + encodeURIComponent(id) : "#/productos";
    }
    if (/(^|\/)checkout\.html$/.test(path)) return "#/descuento";
    return "#/inicio";
  }
  function mountEditBar() {
    if (!ADMIN_SESSION || !(Mercy.api && Mercy.api.enabled)) return;
    const bar = document.createElement("nav");
    bar.className = "edit-bar";
    bar.setAttribute("aria-label", "Edición del sitio");
    bar.setAttribute("data-edit-bar", "");
    bar.innerHTML =
      '<a class="edit-bar__link edit-bar__link--main" href="admin/' + esc(adminRoute()) + '" data-edit-link>' + I("edit", { size: 16 }) +
      '<span>Editar<span class="edit-bar__more"> esta página</span></span></a>' +
      '<span class="edit-bar__sep" aria-hidden="true"></span>' +
      '<a class="edit-bar__link" href="admin/" data-edit-panel>Panel</a>';
    body.appendChild(bar);
    body.classList.add("has-edit-bar");
  }

  function updateBadges() {
    const n = S.cart.count();
    $$("[data-cart-count]").forEach(function (b) { b.textContent = n > 99 ? "99+" : n; b.hidden = n === 0; });
    const f = S.favs.count();
    $$("[data-fav-count]").forEach(function (b) { b.textContent = f; b.hidden = f === 0; });
    const cb = $('[data-open="cart"]');
    if (cb) cb.setAttribute("aria-label", n ? "Abrir carrito, " + U.pluralize(n, "artículo", "artículos") : "Abrir carrito");
  }

  function init() {
    /* Estructura base */
    const skip = document.createElement("a");
    skip.className = "skip-link"; skip.href = "#main"; skip.textContent = "Saltar al contenido";
    body.insertBefore(skip, body.firstChild);

    const shell = document.createElement("div");
    shell.className = "shell-top";
    shell.innerHTML = (headerMode === "minimal" ? "" : topStripHTML()) + headerHTML();
    body.insertBefore(shell, skip.nextSibling);
    /* Sin franja superior (texts.topStrip vacío) el hero ocupa toda la pantalla */
    if (!$(".topstrip", shell)) document.documentElement.style.setProperty("--strip-h", "0px");
    body.classList.add("has-header-" + headerMode);

    if (footerMode !== "none") {
      const holder = document.createElement("div");
      holder.innerHTML = footerHTML();
      body.appendChild(holder.firstChild);
    }

    /* Paneles */
    layout.menuEl = U.createDrawer({ id: "menu-drawer", side: "left", cls: "drawer--menu", label: "Menú principal", html: menuHTML() });
    layout.favsEl = U.createDrawer({ id: "favs-drawer", side: "right", label: "Favoritos", html: favsHTML() });
    layout.cartEl = U.createDrawer({ id: "cart-drawer", side: "right", cls: "drawer--cart", label: "Carrito de compra", html: cartHTML() });

    const sp = document.createElement("div");
    sp.id = "search-panel"; sp.className = "search-panel"; sp.hidden = true;
    sp.setAttribute("role", "dialog"); sp.setAttribute("aria-modal", "true"); sp.setAttribute("aria-label", "Buscar productos");
    sp.setAttribute("aria-hidden", "true"); sp.setAttribute("inert", "");
    sp.innerHTML = searchHTML();
    body.appendChild(sp);
    layout.searchEl = sp;

    discountUI.el = U.createModal({ id: "discount-modal", cls: "modal--discount", label: "Descuento de bienvenida", html: discountModalHTML() });
    $(".modal__box", discountUI.el).classList.add("discount");
    bindDiscountForm($("[data-discount-form]", discountUI.el), function (r) {
      syncDiscountModal();
      U.toast(r.coupon ? "¡Listo! Tu descuento del " + r.coupon.label + " quedó aplicado" : THANKS, { icon: "check" });
      const closeBtn = $("[data-discount-success] [data-close]", discountUI.el); if (closeBtn) closeBtn.focus();
    }, "popup");
    syncDiscountModal();

    /* WhatsApp flotante (no en checkout) */
    if (headerMode !== "minimal") {
      const fab = document.createElement("a");
      fab.className = "wa-fab"; fab.href = U.waLink(U.waGreeting(", quiero más información"));
      fab.target = "_blank"; fab.rel = "noopener"; fab.setAttribute("aria-label", "Escríbenos por WhatsApp");
      fab.innerHTML = I("whatsapp", { size: 28 });
      body.appendChild(fab);
    }
    mountEditBar();

    /* Header: estado transparente sobre el hero / sólido al hacer scroll */
    const header = $("#site-header");
    /* Color de la barra del navegador (iOS/Android): oscuro mientras se ve la franja café; crema cuando manda el header. */
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) { themeMeta = document.createElement("meta"); themeMeta.name = "theme-color"; document.head.appendChild(themeMeta); }
    const css = getComputedStyle(document.documentElement);
    const THEME_DARK = (css.getPropertyValue("--tinta") || "#2a1e14").trim();
    const THEME_LIGHT = (css.getPropertyValue("--crema") || "#fff5e4").trim();
    const stripEl = $(".topstrip");
    function syncThemeColor(y) {
      const c = stripEl && y < stripEl.offsetHeight - 1 ? THEME_DARK : THEME_LIGHT;
      if (themeMeta.getAttribute("content") !== c) themeMeta.setAttribute("content", c);
    }
    function onScroll() {
      const y = window.scrollY || document.documentElement.scrollTop;
      header.classList.toggle("is-scrolled", y > 24);
      header.classList.toggle("is-transparent", headerMode === "hero" && y <= 24);
      syncThemeColor(y);
    }
    onScroll();
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { onScroll(); ticking = false; });
    }, { passive: true });

    /* Delegación de eventos globales */
    document.addEventListener("click", function (e) {
      const open = e.target.closest("[data-open]");
      if (open) { e.preventDefault(); layout.open(open.getAttribute("data-open")); return; }

      const fav = e.target.closest("[data-fav]");
      if (fav) {
        e.preventDefault(); e.stopPropagation();
        const id = fav.getAttribute("data-fav");
        const on = S.favs.toggle(id);
        const p = D.byId(id);
        if (on && p && !fav.closest(".drawer")) U.toast("Guardado en tus favoritos: " + p.name, { icon: "heart-fill" });
        return;
      }

      const info = e.target.closest("[data-info]");
      if (info) { e.preventDefault(); if (U.overlay.isOpen(layout.menuEl)) U.overlay.close(layout.menuEl); openInfo(info.getAttribute("data-info")); return; }

      if (e.target.closest("[data-discount-open]")) { e.preventDefault(); discountUI.open(); return; }

      /* «Usar mi código X» (carrito): aplica de verdad el código que recibió al suscribirse (se vuelve a validar) */
      const useMine = e.target.closest("[data-claimed-apply]");
      if (useMine && layout.cartEl && layout.cartEl.contains(useMine)) {
        e.preventDefault();
        const mine = S.discount.pendingClaim();
        if (!mine || useMine.disabled) return;
        useMine.disabled = true;
        S.discount.applyCoupon(mine.code).then(function (r) {
          useMine.disabled = false;
          if (r.ok) U.toast(r.message, { icon: "check" });
          else U.toast(r.message, { icon: "info", ms: 4200 });
        });
        return;
      }

      const sterm = e.target.closest("[data-search-term]");
      if (sterm) { const inp = $("#search-input"); inp.value = sterm.getAttribute("data-search-term"); renderSearch(inp.value); inp.focus(); return; }
      if (e.target.closest("[data-search-clear]")) { const inp = $("#search-input"); inp.value = ""; renderSearch(""); inp.focus(); return; }

      /* Copiar el código REAL que se muestra junto al botón (pop-up o Comunidad) */
      const copy = e.target.closest("[data-copy-code]");
      if (copy) {
        const shown = copy.parentElement && copy.parentElement.querySelector("strong");
        const code = ((shown && shown.textContent) || S.discount.claimedCode() || S.discount.code()).trim();
        if (!code) return;
        const done = function () { U.toast("Código copiado: " + code, { icon: "check" }); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, done); else done();
        return;
      }

      /* Carrito: cantidad y eliminar */
      const line = e.target.closest(".cart-line");
      if (line && layout.cartEl.contains(line)) {
        const key = line.getAttribute("data-key");
        const step = e.target.closest("[data-step]");
        if (step) {
          const it = S.cart.items().filter(function (x) { return x.key === key; })[0];
          if (!it) return;
          const next = it.qty + parseInt(step.getAttribute("data-step"), 10);
          if (next < 1) { S.cart.remove(key); return; }
          if (next > it.stock) { U.toast("Solo quedan " + it.stock + " unidades de esta talla", { icon: "info" }); return; }
          S.cart.setQty(key, next);
          return;
        }
        if (e.target.closest("[data-remove]")) { S.cart.remove(key); return; }
      }

      /* Logo: si ya estás en el inicio, sube arriba suavemente (C38) */
      const logo = e.target.closest("[data-logo]");
      if (logo && /(^|\/)(index\.html)?$/.test(location.pathname) && !location.search && !location.hash) {
        e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" });
      }

      /* Botón volver del checkout */
      const back = e.target.closest("[data-back]");
      if (back && document.referrer && document.referrer.indexOf(location.host) > -1 && history.length > 1) { e.preventDefault(); history.back(); }
    });

    /* Cuando se cierra un panel, restablece aria-expanded en los disparadores */
    document.addEventListener("mercy:overlay-close", function () {
      $$("[data-open]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    });

    /* Búsqueda en vivo */
    const sInput = $("#search-input");
    sInput.addEventListener("input", U.debounce(function () { renderSearch(sInput.value); }, 120));
    sInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && sInput.value.trim()) { location.href = "catalogo.html?q=" + encodeURIComponent(sInput.value.trim()); }
    });

    /* Reacciones al estado */
    document.addEventListener("mercy:cart", function () { updateBadges(); if (U.overlay.isOpen(layout.cartEl) || layout.cartEl) renderCart(); });
    document.addEventListener("mercy:favs", function () { updateBadges(); U.syncFavButtons(); renderFavs(); });
    document.addEventListener("mercy:discount", function () { renderCart(); if (!U.overlay.isOpen(discountUI.el)) syncDiscountModal(); });
    updateBadges(); renderCart(); renderFavs();

    /* Foco sobre el ancla al cargar con #hash (header sticky) */
    document.documentElement.style.scrollPaddingTop = "calc(var(--header-h) + 12px)";
  }

  Mercy.layout = layout;
  Mercy.search = search;
  Mercy.discount = discountUI;
  Mercy.cartUI = { open: layout.openCart, close: function () { layout.close("cart"); } };

  init();
})();
