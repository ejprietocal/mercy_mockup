# Mercy Studio — Arquitectura del mockup

Mockup **funcional** en HTML + CSS + JavaScript puros (sin build, sin dependencias, funciona abriendo `index.html` con doble clic o con cualquier servidor estático). HTML, CSS y JS están **separados**.

La tienda **no tiene datos ni textos fijos**: todo sale del **contenido administrable** (esquema en `docs/ADMIN-CONTRATO.md` §3), que se edita desde el panel (`/admin`). Con el servidor Node el contenido llega en `api/public/content.js`; sin servidor se usa el contenido de fábrica de `js/defaults.js` y la tienda se ve exactamente igual.

```
mercy_mockup/
├─ index.html · catalogo.html · producto.html · checkout.html   ← 4 pantallas (cada una responsive: escritorio + móvil)
├─ css/
│  ├─ tokens.css       variables (colores, fuentes, espacios), @font-face, reset
│  ├─ base.css         tipografía (.h1/.accent/.eyebrow), botones, formularios, chips, acordeón, stepper, swatch/talla, nota
│  ├─ layout.css       franja superior, header, menú, búsqueda, favoritos, carrito (overlay), modales, toasts, footer
│  ├─ components.css   .tile, .pcard (tarjeta de producto), .product-grid, reseñas
│  └─ home.css · catalogo.css · producto.css · checkout.css    ← estilos de cada pantalla
├─ js/
│  ├─ defaults.js      contenido DE FÁBRICA (Mercy.DEFAULT_CONTENT, Mercy.DEFAULT_COUPONS) — esquema del contrato §3 (el servidor lo publica sin cupones, §4.4)
│  ├─ config.js        resuelve el contenido (Mercy.content, Mercy.api) y deriva los ajustes (Mercy.config)
│  ├─ data.js          arma Mercy.data desde el contenido: productos publicados, colores, hormas, categorías,
│  │                   colecciones, guías de tallas, reseñas visibles, franja; departamentos/ciudades y pagos (fijos)
│  ├─ icons.js         íconos SVG (Mercy.icons.svg("cart")) y logos de bancos
│  ├─ ui.js            utilidades: money, tile/card, overlays, acordeón, toast, validadores  (Mercy.ui)
│  ├─ store.js         carrito, favoritos, cupones + suscripción (API pública o DEFAULT_COUPONS), reglas de envío  (Mercy.store)
│  ├─ layout.js        inyecta header/menú/búsqueda/favoritos/carrito/pop-up/footer, acceso al panel y barra de edición
│  │                   (Mercy.layout, .search, .discount)
│  └─ home.js · catalogo.js · producto.js · checkout.js        ← lógica de cada pantalla
├─ assets/logo/        logos PNG transparentes (terracota, beige, oscuro) — reemplazables por los archivos en curvas
├─ assets/fonts/       mercy-titulo.woff2 (Norwester + tildes, OFL); Dafoe con local() (ver README.md de la carpeta)
├─ admin/              panel administrador (/admin/, ES modules sin build) — ver admin/README.md
├─ server/             servidor Node sin dependencias: tienda + panel + API (npm start) — ver docs/SERVIDOR.md
├─ tools/              build_mercy_titulo.py (fuente de títulos) · export_defaults.mjs (generó js/defaults.js; uso único, histórico)
├─ package.json · Dockerfile                                   ← scripts start/dev/test · imagen node:22-alpine (puerto 4000, datos en /data)
└─ docs/               contrato del panel (ADMIN-CONTRATO.md), servidor (SERVIDOR.md), análisis, comentarios del Word y esta arquitectura
```

## Orden de carga (todas las páginas)

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Título · Mercy Studio</title>
  <meta name="description" content="…">
  <meta name="theme-color" content="#fff5e4">
  <link rel="icon" href="assets/logo/mercy-studio-terracota.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Lekton:wght@400;700&display=swap">
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/PAGINA.css">
</head>
<body data-page="PAGINA" data-header="hero|solid|minimal" data-footer="full|none">
  <main id="main"> … </main>
  <script defer src="api/public/content.js"></script>   <!-- servidor: window.MercyContent · file://: falla sin efecto -->
  <script defer src="js/defaults.js"></script>
  <script defer src="js/config.js"></script>
  <script defer src="js/data.js"></script>
  <script defer src="js/icons.js"></script>
  <script defer src="js/ui.js"></script>
  <script defer src="js/store.js"></script>
  <script defer src="js/layout.js"></script>
  <script defer src="js/PAGINA.js"></script>
</body>
</html>
```

`layout.js` se ejecuta primero e inyecta (antes de `<main>`): franja café + header; (después de `<main>`): footer, paneles, modal de descuento y botón de WhatsApp. Los scripts de página se ejecutan después y encuentran todo listo.

El HTML estático de cada página (textos del hero, títulos, etc.) es solo el **marcado inicial**: los scripts lo sobrescriben con el contenido. Se conserva para no romper estilos ni accesibilidad (y como respaldo si un script falla).

## Contenido administrable (cómo se resuelve)

1. `api/public/content.js` (solo con servidor) define `window.MercyContent` con `__source: "server"`: productos publicados, sin `discountModal.couponCode` y con `discountModal.welcome = { label, type, value } | null` (`null` también con `discountModal.enabled: false`). Con servidor, `/js/defaults.js` llega con `Mercy.DEFAULT_COUPONS = []` y `couponCode: ""`.
2. `config.js` toma `window.MercyContent` o, si no existe, `Mercy.DEFAULT_CONTENT`. Las secciones-objeto (`settings`, `home`, `discountModal`, `texts`, `meta`) se **completan campo a campo** con los valores de fábrica cuando falta un campo (`undefined`/`null`); un texto `""` o una lista `[]` del panel se respetan (= ocultar). Las listas (`products`, `colors`, `reviews`…) se toman tal cual.
3. Sin servidor, `discountModal.welcome` se calcula con `Mercy.DEFAULT_COUPONS` y `couponCode` (activo, dentro de fechas en hora de Colombia, con usos disponibles) → `{ label: "15%" | "$20.000", type, value }` o `null`.
4. Resultado: `Mercy.content` (contenido resuelto) y `Mercy.api = { enabled: MercyContent.__source === "server" }`.

Para probar contenido sin servidor se puede inyectar `window.MercyContent` con `__source: "local"` antes de cargar la página (lo hace `_verify/e2e/content.mjs`).

## API compartida (resumen)

| Módulo | Qué ofrece |
|--------|-----------|
| `Mercy.content` | contenido resuelto (esquema del contrato §3) + `discountModal.welcome` |
| `Mercy.api` | `{ enabled }` — `true` solo con contenido del servidor (los endpoints públicos del contrato §4.1 solo se usan entonces) |
| `Mercy.config` | derivado de `settings`/`home`/`discountModal`: `brand`, `whatsapp`, `whatsappDisplay`, `whatsappGreeting`, `discount {code, percent}` (solo compatibilidad: la tienda ya no lo lee; code vacío con servidor), `discountEnabled`, `discountAutoOpen`, `discountOnCartOpen`, `discountPopupDelay`, `discountImage`, `giftMaxChars`, `pageSize`, `heroMedia {type: video\|image\|none, src, poster, fallback{src,poster}}`, `stockPhotos` (= `settings.showPhotos`), `showAdminLink`, `logo`, `social`, `storageKey` |
| `Mercy.data` | `PRODUCTS` (solo publicados), `CATEGORIES` (`{id,name,details,sizeChart,inFooter}`), `COLLECTIONS`, `FITS` (`{id: nombre}`), `COLORS` (`{id: {id,name,hex}}`), `REVIEWS` (solo visibles), `MARQUEE`, `SIZE_CHARTS` + `SIZE_CHART_IDS`, `SHIPPING_INFO`, `RETURNS_INFO`, `CARE`, `DEPARTMENTS`, `PAYMENT_METHODS`; `byId(id)` (también con un id anterior de un producto renombrado, `products[].formerIds`: devuelve el producto con su id ACTUAL), `category(id)`, `collectionById(id)`, `color(id)`, `stockOf(p,color,size)`, `colorHasStock(p,color)`, `photosFor(p,colorId,printId)` (regla de fotos; ver «Fotos por color y por estampado»), `printsOf(p,color)` (estampados que lleva ese color), `photoUrl(foto,w)`, `photoSrcset(foto,anchos)` |
| `Mercy.icons` | `svg(name,{size,cls,stroke})` (nombre desconocido → `""`), `bank("nequi"|"breb"|"bancolombia")` |
| `Mercy.ui` | `$ $$ esc money thousands norm qs debounce waLink waGreeting pluralize`, **`rich(text,{lines,accent,fill})`**, **`fill(text)`**, `plain(text)`, `safeUrl(url)`, `tileHTML(p,{variant,index,video,color,print,size,sub,alt,eager})`, `cardHTML(p,{meta,sub})`, `stepperHTML(qty)`, `syncFavButtons()`, `overlay.open/close/closeAll`, `createModal`, `createDrawer`, `infoModal(id,title,html)`, `initAccordions(root,{single})`, `toast(msg,{icon})`, `validators.{required,email,phone,cedula,name}`, `setError(input,msg)` |
| `Mercy.store` | `cart.{items,add,setQty,remove,clear,count,subtotal,shipping,discountInfo,discountAmount,total}`, `favs.{has,toggle,list,count}`, `discount.{claimed,email,applied,couponApplied,code,label,claimedCoupon,claimedCode,claimedApplied,pendingClaim,welcomeLabel,claim,applyCoupon,removeCoupon,revalidate,redeem}`, `session.{get,set}`. Eventos: `mercy:cart`, `mercy:favs`, `mercy:discount` (`detail.action`: claim, coupon, remove, refresh, invalid, claim-invalid). Ver «Cupones y suscripción» |
| `Mercy.layout` | `openCart()`, `open("menu"|"search"|"favs"|"cart")`, `close(name)`, `openSizeGuide(idGuía, fit)`, `openInfo("envios"|"cambios"|"tallas")`, `sizeTableHTML(idGuía, fit)`, `sizeNoteHTML(cls)` |
| `Mercy.search` | `run(query)` → `{ tokens, exact[], similar[] }` (nombre, referencia, categoría, color, horma, colección) |
| `Mercy.discount` | `open()`, `close()`, `scheduleAutoOpen(ms)`, `bindForm(formEl, onOk(resultado), source "popup"\|"community")` |

Atributos delegados globalmente por `layout.js` (úsalos en tu HTML sin escribir JS): `data-open="menu|search|favs|cart"`, `data-fav="<id>"` (botón corazón), `data-info="tallas|envios|cambios"`, `data-discount-open`, `data-claimed-apply` (en el carrito: aplica el código recibido al suscribirse; el checkout lo maneja aparte), `data-copy-code` (copia el código que muestra el `<strong>` vecino), `data-close` (cierra el panel/modal contenedor).
Marcas para pruebas: `data-admin-link` (botón del header y enlace del menú), `data-edit-bar` / `data-edit-link` / `data-edit-panel` (barra de edición), `data-cart-promo` / `data-cart-disc` (carrito), `data-co-disc` / `data-coupon-note` (checkout).

### Forma de `Mercy.data.PRODUCTS[i]`
`{ id, ref, name, category, collection (NOMBRE, "" si no hay), collectionId, fits, sizes, price, badge, envioGratis, soldOut (= soldOut || todo el stock en 0),
bestRank, newRank, rating, reviews (= reviewsCount), colors: [ids], stock[color][talla], colorPhotos[color]: [fotos] (0–10, fotos base),
colorPrints[color]: [ids de estampados que lleva ese color, en el orden de prints] ([] = ninguno),
printPhotos[color][estampado]: [fotos] (1–10; solo combinaciones con fotos y estampados que lleva ese color; {} si no hay ninguna),
initialColor (1.er color con stock, si ninguno el primero), initialPrint (1.er estampado del color inicial o ""), photos (= fotos principales, ver abajo),
prints (solo los estampados que lleva al menos un color; la propiedad no existe si no hay), video ({src, poster} | null; solo con src), tile, tags, desc, story,
sizeChart (id de la guía de su categoría o ""), details (propios o los de la categoría), care (propios o texts.care) }`.
`SIZE_CHARTS[idGuía]` conserva la forma de siempre `{ head, regular: [[talla, …]], oversize: […] }` (claves enumerables = `head` + ids de hormas) y además
`id`, `name`, `unit`, `fits` (orden de las pestañas) como propiedades NO enumerables; `SIZE_CHART_IDS` = orden de las pestañas de la guía.

### Textos enriquecidos (contrato §2)
- `Mercy.ui.rich(text)` escapa y convierte `*palabra*` → `<span class="accent">palabra</span>` y `\n` → `<br>`; con `{ lines: "hero__line" }` cada línea es una `<span>` (título del hero); `{ accent: false }` para párrafos; `{ fill: true }` aplica `fill()` antes.
- `Mercy.ui.fill(text)` reemplaza `{descuento}` por `Mercy.content.discountModal.welcome.label`; sin cupón vigente lo quita sin dejar espacios dobles.
- Nota de la guía de tallas: un paréntesis final (p. ej. "(Valores de ejemplo.)") se muestra en cursiva (`<em>`).
- Números con coma decimal (es-CO): medidas de la guía de tallas `52.5` → "52,5" (también en celdas de texto: "20.5–21" → "20,5–21"),
  calificación del Inicio y de la ficha `4.9` → "4,9". Precios y conteos con punto de miles (`$89.900`, `1.234 reseñas`).
- Todas las URL del contenido pasan por `Mercy.ui.safeUrl` (bloquea `javascript:`, `data:`, `vbscript:`…).

### Fotos por color y por estampado (contrato §3 «Fotos de producto»)
- Cada color de un producto tiene 0–10 fotos **base** `{ src, thumb, alt, zoom, ox, oy, fit? }`, dice qué estampados lleva
  (`colors[].prints`; sin la clave = todos, contenido anterior) y, opcionalmente, tiene 1–10 fotos por **combinación con cada uno de
  esos estampados** (`colors[].printPhotos[idEstampado]`). `data.js` las normaliza en `p.colorPhotos[color]`, `p.colorPrints[color]` y
  `p.printPhotos[color][estampado]`: recorta a 10 y descarta los estampados que ya no existen en la prenda o que ese color no lleva y las
  listas vacías. Los estampados no tienen stock propio (el stock sigue siendo color × talla) y en la ficha se eligen con el círculo de
  color (`hex`).
- **`Mercy.data.photosFor(p, color, print)`** — `print` sin pasar (`undefined`) = el primer estampado de ese color; `""` = sin estampado.
  Devuelve: 1) la combinación color + estampado, si ese color lo lleva y tiene fotos; si no, 2) las fotos base del color; si no,
  3) `[]` (degradado `tile`). Las listas **no se mezclan** y **nunca se toman de otro color**. El panel (`productPhotos` en
  `admin/js/core/format.js`) y el servidor (`server/lib/social.js`) aplican la misma regla.
- **Fotos principales** `p.photos` = la primera lista con fotos del color inicial (su primer estampado, sus fotos base, sus demás
  estampados); si no tiene ninguna, la del primer color que tenga alguna (mismo orden). Las usan las tarjetas del catálogo y del Inicio,
  la búsqueda y los favoritos (`tileHTML` sin `color` ni `print`); la primera es la que sale en `og:image` y en las miniaturas del panel.
- **`Mercy.ui.tileHTML(p, { color, print })`** → `photosFor(p, color, print)` (sin `print` = primer estampado del color). Carrito (`layout.js`)
  y checkout (`checkout.js`) pasan el color **y el estampado de la línea** (la miniatura es la foto de esa variante) y enlazan a
  `producto.html?id=…&color=…&print=…` (`print` solo si la línea tiene estampado).
- **Ficha** (`producto.js`): `?color=<id>&print=<id>` fija la variante inicial si el color está en `p.colors` y ese color lleva el
  estampado; si no, color inicial y su primer estampado. El selector «Estampado» muestra solo `printsOf(p, color)` y se oculta si el
  color no lleva ninguno; al cambiar a un color que no lleva el estampado elegido, pasa a su primero (o a ninguno). `galleryPlan(color, print)` = las fotos de `photosFor` + la diapositiva de video al
  final **solo si `p.video && p.video.src`** (sin video `VIDEO_INDEX = -1`). Al cambiar de color **o** de estampado la galería se rehace
  (miniaturas, puntos, contador «Foto n de N», flechas, teclado y scroll-snap) solo si cambia el juego de fotos —se compara por contenido
  (`src`/`zoom`/`ox`/`oy`), no por referencia; dos juegos vacíos no la rehacen— y vuelve a la foto 1.
- **Sin video** no hay diapositiva de video, miniatura ▶, último punto ni botón «Ver video» (`#gallery-video` oculto), y el carril se
  anuncia «Fotos de la prenda» (con video, «Fotos y video de la prenda»). Ya no existe el aviso «Video próximamente» (ni sus textos
  `texts.product.videoSoonTitle/videoSoonText`). Con video, el modal reproduce `<video controls playsinline>` (se pausa al cerrar) y
  el botón usa `texts.product.videoChip`.
- **Sin fotos** (o `settings.showPhotos` apagado → `Mercy.config.stockPhotos` false): 3 degradados de marca (+ la diapositiva de video
  solo si hay video). **Una sola diapositiva:** flechas, puntos y miniaturas se ocultan (atributo `hidden`); se reevalúa en cada
  `renderGallery`.
- **Miniaturas:** en escritorio (≥ 900 px) columna con alto máximo = alto del escenario y scroll vertical propio; en móvil, fila con
  scroll horizontal. La miniatura activa se mantiene visible desplazando **su contenedor** (`container.scrollTo` calculado; nunca
  `element.scrollIntoView`, que también movería la página).
- **Visor «Ver foto completa»** (`openViewer` en `producto.js`, modal `#photo-viewer` creado la primera vez): tocar una foto de la galería
  (botones `[data-zoom]`, fuera del orden de tabulación), el botón `#gallery-expand` (abajo a la derecha; oculto con degradados o en el
  video) o Enter en el carrusel abre la foto **entera** (`object-fit: contain`, 2000 px) a pantalla completa. Flechas, ←/→ o deslizar
  pasan de foto (solo las del juego actual, sin el video); clic de mouse en la foto, doble toque, rueda/pellizco del trackpad o pellizco
  acercan hasta 4× y se arrastra para mover; +/− desde el teclado; deslizar hacia abajo, clic en el fondo, Esc o «Cerrar» salen. Al cerrar,
  la galería queda en la última foto vista.
- **Foto completa en el marco** (`fit: "contain"`, casilla «Mostrar completa (sin recortar)» del editor de fotos del panel): `tileHTML`
  le pone `.tile__img--full` (`object-fit: contain`, sin acercamiento) en la galería y en las tarjetas; las miniaturas cuadradas
  (`size: "thumb"`) siguen llenando su marco. Sin la casilla, la foto llena el marco (`cover`, anclada al 20 % superior).
- `srcset`: fotos de Pexels → `?auto=compress&cs=tinysrgb&w=N`; fotos subidas con miniatura → `thumb 600w, src 2000w`; otras URL → solo `src`. `zoom/ox/oy` → variables CSS `--zoom/--ox/--oy`.

### Contenido raro o vacío (nunca lanza)
Franja en movimiento vacía → se oculta · franja superior vacía → no se pinta y `--strip-h: 0` · sin reseñas visibles → se ocultan las secciones de reseñas ·
hero `type: "none"` o sin `src` → placeholder · producto en borrador → no existe en la tienda (ficha = "no encontrada") · color sin stock → tachado ·
producto sin fotos → degradado · producto sin video → sin diapositiva ni botón de video · categoría sin productos → no sale en píldoras/filtros del catálogo (sí en el menú; su catálogo muestra el estado vacío) ·
colección inexistente → no se muestra "Colección …" · red social vacía o insegura → no se muestra · sin cupón de bienvenida → sin pop-up automático, sin CTA del carrito y sin `{descuento}`.

## Cupones y suscripción (`js/store.js`, contrato §3, §4.1 y §6)

- **Dos modos.** Con servidor (`Mercy.api.enabled`) todo va a la API pública con rutas relativas a la raíz del sitio (junto a `api/public/content.js`):
  `POST api/public/subscribe {email, source}`, `coupons/validate {code}`, `coupons/redeem {code}` (JSON, tiempo máximo 12 s; nunca rechaza: sin red → `reason: "network"`).
  Sin servidor (`file://` / hosting estático) se valida contra `Mercy.DEFAULT_COUPONS` con la misma vigencia (fechas inclusivas en hora de Colombia, activo, usos) y sin contar usos.
- **Estado guardado** (`localStorage`): `discount = { email, claimedAt, coupon: CupónPúblico|null, claimedCoupon, claimedUsed, checkedAt }` (`claimedUsed` =
  ya envió un pedido con su código de bienvenida, o al intentar usarlo ya no valía: no se le vuelve a ofrecer). Un cupón aplicado a la vez.
  Además `parked = { cart: [{ line, at }], favs: [{ id, at }] }`: líneas y favoritos de productos que la tienda no encuentra (ver «Al cargar»).
  El estado viejo del mockup (`{ email, claimedAt, coupon: true|false }`, sin `claimedCoupon`): **sin servidor** se migra al cupón de
  bienvenida de fábrica (`Mercy.DEFAULT_CONTENT.discountModal.couponCode`, si sigue vigente en `DEFAULT_COUPONS`) y se revalida; **con servidor**
  se descarta (ese correo nunca llegó al servidor y el código de bienvenida no es público): la persona vuelve a ver el pop-up y puede suscribirse de
  verdad. Carrito y favoritos se conservan. Ningún archivo de `js/` salvo `defaults.js` lleva códigos de cupón.
- **API:** `claim(email, source) → Promise<{ok, coupon, message, reason?}>` (registra el correo y aplica el cupón de bienvenida que devuelva el servidor;
  con el modal apagado o sin cupón vigente suscribe sin cupón) · `applyCoupon(code) → Promise<{ok, coupon?, reason?, message}>` (un código válido queda
  aplicado aunque no llegue al mínimo) · `removeCoupon()` · `revalidate()` / `redeem()` → si el cupón ya no vale se quita (`{removed: true, code, reason, message}`),
  sin red se conserva (`{network: true}`); `redeem()` va con `keepalive` · `claimedApplied()` (¿el código recibido es el aplicado?) · `pendingClaim()` (código
  recibido, sin aplicar y sin usar → «Usar mi código X»; `null` si no) · `cart.discountInfo() → { coupon, code, label, amount, eligibleSubtotal, minSubtotal,
  meetsMin, missing, partial, message }`.
- **Cálculo:** subtotal elegible = líneas cuyo producto cumple `appliesTo` (`all` / `categories` / `products`); si no llega a `minSubtotal` → $0 y
  "Compra mínima de $X … para usar este código. Te faltan $Y." (`missing`); sin líneas elegibles → "Este código no aplica a los productos de tu carrito.";
  `percent` → `round(elegible × valor / 100)`; `fixed` → `min(valor, elegible)`.
- **Mensajes por motivo:** not_found "Ese código no existe." · inactive "Este código no está activo." · not_started "Este código aún no está vigente." ·
  expired "Este código ya venció." · exhausted "Este código ya alcanzó su límite de usos." · red "No pudimos validar el código. Revisa tu conexión e inténtalo de nuevo."
- **Al cargar cada página** (tras `DOMContentLoaded`): se quitan las líneas del carrito cuyo color, talla u horma ya no existe, cuyo color ya no lleva su estampado (o que
  quedaron agotadas), las cantidades se ajustan al stock **compartido** (ver «Stock» en Reglas de negocio: las líneas anteriores tienen prioridad;
  toast "Actualizamos tu carrito…" / "Ajustamos las cantidades…") y se revalida el cupón aplicado: en el checkout siempre,
  en las demás páginas como mucho 1 vez por minuto (límite público 60/10 min por IP). Si ya no vale: se quita y toast "Quitamos el código X: <motivo>".
  Un **producto que no se encuentra** (en borrador un rato, borrado, renombrado sin alias) no se borra del carrito ni de favoritos: queda en `parked`
  (sin verse ni contar; el toast avisa una vez) hasta 30 días y vuelve solo si el producto reaparece. Un **id anterior** (producto renombrado:
  `formerIds`) se cambia por el actual. Una línea guardada sin horma de un producto que ahora tiene hormas toma la primera (como `cart.add`).
- **Pop-up y Comunidad** (`Mercy.discount.bindForm(form, onOk, source)`): correo obligatorio y válido; mientras envía el botón queda deshabilitado con
  "Enviando…"; errores (422, 429, sin red) en el campo; el éxito muestra el **código real** recibido (`claimedCode()`) y "Copiar" copia ese código.
  Sin cupón (welcome `null` o `discountModal.enabled: false`) no hay pop-up, ni reaparece al abrir el carrito, ni CTA en carrito/checkout; la
  Comunidad igual suscribe y muestra "¡Gracias por suscribirte!…" sin bloque de código. Se respetan `autoOpen`, `delayMs` y `showOnCartOpen`.
- **Ya suscrita** con su código sin aplicar (lo quitó o lo cambió): carrito y checkout ofrecen "Usar mi código X" (`data-claimed-apply`, lo aplica
  validándolo) en vez de "¿Aún no tienes código? / Obtén 15%…"; no se ofrece si ya lo usó en un pedido enviado o si ya no vale. El pop-up y la
  Comunidad solo dicen "ya está aplicado" si ese código es el aplicado (si no: "Este es tu código de bienvenida").
- **Carrito:** "Código X aplicado · 15% de descuento" + fila "Descuento (X)" con el monto; si no descuenta, el motivo (caja neutra) y "$0".
- **Checkout:** aplicar es asíncrono ("Aplicando…", campo de solo lectura), mensajes por motivo, "Quitar"; resumen "Descuento (X · 15%)" o
  "(X · $20.000)" (sin descuento efectivo: "X agregado · aún sin descuento" y "Descuento (X)" $0); el mensaje de WhatsApp incluye código y monto.
  Al **confirmar** con descuento > 0 se vuelve a **validar** el código (botón "Confirmando…"): `ok:false` → se quita el cupón, se recalculan los
  totales, se explica el motivo y NO se abre la vista previa; sin red se continúa. El **uso se cuenta al abrir WhatsApp** (`redeem` en segundo
  plano, una vez por pedido): cerrar la vista previa, confirmar otra vez o en otra pestaña no gasta usos. Al abrir WhatsApp se vacía el carrito y se
  quita el código usado. Enlaces: `Mercy.ui.waLink(texto)` → `https://api.whatsapp.com/send?phone=…&text=…` (con `wa.me` la redirección dañaba
  el 👋 del saludo en WhatsApp Web/escritorio).

## Acceso al panel (`js/layout.js`, `css/layout.css`)

- Con `settings.showAdminLink`: botón con ícono `user` (`aria-label`/`title` "Panel administrador") en el header *hero* y *sólido* — a la derecha antes de
  favoritos desde 900 px; junto al menú en celular (la derecha ya tiene 3 íconos y el logo debe quedar centrado; ≤ 374 px los íconos pasan a 36 px de ancho) —
  y "Panel administrador" al final del menú lateral. No va en el header mínimo del checkout. Destino: `admin/login.html`, o `admin/` si existe la cookie
  indicadora `mercy_admin` (sin secreto; la sesión real es `mercy_sid` HttpOnly).
- Barra de edición: con la cookie `mercy_admin` **y** `Mercy.api.enabled`, pastilla flotante abajo a la izquierda "Editar esta página" (en celulares
  < 420 px solo "Editar" a la vista) + "Panel". Rutas: Inicio → `admin/#/inicio`, Catálogo → `admin/#/productos`, Producto → `admin/#/productos/<id>`,
  Checkout → `admin/#/descuento`. Sube con la franja en movimiento del hero y con la barra de compra fija del producto (móvil) como el botón de WhatsApp
  (que va a la derecha) y no sale al imprimir.

## Reglas de negocio

- **Envío (C34):** ningún producto del carrito con `envioGratis` ⇒ **ENVÍO NO INCLUIDO** (costo adicional, se coordina por WhatsApp); al menos uno ⇒ **ENVÍO GRATIS**. Sin tarifas fijas inventadas.
- **Descuento:** pop-up o Comunidad (correo obligatorio y válido) ⇒ `Mercy.store.discount.claim(email, source)` ⇒ cupón de bienvenida (`discountModal.couponCode`, de fábrica `MERCY15` = 15 %; con servidor el código solo se conoce al suscribirse) aplicado. También se pueden escribir otros cupones del panel en el checkout (ver «Cupones y suscripción»). Los textos del pop-up y de la comunidad salen de `discountModal`/`home.community` con `{descuento}`.
- **Stock:** `Mercy.data.stockOf(p,color,size)`; `0` ⇒ talla tachada en diagonal (C43) y no seleccionable; producto sin stock ⇒ ícono de prohibido + "No disponible" (C23/C24).
  El stock es por **color × talla** y lo comparten todos los estampados y hormas. Por eso el tope de cantidad del carrito es por **producto + color +
  talla sumando sus líneas**, no por línea (una línea también distingue estampado y horma): tope de una línea = stock(color, talla) − lo que piden las
  OTRAS líneas del mismo producto, color y talla. Con Negro M = 5 se pueden pedir 5 en total (p. ej. 3 con estampado naranja + 2 con azul), no 5 + 5.
  Se aplica en `cart.add` (recorta y devuelve `capped`; si las otras líneas ya tienen todo el stock → `{ ok: false, reason: "tope" }`), en
  `cart.setQty` y en el saneo al cargar (las líneas anteriores tienen prioridad). `cart.items()[i].max` = tope de esa línea (`stock` sigue siendo
  el de la talla y el color).
- **Carrito:** overlay de derecha a izquierda en escritorio y móvil (C44); al abrirlo, si el usuario no reclamó el descuento, vuelve a aparecer el pop-up (C29).

## Verificación (Chrome headless, sin dependencias)

```
node _verify/e2e/flow.mjs       # flujo completo escritorio (puerto 9400)
node _verify/e2e/mobile.mjs     # móvil 390×844, sin desbordes (9401)
node _verify/e2e/states.mjs     # agotado, estampado, guía de tallas, búsqueda, favoritos (9402)
node _verify/e2e/content.mjs    # contenido inyectado: textos, fotos por color, borradores, listas vacías (9403)
node _verify/e2e/viewer.mjs     # visor «Ver foto completa» (clic, flechas, teclado, rueda, gestos táctiles) y fotos con fit «contain» (9405)
node _verify/e2e/coupons.mjs    # API simulada: cupones %, fijo, categoría, producto, mínimo, motivos, validar al confirmar y canje al
                                # abrir WhatsApp, revalidación, limpieza del carrito, productos renombrados/en borrador, migración del
                                # estado viejo (demo / servidor), welcome null / modal apagado, ya suscrita («Usar mi código»),
                                # botón del panel y barra de edición (9415)
node _verify/e2e/shots.mjs _verify/out/after          # capturas + huella de texto (9404)
python3 -I _verify/e2e/compare.py _verify/out/baseline _verify/out/after   # % de píxeles distintos y diferencias de texto
```
Variables: `CDP_PORT=94xx` fuerza el puerto de Chrome; `BASE_URL=http://127.0.0.1:4300/` abre las páginas en el servidor real en vez de `file://`
(todas las pruebas anteriores pasan en ambos modos: `content.mjs` y `coupons.mjs` fijan su `window.MercyContent` como propiedad no escribible
para que `api/public/content.js` no lo pise, y `coupons.mjs` simula `fetch`). Contra el servidor real además:

```
PORT=4300 DATA_DIR="$(mktemp -d)" ADMIN_EMAIL=admin@mercy.test ADMIN_PASSWORD='MercyAdmin2026!' node server/index.js &
BASE_URL=http://127.0.0.1:4300/ ADMIN_EMAIL=admin@mercy.test ADMIN_PASSWORD='MercyAdmin2026!' node _verify/e2e/server.mjs   # (9416)
```
`server.mjs` suscribe por el pop-up y la Comunidad (y lo comprueba en `GET /api/admin/subscribers`), crea cupones por API y los usa en el checkout,
verifica que `usesCount` NO sube al confirmar ni al ver la vista previa y sí al abrir WhatsApp (una vez), agota un cupón entre aplicar y confirmar, edita
`home` con `PUT /api/admin/content/home`, desactiva el cupón de bienvenida y prueba la cookie real `mercy_admin` (login/logout). Usa SIEMPRE un
`DATA_DIR` temporal: crea datos de prueba (los borra al final).

**Diferencias esperadas frente a `_verify/out/baseline`** (capturas del mockup original; `compare.py` las marca, son intencionales y siguen el
contrato): el botón del panel en el header (§6, si `settings.showAdminLink`); la calificación con coma decimal («4,9» en vez de «4.9», §6); las
**fotos por color** (§3/§6): la Tote Bag en Crema muestra solo sus 2 fotos (la foto de la tote negra solo sale al elegir Negro) y en el
carrito/checkout la miniatura es la foto de la variante de la línea (tote negra → foto negra); y **sin diapositiva de video** en las prendas sin
video (todas las de fábrica tienen `video: null`): la galería pierde la última diapositiva, su miniatura ▶, su punto y el botón «Ver video»
(frente a la línea base, `fe` y `amen` pasan de 4 a 3 diapositivas/miniaturas y la tote crema de 4 a 2 —con video eran 3: sus 2 fotos + el
video—; la huella de texto ya no tiene «Ver video»). Si se quieren
comparar solo regresiones, regenera la línea base con `shots.mjs` en una carpeta nueva (no pises `baseline`, que es la referencia del mockup).
El filtro de errores (`_verify/e2e/_helpers.mjs`) ignora solo la carga fallida de `api/public/content.js` en `file://` y las fuentes de Google.

## Convenciones de código

- Sin frameworks; ES2017+, IIFE por archivo, estado en `Mercy.*`. Cada script de página sólo se ocupa de su pantalla.
- CSS: mobile-first, `min-width` media queries (700px, 900px, 1100px). Colores/tamaños siempre con variables de `tokens.css`.
- Accesibilidad: foco visible, `aria-*` en toggles/diálogos, `prefers-reduced-motion` respetado, objetivos táctiles ≥ 40 px.
- Textos de interfaz en español de Colombia.
