/* ==========================================================================
   Mercy Studio — config.js
   Resuelve el CONTENIDO del sitio y expone los ajustes que usa la tienda.
   · Con servidor: api/public/content.js define window.MercyContent (__source: "server").
   · Sin servidor (doble clic / hosting estático): se usa Mercy.DEFAULT_CONTENT (js/defaults.js).
   Expone:
     Mercy.content   contenido resuelto (esquema docs/ADMIN-CONTRATO.md §3), completado con los valores de fábrica
     Mercy.api       { enabled }  → true solo si el contenido viene del servidor
     Mercy.config    ajustes con las MISMAS claves de siempre (whatsapp, heroMedia, logo, social…)
   El contenido real se edita desde el panel (/admin), NO aquí.
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  const DEF = Mercy.DEFAULT_CONTENT || {};
  const given = window.MercyContent && typeof window.MercyContent === "object" ? window.MercyContent : null;

  /* --- Utilidades ----------------------------------------------------------- */
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  /* Completa `value` con `def`: solo rellena lo que falta (undefined/null) o tiene un tipo distinto.
     Un texto vacío ("") o una lista vacía ([]) del panel se respetan tal cual (= ocultar). */
  function withDefaults(value, def) {
    if (value === undefined || value === null) return def === undefined ? value : clone(def);
    if (def === undefined || def === null) return value;
    if (Array.isArray(def)) return Array.isArray(value) ? value : clone(def);
    if (isObj(def)) {
      if (!isObj(value)) return clone(def);
      const out = {};
      Object.keys(def).forEach(function (k) { out[k] = withDefaults(value[k], def[k]); });
      Object.keys(value).forEach(function (k) { if (!(k in out)) out[k] = value[k]; });
      return out;
    }
    if (typeof def === "number") { const n = Number(value); return isFinite(n) && value !== "" && typeof value !== "boolean" ? n : def; }
    if (typeof def === "boolean") return typeof value === "boolean" ? value : !!value;
    if (typeof def === "string") return typeof value === "string" ? value : String(value);
    return value;
  }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  /* Secciones-objeto se completan campo a campo; las listas se toman tal cual (vacía = vacía). */
  const OBJECT_SECTIONS = ["meta", "settings", "home", "discountModal", "texts"];
  const LIST_SECTIONS = ["colors", "fits", "categories", "collections", "sizeCharts", "reviews", "products"];

  function resolveContent(src) {
    if (!src) return clone(DEF);
    const out = {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    OBJECT_SECTIONS.forEach(function (k) { out[k] = withDefaults(src[k], DEF[k]); });
    LIST_SECTIONS.forEach(function (k) { out[k] = Array.isArray(src[k]) ? src[k] : (Array.isArray(DEF[k]) && src[k] === undefined ? clone(DEF[k]) : []); });
    if (out.home && out.home.hero && !isObj(out.home.hero.media)) out.home.hero.media = clone(DEF.home.hero.media);
    return out;
  }

  const content = resolveContent(given);
  const fromServer = !!(given && given.__source === "server");

  /* --- Cupón de bienvenida (texto {descuento}) ---------------------------------
     Con servidor llega hecho en discountModal.welcome ({ label, type, value } | null).
     Sin servidor se calcula con Mercy.DEFAULT_COUPONS y discountModal.couponCode. */
  function moneyLabel(n) { return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function couponLabel(c) { return c.type === "fixed" ? moneyLabel(c.value) : Math.round(c.value) + "%"; }
  /* Fecha de hoy en Colombia (UTC-5, sin horario de verano) como "AAAA-MM-DD" */
  function todayCO() { return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
  function couponLive(c) {
    if (!c || !c.active) return false;
    const today = todayCO();
    if (c.startsAt && String(c.startsAt).slice(0, 10) > today) return false;
    if (c.endsAt && String(c.endsAt).slice(0, 10) < today) return false;
    if (c.maxUses != null && (c.usesCount || 0) >= c.maxUses) return false;
    return (c.type === "percent" || c.type === "fixed") && Number(c.value) > 0;
  }
  function localWelcome(code) {
    const want = String(code || "").trim().toUpperCase();
    if (!want) return null;
    const c = (Mercy.DEFAULT_COUPONS || []).filter(function (x) { return String(x.code || "").toUpperCase() === want; })[0];
    return couponLive(c) ? { label: couponLabel(c), type: c.type, value: Number(c.value) } : null;
  }
  const dm = content.discountModal;
  if (fromServer) {
    /* El servidor nunca publica el código: no se rellena con el de fábrica */
    if (!(isObj(given.discountModal) && "couponCode" in given.discountModal)) delete dm.couponCode;
    if (!isObj(dm.welcome)) dm.welcome = null;
  } else if (dm.welcome === undefined) {
    dm.welcome = localWelcome(dm.couponCode);
  }
  const welcome = dm.welcome;

  Mercy.content = content;
  Mercy.api = { enabled: fromServer };

  /* --- Ajustes derivados (mismas claves que usa el código desde siempre) ------- */
  const st = content.settings, hero = content.home.hero, media = hero.media || {};
  const discountOn = !!(dm.enabled && welcome);

  Mercy.config = {
    brand: st.brand || "Mercy Studio",

    /* Número de WhatsApp en formato internacional, sin "+" */
    whatsapp: String(st.whatsapp || "").replace(/\D/g, ""),
    /* Texto visible del número (pie de página): si no se escribió, se arma con el número (573001234567 → +57 300 123 4567) */
    whatsappDisplay: st.whatsappDisplay || (function (d) { return d.length === 12 && d.indexOf("57") === 0 ? "+57 " + d.slice(2, 5) + " " + d.slice(5, 8) + " " + d.slice(8) : (d ? "+" + d : ""); })(String(st.whatsapp || "").replace(/\D/g, "")),
    whatsappGreeting: st.whatsappGreeting || "Hola " + (st.brand || "Mercy Studio"),

    /* Descuento de bienvenida (compatibilidad). `code` solo se conoce sin servidor (el servidor nunca publica el código).
       Los cupones reales viven en Mercy.store.discount (API pública o Mercy.DEFAULT_COUPONS); la tienda ya no lee esto. */
    discount: {
      code: String(dm.couponCode || "").toUpperCase(),
      percent: welcome && welcome.type === "percent" ? Number(welcome.value) : 0
    },
    /* Pop-up y CTAs de descuento: apagados si el modal está deshabilitado o no hay cupón de bienvenida vigente */
    discountEnabled: discountOn,
    discountAutoOpen: discountOn && dm.autoOpen !== false,

    /* ¿Es un regalo? — máximo de caracteres del mensaje personalizado (C45). */
    giftMaxChars: Math.max(20, Math.min(1000, parseInt(st.giftMaxChars, 10) || 180)),

    /* Productos por "página" en el catálogo ("Ver más productos"). */
    pageSize: Math.max(2, Math.min(48, parseInt(st.pageSize, 10) || 6)),

    /* C29: volver a mostrar el CTA del descuento cada vez que se abre el carrito (mientras no se haya reclamado). */
    discountOnCartOpen: discountOn && dm.showOnCartOpen !== false,

    /* Milisegundos antes de mostrar el pop-up de descuento en el Inicio. */
    discountPopupDelay: Math.max(0, Math.min(60000, parseInt(dm.delayMs, 10) || 0)),

    /* C0: imagen de la parte superior del pop-up de descuento. Vacío = ilustración de las tres cruces. */
    discountImage: dm.image || "",

    /* Hero del Inicio. type: "video" | "image" | "none" (none o sin src = placeholder con degradado). */
    heroMedia: {
      type: media.type === "image" || media.type === "none" ? media.type : (media.type === "video" ? "video" : "none"),
      src: media.src || "",
      poster: media.poster || "",
      fallback: { src: media.fallbackSrc || "", poster: media.fallbackPoster || "" }
    },

    /* false = tarjetas con degradado + texto en lugar de fotos (settings.showPhotos). */
    stockPhotos: st.showPhotos !== false,
    showAdminLink: st.showAdminLink !== false,

    /* Logos (se pueden reemplazar por los archivos en curvas — C7/C17). */
    logo: {
      terracota: (st.logo && st.logo.terracota) || "assets/logo/mercy-studio-terracota.png",
      beige: (st.logo && st.logo.beige) || "assets/logo/mercy-studio-beige.png",
      oscuro: (st.logo && st.logo.oscuro) || "assets/logo/mercy-studio-oscuro.png"
    },

    /* Redes sociales (C11/C12). Vacío = no se muestra ese enlace. */
    social: {
      instagram: (st.social && st.social.instagram) || "",
      tiktok: (st.social && st.social.tiktok) || "",
      facebook: (st.social && st.social.facebook) || ""
    },

    storageKey: "mercy.mockup.v1"
  };
})();
