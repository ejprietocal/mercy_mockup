# Mercy Studio — Arquitectura del mockup

Mockup **funcional** en HTML + CSS + JavaScript puros (sin build, sin dependencias, funciona abriendo `index.html` con doble clic o con cualquier servidor estático). HTML, CSS y JS están **separados**.

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
│  ├─ config.js        WhatsApp, descuento, límites, hero, logos   (Mercy.config)
│  ├─ data.js          productos, categorías, reseñas, departamentos/ciudades, pagos  (Mercy.data)
│  ├─ icons.js         íconos SVG (Mercy.icons.svg("cart")) y logos de bancos
│  ├─ ui.js            utilidades: money, tile/card, overlays, acordeón, toast, validadores  (Mercy.ui)
│  ├─ store.js         carrito, favoritos, descuento, reglas de envío  (Mercy.store)
│  ├─ layout.js        inyecta header/menú/búsqueda/favoritos/carrito/pop-up/footer  (Mercy.layout, .search, .discount)
│  └─ home.js · catalogo.js · producto.js · checkout.js        ← lógica de cada pantalla
├─ assets/logo/        logos PNG transparentes (terracota, beige, oscuro) — reemplazables por los archivos en curvas
├─ assets/fonts/       carpeta para Norwester y Dafoe (ver README.md de la carpeta)
└─ docs/               análisis, comentarios del Word y esta arquitectura
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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Lekton:wght@400;700&family=Oswald:wght@300;400;500;600;700&display=swap">
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/PAGINA.css">
</head>
<body data-page="PAGINA" data-header="hero|solid|minimal" data-footer="full|none">
  <main id="main"> … </main>
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

## API compartida (resumen)

| Módulo | Qué ofrece |
|--------|-----------|
| `Mercy.config` | `whatsapp`, `discount {code, percent}`, `giftMaxChars`, `pageSize`, `heroMedia`, `logo`, `social` |
| `Mercy.data` | `PRODUCTS`, `CATEGORIES`, `FITS`, `COLORS`, `REVIEWS`, `DEPARTMENTS`, `PAYMENT_METHODS`, `MARQUEE`, `SIZE_CHARTS`; `byId(id)`, `color(id)`, `stockOf(p,color,size)`, `colorHasStock(p,color)` |
| `Mercy.icons` | `svg(name,{size,cls,stroke})`, `bank("nequi"|"breb"|"bancolombia")` |
| `Mercy.ui` | `$ $$ esc money norm qs debounce waLink pluralize`, `tileHTML(p,{variant,sub})`, `cardHTML(p,{meta,sub})`, `stepperHTML(qty)`, `syncFavButtons()`, `overlay.open/close/closeAll`, `createModal`, `createDrawer`, `infoModal(id,title,html)`, `initAccordions(root,{single})`, `toast(msg,{icon})`, `validators.{required,email,phone,cedula,name}`, `setError(input,msg)` |
| `Mercy.store` | `cart.{items,add,setQty,remove,clear,count,subtotal,shipping,discountAmount,total}`, `favs.{has,toggle,list,count}`, `discount.{claimed,claim,couponApplied,applyCoupon,removeCoupon,code,percent}`, `session.{get,set}`. Eventos: `mercy:cart`, `mercy:favs`, `mercy:discount` |
| `Mercy.layout` | `openCart()`, `open("menu"|"search"|"favs"|"cart")`, `close(name)`, `openSizeGuide(category, fit)`, `openInfo("envios"|"cambios"|"tallas")`, `sizeTableHTML(category, fit)` |
| `Mercy.search` | `run(query)` → `{ tokens, exact[], similar[] }` (nombre, referencia, categoría, color, horma, colección) |
| `Mercy.discount` | `open()`, `close()`, `scheduleAutoOpen(ms)`, `bindForm(formEl, onOk)` |

Atributos delegados globalmente por `layout.js` (úsalos en tu HTML sin escribir JS): `data-open="menu|search|favs|cart"`, `data-fav="<id>"` (botón corazón), `data-info="tallas|envios|cambios"`, `data-discount-open`, `data-close` (cierra el panel/modal contenedor).

## Reglas de negocio

- **Envío (C34):** ningún producto del carrito con `envioGratis` ⇒ **ENVÍO NO INCLUIDO** (costo adicional, se coordina por WhatsApp); al menos uno ⇒ **ENVÍO GRATIS**. Sin tarifas fijas inventadas.
- **Descuento:** pop-up (correo obligatorio y válido) ⇒ `Mercy.store.discount.claim(email)` ⇒ código `MERCY15` aplicado (15 %). También se puede escribir `MERCY15` en el checkout.
- **Stock:** `Mercy.data.stockOf(p,color,size)`; `0` ⇒ talla tachada en diagonal (C43) y no seleccionable; producto sin stock ⇒ ícono de prohibido + "No disponible" (C23/C24).
- **Carrito:** overlay de derecha a izquierda en escritorio y móvil (C44); al abrirlo, si el usuario no reclamó el descuento, vuelve a aparecer el pop-up (C29).

## Convenciones de código

- Sin frameworks; ES2017+, IIFE por archivo, estado en `Mercy.*`. Cada script de página sólo se ocupa de su pantalla.
- CSS: mobile-first, `min-width` media queries (700px, 900px, 1100px). Colores/tamaños siempre con variables de `tokens.css`.
- Accesibilidad: foco visible, `aria-*` en toggles/diálogos, `prefers-reduced-motion` respetado, objetivos táctiles ≥ 40 px.
- Textos de interfaz en español de Colombia.
