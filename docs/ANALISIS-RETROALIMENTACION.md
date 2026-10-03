# Mercy Studio — Análisis de retroalimentación y plan del mockup

Fuente: `Retroaliementaciones Mercy.docx` (47 comentarios · 34 imágenes · hilos de **Valentina Lozano M** con respuestas de **Eider Prieto**) + capturas `Escritorio/mercy_1..4.png` (1440 px) y `Telefonos/mercy_1..4_desktop.png` (390 px).

> Regla de prioridad: cuando dos comentarios se contradicen, **gana el más reciente** (los hilos del 21-23 sep. reemplazan a los del 17 sep.).

---

## 1. Inventario de pantallas de partida (propuesta anterior)

| # | Pantalla | Escritorio | Teléfono | Secciones |
|---|----------|-----------|----------|-----------|
| 1 | **Inicio** | `mercy_1.png` | `mercy_1_desktop.png` | Franja superior café · header (menú, logo, lupa, corazón, bolsa) · hero partido (texto izq. + video/foto der.) con 2 botones · franja de confianza (envíos / cambios / WhatsApp / +2.000 clientes) · "Los favoritos – Lo más vestido" (4 productos) · "Nuestro propósito" (fondo oscuro) · reseñas Google (3) · newsletter (solo móvil) · footer |
| 2 | **Catálogo** | `mercy_2.png` | `mercy_2_desktop.png` | Migas · "Toda la colección" · ordenar · filtros (sidebar escritorio / botón "Filtros" + píldoras móvil) · chips activos · grilla 3 col. (2 en móvil) · agotado (Amén) · "Ver más productos" |
| 3 | **Producto** | `mercy_3.png` | `mercy_3_desktop.png` | Galería (miniaturas + video) · colección · rating 4.9 (48) · precio · stock · Fit · Color · Talla (XXL tachada) · cantidad · Agregar al carrito + Comprar por WhatsApp · acordeones · "La historia del diseño" · reseñas · "También te puede gustar" |
| 4 | **Finalizar compra** | `mercy_4.png` | `mercy_4_desktop.png` | Header mínimo · 1 carrito (solo móvil) · 2 contacto · 3 dirección · 4 envío (domicilio / recoger) · 5 pago (Nequi, Bre-B, Bancolombia, Nu) · resumen del pedido con código de descuento · Confirmar por WhatsApp |

**Sistema visual extraído (medido en las capturas):** fondo crema `#fff5e4` · tinta/café `#2a1e14` · sección oscura `#22180f` · pie `#1e130b` · verde WhatsApp/stock `#25976c` · tarjetas de producto = degradados (Gracia `#d8bea6→#b77e5d`, Fe `#c5a68b→#a44809`, Salmo 23 `#8d7864→#3b2d23`, Esperanza `#c0ae95→#715b4a`, Amén `#8f7f6d→#75370c`).
El acento naranja de la propuesta anterior (`#cd5c08`) **se reemplaza por el terracota oficial `#bb3f17`** (ver C5/C21).

---

## 2. Comentarios del Word → decisión de implementación

Leyenda de estado: ✅ implementado en el mockup · 🟡 implementado como placeholder (requiere insumo del cliente) · ❓ ambigüedad resuelta con criterio propio (revisar con Valentina).

### 2.1 Marca, logo y tipografía
| ID | Comentario (resumen literal) | Decisión | Estado |
|----|------------------------------|----------|--------|
| C0 | El ícono de compra que no sea bolsa sino **carrito**. | Ícono de carrito de supermercado en header de todas las pantallas (incluye checkout móvil). | ✅ |
| C3 | "STUDIO" debe ir del **mismo color terracota** que "Mercy". | Logo monocolor: Mercy + STUDIO mismo color. | ✅ |
| C4 | "STUDIO" **no va separado**; ver interlineado/interletrado (Canva: interletrado −70, interlineado 1.4). | Se usa el logo original (STUDIO pegado bajo "Mercy", sin tracking abierto) en lugar del wordmark con letras separadas. | ✅ |
| C5 | HEX **#bb3f17** terracota. | `--terracota: #bb3f17` en todo el sitio (botones, acentos, íconos, badges). | ✅ |
| C21 | "El tono del logo… y en general el terracota que uso es `#2596be`." | **Contradicción**: `#2596be` es un azul; el hilo C5 (23-sep, posterior) y el logo original miden `#bb3f17`. Se usa `#bb3f17`. Confirmar. | ❓ |
| C6/C7 | Este es el logo original. **Tarea:** enviar archivos **en curvas** terracota y beige. | Se extrajo el logo original del Word, se limpió el fondo y se generaron PNG transparentes en terracota, beige y oscuro (`assets/logo/`). Cuando lleguen los archivos en curvas basta reemplazar esos 3 archivos (mismo nombre). | 🟡 |
| C16/C17 | En fondos oscuros el logo va **beige `#eceae2`**, Mercy y Studio **mismo color**. Tarea: PNG en curvas. | Footer y hero (sobre video) usan `mercy-studio-beige.png`. | ✅/🟡 |
| C11 + "EJEMPLO TIPOGRAFÍAS" | Tipografías: **Lekton** (textos pequeños, precios) · **Norwester** (nombres de camisetas y subtítulos grandes) · **Dafoe** (toque/relevancia a una palabra clave). | Tres variables `--font-small/--font-title/--font-accent`. Lekton se carga de Google Fonts; **Norwester y Dafoe no están en Google Fonts**: se declaran con `@font-face` (`local()` + `assets/fonts/`) y caen a Oswald / Kaushan Script mientras no se agreguen los archivos con licencia. Dafoe se usa en una palabra clave por sección (p. ej. *vistes*, *propósito*, *Colección*). | 🟡 |
| C15 | Texto del propósito: "Mercy Studio existe para usar la moda como un medio para comunicar la Palabra de Dios… Mercy es el medio; Cristo es siempre el centro." | Reemplaza el párrafo de "Nuestro propósito" (texto literal). | ✅ |
| C19 | Texto del footer: **"La moda es el medio. Cristo es el mensaje"**. | Reemplaza "Ropa con propósito cristiano…". | ✅ |
| C18 | Añadir íconos de **TikTok** y **Facebook**. | Footer: Instagram, TikTok, Facebook, WhatsApp. | ✅ |
| C20 | "NUESTRA comunidad Mercy" en vez de "LA". | Título del bloque de comunidad/descuento. | ✅ |

### 2.2 Inicio (móvil y escritorio)
| ID | Comentario | Decisión | Estado |
|----|-----------|----------|--------|
| C36 | Hero **a pantalla completa** (video/foto), **cubre incluso el logo**; el logo siempre al **centro**. | Hero `100svh`; el header es transparente y flota sobre el hero; logo centrado en móvil y escritorio. | ✅ |
| C39 | Único botón en la primera vista: **COMPRA** → catálogo. Menú hamburguesa a la izquierda; lupa, corazón y carrito a la derecha, **legibles sobre cualquier foto/video**. Mantener el eslabón café superior. | Se eliminan "Ver colección"/"Nuestra historia" y el menú horizontal. Íconos blancos con sombra sobre el hero; al hacer scroll el header pasa a crema con logo terracota. Franja café superior se conserva. | ✅ |
| C40 | **Difuminado** en la barra superior (escritorio). | `backdrop-filter: blur()` en el header de escritorio. | ✅ |
| C37 | La franja café inferior ("envíos a todo el país…") **en movimiento**, deslizándose. | Marquee CSS infinito (pausa con `prefers-reduced-motion`). | ✅ |
| C38 | El **logo cliqueable** para volver al inicio. | Logo = enlace a `index.html` en todas las pantallas. | ✅ |
| C8 | "Cambios sencillos" → **"Viste con propósito"** + silueta de **corazón** pequeño. | Ítem de la franja con ícono de corazón. | ✅ |
| C9 | "Compra por WhatsApp" → **"Compra segura"**. | Ítem de la franja con ícono de escudo/candado. | ✅ |
| C10/C12 | ¿Cuándo se despliega la sección de favoritos? (como Not Yet Home). R: solo al inicio; con clic va a los productos. | Sección solo en Inicio; cada tarjeta y "Ver todo" llevan al producto/catálogo. | ✅ |
| C13 | Título de la sección → **"LOS MÁS VENDIDOS"**. | Eyebrow "Los favoritos" + título "Los más vendidos". | ❓ |
| C14 | Para ver los más vendidos hay que ir directo al **sándwich** (menú), como Not Yet Home (Shop → Best Sellers). | Menú lateral con **Los más vendidos** destacado → `catalogo.html?vista=mas-vendidos`. | ✅ |
| C1/C2 | ¿Para qué sirve la lupa? R: buscar artículos puntuales o con referencias parecidas. | Búsqueda en vivo (nombre, referencia tipo `JECVV`, categoría, color) + sección "Referencias parecidas". | ✅ |
| C39 | Corazón: "no sé qué función tiene". | **Favoritos**: guarda productos (persistente); el ícono abre un panel de favoritos. Se documenta su función con tooltip. | ✅ |

### 2.3 Descuento 15 % y registro
| ID | Comentario | Decisión | Estado |
|----|-----------|----------|--------|
| P22 + ref. | Cambiar el bloque de newsletter por **la referencia** (pop-up "Tu camino de fe comienza… Obtén un 15 % de descuento en tu primer pedido"). | Modal de descuento (correo + CTA) con la misma estructura de la referencia; el bloque de comunidad del Inicio usa el mismo texto/CTA. Código generado: `MERCY15`. | ✅ |
| C29 | Que **al abrir el carrito se abra de nuevo el CTA** de registro del descuento (ref. Members Access de NYH). | Al abrir el carrito, si el usuario aún no reclamó el descuento, aparece el modal sobre el carrito. | ✅ |
| C31 | Todos los datos del registro obligatorios: **no deja avanzar si no los llenan**. | Validación en el correo del descuento y en todo el checkout (mensaje por campo, foco al primero inválido, botón no envía). | ✅ |

### 2.4 Catálogo
| ID | Comentario | Decisión | Estado |
|----|-----------|----------|--------|
| C22 | Subtítulo → **"Fe, propósito y misericordia"**. | Texto bajo "Toda la colección". | ✅ |
| C41/C42 | ¿Los filtros van ocultos? R: **acordeón de filtros cerrado**. | Filtros en acordeón: cada grupo (Categoría, Fit, Precio, Talla, Color, Disponibilidad) viene **cerrado**; en móvil dentro de un panel "Filtros". Chips activos + "Limpiar". | ✅ |
| C23/C24 | Si no hay stock, ¿qué aparece en lugar del verde? R: **ícono opaco con signo de prohibido / no disponible**. | Estado "No disponible" con ícono prohibido atenuado; en la tarjeta, velo opaco + ícono. | ✅ |
| C43 | Tachón de talla agotada **en diagonal "/"**. | Talla agotada = botón atenuado con línea diagonal. | ✅ |

### 2.5 Producto
| ID | Comentario | Decisión | Estado |
|----|-----------|----------|--------|
| C25 | El color: en vez del texto a un costado, como la referencia (**"Color: NEGRO" encima de los círculos**). Selector tipo NYH (Color / Size / Quantity). | Etiqueta superior "Color: **Negro**" que cambia al elegir; igual para Talla. | ✅ |
| C26/C27 | ¿Comprar por WhatsApp en el producto? R: **NO va**, solo "Agregar al carrito". | Se elimina el botón verde del producto; el botón de agregar es grande. | ✅ |
| (texto P52) | Al agregar al carrito debe haber **"Seguir mirando"** y la opción de **compra por WhatsApp**. | El carrito se abre con "Seguir mirando" y "Comprar por WhatsApp". | ✅ |
| C28 | Descripción **ítem por ítem** (ref. NYH Details) y un ítem más: **MEDIDAS/TALLAS** (ref. tabla). | Acordeones: Detalles (lista), Cuidados, **Medidas / Tallas** (tabla), Envíos, Cambios y devoluciones. | ✅ |
| C32/C34 | Envío configurable por prenda: si ningún producto del carrito lo incluye → **"ENVÍO NO INCLUIDO"**; si al menos uno sí → **"ENVÍO GRATIS"**. | Campo `envioGratis` por producto + regla aplicada en carrito y checkout. | ✅ |

### 2.6 Carrito y checkout
| ID | Comentario | Decisión | Estado |
|----|-----------|----------|--------|
| C44 | Escritorio y móvil: ventana del carrito **desliza de derecha a izquierda como overlay** sobre el sitio (ref. TRUE). | Drawer derecho con velo, cierre por X / Esc / clic fuera, banner de envío, subtotal. | ✅ |
| C45 | En la venta/finalizar compra: **¿Es un regalo?** con mensaje personalizado y **máximo de caracteres**. | Interruptor + textarea con contador (máx. 180, configurable) incluido en el mensaje de WhatsApp. | ❓ |
| C30 | **Primero Departamento y después Ciudad**. | Selects encadenados Departamento → Ciudad. | ✅ |
| C33 | **Recoger en punto: no**. | Solo "Envío a domicilio". | ✅ |
| C32 | Envío: mostrar si es gratis o tiene valor adicional, "se coordina por WhatsApp". | Texto dinámico: *Envío gratis* o *Envío no incluido · costo adicional, se coordina por WhatsApp*. Sin tarifa fija inventada. | ✅ |
| C35 | Quitar **Nu**; agregar **logos de cada banco** en cada opción de pago (ref. NYH, filas con logo a la derecha). | Filas de radio: Nequi, Bre-B, Bancolombia Ahorros, con insignia de marca. | 🟡 |
| C46 | En envíos, en la compra final, poner una **NOTA** como la referencia. | Caja gris con ícono ⓘ: "Verifica que la dirección de entrega, productos y tallas seleccionados estén correctos y completos." | ✅ |
| — | Código de descuento / resumen / confirmar por WhatsApp (se mantiene de la propuesta). | `MERCY15` = 15 % primer pedido; el pedido se arma como mensaje de WhatsApp. | ✅ |

---

## 3. Decisiones tomadas por criterio propio (a validar)
1. **Hex terracota**: `#bb3f17` (C21 dice `#2596be`, que es azul; ver tabla).
2. **Campos opcionales**: *Unidad/Edificio* y *Apto/Casa* son opcionales (hay casas); todo lo demás es obligatorio.
3. **Máximo del mensaje de regalo**: 180 caracteres.
4. **Número de WhatsApp**: `573000000000` (placeholder en `js/config.js`).
5. **Catálogo**: 14 productos de ejemplo (la propuesta mostraba "121 diseños"); el contador es dinámico.
6. **Logos bancarios**: marcas tipográficas aproximadas hasta recibir los archivos oficiales.
7. **Video/foto del hero**: placeholder con degradado; se configura en `js/config.js` (`heroMedia`).

## 4. Insumos pendientes del cliente
- Logo en curvas (terracota y beige) — C7, C17.
- Archivos de fuentes Norwester y Dafoe (licencia) — C11.
- Video/foto del hero, fotos reales de producto.
- Logos oficiales de Nequi, Bre-B y Bancolombia.
- Número real de WhatsApp, políticas de envío por producto, tabla de medidas real.

---

## 5. Trazabilidad final (dónde quedó cada comentario)

Verificado en Chrome (escritorio 1440 y móvil 390; sin desbordes horizontales de 320 a 1920 px y sin errores de consola) con una prueba de flujo completo: inicio → menú → "Los más vendidos" → producto → carrito (reaparece el pop-up) → checkout → mensaje de WhatsApp.

| Comentarios | Dónde se ven |
|-------------|--------------|
| C0 carrito · C1/C2 búsqueda · C14 menú con "Los más vendidos" · C38 logo cliqueable · C39 íconos legibles · C40 blur | `js/layout.js` + `css/layout.css` (header común a todas las pantallas) |
| C3–C7, C16, C17 logo | `assets/logo/*` (PNG transparentes; reemplazables por los archivos en curvas) |
| C11 tipografías · C5 color | `css/tokens.css`, `css/base.css` (`.accent`, `.h*`, `--terracota`) |
| C8, C9, C10, C12, C13, C15, C18, C19, C20, C36, C37 | `index.html` · `css/home.css` · `js/home.js` + footer en `js/layout.js` |
| P22 pop-up 15 %, C29, C31 (correo) | `js/layout.js` (modal) · `js/store.js` (descuento) · bloque de comunidad en `index.html` |
| C22, C41, C42 | `catalogo.html` · `css/catalogo.css` · `js/catalogo.js` |
| C23, C24, C25, C26, C27, C28, C43, P52 | `producto.html` · `css/producto.css` · `js/producto.js` · `.pcard__veil` en `css/components.css` |
| C32, C33, C34, C46 | `js/store.js` (`cart.shipping()`) · `checkout.*` · banner del carrito en `js/layout.js` |
| C30, C31, C35, C45 | `checkout.html` · `css/checkout.css` · `js/checkout.js` |
| C44 carrito overlay derecha→izquierda | `js/layout.js` + `css/layout.css` (`.drawer--right`) |

**Pendiente de insumos del cliente (no bloquea el mockup):** C7/C17 logos en curvas · C11 archivos Norwester/Dafoe · foto/video del hero · logos oficiales de bancos · número real de WhatsApp.
