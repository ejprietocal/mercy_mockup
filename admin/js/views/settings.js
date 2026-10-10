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
/** Número → texto visible: 573001234567 → «+57 300 123 4567»; otros países → «+<dígitos>». */
const fmtPhone = (d) => (d.length === 12 && d.startsWith("57") ? `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : d ? `+${d}` : "");

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
        // Mismo formato que la tienda (Mercy.ui.waLink): api.whatsapp.com conserva los emojis del saludo; wa.me los daña en su redirección
        const phone = digits(form.get("whatsapp"));
        const greeting = form.get("whatsappGreeting");
        waLink.href = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}${greeting ? `&text=${encodeURIComponent(greeting)}` : ""}`;
        waCode.textContent = `api.whatsapp.com/send?phone=${phone || "…"}`;
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
              f.text(form, "whatsappDisplay", { label: "Cómo se muestra", maxlength: 30, placeholder: "+57 300 000 0000", help: "Texto visible en el pie de la tienda. Se actualiza solo al cambiar el número, salvo que lo escribas a tu manera." }),
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
          title: "Pauta en Meta (Facebook e Instagram)",
          description: "Para medir la pauta y para el catálogo de productos de Meta. La vista previa al compartir un enlace (foto, título y descripción) ya sale sola: usa los textos de SEO de arriba y la primera foto de cada producto.",
          body: [
            f.text(form, "metaPixelId", {
              label: "Identificador del píxel de Meta", maxlength: 20, inputmode: "numeric", autocomplete: "off", placeholder: "123456789012345",
              help: "Solo números. Está en Meta Events Manager, en Orígenes de datos. Vacío = la tienda no carga el píxel ni contacta a Meta. Con él se registran PageView, ViewContent, AddToCart, InitiateCheckout, Lead (pedido enviado a WhatsApp) y Contact.",
              validate: (v) => (!String(v ?? "").trim() || /^\d{5,20}$/.test(String(v).trim()) ? null : "Solo números, entre 5 y 20 dígitos."),
            }),
            h("div.stack-sm",
              h("p.field__label", "Feed del catálogo para Meta"),
              h("p", h("a", { href: `${location.origin}/api/public/feed-meta.csv`, target: "_blank", rel: "noopener" }, h("code", `${location.origin}/api/public/feed-meta.csv`))),
              h("p.field__help", "En Commerce Manager: Catálogo, Orígenes de datos, Agregar artículos, Feed de datos, Usar una URL. Pega esta dirección y programa la actualización diaria. Salen los productos publicados con nombre, descripción, precio, disponibilidad y fotos; Meta omite los que no tengan foto.")),
          ],
        }),

        section({
          title: "Medios de pago",
          description: "Opciones de transferencia que la persona elige al finalizar la compra. El método elegido viaja en el mensaje de WhatsApp: la tienda no cobra.",
          body: f.list(form, "paymentMethods", {
            label: "Métodos de pago",
            help: "Entre 1 y 8, en el orden en que se muestran. La insignia es el logo que acompaña al nombre.",
            min: 1, max: 8, addLabel: "Agregar medio de pago",
            newItem: () => ({ id: "", name: "", hint: "", logo: "none" }),
            itemLabel: (it, i) => String(it?.name || "").trim() || `Medio de pago ${i + 1}`,
            renderItem: (p) => h("div.stack-sm",
              f.row(
                f.text(form, `${p}.name`, { label: "Nombre", required: true, maxlength: 40, placeholder: "Nequi" }),
                f.select(form, `${p}.logo`, { label: "Insignia", options: [{ value: "nequi", label: "Nequi" }, { value: "breb", label: "Bre-B" }, { value: "bancolombia", label: "Bancolombia" }, { value: "none", label: "Genérica (transferencia)" }] }),
              ),
              f.text(form, `${p}.hint`, { label: "Descripción corta", maxlength: 120, placeholder: "Transferencia desde la app Nequi" })),
          }),
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
      /* Al cambiar el número, «Cómo se muestra» lo sigue, salvo que la persona lo haya escrito a su manera */
      let lastDigits = digits(form.get("whatsapp"));
      form.on("change", ({ path }) => {
        if (path !== "whatsapp") return;
        const now = digits(form.get("whatsapp"));
        const shown = String(form.get("whatsappDisplay") || "").trim();
        if (now !== lastDigits && (!shown || shown === fmtPhone(lastDigits))) form.set("whatsappDisplay", fmtPhone(now));
        lastDigits = now;
      });
      updWa();
      updSerp();
    },
  },
];
