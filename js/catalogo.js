/* ==========================================================================
   Mercy Studio — catalogo.js
   Pantalla CATÁLOGO: título según URL, píldoras de categoría, filtros en
   acordeón CERRADO (C41/C42), orden, chips activos, grilla con "Ver más",
   estado vacío y sincronía con la URL (history.replaceState).
   Textos desde Mercy.content.texts.catalog; rango de precios, tallas, hormas y colores
   se calculan de los productos publicados.
   ========================================================================== */
(function () {
  "use strict";

  const U = Mercy.ui, D = Mercy.data, C = Mercy.config;
  const I = U.icon, $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;
  const TXC = (Mercy.content && Mercy.content.texts && Mercy.content.texts.catalog) || {};
  const tx = U.tx;
  function txt(v, d) { return v == null ? d : String(v); }
  /* «Catálogo» en el <title>, las migas y la etiqueta del móvil = texts.catalog.eyebrow (si está vacío, «Catálogo») */
  const CAT_LABEL = U.plain(txt(TXC.eyebrow, "")).trim() || "Catálogo";

  /* --- Constantes (calculadas de los productos publicados) -------------------- */
  const STEP = 5000;
  const PRICES = D.PRODUCTS.map(function (p) { return p.price; });
  const PRICE_MIN = PRICES.length ? Math.floor(Math.min.apply(null, PRICES) / STEP) * STEP : 20000;
  const PRICE_MAX = PRICES.length ? Math.max(PRICE_MIN + STEP, Math.ceil(Math.max.apply(null, PRICES) / STEP) * STEP) : 150000;
  /* Tallas del filtro: las de los productos (sin "Única"), en orden de tallaje */
  const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];
  const SIZES = (function () {
    const all = [];
    D.PRODUCTS.forEach(function (p) { p.sizes.forEach(function (s) { if (all.indexOf(s) < 0 && !/^[úu]nica$/i.test(s)) all.push(s); }); });
    const rank = function (s) { const i = SIZE_ORDER.indexOf(s.toUpperCase()); return i < 0 ? 100 : i; };
    return all.sort(function (a, b) { return rank(a) - rank(b); });
  })();
  const CAT_IDS = D.CATEGORIES.map(function (c) { return c.id; });
  /* Categorías con al menos un producto publicado (píldoras y filtro) */
  const CATS_WITH = D.CATEGORIES.filter(function (c) { return D.PRODUCTS.some(function (p) { return p.category === c.id; }); });
  const FIT_IDS = Object.keys(D.FITS).filter(function (f) {
    return D.PRODUCTS.some(function (p) { return p.fits.indexOf(f) > -1; });
  });
  const COLOR_IDS = Object.keys(D.COLORS).filter(function (id) {
    return D.PRODUCTS.some(function (p) { return p.colors.indexOf(id) > -1; });
  });
  const VISTAS = ["mas-vendidos", "novedades"];
  const SORTS = [
    { id: "relevancia", label: "Relevancia", onlyQ: true },
    /* Las vistas toman su nombre del panel (texts.catalog.bestTitle / newTitle), como el menú y el título */
    { id: "mas-vendidos", label: U.plain(txt(TXC.bestTitle, "Los más vendidos")), fn: function (a, b) { return a.bestRank - b.bestRank; } },
    { id: "novedades", label: U.plain(txt(TXC.newTitle, "Novedades")), fn: function (a, b) { return a.newRank - b.newRank; } },
    { id: "precio-asc", label: "Precio: menor a mayor", fn: function (a, b) { return a.price - b.price || a.bestRank - b.bestRank; } },
    { id: "precio-desc", label: "Precio: mayor a menor", fn: function (a, b) { return b.price - a.price || a.bestRank - b.bestRank; } },
    { id: "nombre", label: "Nombre A–Z", fn: function (a, b) { return a.name.localeCompare(b.name, "es"); } }
  ];

  /* --- Estado (se restaura desde la URL) ------------------------------------ */
  function csv(params, key, allowed, tf) {
    const raw = params.get(key);
    const out = [];
    if (!raw) return out;
    raw.split(",").forEach(function (v) {
      v = (tf ? tf(v) : v).trim();
      if (allowed.indexOf(v) > -1 && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }
  function snap(n) { return Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(n / STEP) * STEP)); }

  const params = U.qs();
  const state = {
    q: (params.get("q") || "").trim().slice(0, 80),
    vista: VISTAS.indexOf(params.get("vista")) > -1 ? params.get("vista") : "",
    cat: csv(params, "cat", CAT_IDS),
    fit: csv(params, "fit", FIT_IDS),
    talla: csv(params, "talla", SIZES, function (v) { const u = v.trim().toUpperCase(); return SIZES.filter(function (s) { return s.toUpperCase() === u; })[0] || v; }),
    color: csv(params, "color", COLOR_IDS),
    pmin: PRICE_MIN,
    pmax: PRICE_MAX,
    stock: params.get("stock") === "1",
    orden: params.get("orden") || "",
    pages: Math.max(1, parseInt(params.get("pag"), 10) || 1)
  };
  (function () {
    const m = /^(\d+)-(\d+)$/.exec(params.get("precio") || "");
    if (!m) return;
    let lo = snap(+m[1]), hi = snap(+m[2]);
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    if (hi - lo < STEP) { if (hi + STEP <= PRICE_MAX) hi = lo + STEP; else lo = hi - STEP; }
    state.pmin = lo; state.pmax = hi;
  })();

  function defaultSort() { return state.q ? "relevancia" : (state.vista === "novedades" ? "novedades" : "mas-vendidos"); }
  function currentSort() {
    const s = SORTS.filter(function (x) { return x.id === state.orden && (!x.onlyQ || state.q); })[0];
    return s ? s.id : defaultSort();
  }
  function priceActive() { return state.pmin > PRICE_MIN || state.pmax < PRICE_MAX; }
  function filterCount() {
    return state.cat.length + state.fit.length + state.talla.length + state.color.length + (priceActive() ? 1 : 0) + (state.stock ? 1 : 0);
  }

  /* --- Referencias al DOM --------------------------------------------------- */
  const el = {
    title: $("#cat-title"), n: $("#cat-n"), qclear: $("#cat-qclear"), crumbs: $("#cat-crumbs ol"),
    pills: $("#cat-pills"), sort: $("#cat-sort"),
    filtersBtn: $("#filters-open"), filtersBtnN: $("#filters-open-n"),
    groups: $("#filters-groups"), slot: $("#filters-slot"),
    active: $("#cat-active"), activeList: $("#cat-active-list"),
    grid: $("#cat-grid"), more: $("#cat-more"), moreBtn: $("#cat-more-btn"), moreText: $("#cat-more-text"),
    similar: $("#cat-similar"), similarText: $("#cat-similar-text"), similarGrid: $("#cat-similar-grid"),
    empty: $("#cat-empty"), emptyTitle: $("#cat-empty-title"), emptyText: $("#cat-empty-text"),
    emptyClear: $("#cat-empty-clear"), emptyAll: $("#cat-empty-all"), suggest: $("#cat-suggest"),
    status: $("#cat-status")
  };
  let drawer = null, drawerCta = null, rendered = 0;

  /* Íconos declarados en el HTML con data-icon */
  $$("[data-icon]").forEach(function (n) {
    n.innerHTML = I(n.getAttribute("data-icon"), { size: +n.getAttribute("data-size") || 20, stroke: +n.getAttribute("data-stroke") || undefined });
    n.classList.add("cat-ico");
  });

  /* --- Filtrado y orden --------------------------------------------------------- */
  function sizeInStock(p, size) {
    const colors = state.color.length ? p.colors.filter(function (c) { return state.color.indexOf(c) > -1; }) : p.colors;
    return colors.some(function (c) { return D.stockOf(p, c, size) > 0; });
  }
  function matches(p) {
    if (state.cat.length && state.cat.indexOf(p.category) < 0) return false;
    if (state.fit.length && !p.fits.some(function (f) { return state.fit.indexOf(f) > -1; })) return false;
    if (state.talla.length && !state.talla.some(function (s) { return p.sizes.indexOf(s) > -1 && (!state.stock || sizeInStock(p, s)); })) return false;
    if (state.color.length && !p.colors.some(function (c) { return state.color.indexOf(c) > -1; })) return false;
    if (p.price < state.pmin || p.price > state.pmax) return false;
    if (state.stock && p.soldOut) return false;
    return true;
  }
  function compute() {
    let list, similar = [];
    if (state.q) {
      const r = Mercy.search.run(state.q);
      list = r.exact.filter(matches);
      similar = r.similar.filter(matches).slice(0, 4);
    } else {
      list = D.PRODUCTS.filter(matches);
    }
    const s = SORTS.filter(function (x) { return x.id === currentSort(); })[0];
    if (s && s.fn) list = list.slice().sort(s.fn);
    return { list: list, similar: similar };
  }

  /* --- Construcción de la interfaz (una sola vez) ------------------------------- */
  function buildSort() {
    el.sort.innerHTML = SORTS.map(function (s) {
      return '<option value="' + s.id + '"' + (s.onlyQ ? " data-q" : "") + ">" + esc(s.label) + "</option>";
    }).join("");
  }
  function syncSortOptions() {
    $$("option[data-q]", el.sort).forEach(function (o) { o.hidden = !state.q; o.disabled = !state.q; });
    el.sort.value = currentSort();
  }

  function buildPills() {
    const all = [{ id: "", name: "Todo" }].concat(CATS_WITH);
    el.pills.innerHTML = all.map(function (c) {
      return '<button type="button" class="chip" data-pill="' + esc(c.id) + '" aria-pressed="false">' + esc(c.name) + "</button>";
    }).join("");
  }
  function syncPills() {
    $$("[data-pill]", el.pills).forEach(function (b) {
      const id = b.getAttribute("data-pill");
      const on = id === "" ? state.cat.length === 0 : (state.cat.length === 1 && state.cat[0] === id);
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }
  function revealPill(btn) {
    if (!btn) return;
    const box = el.pills.getBoundingClientRect(), b = btn.getBoundingClientRect();
    if (b.left < box.left + 8) el.pills.scrollLeft += b.left - box.left - 24;
    else if (b.right > box.right - 8) el.pills.scrollLeft += b.right - box.right + 24;
  }

  function group(id, title, inner) {
    return (
      '<div class="acc filters__group" data-acc data-group="' + id + '">' +
      '<h3 class="filters__h"><button type="button" class="acc__head" id="fh-' + id + '" aria-expanded="false" aria-controls="fp-' + id + '">' +
      '<span class="filters__name">' + esc(title) + '<span class="acc-count" data-count="' + id + '" hidden></span></span>' + I("chevron-down", { size: 18 }) + "</button></h3>" +
      '<div class="acc__panel" id="fp-' + id + '" role="region" aria-labelledby="fh-' + id + '"><div class="acc__inner"><div class="filters__body">' + inner + "</div></div></div></div>"
    );
  }
  function checkRow(name, value, label, count) {
    return (
      '<label class="check"><input type="checkbox" name="' + name + '" value="' + esc(value) + '">' +
      '<span class="check__box" aria-hidden="true">' + I("check", { size: 14, stroke: 2.8 }) + "</span>" +
      '<span class="check__label">' + esc(label) + "</span>" +
      (count != null ? '<span class="check__n">' + count + "</span>" : "") + "</label>"
    );
  }
  function buildFilters() {
    const catRows = CATS_WITH.map(function (c) {
      const n = D.PRODUCTS.filter(function (p) { return p.category === c.id; }).length;
      return checkRow("cat", c.id, c.name, n);
    }).join("");
    const fitRows = FIT_IDS.map(function (f) { return checkRow("fit", f, D.FITS[f]); }).join("");
    const price =
      '<div class="range" id="price-range">' +
      '<div class="range__rail"><span class="range__fill"></span></div>' +
      '<input type="range" id="price-min" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="' + STEP + '" value="' + PRICE_MIN + '" aria-label="Precio mínimo">' +
      '<input type="range" id="price-max" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="' + STEP + '" value="' + PRICE_MAX + '" aria-label="Precio máximo">' +
      "</div>" +
      '<div class="range__vals"><output for="price-min" id="price-min-out"></output><output for="price-max" id="price-max-out"></output></div>';
    const sizes = '<div class="size-grid">' + SIZES.map(function (s) {
      return '<button type="button" class="size-btn" data-size="' + esc(s) + '" aria-pressed="false" aria-label="Talla ' + esc(s) + '">' + esc(s) + "</button>";
    }).join("") + "</div>";
    const colors = '<div class="color-grid">' + COLOR_IDS.map(function (id) {
      const c = D.color(id);
      return '<button type="button" class="swatch-btn" data-color="' + esc(id) + '" aria-pressed="false" aria-label="' + esc(c.name) + '" title="' + esc(c.name) + '"><span class="swatch" style="--c:' + c.hex + '"></span></button>';
    }).join("") + '</div><p class="filters__hint" id="color-caption"></p>';
    const stock = checkRow("stock", "1", "Solo en stock");

    el.groups.innerHTML =
      (CATS_WITH.length ? group("cat", "Categoría", '<div class="check-col">' + catRows + "</div>") : "") +
      (FIT_IDS.length ? group("fit", "Fit", '<div class="check-col">' + fitRows + "</div>") : "") +
      group("price", "Precio", price) +
      (SIZES.length ? group("size", "Talla", sizes) : "") +
      (COLOR_IDS.length ? group("color", "Color", colors) : "") +
      group("stock", "Disponibilidad", '<div class="check-col">' + stock + "</div>");

    U.initAccordions(el.groups);   /* sin data-open: TODOS cerrados al cargar */
  }

  function buildDrawer() {
    drawer = U.createDrawer({
      id: "filters-drawer", side: "left", cls: "drawer--filters", label: "Filtros",
      html:
        '<header class="drawer__head"><h2 class="drawer__title">Filtros</h2>' +
        '<button type="button" class="icon-btn" data-close aria-label="Cerrar filtros">' + I("close", { size: 24 }) + "</button></header>" +
        '<div class="drawer__body" data-drawer-slot></div>' +
        '<footer class="drawer__foot filters-foot">' +
        '<button type="button" class="btn btn--outline" data-clear-filters>Limpiar</button>' +
        '<button type="button" class="btn btn--primary" data-close data-cta>Ver resultados</button></footer>'
    });
    drawerCta = $("[data-cta]", drawer);
  }

  /* Los grupos viven en la columna lateral (>= 900 px) o dentro del panel (móvil) */
  function placeGroups() {
    const desk = window.matchMedia("(min-width: 900px)").matches;
    const target = desk ? el.slot : $("[data-drawer-slot]", drawer);
    if (el.groups.parentNode !== target) target.appendChild(el.groups);
    if (desk && U.overlay.isOpen(drawer)) U.overlay.close(drawer);
  }

  /* --- Sincronía de la interfaz con el estado ------------------------------------- */
  function setCount(id, n) {
    const b = $('[data-count="' + id + '"]', el.groups);
    if (!b) return;
    b.hidden = !n;
    b.textContent = n || "";
  }
  function syncFilters() {
    $$('input[name="cat"]', el.groups).forEach(function (i) { i.checked = state.cat.indexOf(i.value) > -1; });
    $$('input[name="fit"]', el.groups).forEach(function (i) { i.checked = state.fit.indexOf(i.value) > -1; });
    $$('input[name="stock"]', el.groups).forEach(function (i) { i.checked = state.stock; });
    $$("[data-size]", el.groups).forEach(function (b) {
      const on = state.talla.indexOf(b.getAttribute("data-size")) > -1;
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on));
    });
    $$("[data-color]", el.groups).forEach(function (b) {
      const on = state.color.indexOf(b.getAttribute("data-color")) > -1;
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on));
    });
    const cap = $("#color-caption", el.groups);
    if (cap) cap.textContent = state.color.map(function (id) { return D.color(id).name; }).join(" · ");
    syncRange();
    setCount("cat", state.cat.length); setCount("fit", state.fit.length); setCount("price", priceActive() ? 1 : 0);
    setCount("size", state.talla.length); setCount("color", state.color.length); setCount("stock", state.stock ? 1 : 0);
  }
  function syncRange() {
    const mn = $("#price-min"), mx = $("#price-max"), box = $("#price-range");
    mn.value = state.pmin; mx.value = state.pmax;
    const span = PRICE_MAX - PRICE_MIN;
    box.style.setProperty("--lo", ((state.pmin - PRICE_MIN) / span * 100) + "%");
    box.style.setProperty("--hi", ((state.pmax - PRICE_MIN) / span * 100) + "%");
    $("#price-min-out").textContent = money(state.pmin);
    $("#price-max-out").textContent = money(state.pmax) + (state.pmax >= PRICE_MAX ? "+" : "");
    mn.setAttribute("aria-valuetext", money(state.pmin));
    mx.setAttribute("aria-valuetext", money(state.pmax));
    /* si los dos pulgares coinciden en el extremo, el mínimo queda por encima para poder arrastrarlo */
    mn.style.zIndex = state.pmin > (PRICE_MIN + PRICE_MAX) / 2 ? "3" : "";
  }

  /* Retro: los títulos van en una sola tipografía (Norwester); solo "Toda la Colección" conserva la cursiva.
     C4/C5: el título de resultados es más pequeño y usa comillas “ ”. */
  function titleParts() {
    if (state.q) return { plain: "Resultados para “" + state.q + "”", html: "Resultados para “" + esc(state.q) + "”", def: false, small: true };
    const best = txt(TXC.bestTitle, "Los más vendidos"), news = txt(TXC.newTitle, "Novedades");
    if (state.vista === "mas-vendidos") return { plain: U.plain(best), html: esc(U.plain(best)), def: false };
    if (state.vista === "novedades") return { plain: U.plain(news), html: esc(U.plain(news)), def: false };
    if (state.cat.length === 1) {
      const cat = D.CATEGORIES.filter(function (c) { return c.id === state.cat[0]; })[0];
      const name = cat ? cat.name : state.cat[0];
      return { plain: name, html: esc(name), def: false };
    }
    const allT = txt(TXC.allTitle, "Toda la *Colección*");
    return { plain: U.plain(allT), html: U.rich(allT), def: true };
  }
  function renderHead(total) {
    const t = titleParts();
    el.title.innerHTML = t.html;
    el.title.classList.toggle("cat-title--sm", !!t.small);
    document.title = (t.def ? "" : t.plain + " · ") + CAT_LABEL + " — " + C.brand;
    el.n.textContent = U.pluralize(total, "diseño", "diseños");
    el.qclear.hidden = !state.q;
    el.crumbs.innerHTML = t.def
      ? '<li><a href="index.html">Inicio</a></li><li aria-current="page">' + esc(CAT_LABEL) + "</li>"
      : '<li><a href="index.html">Inicio</a></li><li><a href="catalogo.html">' + esc(CAT_LABEL) + '</a></li><li aria-current="page">' + esc(t.plain) + "</li>";
  }

  function chipHTML(k, v, label) {
    return (
      '<li><button type="button" class="chip chip--active" data-rm="' + k + '" data-v="' + esc(v) + '" aria-label="Quitar filtro: ' + esc(label) + '">' +
      "<span>" + esc(label) + "</span>" + I("close", { size: 14, stroke: 2 }) + "</button></li>"
    );
  }
  function renderActive() {
    const items = [];
    state.cat.forEach(function (id) { const c = D.CATEGORIES.filter(function (x) { return x.id === id; })[0]; items.push(chipHTML("cat", id, c ? c.name : id)); });
    state.fit.forEach(function (id) { items.push(chipHTML("fit", id, D.FITS[id])); });
    state.talla.forEach(function (s) { items.push(chipHTML("talla", s, "Talla " + s)); });
    state.color.forEach(function (id) { items.push(chipHTML("color", id, D.color(id).name)); });
    if (priceActive()) items.push(chipHTML("price", "", money(state.pmin) + " – " + money(state.pmax)));
    if (state.stock) items.push(chipHTML("stock", "", "Solo en stock"));
    el.activeList.innerHTML = items.join("");
    el.active.hidden = !items.length;
    const n = filterCount();
    el.filtersBtnN.hidden = !n;
    el.filtersBtnN.textContent = n;
    el.filtersBtn.setAttribute("aria-label", n ? "Filtros (" + n + ")" : "Filtros");
  }

  function cards(list) { return list.map(function (p) { return U.cardHTML(p); }).join(""); }

  function renderGrid(res, append) {
    const shown = Math.min(res.list.length, C.pageSize * state.pages);
    if (append && rendered > 0 && shown > rendered) {
      el.grid.insertAdjacentHTML("beforeend", cards(res.list.slice(rendered, shown)));
      const first = $$(".pcard", el.grid)[rendered];
      const link = first && $(".pcard__media", first);
      if (link) { try { link.focus({ preventScroll: true }); } catch (e) {} }
    } else {
      el.grid.innerHTML = cards(res.list.slice(0, shown));
    }
    rendered = shown;
    el.grid.hidden = !res.list.length;

    el.more.hidden = !res.list.length;
    el.moreBtn.hidden = shown >= res.list.length;
    el.moreText.textContent = "Mostrando " + shown + " de " + U.pluralize(res.list.length, "diseño", "diseños");
  }

  function renderSimilar(res) {
    const show = state.q && res.similar.length > 0;
    el.similar.hidden = !show;
    if (!show) { el.similarGrid.innerHTML = ""; return; }
    el.similarText.textContent = res.list.length
      ? tx("catalog.similarText", "Otras prendas que podrían interesarte.")
      : U.vars(tx("catalog.similarSearchText", "No encontramos coincidencias exactas para “{busqueda}”, pero estas se parecen."), { busqueda: state.q });
    el.similarGrid.innerHTML = cards(res.similar);
  }

  function renderEmpty(res) {
    const empty = res.list.length === 0 && !(state.q && res.similar.length);
    el.empty.hidden = !empty;
    if (!empty) return;
    const hasFilters = filterCount() > 0;
    const fTitle = tx("catalog.emptyFiltersTitle", "No encontramos prendas con esos filtros");
    const fText = tx("catalog.emptyFiltersText", "Prueba quitando algún filtro o mira lo que más gusta de la colección.");
    if (state.q && !hasFilters) {
      el.emptyTitle.textContent = U.vars(tx("catalog.emptySearchTitle", "No encontramos prendas para “{busqueda}”"), { busqueda: state.q });
      el.emptyText.textContent = U.vars(tx("catalog.emptySearchText", "Revisa la escritura, prueba con otro nombre, color o referencia, o explora lo más vendido."), { busqueda: state.q });
    } else {
      el.emptyTitle.textContent = fTitle;
      el.emptyText.textContent = fText;
    }
    el.emptyClear.hidden = !hasFilters;
    el.emptyAll.hidden = hasFilters;
    const top = D.PRODUCTS.slice().sort(function (a, b) { return a.bestRank - b.bestRank; }).slice(0, 4);
    el.suggest.innerHTML = cards(top);
  }

  function writeURL() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.vista) p.set("vista", state.vista);
    if (state.cat.length) p.set("cat", state.cat.join(","));
    if (state.fit.length) p.set("fit", state.fit.join(","));
    if (state.talla.length) p.set("talla", state.talla.join(","));
    if (state.color.length) p.set("color", state.color.join(","));
    if (priceActive()) p.set("precio", state.pmin + "-" + state.pmax);
    if (state.stock) p.set("stock", "1");
    if (currentSort() !== defaultSort()) p.set("orden", currentSort());
    if (state.pages > 1) p.set("pag", state.pages);
    const s = p.toString().replace(/%2C/g, ",");
    try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash); } catch (e) {}
  }

  let announceT;
  function announce(msg) {
    clearTimeout(announceT);
    announceT = setTimeout(function () { el.status.textContent = msg; }, 350);
  }

  function update(opts) {
    opts = opts || {};
    const res = compute();
    const total = res.list.length;
    const maxPages = Math.max(1, Math.ceil(total / C.pageSize));
    if (state.pages > maxPages) state.pages = maxPages;

    renderHead(total);
    syncSortOptions();
    syncPills();
    renderActive();
    syncFilters();
    renderGrid(res, opts.append);
    renderSimilar(res);
    renderEmpty(res);
    U.syncFavButtons();
    writeURL();

    if (drawerCta) drawerCta.textContent = "Ver resultados (" + total + ")";
    if (!opts.silent) {
      announce(total
        ? U.pluralize(total, "diseño encontrado", "diseños encontrados") + ". Mostrando " + rendered + "."
        : "No se encontraron prendas con esos filtros.");
    }
  }

  /* --- Acciones --------------------------------------------------------------------- */
  function toggleIn(arr, v, on) {
    const i = arr.indexOf(v);
    if (on && i < 0) arr.push(v);
    if (!on && i > -1) arr.splice(i, 1);
  }
  function clearFilters() {
    state.cat = []; state.fit = []; state.talla = []; state.color = [];
    state.pmin = PRICE_MIN; state.pmax = PRICE_MAX; state.stock = false; state.pages = 1;
    update();
  }
  function removeFilter(k, v) {
    if (k === "price") { state.pmin = PRICE_MIN; state.pmax = PRICE_MAX; }
    else if (k === "stock") state.stock = false;
    else toggleIn(state[k], v, false);
    state.pages = 1;
  }

  function bind() {
    /* Píldoras de categoría (selección única) */
    el.pills.addEventListener("click", function (e) {
      const b = e.target.closest("[data-pill]");
      if (!b) return;
      const id = b.getAttribute("data-pill");
      state.cat = id ? [id] : [];
      state.pages = 1;
      update();
      revealPill(b);
    });

    /* Orden */
    el.sort.addEventListener("change", function () {
      state.orden = el.sort.value;
      state.pages = 1;
      update();
    });

    /* Grupos de filtros (delegado: funciona en la columna y dentro del panel) */
    el.groups.addEventListener("change", function (e) {
      const t = e.target;
      if (!t.matches('input[type="checkbox"]')) return;
      if (t.name === "stock") state.stock = t.checked;
      else toggleIn(state[t.name], t.value, t.checked);
      state.pages = 1;
      update();
    });
    el.groups.addEventListener("click", function (e) {
      const s = e.target.closest("[data-size]"), c = e.target.closest("[data-color]");
      if (s) toggleIn(state.talla, s.getAttribute("data-size"), s.getAttribute("aria-pressed") !== "true");
      else if (c) toggleIn(state.color, c.getAttribute("data-color"), c.getAttribute("aria-pressed") !== "true");
      else return;
      state.pages = 1;
      update();
    });
    el.groups.addEventListener("input", function (e) {
      const t = e.target;
      if (t.id !== "price-min" && t.id !== "price-max") return;
      let lo = +$("#price-min").value, hi = +$("#price-max").value;
      if (t.id === "price-min" && lo > hi - STEP) lo = hi - STEP;
      if (t.id === "price-max" && hi < lo + STEP) hi = lo + STEP;
      state.pmin = lo; state.pmax = hi; state.pages = 1;
      update();
    });

    /* Quitar chip activo */
    el.activeList.addEventListener("click", function (e) {
      const b = e.target.closest("[data-rm]");
      if (!b) return;
      const idx = $$(".chip", el.activeList).indexOf(b);
      removeFilter(b.getAttribute("data-rm"), b.getAttribute("data-v"));
      update();
      const left = $$(".chip", el.activeList);
      const next = left[Math.min(idx, left.length - 1)] || el.sort;
      try { next.focus({ preventScroll: true }); } catch (err) {}
    });

    /* Limpiar filtros (chips, panel y estado vacío) */
    document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-clear-filters]")) return;
      e.preventDefault();
      clearFilters();
    });

    /* Ver más productos */
    el.moreBtn.addEventListener("click", function () {
      state.pages++;
      update({ append: true });
    });

    /* Panel de filtros (móvil) */
    el.filtersBtn.addEventListener("click", function () {
      /* Safari/táctil no dan foco al botón al pulsarlo: se lo damos para que el foco vuelva aquí al cerrar el panel */
      try { el.filtersBtn.focus({ preventScroll: true }); } catch (e) {}
      U.overlay.open(drawer);
      el.filtersBtn.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("mercy:overlay-close", function (e) {
      if (e.detail && e.detail.el === drawer) el.filtersBtn.setAttribute("aria-expanded", "false");
    });
    const mq = window.matchMedia("(min-width: 900px)");
    if (mq.addEventListener) mq.addEventListener("change", placeGroups); else mq.addListener(placeGroups);
  }

  /* --- Textos fijos de la página (texts.catalog) ------------------------------------------- */
  function renderStaticTexts() {
    const eb = $(".cat-eyebrow");
    if (eb) { eb.textContent = txt(TXC.eyebrow, ""); eb.hidden = !eb.textContent.trim(); }
    const sub = $("#cat-sub > span:first-child");
    if (sub) {
      sub.textContent = txt(TXC.subtitle, "");
      const n = $(".cat-sub__n", el.n.closest("#cat-sub"));
      if (n) n.firstChild.nodeValue = sub.textContent.trim() ? " · " : "";
    }
    const sug = $(".cat-suggest__title");
    if (sug) sug.textContent = U.plain(txt(TXC.bestTitle, "Los más vendidos"));
    /* Botones, títulos y descripción para buscadores (texts.catalog) */
    el.moreBtn.textContent = tx("catalog.loadMore", "Ver más productos");
    el.qclear.textContent = tx("catalog.seeAll", "Ver toda la colección");
    el.emptyAll.textContent = tx("catalog.seeAll", "Ver toda la colección");
    const simT = $("#cat-similar-title");
    if (simT) simT.textContent = tx("catalog.similarTitle", "Referencias parecidas");
    const ebm = $(".cat-eyebrow");
    if (ebm && !ebm.textContent.trim()) { ebm.textContent = CAT_LABEL; ebm.hidden = false; }
    let meta = $('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.setAttribute("content", U.fill(tx("catalog.metaDescription", "Toda la colección de {marca}: ropa con propósito cristiano.")));
  }

  /* --- Arranque ------------------------------------------------------------------------ */
  renderStaticTexts();
  buildSort();
  buildPills();
  buildFilters();
  buildDrawer();
  placeGroups();
  bind();
  update({ silent: true });
  revealPill($("[data-pill].is-on", el.pills));
})();
