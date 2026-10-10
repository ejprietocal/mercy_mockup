/* ==========================================================================
   Mercy Studio · Panel — views/reviews.js
   Reseñas (#/resenas): testimonios de clientes (sección "reviews", patrón B: { items } + errorPrefix "items").
   · Inicio: carrusel con la cita (quote) de cada reseña visible, en el orden de esta lista.
   · Ficha de producto: las 3 primeras reseñas visibles, con el texto largo (text).
   · Sin cita ni texto la tienda no muestra la reseña; sin reseñas visibles se oculta la sección.
   · El encabezado del Inicio (título, puntaje y cantidad) se edita en #/inicio.
   Estrellas: control accesible (radiogroup con flechas, Inicio/Fin y clic).
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { content } from "../core/store.js";
import { fields as f } from "../core/forms.js";
import { badge, button, card, confirmDialog, sortHint } from "../core/ui.js";
import { number, plural, truncate } from "../core/format.js";
import { STORE, header, listForm, liveRegistry, focusOnAdd } from "./taxonomies.js";

const PDP_COUNT = 3; // la ficha de producto muestra las 3 primeras visibles
const trim = (v) => String(v ?? "").trim();
const isShown = (r) => r && r.visible !== false && (trim(r.quote) || trim(r.text));

/** Control de 1 a 5 estrellas (para fields.custom con group: true; su nombre accesible es la <legend>). */
function starsControl({ value, onChange, id, describedBy, labelId }) {
  let cur = Math.min(5, Math.max(1, Math.round(Number(value) || 5)));
  const label = h("span.rv-stars__label", { "aria-hidden": "true" });
  const btns = [1, 2, 3, 4, 5].map((n) => {
    const b = h("button.rv-star", { type: "button", role: "radio", "aria-label": `${n} ${n === 1 ? "estrella" : "estrellas"}`, title: `${n} de 5` }, icon("star", { size: 24 }));
    b.addEventListener("click", () => set(n, true));
    b.addEventListener("pointerenter", () => paint(n));
    return b;
  });
  const group = h("div.rv-stars", { id, role: "radiogroup", "aria-labelledby": labelId || null, "aria-label": labelId ? null : "Estrellas", "aria-describedby": describedBy }, btns, label);
  group.addEventListener("pointerleave", () => paint());
  group.addEventListener("keydown", (e) => {
    const map = { ArrowRight: cur + 1, ArrowUp: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur - 1, Home: 1, End: 5 };
    if (!(e.key in map)) return;
    e.preventDefault();
    set(Math.min(5, Math.max(1, map[e.key])), true);
    btns[cur - 1].focus();
  });
  function paint(hover) {
    const show = hover || cur;
    btns.forEach((b, i) => {
      b.classList.toggle("is-on", i < show);
      b.classList.toggle("is-preview", !!hover && i < hover);
      b.setAttribute("aria-checked", String(i + 1 === cur));
      b.tabIndex = i + 1 === cur ? 0 : -1;
    });
    label.textContent = `${show} de 5`;
  }
  function set(n, user) {
    cur = n;
    paint();
    if (user) onChange(n);
  }
  paint();
  return { el: group, setValue(v) { cur = Math.min(5, Math.max(1, Math.round(Number(v) || 5))); paint(); }, focus: () => btns[cur - 1].focus() };
}

const starsText = (n) => "★".repeat(n) + "☆".repeat(5 - n);

export default [
  {
    path: "/resenas",
    title: "Reseñas",
    async render(el, params, ctx) {
      const data = await content.load({ force: true });
      const head = data.home?.reviews || {};
      const form = listForm(ctx, "reviews", await content.section("reviews"), { successMessage: "Reseñas guardadas. Ya se ven en la tienda." });
      const live = liveRegistry(form);

      const list = f.list(form, "items", {
        label: "Reseñas",
        className: "tx-list tx-list--cards",
        max: 60,
        collapsible: true,
        addLabel: "Agregar reseña",
        confirmRemove: false,
        emptyText: "Aún no hay reseñas. Sin reseñas visibles, la sección no aparece en el Inicio.",
        newItem: () => ({ id: "", name: "", city: "", stars: 5, quote: "", text: "", visible: true, _new: true }),
        itemLabel: (it, i) => (it?.name ? `${it.name}${it.city ? ` · ${it.city}` : ""}` : `Reseña ${i + 1}`),
        // Insignias de la cabecera (el núcleo las vuelve a pedir cuando cambia la reseña)
        itemMeta: (cur) => {
          const r = cur || {};
          return h("span.tx-head-meta",
            r._new ? badge("Nueva", "accent") : null,
            h("span.rv-mini-stars", { role: "img", "aria-label": `${r.stars || 5} de 5 estrellas` }, starsText(r.stars || 5)),
            r.visible === false ? badge("Oculta", "neutral", { dot: true }) : !trim(r.quote) && !trim(r.text) ? badge("Sin texto", "warning") : null);
        },
        beforeRemove: async (r) => {
          if (r?._new && !r.name && !trim(r.quote) && !trim(r.text)) return true;
          return confirmDialog({
            title: `¿Eliminar la reseña de «${r?.name || "sin nombre"}»?`,
            message: "Se eliminará cuando guardes los cambios. Si solo quieres que no se vea, apaga «Mostrar en la tienda».",
            confirmLabel: "Eliminar",
            danger: true,
          });
        },
        renderItem: (p) => {
          return h("div.rv-item",
            f.row(
              f.text(form, `${p}.name`, { label: "Nombre", required: true, maxlength: 60, placeholder: "Ej.: Laura M.", help: "Nombre y la inicial del apellido." }),
              f.text(form, `${p}.city`, { label: "Ciudad", optional: true, maxlength: 60, placeholder: "Ej.: Bogotá" }),
              { cols: 2 }),
            f.custom(form, `${p}.stars`, { label: "Estrellas", group: true, create: starsControl }),
            f.textarea(form, `${p}.quote`, {
              label: "Cita para el Inicio",
              maxlength: 300,
              recommended: 140,
              rows: 2,
              placeholder: "La calidad es increíble y el mensaje llega al corazón.",
              help: "Frase corta de la tarjeta del carrusel del Inicio. Si la dejas vacía, se usa el texto.",
              validate: (v, fm) => (!trim(v) && !trim(fm.get(`${p}.text`)) ? "Escribe la cita o el texto: sin ninguno de los dos, la reseña no se muestra." : null),
            }),
            f.textarea(form, `${p}.text`, {
              label: "Texto para la ficha de producto",
              optional: true,
              maxlength: 2000,
              rows: 3,
              placeholder: "Compré la Regular y me quedó perfecta…",
              help: `Se ve en «Reseñas verificadas» de la ficha de producto (las ${PDP_COUNT} primeras visibles). Si lo dejas vacío, se usa la cita.`,
            }),
            f.switch(form, `${p}.visible`, { label: "Mostrar en la tienda", help: "Apágalo para ocultarla sin borrarla." }));
        },
      });
      focusOnAdd(form, list, "items", "input[name$='.name']");

      /* --- Vista previa: tarjetas del Inicio --- */
      const pv = h("ol.rv-pv");
      const pvCount = h("p.rv-pv__count");
      live(pv, () => {
        const all = form.get("items") || [];
        const shown = all.filter(isShown);
        pvCount.textContent = all.length
          ? `${plural(shown.length, "reseña visible", "reseñas visibles")} de ${number(all.length)}.`
          : "";
        replace(pv, shown.length
          ? shown.map((r, i) => h("li.rv-card",
            h("div.rv-card__top",
              h("span.rv-card__stars", { role: "img", "aria-label": `${r.stars} de 5 estrellas` }, Array.from({ length: Math.min(5, Math.max(1, r.stars || 5)) }, () => icon("star", { size: 14 }))),
              i < PDP_COUNT ? h("span.rv-card__pdp", { title: "También se ve en la ficha de producto" }, "También en la ficha") : null),
            h("blockquote.rv-card__quote", `“${truncate(trim(r.quote) || trim(r.text), 160)}”`),
            h("div.rv-card__who",
              h("span.rv-card__avatar", { "aria-hidden": "true" }, (trim(r.name) || "C").charAt(0).toUpperCase()),
              h("span.rv-card__name", h("strong", trim(r.name) || "Cliente"), trim(r.city) ? h("span", trim(r.city)) : null))))
          : h("li.rv-pv__empty", icon("eye-off", { size: 16 }), "No hay reseñas visibles: la sección «Reseñas» no aparece en el Inicio ni en la ficha de producto."));
      });

      const score = Number(head.score) || 0;
      el.append(h("div.page",
        header({
          title: "Reseñas",
          subtitle: "Testimonios de clientes. Se ven en el carrusel del Inicio (con la cita) y en la ficha de producto (con el texto). El orden de la lista es el de la tienda.",
          actions: [button({ label: "Ver en la tienda", icon: "external", href: `${STORE}index.html#resenas`, target: "_blank" })],
          form,
          section: "reviews",
        }),
        h("div.tx-layout",
          h("div.tx-layout__main",
            card({ title: "Reseñas", description: `Abre una reseña para editarla. ${sortHint()}`, body: list })),
          h("aside.tx-layout__aside", { "aria-label": "Encabezado y vista previa" },
            card({
              title: "Encabezado en el Inicio",
              description: "Título, puntaje y cantidad de reseñas de la sección. Se editan en Inicio.",
              body: h("div.rv-head",
                h("p.rv-head__title", head.title || "Reseñas"),
                h("p.rv-head__score",
                  score ? h("span.rv-head__stars", { role: "img", "aria-label": `${Math.round(score)} de 5 estrellas` }, Array.from({ length: Math.round(score) }, () => icon("star", { size: 15 }))) : null,
                  h("span", [score ? number(score, 1) : "", Number(head.count) ? plural(Number(head.count), "reseña", "reseñas") : ""].filter(Boolean).join(" · ") || "Sin puntaje")),
                button({ label: "Editar en Inicio", icon: "edit", size: "sm", href: "#/inicio" })),
            }),
            card({
              title: "Así se ve en el Inicio",
              description: "Solo las visibles, en este orden. Se actualiza mientras editas.",
              body: [pvCount, pv],
            })))));
    },
  },
];
