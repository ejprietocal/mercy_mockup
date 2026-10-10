/* ==========================================================================
   Mercy Studio · Panel — views/discount.js
   Modal de descuento (#/descuento): cuándo aparece el pop-up de bienvenida (activo, apertura
   automática en el Inicio a los N segundos, al abrir el carrito), cupón de bienvenida (solo
   administrador: GET /api/admin/coupons; el editor lo ve en solo lectura y el servidor conserva
   el valor), imagen superior y textos del formulario y del estado de éxito, con vista previa en
   vivo que imita la tienda. Sección "discountModal" (PUT /api/admin/content/discountModal).
   ========================================================================== */
import { h, replace } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api } from "../core/api.js";
import { content } from "../core/store.js";
import { session } from "../core/session.js";
import { createForm, fields as f } from "../core/forms.js";
import { badge, button, card, errorState, notice, pageHeader, tabs } from "../core/ui.js";
import { date, isSafeUrl, money, number, plural, siteUrl, todayCO } from "../core/format.js";
import { fetchWelcome, fillDiscount, keepMetaFresh, metaSubtitle, richNodes, storeButton } from "./home.js";

const FALLBACK_SUB = "Pop-up de bienvenida que ofrece un descuento a cambio del correo.";

/* ---------- Cupones (mismas reglas que server/lib/coupons.js) ---------- */
const couponLabel = (c) => (c.type === "percent" ? `${c.value}%` : money(c.value));

/** null = vigente hoy; si no: inactive | not_started | expired | exhausted | not_found */
function couponState(c, today = todayCO()) {
  if (!c) return "not_found";
  if (!c.active) return "inactive";
  if (c.startsAt && today < c.startsAt) return "not_started";
  if (c.endsAt && today > c.endsAt) return "expired";
  if (c.maxUses !== null && c.maxUses !== undefined && (c.usesCount || 0) >= c.maxUses) return "exhausted";
  return null;
}
const STATE_LABEL = { ok: ["Vigente", "success"], inactive: ["Inactivo", "neutral"], not_started: ["Programado", "info"], expired: ["Vencido", "warning"], exhausted: ["Agotado", "warning"], not_found: ["No existe", "danger"] };
const stateBadge = (st) => { const [l, t] = STATE_LABEL[st || "ok"]; return badge(l, t, { dot: true }); };

function stateProblem(c, st) {
  switch (st) {
    case "inactive": return `«${c.code}» está inactivo.`;
    case "not_started": return `«${c.code}» empieza a valer el ${date(c.startsAt, { long: true })}.`;
    case "expired": return `«${c.code}» venció el ${date(c.endsAt, { long: true })}.`;
    case "exhausted": return `«${c.code}» ya alcanzó su límite de ${plural(c.maxUses, "uso", "usos")}.`;
    default: return "Ese cupón ya no existe.";
  }
}

function couponFacts(c, data) {
  const cats = new Map((data.categories || []).map((x) => [x.id, x.name]));
  const applies = c.appliesTo === "categories"
    ? `${plural(c.categoryIds.length, "categoría", "categorías")}: ${c.categoryIds.map((id) => cats.get(id) || id).join(", ")}`
    : c.appliesTo === "products" ? plural(c.productIds.length, "producto", "productos") : "Todos los productos";
  const span = c.startsAt || c.endsAt
    ? `${c.startsAt ? `Desde el ${date(c.startsAt)}` : "Ya vigente"}${c.endsAt ? ` hasta el ${date(c.endsAt)}` : ", sin fecha de fin"}`
    : "Sin límite";
  return h("dl.kv.ct-coupon__kv",
    h("dt", "Descuento"), h("dd", c.type === "percent" ? `${c.value}% del valor de los productos` : `${money(c.value)} de descuento`),
    h("dt", "Aplica a"), h("dd", applies),
    h("dt", "Compra mínima"), h("dd", c.minSubtotal ? money(c.minSubtotal) : "Sin mínimo"),
    h("dt", "Vigencia"), h("dd", span),
    h("dt", "Usos"), h("dd", `${number(c.usesCount || 0)} / ${c.maxUses ? number(c.maxUses) : "ilimitado"}`)); // como en la lista de Cupones
}

/* ---------- Vista previa del pop-up (imita css/layout.css de la tienda) ---------- */
const CROSSES = '<svg xmlns="http://www.w3.org/2000/svg" class="ct-dm__crosses" viewBox="0 0 120 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M60 8v34M52 17h16M30 24v22M25 30h10M90 24v22M85 30h10"/><path d="M0 52c16-5 30-4 44 0s28 5 44 1 22-5 32-1" stroke-width="2.4"/></svg>';

function crossesSvg() {
  const tpl = document.createElement("template");
  tpl.innerHTML = CROSSES;
  return tpl.content.firstChild;
}

/** Un estado del pop-up: "form" (formulario) o "success" (ya registrado). → { el, update(valor, etiqueta, código) } */
function modalPreview(state) {
  const media = h("div.ct-dm__media");
  const body = h("div.ct-dm__body");
  const el = h("div.ct-dm", { "aria-hidden": "true" }, h("span.ct-dm__close", icon("x", { size: 18 })), media, body);
  let imgKey = null;

  function updMedia(src) {
    const s = String(src || "").trim();
    if (s === imgKey) return;
    imgKey = s;
    media.classList.toggle("is-img", !!s && isSafeUrl(s, "media"));
    if (s && isSafeUrl(s, "media")) {
      const img = h("img", { src: siteUrl(s), alt: "", decoding: "async" });
      img.addEventListener("error", () => { media.classList.remove("is-img"); replace(media, h("div.ct-dm__sun"), crossesSvg()); }, { once: true });
      replace(media, img);
    } else replace(media, h("div.ct-dm__sun"), crossesSvg());
  }

  function update(v, label, code) {
    updMedia(v.image);
    const fill = (t) => fillDiscount(t, label);
    if (state === "form") {
      replace(body,
        h("p.ct-dm__title", richNodes(fill(v.title))),
        h("hr.ct-dm__rule"),
        h("p.ct-dm__offer", richNodes(fill(v.offerText), { accent: false })),
        h("div.ct-dm__input", String(v.placeholder || "") || " "),
        h("span.ct-dm__btn", fill(v.buttonLabel) || " "),
        String(v.fine || "").trim() ? h("p.ct-dm__fine", richNodes(fill(v.fine), { accent: false })) : null);
    } else {
      replace(body,
        h("span.ct-dm__check", icon("check", { size: 26, strokeWidth: 2.4 })),
        h("p.ct-dm__title", richNodes(fill(v.successTitle))),
        String(v.successOffer || "").trim() ? h("p.ct-dm__offer", richNodes(fill(v.successOffer), { accent: false })) : null,
        h("div.ct-dm__code", h("strong", code || "CÓDIGO"), h("span.ct-dm__copy", icon("copy", { size: 14 }), "Copiar")),
        String(v.successFine || "").trim() ? h("p.ct-dm__fine", richNodes(fill(v.successFine), { accent: false })) : null,
        h("span.ct-dm__btn", fill(v.successButton) || " "));
    }
  }
  return { el, update };
}

/** Campo "segundos" que guarda milisegundos (delayMs). */
function delayField(form, onInput) {
  return f.custom(form, "delayMs", {
    label: "Esperar antes de abrir",
    help: "Desde que se abre el Inicio. 0 = de inmediato; máximo 60 segundos.",
    validate: (v) => (v === null || v === undefined || Number.isNaN(v) ? "Escribe los segundos (de 0 a 60)." : v < 0 || v > 60000 ? "Debe estar entre 0 y 60 segundos." : null),
    create: ({ value, onChange, id, describedBy }) => {
      const input = h("input.input.input--number", { id, type: "number", min: 0, max: 60, step: 0.5, inputmode: "decimal", "aria-describedby": describedBy });
      const fmt = (ms) => (ms === null || ms === undefined ? "" : String(Math.round(Number(ms) / 100) / 10));
      input.addEventListener("input", () => {
        const raw = input.value.trim().replace(",", ".");
        const sec = raw === "" ? null : Number(raw);
        onChange(sec === null || Number.isNaN(sec) ? null : Math.round(sec * 1000));
      });
      const setValue = (ms) => {
        if (document.activeElement === input && Math.round(Number(input.value) * 1000) === ms) return;
        input.value = fmt(ms);
      };
      setValue(value);
      onInput?.(input);
      return { el: h("div.input-group.ct-delay", input, h("span.input-group__addon", "segundos")), setValue, focus: () => input.focus() };
    },
  });
}

export default [
  {
    path: "/descuento",
    title: "Modal de descuento",
    async render(el, params, ctx) {
      const isAdmin = session.isAdmin;
      const [value, data, welcome, couponRes] = await Promise.all([
        content.section("discountModal"),
        content.load(),
        fetchWelcome(ctx.signal),
        isAdmin ? api.get("/api/admin/coupons", { signal: ctx.signal }).then((r) => ({ items: r.items || [] }), (e) => ({ error: e })) : Promise.resolve(null),
      ]);
      let coupons = couponRes?.items || null;
      let couponsError = couponRes?.error || null;

      const form = createForm({
        ctx,
        value,
        onSubmit: (v, { force }) => content.saveSection("discountModal", v, { force }),
      });

      /* --- Cupón elegido y su etiqueta (para {descuento}) --- */
      const selected = () => {
        const code = String(form.get("couponCode") || "");
        return coupons ? coupons.find((c) => c.code === code) || null : null;
      };
      /** { label, valid } — valid: true/false, o null si no se sabe (editor sin datos públicos). */
      const currentCoupon = () => {
        const code = String(form.get("couponCode") || "");
        if (isAdmin && coupons) {
          const c = selected();
          return { code, label: c ? couponLabel(c) : "", valid: !!c && !couponState(c), coupon: c };
        }
        return { code, label: welcome?.label || "", valid: welcome ? !!welcome.label : null, coupon: null };
      };

      /* ---------- Cuándo aparece ---------- */
      let delayInput = null;
      const behaviorCard = card({
        title: "Cuándo aparece",
        description: "El pop-up se muestra a quienes aún no han dejado su correo.",
        body: [
          f.switch(form, "enabled", { label: "Mostrar el pop-up de descuento", help: "Si lo apagas, no aparece el pop-up ni los avisos de descuento del carrito y del pago. La suscripción del bloque «Comunidad» sigue funcionando." }),
          h("div.ct-dm-indent",
            f.switch(form, "autoOpen", { label: "Abrir solo en el Inicio", help: "Se abre automáticamente una vez por visita, después de los segundos que elijas." }),
            delayField(form, (inp) => { delayInput = inp; }),
            f.switch(form, "showOnCartOpen", { label: "Volver a mostrarlo al abrir el carrito", help: "Cada vez que se abre el carrito aparece encima, mientras la persona no lo haya reclamado." })),
        ],
      });
      const syncBehavior = () => {
        const on = !!form.get("enabled");
        behaviorCard.querySelector(".ct-dm-indent")?.classList.toggle("is-off", !on);
        if (delayInput) delayInput.disabled = !form.get("autoOpen");
      };

      /* ---------- Cupón de bienvenida ---------- */
      const couponBody = h("div.stack");
      const couponInfo = h("div.ct-coupon");
      function renderCouponInfo() {
        if (!isAdmin || !coupons) return;
        const code = String(form.get("couponCode") || "");
        const c = selected();
        const st = c ? couponState(c) : code ? "not_found" : null;
        const links = h("div.cluster",
          c ? button({ label: "Editar este cupón", icon: "edit", size: "sm", href: `#/cupones/${encodeURIComponent(c.id)}` }) : null,
          button({ label: "Crear cupón", icon: "plus", size: "sm", variant: c ? "ghost" : "secondary", href: "#/cupones/nuevo" }),
          button({ label: "Ver todos los cupones", size: "sm", variant: "ghost", href: "#/cupones" }));
        if (!code) {
          replace(couponInfo,
            notice({ tone: "warning", title: "Sin cupón de bienvenida", message: "La tienda no muestra el pop-up ni los avisos de descuento. La suscripción sigue funcionando, pero nadie recibe un código." }),
            links);
          return;
        }
        if (!c) {
          replace(couponInfo, notice({ tone: "danger", title: "El cupón no existe", message: `No encontramos «${code}». Elige otro cupón o créalo.` }), links);
          return;
        }
        replace(couponInfo,
          h("div.ct-coupon__box",
            h("div.ct-coupon__head",
              h("span.ct-coupon__code", icon("ticket", { size: 16 }), c.code),
              h("span.ct-coupon__label", couponLabel(c)),
              stateBadge(st)),
            c.description ? h("p.ct-coupon__desc", c.description) : null,
            couponFacts(c, data)),
          st ? notice({ tone: "warning", title: "Este cupón no está vigente", message: `${stateProblem(c, st)} Mientras no elijas uno vigente, la tienda no muestra el pop-up ni los avisos de descuento.` }) : null,
          links);
      }

      function renderCouponBody() {
        if (!isAdmin) {
          const code = String(form.get("couponCode") || "");
          replace(couponBody,
            f.readonly("Cupón de bienvenida", code ? h("span.ct-coupon__ro", h("strong.mono", code), welcome?.label ? ` · ${welcome.label}` : "") : "Sin cupón de bienvenida"),
            notice({ tone: "info", title: "Lo configura un administrador", message: "Puedes cambiar los textos, la imagen y cuándo aparece. El cupón que se entrega solo lo cambia un administrador." }));
          return;
        }
        if (couponsError) {
          replace(couponBody,
            f.readonly("Cupón de bienvenida", h("strong.mono", String(form.get("couponCode") || "—"))),
            errorState({ error: couponsError, title: "No se pudieron cargar los cupones", onRetry: retryCoupons }));
          return;
        }
        replace(couponBody,
          f.select(form, "couponCode", {
            label: "Cupón de bienvenida",
            emptyLabel: "Sin cupón de bienvenida",
            options: () => (coupons || []).map((c) => {
              const st = couponState(c);
              return { value: c.code, label: `${c.code} · ${couponLabel(c)} · ${STATE_LABEL[st || "ok"][0]}` };
            }),
            help: "Se entrega a quien deja su correo en el pop-up o en «Comunidad». Su valor reemplaza {descuento} en los textos.",
          }),
          couponInfo);
        renderCouponInfo();
      }

      async function retryCoupons() {
        try {
          const r = await api.get("/api/admin/coupons", { signal: ctx.signal });
          coupons = r.items || [];
          couponsError = null;
        } catch (e) {
          couponsError = e;
        }
        if (ctx.isCurrent) { renderCouponBody(); updPreview(); }
      }
      renderCouponBody();

      const couponCard = card({
        title: "Cupón de bienvenida",
        description: isAdmin ? "El código que recibe la persona al registrarse. Nunca se muestra públicamente antes de registrarse." : null,
        body: couponBody,
      });

      /* ---------- Imagen ---------- */
      const imageCard = card({
        title: "Imagen superior",
        body: f.media(form, "image", {
          label: "Imagen", kind: "image", optional: true, previewBg: "dark",
          help: "Vacía = ilustración de las tres cruces sobre un atardecer. Se recorta a una franja horizontal (aprox. 460 × 210 px): usa una foto horizontal de al menos 920 × 420 px.",
        }),
      });

      /* ---------- Textos ---------- */
      const tagLabel = h("strong");
      const discountTip = h("p.ct-dm-tip", icon("info", { size: 15 }), h("span", "Escribe ", h("code", "{descuento}"), " donde quieras mostrar el valor del cupón (hoy: ", tagLabel, ")."));
      const formTexts = card({
        title: "Textos del formulario",
        description: "Lo que se ve antes de registrarse.",
        className: "ct-dm-texts",
        body: [
          discountTip,
          f.accentTitle(form, "title", { label: "Título", multiline: true, maxlength: 160, discount: true, discountLabel: () => currentCoupon().label || "sin cupón" }),
          f.text(form, "offerText", { label: "Oferta", maxlength: 300, help: "Debajo del título, en mayúsculas. También es el aviso del carrito que abre el pop-up." }),
          f.row(
            f.text(form, "placeholder", { label: "Texto dentro del campo de correo", maxlength: 120, placeholder: "Introduce tu correo electrónico" }),
            f.text(form, "buttonLabel", { label: "Texto del botón", maxlength: 60 }),
          ),
          f.textarea(form, "fine", { label: "Letra pequeña", maxlength: 500, rows: 2, help: "Debajo del botón (aviso de privacidad)." }),
        ],
      });
      const successTexts = card({
        title: "Después de registrarse",
        description: "Reemplaza el formulario cuando la persona deja su correo. Debajo de la oferta se muestra el código del cupón para copiarlo.",
        className: "ct-dm-success",
        body: [
          // Igual que los demás títulos: «Cursiva de marca» y vista previa (la tienda lo dibuja con *palabra* y {descuento})
          f.accentTitle(form, "successTitle", { label: "Título", maxlength: 160, placeholder: "¡Bienvenido a Mercy!", discount: true, discountLabel: () => currentCoupon().label || "sin cupón" }),
          f.text(form, "successOffer", { label: "Oferta", maxlength: 300 }),
          f.textarea(form, "successFine", { label: "Letra pequeña", maxlength: 500, rows: 2 }),
          f.text(form, "successButton", { label: "Texto del botón", maxlength: 60, help: "Cierra el pop-up." }),
        ],
      });

      /* ---------- Vista previa ---------- */
      const pForm = modalPreview("form");
      const pDone = modalPreview("success");
      const t = tabs({
        label: "Estado del pop-up en la vista previa",
        items: [
          { id: "form", label: "Formulario", content: pForm.el },
          { id: "exito", label: "Éxito", content: pDone.el },
        ],
      });
      const statusBox = h("div.ct-dm-status");
      let statusKey = "";
      function updStatus() {
        const v = form.get();
        const cc = currentCoupon();
        let tone;
        let title;
        let message;
        if (!v.enabled) {
          tone = "warning"; title = "Apagado"; message = "Los visitantes no ven el pop-up ni los avisos de descuento.";
        } else if (cc.valid === false) {
          tone = "warning"; title = "No se muestra";
          message = !cc.code ? "No hay cupón de bienvenida." : isAdmin && cc.coupon ? `${stateProblem(cc.coupon, couponState(cc.coupon))} Elige un cupón vigente.` : "El cupón de bienvenida no está vigente.";
        } else {
          tone = "success"; title = "Activo";
          const secs = number((Number(v.delayMs) || 0) / 1000, 1);
          message = v.autoOpen ? `Se abre solo en el Inicio a los ${secs} s, una vez por visita.` : "No se abre solo: aparece desde el aviso del carrito.";
          if (v.showOnCartOpen) message += " También al abrir el carrito.";
        }
        const key = `${tone}|${title}|${message}`;
        if (key === statusKey) return;
        statusKey = key;
        replace(statusBox, notice({ tone, title, message }));
      }
      function updPreview() {
        const v = form.get();
        const cc = currentCoupon();
        tagLabel.textContent = cc.label || "sin cupón vigente";
        pForm.update(v, cc.label, cc.code);
        pDone.update(v, cc.label, cc.code);
        updStatus();
        syncBehavior();
      }
      form.on("change", ({ path }) => {
        updPreview();
        if (!path || path === "couponCode") renderCouponInfo();
      });
      // Al editar los textos de éxito, la vista previa cambia sola a esa pestaña (y viceversa)
      successTexts.addEventListener("focusin", () => t.select("exito"));
      formTexts.addEventListener("focusin", () => t.select("form"));

      const previewCard = card({
        title: "Vista previa",
        className: "ct-dm-previewcard",
        body: [
          statusBox,
          t.el,
          h("p.ct-prev-cap", "En la tienda aparece una vez por visita. Para volver a verlo, abre la tienda en una ventana privada."),
        ],
      });
      previewCard.id = "ct-dm-preview";

      const header = pageHeader({
        title: "Modal de descuento",
        breadcrumbs: [{ label: "Contenido" }],
        subtitle: metaSubtitle("discountModal", FALLBACK_SUB),
        actions: [
          button({ label: "Vista previa", icon: "eye", variant: "ghost", className: "ct-dm-jump", onClick: () => { previewCard.scrollIntoView({ behavior: "smooth", block: "start" }); } }),
          storeButton("../index.html"),
        ],
      });
      keepMetaFresh(header, form, "discountModal", FALLBACK_SUB);

      el.append(h("div.page.ct-page",
        header,
        h("div.ct-dm-layout",
          h("div.ct-dm-main", behaviorCard, couponCard, imageCard, formTexts, successTexts),
          h("aside.ct-dm-side", { "aria-label": "Vista previa del pop-up" }, previewCard))));
      updPreview();
    },
  },
];
