/* ==========================================================================
   Mercy Studio · Panel — views/dashboard.js
   Escritorio (#/): resumen con GET /api/admin/stats, accesos rápidos según el rol,
   productos agotados o con poco stock, actividad reciente (admin) y enlace a la tienda.
   ========================================================================== */
import { h } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api, isAbort } from "../core/api.js";
import { content } from "../core/store.js";
import { session } from "../core/session.js";
import { button, card, emptyState, pageHeader, statCard, statusBadge } from "../core/ui.js";
import { TZ, bytes, dateTime, number, plural, relativeTime } from "../core/format.js";
import { pexelsSized } from "../core/media.js";

export const LOW_STOCK = 10; // igual que el servidor: 1–10 unidades = poco stock

const ACTION_ICON = { create: "plus", update: "edit", delete: "trash", restore: "history", login: "user", logout: "logout", upload: "upload", password: "key" };
const SECTION_HREF = {
  settings: "#/ajustes", home: "#/inicio", discountModal: "#/descuento", texts: "#/textos", colors: "#/colores", fits: "#/hormas",
  categories: "#/categorias", collections: "#/colecciones", sizeCharts: "#/tallas", reviews: "#/resenas",
};

export function productStock(p) {
  return (p.colors || []).reduce((s, c) => s + Object.values(c.stock || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
}

function emptySizes(p) {
  let n = 0;
  for (const c of p.colors || []) for (const v of Object.values(c.stock || {})) if (!(Number(v) > 0)) n++;
  return n;
}

function firstPhoto(p) {
  for (const c of p.colors || []) if (c.photos?.length) return c.photos[0].thumb || c.photos[0].src;
  return "";
}

function activityHref(e) {
  switch (e.entity) {
    case "product": return e.action === "delete" ? "#/productos" : `#/productos/${encodeURIComponent(e.entityId)}`;
    case "coupon": return e.action === "delete" ? "#/cupones" : `#/cupones/${encodeURIComponent(e.entityId)}`;
    case "user": return "#/usuarios";
    // Enlaces profundos, como en #/actividad: abren el archivo o la versión exacta
    case "media": return e.action === "delete" || !e.entityId ? "#/medios" : `#/medios?archivo=${encodeURIComponent(e.entityId)}`;
    case "section": return SECTION_HREF[e.entityId] || null;
    case "revision": return e.entityId ? `#/revisiones?id=${encodeURIComponent(e.entityId)}` : "#/revisiones";
    case "subscriber": return "#/suscriptores";
    default: return null;
  }
}

function greeting(name) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const part = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const first = String(name || "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function quickLinks() {
  const all = [
    { href: "#/inicio", icon: "video", title: "Cambiar el video del inicio", desc: "Video de fondo, título, frases de la franja y botón de compra." },
    { href: "#/productos/nuevo", icon: "shirt", title: "Crear un producto", desc: "Con colores, tallas, stock y hasta 4 fotos por color." },
    { href: "#/descuento", icon: "gift", title: "Editar el modal de descuento", desc: "Textos, imagen y cuándo aparece el pop-up." },
    { href: "#/cupones/nuevo", icon: "ticket", title: "Crear un cupón", desc: "Porcentaje o valor fijo, vigencia y límite de usos.", roles: ["admin"] },
    { href: "#/textos", icon: "text", title: "Textos del sitio", desc: "Franja superior, pie de página, envíos y cambios." },
    { href: "#/medios", icon: "upload", title: "Subir fotos o videos", desc: "Biblioteca de medios del sitio." },
    { href: "#/suscriptores", icon: "mail", title: "Ver suscriptores", desc: "Correos registrados y exportación a CSV.", roles: ["admin"] },
  ];
  return all.filter((l) => session.can(l.roles));
}

export default [
  {
    path: "/",
    title: "Escritorio",
    async render(el, params, ctx) {
      const [stats, data] = await Promise.all([
        api.get("/api/admin/stats", { signal: ctx.signal }),
        content.load({ force: true }),
      ]);
      const isAdmin = session.isAdmin;
      const ps = stats.products || {};

      /* --- Tarjetas --- */
      const cards = [
        statCard({ label: "Productos", value: ps.total, hint: `${number(ps.published)} publicados · ${number(ps.draft)} borradores`, icon: "shirt", tone: "accent", href: "#/productos" }),
        statCard({ label: "Agotados", value: ps.soldOut, hint: ps.soldOut ? "Sin unidades o marcados como agotados" : "Todos tienen existencias", icon: ps.soldOut ? "alert-circle" : "check-circle", tone: ps.soldOut ? "danger" : "success", href: "#/productos?estado=agotados" }),
        statCard({ label: "Poco stock", value: ps.lowStock, hint: `${LOW_STOCK} unidades o menos en total`, icon: "package", tone: ps.lowStock ? "warning" : "neutral", href: "#/productos?estado=poco-stock" }),
      ];
      if (isAdmin && stats.coupons) cards.push(statCard({ label: "Cupones vigentes", value: stats.coupons.active, hint: `de ${plural(stats.coupons.total, "cupón creado", "cupones creados")}`, icon: "ticket", tone: "info", href: "#/cupones" }));
      if (isAdmin && stats.subscribers) cards.push(statCard({ label: "Suscriptores", value: stats.subscribers.total, hint: `+${number(stats.subscribers.last7d)} en los últimos 7 días`, icon: "mail", tone: "success", href: "#/suscriptores" }));
      cards.push(statCard({ label: "Medios", value: stats.media?.total ?? 0, hint: stats.media?.total ? `${bytes(stats.media?.bytes || 0)} en archivos` : "Sin archivos todavía", icon: "image", tone: "neutral", href: "#/medios" }));

      /* --- Inventario por revisar --- */
      const watch = (data.products || [])
        .map((p) => ({ p, total: productStock(p), empty: emptySizes(p) }))
        .filter((x) => x.p.soldOut || x.total <= LOW_STOCK)
        .sort((a, b) => (b.p.soldOut || b.total === 0) - (a.p.soldOut || a.total === 0) || a.total - b.total);
      const stockBody = watch.length
        ? h("ul.stock-list", watch.slice(0, 7).map(({ p, total, empty }) => {
          const out = p.soldOut || total === 0;
          const photo = firstPhoto(p);
          return h("li", h("a.stock-item", { href: `#/productos/${encodeURIComponent(p.id)}` },
            h("span.stock-item__swatch", { style: photo ? null : { background: `linear-gradient(160deg, ${p.tile?.from || "#d8bea6"}, ${p.tile?.to || "#a76d4a"})` } },
              photo ? h("img", { src: pexelsSized(photo, 160), alt: "", loading: "lazy" }) : null),
            h("span.stock-item__text",
              h("span.stock-item__name", p.name),
              h("span.stock-item__meta", p.soldOut && total > 0 ? "Marcado como agotado" : `${plural(total, "unidad", "unidades")} en total${empty ? ` · ${plural(empty, "talla sin stock", "tallas sin stock")}` : ""}`)),
            p.status === "draft" ? statusBadge("draft") : null,
            statusBadge(out ? "soldout" : "low")));
        }))
        : emptyState({ icon: "check-circle", title: "El inventario está en orden", message: `Ningún producto está agotado ni tiene ${LOW_STOCK} unidades o menos.`, compact: true });

      const left = [
        card({
          title: "Inventario por revisar",
          description: "Productos agotados o con poco stock.",
          actions: button({ label: "Ver productos", variant: "ghost", size: "sm", iconRight: "arrow-right", href: "#/productos" }),
          body: stockBody,
        }),
      ];

      /* --- Actividad reciente (admin) --- */
      if (isAdmin) {
        // Los ingresos y salidas del panel no son cambios de la tienda: llenaban el feed («X inició sesión» ×10).
        // Siguen en #/actividad; aquí se piden más entradas solo si hizo falta descartar alguna.
        const recent = stats.recentActivity || [];
        let items = recent.filter((e) => e.entity !== "session");
        if (items.length < recent.length) {
          try {
            const r = await api.get("/api/admin/activity?limit=100", { signal: ctx.signal });
            items = (r.items || []).filter((e) => e.entity !== "session").slice(0, 10);
          } catch (e) {
            if (isAbort(e)) throw e; // sin la lista completa quedan las que ya había
          }
        }
        left.push(card({
          title: "Actividad reciente",
          description: "Los últimos cambios del equipo (los ingresos al panel están en «Actividad»).",
          actions: button({ label: "Ver toda la actividad", variant: "ghost", size: "sm", iconRight: "arrow-right", href: "#/actividad" }),
          body: items.length
            ? h("ul.feed", items.map((e) => {
              const href = activityHref(e);
              return h("li.feed__item",
                h("span.feed__icon", icon(ACTION_ICON[e.action] || "activity", { size: 15 })),
                h("div",
                  h("p.feed__label", href ? h("a", { href }, e.label) : e.label),
                  h("p.feed__meta", `${e.user?.name || "Sistema"} · `, h("time", { datetime: e.at, title: dateTime(e.at) }, relativeTime(e.at)))));
            }))
            : emptyState({ icon: "activity", title: "Aún no hay actividad", message: "Aquí verás los cambios que haga el equipo.", compact: true }),
        }));
      }

      /* --- Columna derecha --- */
      const right = [
        card({
          title: "Accesos rápidos",
          body: h("ul.quick-list", quickLinks().map((l) => h("li", h("a.quick-link", { href: l.href },
            h("span.quick-link__icon", icon(l.icon, { size: 18 })),
            h("span.quick-link__text", h("span.quick-link__title", l.title), h("span.quick-link__desc", l.desc)),
            icon("chevron-right", { size: 16, className: "quick-link__chev" }))))),
        }),
        card({
          title: "Tu tienda",
          body: [
            h("div.store-card",
              h("div.store-card__text",
                h("p", "Los cambios que guardas aquí se publican al instante para todos los visitantes."),
                data.meta?.updatedAt ? h("p.muted.small", "Último cambio de contenido: ", h("time", { datetime: data.meta.updatedAt, title: dateTime(data.meta.updatedAt) }, relativeTime(data.meta.updatedAt)), data.meta.updatedBy ? ` por ${data.meta.updatedBy}` : "") : null),
              button({ label: "Ver tienda", icon: "external", variant: "secondary", href: "../", target: "_blank" })),
            !isAdmin ? h("p.muted.small", "Tienes el rol Editor: puedes editar el contenido, los productos y los medios. Los cupones, suscriptores, usuarios y ajustes los gestiona un administrador.") : null,
          ],
        }),
      ];

      el.append(h("div.page",
        pageHeader({
          title: greeting(session.user?.name),
          subtitle: "Este es el resumen de Mercy Studio hoy.",
          actions: [
            button({ label: "Ver tienda", icon: "external", href: "../", target: "_blank" }),
            button({ label: "Nuevo producto", icon: "plus", variant: "primary", href: "#/productos/nuevo" }),
          ],
        }),
        h("div.stats", cards),
        h("div.dash-grid", h("div.dash-col", left), h("div.dash-col", right))));
    },
  },
];
