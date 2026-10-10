# Mercy Studio — Servidor (tienda + panel administrador)

El sitio ya no es solo HTML estático: un **servidor Node propio** (carpeta `server/`) sirve la tienda, el panel `/admin/`
y la API que guarda todo lo que se edita (contenido, productos, cupones, suscriptores, usuarios, fotos y videos).
Reemplaza a nginx y escucha en el mismo puerto **4000**.

- Node **22 o superior**. **Cero dependencias**: no hace falta `npm install`.
- Contrato técnico (esquema, API, roles): [`ADMIN-CONTRATO.md`](ADMIN-CONTRATO.md).

---

## 1. Correrlo en tu computador

```bash
# desde la carpeta mercy_mockup/
ADMIN_EMAIL=tu@correo.co ADMIN_PASSWORD='UnaClaveLarga2026' npm start
```

Abre <http://localhost:4000> (tienda) y <http://localhost:4000/admin/> (panel).

- `npm start` → `node server/index.js`
- `npm run dev` → igual, pero se reinicia solo cuando cambias algo en `server/`
- `npm test` → pruebas automáticas del servidor (`server/test/*.test.js`, `node:test`)

**Primer arranque.** Si la carpeta de datos está vacía, el servidor:
1. crea el contenido con los datos de fábrica de `js/defaults.js` (productos, textos, cupón de bienvenida…) y la revisión «Contenido inicial»;
2. crea el usuario **administrador** con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Si no definiste `ADMIN_PASSWORD`, **genera una contraseña
   aleatoria y la muestra UNA sola vez en la consola** (búscala en los logs):

```
================================================================
  Mercy Studio · usuario administrador creado
  Correo:     admin@mercystudio.co
  Contraseña: j3IbAj4Hs7psqcTM   (generada; se muestra SOLO esta vez)
  Entra en /admin/ y cámbiala en «Mi perfil».
================================================================
```

Después de ese primer arranque, `ADMIN_PASSWORD` **ya no se usa** (cambiarla no cambia la clave). Las contraseñas se cambian en el panel.

**`js/defaults.js` solo se usa para crear los datos.** Se lee únicamente si falta `content.json` (o `coupons.json`). Cambiar ese archivo
(o desplegar una versión nueva) **no** toca un sitio que ya está en marcha: lo editado en el panel manda. Para volver al contenido de
fábrica, ver §2 «Volver al contenido de fábrica».

### Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `4000` | Puerto HTTP |
| `HOST` | `0.0.0.0` | Interfaz donde escucha (`127.0.0.1` = solo tu equipo) |
| `DATA_DIR` | `<repo>/data` (Docker: `/data`) | Carpeta de datos (ver §2) |
| `ADMIN_EMAIL` | `admin@mercystudio.co` | Correo del primer administrador |
| `ADMIN_PASSWORD` | — (se genera) | Clave del primer administrador (mínimo 10 caracteres) |
| `ADMIN_NAME` | `Administrador` | Nombre del primer administrador |
| `ADMIN_RESET` | — | `1` = al arrancar restablece la clave de `ADMIN_EMAIL` (ver §5) |
| `PUBLIC_URL` | — (se usa el host de la petición) | Origen público del sitio, p. ej. `https://mercystudio.co`: enlaces absolutos de las etiquetas para redes (Open Graph) y del feed de Meta. Útil si el proxy no manda `X-Forwarded-Host` |
| `TRUST_PROXY` | — (Docker: `1`) | `1` = confía en `X-Forwarded-For/Proto` de UN proxy (Easypanel/Traefik). `2` si hay otro delante (p. ej. Cloudflare). `0` si el puerto queda expuesto sin proxy |
| `GIT_SHA` | `dev` | Versión; la muestran `/version.txt` y `/api/health` |
| `NODE_ENV` | — (Docker: `production`) | Solo informativo en el log |

Ejemplo con otro puerto y carpeta de datos de prueba:

```bash
PORT=4101 DATA_DIR="$(mktemp -d)" ADMIN_EMAIL=admin@mercystudio.co ADMIN_PASSWORD='MercyAdmin2026' npm start
```

---

## 2. Dónde quedan los datos

Todo vive en `DATA_DIR` (en Docker, `/data`). **Esa carpeta ES la base de datos del sitio.**

```
data/
├─ content.json       contenido del sitio (inicio, textos, modal, productos, colores, categorías…)
├─ coupons.json       cupones
├─ subscribers.json   correos suscritos (pop-up, comunidad, checkout)
├─ users.json         usuarios del panel (contraseñas con scrypt, nunca en claro)
├─ sessions.json      sesiones abiertas (solo el SHA-256 del token)
├─ media.json         biblioteca de medios (metadatos)
├─ activity.json      registro de actividad (últimas 5000 acciones)
├─ revisions/         historial del contenido (últimas 200 versiones, restaurables desde el panel; ver «Tamaño» abajo)
├─ uploads/AAAA/MM/   fotos y videos subidos desde el panel
└─ tmp/               subidas en curso (se limpia al arrancar)
```

- Las escrituras son **atómicas** (archivo temporal + renombrar): un corte de luz no deja un JSON a medias.
- `data/` está en `.gitignore`: **nunca** se sube al repositorio (tiene correos de clientes y hashes de contraseñas).
- Si un JSON se daña, el servidor **no arranca** y dice cuál archivo es (para no sobrescribir datos con los de fábrica).
  Restaura ese archivo desde una copia de seguridad.
- **Tamaño.** Cada revisión es una copia completa del contenido (sin formato). Con el catálogo de fábrica son unos 30 KB; con
  ~200 productos de 4 colores × 4 fotos, unos 400 KB → las 200 revisiones ocupan ~80 MB. Súmale `uploads/` (fotos y videos: lo más
  pesado). Reserva un volumen de al menos 1–2 GB y vigila el espacio si subes muchos videos.

### Copias de seguridad

Una copia = **copiar la carpeta de datos completa**.

```bash
# local
tar czf mercy-respaldo-$(date +%F).tar.gz -C data .

# servidor con Docker (contenedor en marcha; las escrituras atómicas hacen segura la copia en caliente)
docker run --rm --volumes-from <contenedor> -v "$PWD":/respaldo alpine \
  tar czf /respaldo/mercy-respaldo-$(date +%F).tar.gz -C /data .
```

Restaurar: detén la app, reemplaza el contenido de la carpeta de datos con el respaldo y vuelve a iniciarla.
Recomendado: una copia diaria automática (un cron en el servidor con el comando anterior) y conservar varias, idealmente fuera del servidor.

> Ojo: el **historial de revisiones** del panel deshace cambios de *contenido* (textos, productos…), pero no reemplaza las copias de
> seguridad: no incluye cupones, usuarios, suscriptores ni archivos subidos.

### Volver al contenido de fábrica

Hay dos caminos. Ninguno toca cupones, usuarios, suscriptores ni fotos subidas.

**A. Desde el panel (recomendado, sin detener nada).** Entra como administrador → **Revisiones** → la más antigua,
**«Contenido inicial»** → **Restaurar**. El sitio vuelve al contenido con que se creó (el `js/defaults.js` de ese momento). Se crea una
revisión nueva «Restaurado desde la revisión del … («Contenido inicial»)», así que también se puede deshacer. «Contenido inicial» **nunca se
descarta**, aunque el historial pase de 200 revisiones. Restaurar **no cambia el cupón de bienvenida** (los cupones no forman parte de las
revisiones): si quieres otro, elígelo en **Modal de descuento**. Si la versión quitaría una categoría que usa un cupón, el panel lo impide
(cambia o borra ese cupón primero); los productos que desaparecen se quitan de los cupones (un cupón que se queda sin productos se
desactiva). Si la versión usa fotos que ya se borraron de la biblioteca, la respuesta las lista (`missingMedia`): vuelve a subirlas.

**B. Borrando `content.json` (toma el `js/defaults.js` ACTUAL).** Útil si `js/defaults.js` cambió y quieres ese contenido nuevo.
1. **Detén el servidor** (con el servidor en marcha no sirve: el contenido vive en memoria y el siguiente guardado reescribe el archivo).
2. Haz una copia de seguridad (arriba) y borra **solo** `content.json` de la carpeta de datos.
   - Local: `rm data/content.json`
   - Docker (app detenida; sirve con el contenedor parado): `docker run --rm --volumes-from <contenedor> alpine rm /data/content.json`
3. Inicia el servidor: crea `content.json` con el `js/defaults.js` actual (log: *"content.json creado con el contenido de fábrica"*).
   El historial se conserva y se agrega la revisión **«Contenido de fábrica (content.json se creó de nuevo)»** (también se puede restaurar
   cualquier revisión anterior).
4. `coupons.json` no se toca. Si el cupón de bienvenida de fábrica ya no existe (lo renombraste o borraste), el modal queda **sin cupón**
   (el log lo avisa): elígelo en el panel → **Modal de descuento**.

No borres toda la carpeta de datos para esto: perderías usuarios, cupones, suscriptores y fotos.

---

## 3. Producción en Easypanel (Docker)

El flujo no cambia: cada push a `main` construye la imagen (`Dockerfile`, ahora `node:22-alpine`), la publica en GHCR y Easypanel la
redespliega (ver `README.md` → Despliegue).

### MUY IMPORTANTE: volumen persistente en `/data`

El contenedor guarda todo en `/data`. **Si no montas un volumen ahí, cada despliegue borra TODO** lo editado en el panel
(productos, fotos, cupones, usuarios…) y el sitio vuelve a los datos de fábrica.

En Easypanel → tu app → **Mounts** → **Add Volume**:
- *Name*: `mercy-data` (cualquiera)
- *Mount path*: **`/data`**

Usa el tipo **Volume** (volumen de Docker): hereda los permisos correctos del usuario `node` (uid 1000) con que corre el servidor.
Si usas un **Bind mount** (carpeta del host), dale permisos a ese usuario: `sudo chown -R 1000:1000 /ruta/en/el/host`.
Si no hay permisos, el log dice: *"No se puede escribir en la carpeta de datos "/data"…"*.

### Variables de entorno (Easypanel → Environment)

```
ADMIN_EMAIL=correo-real@mercystudio.co
ADMIN_PASSWORD=una-clave-larga-y-unica
ADMIN_NAME=Nombre de la persona
```

`PORT=4000`, `HOST`, `DATA_DIR=/data`, `TRUST_PROXY=1`, `NODE_ENV=production` y `GIT_SHA` ya vienen en la imagen.
Si no defines `ADMIN_PASSWORD`, busca la contraseña generada en los **logs del primer despliegue** (Easypanel → *Logs*).
Puedes borrar `ADMIN_PASSWORD` del entorno una vez entres y la cambies en el panel.

### Dominio y salud

- *Domains*: puerto **4000**, con HTTPS (Let's Encrypt). Las cookies de sesión salen con `Secure` cuando la petición llega por HTTPS.
- La imagen trae `HEALTHCHECK` contra `/api/health` (`{"ok":true,"version":"<commit>"}`).
- `https://tu-dominio/version.txt` muestra el commit desplegado.

### Probar la imagen en tu equipo

```bash
docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t mercy-studio .
docker volume create mercy-data
docker run --rm -p 4000:4000 -v mercy-data:/data \
  -e ADMIN_EMAIL=admin@mercystudio.co -e ADMIN_PASSWORD='MercyAdmin2026' mercy-studio
```

Abre <http://localhost:4000> y <http://localhost:4000/admin/>. Los datos quedan en el volumen `mercy-data` (sobreviven a `--rm`);
para empezar de cero: `docker volume rm mercy-data`. La imagen solo lleva lo necesario para correr (`*.html`, `css/`, `js/`, `assets/`,
`admin/`, `server/` sin pruebas y `package.json`); `_verify/`, `docs/`, `tools/`, `data/` y `server/test/` quedan fuera (`.dockerignore`).

---

## 4. Seguridad (resumen)

- Contraseñas con **scrypt** (sal aleatoria, comparación en tiempo constante); mínimo 10 caracteres. Las sesiones son tokens
  aleatorios en cookie `HttpOnly; SameSite=Strict` (12 h deslizantes, 30 días con "Recordarme"); en disco solo su SHA-256.
- Protección **CSRF**: toda escritura del panel exige la cabecera `X-Mercy-Admin: 1` y un `Origin` del mismo dominio.
- **Límite de intentos**: 5 fallos de login en 15 min por IP+correo (30 por IP) → espera obligatoria. También hay límites públicos por IP:
  suscribirse **20/hora**, validar cupón **60/10 min** y canjear cupón **20/10 min** (cada uno con su cupo), y canjear el **mismo código**
  **5/hora**. Son holgados a propósito: muchos clientes pueden compartir la misma IP (datos móviles de un mismo operador, wifi de oficina o
  universidad).
- **Usos de los cupones = orientativos.** El pedido se cierra por WhatsApp (no hay pedidos en el servidor), así que el canje es anónimo:
  la tienda suma el uso al abrir WhatsApp con el pedido, pero alguien que conozca un código puede sumarle usos a mano (el cupo de 5/hora
  por IP y código lo frena, no lo impide). Por eso un «Límite de usos» no es una garantía, y en el cupón de **bienvenida** conviene no
  ponerlo (si se agota, el pop-up se apaga para todos).
- Los **códigos de cupón no salen al público**: el contenido público no trae `couponCode` y `/js/defaults.js` se sirve sin
  `Mercy.DEFAULT_COUPONS` (queda `[]`) ni el código del cupón de bienvenida. El código solo lo recibe quien se suscribe (si el modal de
  descuento está activo) o quien lo escribe en el carrito. La **descripción** del cupón es una nota interna: solo la ve el panel.
- Roles verificados **en el servidor**: el Editor no puede tocar cupones, suscriptores, usuarios, ajustes, actividad ni revisiones.
- Todo lo que se guarda pasa por **validación estricta** (tipos, longitudes, URLs seguras, referencias) y se guarda como texto
  (nunca HTML): la tienda lo escapa al mostrarlo.
- Subidas: el tipo se detecta por los **bytes del archivo** (no por el nombre); SVG, HTML y demás formatos se rechazan.
- Solo se sirven las carpetas públicas (lista blanca): `server/`, `data/`, `docs/`, `.git`… dan 404; sin *path traversal*.
- El panel lleva CSP estricta y `X-Frame-Options: DENY`; la tienda, una CSP propia (solo scripts del sitio; fotos y videos de
  cualquier `https://`) y `X-Frame-Options: SAMEORIGIN` (otro sitio no la puede mostrar dentro de un marco); el panel y la API llevan
  `X-Robots-Tag: noindex`. Si algún día se agrega un script externo a la tienda (p. ej. analítica), hay que permitir su dominio en
  `STORE_CSP` (`server/lib/static.js`).
- Usa una clave **única y larga** para el administrador, crea un usuario **Editor** para quien solo edita contenido, y desactiva
  (no compartas) las cuentas de quien deje el equipo: al desactivar o cambiar la clave se cierran sus sesiones.
- Con `TRUST_PROXY=1` el servidor confía en la IP que envía el proxy. **No expongas el puerto 4000 directamente a internet** con
  `TRUST_PROXY=1` (alguien podría falsear su IP y saltarse los límites); si lo haces, pon `TRUST_PROXY=0`.

---

## 5. Olvidé la contraseña del administrador

1. Si hay otro administrador: que entre a **Usuarios** y te asigne una clave nueva.
2. Si no: en Easypanel agrega temporalmente
   ```
   ADMIN_RESET=1
   ADMIN_EMAIL=correo-del-admin@…
   ADMIN_PASSWORD=clave-nueva-de-10-o-mas
   ```
   y redespliega. Al arrancar, ese usuario queda como administrador activo con la clave nueva (se cierran sus sesiones) y queda
   registrado en **Actividad** como acción del *Sistema* ("Acceso de «…» restablecido al arrancar (ADMIN_RESET)").
   **Quita `ADMIN_RESET`** y redespliega otra vez (si no, cada reinicio volvería a restablecerla).
   Sin `ADMIN_PASSWORD`, genera una aleatoria y la muestra en los logs.

---

## 6. Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| Después de desplegar, el sitio volvió a los datos de fábrica | No hay volumen en `/data` (§3). Móntalo y restaura una copia de seguridad. |
| `No se puede escribir en la carpeta de datos "/data"` | Permisos del bind mount: `chown -R 1000:1000` en el host, o usa un *Volume*. |
| `ADMIN_PASSWORD no es válida` y no arranca | Debe tener al menos 10 caracteres. |
| `No se pudo leer content.json (…)` | Archivo dañado: restaura ese archivo desde la copia de seguridad. |
| `El puerto 4000 ya está en uso` | Otro proceso usa el puerto: `PORT=4001 npm start`. |
| "Demasiados intentos" al entrar | Espera los minutos indicados (o entra desde otra red). |
| Cambié `js/defaults.js` y el sitio no cambió | Normal: solo se usa al crear `content.json`. Edita en el panel o sigue §2 «Volver al contenido de fábrica». |
| Aviso `el cupón de bienvenida de fábrica «…» no existe en coupons.json` | Se recreó `content.json` y ese cupón ya no existe: elige el cupón en el panel → Modal de descuento. |
| Un video no avanza en iPhone | Debe servirse desde `/uploads` o `/assets` (el servidor soporta `Range`); usa MP4 (H.264). |

---

## 7. Mapa del código (`server/`)

```
server/
├─ index.js            arranque (variables de entorno, señales SIGTERM/SIGINT, apagado limpio)
├─ app.js              createApp() / createServer(): arma servicios, rutas y estáticos
├─ lib/
│  ├─ db.js            colecciones JSON en memoria + escritura atómica + cola serializada (tx)
│  ├─ http.js          router, errores del contrato, cuerpos (JSON ≤ 2 MB, binario en streaming), cookies, proxy
│  ├─ static.js        archivos estáticos: lista blanca, ETag/304, gzip, Range, CSP del panel y de la tienda, archivos transformados
│  ├─ public-defaults.js  versión pública de js/defaults.js (sin cupones; recorte por tokens comprobado en vm)
│  ├─ validate.js      normalizadores estrictos de secciones, productos, cupones y usuarios
│  ├─ content.js       siembra desde js/defaults.js, contenido público (JSON/JS/gzip en caché), secciones, productos, restaurar
│  ├─ coupons.js       vigencia (hora de Colombia), etiqueta, validar/canjear, CRUD
│  ├─ auth.js          scrypt, sesiones, CSRF, login con límite, usuarios y roles
│  ├─ media.js         subidas (firma de bytes, medidas, miniaturas), usos y borrado
│  ├─ subscribers.js   suscriptores y CSV
│  ├─ revisions.js     historial de contenido (máx. 200; «Contenido inicial» fijada)
│  ├─ activity.js      registro de actividad (máx. 5000)
│  ├─ diff.js          diferencias legibles entre revisiones
│  ├─ ratelimit.js     límites por ventana deslizante
│  └─ util.js          ids, fechas de Colombia, pesos, slugs
├─ routes/             public.js · auth.js · admin-content.js · admin-media.js · admin-manage.js
└─ test/               pruebas (node:test): estáticos, API pública, sesión/roles, contenido, productos, cupones, medios…
```

Cada petición deja una línea en el log: `2026-10-09T23:42:21.646Z GET /catalogo.html 200 1ms` (sin datos personales).
