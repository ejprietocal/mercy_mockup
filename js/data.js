/* ==========================================================================
   Mercy Studio — data.js
   Construye Mercy.data a partir del contenido administrable (Mercy.content, ver config.js)
   con la MISMA forma que la tienda usa desde siempre:
     PRODUCTS (solo publicados; colors = [ids], stock[color][talla], photos, reviews = número,
     collection = nombre…), COLORS, FITS, CATEGORIES, COLLECTIONS, SIZE_CHARTS, REVIEWS, MARQUEE…
   Departamentos/ciudades y medios de pago siguen fijos aquí.
   Defensivo ante contenido editado a mano: listas vacías, campos faltantes, colores sin stock,
   productos sin fotos o categorías sin productos nunca lanzan excepciones.
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  const CT = Mercy.content || Mercy.DEFAULT_CONTENT || {};
  const TX = CT.texts || {};

  /* --- Utilidades de saneamiento ------------------------------------------ */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v == null ? "" : String(v); }
  function num(v, d) { const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN); return isFinite(n) ? n : d; }
  function strList(v) { return arr(v).map(str).map(function (s) { return s.trim(); }).filter(Boolean); }
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  function hex(v, d) { return HEX.test(str(v)) ? str(v).toLowerCase() : d; }
  function uniqueBy(list, key) {
    const seen = {};
    return list.filter(function (x) { const k = key(x); if (!k || seen[k]) return false; seen[k] = true; return true; });
  }

  /* --- Colores, hormas, categorías y colecciones ------------------------------ */
  const COLORS = {};
  arr(CT.colors).forEach(function (c) {
    if (!c || !c.id || COLORS[c.id]) return;
    COLORS[c.id] = { id: str(c.id), name: str(c.name) || str(c.id), hex: hex(c.hex, "#999999") };
  });

  const FITS = {};
  arr(CT.fits).forEach(function (f) {
    if (f && f.id && !FITS[f.id]) FITS[f.id] = str(f.name) || str(f.id);
  });

  const CARE = strList(TX.care);

  /* --- Guías de tallas (cm) ---------------------------------------------------
     Forma de siempre: SIZE_CHARTS[idGuía] = { head: [...], regular: [[talla, …], …], oversize: […] }
     (las claves enumerables son "head" + ids de hormas). Además, NO enumerables: id, name, unit, fits (orden de pestañas). */
  const SIZE_CHARTS = {};
  const SIZE_CHART_IDS = [];
  arr(CT.sizeCharts).forEach(function (g) {
    if (!g || !g.id || SIZE_CHARTS[g.id]) return;
    const chart = { head: strList(g.head).length ? strList(g.head) : ["Talla"] };
    const rows = g.rows && typeof g.rows === "object" ? g.rows : {};
    const fits = [];
    Object.keys(rows).forEach(function (fit) {
      if (fit === "head") return;
      const list = arr(rows[fit]).filter(function (r) { return Array.isArray(r) && r.length && str(r[0]).trim(); });
      if (!list.length) return;
      chart[fit] = list.map(function (r) { return r.map(function (v, i) { return i ? (v == null ? "" : v) : str(v).trim(); }); });
      fits.push(fit);
    });
    if (!fits.length) return;                     // guía sin filas: no se publica
    Object.defineProperty(chart, "id", { value: str(g.id) });
    Object.defineProperty(chart, "name", { value: str(g.name) || str(g.id) });
    Object.defineProperty(chart, "unit", { value: g.unit == null ? "cm" : str(g.unit) });
    Object.defineProperty(chart, "fits", { value: fits });
    SIZE_CHARTS[g.id] = chart;
    SIZE_CHART_IDS.push(str(g.id));
  });

  const CATEGORIES = uniqueBy(arr(CT.categories).filter(Boolean), function (c) { return c.id; }).map(function (c) {
    return {
      id: str(c.id), name: str(c.name) || str(c.id),
      details: strList(c.details),
      sizeChart: c.sizeChart && SIZE_CHARTS[c.sizeChart] ? str(c.sizeChart) : "",
      inFooter: c.inFooter !== false
    };
  });
  function categoryById(id) { return CATEGORIES.filter(function (c) { return c.id === id; })[0] || null; }

  const COLLECTIONS = uniqueBy(arr(CT.collections).filter(Boolean), function (c) { return c.id; }).map(function (c) {
    return { id: str(c.id), name: str(c.name) || str(c.id), description: str(c.description) };
  });
  function collectionById(id) { return COLLECTIONS.filter(function (c) { return c.id === id; })[0] || null; }

  const SHIPPING_INFO = str(TX.shippingInfo);
  const RETURNS_INFO = str(TX.returnsInfo);

  /* --- Fotos -------------------------------------------------------------------
     Foto = { src, thumb, alt, zoom, ox, oy } (contrato §3). Pexels → tamaños con ?w=;
     fotos subidas con miniatura → srcset "thumb 600w, src 2000w"; otras URLs → solo src. */
  const PEXELS = /^https?:\/\/images\.pexels\.com\//i;
  const PCT = /^-?\d{1,3}(?:\.\d+)?%$/;                // punto de origen del acercamiento ("50%")
  function normPhoto(ph) {
    if (typeof ph === "string") ph = { src: ph };
    if (!ph || typeof ph !== "object" || !str(ph.src).trim()) return null;
    const zoom = num(ph.zoom, null);
    return {
      src: str(ph.src).trim(), thumb: str(ph.thumb).trim(), alt: str(ph.alt),
      zoom: zoom && zoom > 0 ? zoom : null,
      ox: PCT.test(str(ph.ox)) ? str(ph.ox) : null, oy: PCT.test(str(ph.oy)) ? str(ph.oy) : null
    };
  }
  /* URL de una foto para un ancho dado. Acepta una foto, una URL o (compatibilidad) un id numérico de Pexels. */
  function photoUrl(ph, w) {
    if (typeof ph === "number") return "https://images.pexels.com/photos/" + ph + "/pexels-photo-" + ph + ".jpeg?auto=compress&cs=tinysrgb&w=" + w;
    const src = typeof ph === "string" ? ph : (ph && ph.src) || "";
    if (PEXELS.test(src)) return src.split("?")[0] + "?auto=compress&cs=tinysrgb&w=" + w;
    if (ph && ph.thumb && w && w <= 600) return ph.thumb;
    return src;
  }
  /* srcset para los anchos pedidos ("" si la foto no tiene variantes) */
  function photoSrcset(ph, widths) {
    const src = (ph && ph.src) || "";
    if (PEXELS.test(src)) return (widths || [640]).map(function (w) { return photoUrl(ph, w) + " " + w + "w"; }).join(", ");
    if (ph && ph.thumb) return ph.thumb + " 600w, " + src + " 2000w";
    return "";
  }

  /* --- Productos ----------------------------------------------------------------
     Solo publicados (status "draft" = invisible). colors: [{ color, photos, stock }] → colors: [ids],
     stock[color][talla], colorPhotos[color] = [fotos]. */
  const P = [];
  const seenIds = {};
  arr(CT.products).forEach(function (raw, idx) {
    if (!raw || typeof raw !== "object" || !raw.id || seenIds[raw.id]) return;
    if (raw.status && raw.status !== "published") return;
    seenIds[raw.id] = true;

    const name = str(raw.name).trim() || str(raw.id);
    const sizes = uniqueBy(strList(raw.sizes), function (s) { return s; });
    const entries = uniqueBy(arr(raw.colors).filter(function (c) { return c && typeof c === "object" && c.color; }), function (c) { return c.color; });
    const colors = entries.map(function (c) { return str(c.color); });
    const stock = {}, colorPhotos = {};
    entries.forEach(function (c) {
      const id = str(c.color);
      const st = c.stock && typeof c.stock === "object" ? c.stock : {};
      stock[id] = {};
      sizes.forEach(function (s) { const n = Math.floor(num(st[s], 0)); stock[id][s] = n > 0 ? n : 0; });
      colorPhotos[id] = arr(c.photos).map(normPhoto).filter(Boolean).slice(0, 4);   // máx. 4 por color
    });

    const t = raw.tile && typeof raw.tile === "object" ? raw.tile : {};
    const tileLines = strList(t.lines);
    const cat = categoryById(str(raw.category));
    const col = raw.collection ? collectionById(str(raw.collection)) : null;
    const details = strList(raw.details);
    const care = strList(raw.care);
    const reviewsCount = Math.max(0, Math.round(num(raw.reviewsCount, num(raw.reviews, 0))));

    const p = {
      id: str(raw.id), ref: str(raw.ref), name: name,
      category: str(raw.category),
      collection: col ? col.name : "", collectionId: col ? col.id : "",
      fits: strList(raw.fits).filter(function (f) { return FITS[f]; }),
      sizes: sizes,
      price: Math.max(0, Math.round(num(raw.price, 0))),
      badge: str(raw.badge).trim(),
      envioGratis: !!raw.envioGratis,
      bestRank: num(raw.bestRank, 1000 + idx), newRank: num(raw.newRank, 1000 + idx),
      rating: Math.max(0, Math.min(5, num(raw.rating, 0))), reviews: reviewsCount, reviewsCount: reviewsCount,
      colors: colors, stock: stock, colorPhotos: colorPhotos,
      prints: arr(raw.prints).filter(function (x) { return x && x.id; }).map(function (x) {
        return { id: str(x.id), name: str(x.name) || str(x.id), hex: hex(x.hex, "#999999") };
      }),
      video: raw.video && typeof raw.video === "object" && str(raw.video.src).trim()
        ? { src: str(raw.video.src).trim(), poster: str(raw.video.poster).trim() } : null,
      tile: {
        from: hex(t.from, "#d8bea6"), to: hex(t.to, "#b77e5d"),
        lines: tileLines.length ? tileLines : [name.toUpperCase()],
        sub: str(t.sub), stacked: !!t.stacked, small: !!t.small, fs: num(t.fs, null) || null
      },
      tags: strList(raw.tags), desc: str(raw.desc).trim(), story: str(raw.story).trim(),
      sizeChart: cat && cat.sizeChart ? cat.sizeChart : "",
      details: details.length ? details : (cat ? cat.details.slice() : []),
      care: care.length ? care : CARE.slice()
    };
    /* Sin estampados la propiedad no existe (forma de siempre: store.js asume p.prints[0] si la hay) */
    if (!p.prints.length) delete p.prints;
    p.soldOut = !!raw.soldOut || colors.every(function (c) {
      return Object.keys(stock[c]).every(function (s) { return stock[c][s] === 0; });
    });
    p.initialColor = colors.filter(function (c) { return colorHasStock(p, c); })[0] || colors[0] || "";
    p.photos = photosFor(p, p.initialColor);
    P.push(p);
  });

  /* Ids anteriores de productos renombrados (products[].formerIds, los pone el servidor) → id actual, para que
     enlaces viejos (producto.html?id=fe, el botón del hero…), carritos y favoritos sigan llevando a la prenda.
     Un id real siempre gana sobre un alias. */
  const ALIASES = {};
  const BY_ID = {};
  P.forEach(function (p) { BY_ID[p.id] = p; });
  arr(CT.products).forEach(function (raw) {
    if (!raw || typeof raw !== "object" || !BY_ID[str(raw.id)] || (raw.status && raw.status !== "published")) return;
    strList(raw.formerIds).forEach(function (f) { if (!BY_ID[f] && !ALIASES[f]) ALIASES[f] = str(raw.id); });
  });
  function byId(id) {
    const k = str(id);
    return (Object.prototype.hasOwnProperty.call(BY_ID, k) && BY_ID[k]) ||
      (Object.prototype.hasOwnProperty.call(ALIASES, k) && BY_ID[ALIASES[k]]) || null;
  }

  /* Fotos del color (1–4); si ese color no tiene, las del primer color con fotos; si ninguno, []. */
  function photosFor(p, colorId) {
    if (!p || !p.colorPhotos) return (p && p.photos) || [];
    const own = p.colorPhotos[colorId];
    if (own && own.length) return own;
    const first = (p.colors || []).filter(function (c) { return p.colorPhotos[c] && p.colorPhotos[c].length; })[0];
    return first ? p.colorPhotos[first] : [];
  }
  function stockOf(p, color, size) {
    return p && p.stock && p.stock[color] && p.stock[color][size] != null ? p.stock[color][size] : 0;
  }
  function colorHasStock(p, color) {
    const s = p && p.stock && p.stock[color];
    return !!s && Object.keys(s).some(function (k) { return s[k] > 0; });
  }

  /* --- Reseñas (solo visibles) ------------------------------------------- */
  const REVIEWS = arr(CT.reviews).filter(function (r) { return r && typeof r === "object" && r.visible !== false && (str(r.quote).trim() || str(r.text).trim()); })
    .map(function (r) {
      const quote = str(r.quote).trim(), text = str(r.text).trim();
      return {
        id: str(r.id), name: str(r.name).trim() || "Cliente", city: str(r.city).trim(),
        stars: Math.max(1, Math.min(5, Math.round(num(r.stars, 5)))),
        quote: quote || text, text: text || quote
      };
    });

  /* --- Franja en movimiento del hero (C8, C9, C37) ------------------------- */
  const MARQUEE = arr(CT.home && CT.home.marquee).filter(function (m) { return m && str(m.text).trim(); })
    .map(function (m) { return { icon: str(m.icon), text: str(m.text).trim() }; });

  /* --- Departamentos → ciudades (C30: primero Departamento, luego Ciudad) */
  const DEPARTMENTS = {
    "Amazonas": ["Leticia", "Puerto Nariño"],
    "Antioquia": ["Medellín", "Envigado", "Itagüí", "Bello", "Sabaneta", "Rionegro", "Apartadó", "Turbo"],
    "Arauca": ["Arauca", "Saravena", "Tame"],
    "Atlántico": ["Barranquilla", "Soledad", "Malambo", "Puerto Colombia", "Sabanalarga"],
    "Bogotá D.C.": ["Bogotá"],
    "Bolívar": ["Cartagena", "Magangué", "Turbaco", "El Carmen de Bolívar"],
    "Boyacá": ["Tunja", "Duitama", "Sogamoso", "Chiquinquirá"],
    "Caldas": ["Manizales", "La Dorada", "Villamaría", "Chinchiná"],
    "Caquetá": ["Florencia", "San Vicente del Caguán"],
    "Casanare": ["Yopal", "Aguazul", "Villanueva"],
    "Cauca": ["Popayán", "Santander de Quilichao", "Puerto Tejada"],
    "Cesar": ["Valledupar", "Aguachica", "Codazzi"],
    "Chocó": ["Quibdó", "Istmina"],
    "Córdoba": ["Montería", "Cereté", "Lorica", "Sahagún"],
    "Cundinamarca": ["Soacha", "Chía", "Zipaquirá", "Facatativá", "Fusagasugá", "Girardot", "Cajicá", "Mosquera"],
    "Guainía": ["Inírida"],
    "Guaviare": ["San José del Guaviare"],
    "Huila": ["Neiva", "Pitalito", "Garzón"],
    "La Guajira": ["Riohacha", "Maicao", "Uribia"],
    "Magdalena": ["Santa Marta", "Ciénaga", "Fundación"],
    "Meta": ["Villavicencio", "Acacías", "Granada"],
    "Nariño": ["Pasto", "Ipiales", "Tumaco"],
    "Norte de Santander": ["Cúcuta", "Ocaña", "Pamplona", "Villa del Rosario"],
    "Putumayo": ["Mocoa", "Puerto Asís"],
    "Quindío": ["Armenia", "Calarcá", "Montenegro"],
    "Risaralda": ["Pereira", "Dosquebradas", "Santa Rosa de Cabal"],
    "San Andrés y Providencia": ["San Andrés", "Providencia"],
    "Santander": ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja"],
    "Sucre": ["Sincelejo", "Corozal"],
    "Tolima": ["Ibagué", "Espinal", "Melgar"],
    "Valle del Cauca": ["Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago", "Buga", "Jamundí"],
    "Vaupés": ["Mitú"],
    "Vichada": ["Puerto Carreño"]
  };

  /* --- Medios de pago por transferencia (C35: sin Nu, con logos) --------- */
  const PAYMENT_METHODS = [
    { id: "nequi",       name: "Nequi",                hint: "Transferencia desde la app Nequi" },
    { id: "breb",        name: "Bre-B",                hint: "Transferencia con llave Bre-B" },
    { id: "bancolombia", name: "Bancolombia Ahorros",  hint: "Transferencia a cuenta de ahorros" }
  ];

  Mercy.data = {
    COLORS: COLORS,
    FITS: FITS,
    CATEGORIES: CATEGORIES,
    COLLECTIONS: COLLECTIONS,
    PRODUCTS: P,
    SIZE_CHARTS: SIZE_CHARTS,
    SIZE_CHART_IDS: SIZE_CHART_IDS,
    SHIPPING_INFO: SHIPPING_INFO,
    RETURNS_INFO: RETURNS_INFO,
    CARE: CARE,
    REVIEWS: REVIEWS,
    DEPARTMENTS: DEPARTMENTS,
    PAYMENT_METHODS: PAYMENT_METHODS,
    MARQUEE: MARQUEE,

    photoUrl: photoUrl,
    photoSrcset: photoSrcset,
    photosFor: photosFor,
    /* Producto publicado por id (o por un id anterior si se renombró: el resultado trae el id ACTUAL en p.id) */
    byId: byId,
    category: categoryById,
    collectionById: collectionById,
    color: function (id) { return COLORS[id] || { id: id, name: str(id), hex: "#999999" }; },
    stockOf: stockOf,
    colorHasStock: colorHasStock
  };
})();
