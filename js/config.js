/* ==========================================================================
   Mercy Studio — config.js
   Ajustes editables del mockup (sin tocar la lógica).
   ========================================================================== */
window.Mercy = window.Mercy || {};

Mercy.config = {
  brand: "Mercy Studio",

  /* Número de WhatsApp en formato internacional, sin "+" (placeholder). */
  whatsapp: "573000000000",
  whatsappDisplay: "+57 300 000 0000",

  /* Descuento de bienvenida (pop-up de referencia: 15 % en el primer pedido). */
  discount: { code: "MERCY15", percent: 15 },

  /* ¿Es un regalo? — máximo de caracteres del mensaje personalizado (C45). */
  giftMaxChars: 180,

  /* Productos por "página" en el catálogo ("Ver más productos"). */
  pageSize: 6,

  /* C29: volver a mostrar el CTA del descuento cada vez que se abre el carrito (mientras no se haya reclamado). */
  discountOnCartOpen: true,

  /* Segundos antes de mostrar el pop-up de descuento en el Inicio. */
  discountPopupDelay: 3500,

  /* Hero del Inicio. Deja `src` vacío para ver el placeholder con degradado.
     type: "video" | "image".  Ej.: { type: "video", src: "assets/img/hero.mp4", poster: "assets/img/hero.jpg" } */
  heroMedia: { type: "", src: "", poster: "" },

  /* Logos (se pueden reemplazar por los archivos en curvas — C7/C17). */
  logo: {
    terracota: "assets/logo/mercy-studio-terracota.png",
    beige: "assets/logo/mercy-studio-beige.png",
    oscuro: "assets/logo/mercy-studio-oscuro.png"
  },

  /* Redes sociales (placeholders). */
  social: {
    instagram: "https://instagram.com/mercystudio",
    tiktok: "https://www.tiktok.com/@mercystudio",
    facebook: "https://facebook.com/mercystudio"
  },

  storageKey: "mercy.mockup.v1"
};
