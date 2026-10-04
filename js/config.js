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
  /* VISTA PREVIA: video de paisaje enlazado directo desde Pexels (licencia libre, NO se descarga nada).
     "fallback" se usa si el principal no carga. Para usar el material real: cambia src/poster por tus archivos,
     p. ej. { type: "video", src: "assets/img/hero.mp4", poster: "assets/img/hero.jpg" }. type "" = placeholder con degradado. */
  heroMedia: {
    type: "video",
    src: "https://videos.pexels.com/video-files/6989014/6989014-hd_1920_1080_25fps.mp4",          /* mar de nubes al amanecer dorado (1080p, ~4 MB) */
    poster: "https://images.pexels.com/videos/6989014/pictures/preview-0.jpg",
    fallback: {
      src: "https://videos.pexels.com/video-files/4502082/4502082-hd_1920_1080_24fps.mp4",       /* amanecer sobre trigales */
      poster: "https://images.pexels.com/videos/4502082/pictures/preview-0.jpg"
    }
  },

  /* VISTA PREVIA: fotos de ropa reales (modelos) enlazadas desde Pexels. false = degradados con texto como en la propuesta. */
  stockPhotos: true,

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
