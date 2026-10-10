/* ==========================================================================
   Mercy Studio · Panel — views/activity.js
   Actividad (#/actividad, solo administrador): registro de lo que hizo cada persona del equipo
   (GET /api/admin/activity?limit=&before=&entity=&userId= → { items, next }).
   · Línea de tiempo agrupada por día («Hoy», «Ayer», «7 oct. 2026») con hora exacta y relativa, persona,
     acción con ícono y enlace a lo que cambió mientras todavía exista (producto, cupón, sección, usuario, medio…).
   · Filtros por tipo y por persona (quedan en la URL: #/actividad?tipo=product&persona=<id>).
   · Paginación «Cargar más» con before = next.
   Exporta dayKey / dayLabel / weekdayOf / timeOf / groupByDay (revisions.js los usa para agrupar por día).
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api, isAbort, withQuery } from "../core/api.js";
import { content } from "../core/store.js";
import { badge, button, card, emptyState, errorState, pageHeader, showApiError, withBusy } from "../core/ui.js";
import { TZ, dateTime, initials, plural, relativeTime, todayCO } from "../core/format.js";

const LIMIT = 50;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/* ---------- Fechas por día (hora de Colombia) ---------- */
/** ISO → "AAAA-MM-DD" del día en Colombia. */
export const dayKey = (iso) => todayCO(new Date(iso).getTime());

/** "AAAA-MM-DD" → "Hoy" · "Ayer" · "7 oct. 2026" */
export function dayLabel(key, now = Date.now()) {
  if (key === todayCO(now)) return "Hoy";
  if (key === todayCO(now - 86400000)) return "Ayer";
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MESES[m - 1]}. ${y}`;
}

/** "AAAA-MM-DD" → "jueves" (o "jueves, 9 oct." con { withDate: true }) */
export function weekdayOf(key, { withDate = false } = {}) {
  const [y, m, d] = key.split("-").map(Number);
  const day = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return withDate ? `${day}, ${d} ${MESES[m - 1]}.` : day;
}

/** ISO → "3:45 p. m." (hora de Colombia) */
export function timeOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) parts[p.type] = p.value;
  const hr = Number(parts.hour) % 24;
  return `${hr % 12 === 0 ? 12 : hr % 12}:${parts.minute} ${hr < 12 ? "a. m." : "p. m."}`;
}

/** Agrupa una lista (más reciente primero) por día → [{ key, label, items }] */
export function groupByDay(list, at = (x) => x.at) {
  const groups = [];
  let cur = null;
  for (const x of list) {
    const k = dayKey(at(x));
    if (!cur || cur.key !== k) { cur = { key: k, label: dayLabel(k), items: [] }; groups.push(cur); }
    cur.items.push(x);
  }
  return groups;
}

/** Encabezado de un día: «Hoy» + «jueves, 9 oct.» · «7 oct. 2026» + «miércoles». */
export function dayHeading(key, tag = "h2", { count } = {}) {
  const label = dayLabel(key);
  const sub = label === "Hoy" || label === "Ayer" ? weekdayOf(key, { withDate: true }) : weekdayOf(key);
  return h(`${tag}.act-day__title`, h("span.act-day__label", label), h("span.act-day__sub", sub), count ? h("span.act-day__count", count) : null);
}

/* ---------- Catálogo de acciones y entidades ---------- */
const ACTIONS = {
  create: { icon: "plus", tone: "success", label: "Creación" },
  update: { icon: "edit", tone: "info", label: "Edición" },
  delete: { icon: "trash", tone: "danger", label: "Eliminación" },
  restore: { icon: "history", tone: "accent", label: "Restauración" },
  upload: { icon: "upload", tone: "accent", label: "Subida de archivo" },
  login: { icon: "user", tone: "neutral", label: "Ingreso al panel" },
  logout: { icon: "logout", tone: "neutral", label: "Salida del panel" },
  password: { icon: "key", tone: "warning", label: "Cambio de contraseña" },
};
const ENTITIES = [
  { value: "", label: "Todo" },
  { value: "product", label: "Productos" },
  { value: "section", label: "Contenido del sitio" },
  { value: "coupon", label: "Cupones" },
  { value: "media", label: "Medios" },
  { value: "user", label: "Usuarios" },
  { value: "revision", label: "Restauraciones" },
  { value: "subscriber", label: "Suscriptores" },
  { value: "session", label: "Ingresos y salidas" },
];
const ENTITY_BADGE = {
  product: "Producto", section: "Contenido", coupon: "Cupón", media: "Medio", user: "Usuario",
  revision: "Revisión", subscriber: "Suscriptor", session: "Sesión",
};
const SECTION_HREF = {
  settings: "#/ajustes", home: "#/inicio", discountModal: "#/descuento", texts: "#/textos", colors: "#/colores", fits: "#/hormas",
  categories: "#/categorias", collections: "#/colecciones", sizeCharts: "#/tallas", reviews: "#/resenas",
};
const enc = encodeURIComponent;

export default [
  {
    path: "/actividad",
    title: "Actividad",
    roles: ["admin"],
    async render(el, params, ctx) {
      const tipo = ctx.query.get("tipo") || "";
      const st = {
        entity: ENTITIES.some((x) => x.value === tipo) ? tipo : "",
        userId: ctx.query.get("persona") || "",
        items: [],
        next: null,
      };

      // Lo que existe hoy (para enlazar solo a lo que se puede abrir). Si algo falla, se enlaza igual.
      const refs = { users: null, products: null, coupons: null, media: null };
      const refsReady = Promise.allSettled([
        api.get("/api/admin/users", { signal: ctx.signal }).then((r) => { refs.users = r.items || []; }),
        content.load().then((d) => { refs.products = new Set((d.products || []).map((p) => p.id)); }),
        api.get("/api/admin/coupons", { signal: ctx.signal }).then((r) => { refs.coupons = new Set((r.items || []).map((c) => c.id)); }),
        api.get("/api/admin/media", { signal: ctx.signal }).then((r) => { refs.media = new Set((r.items || []).map((m) => m.id)); }),
      ]);
      const url = (before) => withQuery("/api/admin/activity", { limit: LIMIT, before, entity: st.entity, userId: st.userId });
      const [first] = await Promise.all([api.get(url(), { signal: ctx.signal }), refsReady]);
      st.items = first.items || [];
      st.next = first.next || null;

      const has = (set, id) => (set ? set.has(id) : true);
      function hrefOf(e) {
        const id = e.entityId;
        if (!id) return null;
        switch (e.entity) {
          case "product": return e.action !== "delete" && has(refs.products, id) ? `#/productos/${enc(id)}` : null;
          case "coupon": return e.action !== "delete" && has(refs.coupons, id) ? `#/cupones/${enc(id)}` : null;
          case "section": return SECTION_HREF[id] || null;
          case "user": return e.action !== "delete" && (!refs.users || refs.users.some((u) => u.id === id)) ? "#/usuarios" : null;
          case "media": return e.action !== "delete" && has(refs.media, id) ? `#/medios?archivo=${enc(id)}` : null;
          case "revision": return `#/revisiones?id=${enc(id)}`;
          default: return null;
        }
      }

      /* --- Filtros --- */
      const typeId = uid("act-t");
      const userId = uid("act-u");
      const typeSel = h("select.input.input--select", { id: typeId },
        ENTITIES.map((o) => h("option", { value: o.value, selected: o.value === st.entity }, o.label)));
      const userSel = h("select.input.input--select", { id: userId });
      function fillUsers() {
        const known = new Map((refs.users || []).map((u) => [u.id, { name: u.name, note: u.active === false ? " (desactivado)" : "" }]));
        for (const e of st.items) if (e.user?.id && !known.has(e.user.id)) known.set(e.user.id, { name: e.user.name || "Usuario", note: " (eliminado)" });
        if (st.userId && !known.has(st.userId)) known.set(st.userId, { name: "Persona filtrada", note: "" });
        const opts = [...known].sort((a, b) => a[1].name.localeCompare(b[1].name, "es"));
        replace(userSel,
          h("option", { value: "" }, "Todas las personas"),
          opts.map(([id, u]) => h("option", { value: id, selected: id === st.userId }, `${u.name}${u.note}`)));
      }
      fillUsers();
      const clearBtn = button({ label: "Quitar filtros", variant: "link", size: "sm", onClick: () => { typeSel.value = ""; userSel.value = ""; applyFilters(); typeSel.focus(); } });
      const refreshBtn = button({ label: "Actualizar", icon: "refresh", variant: "ghost", size: "sm", onClick: () => reloadFirst(refreshBtn) });
      typeSel.addEventListener("change", applyFilters);
      userSel.addEventListener("change", applyFilters);

      function applyFilters() {
        st.entity = typeSel.value;
        st.userId = userSel.value;
        ctx.setQuery({ tipo: st.entity || null, persona: st.userId || null });
        reloadFirst();
      }

      /* --- Lista --- */
      const listBox = h("div.act-days");
      const status = h("p.act-status", { "aria-live": "polite" });
      const moreBtn = button({ label: "Cargar más", icon: "chevron-down", variant: "secondary", onClick: () => loadMore() });
      const endNote = h("p.act-end", icon("check", { size: 15 }), h("span", "Llegaste al principio del registro."));
      const footer = h("div.act-foot", moreBtn, endNote);
      let req = 0;

      function entry(e) {
        const a = ACTIONS[e.action] || { icon: "activity", tone: "neutral", label: "Acción" };
        const href = hrefOf(e);
        const who = e.user?.name || "Sistema";
        const system = !e.user?.id;
        return h("li.act-item",
          h("time.act-item__time", { datetime: e.at, title: dateTime(e.at) }, timeOf(e.at)),
          h("span.act-item__icon", { class: `is-${a.tone}`, title: a.label }, icon(a.icon, { size: 15 }), h("span.sr-only", `${a.label}: `)),
          h("div.act-item__body",
            h("p.act-item__label", href ? h("a", { href }, e.label) : e.label),
            h("p.act-item__meta",
              h("span.act-avatar", { class: system && "is-system", "aria-hidden": "true" }, system ? icon("settings", { size: 11 }) : initials(who)),
              h("span.act-item__who", who),
              h("span.act-sep", { "aria-hidden": "true" }, "·"),
              h("span.act-item__clock", { "aria-hidden": "true" }, timeOf(e.at), h("span.act-sep", " · ")),
              h("time", { datetime: e.at, title: dateTime(e.at) }, relativeTime(e.at)),
              ENTITY_BADGE[e.entity] ? badge(ENTITY_BADGE[e.entity], "neutral") : null)));
      }

      function renderList() {
        const filtering = !!st.entity || !!st.userId;
        clearBtn.hidden = !filtering;
        if (!st.items.length) {
          footer.hidden = true;
          status.textContent = "";
          replace(listBox, filtering
            ? emptyState({ icon: "filter", title: "No hay actividad con estos filtros", message: "Prueba con otro tipo o con otra persona.", action: { label: "Quitar filtros", icon: "x", onClick: () => clearBtn.click() }, compact: true })
            : emptyState({ icon: "activity", title: "Aún no hay actividad", message: "Aquí verás los cambios que haga el equipo: productos, contenido, cupones, archivos e ingresos al panel.", compact: true }));
          return;
        }
        replace(listBox, groupByDay(st.items).map((g) => {
          const hid = uid("act-d");
          const head = dayHeading(g.key, "h2");
          head.id = hid;
          return h("section.act-day", { "aria-labelledby": hid }, head, h("ol.act-list", g.items.map(entry)));
        }));
        footer.hidden = false;
        moreBtn.hidden = !st.next;
        endNote.hidden = !!st.next;
        status.textContent = `Mostrando ${plural(st.items.length, "acción", "acciones")}${st.next ? "" : filtering ? " (todas las que coinciden)" : ""}.`;
      }

      async function reloadFirst(btn) {
        const my = ++req;
        listBox.setAttribute("aria-busy", "true");
        listBox.classList.add("is-loading");
        try {
          const r = await withBusy(btn, () => api.get(url(), { signal: ctx.signal }));
          if (my !== req) return;
          st.items = r.items || [];
          st.next = r.next || null;
          fillUsers();
          renderList();
          if (btn) status.textContent = `Actualizado. ${status.textContent}`;
        } catch (e) {
          if (my !== req || isAbort(e)) return;
          footer.hidden = true;
          replace(listBox, errorState({ error: e, title: "No se pudo cargar la actividad", onRetry: () => reloadFirst() }));
        } finally {
          if (my === req) { listBox.removeAttribute("aria-busy"); listBox.classList.remove("is-loading"); }
        }
      }

      async function loadMore() {
        if (!st.next) return;
        const my = req;
        try {
          const r = await withBusy(moreBtn, () => api.get(url(st.next), { signal: ctx.signal }), { label: "Cargando…" });
          if (my !== req) return;
          const fresh = (r.items || []).filter((x) => !st.items.some((y) => y.id === x.id));
          st.items = st.items.concat(fresh);
          st.next = r.next || null;
          fillUsers();
          renderList();
          status.textContent = `Se cargaron ${plural(fresh.length, "acción más", "acciones más")}. ${status.textContent}`;
          if (!st.next) endNote.focus?.();
        } catch (e) {
          showApiError(e);
        }
      }

      el.append(h("div.page.page--narrow.act",
        pageHeader({
          title: "Actividad",
          breadcrumbs: [{ label: "Sistema" }],
          subtitle: "Lo que hizo cada persona del equipo: cambios en productos y contenido, cupones, archivos, usuarios e ingresos al panel. Se guardan las últimas 5.000 acciones.",
          actions: [button({ label: "Revisiones del contenido", icon: "history", href: "#/revisiones" })],
        }),
        card({
          className: "act-card",
          body: [
            h("div.act-filters",
              h("div.act-filter", h("label.field__label", { for: typeId }, "Tipo"), typeSel),
              h("div.act-filter", h("label.field__label", { for: userId }, "Persona"), userSel),
              h("div.act-filters__end", clearBtn)),
            h("div.act-statusrow", status, refreshBtn),
            listBox,
            footer,
          ],
        })));
      endNote.setAttribute("tabindex", "-1");
      renderList();
    },
  },
];
