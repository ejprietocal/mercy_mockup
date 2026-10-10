/* ==========================================================================
   Mercy Studio · Panel — core/shell.js
   Marco del panel: barra lateral (grupos según el rol), barra superior (título de la página,
   "Ver tienda", menú del usuario) y cajón lateral en móvil (botón de menú, Escape, fondo).
   ========================================================================== */
import { $, h } from "./dom.js";
import { icon } from "./icons.js";
import { session } from "./session.js";
import { NAV, navFor } from "./nav.js";
import { canAccess, matchRoute, onRoute } from "./router.js";
import { badge, menu } from "./ui.js";
import { api } from "./api.js";
import { initials } from "./format.js";

const MOBILE = window.matchMedia("(max-width: 960px)");

export function mountShell() {
  const app = $("#app");
  const sidebar = $("#sidebar");
  const navEl = $("#sidebar-nav");
  const backdrop = $("#sidebar-backdrop");
  const menuBtn = $("#menu-toggle");
  const closeBtn = $("#sidebar-close");
  const titleEl = $("#topbar-title");
  const groupEl = $("#topbar-group");
  const userSlot = $("#user-menu");
  const versionEl = $("#app-version");
  let currentPath = "/";

  /* ---------- Menú lateral ---------- */
  function visible(item) {
    const m = matchRoute(item.path);
    if (m && m.route.path === item.path) return canAccess(m.route);
    return session.can(item.roles);
  }

  function buildNav() {
    navEl.replaceChildren();
    for (const g of NAV) {
      const items = g.items.filter(visible);
      if (!items.length) continue;
      const gid = `nav-${g.id}`;
      navEl.append(h("div.nav-group",
        h("p.nav-group__label", { id: gid }, g.label),
        h("ul.nav-list", { "aria-labelledby": gid }, items.map((it) => h("li",
          h("a.nav-link", { href: `#${it.path}`, dataset: { path: it.path, exact: it.exact ? "1" : null } }, icon(it.icon, { size: 18 }), h("span", it.label)))))));
    }
    setActive(currentPath);
  }

  function setActive(path) {
    currentPath = path || "/";
    const hit = navFor(currentPath);
    for (const a of navEl.querySelectorAll(".nav-link")) {
      const on = !!hit && a.dataset.path === hit.item.path;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }

  /* ---------- Menú del usuario ---------- */
  function buildUser() {
    const u = session.user;
    if (!u) return;
    const trigger = h("button.user-btn", { type: "button" },
      h("span.avatar", { "aria-hidden": "true" }, initials(u.name)),
      h("span.user-btn__text", h("span.user-btn__name", u.name), h("span.user-btn__role", session.roleLabel)),
      icon("chevron-down", { size: 16, className: "user-btn__chev" }));
    trigger.setAttribute("aria-label", `Menú de ${u.name} (${session.roleLabel})`);
    userSlot.replaceChildren(menu({
      trigger,
      label: "Menú del usuario",
      items: [
        { header: h("div.user-card", h("span.avatar.avatar--lg", { "aria-hidden": "true" }, initials(u.name)), h("div", h("strong", u.name), h("span.muted", u.email), badge(session.roleLabel, u.role === "admin" ? "accent" : "info"))) },
        { label: "Mi perfil", icon: "user", href: "#/perfil" },
        { label: "Ver tienda", icon: "external", href: "../", target: "_blank" },
        { divider: true },
        { label: "Cerrar sesión", icon: "logout", onClick: () => session.logout() },
      ],
    }));
  }

  /* ---------- Cajón en móvil ---------- */
  function isOpen() { return app.classList.contains("is-nav-open"); }
  function openNav() {
    app.classList.add("is-nav-open");
    backdrop.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    sidebar.removeAttribute("inert");
    (navEl.querySelector(".nav-link.is-active") || navEl.querySelector(".nav-link"))?.focus();
  }
  function closeNav(refocus = true) {
    if (!isOpen()) return;
    app.classList.remove("is-nav-open");
    backdrop.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    syncInert();
    if (refocus) menuBtn.focus();
  }
  function syncInert() {
    if (MOBILE.matches && !isOpen()) sidebar.setAttribute("inert", "");
    else sidebar.removeAttribute("inert");
  }
  menuBtn.addEventListener("click", () => (isOpen() ? closeNav() : openNav()));
  closeBtn.addEventListener("click", () => closeNav());
  backdrop.addEventListener("click", () => closeNav());
  sidebar.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { e.preventDefault(); closeNav(); } });
  navEl.addEventListener("click", (e) => { if (e.target.closest(".nav-link") && MOBILE.matches) closeNav(false); });
  MOBILE.addEventListener("change", () => { if (!MOBILE.matches) closeNav(false); syncInert(); });
  syncInert();

  /* ---------- Título de la página ---------- */
  onRoute(({ path, title }) => {
    const hit = navFor(path || "/");
    groupEl.textContent = hit?.group?.label || "";
    groupEl.hidden = !hit?.group?.label;
    titleEl.textContent = title || hit?.item?.label || "";
    setActive(path);
  });

  session.onChange(() => { buildUser(); buildNav(); });
  buildNav();
  buildUser();

  /* ---------- Versión ---------- */
  api.get("/api/health", { auth: false }).then((r) => {
    if (versionEl && r?.version) versionEl.textContent = `Versión ${String(r.version).slice(0, 7)}`;
  }).catch(() => {});
}
