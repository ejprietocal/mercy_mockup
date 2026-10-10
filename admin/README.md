# Panel Mercy Studio — guía del framework para autores de vistas

Panel administrador tipo WordPress/Shopify en **ES modules nativos**, sin build ni dependencias. Esta guía es todo lo que
necesitas para escribir una vista (`admin/js/views/*.js`). El contrato del sistema (esquema del contenido, API, roles, rutas)
está en [`docs/ADMIN-CONTRATO.md`](../docs/ADMIN-CONTRATO.md); el servidor en [`docs/SERVIDOR.md`](../docs/SERVIDOR.md).

```
admin/
├─ index.html          marco del panel (barra lateral, barra superior, <main>) → js/main.js; carga las fuentes de
│                      la tienda (Kaushan Script + Lekton, Google Fonts) para las vistas previas
├─ login.html          ingreso → js/login.js
├─ css/admin.css       estilos del framework (tokens, componentes, responsive)
├─ css/views/*.css     estilos propios de cada grupo de vistas (contenido, productos, catalogo, marketing, sistema)
└─ js/
   ├─ main.js          verifica la sesión, importa las vistas, monta el marco y arranca el router
   ├─ login.js
   ├─ core/            el framework (no lo cambies sin coordinar: todas las vistas dependen de él)
   │  ├─ dom.js        h(), append(), replace(), $, $$, uid()…
   │  ├─ icons.js      icon("trash")
   │  ├─ format.js     money, fechas, slugify, deepEqual, getPath/setPath, isSafeUrl…
   │  ├─ api.js        api.get/post/put/del/upload, ApiError
   │  ├─ reauth.js     sesión que se cierra mientras se trabaja: volver a entrar en un diálogo sin perder lo escrito
   │  ├─ session.js    usuario actual, can(rol)
   │  ├─ store.js      caché del contenido: content.section(), content.saveSection(), productos…
   │  ├─ router.js     rutas hash, guardas por rol, protección de salida
   │  ├─ nav.js        grupos y orden del menú lateral
   │  ├─ shell.js      barra lateral, barra superior, cajón móvil
   │  ├─ ui.js         toast, modal, confirmDialog, pageHeader, card, section, dataTable, tabs, menu…
   │  ├─ forms.js      createForm() + fields.* + barra de guardado
   │  └─ media.js      subirArchivo, openMediaPicker, mediaField, photoListField
   └─ views/           una vista por archivo (dashboard, home, texts, discount, products, taxonomies,
                       sizecharts, reviews, coupons, subscribers, media, users, activity, revisions, settings, profile)
```

Vistas de referencia: `views/settings.js` (sección con barra de guardado y `fields.media`), `views/profile.js` (dos
formularios con botones en línea), `views/taxonomies.js` (listas con `itemMeta` / `beforeRemove`), `views/products.js`
(tabla con filtros en la URL, pestañas con `setBadge`, editor con controles propios vía `form.register`) y
`views/coupons.js` (columna principal con botones y `data-row-link`).

---

## 1. Probar

```bash
# desde mercy_mockup/ — usa TU puerto y una carpeta de datos temporal (nunca data/ del repo)
PORT=4200 HOST=127.0.0.1 DATA_DIR="$(mktemp -d)" ADMIN_EMAIL=admin@mercy.test ADMIN_PASSWORD='MercyAdmin2026!' node server/index.js
```

Panel: `http://127.0.0.1:4200/admin/` · Tienda: `http://127.0.0.1:4200/`. Un editor para probar roles se crea por API
(desde la consola del navegador con sesión de admin):

```js
fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json", "X-Mercy-Admin": "1" },
  body: JSON.stringify({ name: "Elena Editora", email: "editor@mercy.test", role: "editor", active: true, password: "EditorMercy2026!" }) });
```

Chrome headless: `_verify/cdp.mjs` (`Browser.launch({ port })`, `page.goto`, `page.eval`, `page.click`, `page.type`, `page.shot`,
`page.errors`). Las violaciones de CSP y las excepciones aparecen en `page.errors`. `page.eval` corre como en la consola: envuelve
las declaraciones en `{ … }` para no repetir `const` entre llamadas.

**Reglas que el navegador hace cumplir (CSP de `/admin/**`):** nada de `<script>` en línea ni atributos `onclick=""`; los eventos
siempre con `addEventListener` (o `onClick` en `h()`, que hace lo mismo). `style=""` sí se permite (valores dinámicos).
Imágenes y videos externos solo por `https:`. Todo `fetch` va al mismo origen.

**Textos:** español de Colombia, tuteo, frases cortas y claras (“Guardar”, “Cambios guardados.”, “¿Eliminar el cupón?”).
Moneda: `money(89900)` → `$89.900`.

---

## 2. Registrar una vista

Cada archivo de `views/` exporta **por defecto una lista de rutas**. `main.js` ya los importa todos (si uno tiene un error de
sintaxis, solo esa sección deja de funcionar y el admin ve un aviso; el resto del panel sigue).

```js
/* views/coupons.js */
import { h } from "../core/dom.js";
import { pageHeader, card } from "../core/ui.js";

export default [
  {
    path: "/cupones",                 // contrato §7 (no cambies las rutas)
    title: "Cupones",                 // o (params) => "…" → document.title = "Cupones · Panel Mercy Studio"
    roles: ["admin"],                 // contrato §5. Sin roles = admin y editor
    async render(el, params, ctx) {   // el: contenedor vacío de la vista
      const data = await api.get("/api/admin/coupons", { signal: ctx.signal });
      el.append(h("div.page", pageHeader({ title: "Cupones" }), card({ body: "…" })));
      return () => { /* limpieza opcional al salir de la ruta */ };
    },
  },
  { path: "/cupones/nuevo", title: "Nuevo cupón", roles: ["admin"], render: (el, params, ctx) => editor(el, null, ctx) },
  { path: "/cupones/:id", title: "Editar cupón", roles: ["admin"], render: (el, { id }, ctx) => editor(el, id, ctx) },
];
```

- Las rutas fijas ganan a las de parámetro (`/cupones/nuevo` antes que `/cupones/:id`). Los parámetros llegan decodificados.
- `render` puede ser `async`: mientras no termina, el router muestra un esqueleto de carga y deja `el` oculto; si lanza un error,
  muestra “No se pudo cargar esta sección” con **Reintentar** (no hace falta try/catch para la carga inicial). Un 401 al cargar
  (sin cambios sin guardar) lleva solo al ingreso.
- Al terminar, el router enfoca el `<h1>` (accesibilidad) y sube el scroll.
- **El menú lateral NO se toca desde la vista**: sale de `core/nav.js` y se oculta según los `roles` de tu ruta. Una ruta sin
  permiso muestra “Sin permiso”; una inexistente, “Página no encontrada”.

### `ctx` (contexto de la vista)

| | |
|---|---|
| `ctx.params`, `ctx.path`, `ctx.query` | parámetros, ruta (`/productos/fe`) y `URLSearchParams` de `#/ruta?x=1` |
| `ctx.user`, `ctx.isAdmin`, `ctx.can("admin")` | usuario actual y permisos |
| `ctx.signal` | `AbortSignal` que se aborta al salir: pásalo a `api.get(url, { signal })` |
| `ctx.isCurrent` | `false` si la persona ya navegó a otra ruta (útil tras un `await` largo) |
| `ctx.onCleanup(fn)` | limpieza al salir (listeners globales, timers) |
| `ctx.guard(() => bool)` | “hay cambios sin guardar” → el router pregunta antes de salir. **`createForm({ ctx })` ya lo hace solo.** |
| `ctx.setTitle("Camiseta Fe")` | cambia el título de la pestaña y de la barra superior (p. ej. con el nombre del producto) |
| `ctx.navigate("/productos/fe", { replace, force })` | navegar (`force` = sin preguntar por cambios) |
| `ctx.reload({ force })` | volver a dibujar la vista |
| `ctx.setQuery({ tab: "fotos" })` | cambia la query sin redibujar (recordar la pestaña abierta) |

Enlaces normales: `<a href="#/productos/fe">` (con `h("a", { href: "#/productos/fe" }, "Camiseta Fe")`).
Enlaces con filtro: el Escritorio abre `#/productos?estado=agotados` / `?estado=poco-stock` y Categorías abre
`#/productos?categoria=<id>`; la lista de productos lee `ctx.query` y los aplica con `table.setState(…)`, y con
`onStateChange` deja la URL al día cuando cambias los filtros (ver §7, Tabla de datos). Otros enlaces profundos:
`#/medios?archivo=<id>`, `#/revisiones?id=<id>`, `#/tallas?guia=<id>`, `#/actividad?tipo=…&persona=…`.
Un enlace a una sección que el rol no puede abrir (p. ej. `#/cupones` para un editor) se muestra como texto:
`canOpen("#/cupones")` (ui.js) dice si la persona puede abrirlo.

---

## 3. DOM e íconos — `core/dom.js`, `core/icons.js`

```js
import { h, append, replace, $, $$, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";

h("button.btn.btn--primary", { type: "button", onClick: guardar, "aria-label": "Guardar" }, icon("save"), "Guardar");
h("div.card", { class: ["x", activo && "is-on"], style: { "--w": "40%" }, dataset: { id: p.id }, hidden: !visible }, hijos);
h("p", "Texto seguro: <b> se ve literal");      // los textos SIEMPRE son texto (nunca HTML)
replace(el, nodoA, [nodoB, null, "texto"]);       // como h(): acepta listas y omite null/false
```

- Atributos `false`/`null`/`undefined` se omiten; `true` = atributo vacío. `html: "…"` solo para HTML propio y confiable.
- **Ojo:** `el.replaceChildren(lista)` nativo NO acepta listas ni `null` (escribe “null”); usa `replace(el, …)` o `el.replaceChildren(...lista)`.
- `uid("x")` → id único para `label for` / `aria-describedby`.
- `icon(nombre, { size: 18, label })` → `<svg>` decorativo (o con nombre accesible si das `label`). Nombres: `ICONS` en
  `icons.js` (dashboard, home, text, gift, shirt, folder, palette, layers, scissors, ruler, star, ticket, mail, image, video, users,
  user, activity, history, settings, external, menu, x, chevron-*, plus, minus, trash, edit, copy, search, upload, download, link,
  check, check-circle, x-circle, alert, alert-circle, info, eye, eye-off, logout, grip, arrow-*, refresh, more, lock, store,
  package, save, calendar, clock, filter, phone, globe, at, key, focus, tag, file, percent, construction, sparkle, italic, play).

---

## 4. API — `core/api.js`

```js
import { api, ApiError, withQuery, download } from "../core/api.js";

const { items } = await api.get("/api/admin/coupons", { signal: ctx.signal });
const { item } = await api.post("/api/admin/coupons", cupon);        // JSON automático + X-Mercy-Admin: 1
await api.put(`/api/admin/coupons/${encodeURIComponent(id)}`, cupon);
await api.del(`/api/admin/subscribers/${encodeURIComponent(id)}`);
await api.get(withQuery("/api/admin/media", { kind: "image", q }));  // omite parámetros vacíos
await download("/api/admin/subscribers.csv", "suscriptores.csv");      // descarga respetando la sesión
```

Errores → `ApiError { status, code, message, fields, data }` (`data` = el objeto `error` completo del servidor):
- `message` ya viene en español y listo para mostrar. `code` ∈ `validation, conflict, in_use, forbidden, not_found, rate_limited…`;
  `network` (status 0) si no hay conexión.
- `e.isValidation` (422, `e.fields` = `{ "hero.title": "…" }`), `e.isConflict` (409 por edición concurrente, `e.data.current`),
  `e.isInUse` (409 `in_use`, `e.data.usages` / `e.data.products`), `e.retryAfter` (429).
- 401 (sesión vencida, contraseña cambiada en otro equipo, usuario desactivado o editado) → `core/reauth.js` decide:
  - una **lectura sin cambios sin guardar** (abrir una sección) → al ingreso `login.html?next=<hash actual>&motivo=sesion`;
  - **una acción** (guardar, borrar, subir…) **o cambios sin guardar** → diálogo «Tu sesión se cerró» con la contraseña, sin
    salir de la página; al entrar, la petición se repite sola (el «Guardar» termina). Usuario desactivado → se le dice.
    Si cierra el diálogo, la petición falla con `e.sessionDismissed = true` (el Form y `showApiError` avisan «no se guardó»).
  - No hace falta hacer nada en las vistas. `router.leaveTo(url)` sale del panel sin el aviso del navegador.
- `api.upload(url, blob, { method, headers, onProgress })` sube binarios con progreso (lo usa `subirArchivo`).

## 5. Sesión — `core/session.js`

```js
import { session, can, ROLE_LABELS } from "../core/session.js";
session.user;            // { id, name, email, role, active, createdAt, updatedAt, lastLoginAt }
session.isAdmin;         // true/false · session.roleLabel → "Administrador" | "Editor"
can("admin");            // ocultar partes de una vista (el servidor vuelve a validar SIEMPRE)
session.onChange(fn);    // p. ej. tras editar "Mi perfil"
```

## 6. Contenido — `core/store.js`

```js
import { content, byId } from "../core/store.js";

const home = await content.section("home");                 // COPIA editable + recuerda la versión (X-Base-Updated-At)
const guardado = await content.saveSection("home", valor);  // PUT /api/admin/content/home → valor normalizado por el servidor
await content.saveSection("home", valor, { force: true });  // sobrescribir aunque otra persona haya guardado
const data = await content.load();                          // contenido completo (caché 60 s; { force: true } recarga)
content.sectionMeta("home");                                // { updatedAt, updatedBy }
byId("colors").get("negro");                                // { id, name, hex } (de la caché ya cargada)

// Productos (mantienen la caché al día)
const lista = await content.products();                     // incluye borradores
const p = await content.product("fe");                      // fresco del servidor (GET /api/admin/products/fe)
const nuevo = await content.createProduct(valor);           // 201 · 409 fields.id si el id existe
const act = await content.updateProduct("fe", valor);       // base = valor.updatedAt → 409 si otra persona guardó
await content.deleteProduct("fe");
const copia = await content.duplicateProduct("fe");         // id "fe-copia", en borrador
content.invalidate();                                       // p. ej. tras restaurar una revisión
```

`content.data` es de solo lectura: nunca lo modifiques; trabaja sobre las copias que te dan `section()` / `product()`.

---

## 7. Componentes — `core/ui.js`

```js
import {
  button, iconButton, withBusy, spinner, toast, modal, confirmDialog, promptDialog, showApiError, describeUsage,
  pageHeader, card, section, emptyState, skeleton, errorState, notice, badge, statusBadge, statCard,
  tabs, menu, dataTable, revealElement, placeholderView, canDrag, sortHint,
} from "../core/ui.js";
```

**Botones**
```js
button({ label: "Nuevo producto", icon: "plus", variant: "primary", href: "#/productos/nuevo" });  // <a>
button({ label: "Eliminar", icon: "trash", variant: "danger", size: "sm", onClick });             // <button>
// variant: primary | secondary (por defecto) | ghost | danger | link | inverse · size: sm | lg · block: true
iconButton({ icon: "trash", label: "Eliminar «Fe»", onClick });  // solo ícono, con nombre accesible y tooltip
await withBusy(boton, () => api.del(url), { label: "Eliminando…" });  // bloquea el botón mientras corre
```

**Avisos y diálogos**
```js
toast("Cupón creado.");                                        // éxito (en celular los avisos salen arriba)
toast(e.message, { type: "error" });                           // error | warning | info · { title, timeout, action: { label, onClick } }
// Con un diálogo abierto, el aviso se muestra ENCIMA de él (la región de avisos pasa al <dialog> modal superior,
// que es lo único que no queda inerte) y al cerrarlo vuelve a la página con los avisos que tenga.
if (await confirmDialog({ title: "¿Eliminar el producto?", message: "No se puede deshacer.", confirmLabel: "Eliminar", danger: true })) { … }
const nombre = await promptDialog({ title: "Nueva colección", label: "Nombre", validate: (v) => v.length > 60 ? "Máximo 60." : null });  // string | null
showApiError(e);  // in_use → diálogo con la lista de lugares (con enlaces); 401/abort → nada; otro → toast de error
describeUsage("coupons/MERCY15");  // → { label: "Cupón MERCY15", href: "#/cupones" } (href null si el rol no puede abrirlo)

const m = modal({
  title: "Editar foto", size: "md",                            // sm | md | lg | xl
  content: (api) => h("div", "…"),                             // Node, lista o función
  actions: [{ label: "Cancelar", value: null }, { label: "Aplicar", variant: "primary", onClick: async (api) => { await guardar(); /* return false = no cerrar */ } }],
});
const resultado = await m.result;                               // valor de la acción, o null (Escape / fondo / ×)
```
Los diálogos usan `<dialog>`: Escape cierra, el foco queda atrapado dentro y vuelve al botón que los abrió.

**Estructura de página**
```js
el.append(h("div.page",                                         // .page (1180 px) · .page--form (1060) · .page--narrow (880) · .page--wide
  pageHeader({ title: "Productos", subtitle: "…", breadcrumbs: [{ label: "Tienda" }],           // migas = niveles ANTERIORES
               badge: statusBadge("draft"), actions: [button({ label: "Nuevo", icon: "plus", variant: "primary", href: "#/productos/nuevo" })] }),
  card({ title: "Información", description: "…", actions: [botón], body: [campos], footer }),   // flush: true → sin relleno (tablas)
  section({ title: "WhatsApp", description: "Explicación a la izquierda", body: [campos] }),     // estilo "Ajustes" de Shopify
));
emptyState({ icon: "ticket", title: "Aún no hay cupones", message: "…", action: { label: "Crear cupón", href: "#/cupones/nuevo", icon: "plus" } });
skeleton({ variant: "table" | "form" | "cards" | "page", rows: 5 });
errorState({ error: e, onRetry: () => ctx.reload({ force: true }) });
notice({ tone: "warning", title: "Cupón vencido", message: "…", action: button(…) });           // info | success | warning | danger
badge("15%", "accent");   // neutral | success | warning | danger | info | accent
statusBadge("published"); // published, draft, active, inactive, scheduled, expired, exhausted, soldout, low, instock, admin, editor, visible, hidden
statCard({ label: "Productos", value: 14, hint: "12 publicados", icon: "shirt", tone: "accent", href: "#/productos" });  // dentro de h("div.stats", …)
```

**Pestañas**
```js
const t = tabs({ label: "Partes del producto", active: ctx.query.get("tab") || "general", onChange: (id) => ctx.setQuery({ tab: id }),
  items: [{ id: "general", label: "General", content: [campos] }, { id: "fotos", label: "Colores y fotos", badge: 3, content: () => … }] });
card({ body: t.el });
t.setBadge("fotos", 4);      // cambia el número de la pestaña · null / "" lo quita · t.select("fotos") · t.active · t.panel(id)
```
Las pestañas que no caben bajan a otra línea (en el celular se ven como botones redondeados): ninguna queda escondida.
Todos los paneles quedan montados (los campos siguen vivos). Si un error cae en una pestaña oculta, el Form abre la
pestaña del PRIMER error; las demás pestañas con errores quedan marcadas (ícono rojo, “tiene errores” para lectores de
pantalla) hasta que se corrigen.

**Menú desplegable**
```js
menu({ label: "Más acciones", items: [
  { label: "Duplicar", icon: "copy", onClick: duplicar },
  { label: "Ver en la tienda", icon: "external", href: `../producto.html?id=${id}`, target: "_blank" },
  { divider: true },
  { label: "Eliminar", icon: "trash", danger: true, onClick: eliminar },
] });  // → botón "⋯"; o menu({ trigger: miBoton, items })
```

**Tabla de datos**
```js
const table = dataTable({
  caption: "Productos", stateKey: "productos",          // stateKey recuerda búsqueda/orden/página al volver a la lista
  columns: [
    { key: "name", label: "Producto", sortable: true, primary: true, render: (p) => p.name },   // primary → enlace a rowHref
    { key: "price", label: "Precio", sortable: true, align: "end", render: (p) => money(p.price), value: (p) => p.price },
    { key: "status", label: "Estado", render: (p) => statusBadge(p.status), hideOn: "mobile" },   // "tablet" = ≤ 960 px
  ],
  rows: productos,
  search: { placeholder: "Buscar por nombre o referencia…", keys: ["ref", "tags"] },             // false = sin buscador
  filters: [{ key: "status", label: "Estado", options: [{ value: "published", label: "Publicados" }, { value: "draft", label: "Borradores" }] }],
  sort: { key: "name", dir: "asc" }, pageSize: 25,
  rowHref: (p) => `#/productos/${encodeURIComponent(p.id)}`,                                    // clic en la fila
  rowActions: (p) => [{ label: "Editar", icon: "edit", href: `#/productos/${p.id}`, primary: true }, { label: "Eliminar", icon: "trash", danger: true, onClick: () => borrar(p) }],
  empty: { icon: "shirt", title: "Aún no hay productos", action: { label: "Crear producto", href: "#/productos/nuevo", icon: "plus" } },
  toolbar: [button({ label: "Exportar", icon: "download", size: "sm" })],
  onStateChange: (st, { source }) => ctx.setQuery({ estado: st.filters.estado || null }),     // source: "user" | "api"
});
card({ flush: true, body: table.el });
table.setRows(nuevaLista);   // tras borrar/duplicar · table.setLoading(true) · table.visibleRows (filtradas y ordenadas)
```
Un filtro con `test: (fila, valor) => bool` permite filtros calculados (p. ej. “Agotados”). Búsqueda sin tildes ni mayúsculas.
`hideOn: "mobile"` oculta la columna en ≤ 720 px y `"tablet"` en ≤ 960 px (desde que el menú pasa a cajón). Si aun así la tabla
no cabe, se desplaza de lado y la columna de acciones queda fija a la derecha (con sombra), así «Editar / ⋯» siempre se ven.

Controlar la tabla desde la vista (en lugar de tocar sus `<select>` o hacer clic en los encabezados):

```js
table.state;                              // { q, filters: { status: "draft" }, sort: { key, dir }, page } (copia)
table.setFilter("status", "draft");       // valores que no están en las opciones se ignoran ("" = todos)
table.setSort("price", "desc");           // table.setSort(null) = sin orden
table.setSearch("fe");
table.setState({ q: "", filters: { estado: "agotados", category: "" } });  // varios a la vez (un solo dibujo)
```
Cada cambio (de la persona o de estas funciones) se recuerda con `stateKey` y llama a `onStateChange`. Un filtro
recordado que ya no existe (p. ej. una categoría eliminada) se descarta al abrir la tabla.

**Fila clicable (accesible).** Con `rowHref`, cada fila tiene UN enlace real (teclado y lectores de pantalla) y el clic
en el resto de la fila lo abre (Ctrl/Cmd/Mayús + clic → pestaña nueva; no se abre si estabas seleccionando texto ni al
hacer clic en botones, enlaces o campos de la fila). La columna `primary: true` lleva ese enlace:
- si la celda no tiene controles, el enlace la envuelve entera (como siempre);
- si la celda tiene botones (un `<button>` no puede ir dentro de un `<a>`), marca el texto principal con
  `data-row-link` y el núcleo lo convierte en el enlace (si no marcas nada, usa el `<a>` que ya tenga o el primer texto):
  ```js
  { key: "code", label: "Código", primary: true, render: (c) => h("div", h("span.mk-code", { "data-row-link": "" }, c.code), iconButton({ icon: "copy", label: "Copiar", onClick })) }
  ```

**`onRowClick: (fila, evento) => …`** reemplaza la navegación por tu propia acción (p. ej. abrir un diálogo, como en
Usuarios o Medios). Como ahí no hay enlace, pon en la fila un botón real que haga lo mismo (`rowActions` con
`primary: true`, o un `<button>` en la celda principal) para quien usa el teclado.

---

## 8. Formularios — `core/forms.js`

```js
import { createForm, fields as f, renderRich } from "../core/forms.js";

const form = createForm({
  ctx,                                   // protección de salida + limpieza + "Recargar" en conflictos
  value: await content.section("home"),  // se copia: form.value es la copia de trabajo
  onSubmit: (v, { force }) => content.saveSection("home", v, { force }),   // DEVUELVE el valor guardado (o undefined)
  // saveBar: true (por defecto) → barra fija "Cambios sin guardar · Descartar · Guardar" + Ctrl/Cmd+S. UNA por página.
  // saveBar: false → pon form.actions() donde quieras (botones en línea).
  // successMessage: "Cambios guardados." (null = sin aviso) · saveLabel: "Guardar"
  // errorPrefix: "items" (si el valor es { items: [...] } y el servidor responde "0.name")
  // validate: (v) => ({ "ruta": "mensaje" }) validación extra antes de enviar · guard: false · onSaved(resultado, form)
});
```

Qué hace `form.submit()` (lo llaman la barra, Ctrl/Cmd+S y `form.actions()`):
1. Valida en el navegador (obligatorio, longitudes en caracteres como el servidor, rangos, URLs, hex…) y marca los campos.
2. Muestra “Guardando…”, llama a `onSubmit` y con lo que devuelva hace `form.reset(valor)` (queda “limpio”) + aviso.
3. **422** → cada mensaje de `fields` en su campo (si no hay campo con esa ruta exacta, en el “padre” más cercano:
   `colors.0.stock.S` → `colors.0` → `colors`); foco y scroll al primero, abriendo pestañas o ítems plegados.
   Las rutas sin ningún campo se muestran en un aviso.
4. **409 conflict** (otra persona guardó) → diálogo **Recargar** / **Sobrescribir** (`onSubmit(v, { force: true })`) / Seguir editando.
5. **409 con fields** (id/código/correo repetido) → en el campo. **in_use** y demás → `showApiError`.

API del Form: `form.get("hero.title")`, `form.set("hero.title", v)`, `form.update("tags", (l) => [...l, "x"])`, `form.dirty`,
`form.reset(v)`, `form.discard()`, `form.on("change" | "dirty" | "state" | "saved", fn)`, `form.setErrors({ ruta: msg })`,
`form.clearErrors()`, `form.submit({ force })`, `form.handleError(e)`, `form.actions({ saveLabel, showDiscard })`,
`form.element(...campos)` (envuelve en `<form>`: Enter en un campo de una línea = guardar). Al cambiar un valor con `form.set`,
los campos de esa ruta (y de sus hijos) se redibujan solos.

Errores (`form.setErrors`, también los del navegador y los 422): se marcan TODOS los campos, se abren todos los ítems
plegados y `<details>` que esconden alguno, se abre la pestaña del primero y el foco va al primero (en el orden de la
página). Las otras pestañas con errores quedan marcadas.

**Controles propios con `form.register(entry)`** (cuando un `fields.*` no sirve, p. ej. una grilla de stock por talla):

```js
const off = form.register({
  path: "colors.0.stock.S",          // los errores con esta ruta (o sus hijas) caen aquí
  el: celda,                          // contenedor: si sale del documento, el Form lo olvida solo
  sync: () => { input.value = form.get("colors.0.stock.S") ?? ""; },   // el valor cambió desde fuera (reset, descartar…)
  setError: (msg) => { celda.classList.toggle("has-error", !!msg); err.textContent = msg || ""; input.setAttribute("aria-invalid", msg ? "true" : "false"); },
  focus: () => input.focus(),
  validate: () => (form.get("colors.0.stock.S") < 0 ? "No puede ser negativo." : null),   // opcional
  childChanged: (ruta) => {},                                                             // opcional
});
input.addEventListener("input", () => form.set("colors.0.stock.S", Number(input.value), { source: entrada }));  // source = no te llames a ti mismo
// off() lo suelta (p. ej. antes de redibujar la grilla)
```

### Campos — `fields.*(form, ruta, opciones)` → elemento `.field`

Opciones comunes: `label`, `help`, `placeholder`, `required` (+ `requiredMessage`), `maxlength` (con contador), `recommended`
(aviso suave en el contador), `minlength`, `pattern` + `patternMessage`, `validate: (v, form) => "mensaje" | null`, `disabled`,
`onChange: (v, form)`, `width: "sm" | "md"`, `optional: true` (muestra “(opcional)”).
`required` también puede ser una función `(form) => bool` (obligatorio según otro campo): el asterisco y `aria-required`
se actualizan solos, p. ej. `f.media(form, "hero.media.poster", { required: (fm) => fm.get("hero.media.type") === "video" })`.

| Campo | Valor | Opciones propias |
|---|---|---|
| `f.text` | string | `type` (text/email/tel), `inputmode`, `autocomplete`, `transform: (v) => v.toUpperCase()`, `prefix`, `suffix` |
| `f.textarea` | string | `rows`; crece solo con el contenido |
| `f.password` | string | `autocomplete` (`current-password` / `new-password`); botón mostrar/ocultar |
| `f.number` | number \| null | `min`, `max`, `step`, `integer` (true), `nullable`, `prefix`, `suffix` |
| `f.money` | entero COP \| null | `min`, `max`; muestra `$` y miles (`89.900`) |
| `f.select` | valor de la opción | `options: [{ value, label, disabled }]` o `() => […]`, `emptyLabel: "Sin colección"` (opción vacía = `""`) |
| `f.checkbox` / `f.switch` | boolean | `description` (texto bajo la etiqueta), `invert` |
| `f.radio` / `f.segmented` | valor | `options: [{ value, label, help, icon }]` |
| `f.chips` (= `f.multiselect`) | array | `options: [{ value, label, color }]`, `max`, `search`, `missingLabel(v)`; orden = el de las opciones. Un valor que ya no está en las opciones se muestra como chip «… (ya no existe)» que se quita al tocarlo |
| `f.tags` | array de strings | `max` + `maxMessage` (“Máximo 12 tallas.”), `maxlength` por etiqueta, `lowercase`, `suggestions`; Enter/coma agregan, Retroceso borra |
| `f.color` | `"#bb3f17"` | selector nativo + hex + muestra; guarda en minúsculas |
| `f.date` | `"AAAA-MM-DD"` \| null | `min`, `max`, `clearable` |
| `f.url` | string | `kind: "link" | "media" | "external"` (reglas del contrato §2); botón para abrir |
| `f.accentTitle` | string | `multiline` (cada Enter = línea), `discount: true` (`{descuento}`), `discountLabel: "15%"` o `(form) => etiqueta` (la vista previa sigue en vivo, p. ej. al cupón elegido; `""` muestra `{descuento}`); vista previa con la tipografía de la tienda y botón “Cursiva de marca” |
| `f.list` | array | ver abajo |
| `f.media` | url string | `kind: "image" | "video"`, `previewBg: "checker" | "dark" | "light"`, `onChange(url, item, form)`, `required` (o función), `validate(url, form)` (se llama siempre, también vacío con `""`) |
| `f.photos` | `[{ src, thumb, alt, zoom, ox, oy }]` | `max` (4) — fotos de un color de producto |
| `f.custom` | lo que sea | `create: ({ value, onChange, id, describedBy, labelId }) => ({ el, setValue(v), focus?(), control? })`, `group` (ver abajo) |
| `f.row(a, b, c, { cols: 3 })` | — | fila de campos (se apila en móvil) |
| `f.readonly("Rol", valor)` | — | dato de solo lectura con apariencia de campo |

```js
el.append(h("div.page.page--form",
  pageHeader({ title: "Inicio", breadcrumbs: [{ label: "Contenido" }] }),
  section({ title: "Portada", description: "Video de fondo, título y botón.", body: [
    f.segmented(form, "hero.media.type", { label: "Fondo", options: [{ value: "video", label: "Video" }, { value: "image", label: "Imagen" }, { value: "none", label: "Ninguno" }] }),
    f.media(form, "hero.media.src", { label: "Video", kind: "video", required: true,
      onChange: (url, item, form) => { if (item?.thumbUrl && !form.get("hero.media.poster")) form.set("hero.media.poster", item.thumbUrl); } }),
    f.media(form, "hero.media.poster", { label: "Imagen mientras carga (póster)", kind: "image" }),
    f.accentTitle(form, "hero.title", { label: "Título", multiline: true, required: true }),
    f.textarea(form, "hero.subtitle", { label: "Subtítulo", maxlength: 2000 }),
    f.row(f.text(form, "hero.ctaLabel", { label: "Texto del botón", maxlength: 40 }), f.url(form, "hero.ctaHref", { label: "Enlace del botón", kind: "link" })),
  ] }),
  section({ title: "Franja en movimiento", body: f.list(form, "marquee", {
    label: "Frases", min: 1, max: 10, addLabel: "Agregar frase", newItem: () => ({ icon: "star", text: "" }),
    itemLabel: (it, i) => it?.text || `Frase ${i + 1}`,
    renderItem: (p) => f.row(f.select(form, `${p}.icon`, { label: "Ícono", options: ICONOS }), f.text(form, `${p}.text`, { label: "Texto", required: true, maxlength: 80 })),
  }) }),
));
```

**Campo propio** `f.custom`: pon `id` en el control enfocable (el `<label>` apunta a él) y `describedBy` en su
`aria-describedby`. `aria-invalid` / `aria-required` van al control real: `control` si lo devuelves; si no, `el` cuando es
un control o tiene `role`, o su primer `input/select/textarea`. Con `group: true` la etiqueta es una `<legend>` con id
`labelId`: úsalo como `aria-labelledby` de tu grupo (si el control tiene `role` y no tiene nombre, se pone solo).

**Lista repetible** `f.list(form, ruta, { label, help, min, max, addLabel, newItem, renderItem, itemLabel, sortable = true,
collapsible = false, confirmRemove = false | "¿Quitar…?", emptyText, initiallyOpen, itemMeta, beforeRemove })`: agregar,
quitar, subir/bajar (botones con nombre accesible) y arrastrar por el asa (en pantallas táctiles y en ≤ 720 px el asa se
oculta: quedan las flechas, con áreas táctiles de 44 px y «Quitar» separado). Para los textos de ayuda usa `sortHint()` /
`canDrag()` (ui.js): en esos dispositivos no se debe pedir «arrastra». `renderItem(rutaDelÍtem, índice, ítem, api)` usa rutas completas (`` `${p}.text` ``);
`api = { index, remove(), moveUp(), moveDown(), toggle(), open(), close() }`. Con `collapsible: true` cada ítem es un
acordeón con título `itemLabel` (útil para reseñas, categorías, colores de producto). Los títulos se actualizan al escribir
sin perder el foco, y al guardar (Ctrl/Cmd+S) o descartar el foco vuelve al campo que estabas editando.

```js
f.list(form, "items", {
  collapsible: true,
  initiallyOpen: (it, i) => i === 0,                       // qué ítems empiezan abiertos (por defecto, ninguno)
  itemMeta: (it, i) => h("span", badge(it._new ? "Nueva" : `${n} productos`)),   // insignias en la cabecera
  beforeRemove: async (it, i) => {                          // false = no se quita (p. ej. está en uso)
    if (usado(it)) { blockedDialog({ … }); return false; }
    return confirmDialog({ title: `¿Eliminar «${it.name}»?`, danger: true });
  },
  …
});
```
`itemMeta` se vuelve a llamar cuando cambia algo dentro de la lista (recibe el ítem actual: construye el nodo con lo que
traiga, sin registros propios). En ítems no plegables las insignias van junto a los botones. `beforeRemove` va antes de
`confirmRemove` (si usas tu propio diálogo, deja `confirmRemove: false`).

---

## 9. Medios — `core/media.js`

```js
import { subirArchivo, openMediaPicker, mediaField, photoListField, mediaApi, mediaThumb, checkFile, MEDIA_LIMITS, ACCEPT } from "../core/media.js";

const item = await subirArchivo(file, { kind: "image", onProgress: ({ phase, fraction }) => … });  // phase: processing | uploading | thumb
// item = { id, kind, mime, url: "/uploads/2026/10/m-…-foto.webp", thumbUrl, width, height, bytes, name, alt, createdAt, createdBy }
const elegidos = await openMediaPicker({ kind: "image", multiple: true, max: 4, title: "Agregar fotos" });   // item[] | null
const items = await mediaApi.list({ kind: "video", q: "hero" });
const { item: m, usages } = await mediaApi.get(id);            // usages: ["products/fe", "home.hero"] → describeUsage(u) en ui.js
await mediaApi.update(id, { name, alt });
await mediaApi.remove(id);                                     // 409 in_use → showApiError(e) · { force: true } borra igual
```

- `subirArchivo`: valida tipo/tamaño antes de subir (SVG y HEIC rechazados con mensaje claro); imágenes de más de 2000 px se
  reducen a 2000 px y se codifican WebP 0,85 (si el navegador no codifica WebP: JPEG/PNG); las JPEG/PNG pesadas que ya caben
  se pasan a WebP solo si ahorra peso; GIF tal cual. Miniatura WebP de 600 px de ancho (PUT `/thumb`). Videos tal cual con
  progreso y miniatura de un fotograma cuando el navegador puede leerlo. Envía `X-Media-Width/Height` con la orientación EXIF ya
  aplicada. Límites: `MEDIA_LIMITS` (imagen 12 MB tras optimizar, 40 MB de entrada; video 150 MB).
- `openMediaPicker`: grilla con búsqueda, filtro por tipo (`kind: "all"`), subir con botón o **arrastrando archivos**, doble
  clic para elegir (modo simple) y “Usar una URL externa” (devuelve `{ id: null, url, external: true }`).
- `mediaField({ kind, value, onChange: (url, item|null) => … , previewBg })` → elemento con `.setValue(url)`; vista previa,
  **Elegir · Subir · Pegar URL · Quitar** y soltar un archivo sobre la vista previa. En formularios usa `f.media(…)`.
- `photoListField({ max: 4, value, onChange })` → elemento con `.setValue(lista)`; miniaturas ordenables (arrastrar o flechas),
  “Principal” en la primera, editar texto alternativo y encuadre (`zoom` 1–3, `ox`/`oy` en %), agregar varias desde la biblioteca,
  el equipo o una URL, y tope de 4 con mensaje. En formularios usa `f.photos(form, \`colors.${i}.photos\`, { max: 4 })`.
- `mediaThumb(itemOUrl, { width })` → `<img>` (o `<video>` sin miniatura) para listas y grillas propias.
- Fotos de `images.pexels.com` (pueden pesar varios MB): `pexelsSized(url, ancho)` → `…?auto=compress&cs=tinysrgb&w=ancho`
  (otras URLs: `siteUrl(url)`). El núcleo ya lo usa: miniaturas 300 px (`mediaThumb`, fotos de un color), vista previa de
  `f.media` 600 px y editor de encuadre 1200 px (`PEXELS_SIZES`). El valor guardado sigue siendo la URL original.

---

## 10. Formatos — `core/format.js`

`money(89900)` → `$89.900` · `number(1234.5, 1)` → `1.234,5` · `bytes(1536)` → `1,5 KB` · `plural(3, "producto", "productos")` ·
`date("2026-10-09")` → `9 oct 2026` (`{ long: true }` → `9 de octubre de 2026`) · `dateTime(iso)` → `9 oct 2026, 3:45 p. m.` ·
`relativeTime(iso)` → `hace 5 min` / `ayer` · `todayCO()` → `AAAA-MM-DD` (hora de Colombia) · `slugify("Camiseta Fé")` →
`camiseta-fe` · `SLUG_RE`, `HEX_RE` · `fold(s)` (minúsculas sin tildes) · `escapeHtml` · `truncate` · `initials` · `charCount`
(como cuenta el servidor) · `debounce(fn, ms)` · `clone` · `deepEqual` · `getPath(obj, "a.0.b")` / `setPath` · `isSafeUrl(url,
kind)` y `URL_MESSAGES` (mismas reglas que el servidor) · `siteUrl(u)` (convierte `assets/…` en `/assets/…` para verla desde el
panel) · `fileNameOf(url)`.

---

## 11. Patrones recomendados

### A. Editar una sección (inicio, textos, modal…)
```js
async render(el, params, ctx) {
  const form = createForm({ ctx, value: await content.section("texts"), onSubmit: (v, { force }) => content.saveSection("texts", v, { force }) });
  el.append(h("div.page.page--form", pageHeader({ title: "Textos del sitio", breadcrumbs: [{ label: "Contenido" }] }), section({ … })));
}
```
Envía SIEMPRE la sección completa (el servidor descarta claves desconocidas y devuelve el valor normalizado).

### B. Secciones que son listas (colores, hormas, categorías, colecciones, guía de tallas, reseñas)
El valor de la sección es un array; envuélvelo para que el Form tenga un objeto raíz y traduce las rutas de error con `errorPrefix`:
```js
const form = createForm({ ctx, value: { items: await content.section("colors") }, errorPrefix: "items",
  onSubmit: async (v, { force }) => ({ items: await content.saveSection("colors", v.items, { force }) }) });
el.append(f.list(form, "items", { … renderItem: (p) => f.row(f.text(form, `${p}.name`, …), f.text(form, `${p}.id`, …), f.color(form, `${p}.hex`, …)) }));
```
Quitar un elemento en uso responde **409 `in_use`** con `usages`/`products`: el Form ya muestra el diálogo con enlaces a los
productos. Ids nuevos: `slugify(nombre)` (y deja editar el id solo mientras el elemento es nuevo).

### C. Lista → editor (productos, cupones, usuarios)
- Lista: `dataTable` con `stateKey`, `rowHref` y acciones; borrar con `confirmDialog` + `withBusy` + `showApiError`; después
  `table.setRows(…)` y `toast("Producto eliminado.")`.
- Editor `#/x/nuevo` y `#/x/:id` con la MISMA función: `const value = id ? await content.product(id) : nuevoProducto()`.
  ```js
  onSubmit: async (v, { force }) => {
    const item = id ? await content.updateProduct(id, v, { force }) : await content.createProduct(v);
    if (!id || item.id !== id) setTimeout(() => ctx.navigate(`/productos/${encodeURIComponent(item.id)}`, { replace: true, force: true }));
    return item;
  },
  ```
  (`force: true` porque el formulario ya quedó guardado; `replace` para no dejar `/nuevo` en el historial.)
- `ctx.setTitle(value.name)` para que la pestaña muestre el nombre. Acciones del encabezado: Duplicar, Ver en la tienda
  (`../producto.html?id=…`, nueva pestaña), Eliminar (menú “⋯”).

### D. Permisos dentro de una vista
`roles` en la ruta controla el acceso completo. Para partes (p. ej. el cupón de bienvenida en `#/descuento`, solo admin):
`session.can("admin") ? f.select(form, "couponCode", …) : notice({ message: "El cupón lo elige un administrador." })`.
El servidor conserva `couponCode` si lo envía un editor, así que no hace falta quitarlo del valor.

### E. Errores fuera de un Form
```js
try { await withBusy(btn, () => api.del(url)); toast("Eliminado."); } catch (e) { showApiError(e); }
```

### F. Estilos útiles (admin.css)
`.page` `.page--form` `.page--narrow` · `.stack` `.stack-sm` `.stack-lg` (rejilla vertical) · `.cluster` (fila con wrap) ·
`.grid-2` `.grid-3` · `.form-row` (`--2/--3/--4`) · `.muted` `.small` `.mono` `.nowrap` · `.kv` (`<dl>` clave/valor) · `.stats` ·
`.sr-only`. Colores: variables `--c-accent`, `--c-muted`, `--c-border`, `--c-success|warning|danger|info` (+ `-bg`). Si tu vista
necesita estilos propios, agrégalos al FINAL de `admin.css` en un bloque con encabezado `/* Vista: productos */` (prefijo de
clase propio, p. ej. `.pe-…`) para no chocar con otras vistas.

### G. No hagas
- Tocar el DOM interno de los componentes (`select[aria-label=…]` de una tabla, clics simulados en encabezados, insertar
  nodos en la cabecera de un ítem, interceptar el botón “Quitar”): usa `table.setFilter/setSort/setState`,
  `onStateChange`, `tabs().setBadge`, `itemMeta`, `beforeRemove`, `initiallyOpen`. Si falta un gancho, pídelo en el núcleo.
- Cargar fuentes o estilos externos desde una vista (las de la tienda ya las carga `index.html`).
- `innerHTML` con datos del contenido (usa `h()`; para vistas previas de títulos usa `renderRich()`).
- Atributos `on*` en HTML, `<script>` en línea, `fetch` a otros dominios.
- Más de una barra de guardado por página (los demás formularios con `saveBar: false` + `form.actions()`).
- Modificar `content.data` en sitio o cambiar rutas/roles del contrato.
