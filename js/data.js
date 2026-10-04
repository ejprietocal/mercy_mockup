/* ==========================================================================
   Mercy Studio — data.js
   Catálogo de ejemplo, categorías, reseñas, ubicaciones y medios de pago.
   Todos los precios, stocks y textos de producto son DATOS DE EJEMPLO.
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  /* --- Colores disponibles -------------------------------------------- */
  const COLORS = {
    negro:      { id: "negro",      name: "Negro",      hex: "#2a1e14" },
    crema:      { id: "crema",      name: "Crema",      hex: "#f6e9d5" },
    terracota:  { id: "terracota",  name: "Terracota",  hex: "#bb3f17" },
    cafe:       { id: "cafe",       name: "Café",       hex: "#6e5847" },
    taupe:      { id: "taupe",      name: "Taupe",      hex: "#9a8468" },
    verde:      { id: "verde",      name: "Verde salvia", hex: "#5e7360" },
    ladrillo:   { id: "ladrillo",   name: "Ladrillo",   hex: "#8e3410" },
    arena:      { id: "arena",      name: "Arena",      hex: "#d8bea6" }
  };

  const SIZES_STD = ["S", "M", "L", "XL", "XXL"];

  const FITS = {
    regular: "Regular",
    oversize: "Oversize",
    boxy: "Boxy"
  };

  const CATEGORIES = [
    { id: "camisetas",  name: "Camisetas" },
    { id: "blusas",     name: "Blusas" },
    { id: "hoodies",    name: "Hoodies" },
    { id: "gorras",     name: "Gorras" },
    { id: "accesorios", name: "Accesorios" }
  ];

  /* Genera stock por color/talla. `agotado` = { color: ['XXL', ...] }, `bajo` = { 'color:talla': n } */
  function makeStock(colors, sizes, agotado, bajo, todoAgotado) {
    const out = {};
    colors.forEach(function (c, ci) {
      out[c] = {};
      sizes.forEach(function (s, si) {
        let units = 4 + ((ci + si) % 5);
        if (todoAgotado || (agotado && agotado[c] && agotado[c].indexOf(s) > -1)) units = 0;
        else if (bajo && bajo[c + ":" + s] != null) units = bajo[c + ":" + s];
        out[c][s] = units;
      });
    });
    return out;
  }

  /* --- Tablas de medidas (cm) — EJEMPLO ---------------------------------- */
  const SIZE_CHARTS = {
    camisetas: {
      head: ["Talla", "Pecho", "Largo", "Manga"],
      regular:  [["S", 51, 68, 20], ["M", 53, 70, 21], ["L", 55, 72, 22], ["XL", 57, 74, 23], ["XXL", 59, 76, 24]],
      oversize: [["S", 56, 72, 24], ["M", 58, 74, 25], ["L", 60, 76, 26], ["XL", 62, 78, 27], ["XXL", 64, 80, 28]],
      boxy:     [["S", 54, 66, 22], ["M", 56, 68, 23], ["L", 58, 70, 24], ["XL", 60, 72, 25], ["XXL", 62, 74, 26]]
    },
    blusas: {
      head: ["Talla", "Pecho", "Largo", "Manga"],
      regular:  [["S", 47, 58, 19], ["M", 49, 60, 20], ["L", 51, 62, 21], ["XL", 53, 64, 22], ["XXL", 55, 66, 23]],
      oversize: [["S", 52, 62, 22], ["M", 54, 64, 23], ["L", 56, 66, 24], ["XL", 58, 68, 25], ["XXL", 60, 70, 26]]
    },
    hoodies: {
      head: ["Talla", "Pecho", "Largo", "Manga"],
      regular:  [["S", 56, 66, 60], ["M", 58, 68, 61], ["L", 60, 70, 62], ["XL", 62, 72, 63], ["XXL", 64, 74, 64]],
      oversize: [["S", 60, 70, 62], ["M", 62, 72, 63], ["L", 64, 74, 64], ["XL", 66, 76, 65], ["XXL", 68, 78, 66]]
    }
  };

  /* --- Detalles por categoría (ítem por ítem — C28) --------------------- */
  const DETAILS = {
    camisetas: [
      "Algodón 100 % de 210 g, transpirable y fresco",
      "Estampación DTF de alta durabilidad",
      "Cuello RIB resistente",
      "Corte unisex y femenino",
      "Horma disponible: Regular, Oversize o Boxy",
      "Hecha en Colombia",
      "Modelo: 1,80 m usa talla L"
    ],
    blusas: [
      "Algodón suave 100 %, ligera y fresca",
      "Estampación DTF de alta durabilidad",
      "Corte femenino con caída relajada",
      "Hecha en Colombia",
      "Modelo: 1,68 m usa talla M"
    ],
    hoodies: [
      "Algodón French Terry de 320 g, interior suave",
      "Capota doble con cordón",
      "Bolsillo canguro",
      "Estampación DTF de alta durabilidad",
      "Corte unisex",
      "Hecha en Colombia",
      "Modelo: 1,80 m usa talla L"
    ],
    gorras: [
      "Gorra de gabardina con curva clásica",
      "Bordado en alto relieve",
      "Cierre ajustable trasero",
      "Talla única"
    ],
    accesorios: [
      "Tela de lona de algodón resistente",
      "Estampación serigráfica",
      "Medidas aprox. 38 × 42 cm",
      "Hecho en Colombia"
    ]
  };

  const CARE = [
    "Lávala en agua fría y evita la secadora para que no encoja",
    "Plancha siempre al revés, sin calor directo sobre el diseño",
    "Lava a mano con tonos similares",
    "No uses blanqueador, así mantienes los colores vivos"
  ];

  const SHIPPING_INFO =
    "Enviamos a toda Colombia. Algunas prendas incluyen envío gratis (lo verás marcado en el producto y en tu carrito); " +
    "en las demás el envío tiene un costo adicional que coordinamos contigo por WhatsApp.";

  const RETURNS_INFO =
    "¿Te quedó grande o pequeña? Escríbenos por WhatsApp apenas recibas tu pedido y coordinamos el cambio. " +
    "La prenda debe estar sin uso y con sus etiquetas.";

  /* --- Productos ----------------------------------------------------------
     tile: degradado + texto grande (placeholder de foto, como en las capturas)
     envioGratis: true => este producto incluye envío (C32/C34)               */
  const P = [];
  function add(p) { P.push(p); }

  add({
    id: "gracia", ref: "GRA-001", name: "Camiseta Gracia", category: "camisetas",
    fits: ["oversize", "regular", "boxy"], badge: "Oversize", price: 89900, collection: "Renacer",
    colors: ["terracota", "negro", "crema", "cafe"], sizes: SIZES_STD,
    stock: makeStock(["terracota", "negro", "crema", "cafe"], SIZES_STD, { crema: ["XXL"] }),
    envioGratis: true, bestRank: 1, newRank: 4, rating: 4.9, reviews: 112,
    tile: { from: "#d8bea6", to: "#b77e5d", lines: ["GRACIA"], sub: "SOBRE GRACIA" },
    tags: ["gracia", "oversize", "fe", "amor"],
    story: "“Gracia” nació de una verdad sencilla: lo mejor que hemos recibido nunca lo merecimos. Es un recordatorio de que hay amor que no se gana, se acepta."
  });
  add({
    id: "fe", ref: "FE-002", name: "Camiseta Fe", category: "camisetas",
    fits: ["regular", "oversize", "boxy"], badge: "Nuevo", price: 79900, collection: "Renacer",
    colors: ["negro", "crema", "terracota"], sizes: SIZES_STD,
    stock: makeStock(["negro", "crema", "terracota"], SIZES_STD, { negro: ["XXL"], crema: ["S"] }),
    envioGratis: false, bestRank: 2, newRank: 1, rating: 4.9, reviews: 48,
    tile: { from: "#c5a68b", to: "#a44809", lines: ["FE"] },
    tags: ["fe", "creer", "renacer"],
    story: "“Fe” nació de un momento de incertidumbre. Es un recordatorio de que creer no siempre es ver — es seguir caminando confiando. Quien la lleva puesta declara aquello que sostiene su corazón."
  });
  add({
    id: "salmo-23", ref: "SAL-023", name: "Hoodie Salmo 23", category: "hoodies",
    fits: ["oversize", "regular"], badge: "", price: 139900, collection: "Salmos",
    colors: ["negro", "taupe"], sizes: SIZES_STD,
    stock: makeStock(["negro", "taupe"], SIZES_STD, { taupe: ["XXL"] }),
    envioGratis: true, bestRank: 3, newRank: 8, rating: 5.0, reviews: 64,
    tile: { from: "#8d7864", to: "#3b2d23", lines: ["SALMO", "23"], stacked: true },
    tags: ["salmo", "pastor", "hoodie", "buzo"],
    story: "El Señor es mi pastor, nada me faltará. Un hoodie para los días de frío, de incertidumbre y de descanso en Él."
  });
  add({
    id: "renacer", ref: "REN-004", name: "Camiseta Renacer", category: "camisetas",
    fits: ["regular", "oversize"], badge: "Oversize", price: 84900, collection: "Renacer",
    colors: ["arena", "negro", "crema", "verde", "terracota"], sizes: SIZES_STD,
    stock: makeStock(["arena", "negro", "crema", "verde", "terracota"], SIZES_STD, { verde: ["XL", "XXL"] }),
    envioGratis: false, bestRank: 4, newRank: 2, rating: 4.8, reviews: 39,
    tile: { from: "#d8bea6", to: "#a76d4a", lines: ["RENACER"] },
    tags: ["renacer", "nueva vida", "oversize"],
    story: "Todo lo que parecía final fue el principio. “Renacer” es para quien volvió a empezar de la mano de Dios."
  });
  add({
    id: "esperanza", ref: "ESP-005", name: "Camiseta Esperanza", category: "camisetas",
    fits: ["regular", "boxy"], badge: "", price: 79900, collection: "Renacer",
    colors: ["cafe", "crema"], sizes: SIZES_STD,
    stock: makeStock(["cafe", "crema"], SIZES_STD, {}),
    envioGratis: false, bestRank: 5, newRank: 6, rating: 4.9, reviews: 27,
    tile: { from: "#c0ae95", to: "#715b4a", lines: ["ESPERANZA"] },
    tags: ["esperanza", "confianza"],
    story: "La esperanza no defrauda. “Esperanza” es una declaración silenciosa de que lo mejor aún viene."
  });
  add({
    id: "amen", ref: "AME-006", name: "Camiseta Amén", category: "camisetas",
    fits: ["regular"], badge: "", price: 84900, collection: "Salmos",
    colors: ["terracota", "negro"], sizes: SIZES_STD,
    stock: makeStock(["terracota", "negro"], SIZES_STD, {}, {}, true),
    envioGratis: false, bestRank: 6, newRank: 12, rating: 4.7, reviews: 18, soldOut: true,
    tile: { from: "#8f7f6d", to: "#75370c", lines: ["AMÉN"] },
    tags: ["amen", "así sea"],
    story: "Así sea. “Amén” cierra cada oración con confianza y empieza cada día con expectativa."
  });
  add({
    id: "jesus-es-el-camino", ref: "JECVV", name: "Camiseta Ref. Jesús es el camino", category: "camisetas",
    fits: ["oversize", "regular"], badge: "Oversize", price: 105900, collection: "Juan 14:6",
    colors: ["negro"], sizes: ["S", "M", "L", "XL"],
    stock: makeStock(["negro"], ["S", "M", "L", "XL"], {}),
    prints: [
      { id: "naranja", name: "Naranja", hex: "#e8620a" },
      { id: "azul", name: "Azul noche", hex: "#2f2f63" }
    ],
    envioGratis: true, bestRank: 7, newRank: 3, rating: 5.0, reviews: 21,
    tile: { from: "#5b2418", to: "#1c0f0b", lines: ["JESÚS", "ES EL CAMINO"], fs: 11 },
    tags: ["jesus", "camino", "verdad", "vida", "juan"],
    desc: "Camiseta en algodón de 210 gr, con horma Oversize o Regular Fit, cuello RIB resistente.",
    story: "“Yo soy el camino, la verdad y la vida.” Juan 14:6. Una camiseta para declarar hacia dónde caminas."
  });
  add({
    id: "paz", ref: "PAZ-007", name: "Camiseta Paz", category: "camisetas",
    fits: ["regular", "oversize", "boxy"], badge: "Nuevo", price: 79900, collection: "Renacer",
    colors: ["crema", "verde", "negro"], sizes: SIZES_STD,
    stock: makeStock(["crema", "verde", "negro"], SIZES_STD, { verde: ["S"] }),
    envioGratis: false, bestRank: 9, newRank: 5, rating: 4.8, reviews: 14,
    tile: { from: "#c9c3a8", to: "#5e7360", lines: ["PAZ"] },
    tags: ["paz", "calma"],
    story: "Una paz que sobrepasa todo entendimiento. “Paz” es para los días en que solo necesitas descansar en Él."
  });
  add({
    id: "misericordia", ref: "MIS-101", name: "Blusa Misericordia", category: "blusas",
    fits: ["regular", "oversize"], badge: "", price: 74900, collection: "Misericordia",
    colors: ["crema", "terracota", "negro"], sizes: SIZES_STD,
    stock: makeStock(["crema", "terracota", "negro"], SIZES_STD, { terracota: ["XXL"] }),
    envioGratis: true, bestRank: 8, newRank: 7, rating: 4.9, reviews: 33,
    tile: { from: "#e3cdb4", to: "#bb3f17", lines: ["MISERI-", "CORDIA"], fs: 13 },
    tags: ["misericordia", "blusa", "mujer"],
    story: "Nuevas cada mañana son sus misericordias. Una blusa suave para recordarlo cada día."
  });
  add({
    id: "luz", ref: "LUZ-102", name: "Blusa Luz", category: "blusas",
    fits: ["regular"], badge: "Nuevo", price: 69900, collection: "Misericordia",
    colors: ["crema", "arena"], sizes: SIZES_STD,
    stock: makeStock(["crema", "arena"], SIZES_STD, {}),
    envioGratis: false, bestRank: 11, newRank: 9, rating: 4.8, reviews: 9,
    tile: { from: "#f1e1c8", to: "#c8956c", lines: ["LUZ"] },
    tags: ["luz", "blusa", "mujer"],
    story: "Ustedes son la luz del mundo. “Luz” es para brillar sin hacer ruido."
  });
  add({
    id: "gloria", ref: "GLO-201", name: "Hoodie Gloria", category: "hoodies",
    fits: ["oversize"], badge: "Oversize", price: 149900, collection: "Salmos",
    colors: ["ladrillo", "negro"], sizes: SIZES_STD,
    stock: makeStock(["ladrillo", "negro"], SIZES_STD, { ladrillo: ["S"] }),
    envioGratis: true, bestRank: 10, newRank: 10, rating: 4.9, reviews: 16,
    tile: { from: "#a4552c", to: "#3a1b0f", lines: ["GLORIA"] },
    tags: ["gloria", "hoodie", "buzo", "alabanza"],
    story: "Toda la gloria es de Él. Un hoodie pesado, cálido y con propósito."
  });
  add({
    id: "gorra-proposito", ref: "GOR-301", name: "Gorra Propósito", category: "gorras",
    fits: [], badge: "", price: 59900, collection: "Renacer",
    colors: ["negro", "crema", "cafe"], sizes: ["Única"],
    stock: makeStock(["negro", "crema", "cafe"], ["Única"], { cafe: ["Única"] }),
    envioGratis: false, bestRank: 12, newRank: 11, rating: 4.7, reviews: 11,
    tile: { from: "#b9a58d", to: "#4b392c", lines: ["PROPÓSITO"], small: true },
    tags: ["gorra", "proposito"],
    story: "Porque nada es casualidad. Una gorra para caminar con propósito."
  });
  add({
    id: "tote-mercy", ref: "TOT-401", name: "Tote Bag Mercy", category: "accesorios",
    fits: [], badge: "Nuevo", price: 49900, collection: "Mercy",
    colors: ["crema", "negro"], sizes: ["Única"],
    stock: makeStock(["crema", "negro"], ["Única"], {}),
    envioGratis: false, bestRank: 13, newRank: 13, rating: 4.8, reviews: 8,
    tile: { from: "#efe0cb", to: "#bb3f17", lines: ["MERCY"] },
    tags: ["tote", "bolso", "accesorio"],
    story: "Para llevar lo que necesitas — y compartir lo que crees."
  });
  add({
    id: "manilla-fe", ref: "MAN-402", name: "Manilla Fe", category: "accesorios",
    fits: [], badge: "", price: 24900, collection: "Mercy",
    colors: ["negro", "terracota"], sizes: ["Única"],
    stock: makeStock(["negro", "terracota"], ["Única"], {}),
    envioGratis: false, bestRank: 14, newRank: 14, rating: 4.9, reviews: 22,
    tile: { from: "#c9a98a", to: "#6b3a1d", lines: ["FE"], small: true },
    tags: ["manilla", "pulsera", "accesorio"],
    story: "Un detalle pequeño con un mensaje grande, siempre a la vista."
  });

  /* --- Fotos de vista previa (Pexels, licencia libre; enlazadas, no descargadas) ------
     IDs de fotos de https://www.pexels.com — solo para ver cómo se vería con fotografía real.
     Se desactivan con Mercy.config.stockPhotos = false. Orden: [principal, alterna 1, alterna 2]. */
  /* Cada producto muestra SIEMPRE la misma prenda: o bien una serie de la misma sesión de estudio
     (misma prenda y modelo, distintas poses), o bien acercamientos (zoom) de una sola foto.
     Entrada = id  |  { id, zoom, ox, oy }  (zoom y punto de origen en %, para los detalles) */
  const zoomOn = function (id, zoom, ox, oy) { return { id: id, zoom: zoom, ox: ox, oy: oy }; };
  const PHOTOS = {
    /* Camiseta terracota (estudio, fondo blanco): una sola modelo, detalles por zoom */
    "gracia":             [12395682, zoomOn(12395682, 1.9, "50%", "62%"), zoomOn(12395682, 1.7, "50%", "22%")],
    /* Camiseta blanca oversize — misma sesión, mismo modelo */
    "fe":                 [8217536, 8217507, 8217539],
    /* Hoodie negro, vista de espalda (estudio beige) */
    "salmo-23":           [6311272, zoomOn(6311272, 1.8, "50%", "22%"), zoomOn(6311272, 1.6, "50%", "62%")],
    /* Camiseta verde oliva (estudio gris claro) */
    "renacer":            [9558684, zoomOn(9558684, 1.9, "50%", "42%"), zoomOn(9558684, 1.6, "50%", "20%")],
    /* Camiseta blanca con gráfico (estudio gris) */
    "esperanza":          [2364577, zoomOn(2364577, 2.1, "50%", "36%"), zoomOn(2364577, 1.7, "50%", "18%")],
    /* Camiseta negra, brazos cruzados (estudio) */
    "amen":               [4584267, zoomOn(4584267, 1.8, "50%", "70%"), zoomOn(4584267, 1.6, "50%", "30%")],
    "jesus-es-el-camino": [19099186, zoomOn(19099186, 2.1, "52%", "70%"), zoomOn(19099186, 1.6, "50%", "38%")],
    /* Camiseta negra (estudio gris claro) */
    "paz":                [9558233, zoomOn(9558233, 1.8, "50%", "62%"), zoomOn(9558233, 1.5, "50%", "30%")],
    /* Blusa crema, luz suave de ventana */
    "misericordia":       [11802389, zoomOn(11802389, 1.8, "40%", "62%"), zoomOn(11802389, 1.6, "50%", "30%")],
    /* Top blanco, luz natural */
    "luz":                [413885, zoomOn(413885, 1.8, "50%", "62%"), zoomOn(413885, 1.6, "50%", "28%")],
    /* Hoodie vinotinto (estudio blanco) */
    "gloria":             [18700212, zoomOn(18700212, 2.0, "50%", "34%"), zoomOn(18700212, 1.6, "50%", "56%")],
    /* Gorra trucker blanca — misma sesión, mismo modelo */
    "gorra-proposito":    [9558770, 9558709, 9558927],
    /* Tote crema + tote negro (colores del producto) */
    "tote-mercy":         [9603489, 1214212, zoomOn(9603489, 1.7, "70%", "40%")],
    /* Manilla en muñeca */
    "manilla-fe":         [814662, zoomOn(814662, 1.9, "52%", "28%"), zoomOn(814662, 1.5, "78%", "22%")]
  };
  /* Sin h/fit: se conserva la proporción original y el recorte 4:5 lo hace CSS (object-fit + posición). */
  function photoUrl(id, w) {
    return "https://images.pexels.com/photos/" + id + "/pexels-photo-" + id + ".jpeg?auto=compress&cs=tinysrgb&w=" + w;
  }

  /* Rellena defaults comunes */
  P.forEach(function (p) {
    p.photos = PHOTOS[p.id] || [];
    p.sizeChart = SIZE_CHARTS[p.category] ? p.category : "";
    p.details = DETAILS[p.category] || [];
    p.care = CARE;
    p.soldOut = !!p.soldOut || Object.keys(p.stock).every(function (c) {
      return Object.keys(p.stock[c]).every(function (s) { return p.stock[c][s] === 0; });
    });
  });

  /* --- Reseñas ---------------------------------------------------------- */
  const REVIEWS = [
    { name: "Laura M.", city: "Bogotá", stars: 5, text: "Excelente calidad y el mensaje me encanta. La tela es suave y el estampado no se ha dañado.", quote: "La calidad es increíble y el mensaje llega al corazón. Me identifiqué apenas la vi." },
    { name: "Andrés R.", city: "Medellín", stars: 5, text: "Compré la Regular y me quedó perfecta. El proceso por WhatsApp fue muy rápido.", quote: "Pedí por WhatsApp y todo fue rapidísimo. La camiseta se siente premium." },
    { name: "Valentina C.", city: "Cali", stars: 5, text: "Más que una camiseta, un recordatorio diario. La amo y pedí otra.", quote: "Más que ropa, es un recordatorio de lo que creo. La uso con orgullo." }
  ];

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

  /* --- Franja en movimiento del hero (C8, C9, C37) ----------------------- */
  const MARQUEE = [
    { icon: "truck", text: "Envíos a todo el país" },
    { icon: "heart", text: "Viste con propósito" },
    { icon: "shield", text: "Compra segura" },
    { icon: "star", text: "+2.000 clientes felices" }
  ];

  Mercy.data = {
    COLORS: COLORS,
    FITS: FITS,
    CATEGORIES: CATEGORIES,
    PRODUCTS: P,
    SIZE_CHARTS: SIZE_CHARTS,
    SHIPPING_INFO: SHIPPING_INFO,
    RETURNS_INFO: RETURNS_INFO,
    REVIEWS: REVIEWS,
    DEPARTMENTS: DEPARTMENTS,
    PAYMENT_METHODS: PAYMENT_METHODS,
    MARQUEE: MARQUEE,

    photoUrl: photoUrl,
    byId: function (id) { return P.filter(function (p) { return p.id === id; })[0] || null; },
    color: function (id) { return COLORS[id] || { id: id, name: id, hex: "#999" }; },
    stockOf: function (p, color, size) {
      return p.stock && p.stock[color] && p.stock[color][size] != null ? p.stock[color][size] : 0;
    },
    colorHasStock: function (p, color) {
      return Object.keys(p.stock[color] || {}).some(function (s) { return p.stock[color][s] > 0; });
    }
  };
})();
