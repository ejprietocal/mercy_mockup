/* ==========================================================================
   Mercy Studio — icons.js
   Set de íconos SVG en línea (24×24). Uso:  Mercy.icons.svg("cart", { size: 22, cls: "x" })
   NOTA C0: el ícono de compra es un CARRITO (no una bolsa).
   ========================================================================== */
window.Mercy = window.Mercy || {};

(function () {
  /* Trazo (stroke) */
  const S = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    heart: '<path d="M12 20.3s-7.6-4.6-7.6-10.3a4.3 4.3 0 0 1 7.6-2.7 4.3 4.3 0 0 1 7.6 2.7c0 5.7-7.6 10.3-7.6 10.3z"/>',
    cart: '<path d="M2.8 4h2.4l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.5-1.1L20.8 8H6.1"/><circle cx="9.7" cy="19.4" r="1.4"/><circle cx="17.2" cy="19.4" r="1.4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    "chevron-down": '<path d="M6 9l6 6 6-6"/>',
    "chevron-up": '<path d="M6 15l6-6 6 6"/>',
    "chevron-right": '<path d="M9 6l6 6-6 6"/>',
    "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
    "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    truck: '<path d="M3 6.5h10.5V16H3z"/><path d="M13.5 9.5h4.2l2.8 3.2V16h-7z"/><circle cx="7.2" cy="17.6" r="1.8"/><circle cx="17" cy="17.6" r="1.8"/>',
    shield: '<path d="M12 3l7 2.8v5.4c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.8z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".5"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10 11v5M14 11v5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.3"/>',
    gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13"/><path d="M12 7c-2.5 0-4-1-4-2.4S9.6 2.6 12 7zM12 7c2.5 0 4-1 4-2.4S14.4 2.6 12 7z"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M6.5 15h3"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    ruler: '<path d="M3.5 16.5l13-13 4 4-13 13z"/><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>',
    cross: '<path d="M12 3v18M7 8h10"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4s6.3 1.8 7.2 5.4"/>',
    chat: '<path d="M20.5 11.6a8 8 0 0 1-11.7 7.1L4 20l1.4-4.5a8 8 0 1 1 15.1-3.9z"/>',
    /* Lápiz (barra "Editar esta página") */
    edit: '<path d="M4 20h4L19.2 8.8a2.1 2.1 0 0 0 0-3L18.2 4.8a2.1 2.1 0 0 0-3 0L4 16z"/><path d="M13.5 6.5l4 4"/>'
  };

  /* Relleno (fill) */
  const F = {
    "heart-fill": '<path d="M12 20.3s-7.6-4.6-7.6-10.3a4.3 4.3 0 0 1 7.6-2.7 4.3 4.3 0 0 1 7.6 2.7c0 5.7-7.6 10.3-7.6 10.3z"/>',
    star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    /* Simple Icons (CC0) */
    whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>',
    tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
    facebook: '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>',
    dot: '<circle cx="12" cy="12" r="5"/>'
  };

  /* Insignias de bancos (C35). PLACEHOLDERS tipográficos; reemplazar por logos oficiales en assets/img/banks/ */
  const BANKS = {
    nequi:
      '<svg class="bank-logo" viewBox="0 0 92 30" role="img" aria-label="Nequi"><rect x="1" y="3" width="24" height="24" rx="6" fill="#DA0081"/><path d="M8 20V10h2.2l5.6 6.6V10H18v10h-2.2L10.2 13.4V20z" fill="#fff"/><text x="31" y="21.5" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#200020" letter-spacing="-.3">nequi</text></svg>',
    breb:
      '<svg class="bank-logo" viewBox="0 0 92 30" role="img" aria-label="Bre-B"><rect x="1" y="3" width="24" height="24" rx="12" fill="#0B3B8F"/><path d="M9 20V10h4.3c2 0 3.2.9 3.2 2.5 0 1-.6 1.8-1.5 2.1 1.1.3 1.8 1.1 1.8 2.3 0 1.8-1.4 3.1-3.6 3.1zm2-5.9h2c.8 0 1.3-.4 1.3-1.1s-.5-1.1-1.3-1.1H11zm0 4.1h2.2c.9 0 1.5-.4 1.5-1.2s-.6-1.2-1.5-1.2H11z" fill="#fff"/><text x="31" y="21.5" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#0B3B8F" letter-spacing="-.3">Bre-B</text></svg>',
    bancolombia:
      '<svg class="bank-logo" viewBox="0 0 132 30" role="img" aria-label="Bancolombia" overflow="visible"><rect x="1" y="3" width="24" height="24" rx="5" fill="#FDDA24"/><path d="M5 20.5L16 7.5h3.6L8.6 20.5zM9.4 20.5l11-13h3L12.4 20.5z" fill="#1C1C1C" opacity=".92"/><text x="31" y="21" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#1C1C1C" letter-spacing="-.2">Bancolombia</text></svg>'
  };

  function svg(name, opts) {
    opts = opts || {};
    const size = opts.size || 24;
    const cls = "icon icon-" + name + (opts.cls ? " " + opts.cls : "");
    const common = 'class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    if (F[name]) return "<svg " + common + ' fill="currentColor">' + F[name] + "</svg>";
    if (S[name]) {
      return "<svg " + common + ' fill="none" stroke="currentColor" stroke-width="' + (opts.stroke || 1.6) + '" stroke-linecap="round" stroke-linejoin="round">' + S[name] + "</svg>";
    }
    return "";
  }

  Mercy.icons = {
    svg: svg,
    bank: function (id) { return BANKS[id] || ""; },
    names: Object.keys(S).concat(Object.keys(F))
  };
})();
