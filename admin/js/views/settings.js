/* ==========================================================================
   Mercy Studio · Panel — views/settings.js
   Ajustes generales (#/ajustes, solo administrador): marca, WhatsApp, redes sociales,
   logos (biblioteca de medios), SEO del Inicio y opciones de la tienda. Sección "settings".
   ========================================================================== */
import { h } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { content } from "../core/store.js";
import { createForm, fields as f } from "../core/forms.js";
import { button, pageHeader, section } from "../core/ui.js";
import { dateTime, relativeTime } from "../core/format.js";

const digits = (v) => String(v ?? "").replace(/\D/g, "");

export default [
  {
    path: "/ajustes",
    title: "Ajustes",
    roles: ["admin"],
    async render(el, params, ctx) {
      const value = await content.section("settings");
      const form = createForm({
        ctx,
        value,
        onSubmit: (v, { force }) => content.saveSection("settings", v, { force }),
      });

      /* --- Vista previa del enlace de WhatsApp --- */
      const waLink = button({ label: "Probar enlace", icon: "external", size: "sm", variant: "secondary", href: "#", target: "_blank" });
      const waCode = h("code");
      const updWa = () => {
        const url = `https://wa.me/${digits(form.get("whatsapp"))}${form.get("whatsappGreeting") ? `?text=${encodeURIComponent(form.get("whatsappGreeting"))}` : ""}`;
        waLink.href = url;
        waCode.textContent = `wa.me/${digits(form.get("whatsapp")) || "…"}`;
      };

      /* --- Vista previa en buscadores --- */
      const serpTitle = h("p.serp__title");
      const serpDesc = h("p.serp__desc");
      const updSerp = () => {
        serpTitle.textContent = form.get("seo.title") || form.get("brand") || "Mercy Studio";
        serpDesc.textContent = form.get("seo.description") || "Sin descripción: Google mostrará un fragmento de la página.";
      };
      form.on("change", () => { updWa(); updSerp(); });

      const meta = content.sectionMeta("settings");
      el.append(h("div.page.page--form",
        pageHeader({
          title: "Ajustes generales",
          breadcrumbs: [{ label: "Sistema" }],
          subtitle: meta?.updatedAt ? `Última modificación ${relativeTime(meta.updatedAt)}${meta.updatedBy ? ` por ${meta.updatedBy}` : ""} (${dateTime(meta.updatedAt)}).` : "Datos de la marca, contacto, logos y opciones de la tienda.",
        }),

        section({
          title: "Marca",
          description: "El nombre se usa en títulos, textos alternativos de los logos y mensajes.",
          body: f.text(form, "brand", { label: "Nombre de la marca", required: true, maxlength: 60 }),
        }),

        section({
          title: "WhatsApp",
          description: "Los pedidos y las consultas de la tienda se envían por WhatsApp a este número.",
          body: [
            f.row(
              f.text(form, "whatsapp", {
                label: "Número (con indicativo)", required: true, inputmode: "tel", autocomplete: "off", placeholder: "573001234567",
                help: "Solo números, con el indicativo del país. Ej.: 573001234567.",
                validate: (v) => (/^[\d\s+().-]*$/.test(String(v ?? "")) && /^\d{8,15}$/.test(digits(v)) ? null : "Escribe entre 8 y 15 dígitos, con el indicativo (57 para Colombia)."),
              }),
              f.text(form, "whatsappDisplay", { label: "Cómo se muestra", maxlength: 30, placeholder: "+57 300 000 0000", help: "Texto visible en la tienda." }),
            ),
            f.textarea(form, "whatsappGreeting", { label: "Saludo inicial del mensaje", maxlength: 300, rows: 2, help: "Con este texto empieza el mensaje que la persona envía desde la tienda." }),
            h("div.wa-preview", waCode, waLink),
          ],
        }),

        section({
          title: "Redes sociales",
          description: "Enlaces del pie de página y del menú. Deja vacío lo que no uses.",
          body: [
            f.url(form, "social.instagram", { label: "Instagram", kind: "external", placeholder: "https://www.instagram.com/…" }),
            f.url(form, "social.tiktok", { label: "TikTok", kind: "external", placeholder: "https://www.tiktok.com/@…" }),
            f.url(form, "social.facebook", { label: "Facebook", kind: "external", placeholder: "https://www.facebook.com/…" }),
          ],
        }),

        section({
          title: "Logos",
          description: "Usa PNG o WebP con fondo transparente. Se recomiendan 900 px de ancho.",
          body: [
            f.media(form, "logo.terracota", { label: "Logo principal (terracota)", kind: "image", required: true, previewBg: "light", help: "Se ve en el encabezado de todas las páginas sobre fondo claro (catálogo, ficha de producto, checkout y el inicio al bajar)." }),
            f.media(form, "logo.beige", { label: "Logo claro (beige)", kind: "image", required: true, previewBg: "dark", help: "Se ve en el encabezado mientras está el video del inicio y en el pie de página." }),
            // La tienda no muestra hoy el logo oscuro: queda guardado (el servidor lo exige) pero fuera de la vista principal
            h("details.ct-adv",
              h("summary.ct-adv__sum", icon("chevron-right", { size: 16, className: "ct-adv__chev" }), "Logo oscuro (hoy no se usa en la tienda)"),
              h("div.ct-adv__body",
                h("p.field__help", "La tienda no lo muestra en ninguna página: queda guardado por si se usa más adelante. No hace falta cambiarlo."),
                f.media(form, "logo.oscuro", { label: "Logo oscuro", kind: "image", required: true, previewBg: "light" }))),
          ],
        }),

        section({
          title: "Buscadores (SEO)",
          description: "Cómo aparece la página de inicio en Google y al compartir el enlace.",
          body: [
            f.text(form, "seo.title", { label: "Título", required: true, maxlength: 160, recommended: 60, help: "Ideal: hasta 60 caracteres." }),
            f.textarea(form, "seo.description", { label: "Descripción", maxlength: 320, recommended: 160, rows: 3, help: "Ideal: entre 120 y 160 caracteres." }),
            h("div.stack-sm", h("p.field__label", "Vista previa"), h("div.serp", { "aria-hidden": "true" }, h("p.serp__url", `${location.host} › inicio`), serpTitle, serpDesc)),
          ],
        }),

        section({
          title: "Tienda",
          description: "Opciones generales del catálogo, el checkout y el acceso al panel.",
          body: [
            f.row(
              f.number(form, "pageSize", { label: "Productos por página del catálogo", required: true, min: 2, max: 48, help: "Entre 2 y 48. El botón «Ver más» carga la siguiente página." }),
              f.number(form, "giftMaxChars", { label: "Máximo de caracteres del mensaje de regalo", required: true, min: 20, max: 1000, help: "Entre 20 y 1000." }),
            ),
            f.switch(form, "showPhotos", { label: "Mostrar fotos de los productos", help: "Si lo apagas, las tarjetas muestran el degradado con el nombre de la prenda." }),
            f.switch(form, "showAdminLink", { label: "Mostrar el acceso al panel en la tienda", help: "Ícono de usuario en el encabezado y enlace en el menú lateral." }),
          ],
        })));
      updWa();
      updSerp();
    },
  },
];
