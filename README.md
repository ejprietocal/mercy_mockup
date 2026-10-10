# Mercy Studio — Tienda + panel administrador

Tienda de ropa con propósito (Colombia). **HTML + CSS + JavaScript separados**, sin build, más un **servidor Node propio sin dependencias**
(`server/`) que sirve la tienda, el **panel administrador** (`/admin`) y la API que guarda todo lo que se edita. Todo lo que se ve en la
tienda (video del hero, frases, productos, fotos, textos, descuentos…) se cambia desde el panel y lo ven **todos** los visitantes.

## Cómo correrlo en local
Necesitas **Node 22 o superior**. No hace falta `npm install` (cero dependencias).

```bash
# desde la carpeta mercy_mockup/
ADMIN_EMAIL=tu@correo.co ADMIN_PASSWORD='UnaClaveLarga2026' npm start
```

Abre <http://localhost:4000> (tienda) y <http://localhost:4000/admin/> (panel; entra con ese correo y esa clave).
- El primer arranque crea los datos en `data/` (git-ignorado) con el contenido de fábrica y el usuario administrador.
  Después, `ADMIN_PASSWORD` ya no se usa: la clave se cambia en el panel (**Mi perfil**). Sin `ADMIN_PASSWORD` genera una y la muestra **una sola vez** en la consola.
- `npm run dev` = igual pero se reinicia al cambiar `server/` · `npm test` = pruebas del servidor · otro puerto: `PORT=4001 npm start`.
- Sin servidor (doble clic en `index.html` o cualquier hosting estático) la tienda funciona en **modo demostración**: usa el contenido de
  fábrica de `js/defaults.js`, valida los cupones de ese archivo y no hay panel.

Variables, datos, copias de seguridad y problemas comunes: [`docs/SERVIDOR.md`](docs/SERVIDOR.md).

## Panel administrador (`/admin`)
Se entra con el **botón de usuario del header** de la tienda (o "Panel administrador" en el menú lateral); con la sesión abierta, la tienda
muestra la barra flotante **"Editar esta página"**. Dos roles: **Administrador** (todo) y **Editor** (contenido, productos y medios).

Qué se administra:
- **Inicio:** video o imagen del hero, título, frases de la franja en movimiento, más vendidos, propósito, reseñas y comunidad.
- **Textos del sitio:** todo lo que no es de un producto ni del Inicio: franja superior, menú y ayuda, búsqueda, favoritos y carrito, catálogo, avisos de envío, cuidados, guía de tallas, etiquetas de la ficha, página de pago (incluido el inicio y cierre del mensaje de WhatsApp), suscripción y pie de página.
- **Productos:** precio, tallas, hormas, stock por color y talla, **hasta 4 fotos por color**, video, borradores y duplicar.
- **Categorías, colecciones, colores, hormas, guía de tallas y reseñas.**
- **Modal de descuento** (textos, imagen, cuándo aparece) y **cupones** (porcentaje o valor fijo, vigencia, usos, por categoría o producto).
- **Suscriptores** (con exportación CSV), **biblioteca de medios** (fotos y videos subidos), **usuarios** con roles y **ajustes** (WhatsApp, redes, logos, SEO, medios de pago).
- **Historial:** actividad de cada persona y **revisiones** restaurables del contenido.
- **Pauta en Meta:** las páginas salen con etiquetas Open Graph (foto, título y descripción al compartir o pautar un producto), el píxel de
  Meta se activa con su identificador en **Ajustes** y el feed del catálogo para Commerce Manager está en `/api/public/feed-meta.csv`.

Contrato técnico (esquema, API, roles, rutas): [`docs/ADMIN-CONTRATO.md`](docs/ADMIN-CONTRATO.md) · framework del panel: [`admin/README.md`](admin/README.md).

## Pantallas (escritorio + móvil)
| Archivo | Pantalla | Qué probar |
|---------|----------|-----------|
| `index.html` | Inicio | Hero a pantalla completa con único botón **COMPRA**, franja en movimiento, "Los más vendidos", propósito, reseñas, pop-up de descuento (configurable en el panel) |
| `catalogo.html` | Catálogo | Filtros en acordeón (cerrados), orden, "Ver más", `?vista=mas-vendidos`, `?cat=hoodies`, `?q=jecvv` |
| `producto.html?id=fe` | Producto | Color/talla/fit, fotos del color elegido, talla agotada tachada en diagonal, **Agregar al carrito**, acordeones (Detalles, Cuidados, Medidas/Tallas…), `?id=amen` (agotado) |
| `checkout.html` | Finalizar compra | Validación obligatoria, Departamento → Ciudad, envío gratis / no incluido, ¿es un regalo?, cupón de descuento, pago con logos, mensaje de WhatsApp |
| `admin/` | Panel | Escritorio, edición de cada sección, productos con fotos por color, cupones, suscriptores, actividad y revisiones |

Funciones transversales: menú lateral, búsqueda en vivo (con referencias parecidas), favoritos (corazón), carrito como overlay de derecha a izquierda (persistente en `localStorage`), cupón de bienvenida al suscribirse (de fábrica **MERCY15**, 15 % primer pedido; se cambia en el panel) y cupones creados en el panel.

## Contenido de fábrica (`js/defaults.js`)
`js/defaults.js` es **solo el contenido de fábrica**: el servidor lo lee únicamente para crear `data/content.json` (y `data/coupons.json`) cuando
no existen. Cambiarlo, o desplegar una versión nueva, **no** toca un sitio en marcha: lo editado en el panel manda. Para volver al contenido de
fábrica: panel → **Revisiones** → «Contenido inicial» → Restaurar (otras opciones en `docs/SERVIDOR.md`). El servidor publica ese archivo sin
cupones (los códigos nunca son públicos).

Las fotos y el video de fábrica **enlazan directo desde [Pexels](https://www.pexels.com)** (licencia libre; no se guardan en el proyecto) y
requieren internet; si un medio no carga se muestra el degradado de respaldo. Para usar material propio súbelo en el panel (**Medios**, o
directamente en el producto / el Inicio). **Ajustes → «Mostrar fotos de los productos»** apagado vuelve a las tarjetas con degradado y texto.

## Estructura
```
index.html catalogo.html producto.html checkout.html
css/     tokens · base · layout · components  +  home · catalogo · producto · checkout
js/      defaults (contenido de fábrica) · config · data · icons · ui · store · layout  +  home · catalogo · producto · checkout
admin/   panel (index.html, login.html, css/admin.css, js/core + js/views) — ES modules, sin build
server/  index.js (arranque) · app.js · lib/ · routes/ · test/ (node:test)
assets/logo   logos PNG (terracota #bb3f17, beige #eceae2, oscuro)
assets/fonts  mercy-titulo.woff2 (Norwester + tildes, OFL) · ver README
tools/        build_mercy_titulo.py (fuente de títulos) · export_defaults.mjs (generó js/defaults.js)
data/         datos del servidor (git-ignorado; en Docker = volumen /data)
docs/         ADMIN-CONTRATO.md · SERVIDOR.md · ARQUITECTURA.md · ANALISIS-RETROALIMENTACION.md · COMENTARIOS-WORD.md
```

## Documentación
- `docs/ADMIN-CONTRATO.md` — contrato del sistema: esquema del contenido, API, roles y rutas del panel (fuente de verdad).
- `docs/SERVIDOR.md` — cómo correr y operar el servidor: variables, datos, copias de seguridad, Easypanel, seguridad, recuperar acceso.
- `docs/ARQUITECTURA.md` — cómo está hecha la tienda (orden de carga, `Mercy.*`, cupones, pruebas e2e).
- `admin/README.md` — framework del panel para escribir vistas.
- `docs/ANALISIS-RETROALIMENTACION.md` — qué pidió cada comentario del Word y cómo se resolvió (con decisiones a validar).
- `docs/COMENTARIOS-WORD.md` — transcripción literal de los 47 comentarios.

> Datos de ejemplo: precios, stock, medidas, políticas, reseñas y logos bancarios son marcadores de posición hasta recibir los insumos reales (se reemplazan desde el panel).

## Docker en local
```bash
docker build -t mercy-studio .
docker run --rm -p 4000:4000 -v mercy-data:/data \
  -e ADMIN_EMAIL=tu@correo.co -e ADMIN_PASSWORD='UnaClaveLarga2026' mercy-studio
```
Los datos quedan en el volumen `mercy-data` y sobreviven al contenedor (`--rm`); `docker volume rm mercy-data` empieza de cero.
La imagen (`node:22-alpine`, usuario `node`) solo lleva la tienda, `admin/` y `server/` (sin pruebas, `_verify/`, `docs/` ni `tools/`).

## Despliegue (GitHub Actions + Easypanel, puerto 4000)
Cada push a `main` ejecuta `.github/workflows/deploy.yml`: construye la imagen (`Dockerfile`, servidor Node, ya **no** nginx; amd64 + arm64), la
publica en GHCR (`ghcr.io/ejprietocal/mercy_mockup:latest`) y avisa a Easypanel mediante su *Deploy Webhook* para que descargue la imagen nueva
y reinicie la app. También se puede lanzar a mano desde la pestaña *Actions*.

**Configuración única**
- En Easypanel, crea una App con *Source → Docker Image* `ghcr.io/ejprietocal/mercy_mockup:latest` y el puerto **4000** en *Domains* (con HTTPS). El paquete de GHCR debe ser público, o bien configura en *Source* un PAT classic con `read:packages`.
- En GitHub (Settings → Environments → `production` → Secrets) crea el secret `EASYPANEL_DEPLOY_URL` con la URL del *Deploy Webhook* de la app (pestaña *Deployments* o *Source*, según la versión de Easypanel).

> **PASO OBLIGATORIO en Easypanel (antes del primer despliegue con el panel)**
> 1. **Volumen persistente en `/data`:** App → *Mounts* → *Add Volume* → nombre `mercy-data`, *Mount path* **`/data`**.
>    Ahí viven el contenido, los productos, las fotos subidas, los cupones, los suscriptores y los usuarios. **Sin el volumen, cada despliegue
>    borra todo lo editado en el panel** y el sitio vuelve al contenido de fábrica.
> 2. **Variables de entorno** (App → *Environment*): `ADMIN_EMAIL=correo-real@…` y `ADMIN_PASSWORD=una-clave-larga-y-unica` (mínimo 10
>    caracteres; opcional `ADMIN_NAME`). Crean el primer administrador; luego la clave se cambia en el panel. `PORT`, `DATA_DIR=/data` y
>    `TRUST_PROXY=1` ya vienen en la imagen.
>
> Detalles (permisos del volumen, copias de seguridad, recuperar la clave con `ADMIN_RESET`): [`docs/SERVIDOR.md`](docs/SERVIDOR.md) §3–§5 ·
> contrato: [`docs/ADMIN-CONTRATO.md`](docs/ADMIN-CONTRATO.md).

El workflow usa un *environment* llamado `production` (GitHub lo crea solo; puedes añadirle aprobaciones). Para comprobar qué versión está en
línea: `https://tu-dominio/version.txt` o `/api/health`.
