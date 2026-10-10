/* ==========================================================================
   Mercy Studio · Panel — core/nav.js
   Menú lateral (grupos y orden). La visibilidad de cada ítem sale de los `roles` de su ruta
   (lo que registra la vista), así el menú nunca muestra algo que el rol no puede abrir.
   `roles` aquí es solo el respaldo si la vista no cargó.
   ========================================================================== */

export const NAV = [
  {
    id: "contenido",
    label: "Contenido",
    items: [
      { path: "/", label: "Escritorio", icon: "dashboard", exact: true },
      { path: "/inicio", label: "Inicio", icon: "home" },
      { path: "/textos", label: "Textos", icon: "text" },
      { path: "/descuento", label: "Modal de descuento", icon: "gift" },
    ],
  },
  {
    id: "tienda",
    label: "Tienda",
    items: [
      { path: "/productos", label: "Productos", icon: "shirt" },
      { path: "/categorias", label: "Categorías", icon: "folder" },
      { path: "/colores", label: "Colores", icon: "palette" },
      { path: "/colecciones", label: "Colecciones", icon: "layers" },
      { path: "/hormas", label: "Hormas", icon: "scissors" },
      { path: "/tallas", label: "Guía de tallas", icon: "ruler" },
      { path: "/resenas", label: "Reseñas", icon: "star" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [
      { path: "/cupones", label: "Cupones", icon: "ticket", roles: ["admin"] },
      { path: "/suscriptores", label: "Suscriptores", icon: "mail", roles: ["admin"] },
    ],
  },
  {
    id: "medios",
    label: "Medios",
    items: [{ path: "/medios", label: "Biblioteca de medios", icon: "image" }],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { path: "/usuarios", label: "Usuarios", icon: "users", roles: ["admin"] },
      { path: "/actividad", label: "Actividad", icon: "activity", roles: ["admin"] },
      { path: "/revisiones", label: "Revisiones", icon: "history", roles: ["admin"] },
      { path: "/ajustes", label: "Ajustes", icon: "settings", roles: ["admin"] },
    ],
  },
];

/** Grupo e ítem del menú que corresponden a un path ("/productos/fe" → Tienda › Productos). */
export function navFor(path) {
  let best = null;
  for (const g of NAV) {
    for (const it of g.items) {
      const hit = it.exact ? path === it.path : path === it.path || path.startsWith(it.path + "/");
      if (hit && (!best || it.path.length > best.item.path.length)) best = { group: g, item: it };
    }
  }
  if (!best && path.startsWith("/perfil")) return { group: { id: "cuenta", label: "Cuenta" }, item: { path: "/perfil", label: "Mi perfil" } };
  return best;
}
