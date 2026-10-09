# Mercy Studio — Mockup funcional

Tienda de ropa con propósito (Colombia). Mockup navegable en **HTML + CSS + JavaScript separados**, sin build ni dependencias.

## Cómo verlo
Abre `index.html` con doble clic (o sirve la carpeta con cualquier servidor estático, p. ej. `python3 -m http.server`). Las fuentes se cargan de Google Fonts (requiere internet; sin conexión usa tipografías de respaldo).

## Pantallas (escritorio + móvil)
| Archivo | Pantalla | Qué probar |
|---------|----------|-----------|
| `index.html` | Inicio | Hero a pantalla completa con único botón **COMPRA**, franja en movimiento, "Los más vendidos", propósito, reseñas, descuento 15 % (pop-up a los 3,5 s) |
| `catalogo.html` | Catálogo | Filtros en acordeón (cerrados), orden, "Ver más", `?vista=mas-vendidos`, `?cat=hoodies`, `?q=jecvv` |
| `producto.html?id=fe` | Producto | Color/talla/fit, talla agotada tachada en diagonal, **Agregar al carrito**, acordeones (Detalles, Cuidados, Medidas/Tallas…), `?id=amen` (agotado) |
| `checkout.html` | Finalizar compra | Validación obligatoria, Departamento → Ciudad, envío gratis / no incluido, ¿es un regalo?, pago con logos, mensaje de WhatsApp |

Funciones transversales: menú lateral, búsqueda en vivo (con referencias parecidas), favoritos (corazón), carrito como overlay de derecha a izquierda (persistente en `localStorage`), código **MERCY15** (15 % primer pedido).

## Medios de vista previa (fotos y video)
Para ver cómo se vería con material real, el mockup **enlaza directo desde [Pexels](https://www.pexels.com) (licencia libre; no se descarga ni se guarda nada en el proyecto)**:
- **Hero del Inicio:** video de paisaje (mar de nubes al amanecer, 1080p) con un video de respaldo; se configura en `js/config.js` → `heroMedia`.
- **Productos:** fotos de estudio por producto en `js/data.js` → `PHOTOS` (cada producto usa siempre la misma prenda; los detalles son acercamientos de la misma foto). Los fondos lisos se tiñen al tono arena de la marca por CSS.
- Para volver a los degradados con texto: `stockPhotos: false` en `js/config.js`. Para usar material propio: reemplaza `heroMedia.src/poster` y las URLs de `PHOTOS`/`photoUrl()` por tus archivos en `assets/img/`.
- Requiere internet; si un medio no carga, se muestra el degradado de respaldo.

## Estructura
```
index.html catalogo.html producto.html checkout.html
css/   tokens · base · layout · components  +  home · catalogo · producto · checkout
js/    config · data · icons · ui · store · layout  +  home · catalogo · producto · checkout
assets/logo   logos PNG (terracota #bb3f17, beige #eceae2, oscuro)
assets/fonts  mercy-titulo.woff2 (Norwester + tildes, OFL) · ver README
tools/        build_mercy_titulo.py (genera la fuente de títulos)
docs/  ANALISIS-RETROALIMENTACION.md · COMENTARIOS-WORD.md · ARQUITECTURA.md
```

## Personalización rápida (`js/config.js`)
Número de WhatsApp · código y % de descuento · máximo de caracteres del mensaje de regalo · imagen/video del hero (`heroMedia`) · redes sociales. Productos, stock y envío gratis por producto en `js/data.js` (`envioGratis`).

## Documentación
- `docs/ANALISIS-RETROALIMENTACION.md` — qué pidió cada comentario del Word y cómo se resolvió (con decisiones a validar).
- `docs/COMENTARIOS-WORD.md` — transcripción literal de los 47 comentarios.
- `docs/ARQUITECTURA.md` — contrato técnico (APIs, reglas de negocio, convenciones).

> Datos de ejemplo: precios, stock, medidas, políticas, reseñas y logos bancarios son marcadores de posición hasta recibir los insumos reales.

## Despliegue (GitHub Actions + Easypanel, puerto 4000)
Cada push a `main` ejecuta `.github/workflows/deploy.yml`: construye la imagen (`Dockerfile`, nginx), la publica en GHCR (`ghcr.io/ejprietocal/mercy_mockup:latest`) y avisa a Easypanel mediante su *Deploy Webhook* para que descargue la imagen nueva y reinicie la app. También se puede lanzar a mano desde la pestaña *Actions*.

**Configuración única**
- En Easypanel, crea una App con *Source → Docker Image* `ghcr.io/ejprietocal/mercy_mockup:latest` y el puerto **4000** en *Domains*. El paquete de GHCR debe ser público, o bien configura en *Source* un PAT classic con `read:packages`.
- En GitHub (Settings → Environments → `production` → Secrets) crea el secret `EASYPANEL_DEPLOY_URL` con la URL del *Deploy Webhook* de la app (pestaña *Deployments* o *Source*, según la versión de Easypanel).

El workflow usa un *environment* llamado `production` (GitHub lo crea solo; puedes añadirle aprobaciones).

Probar la imagen en local: `docker build -t mercy-studio . && docker run --rm -p 4000:4000 mercy-studio`.
