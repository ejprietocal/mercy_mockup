/* ==========================================================================
   Mercy Studio · Panel — main.js
   Arranque del panel: verifica la sesión (GET /api/auth/me; sin sesión → login.html?next=…),
   carga TODAS las vistas (cada una por separado: si una tiene un error, las demás siguen
   funcionando), monta el marco y arranca el router.
   ========================================================================== */
import { $, h } from "./core/dom.js";
import { icon } from "./core/icons.js";
import { session } from "./core/session.js";
import { registerRoutes, startRouter } from "./core/router.js";
import { mountShell } from "./core/shell.js";
import { button, toast } from "./core/ui.js";
import { redirectToLogin } from "./core/api.js";
import { installReauth } from "./core/reauth.js";

/** Módulos de vistas (admin/js/views/<nombre>.js). Cada uno exporta por defecto una lista de rutas. */
export const VIEWS = [
  "dashboard", "home", "texts", "discount",
  "products", "taxonomies", "sizecharts", "reviews",
  "coupons", "subscribers", "media",
  "users", "activity", "revisions", "settings", "profile",
];

function showFatal(err) {
  const boot = $("#boot");
  if (!boot) return;
  boot.replaceChildren(
    h("img.boot__logo", { src: "../assets/logo/mercy-studio-terracota.png", alt: "Mercy Studio", width: 180, height: 89 }),
    h("div.boot__error", { role: "alert" },
      icon("alert-circle", { size: 28 }),
      h("h1", "No se pudo abrir el panel"),
      h("p", err?.message || "Ocurrió un error inesperado."),
      button({ label: "Reintentar", icon: "refresh", variant: "primary", onClick: () => location.reload() })),
  );
}

async function boot() {
  // "Saltar al contenido" sin tocar la ruta (#main no es una ruta del panel)
  $(".skip-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    const main = $("#main");
    main.focus();
    main.scrollIntoView();
  });

  // Sin la cookie indicadora no hay sesión posible: directo al ingreso (sin petición ni 401 en consola)
  if (!/(?:^|;\s*)mercy_admin=1(?:;|$)/.test(document.cookie)) {
    redirectToLogin("");
    return;
  }
  try {
    await session.load();
  } catch (e) {
    if (e?.status === 401) return; // api.js ya redirige al ingreso
    showFatal(e);
    return;
  }

  const failed = [];
  const results = await Promise.allSettled(VIEWS.map((name) => import(`./views/${name}.js`)));
  results.forEach((r, i) => {
    const source = `views/${VIEWS[i]}.js`;
    if (r.status === "fulfilled" && r.value?.default) registerRoutes(r.value.default, { source });
    else {
      failed.push(source);
      console.error(`[panel] No se pudo cargar ${source}:`, r.reason || "no exporta rutas por defecto");
    }
  });

  // Desde aquí, un 401 (sesión vencida, contraseña cambiada en otro equipo…) se resuelve sin perder lo escrito
  installReauth();
  mountShell();
  $("#boot")?.remove();
  $("#app").hidden = false;
  document.body.classList.remove("is-booting");
  startRouter($("#main"));

  if (failed.length && session.isAdmin) {
    toast(`Algunas secciones no se pudieron cargar (${failed.join(", ")}). Revisa la consola del navegador.`, { type: "error", timeout: 0 });
  }
}

boot();
