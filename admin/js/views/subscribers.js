/* ==========================================================================
   Mercy Studio · Panel — views/subscribers.js
   Suscriptores (#/suscriptores, solo administrador; contrato §3 "Suscriptores" y §4.3):
   correos que dejaron en el pop-up de descuento, la sección Comunidad del Inicio o el checkout.
   · Búsqueda en el servidor (GET /api/admin/subscribers?q=, con espera de 300 ms) que se recuerda en la URL.
   · Totales (todos, últimos 7 días, por origen), tabla ordenable, copiar correos visibles,
     exportar CSV (enlace directo a /api/admin/subscribers.csv?q=… con la cookie de sesión) y eliminar.
   · Aviso de privacidad: son datos personales (Ley 1581 de 2012); solo los administradores los ven.
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api, withQuery } from "../core/api.js";
import {
  badge, button, card, confirmDialog, dataTable, emptyState, notice, pageHeader, showApiError, spinner, statCard, toast,
} from "../core/ui.js";
import { date, dateTime, debounce, number, plural, relativeTime } from "../core/format.js";

const SOURCES = {
  popup: { label: "Pop-up", tone: "accent", hint: "Pop-up de descuento (Inicio y carrito)" },
  community: { label: "Comunidad", tone: "info", hint: "Sección «Comunidad» del Inicio" },
  checkout: { label: "Checkout", tone: "success", hint: "Formulario del checkout" },
};
const WEEK = 7 * 24 * 60 * 60 * 1000;
const CSV_URL = "/api/admin/subscribers.csv";

/** Copia al portapapeles (con respaldo para navegadores sin permiso). → true si se copió. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const host = document.querySelector("dialog[open]") || document.body;
    const ta = h("textarea", { style: "position:fixed;top:0;left:0;opacity:0;pointer-events:none", "aria-hidden": "true" });
    ta.value = text;
    host.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

const sourceBadge = (s) => {
  const src = SOURCES[s.source] || { label: s.source || "—", tone: "neutral", hint: "" };
  return badge(src.label, src.tone, { title: `Se registró por primera vez en: ${src.hint || src.label}` });
};

const when = (iso, rel = false) => (iso ? h("time.nowrap", { datetime: iso, title: dateTime(iso) }, rel ? relativeTime(iso) : date(iso)) : null);

export default [
  {
    path: "/suscriptores",
    title: "Suscriptores",
    roles: ["admin"],
    async render(el, params, ctx) {
      let q = (ctx.query.get("q") || "").trim();
      const first = await api.get(withQuery("/api/admin/subscribers", { q }), { signal: ctx.signal });
      let total = first.total;
      let rows = first.items;
      let seq = 0;

      /* --- Totales (siempre sobre todos los suscriptores) --- */
      const statsBox = h("div.stats.mk-stats");
      let everyone = q ? null : rows;
      const renderStats = async () => {
        if (!everyone) {
          try { everyone = (await api.get("/api/admin/subscribers", { signal: ctx.signal })).items; } catch { everyone = []; }
        }
        const since = Date.now() - WEEK;
        const by = { popup: 0, community: 0, checkout: 0 };
        for (const s of everyone) if (s.source in by) by[s.source]++;
        replace(statsBox,
          statCard({ label: "Suscriptores", value: total, hint: "Correos únicos registrados", icon: "mail", tone: "accent" }),
          statCard({ label: "Últimos 7 días", value: everyone.filter((s) => Date.parse(s.createdAt) >= since).length, hint: "Nuevos esta semana", icon: "sparkle", tone: "success" }),
          statCard({ label: "Pop-up", value: by.popup, hint: "Pop-up de descuento", icon: "gift", tone: "neutral" }),
          statCard({ label: "Comunidad y checkout", value: by.community + by.checkout, hint: `${number(by.community)} comunidad · ${number(by.checkout)} checkout`, icon: "users", tone: "neutral" }));
      };

      /* --- Barra: búsqueda en el servidor, conteo, copiar, exportar --- */
      const search = h("input.input.input--search", { id: "mk-sub-q", type: "search", value: q, placeholder: "Buscar por correo o cupón…", autocomplete: "off", "aria-controls": "mk-sub-list" });
      const searching = h("span.mk-sub__spin", { hidden: true }, spinner("Buscando…"));
      const countEl = h("p.mk-sub__count", { "aria-live": "polite" });
      const csvBtn = button({ label: "Exportar CSV", icon: "download", size: "sm", href: CSV_URL, attrs: { download: "" } });
      const copyBtn = button({ label: "Copiar correos", icon: "copy", size: "sm", onClick: () => copyVisible() });
      const listBox = h("div.mk-sub__list", { id: "mk-sub-list" });

      const table = dataTable({
        caption: "Suscriptores",
        stateKey: "suscriptores",
        search: false,
        pageSize: 50,
        rowKey: (s) => s.id,
        sort: { key: "updatedAt", dir: "desc" },
        columns: [
          {
            key: "email", label: "Correo", sortable: true, className: "mk-sub__email-cell",
            render: (s) => h("div.mk-sub__cell", h("span.mk-sub__email", s.email), h("div.mk-only-mobile.mk-cell-sub", sourceBadge(s), when(s.updatedAt, true))),
          },
          { key: "source", label: "Origen", sortable: true, render: sourceBadge, value: (s) => SOURCES[s.source]?.label || s.source, hideOn: "mobile" },
          { key: "couponCode", label: "Cupón entregado", sortable: true, render: (s) => (s.couponCode ? h("code.mk-sub__code", { title: "Código que recibió al registrarse" }, s.couponCode) : h("span.muted", { title: "No había cupón de bienvenida vigente" }, "Ninguno")), hideOn: "mobile" },
          { key: "count", label: "Registros", sortable: true, align: "end", render: (s) => h("span", { title: s.count > 1 ? `Dejó su correo ${s.count} veces` : "Se registró una vez" }, number(s.count || 1)), value: (s) => s.count || 1, hideOn: "mobile" },
          { key: "createdAt", label: "Primera vez", sortable: true, render: (s) => when(s.createdAt), hideOn: "mobile" },
          { key: "updatedAt", label: "Última vez", sortable: true, render: (s) => when(s.updatedAt, true), hideOn: "mobile" },
        ],
        rows,
        rowActions: (s) => [
          { label: "Copiar correo", icon: "copy", onClick: async () => { if (await copyText(s.email)) toast("Correo copiado."); else toast("No se pudo copiar el correo.", { type: "warning" }); } },
          { divider: true },
          { label: "Eliminar", icon: "trash", danger: true, onClick: () => remove(s) },
        ],
        empty: {
          icon: "mail",
          title: "Aún no hay suscriptores",
          message: "Cuando alguien deje su correo en el pop-up de descuento, en la sección Comunidad del Inicio o en el checkout, aparecerá aquí.",
          action: button({ label: "Ver tienda", icon: "external", href: "../", target: "_blank" }),
        },
      });

      const noResults = () => emptyState({
        icon: "search",
        title: `No hay suscriptores que coincidan con «${q}»`,
        message: "Revisa lo que escribiste. La búsqueda mira el correo y el código del cupón.",
        action: button({ label: "Limpiar búsqueda", variant: "secondary", onClick: () => { search.value = ""; run(""); search.focus(); } }),
        compact: true,
      });

      function renderList() {
        const showNoResults = !!q && !rows.length && total > 0;
        replace(listBox, showNoResults ? noResults() : table.el);
        table.setRows(rows);
        countEl.textContent = q
          ? `${plural(rows.length, "coincidencia", "coincidencias")} de ${plural(total, "suscriptor", "suscriptores")}`
          : plural(total, "suscriptor", "suscriptores");
        csvBtn.href = withQuery(CSV_URL, { q });
        csvBtn.title = q ? `Descarga los ${number(rows.length)} correos que coinciden con «${q}»` : "Descarga todos los suscriptores (UTF-8, se abre en Excel o Google Sheets)";
        const n = rows.length;
        copyBtn.querySelector(".btn__label").textContent = n ? `Copiar ${plural(n, "correo", "correos")}` : "Copiar correos";
        copyBtn.disabled = !n;
        if (n) csvBtn.removeAttribute("aria-disabled");
        else csvBtn.setAttribute("aria-disabled", "true");
      }

      async function run(next) {
        q = next.trim();
        ctx.setQuery({ q });
        const my = ++seq;
        searching.hidden = false;
        try {
          const r = await api.get(withQuery("/api/admin/subscribers", { q }), { signal: ctx.signal });
          if (my !== seq || !ctx.isCurrent) return;
          rows = r.items;
          total = r.total;
          renderList();
        } catch (e) {
          if (my !== seq) return;
          showApiError(e);
        } finally {
          if (my === seq) searching.hidden = true;
        }
      }
      const runLater = debounce((v) => run(v), 300);
      ctx.onCleanup(() => runLater.cancel());
      search.addEventListener("input", () => runLater(search.value));
      search.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runLater.cancel(); run(search.value); } });
      csvBtn.addEventListener("click", (e) => {
        if (!rows.length) { e.preventDefault(); return; }
        toast(q ? `Descargando ${plural(rows.length, "correo", "correos")} en CSV…` : "Descargando la lista completa en CSV…", { type: "info" });
      });

      async function copyVisible() {
        const emails = table.visibleRows.map((s) => s.email);
        if (!emails.length) return;
        if (await copyText(emails.join(", "))) toast(`${plural(emails.length, "correo copiado", "correos copiados")}. Pégalos en el campo «CCO» de tu correo.`, { title: "Listo" });
        else toast("No se pudieron copiar los correos. Usa «Exportar CSV».", { type: "warning" });
      }

      async function remove(s) {
        const ok = await confirmDialog({
          title: "¿Eliminar este suscriptor?",
          message: `${s.email} sale de la lista y ya no aparecerá en las exportaciones. Si vuelve a dejar su correo en la tienda, se registrará de nuevo.`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        try {
          await api.del(`/api/admin/subscribers/${encodeURIComponent(s.id)}`);
          rows = rows.filter((x) => x.id !== s.id);
          if (everyone) everyone = everyone.filter((x) => x.id !== s.id);
          total = Math.max(0, total - 1);
          renderList();
          renderStats();
          toast("Suscriptor eliminado.");
        } catch (e) {
          showApiError(e);
        }
      }

      renderList();
      await renderStats();

      el.append(h("div.page",
        pageHeader({
          title: "Suscriptores",
          breadcrumbs: [{ label: "Marketing" }],
          subtitle: "Correos que se registraron en el pop-up de descuento, la sección Comunidad del Inicio o el checkout.",
          actions: [button({ label: "Configurar el pop-up", icon: "gift", href: "#/descuento" })],
        }),
        notice({
          tone: "info",
          title: "Datos personales",
          message: "Solo los administradores ven esta lista. Úsala únicamente para enviar novedades de Mercy Studio a quienes aceptaron recibirlas, no la compartas y elimina a quien pida darse de baja (Ley 1581 de 2012, protección de datos).",
          className: "mk-privacy",
        }),
        statsBox,
        card({
          flush: true,
          body: [
            h("div.table-toolbar.mk-sub__bar",
              h("div.table-search", h("label.sr-only", { for: "mk-sub-q" }, "Buscar suscriptores"), icon("search", { size: 16, className: "table-search__icon" }), search),
              searching,
              countEl,
              h("div.table-toolbar__extra", copyBtn, csvBtn)),
            listBox,
          ],
        }),
        h("p.muted.small.mk-sub__foot", icon("info", { size: 14 }), "El CSV trae: correo, origen, cupón, veces que se registró y fechas (hora de Colombia). Si hay una búsqueda, exporta solo lo que coincide.")));
    },
  },
];
