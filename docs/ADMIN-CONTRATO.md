# Mercy Studio — Contrato del panel administrador (CMS)

Documento **fuente de verdad** para el servidor (`server/`), la tienda (`*.html`, `js/`, `css/`) y el panel (`admin/`).
Si algo no está aquí, se decide con el criterio de los CMS conocidos (WordPress, Shopify) y se documenta en este archivo.

Decisiones del cliente:
- Persistencia: **servidor Node propio, sin dependencias npm** (Node ≥ 22), contenido en JSON, archivos subidos en disco (volumen persistente en Easypanel). Los cambios los ven **todos** los visitantes.
- Usuarios: **varios usuarios con roles** (Administrador / Editor).
- Módulos: inicio (video del hero y frases), textos del sitio, productos (colores → hasta **10 fotos por color**, los **estampados que lleva cada color** y hasta **10 fotos por combinación color + estampado**), modal de descuento, **cupones** (listado + creación), **suscriptores**, **reseñas / categorías / colecciones / colores / hormas / guía de tallas**, **historial de cambios** (actividad + revisiones restaurables), medios, usuarios, ajustes.
- Idioma de toda la interfaz: **español de Colombia**. Moneda: COP sin decimales (`$89.900`).

---

## 1. Estructura de archivos

```
mercy_mockup/
├─ index.html catalogo.html producto.html checkout.html     tienda
├─ css/ js/ assets/                                         tienda (js clásico: IIFE + window.Mercy)
│  └─ js/defaults.js       Mercy.DEFAULT_CONTENT + Mercy.DEFAULT_COUPONS (contenido de fábrica, esquema §3; el servidor lo publica sin cupones, §4.4)
├─ admin/                                                   panel (ES modules nativos, sin build)
│  ├─ index.html  login.html
│  ├─ css/admin.css
│  └─ js/ main.js  core/*.js  views/*.js
├─ server/                                                  Node ≥ 22, ESM, CERO dependencias
│  ├─ index.js             arranque: node server/index.js
│  ├─ lib/*.js  routes/*.js
│  └─ test/*.test.js       node --test
├─ data/   (git-ignorado; en Docker = volumen /data)
│  ├─ content.json  users.json  sessions.json  coupons.json  subscribers.json  media.json  activity.json
│  ├─ revisions/<id>.json
│  └─ uploads/AAAA/MM/<archivo>
├─ package.json            "type": "module", scripts start/dev/test, engines node >=22, sin dependencies
└─ tools/export_defaults.mjs   (generó js/defaults.js a partir del mockup original; uso único, histórico: no se vuelve a ejecutar)
```

Variables de entorno del servidor: `PORT` (4000), `HOST` (0.0.0.0), `DATA_DIR` (`<repo>/data`; Docker `/data`),
`ADMIN_EMAIL` (por defecto `admin@mercystudio.co`), `ADMIN_PASSWORD` (si no existe y no hay usuarios, se genera una aleatoria
y se imprime en consola UNA vez), `ADMIN_NAME` (`Administrador`), `TRUST_PROXY` (`1` en Docker: respeta `X-Forwarded-For/Proto`),
`NODE_ENV`, `GIT_SHA` (versión). *(servidor)* `ADMIN_RESET=1`: al arrancar restablece la contraseña de `ADMIN_EMAIL` (lo crea si no existe,
lo deja admin y activo, cierra sus sesiones) — recuperación de acceso; quitarla después. Guía de operación: `docs/SERVIDOR.md`.

---

## 2. Convenciones de texto enriquecido (todas las pantallas)

Los textos se guardan **crudos** (nunca HTML). La tienda siempre escapa y luego aplica:
- `*palabra*` → `<span class="accent">palabra</span>` (cursiva de marca, Dafoe). Solo en campos marcados *(acento)*.
- Salto de línea `\n` → en títulos *(multilínea)* cada línea es un `<span class="hero__line">`; en párrafos → `<br>`.
- `{descuento}` → etiqueta del cupón de bienvenida (`15%` o `$20.000`). Solo en textos del modal/comunidad/carrito.
- Helper de tienda: `Mercy.ui.rich(text, { lines?: "hero__line", accent?: false, fill?: true })` y `Mercy.ui.fill(text)` (reemplaza `{descuento}`;
  sin cupón de bienvenida vigente lo quita sin dejar espacios dobles).
- `texts.sizeGuideNote`: un paréntesis al final (p. ej. "(Valores de ejemplo.)") se muestra en cursiva.

URLs válidas en contenido: `https://…`, `http://…`, rutas absolutas del sitio `/uploads/…`, `/assets/…` y relativas
`assets/…`, `catalogo.html…`, `producto.html…`, `index.html…`, `#…`. Prohibido `javascript:`, `data:` (salvo imágenes en el
panel, nunca guardadas), `vbscript:`.
*(servidor)* También se aceptan `checkout.html…`, las páginas con `/` inicial (`/catalogo.html?cat=…`) y `uploads/…` relativo.
Por campo: redes sociales (`settings.social.*`) solo `http(s)://`; medios (fotos, video, póster, logos, `discountModal.image`) =
`http(s)://` o archivos del sitio (`/uploads/…`, `/assets/…`); enlaces (`home.hero.ctaHref`) = todo lo anterior + páginas y `#…`.
Nunca `//dominio`, espacios, comillas, `<>` ni segmentos `..`.

Slugs (`id`): `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–60 caracteres. Hex: `^#[0-9a-fA-F]{6}$` (se guarda en minúsculas).

---

## 3. Esquema del contenido (`content.json`, `Mercy.DEFAULT_CONTENT`)

```js
{
  schemaVersion: 1,
  meta: { updatedAt: ISO, updatedBy: "Nombre", sections: { [sección]: { updatedAt, updatedBy } } },

  settings: {                                   // SOLO administrador
    brand: "Mercy Studio",
    whatsapp: "573000000000",                   // dígitos, 8–15
    whatsappDisplay: "+57 300 000 0000",
    whatsappGreeting: "Hola Mercy Studio 👋",       // admite saltos de línea (\n)
    social: { instagram: url|"", tiktok: url|"", facebook: url|"" },
    logo: { terracota: url, beige: url, oscuro: url },
    seo: { title: "Mercy Studio — Viste con propósito", description: "…" },   // <title>/<meta> del Inicio
    giftMaxChars: 180,                          // 20–1000
    pageSize: 6,                                // 2–48 productos por "página" del catálogo
    showPhotos: true,                           // false = tarjetas con degradado + texto (antes stockPhotos)
    showAdminLink: true,                        // botón de acceso al panel en el header de la tienda
    metaPixelId: "",                            // píxel de Meta (solo dígitos). Vacío = la tienda no lo carga. Eventos: PageView, ViewContent,
                                                //   AddToCart, InitiateCheckout, Lead + PedidoWhatsApp (al abrir WhatsApp con el pedido), Contact
    paymentMethods: [                           // 1–8 medios de pago del checkout (transferencia); el elegido viaja en el mensaje de WhatsApp
      { id: "nequi", name: "Nequi", hint: "Transferencia desde la app Nequi", logo: "nequi" }   // logo: nequi | breb | bancolombia | none
    ]                                           //   (sin id, el servidor lo deriva del nombre; ids únicos)
  },

  home: {
    hero: {
      media: { type: "video"|"image"|"none", src: url|"", poster: url|"", fallbackSrc: url|"", fallbackPoster: url|"" },
      eyebrow: "Nueva colección · Renacer",
      title: "Lo que crees,\nahora lo *vistes*",          // (multilínea)(acento)
      subtitle: "Prendas con propósito…",
      ctaLabel: "Compra", ctaHref: "catalogo.html"
    },
    marquee: [ { icon: IconoFranja, text: "Envíos a todo el país" }, … ],   // 1–10; la franja en movimiento
    bestSellers: { eyebrow: "Los favoritos", title: "Los más vendidos", count: 4 /*1–12*/, ctaLabel: "Ver todo" },
    purpose: {
      eyebrow: "Nuestro propósito",
      title: "Más que una prenda, un mensaje que *llevas puesto*",   // (acento)
      text: "Mercy Studio existe…",
      buttonLabel: "Conoce la historia",
      storyTitle: "Nuestra historia", storyQuote: "La moda es el medio. Cristo es el mensaje", storyCtaLabel: "Conoce la colección",
      storyText: ""          // (multilínea, ≤ 5000) texto de la ventana «Nuestra historia»; línea en blanco = párrafo. "" = repite text
    },
    reviews: {
      title: "Reseñas de Google", score: 4.9 /*0–5*/, count: 320,
      layout: "slider" | "accordion",               // nunca apiladas: carrusel de lado o acordeón horizontal (pestañas verticales)
      motion: "none" | "timer" | "continuous",      // continuous = tira continua (solo carrusel; en acordeón se trata como timer)
      interval: 4,                                  // segundos entre avances con motion "timer" (1–30)
      speed: "slow" | "normal" | "fast"             // velocidad de la tira continua
    },                                              // (se pausa con cursor, foco, toque, fuera de pantalla y botón Pausar; quieta con «reducir movimiento»)
    community: {
      title: "Sé parte de nuestra *comunidad* Mercy",               // (acento)
      subtitle: "Tu camino de fe comienza aquí.",
      highlight: "Obtén un {descuento} de descuento en tu primer pedido.",
      placeholder: "Introduce tu correo electrónico",
      buttonLabel: "Obtén un {descuento} de descuento",
      fine: "Al registrarte aceptas recibir novedades…",
      doneTitle: "¡Bienvenido a Mercy!", doneMsg: "Ya está aplicado a tu carrito", doneCtaLabel: "Seguir comprando"
    }
  },
  // IconoFranja ∈ "truck","heart","shield","star","lock","gift","tag","cross","check","chat","whatsapp","ruler","card","user","info"

  discountModal: {
    enabled: true,              // false = no hay pop-up ni CTA de descuento en carrito/checkout (welcome null; suscribirse no da cupón)
    autoOpen: true,             // abrir solo en el Inicio (1 vez por sesión)
    delayMs: 3500,              // 0–60000
    showOnCartOpen: true,       // C29: reaparece al abrir el carrito mientras no se haya reclamado
    image: url|"",              // "" = ilustración de las tres cruces
    title: "Tu camino de *fe* comienza aquí",                        // (acento)
    offerText: "Obtén un {descuento} de descuento en tu primer pedido",
    placeholder: "Introduce tu correo electrónico",
    buttonLabel: "Obtén un {descuento} de descuento",
    fine: "Al registrarte aceptas recibir novedades de Mercy Studio. Puedes darte de baja cuando quieras.",
    successTitle: "¡Bienvenido a Mercy!",
    successOffer: "Tu código de {descuento} ya está aplicado",
    successFine: "Se descuenta automáticamente en tu primer pedido.",
    successButton: "Seguir mirando",
    couponCode: "MERCY15"       // cupón de bienvenida (código de coupons.json). SOLO el admin lo cambia. NUNCA sale al público.
  },

  texts: {
    topStrip: ["Viste con propósito", "Envíos a toda Colombia", "Compra segura"],     // 1–6, franja café superior
    footerTagline: "La moda es el medio. Cristo es el mensaje",
    footerLegal: "© 2026 Mercy Studio · Hecho con propósito en Colombia",
    searchSuggestions: ["Camisetas", "Hoodies", "Oversize", "Terracota", "JECVV"],   // 0–10
    shippingInfo: "Enviamos a toda Colombia…",
    returnsInfo: "¿Te quedó grande o pequeña?…",
    care: ["Lávala en agua fría…", …],                // cuidados por defecto de todas las prendas
    sizeGuideNote: "Medidas de la prenda en centímetros, tomadas en plano. Pueden variar ±1 cm.",
    catalog: {
      eyebrow: "Catálogo",                           // también <title>, migas y etiqueta móvil (vacío → «Catálogo»)
      allTitle: "Toda la *Colección*",                // (acento)
      subtitle: "Fe, propósito y misericordia",
      bestTitle: "Los más vendidos",                 // vista, menú lateral, selector «Ordenar por» y sugerencias
      newTitle: "Novedades",
      metaDescription: "…{marca}…", loadMore: "Ver más productos", seeAll: "Ver toda la colección",
      similarTitle, similarText, similarSearchText: "…“{busqueda}”…",
      emptyFiltersTitle, emptyFiltersText, emptySearchTitle: "…“{busqueda}”", emptySearchText
    },
    // ---- Textos de INTERFAZ (etiquetas, avisos, estados vacíos). Vacío o ausente = texto de fábrica (js/defaults.js):
    //      la tienda nunca queda sin etiqueta (Mercy.ui.tx). Variables: {marca}, {descuento}, {busqueda}, {n}. **negrita** = <strong>.
    menu: { title: "Tienda", allLabel: "Toda la colección", whatsappLabel: "Escríbenos por WhatsApp" },
    help: { sizeGuide: "Guía de tallas", shipping: "Envíos", returns: "Cambios y devoluciones" },   // menú, pie, ventanas y pestañas del producto
    footerShopTitle: "Tienda", footerHelpTitle: "Ayuda", footerFollowTitle: "Síguenos",
    search: { placeholder, suggestionsTitle, topTitle, emptyText: "…“{busqueda}”…", similarTitle, maybeTitle },
    favorites: { title, subtitle, emptyTitle, emptyText, emptyCta },
    cart: { title, emptyTitle, emptyText, emptyCta, note, checkoutLabel, continueLabel },
    shipping: { badge: "Envío gratis", lineFree, cartFree: "Tu pedido tiene **ENVÍO GRATIS**", cartPaid: "**ENVÍO NO INCLUIDO** · …",
      productFree, productPaid, detailFree, detailPaid, ruleFree: "**Envío gratis** si…", rulePaid: "**Envío no incluido** cuando…",
      method: "Envío a domicilio", time: "2–4 días hábiles", coordination, checkoutFree, checkoutPaid, checkoutPaidNote, pending },
    product: { collectionLabel: "Colección", stockIn, stockOut, lowStockOne, lowStockMany: "Quedan {n} unidades",
      videoChip: "Ver video" /* solo se ve si la prenda tiene video */, detailsTitle, careTitle, sizesTitle, sizeGuideLink, detailsEmpty, careEmpty, storyTitle, reviewsTitle,
      reviewsSource: "reseñas en Google", verifiedLabel: "Compra verificada" /* vacío = sin insignia (Inicio y ficha) */, relatedTitle, metaSuffix },
    checkout: { metaDescription: "…{marca}…", strip, title: "Finalizar *compra*", subtitle, emptyTitle, emptyText, emptyCta,
      successTitle: "¡Gracias por tu *pedido*!", successText, successHome, successCta, shipTitle, note, giftTitle, giftHint, giftLabel,
      giftPlaceholder, payTitle, payLead, payHint: "…{marca}…", confirmLabel, confirmHelp, previewTitle: "¡Tu pedido *está* listo!",
      previewText, openLabel, copyLabel, afterOpenText, waIntro: ", quiero confirmar mi pedido:", waClosing, noCodeCta: "…{descuento}…" },
    subscribe: { thanks: "…{marca}.", codeHint, popupCodeHint, appliedToast: "…{descuento}…", subscribeLabel: "Suscribirme" },
    whatsappFabText: ", quiero más información"                 // botón flotante: va después del saludo (settings.whatsappGreeting)
  },

  colors:      [ { id: "negro", name: "Negro", hex: "#2a1e14" }, … ],          // paleta global
  fits:        [ { id: "regular", name: "Regular" }, … ],                       // hormas
  categories:  [ { id: "camisetas", name: "Camisetas", details: [string], sizeChart: "camisetas"|"" /* un producto puede usar otra: products[].sizeChart */, inFooter: true }, … ],
  collections: [ { id: "renacer", name: "Renacer", description: "" }, … ],
  sizeCharts:  [ { id: "camisetas", name: "Camisetas", head: ["Talla","Pecho","Largo","Manga"], unit: "cm" /* "" = sin unidad; sin la clave → "cm" */,
                   rows: { regular: [["S",51,68,20], …], oversize: […], boxy: […] } }, … ],   // claves de rows = ids de fits
  reviews:     [ { id: "r1", name: "Laura M.", city: "Bogotá", stars: 5, quote: "…", text: "…", visible: true,
                   fonts: { name: "playfair", city: "", quote: "dancing", text: "" } }, … ],
                 // fonts OPCIONAL: tipo de letra de cada parte ("" = el de la tienda); ids: texto, titulo, manuscrita, playfair, lora,
                 //   montserrat, poppins, dancing, caveat (server/lib/validate.js REVIEW_FONTS). Sin ninguno elegido la clave NO existe

  products: [ {
    id: "fe", ref: "FE-002", name: "Camiseta Fe",
    status: "published" | "draft",                 // draft = invisible en la tienda
    category: "camisetas", collection: "renacer" | "",
    fits: ["regular","oversize","boxy"],           // [] = sin horma (gorras, accesorios)
    sizes: ["S","M","L","XL","XXL"],               // 1–12; "Única" para talla única
    price: 79900,                                  // entero ≥ 0
    badge: "Nuevo",                                // "" | texto ≤ 20 (Nuevo, Oversize…)
    envioGratis: false,
    soldOut: false,                                // forzar "Agotado" aunque haya stock
    bestRank: 2, newRank: 1,                       // orden en "Más vendidos" / "Novedades" (menor = primero)
    rating: 4.9, reviewsCount: 48,
    colors: [ {                                    // 1–12 colores; orden = orden en la tienda
      color: "negro",                              // id de colors[]
      photos: [ Foto ],                            // fotos del COLOR BASE: 0–10 (MÁX 10); la primera es la principal
      fits: ["regular"],                           // OPCIONAL: hormas en que viene ESTE color (ids de fits del producto, en su
                                                   //   orden; ≥ 1). Sin la clave = todas (lo normal); solo existe si el color NO
                                                   //   viene en todas (p. ej. Rojo Burdeo solo Regular, ver «Hormas por color»)
      prints: ["naranja", "azul"],                 // estampados que lleva ESTE color (ids de prints, en su orden; [] = ninguno).
                                                   //   Solo existe si el producto tiene estampados; ausente en contenido anterior = todos
      printPhotos: {                               // OPCIONAL: fotos de cada combinación color + estampado (ver «Fotos de producto»)
        naranja: [ Foto ],                         //   clave = id de un estampado que lleva ESTE color; valor = 1–10 fotos (MÁX 10)
        azul:    [ Foto ]                          //   sin fotos de estampado la clave printPhotos NO existe
      },
      printStock: {                                // OPCIONAL: stock propio de un estampado en ESTE color (ver «Stock por estampado»)
        azul: { S: 0, M: 2, L: 0, XL: 0, XXL: 0 }  //   clave = id de un estampado que lleva ESTE color; mismas tallas que stock.
      },                                           //   Sin la clave el estampado usa stock; sin ninguno, printStock NO existe
      stock:  { S: 4, M: 5, L: 6, XL: 7, XXL: 0 }  // una clave por cada talla de sizes; entero ≥ 0 (lo comparten las hormas y los
                                                   //   estampados de este color sin stock propio)
    } ],
    prints: [ { id: "naranja", name: "Naranja", hex: "#e8620a" } ],   // estampados opcionales (0–12; las fotos y el stock propio van
                                                   //   en cada color: colors[].prints dice cuáles lleva; en la ficha se eligen
                                                   //   con el círculo de color hex)
    video: { src: url, poster: url|"" } | null,    // video de la prenda: última diapositiva de la galería + botón «Ver video».
                                                   //   null = sin video: la ficha no muestra la diapositiva, la miniatura ▶ ni el botón
    tile: { from: "#c5a68b", to: "#a44809", lines: ["FE"], sub: "", stacked: false, small: false, fs: null },  // respaldo sin foto; lines [] = el nombre ACTUAL
    tags: ["fe","creer"], desc: "", story: "…",
    sizeChart: "camisetas-xl",                     // OPCIONAL: guía de tallas propia (id de sizeCharts) para una prenda con otras tallas
                                                   //   dentro de su categoría. Sin la clave = la de categories[].sizeChart. Una guía que
                                                   //   usa un producto no se puede borrar (409 in_use, igual que con las categorías)
    details: [],                                   // [] = usa categories[].details
    care: [],                                      // [] = usa texts.care
    formerIds: ["camiseta-fe-vieja"],              // (servidor) ids anteriores; SOLO si se renombró (ver abajo)
    createdAt: ISO, updatedAt: ISO, updatedBy: "Nombre"
  } ]
}
// Foto = { src: url, thumb: url|"", alt: "", zoom: 1|null, ox: "50%"|null, oy: "50%"|null, fit?: "contain" }   (la misma en photos y en printPhotos)
//   fit "contain" = «Mostrar completa (sin recortar)»: la foto entra entera en el marco (sin acercamiento: zoom/ox/oy se guardan null).
//   Sin la clave (o "cover") = llena el marco y se recorta lo que sobra; el servidor solo guarda la clave con "contain"
//   (las fotos de siempre conservan su forma). Otro valor → 422 en "….fit".
```

Reglas de integridad (el servidor las valida; el panel las previene):
- Ids únicos dentro de cada lista. Un color/horma/categoría/colección/guía **en uso** no se puede borrar (409 `in_use` con la lista de productos).
- `product.colors[].color` ∈ `colors`, `product.category` ∈ `categories`, `product.fits ⊆ fits`, `collection` ∈ `collections` o "".
- `product.colors[].stock` tiene exactamente las tallas de `product.sizes` (faltantes = 0, sobrantes se eliminan).
- `colors[].fits ⊆ product.fits` (al menos una; sin la clave = todas); el stock sigue siendo color × talla (lo comparten las hormas).
- `photos.length ≤ 10` por color; `colors[].prints ⊆ prints[].id`; `printPhotos` y `printStock`: claves = estampados que lleva ese
  color (cada lista de fotos 1–10; cada tabla de stock con las tallas de `sizes`). Producto "agotado" en la tienda = `soldOut` o
  ninguna unidad que se pueda vender (ver «Stock por estampado»). El stock es por color × talla y lo comparten las hormas y los
  estampados de ese color sin stock propio.
- Fotos: qué fotos se ven en cada caso (color, combinación color + estampado, respaldo) lo fija la **regla de fotos** de abajo; sin
  ninguna foto se usa el `tile` (degradado).
- El primer color con stock es el color inicial en la ficha y en las tarjetas; el estampado inicial es el primero con stock que lleva
  ese color (si ninguno tiene, su primero; `""` si no lleva ninguno). Al cambiar de color, la ficha muestra solo los estampados de ese color (sin ninguno, no sale el selector).
- *(servidor)* Forma del 409 `in_use` de secciones: `{ error: { code: "in_use", message, usages: ["products/fe", "coupons/MERCY20",
  "categories/hoodies"], products: [{ id, name }] } }`. Bloquean: colores/hormas/colecciones usados por productos; categorías usadas por
  productos **o** por cupones (`appliesTo: "categories"`); guías de tallas usadas por categorías. Al borrar una horma SIN productos, sus
  filas se quitan solas de `sizeCharts[].rows` (cascada). Las claves de `rows` deben ser ids de `fits` (si no → 422).
  Renombre = el id de un elemento cambia en la MISMA posición de la lista (así edita el panel): el 409 dice «No puedes **cambiar el id**
  de …» (no «eliminar») y una horma renombrada CONSERVA sus filas con el id nuevo (no se borran).
- *(servidor)* `formerIds` de un producto: ids anteriores (máx. 10, el más reciente al final). Los gestiona SOLO el servidor (se ignoran en
  POST/PUT): al renombrar se agrega el id viejo; duplicar no los copia; la clave solo existe si hay alguno. La tienda los usa para que
  enlaces viejos (`producto.html?id=<viejo>`, p. ej. el botón del hero), carritos y favoritos sigan llevando a la prenda (un id real
  siempre gana sobre un alias).
- *(servidor)* Reseñas sin `id` reciben uno (`r-…`). Listas de textos (`topStrip`, `care`, `details`, `tags`…) descartan las líneas vacías.
  Guardar una sección o producto sin cambios responde 200 y NO crea revisión.
- *(servidor)* Claves NUEVAS del esquema (p. ej. un texto de `texts` agregado en una versión posterior, `settings.paymentMethods`) que no
  existen en un `content.json` ya creado se completan UNA vez al arrancar con el valor de fábrica (solo lo ausente; nada guardado cambia;
  log «campo(s) nuevo(s) del esquema completados»). La tienda además usa el texto de fábrica cuando un texto de interfaz está vacío.
- *(servidor)* Claves QUITADAS del esquema: `texts.product.videoSoonTitle` y `texts.product.videoSoonText` (el aviso «Video próximamente»
  ya no existe: sin video la ficha no muestra nada del video). Nadie las lee; en un `content.json` ya creado desaparecen la próxima vez
  que se guarda «Textos del sitio» (el normalizador estricto descarta las claves desconocidas). `texts.product.videoChip` se conserva.

### Hormas por color
- Cada color dice en qué hormas **viene** (`colors[].fits`): p. ej. la Camiseta Efesios tiene `fits: ["regular", "oversize"]`, Vainilla
  viene en las dos (sin la clave) y Rojo Burdeo solo en Regular (`fits: ["regular"]`).
- Ficha: con un fit elegido, los colores que no vienen en él salen **tachados y deshabilitados**, con el aviso «Rojo Burdeo no viene en
  fit Oversize.» debajo de los círculos; al elegir un fit en que no viene el color elegido, la ficha pasa al primer color que sí viene
  (con stock, si hay). Una horma en que no viene ningún color no sale en la ficha ni en los filtros (`Mercy.data.fitsOf(p, color)` da
  las hormas de un color; `p.colorFits[color]`). Catálogo: con fit y color filtrados, la prenda sale solo si alguno de esos colores
  viene en alguno de esos fits.
- Carrito: `cart.add` con un color que no viene en ese fit → `{ ok: false, reason: "horma" }`; al sanear, una línea así se quita.
- Panel: en cada color, «Hormas de este color» (solo con 2 o más hormas en el producto; al menos una marcada) y el chip «Solo Regular»
  en su encabezado. Agregar una horma al producto la marca en todos los colores; quitarla la saca de todos (un color que solo venía
  en ella pasa a venir en todas las que quedan).
- *(servidor)* `colors.N.fits`: ausente o `null` → todas las hormas del producto; si no es una lista → `colors.N.fits` «Formato inválido
  (se esperaba una lista).»; un elemento que no es texto → `colors.N.fits.M` «Debe ser un texto.»; ids que no son hormas del producto
  se **descartan sin error**; sin ninguna (con hormas en el producto) → `colors.N.fits` «Marca al menos una horma para este color.».
  Salida en el orden de `fits` y **solo si el color no viene en todas** (así los productos de siempre conservan su forma); sin hormas
  en el producto la clave no aparece. Quitar o renombrar una horma usada por un producto ya está bloqueado (409 `in_use`), así que
  `colors[].fits` nunca apunta a una horma inexistente.

### Stock por estampado
- Un estampado puede tener **su propio stock en un color** (`colors[].printStock[idEstampado] = { talla: n }`): p. ej. Negro lleva
  Naranja y Azul, y Azul solo viene en M → `printStock: { azul: { S: 0, M: 2, L: 0, XL: 0 } }`. Naranja, sin la clave, sigue usando el
  stock del color (`colors[].stock`), como siempre.
- **Unidades** de un color en una talla (regla común: `Mercy.data.stockOf` en la tienda, `colorUnits` en el panel —
  `admin/js/core/format.js`— y en el servidor —`server/lib/social.js`—): las de sus estampados con stock propio + las del color si
  algún estampado que lleva lo usa (o si no lleva estampados). Si todos los estampados de un color tienen stock propio, el del color
  no se usa. Con esa suma salen el color agotado, la prenda agotada (`soldOut`), el color inicial, el filtro «Solo en stock» del
  catálogo, `product:availability` / el feed de Meta y los totales del panel y del Escritorio (`/api/admin/stats`).
- Ficha: las tallas siguen al **estampado elegido** (con Azul solo se puede elegir M y dice «Quedan 2 unidades»); al cambiar de
  estampado se conserva la talla si sigue con stock (si no, M o la primera). Un estampado sin unidades en ese color sale **tachado**
  (se puede elegir para ver sus fotos, como un color agotado) y el botón dice «Agotado» con el aviso «Este estampado está agotado en
  este color. Prueba con otro estampado.». Al elegir un color, la ficha abre en su primer estampado con stock.
  `Mercy.data.stockOf(p, color, talla, estampado)` da las unidades con ese estampado (sin pasar el estampado, todas las del color);
  `colorHasStock(p, color, estampado?)`, `printStockOf(p, color, estampado)` y `firstPrintWithStock(p, color)`.
- Carrito: el tope de una línea con un estampado con stock propio es ese stock menos las otras líneas del **mismo estampado** (otra
  horma); las demás líneas del color se reparten el stock del color. `cart.add` con una talla sin unidades → `reason: "sin-stock"`.
  Al sanear, una línea de un estampado sin unidades en esa talla se quita y una con más de las que quedan se ajusta.
- Panel: en cada color, bajo cada estampado marcado, el interruptor «Stock propio de este estampado»: encendido, muestra su grilla de
  tallas (empieza en 0); apagado, el estampado usa el stock del color (si tenía unidades, pide confirmación). Debajo del stock del
  color, una nota dice qué estampados lo usan (o que ya no se usa). El encabezado del color cuenta las unidades con esta regla.
  Quitar un estampado del color o del producto se lleva su stock propio; renombrar uno nuevo lo mueve al código nuevo; agregar o
  quitar tallas cambia también estas grillas.
- *(servidor)* `colors.N.printStock`: ausente o `null` → ninguno; si no es un objeto → `colors.N.printStock` «Formato inválido (se
  esperaba un objeto).»; una clave que no es un estampado que lleva ese color se **descarta sin error** (como `printPhotos`) y un valor
  `null` = sin stock propio; si una tabla no es un objeto → `colors.N.printStock.<id>` «Formato inválido (se esperaba un objeto).»;
  cada tabla tiene exactamente las tallas de `sizes` (faltantes = 0, sobrantes fuera; enteros 0–100 000, ruta
  `colors.N.printStock.<id>.<talla>`). Claves en el orden de `prints`; sin ninguna, la clave **no aparece** (forma
  `{ color, photos, fits?, prints, printPhotos?, printStock?, stock }`).

### Fotos de producto: color base, estampados de cada color y combinaciones color + estampado
- Cada color tiene sus fotos **base** (`colors[].photos`, 0–10), dice **qué estampados lleva** (`colors[].prints`, ids de `prints[]`) y,
  opcionalmente, tiene fotos por **combinación con cada uno de esos estampados** (`colors[].printPhotos[idEstampado]`, 1–10 cada una):
  p. ej. Negro lleva Naranja y Azul con sus fotos, y Crema no lleva ninguno. Las fotos (y el stock propio, «Stock por estampado») de
  un estampado van en cada color, no en `prints[]`.
- `colors[].prints` **ausente** (contenido guardado antes de los estampados por color) = el color lleva **todos** los estampados; así
  nada cambia hasta que se edita. El servidor guarda siempre la lista explícita cuando el producto tiene estampados.
- **Regla de fotos** `photosFor(p, colorId, printId)`, idéntica en la tienda (`Mercy.data.photosFor`), en las vistas previas del panel
  y en el servidor (`server/lib/social.js`). `printId` ausente (`undefined`) = el primer estampado que lleva ese color (`""` si ninguno);
  `""` = sin estampado. Se devuelve la primera lista con fotos de:
  1. `printPhotos[printId]` del color pedido (solo si ese color lleva el estampado);
  2. las fotos base del color pedido;
  3. ninguna → `[]` (degradados de marca, `tile`).

  Las listas **no se mezclan** y **nunca se toman de otro color**: si la combinación elegida tiene fotos se ven solo esas; si no, solo
  las del color; un color sin fotos muestra el degradado aunque otro color sí tenga.
- **Foto principal** (tarjetas del catálogo, del Inicio, de la búsqueda y de favoritos —`p.photos` en la tienda—, `og:image` del
  producto, `image_link` del feed de Meta y miniaturas del panel): la primera foto del **color inicial**, buscando en este orden: su
  primer estampado, sus fotos base y sus demás estampados (en el orden de `prints`); si ese color no tiene ninguna, la del primer color
  (en el orden del producto) que tenga alguna, con el mismo orden. Color inicial = primer color con stock (si ninguno tiene, el primero).
  Es una foto del producto, no de una variante: por eso aquí sí puede salir de otro color.
- La tienda también recorta a 10 al normalizar, descarta las claves de `printPhotos` de estampados que ese color no lleva y no muestra
  (ni en la ficha ni en el buscador) un estampado que no lleva ningún color. `Mercy.data.printsOf(p, color)` da los estampados de un color.
- *(servidor)* `server/lib/validate.js`: `MAX_PHOTOS_PER_COLOR = 10` y `MAX_PHOTOS_PER_PRINT = 10`. Más de 10 fotos base → 422 en
  `colors.N.photos` «Máximo 10 fotos por color.». Los estampados se validan **antes** que los colores para filtrar `colors.N.prints`
  y `printPhotos`. `colors.N.prints`: ausente o `null` → todos los estampados del producto; si no es una lista → `colors.N.prints`
  «Formato inválido (se esperaba una lista).»; un elemento que no es texto → `colors.N.prints.M` «Debe ser un texto.»; ids que no son
  estampados del producto se **descartan sin error**; sin repetidos y en el orden de `prints`; con estampados en el producto la clave
  siempre sale (también `[]`), sin estampados **no aparece**. `printPhotos`: ausente o `null` → se omite; si no es un objeto →
  `colors.N.printPhotos` «Formato inválido (se esperaba un objeto).»; una clave que no es un estampado que lleva ese color (se borró, se
  renombró o se quitó del color) se **descarta sin error**; cada lista admite hasta 10 («Máximo 10 fotos
  por estampado.») y cada foto se valida como las demás (ruta `colors.N.printPhotos.<id>.M`); las listas vacías se descartan y las
  claves quedan en el orden de `prints`. Si no queda ninguna lista, la clave `printPhotos` **no aparece** en la salida: un producto sin
  estampados conserva exactamente la forma `{ color, photos, stock }` (sin ruido en las revisiones ni en js/defaults.js) y uno con
  estampados, `{ color, photos, prints, printPhotos?, stock }`.
- *(servidor)* Las fotos de `printPhotos` cuentan como uso de un medio (borrarlo → 409 `in_use` con `products/<id>`) y entran en
  `missingMedia` al restaurar, como las demás (el servidor recorre todo el contenido).

### Cupones (`coupons.json`, `Mercy.DEFAULT_COUPONS`)
```js
{ id, code: "MERCY15",                    // único, MAYÚSCULAS, ^[A-Z0-9_-]{3,30}$
  description: "15 % primer pedido (pop-up)",
  type: "percent" | "fixed",              // percent 1–100 · fixed = pesos COP ≥ 1
  value: 15,
  active: true,
  startsAt: "2026-10-01" | null, endsAt: "2026-12-31" | null,    // fechas inclusivas, hora de Colombia (UTC-5)
  minSubtotal: 0,                         // compra mínima (COP) sobre los productos elegibles
  maxUses: null | 100, usesCount: 0,      // usos = pedidos ENVIADOS con el código (al abrir WhatsApp); orientativo, ver abajo
  appliesTo: "all" | "categories" | "products", categoryIds: [], productIds: [],
  createdAt, updatedAt, createdBy }
```
Cupón **público** (lo que recibe la tienda): `{ code, type, value, label, appliesTo, categoryIds, productIds, minSubtotal }`
donde `label` = `"15%"` o `"$20.000"`. *(servidor)* `description` es una nota **interna** del equipo: solo la ve el panel (§4.3), nunca
sale en `subscribe`/`validate`/`redeem` (la recibiría cualquiera que pruebe un código); tampoco salen vigencia, usos ni autor.
Cálculo del descuento (tienda): subtotal elegible = líneas cuyo producto cumple `appliesTo`; si subtotal elegible < `minSubtotal`
→ 0 (mensaje "Compra mínima de $X para usar este código. Te faltan $Y.", ver §6); `percent` → `round(elegible × value / 100)`; `fixed` → `min(value, elegible)`.
*(servidor)* `usesCount` lo maneja SOLO el servidor (se ignora en POST/PUT para no pisar canjes concurrentes); para ponerlo en 0 enviar
`resetUses: true` en el PUT. `maxUses` vacío/`null` = ilimitado (0 no es válido). Con `appliesTo: "all"` las listas se vacían; con
`categories`/`products` se exige al menos un id existente si el cupón está **activo** (uno inactivo puede quedar con la lista vacía y se
puede seguir guardando; para activarlo hay que elegir alguno). Renombrar el código del cupón de bienvenida actualiza también
`discountModal.couponCode` (con revisión). Renombrar/borrar un producto actualiza/quita su id en `productIds`; un cupón «Productos» que
se queda **sin productos se desactiva** solo (actividad «Cupón «X» desactivado: se quedó sin productos (ya no existe «…»)») y
`DELETE /api/admin/products/:id` responde además `couponsDeactivated: ["X"]`. Concurrencia: `PUT /api/admin/coupons/:id` acepta
`X-Base-Updated-At` (= `item.updatedAt` leído) → 409 `conflict` con `current` si otra persona lo cambió; los canjes no cambian `updatedAt`.
*(servidor)* **`usesCount` es orientativo**: no hay pedidos en el servidor (el pedido se cierra por WhatsApp), así que `redeem` es anónimo y
cualquiera que conozca un código puede sumarle usos. Se frena con el cupo por IP y código (§4) y la tienda solo canjea al enviar el pedido
con descuento > 0. Un límite de usos en el cupón de **bienvenida** se puede agotar a propósito (y entonces el pop-up se apaga para todos):
úsalo con cuidado.

### Suscriptores (`subscribers.json`)
`{ id, email (minúsculas), source: "popup"|"community"|"checkout", couponCode, count (veces que se registró), createdAt, updatedAt }`.
Deduplicado por email.
*(servidor)* `couponCode` = cupón de bienvenida que recibió; `""` si no recibió ninguno (modal apagado o sin cupón vigente). Quien se
vuelve a suscribir sin recibir cupón conserva el que tenía.

### Usuarios (`users.json`)
`{ id, name, email, role: "admin"|"editor", active, passwordHash, createdAt, updatedAt, lastLoginAt }`.
`passwordHash` = `scrypt$16384$8$1$<salt b64>$<hash b64>` (64 bytes). **Nunca** se devuelve por la API.
Contraseñas: mínimo 10 caracteres. No se puede borrar/desactivar/degradar al **último administrador activo** ni borrarse a sí mismo.

### Medios (`media.json`)
`{ id, kind: "image"|"video", mime, url: "/uploads/2026/10/<id>-<slug>.webp", thumbUrl: url|"", width, height, bytes, name, alt, createdAt, createdBy }`.

### Actividad (`activity.json`, máx. 5000, la más reciente primero)
`{ id, at, user: { id, name }, action: "create"|"update"|"delete"|"restore"|"login"|"logout"|"upload"|"password", entity: "product"|"coupon"|"user"|"media"|"section"|"revision"|"subscriber"|"session", entityId, label: "Producto «Camiseta Fe» actualizado" }`.
*(servidor)* Acciones del **sistema**: `user: { id: null, name: "Sistema" }`. Hoy las registra el arranque: crear el primer administrador
(`create`/`user`, "Administrador «…» creado al arrancar (ADMIN_EMAIL)") y `ADMIN_RESET=1` (`password`/`user`, "Acceso de «…» restablecido
al arrancar (ADMIN_RESET)"). Se filtran con `userId=system` (§4.3). Guardar sin cambios (sección, producto o nombre/alt de un medio) no
registra actividad.

### Revisiones (`revisions/<id>.json`, máx. 200)
Cada cambio de **contenido** (secciones y productos) guarda una instantánea completa del contenido **después** del cambio:
`{ id, at, user: { id, name }, summary: "Producto «Camiseta Fe» actualizado", content: {…} }`.
La primera revisión es "Contenido inicial". Restaurar = el contenido vuelve a esa instantánea y se crea una revisión nueva
"Restaurado desde la revisión del <fecha> («<resumen de la versión restaurada>»)". Cupones, usuarios, suscriptores y medios NO forman
parte de las revisiones.
*(servidor)* Por eso al restaurar: `discountModal.couponCode` se queda SIEMPRE el vigente (una instantánea vieja podría traer un código que
ya no existe o que ahora es de otro cupón); si la versión quitaría una categoría que usa un cupón → 409 `in_use` («No se puede restaurar
esta versión: quitaría la categoría «…», que está en uso (1 cupón: X)…», `usages: ["coupons/X"]`); los productos que desaparecen se
quitan de los cupones (un cupón «Productos» vacío se desactiva) o se cambian por su id en la versión si fue un renombre (por `formerIds`;
el producto que vuelve a su id viejo guarda el actual en `formerIds`). La respuesta trae `coupons: [{ id, code, deactivated }]` (cupones
que cambiaron) y `missingMedia: ["/uploads/…"]` (archivos que la versión usa y ya no existen: se borraron de la biblioteca; el panel debe
avisarlo).
*(servidor)* "Contenido inicial" = el contenido de fábrica (js/defaults.js) con que se creó `content.json`; queda **fijada**: nunca se
descarta al pasar de 200 (se descarta la más antigua no fijada), así que siempre se puede volver al contenido de fábrica. js/defaults.js solo
se lee si falta `content.json` (o `coupons.json`): cambiarlo no re-siembra un sitio en marcha. Si se borra `content.json` (servidor detenido),
al arrancar se recrea con el js/defaults.js ACTUAL y se agrega otra revisión fijada "Contenido de fábrica (content.json se creó de nuevo)"
(si su cupón de bienvenida no existe en `coupons.json`, `couponCode` queda `""`). Con contenido pero sin historial (se borró `revisions/`),
la primera revisión es "Contenido existente al arrancar (sin historial previo)". `GET /api/admin/revisions` no expone el indicador de fijada.

---

## 4. API HTTP

**Páginas de la tienda con etiquetas para redes** *(servidor)*: `/`, `/index.html`, `/catalogo.html`, `/producto.html?id=` y `/checkout.html`
se sirven con el `<head>` completado (título, `meta description`, canónica, Open Graph y Twitter) calculado del contenido: Inicio = `settings.seo`
+ póster del hero; catálogo = `texts.catalog.eyebrow/metaDescription` + primera foto publicada; producto = nombre, precio (`product:price:*`),
disponibilidad, descripción (como `js/producto.js`) y la **foto principal** (§3 «Fotos de producto», la misma de la tarjeta); id anterior →
canónica con el id actual; borrador o inexistente → «Prenda no encontrada» + `noindex`; pago = `texts.checkout.*` + `noindex`. Las URL absolutas usan `PUBLIC_URL` o el
host/protocolo de la petición (`X-Forwarded-*` con `TRUST_PROXY`). Facebook, Instagram y WhatsApp leen estas etiquetas (no ejecutan JS).

Todo JSON (`Content-Type: application/json; charset=utf-8`) salvo subidas y CSV.
Errores: `{ "error": { "code": Código, "message": "texto en español para mostrar", "fields": { "ruta.del.campo": "mensaje" }? } }`
Código ∈ `bad_request 400 · validation 422 · unauthorized 401 · forbidden 403 · not_found 404 · conflict 409 · in_use 409 · payload_too_large 413 · unsupported_media 415 · rate_limited 429 · server 500`.

**Seguridad común**
- Sesión: cookie `mercy_sid` (token aleatorio 32 bytes; en `sessions.json` solo su SHA-256), `HttpOnly; SameSite=Strict; Path=/`,
  `Secure` si la petición llega por HTTPS (directo o `X-Forwarded-Proto` con `TRUST_PROXY`). Duración 12 h deslizante; "Recordarme" = 30 días.
- Cookie indicadora `mercy_admin=1` (NO HttpOnly, sin secreto, misma duración): la tienda la usa para mostrar la barra de edición sin hacer peticiones.
- CSRF: toda petición no-GET a `/api/auth/*` y `/api/admin/*` debe traer `X-Mercy-Admin: 1`; si trae `Origin`, debe coincidir con el host. Si no → 403.
- Límite de intentos de login: 5 fallos / 15 min por IP+email y 30 / 15 min por IP → 429 con `Retry-After`.
- Límites públicos: suscribirse 20/h por IP; validar cupón 60/10 min por IP; redimir 20/10 min por IP (cupos separados; holgados porque
  muchos clientes pueden salir por la misma IP, p. ej. datos móviles con CGNAT). *(servidor)* Además redimir el MISMO código: 5/h por IP
  (frena que alguien agote un cupón con límite; un 429 en redimir no frena a la clienta, la tienda sigue a WhatsApp).
- Cuerpos JSON ≤ 2 MB (contenido completo cabe holgado). Imágenes ≤ 12 MB, miniatura ≤ 2 MB, video ≤ 150 MB.
- Roles en el servidor (el panel solo oculta): ver §5.
- *(servidor)* Detalles reales: las cookies llevan `Max-Age` (43200 s o 2592000 s con "Recordarme") y se renuevan como mucho 1 vez/min
  al usarse; `mercy_admin` va con `SameSite=Lax`. Un 401 por sesión vencida/inválida también borra ambas cookies. Usuario desactivado con
  contraseña correcta → 403 "Tu usuario está desactivado…". Campos extra dentro de `error`: `fields` (422 y 409 por id/código/correo
  repetido), `current` (409 `conflict` de concurrencia: valor vigente), `usages`/`products` (409 `in_use`), `retryAfter` (429, segundos).
  Método no soportado en una ruta existente → 405 (`code: "bad_request"`). Respuestas de `/api/auth|admin` con `Cache-Control: no-store`;
  `/admin/**` y `/api/**` con `X-Robots-Tag: noindex, nofollow`.

### 4.1 Públicas (sin sesión)
| Método y ruta | Entrada | Salida |
|---|---|---|
| `GET /api/public/content.js` | — | JavaScript: `window.MercyContent = {…};` (ver contenido público abajo). `Cache-Control: no-cache` + `ETag`. |
| `GET /api/public/feed-meta.csv` | — | Feed de catálogo para Meta (Commerce Manager): CSV con `id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,product_type`; solo productos publicados; `image_link` = foto principal (§3; sin fotos, el logo); `additional_image_link` = las demás fotos sin repetir (por color: las base y luego las de cada estampado en el orden de `prints`), máximo 10; precio `79900.00 COP`; `no-cache` |
| `GET /api/public/content` | — | El mismo objeto en JSON. |
| `POST /api/public/subscribe` | `{ email, source }` | `{ ok: true, coupon: CupónPúblico \| null }` (el de bienvenida si está vigente y `discountModal.enabled`; si no → `null` y el suscriptor queda con `couponCode: ""`). Email inválido → 422. |
| `POST /api/public/coupons/validate` | `{ code }` | `{ ok: true, coupon }` o `{ ok: false, reason, message }`; reason ∈ `not_found, inactive, not_started, expired, exhausted`. Siempre HTTP 200. |
| `POST /api/public/coupons/redeem` | `{ code }` | Igual que validate; si es válido suma 1 a `usesCount`. Lo llama el checkout al **enviar** el pedido (al tocar «Abrir WhatsApp»), no al confirmar ni al ver la vista previa. |
| `GET /api/health` | — | `{ ok: true, version }` |

**Contenido público** = contenido completo con estos cambios: solo productos `published`; sin `meta.sections` (deja `meta.updatedAt`);
`discountModal` sin `couponCode` y con `welcome: { label, type, value } | null` (null si `discountModal.enabled` es false o si el cupón de
bienvenida no existe, está inactivo, vencido o agotado → la tienda oculta pop-up y CTAs de descuento); y `__source: "server"`.
*(servidor)* Además `meta` queda solo `{ updatedAt }` (sin `updatedBy`) y los productos públicos no llevan `updatedBy` (nombres del
equipo). Los POST públicos exigen `Content-Type: application/json` (si no → 415). `code` se compara sin importar mayúsculas.

### 4.2 Sesión
| | | |
|---|---|---|
| `POST /api/auth/login` | `{ email, password, remember? }` | `{ user }` + cookies. Error genérico "Correo o contraseña incorrectos." |
| `POST /api/auth/logout` | — | `{ ok: true }` y borra cookies |
| `GET /api/auth/me` | — | `{ user }` o 401 |
| `PUT /api/auth/me` | `{ name, email }` | `{ user }` |
| `POST /api/auth/password` | `{ currentPassword, newPassword }` | `{ ok: true }` (cierra las demás sesiones del usuario) |

`user` = `{ id, name, email, role, active, createdAt, updatedAt, lastLoginAt }`.

### 4.3 Panel (sesión obligatoria)
Contenido (editor y admin, salvo `settings`):
| | | |
|---|---|---|
| `GET /api/admin/content` | — | contenido completo (incluye borradores y `meta.sections`) |
| `PUT /api/admin/content/:section` | valor completo de la sección | `{ section, value, meta }`. `section` ∈ `settings*, home, discountModal, texts, colors, fits, categories, collections, sizeCharts, reviews` (*solo admin). Si el editor cambia `discountModal.couponCode`, se conserva el anterior. Concurrencia: header opcional `X-Base-Updated-At` = `meta.sections[section].updatedAt` leído; si difiere → 409 `conflict`. |
| `GET /api/admin/products` | — | `{ items: [producto] }` |
| `GET /api/admin/products/:id` | — | `{ item }` |
| `POST /api/admin/products` | producto (sin fechas) | `{ item }` 201. id duplicado → 409. |
| `PUT /api/admin/products/:id` | producto completo | `{ item }`. Si `body.id` ≠ `:id` se renombra (valida unicidad). `X-Base-Updated-At` = `item.updatedAt` opcional → 409. |
| `DELETE /api/admin/products/:id` | — | `{ ok: true }` |
| `POST /api/admin/products/:id/duplicate` | — | `{ item }` copia en `draft` con id `<id>-copia[-n]` y nombre "… (copia)" |
| `GET /api/admin/stats` | — | `{ products: { total, published, draft, soldOut, lowStock }, coupons: { total, active }, subscribers: { total, last7d }, media: { total, bytes }, recentActivity: [≤10] }` (los conteos de cupones/suscriptores solo para admin; al editor le llegan `null`) |

Medios (editor y admin):
| | | |
|---|---|---|
| `GET /api/admin/media?kind=image\|video&q=` | — | `{ items }` (más recientes primero) |
| `POST /api/admin/media` | **cuerpo binario crudo**; headers `Content-Type` (mime), `X-File-Name` (encodeURIComponent), `X-Media-Width`, `X-Media-Height` opcionales | `{ item }` 201. El servidor valida la firma de bytes: JPEG, PNG, GIF, WebP, AVIF, MP4/MOV (`ftyp`), WebM. **SVG prohibido.** |
| `PUT /api/admin/media/:id/thumb` | binario de imagen (miniatura ≤ 600 px que genera el panel) | `{ item }` |
| `PUT /api/admin/media/:id` | `{ name, alt }` | `{ item }`. Sin cambios (mismo nombre y alt tras recortar espacios; un campo ausente se conserva) → 200 con el item, sin escribir ni registrar actividad. |
| `DELETE /api/admin/media/:id[?force=1]` | — | Si su URL aparece en el contenido → 409 `in_use` con `{ error: { …, usages: ["products/fe", "home.hero"] } }`; con `force=1` se borra igual. |

Solo administrador:
| | | |
|---|---|---|
| `GET /api/admin/coupons` · `POST` · `GET/PUT/DELETE /api/admin/coupons/:id` | cupón | `{ items }` / `{ item }`. Código duplicado → 409. Borrar el cupón de bienvenida en uso → 409 `in_use`. PUT: `X-Base-Updated-At` opcional → 409 `conflict` + `current`. |
| `GET /api/admin/subscribers?q=` | — | `{ items, total }` |
| `GET /api/admin/subscribers.csv` | — | CSV UTF-8 con BOM (`email,origen,cupón,veces,creado,actualizado`) |
| `DELETE /api/admin/subscribers/:id` | — | `{ ok: true }` |
| `GET /api/admin/users` · `POST` · `PUT/DELETE /api/admin/users/:id` | `{ name, email, role, active, password? }` | `{ items }` / `{ item }`. PUT: `X-Base-Updated-At` opcional (= `updatedAt` leído) → 409 `conflict` + `current`. |
| `GET /api/admin/activity?limit=100&before=<id>&entity=&userId=` | — | `{ items, next }`. `userId=<id>` = acciones de esa persona; `userId=system` = acciones del sistema (`user.id` null, §3 Actividad). Se combina con `entity` y `before`. |
| `GET /api/admin/revisions` | — | `{ items: [{ id, at, user, summary, bytes }] }` |
| `GET /api/admin/revisions/:id` | — | `{ revision: {id, at, user, summary}, changes: [{ path, before, after }] (≤150, frente a la revisión anterior) }` |
| `POST /api/admin/revisions/:id/restore` | — | `{ ok: true, content, coupons, missingMedia }` (ver §3 Revisiones) |

*(servidor)* Extras y precisiones de §4.3:
- `GET /api/admin/media/:id` → `{ item, usages }` (para avisar antes de borrar). `GET /api/admin/users/:id` → `{ item }`.
- `GET /api/admin/usages` (editor y admin) → `{ coupons: { categories: { [id]: n }, products: { [id]: n } } }`: cuántos cupones usan cada
  categoría / producto (sin códigos), para que el panel bloquee esos ids también al editor (que no ve Cupones).
- `DELETE /api/admin/products/:id` → `{ ok: true }` y, si algún cupón «Productos» se quedó sin productos (y se desactivó),
  `couponsDeactivated: ["X"]`.
- `GET /api/admin/subscribers?q=` → `total` = total de suscriptores (sin filtro); `items` = filtrados (correo o cupón contienen `q`).
  El CSV acepta el mismo `?q=` y se descarga como `suscriptores-mercy-AAAA-MM-DD.csv`.
- `GET /api/admin/revisions/:id` → además `previous: { id, at, summary } | null` y `truncated: bool`. Rutas de `changes`:
  `home.hero.title`, `home.marquee[0].text`, `products[fe].price`, `products[fe].colors[negro].stock.S`, `colors (orden)`.
  Se ignoran `meta` y `createdAt/updatedAt/updatedBy`.
- `PUT /api/admin/products/:id` sin `id` en el cuerpo conserva el id. 409 por id repetido trae `fields.id`.
- `POST /api/admin/media`: 415 si la firma no es de un formato permitido; 413 si supera el límite; 400 si llega vacío. El nombre guardado
  es el de `X-File-Name` (decodificado). Si vienen `X-Media-Width/Height` se usan (corrigen la orientación EXIF); si no, el servidor lee las
  medidas de la cabecera (PNG/JPEG/GIF/WebP/AVIF). Al reemplazar una miniatura con el mismo nombre, `thumbUrl` lleva `?v=…`.
- `GET /api/admin/stats`: `soldOut` = `soldOut` o stock total 0; `lowStock` = stock total entre 1 y 10 (unidades con el stock propio de
  los estampados, §3 «Stock por estampado»); `coupons.active` = vigentes hoy.
  Al editor, `recentActivity` le llega sin entradas de cupones, usuarios, suscriptores ni sesiones.

### 4.4 Archivos estáticos
El servidor reemplaza a nginx (mismo puerto 4000) y sirve **solo** una lista blanca: `/`, `/index.html`, `/catalogo.html`,
`/producto.html`, `/checkout.html`, `/css/**`, `/js/**`, `/assets/**`, `/admin/**` (`/admin` → 301 `/admin/`, `/admin/` → `admin/index.html`),
`/uploads/**` (desde `DATA_DIR/uploads`), `/version.txt`. Todo lo demás → 404 (nunca `server/`, `data/`, `docs/`, `.git`).
Sin path traversal. `Cache-Control: no-cache` + `ETag` para html/css/js/json/imagenes del sitio; fuentes 7 días; `/uploads/**`
`public, max-age=31536000, immutable`. **Soporta `Range`** (videos en Safari/iOS). gzip para texto.
Cabeceras: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; *(servidor)* en la tienda (todo lo que no es
`/admin/**`) además `X-Frame-Options: SAMEORIGIN` y CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https: http:; media-src 'self' blob: https: http:; connect-src 'self';
object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'` (→ la tienda tampoco puede usar `<script>` en línea ni `onclick`); en `/admin/**` además
`X-Frame-Options: DENY` y CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
(→ el panel NO puede usar `<script>` en línea ni atributos `onclick`).
*(servidor)* Precisiones: solo se sirven extensiones conocidas (html, css, js/mjs, json, txt, svg, png, jpg, gif, webp, avif, ico,
woff2/woff/ttf/otf, mp4/m4v/webm/mov); en `/uploads/**` solo imágenes y videos (nunca svg/html). Sin listados de carpetas, sin archivos
ocultos (`.algo`) y un enlace simbólico no puede salir de su carpeta permitida. Métodos distintos de GET/HEAD → 405. 404 = página HTML
"Página no encontrada". La CSP y `X-Frame-Options` se envían en toda respuesta de `/admin/**` (también 404 y 301).
*(servidor)* `/js/defaults.js` se sirve **sin cupones**: `Mercy.DEFAULT_COUPONS = [];` y `discountModal.couponCode: ""`; el resto idéntico
(se recorta por tokens y se comprueba en `node:vm`; si no se puede, se regenera desde los valores evaluados, nunca sale el original). Caché del
resultado por mtime, `ETag` por contenido (sin `Last-Modified`), gzip y `Range` sobre la versión servida. Se reconoce por identidad del archivo,
así que otra capitalización o un enlace tampoco entregan el original. Sin servidor (`file://`) la tienda lee el archivo completo.

---

## 5. Roles

| Módulo del panel | Administrador | Editor |
|---|:-:|:-:|
| Escritorio, Mi perfil | ✓ | ✓ |
| Inicio · Textos · Modal de descuento (textos/imagen) · Productos · Categorías · Colores · Colecciones · Hormas · Guía de tallas · Reseñas · Medios | ✓ | ✓ |
| Cupón de bienvenida del modal (`discountModal.couponCode`) | ✓ | — |
| Cupones · Suscriptores · Usuarios · Ajustes generales · Actividad · Revisiones (ver/restaurar) | ✓ | — |

---

## 6. Tienda (cómo consume el contenido)

Orden de scripts en las 4 páginas (todos `defer`):
`api/public/content.js` → `js/defaults.js` → `js/config.js` → `js/data.js` → `js/icons.js` → `js/ui.js` → `js/store.js` → `js/layout.js` → `js/<página>.js`.
- Si `window.MercyContent` existe (servidor) se usa; si no (archivo abierto con doble clic o hosting estático), se usa `Mercy.DEFAULT_CONTENT`
  y los cupones locales `Mercy.DEFAULT_COUPONS` (modo demostración, sin red).
- `Mercy.content` = contenido resuelto; `Mercy.api.enabled` = `MercyContent.__source === "server"`.
- `config.js` sigue exponiendo `Mercy.config` (mismas claves que usa el código) derivado de `settings`/`home`/`discountModal`.
- `data.js` sigue exponiendo `Mercy.data` con la forma que ya usa la tienda (PRODUCTS con `colors: [ids]`, `stock[color][talla]`,
  `photos` = fotos principales, `colorPhotos[color]`, `colorPrints[color]`, `printPhotos[color][estampado]`, `initialPrint`, `reviews`
  = número, `collection` = nombre…) más `photosFor(p, colorId, printId)` (regla de fotos, §3), `printsOf(p, color)`, `fitsOf(p, color)`
  (hormas del color, §3 «Hormas por color»; con `colorFits[color]`), `stockOf(p, color, talla, estampado?)` (con
  `printStock[color][estampado]`, §3 «Stock por estampado») y `COLLECTIONS`.
- Galería de producto: muestra `photosFor(p, color, estampado)` (§3): las fotos (1–10) de la **combinación color + estampado elegida**
  si tiene; si no, las del **color** (no se mezclan). Se rehace al cambiar de color o de estampado solo si cambia el juego de fotos, y
  vuelve a la foto 1. La diapositiva de video (última), su miniatura ▶, su punto y el botón «Ver video» existen **solo si la prenda
  tiene video** (`video.src`); sin video no hay ningún aviso. Con una sola diapositiva se ocultan flechas, puntos y miniaturas. Tocar una
  foto (o el botón «Ver foto completa», o Enter en el carrusel) abre el **visor**: la foto entera a pantalla completa, con flechas/deslizar
  para pasar de foto y clic, doble toque, rueda o pellizco para acercar. Las fotos con `fit: "contain"` se ven enteras también en el marco. `producto.html?id=…&color=<id>&print=<id>&fit=<id>`
  abre la ficha en esa variante (si el color no es del producto o ese color no lleva el estampado o no viene en esa horma, se ignoran). Tarjetas, búsqueda y favoritos usan la
  foto principal (§3); carrito y checkout, la foto de la variante de la línea (color + estampado), y su enlace abre la ficha en esa
  variante. Fotos de Pexels → `srcset` con `?w=`; fotos subidas → `srcset` con `thumb` (600 w) y `src`.
- *(tienda, `js/store.js`)* Tope de cantidad del carrito = stock de (color, talla) **menos** lo que ya piden las OTRAS líneas del mismo
  producto + color + talla con cualquier horma u otro estampado sin stock propio (lo comparten); con un estampado con stock propio,
  su stock menos las otras líneas de ese mismo estampado (§3 «Stock por estampado»). Se aplica al agregar, al cambiar
  la cantidad y al sanear el carrito al cargar (las líneas anteriores tienen prioridad; mismos avisos de siempre). Al sanear, una línea
  con un estampado que su color ya no lleva se quita; si el color ya no lleva ninguno, queda sin estampado; sin estampado guardado
  y con un color que ahora sí lleva, toma el primero (como las hormas). Una línea con una horma en que su color ya no viene se quita.
- Cupones/suscripción: con `Mercy.api.enabled` se usan los endpoints públicos (§4.1); si no, se validan contra `DEFAULT_COUPONS`.
  *(tienda, `js/store.js`)* Estado guardado: `discount = { email, claimedAt, coupon: CupónPúblico|null, claimedCoupon, checkedAt }`
  (`claimedCoupon` = cupón recibido al suscribirse, para volver a mostrar/copiar el código). El estado viejo del mockup (`coupon: true|false`
  sin `claimedCoupon`): sin servidor se migra al `couponCode` de `Mercy.DEFAULT_CONTENT` (si está vigente en `DEFAULT_COUPONS`); con servidor
  se descarta (vuelve a poder suscribirse y recibe el cupón real; carrito y favoritos se conservan). `js/store.js` no trae ningún código fijo.
  La tienda no usa `description` del cupón. Números con coma decimal (medidas `52,5`, calificación `4,9`).
  Un cupón a la vez. Los mensajes al cliente salen del `reason` (la tienda no muestra el `message` del servidor para los motivos conocidos):
  not_found "Ese código no existe." · inactive "Este código no está activo." · not_started "Este código aún no está vigente." ·
  expired "Este código ya venció." · exhausted "Este código ya alcanzó su límite de usos." · sin red/5xx "No pudimos validar el código…" ·
  429 "Hiciste muchos intentos seguidos…". Mínimo no alcanzado: "Compra mínima de $X para usar este código. Te faltan $Y." (con `appliesTo` ≠ `all`:
  "…de $X en productos participantes…"); sin líneas elegibles: "Este código no aplica a los productos de tu carrito." (el código queda
  agregado con descuento $0). Revalidación al cargar: en el checkout siempre; en las demás páginas como mucho 1 vez por minuto
  (límite público de 60/10 min por IP); si ya no vale se quita con un aviso, sin red se conserva. Al confirmar: con descuento > 0 se
  vuelve a **validar** (`validate`, no suma usos); `ok:false` quita el cupón y NO continúa; sin red continúa. El uso se cuenta al
  **abrir WhatsApp** (`redeem` en segundo plano con `keepalive`, una vez por pedido, solo con descuento > 0): cerrar la vista previa,
  confirmar otra vez o confirmar en otra pestaña no gasta usos. Al abrir WhatsApp con el pedido se vacía el carrito y se quita el cupón
  usado. Con `discountModal.enabled: false` la suscripción funciona pero la tienda ignora el cupón que devuelva `subscribe`.
  *(tienda)* Compra mínima no alcanzada: la caja dice «X agregado · aún sin descuento», el aviso agrega lo que falta («… para usar este
  código. Te faltan $Y.») y el resumen «Descuento (X)» $0 (sin prometer el valor). Ya suscrita (estado `claimedCoupon`) con su código SIN
  aplicar (lo quitó o lo cambió): en vez de «¿Aún no tienes código?» se ofrece «Usar mi código X» (lo aplica validándolo); no se ofrece si
  ya lo usó en un pedido enviado o si al intentarlo ya no vale (`claimedUsed`). El pop-up y la Comunidad solo dicen «ya está aplicado»
  (`successOffer`/`successFine`, `doneMsg`) si ese código es el aplicado; si no, muestran el código («Este es tu código de bienvenida»).
  Enlaces de WhatsApp: `https://api.whatsapp.com/send?phone=<n>&text=<mensaje>` (no `wa.me`: su redirección cambia los emojis como 👋
  por «�» en WhatsApp Web/escritorio).
  *(tienda)* Productos que la tienda no encuentra (en borrador un rato, borrados o renombrados sin alias): sus líneas del carrito y sus
  favoritos NO se borran: quedan guardados aparte (`parked`, hasta 30 días, máx. 50) sin verse ni contar, y vuelven solos si el producto
  reaparece. Un id anterior (`formerIds`) se cambia por el actual en carrito, favoritos y `producto.html?id=` (la dirección pasa al id
  actual). Si un producto sin hormas gana hormas, la línea guardada sin horma toma la primera (como al agregar).
- Acceso al panel: botón con ícono de usuario en el header (si `settings.showAdminLink`) → `admin/login.html` (o `admin/` si existe la cookie `mercy_admin`)
  + enlace "Panel administrador" en el menú lateral. Con la cookie `mercy_admin`, barra flotante "Editar esta página" (abajo a la izquierda)
  que lleva a la ruta del panel correspondiente (`#/inicio`, `#/productos`, `#/productos/<id>`, `#/descuento`…).
  *(tienda)* El botón va a la derecha (antes de favoritos) desde 900 px y junto al menú en celular (así el logo sigue centrado);
  no se muestra en el header mínimo del checkout. La barra de edición exige además `Mercy.api.enabled` (sin servidor no hay panel),
  incluye "Panel" (→ `admin/`), sube con la franja del hero y con la barra de compra fija del producto, y no sale al imprimir.

## 7. Panel (rutas hash de `admin/index.html`)

`#/` Escritorio · `#/inicio` · `#/textos` · `#/descuento` · `#/productos` · `#/productos/nuevo` · `#/productos/:id` · `#/categorias` ·
`#/colores` · `#/colecciones` · `#/hormas` · `#/tallas` · `#/resenas` · `#/cupones` · `#/cupones/nuevo` · `#/cupones/:id` ·
`#/suscriptores` · `#/medios` · `#/usuarios` · `#/actividad` · `#/revisiones` · `#/ajustes` · `#/perfil`.
`admin/login.html?next=<hash>`: si ya hay sesión, redirige al panel.
*(panel)* Precisiones: `next` solo acepta rutas del panel (`#/…`; otra cosa → `#/`). Extras de la URL de ingreso: `&motivo=sesion`
(aviso "Tu sesión expiró…", lo agrega el panel al recibir un 401 en una lectura sin cambios pendientes; en una acción o con cambios sin
guardar el panel no sale de la página: abre el diálogo «Tu sesión se cerró» para escribir la clave y repite la petición, `core/reauth.js`)
y `?salida=1` (aviso "Cerraste sesión"). Sin la cookie `mercy_admin`
el panel va directo al ingreso sin llamar a `/api/auth/me`. Ruta desconocida → "Página no encontrada"; ruta sin permiso para el rol →
"Sin permiso" (el menú lateral oculta lo que el rol no puede abrir). El Escritorio enlaza a `#/productos?estado=agotados` y
`#/productos?estado=poco-stock` (la lista de productos puede usarlos como filtro inicial). Framework de vistas (registro de rutas,
componentes, formularios, medios): `admin/README.md`.
*(panel)* Editor de producto: las fotos se cargan en la pestaña **«Colores y stock»**, dentro de cada color: sus fotos base (hasta 10;
la primera es la principal) y, si la prenda tiene estampados, **«Estampados de este color»** (se marcan los que lleva; un color nuevo
empieza sin ninguno) y **«Fotos con estampado»** con una lista por cada estampado marcado (hasta 10; sin fotos se usan las del color).
Desmarcar un estampado con fotos en ese color pide confirmación y quita esas fotos. En la pestaña **Estampados** cada uno dice qué
colores lo llevan (o avisa que ninguno, y entonces no se ve en la tienda). Renombrar un estampado nuevo mueve sus fotos y sus marcas al
id nuevo; quitar uno con fotos pide confirmación y lo quita (con sus fotos) de todos los colores al guardar. La pestaña **Video** es opcional (sin video la ficha no muestra la diapositiva ni el botón
«Ver video»). Las miniaturas de producto del panel (lista, Escritorio, cupones, taxonomías, «Más vendidos» del Inicio) usan la foto
principal (§3).
