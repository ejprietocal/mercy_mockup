/* ==========================================================================
   Mercy Studio — defaults.js
   Contenido DE FÁBRICA del sitio (esquema: docs/ADMIN-CONTRATO.md §3).
   · La tienda lo usa cuando no hay servidor (abrir index.html con doble clic).
   · El servidor lo usa para crear data/content.json y data/coupons.json la primera vez.
   Con el servidor en marcha, el contenido real se edita desde el panel (/admin), NO aquí.
   Generado por tools/export_defaults.mjs a partir del mockup original. Precios, stock y textos = DATOS DE EJEMPLO.
   ========================================================================== */
window.Mercy = window.Mercy || {};

Mercy.DEFAULT_CONTENT = {
  schemaVersion: 1,
  meta: {
    updatedAt: "2026-10-09T00:00:00.000Z",
    updatedBy: "Sistema",
    sections: {}
  },
  settings: {
    brand: "Mercy Studio",
    whatsapp: "573000000000",
    whatsappDisplay: "+57 300 000 0000",
    whatsappGreeting: "Hola Mercy Studio 👋",
    social: { instagram: "https://www.instagram.com/mercy_studioo/", tiktok: "https://www.tiktok.com/@mercy.studio0", facebook: "https://www.facebook.com/search/top?q=MERCY%20STUDIO" },
    logo: { terracota: "assets/logo/mercy-studio-terracota.png", beige: "assets/logo/mercy-studio-beige.png", oscuro: "assets/logo/mercy-studio-oscuro.png" },
    seo: { title: "Mercy Studio — Viste con propósito", description: "Mercy Studio: prendas con propósito. Cada diseño cuenta una historia de fe, identidad y esperanza. Envíos a todo el país." },
    giftMaxChars: 180,
    pageSize: 6,
    showPhotos: true,
    showAdminLink: true
  },
  home: {
    hero: {
      media: {
        type: "video",
        src: "https://videos.pexels.com/video-files/6989014/6989014-hd_1920_1080_25fps.mp4",
        poster: "https://images.pexels.com/videos/6989014/pictures/preview-0.jpg",
        fallbackSrc: "https://videos.pexels.com/video-files/4502082/4502082-hd_1920_1080_24fps.mp4",
        fallbackPoster: "https://images.pexels.com/videos/4502082/pictures/preview-0.jpg"
      },
      eyebrow: "Nueva colección · Renacer",
      title: "Lo que crees,\nahora lo *vistes*",
      subtitle: "Prendas con propósito. Cada diseño cuenta una historia de fe, identidad y esperanza — pensadas para que tu mensaje también se lleve puesto.",
      ctaLabel: "Compra",
      ctaHref: "catalogo.html"
    },
    marquee: [
      { icon: "truck", text: "Envíos a todo el país" },
      { icon: "heart", text: "Viste con propósito" },
      { icon: "shield", text: "Compra segura" },
      { icon: "star", text: "+2.000 clientes felices" }
    ],
    bestSellers: { eyebrow: "Los favoritos", title: "Los más vendidos", count: 4, ctaLabel: "Ver todo" },
    purpose: {
      eyebrow: "Nuestro propósito",
      title: "Más que una prenda, un mensaje que *llevas puesto*",
      text: "Mercy Studio existe para usar la moda como un medio para comunicar la Palabra de Dios, expresar nuestra fe de manera auténtica y creativa, y llevar el mensaje de Cristo a más personas. Creamos prendas con propósito, recordando que Mercy es el medio; Cristo es siempre el centro.",
      buttonLabel: "Conoce la historia",
      storyTitle: "Nuestra historia",
      storyQuote: "La moda es el medio. Cristo es el mensaje",
      storyCtaLabel: "Conoce la colección"
    },
    reviews: { title: "Reseñas de Google", score: 4.9, count: 320 },
    community: {
      title: "Sé parte de nuestra *comunidad* Mercy",
      subtitle: "Tu camino de fe comienza aquí.",
      highlight: "Obtén un {descuento} de descuento en tu primer pedido.",
      placeholder: "Introduce tu correo electrónico",
      buttonLabel: "Obtén un {descuento} de descuento",
      fine: "Al registrarte aceptas recibir novedades de Mercy Studio. Puedes darte de baja cuando quieras.",
      doneTitle: "¡Bienvenido a Mercy!",
      doneMsg: "Ya está aplicado a tu carrito",
      doneCtaLabel: "Seguir comprando"
    }
  },
  discountModal: {
    enabled: true,
    autoOpen: true,
    delayMs: 3500,
    showOnCartOpen: true,
    image: "",
    title: "Tu camino de *fe* comienza aquí",
    offerText: "Obtén un {descuento} de descuento en tu primer pedido",
    placeholder: "Introduce tu correo electrónico",
    buttonLabel: "Obtén un {descuento} de descuento",
    fine: "Al registrarte aceptas recibir novedades de Mercy Studio. Puedes darte de baja cuando quieras.",
    successTitle: "¡Bienvenido a Mercy!",
    successOffer: "Tu código de {descuento} ya está aplicado",
    successFine: "Se descuenta automáticamente en tu primer pedido.",
    successButton: "Seguir mirando",
    couponCode: "MERCY15"
  },
  texts: {
    topStrip: ["Viste con propósito", "Envíos a toda Colombia", "Compra segura"],
    footerTagline: "La moda es el medio. Cristo es el mensaje",
    footerLegal: "© 2026 Mercy Studio · Hecho con propósito en Colombia",
    searchSuggestions: ["Camisetas", "Hoodies", "Oversize", "Terracota", "JECVV"],
    shippingInfo: "Enviamos a toda Colombia. Algunas prendas incluyen envío gratis (lo verás marcado en el producto y en tu carrito); en las demás el envío tiene un costo adicional que coordinamos contigo por WhatsApp.",
    returnsInfo: "¿Te quedó grande o pequeña? Escríbenos por WhatsApp apenas recibas tu pedido y coordinamos el cambio. La prenda debe estar sin uso y con sus etiquetas.",
    care: ["Lávala en agua fría y evita la secadora para que no encoja", "Plancha siempre al revés, sin calor directo sobre el diseño", "Lava a mano con tonos similares", "No uses blanqueador, así mantienes los colores vivos"],
    sizeGuideNote: "Medidas de la prenda en centímetros, tomadas en plano. Pueden variar ±1 cm. (Valores de ejemplo.)",
    catalog: { eyebrow: "Catálogo", allTitle: "Toda la *Colección*", subtitle: "Fe, propósito y misericordia", bestTitle: "Los más vendidos", newTitle: "Novedades" }
  },
  colors: [
    { id: "negro", name: "Negro", hex: "#2a1e14" },
    { id: "crema", name: "Crema", hex: "#f6e9d5" },
    { id: "terracota", name: "Terracota", hex: "#bb3f17" },
    { id: "cafe", name: "Café", hex: "#6e5847" },
    { id: "taupe", name: "Taupe", hex: "#9a8468" },
    { id: "verde", name: "Verde salvia", hex: "#5e7360" },
    { id: "ladrillo", name: "Ladrillo", hex: "#8e3410" },
    { id: "arena", name: "Arena", hex: "#d8bea6" }
  ],
  fits: [
    { id: "regular", name: "Regular" },
    { id: "oversize", name: "Oversize" },
    { id: "boxy", name: "Boxy" }
  ],
  categories: [
    {
      id: "camisetas",
      name: "Camisetas",
      details: ["Algodón 100 % de 210 g, transpirable y fresco", "Estampación DTF de alta durabilidad", "Cuello RIB resistente", "Corte unisex y femenino", "Horma disponible: Regular, Oversize o Boxy", "Hecha en Colombia", "Modelo: 1,80 m usa talla L"],
      sizeChart: "camisetas",
      inFooter: true
    },
    {
      id: "blusas",
      name: "Blusas",
      details: ["Algodón suave 100 %, ligera y fresca", "Estampación DTF de alta durabilidad", "Corte femenino con caída relajada", "Hecha en Colombia", "Modelo: 1,68 m usa talla M"],
      sizeChart: "blusas",
      inFooter: true
    },
    {
      id: "hoodies",
      name: "Hoodies",
      details: ["Algodón French Terry de 320 g, interior suave", "Capota doble con cordón", "Bolsillo canguro", "Estampación DTF de alta durabilidad", "Corte unisex", "Hecha en Colombia", "Modelo: 1,80 m usa talla L"],
      sizeChart: "hoodies",
      inFooter: true
    },
    {
      id: "gorras",
      name: "Gorras",
      details: ["Gorra de gabardina con curva clásica", "Bordado en alto relieve", "Cierre ajustable trasero", "Talla única"],
      sizeChart: "",
      inFooter: false
    },
    {
      id: "accesorios",
      name: "Accesorios",
      details: ["Tela de lona de algodón resistente", "Estampación serigráfica", "Medidas aprox. 38 × 42 cm", "Hecho en Colombia"],
      sizeChart: "",
      inFooter: true
    }
  ],
  collections: [
    { id: "renacer", name: "Renacer", description: "" },
    { id: "salmos", name: "Salmos", description: "" },
    { id: "juan-14-6", name: "Juan 14:6", description: "" },
    { id: "misericordia", name: "Misericordia", description: "" },
    { id: "mercy", name: "Mercy", description: "" }
  ],
  sizeCharts: [
    {
      id: "camisetas",
      name: "Camisetas",
      head: ["Talla", "Pecho", "Largo", "Manga"],
      unit: "cm",
      rows: {
        regular: [
          ["S", 51, 68, 20],
          ["M", 53, 70, 21],
          ["L", 55, 72, 22],
          ["XL", 57, 74, 23],
          ["XXL", 59, 76, 24]
        ],
        oversize: [
          ["S", 56, 72, 24],
          ["M", 58, 74, 25],
          ["L", 60, 76, 26],
          ["XL", 62, 78, 27],
          ["XXL", 64, 80, 28]
        ],
        boxy: [
          ["S", 54, 66, 22],
          ["M", 56, 68, 23],
          ["L", 58, 70, 24],
          ["XL", 60, 72, 25],
          ["XXL", 62, 74, 26]
        ]
      }
    },
    {
      id: "blusas",
      name: "Blusas",
      head: ["Talla", "Pecho", "Largo", "Manga"],
      unit: "cm",
      rows: {
        regular: [
          ["S", 47, 58, 19],
          ["M", 49, 60, 20],
          ["L", 51, 62, 21],
          ["XL", 53, 64, 22],
          ["XXL", 55, 66, 23]
        ],
        oversize: [
          ["S", 52, 62, 22],
          ["M", 54, 64, 23],
          ["L", 56, 66, 24],
          ["XL", 58, 68, 25],
          ["XXL", 60, 70, 26]
        ]
      }
    },
    {
      id: "hoodies",
      name: "Hoodies",
      head: ["Talla", "Pecho", "Largo", "Manga"],
      unit: "cm",
      rows: {
        regular: [
          ["S", 56, 66, 60],
          ["M", 58, 68, 61],
          ["L", 60, 70, 62],
          ["XL", 62, 72, 63],
          ["XXL", 64, 74, 64]
        ],
        oversize: [
          ["S", 60, 70, 62],
          ["M", 62, 72, 63],
          ["L", 64, 74, 64],
          ["XL", 66, 76, 65],
          ["XXL", 68, 78, 66]
        ]
      }
    }
  ],
  reviews: [
    {
      id: "r1",
      name: "Laura M.",
      city: "Bogotá",
      stars: 5,
      quote: "La calidad es increíble y el mensaje llega al corazón. Me identifiqué apenas la vi.",
      text: "Excelente calidad y el mensaje me encanta. La tela es suave y el estampado no se ha dañado.",
      visible: true
    },
    {
      id: "r2",
      name: "Andrés R.",
      city: "Medellín",
      stars: 5,
      quote: "Pedí por WhatsApp y todo fue rapidísimo. La camiseta se siente premium.",
      text: "Compré la Regular y me quedó perfecta. El proceso por WhatsApp fue muy rápido.",
      visible: true
    },
    {
      id: "r3",
      name: "Valentina C.",
      city: "Cali",
      stars: 5,
      quote: "Más que ropa, es un recordatorio de lo que creo. La uso con orgullo.",
      text: "Más que una camiseta, un recordatorio diario. La amo y pedí otra.",
      visible: true
    }
  ],
  products: [
    {
      id: "gracia",
      ref: "GRA-001",
      name: "Camiseta Gracia",
      status: "published",
      category: "camisetas",
      collection: "renacer",
      fits: ["oversize", "regular", "boxy"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 89900,
      badge: "Oversize",
      envioGratis: true,
      soldOut: false,
      bestRank: 1,
      newRank: 4,
      rating: 4.9,
      reviewsCount: 112,
      colors: [
        {
          color: "terracota",
          photos: [
            { src: "https://images.pexels.com/photos/12395682/pexels-photo-12395682.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/12395682/pexels-photo-12395682.jpeg", thumb: "", alt: "", zoom: 1.9, ox: "50%", oy: "62%" },
            { src: "https://images.pexels.com/photos/12395682/pexels-photo-12395682.jpeg", thumb: "", alt: "", zoom: 1.7, ox: "50%", oy: "22%" }
          ],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "negro",
          photos: [],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 4 }
        },
        {
          color: "crema",
          photos: [],
          stock: { S: 6, M: 7, L: 8, XL: 4, XXL: 0 }
        },
        {
          color: "cafe",
          photos: [],
          stock: { S: 7, M: 8, L: 4, XL: 5, XXL: 6 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#d8bea6",
        to: "#b77e5d",
        lines: ["GRACIA"],
        sub: "SOBRE GRACIA",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["gracia", "oversize", "fe", "amor"],
      desc: "",
      story: "“Gracia” nació de una verdad sencilla: lo mejor que hemos recibido nunca lo merecimos. Es un recordatorio de que hay amor que no se gana, se acepta.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "fe",
      ref: "FE-002",
      name: "Camiseta Fe",
      status: "published",
      category: "camisetas",
      collection: "renacer",
      fits: ["regular", "oversize", "boxy"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 79900,
      badge: "Nuevo",
      envioGratis: false,
      soldOut: false,
      bestRank: 2,
      newRank: 1,
      rating: 4.9,
      reviewsCount: 48,
      colors: [
        {
          color: "negro",
          photos: [],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 0 }
        },
        {
          color: "crema",
          photos: [
            { src: "https://images.pexels.com/photos/8217536/pexels-photo-8217536.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/8217507/pexels-photo-8217507.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/8217539/pexels-photo-8217539.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null }
          ],
          stock: { S: 0, M: 6, L: 7, XL: 8, XXL: 4 }
        },
        {
          color: "terracota",
          photos: [],
          stock: { S: 6, M: 7, L: 8, XL: 4, XXL: 5 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#c5a68b",
        to: "#a44809",
        lines: ["FE"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["fe", "creer", "renacer"],
      desc: "",
      story: "“Fe” nació de un momento de incertidumbre. Es un recordatorio de que creer no siempre es ver — es seguir caminando confiando. Quien la lleva puesta declara aquello que sostiene su corazón.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "salmo-23",
      ref: "SAL-023",
      name: "Hoodie Salmo 23",
      status: "published",
      category: "hoodies",
      collection: "salmos",
      fits: ["oversize", "regular"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 139900,
      badge: "",
      envioGratis: true,
      soldOut: false,
      bestRank: 3,
      newRank: 8,
      rating: 5,
      reviewsCount: 64,
      colors: [
        {
          color: "negro",
          photos: [
            { src: "https://images.pexels.com/photos/6311272/pexels-photo-6311272.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/6311272/pexels-photo-6311272.jpeg", thumb: "", alt: "", zoom: 1.8, ox: "50%", oy: "22%" },
            { src: "https://images.pexels.com/photos/6311272/pexels-photo-6311272.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "62%" }
          ],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "taupe",
          photos: [],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 0 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#8d7864",
        to: "#3b2d23",
        lines: ["SALMO", "23"],
        sub: "",
        stacked: true,
        small: false,
        fs: null
      },
      tags: ["salmo", "pastor", "hoodie", "buzo"],
      desc: "",
      story: "El Señor es mi pastor, nada me faltará. Un hoodie para los días de frío, de incertidumbre y de descanso en Él.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "renacer",
      ref: "REN-004",
      name: "Camiseta Renacer",
      status: "published",
      category: "camisetas",
      collection: "renacer",
      fits: ["regular", "oversize"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 84900,
      badge: "Oversize",
      envioGratis: false,
      soldOut: false,
      bestRank: 4,
      newRank: 2,
      rating: 4.8,
      reviewsCount: 39,
      colors: [
        {
          color: "arena",
          photos: [],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "negro",
          photos: [],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 4 }
        },
        {
          color: "crema",
          photos: [],
          stock: { S: 6, M: 7, L: 8, XL: 4, XXL: 5 }
        },
        {
          color: "verde",
          photos: [
            { src: "https://images.pexels.com/photos/9558684/pexels-photo-9558684.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/9558684/pexels-photo-9558684.jpeg", thumb: "", alt: "", zoom: 1.9, ox: "50%", oy: "42%" },
            { src: "https://images.pexels.com/photos/9558684/pexels-photo-9558684.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "20%" }
          ],
          stock: { S: 7, M: 8, L: 4, XL: 0, XXL: 0 }
        },
        {
          color: "terracota",
          photos: [],
          stock: { S: 8, M: 4, L: 5, XL: 6, XXL: 7 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#d8bea6",
        to: "#a76d4a",
        lines: ["RENACER"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["renacer", "nueva vida", "oversize"],
      desc: "",
      story: "Todo lo que parecía final fue el principio. “Renacer” es para quien volvió a empezar de la mano de Dios.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "esperanza",
      ref: "ESP-005",
      name: "Camiseta Esperanza",
      status: "published",
      category: "camisetas",
      collection: "renacer",
      fits: ["regular", "boxy"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 79900,
      badge: "",
      envioGratis: false,
      soldOut: false,
      bestRank: 5,
      newRank: 6,
      rating: 4.9,
      reviewsCount: 27,
      colors: [
        {
          color: "cafe",
          photos: [],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "crema",
          photos: [
            { src: "https://images.pexels.com/photos/2364577/pexels-photo-2364577.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/2364577/pexels-photo-2364577.jpeg", thumb: "", alt: "", zoom: 2.1, ox: "50%", oy: "36%" },
            { src: "https://images.pexels.com/photos/2364577/pexels-photo-2364577.jpeg", thumb: "", alt: "", zoom: 1.7, ox: "50%", oy: "18%" }
          ],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 4 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#c0ae95",
        to: "#715b4a",
        lines: ["ESPERANZA"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["esperanza", "confianza"],
      desc: "",
      story: "La esperanza no defrauda. “Esperanza” es una declaración silenciosa de que lo mejor aún viene.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "amen",
      ref: "AME-006",
      name: "Camiseta Amén",
      status: "published",
      category: "camisetas",
      collection: "salmos",
      fits: ["regular"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 84900,
      badge: "",
      envioGratis: false,
      soldOut: true,
      bestRank: 6,
      newRank: 12,
      rating: 4.7,
      reviewsCount: 18,
      colors: [
        {
          color: "terracota",
          photos: [],
          stock: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }
        },
        {
          color: "negro",
          photos: [
            { src: "https://images.pexels.com/photos/4584267/pexels-photo-4584267.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/4584267/pexels-photo-4584267.jpeg", thumb: "", alt: "", zoom: 1.8, ox: "50%", oy: "70%" },
            { src: "https://images.pexels.com/photos/4584267/pexels-photo-4584267.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "30%" }
          ],
          stock: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#8f7f6d",
        to: "#75370c",
        lines: ["AMÉN"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["amen", "así sea"],
      desc: "",
      story: "Así sea. “Amén” cierra cada oración con confianza y empieza cada día con expectativa.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "jesus-es-el-camino",
      ref: "JECVV",
      name: "Camiseta Ref. Jesús es el camino",
      status: "published",
      category: "camisetas",
      collection: "juan-14-6",
      fits: ["oversize", "regular"],
      sizes: ["S", "M", "L", "XL"],
      price: 105900,
      badge: "Oversize",
      envioGratis: true,
      soldOut: false,
      bestRank: 7,
      newRank: 3,
      rating: 5,
      reviewsCount: 21,
      colors: [
        {
          color: "negro",
          photos: [
            { src: "https://images.pexels.com/photos/19099186/pexels-photo-19099186.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/19099186/pexels-photo-19099186.jpeg", thumb: "", alt: "", zoom: 2.1, ox: "52%", oy: "70%" },
            { src: "https://images.pexels.com/photos/19099186/pexels-photo-19099186.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "38%" }
          ],
          stock: { S: 4, M: 5, L: 6, XL: 7 }
        }
      ],
      prints: [
        { id: "naranja", name: "Naranja", hex: "#e8620a" },
        { id: "azul", name: "Azul noche", hex: "#2f2f63" }
      ],
      video: null,
      tile: {
        from: "#5b2418",
        to: "#1c0f0b",
        lines: ["JESÚS", "ES EL CAMINO"],
        sub: "",
        stacked: false,
        small: false,
        fs: 11
      },
      tags: ["jesus", "camino", "verdad", "vida", "juan"],
      desc: "Camiseta en algodón de 210 gr, con horma Oversize o Regular Fit, cuello RIB resistente.",
      story: "“Yo soy el camino, la verdad y la vida.” Juan 14:6. Una camiseta para declarar hacia dónde caminas.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "paz",
      ref: "PAZ-007",
      name: "Camiseta Paz",
      status: "published",
      category: "camisetas",
      collection: "renacer",
      fits: ["regular", "oversize", "boxy"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 79900,
      badge: "Nuevo",
      envioGratis: false,
      soldOut: false,
      bestRank: 9,
      newRank: 5,
      rating: 4.8,
      reviewsCount: 14,
      colors: [
        {
          color: "crema",
          photos: [],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "verde",
          photos: [],
          stock: { S: 0, M: 6, L: 7, XL: 8, XXL: 4 }
        },
        {
          color: "negro",
          photos: [
            { src: "https://images.pexels.com/photos/9558233/pexels-photo-9558233.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/9558233/pexels-photo-9558233.jpeg", thumb: "", alt: "", zoom: 1.8, ox: "50%", oy: "62%" },
            { src: "https://images.pexels.com/photos/9558233/pexels-photo-9558233.jpeg", thumb: "", alt: "", zoom: 1.5, ox: "50%", oy: "30%" }
          ],
          stock: { S: 6, M: 7, L: 8, XL: 4, XXL: 5 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#c9c3a8",
        to: "#5e7360",
        lines: ["PAZ"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["paz", "calma"],
      desc: "",
      story: "Una paz que sobrepasa todo entendimiento. “Paz” es para los días en que solo necesitas descansar en Él.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "misericordia",
      ref: "MIS-101",
      name: "Blusa Misericordia",
      status: "published",
      category: "blusas",
      collection: "misericordia",
      fits: ["regular", "oversize"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 74900,
      badge: "",
      envioGratis: true,
      soldOut: false,
      bestRank: 8,
      newRank: 7,
      rating: 4.9,
      reviewsCount: 33,
      colors: [
        {
          color: "crema",
          photos: [
            { src: "https://images.pexels.com/photos/11802389/pexels-photo-11802389.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/11802389/pexels-photo-11802389.jpeg", thumb: "", alt: "", zoom: 1.8, ox: "40%", oy: "62%" },
            { src: "https://images.pexels.com/photos/11802389/pexels-photo-11802389.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "30%" }
          ],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "terracota",
          photos: [],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 0 }
        },
        {
          color: "negro",
          photos: [],
          stock: { S: 6, M: 7, L: 8, XL: 4, XXL: 5 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#e3cdb4",
        to: "#bb3f17",
        lines: ["MISERI-", "CORDIA"],
        sub: "",
        stacked: false,
        small: false,
        fs: 13
      },
      tags: ["misericordia", "blusa", "mujer"],
      desc: "",
      story: "Nuevas cada mañana son sus misericordias. Una blusa suave para recordarlo cada día.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "luz",
      ref: "LUZ-102",
      name: "Blusa Luz",
      status: "published",
      category: "blusas",
      collection: "misericordia",
      fits: ["regular"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 69900,
      badge: "Nuevo",
      envioGratis: false,
      soldOut: false,
      bestRank: 11,
      newRank: 9,
      rating: 4.8,
      reviewsCount: 9,
      colors: [
        {
          color: "crema",
          photos: [
            { src: "https://images.pexels.com/photos/413885/pexels-photo-413885.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/413885/pexels-photo-413885.jpeg", thumb: "", alt: "", zoom: 1.8, ox: "50%", oy: "62%" },
            { src: "https://images.pexels.com/photos/413885/pexels-photo-413885.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "28%" }
          ],
          stock: { S: 4, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "arena",
          photos: [],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 4 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#f1e1c8",
        to: "#c8956c",
        lines: ["LUZ"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["luz", "blusa", "mujer"],
      desc: "",
      story: "Ustedes son la luz del mundo. “Luz” es para brillar sin hacer ruido.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "gloria",
      ref: "GLO-201",
      name: "Hoodie Gloria",
      status: "published",
      category: "hoodies",
      collection: "salmos",
      fits: ["oversize"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      price: 149900,
      badge: "Oversize",
      envioGratis: true,
      soldOut: false,
      bestRank: 10,
      newRank: 10,
      rating: 4.9,
      reviewsCount: 16,
      colors: [
        {
          color: "ladrillo",
          photos: [
            { src: "https://images.pexels.com/photos/18700212/pexels-photo-18700212.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/18700212/pexels-photo-18700212.jpeg", thumb: "", alt: "", zoom: 2, ox: "50%", oy: "34%" },
            { src: "https://images.pexels.com/photos/18700212/pexels-photo-18700212.jpeg", thumb: "", alt: "", zoom: 1.6, ox: "50%", oy: "56%" }
          ],
          stock: { S: 0, M: 5, L: 6, XL: 7, XXL: 8 }
        },
        {
          color: "negro",
          photos: [],
          stock: { S: 5, M: 6, L: 7, XL: 8, XXL: 4 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#a4552c",
        to: "#3a1b0f",
        lines: ["GLORIA"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["gloria", "hoodie", "buzo", "alabanza"],
      desc: "",
      story: "Toda la gloria es de Él. Un hoodie pesado, cálido y con propósito.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "gorra-proposito",
      ref: "GOR-301",
      name: "Gorra Propósito",
      status: "published",
      category: "gorras",
      collection: "renacer",
      fits: [],
      sizes: ["Única"],
      price: 59900,
      badge: "",
      envioGratis: false,
      soldOut: false,
      bestRank: 12,
      newRank: 11,
      rating: 4.7,
      reviewsCount: 11,
      colors: [
        {
          color: "negro",
          photos: [],
          stock: { "Única": 4 }
        },
        {
          color: "crema",
          photos: [
            { src: "https://images.pexels.com/photos/9558770/pexels-photo-9558770.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/9558709/pexels-photo-9558709.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/9558927/pexels-photo-9558927.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null }
          ],
          stock: { "Única": 5 }
        },
        {
          color: "cafe",
          photos: [],
          stock: { "Única": 0 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#b9a58d",
        to: "#4b392c",
        lines: ["PROPÓSITO"],
        sub: "",
        stacked: false,
        small: true,
        fs: null
      },
      tags: ["gorra", "proposito"],
      desc: "",
      story: "Porque nada es casualidad. Una gorra para caminar con propósito.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "tote-mercy",
      ref: "TOT-401",
      name: "Tote Bag Mercy",
      status: "published",
      category: "accesorios",
      collection: "mercy",
      fits: [],
      sizes: ["Única"],
      price: 49900,
      badge: "Nuevo",
      envioGratis: false,
      soldOut: false,
      bestRank: 13,
      newRank: 13,
      rating: 4.8,
      reviewsCount: 8,
      colors: [
        {
          color: "crema",
          photos: [
            { src: "https://images.pexels.com/photos/9603489/pexels-photo-9603489.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/9603489/pexels-photo-9603489.jpeg", thumb: "", alt: "", zoom: 1.7, ox: "70%", oy: "40%" }
          ],
          stock: { "Única": 4 }
        },
        {
          color: "negro",
          photos: [
            { src: "https://images.pexels.com/photos/1214212/pexels-photo-1214212.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null }
          ],
          stock: { "Única": 5 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#efe0cb",
        to: "#bb3f17",
        lines: ["MERCY"],
        sub: "",
        stacked: false,
        small: false,
        fs: null
      },
      tags: ["tote", "bolso", "accesorio"],
      desc: "",
      story: "Para llevar lo que necesitas — y compartir lo que crees.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    },
    {
      id: "manilla-fe",
      ref: "MAN-402",
      name: "Manilla Fe",
      status: "published",
      category: "accesorios",
      collection: "mercy",
      fits: [],
      sizes: ["Única"],
      price: 24900,
      badge: "",
      envioGratis: false,
      soldOut: false,
      bestRank: 14,
      newRank: 14,
      rating: 4.9,
      reviewsCount: 22,
      colors: [
        {
          color: "negro",
          photos: [
            { src: "https://images.pexels.com/photos/814662/pexels-photo-814662.jpeg", thumb: "", alt: "", zoom: null, ox: null, oy: null },
            { src: "https://images.pexels.com/photos/814662/pexels-photo-814662.jpeg", thumb: "", alt: "", zoom: 1.9, ox: "52%", oy: "28%" },
            { src: "https://images.pexels.com/photos/814662/pexels-photo-814662.jpeg", thumb: "", alt: "", zoom: 1.5, ox: "78%", oy: "22%" }
          ],
          stock: { "Única": 4 }
        },
        {
          color: "terracota",
          photos: [],
          stock: { "Única": 5 }
        }
      ],
      prints: [],
      video: null,
      tile: {
        from: "#c9a98a",
        to: "#6b3a1d",
        lines: ["FE"],
        sub: "",
        stacked: false,
        small: true,
        fs: null
      },
      tags: ["manilla", "pulsera", "accesorio"],
      desc: "",
      story: "Un detalle pequeño con un mensaje grande, siempre a la vista.",
      details: [],
      care: [],
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      updatedBy: "Sistema"
    }
  ]
};

Mercy.DEFAULT_COUPONS = [
  {
    id: "c-mercy15",
    code: "MERCY15",
    description: "15 % en el primer pedido (pop-up de bienvenida)",
    type: "percent",
    value: 15,
    active: true,
    startsAt: null,
    endsAt: null,
    minSubtotal: 0,
    maxUses: null,
    usesCount: 0,
    appliesTo: "all",
    categoryIds: [],
    productIds: [],
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z",
    createdBy: "Sistema"
  }
];
