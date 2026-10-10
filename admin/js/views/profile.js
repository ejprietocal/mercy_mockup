/* ==========================================================================
   Mercy Studio · Panel — views/profile.js
   Mi perfil (#/perfil): nombre y correo (PUT /api/auth/me) y cambio de contraseña con
   confirmación (POST /api/auth/password; el servidor cierra las demás sesiones).
   ========================================================================== */
import { h } from "../core/dom.js";
import { api } from "../core/api.js";
import { session } from "../core/session.js";
import { createForm, fields as f } from "../core/forms.js";
import { badge, pageHeader, section, toast } from "../core/ui.js";
import { dateTime, relativeTime } from "../core/format.js";

/** 0–4 según largo y variedad (solo orientativo; el servidor exige mínimo 10 caracteres). */
function strength(pw) {
  if (!pw) return 0;
  let score = pw.length >= 10 ? 1 : 0;
  if (pw.length >= 14) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds >= 3) score++;
  if (kinds >= 4 || pw.length >= 20) score++;
  return Math.min(4, score);
}
const LEVELS = ["Muy corta (mínimo 10 caracteres)", "Aceptable", "Buena", "Fuerte", "Muy fuerte"];

export default [
  {
    path: "/perfil",
    title: "Mi perfil",
    async render(el, params, ctx) {
      const user = await session.load();

      /* --- Datos de la cuenta --- */
      const account = createForm({
        ctx,
        value: { name: user.name, email: user.email },
        saveBar: false,
        successMessage: "Perfil actualizado.",
        onSubmit: async (v) => {
          const { user: u } = await api.put("/api/auth/me", { name: v.name.trim(), email: v.email.trim() });
          session.set(u);
          renderMeta();
          return { name: u.name, email: u.email };
        },
      });
      const meta = h("dl.kv");
      function renderMeta() {
        const u = session.user;
        meta.replaceChildren(
          h("dt", "Rol"), h("dd", badge(session.roleLabel, u.role === "admin" ? "accent" : "info")),
          h("dt", "Último ingreso"), h("dd", u.lastLoginAt ? h("time", { datetime: u.lastLoginAt, title: dateTime(u.lastLoginAt) }, relativeTime(u.lastLoginAt)) : "—"),
          h("dt", "En el equipo desde"), h("dd", dateTime(u.createdAt)),
        );
      }
      renderMeta();

      /* --- Contraseña --- */
      const empty = { currentPassword: "", newPassword: "", confirm: "" };
      const pw = createForm({
        ctx,
        value: empty,
        saveBar: false,
        guard: false,
        saveLabel: "Cambiar contraseña",
        successMessage: null,
        validate: (v) => {
          const out = {};
          if (v.newPassword && v.newPassword === v.currentPassword) out.newPassword = "La nueva contraseña debe ser distinta de la actual.";
          if (v.confirm !== v.newPassword) out.confirm = "Las contraseñas no coinciden.";
          return out;
        },
        onSubmit: async (v) => {
          await api.post("/api/auth/password", { currentPassword: v.currentPassword, newPassword: v.newPassword });
          toast("Contraseña actualizada. Cerramos tu sesión en los demás equipos.", { title: "Listo" });
          return { ...empty };
        },
      });
      const meter = h("div.pw-meter", { "aria-hidden": "true", dataset: { level: 0 } }, h("span"), h("span"), h("span"), h("span"));
      const meterLabel = h("p.pw-meter__label", { "aria-live": "polite" });
      const updMeter = () => {
        const p = pw.get("newPassword") || "";
        const lvl = strength(p);
        meter.dataset.level = String(p ? Math.max(1, lvl) : 0);
        meterLabel.textContent = p ? `Seguridad: ${LEVELS[lvl]}` : "";
      };
      pw.on("change", updMeter);

      el.append(h("div.page.page--form",
        pageHeader({ title: "Mi perfil", subtitle: "Tus datos de acceso al panel." }),
        section({
          title: "Tu cuenta",
          description: "Tu nombre aparece en el historial de cambios. El correo es tu usuario para ingresar.",
          body: account.element(
            f.row(
              f.text(account, "name", { label: "Nombre", required: true, maxlength: 80, autocomplete: "name" }),
              f.text(account, "email", { label: "Correo electrónico", type: "email", required: true, inputmode: "email", autocomplete: "email", spellcheck: false, validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? null : "Escribe un correo válido.") }),
            ),
            meta,
            account.actions({ saveLabel: "Guardar cambios" }),
          ),
        }),
        section({
          title: "Contraseña",
          description: "Usa al menos 10 caracteres; una frase larga es más segura y fácil de recordar. Al cambiarla se cierra tu sesión en los demás equipos.",
          body: pw.element(
            f.password(pw, "currentPassword", { label: "Contraseña actual", required: true, autocomplete: "current-password" }),
            f.row(
              h("div.stack-sm",
                f.password(pw, "newPassword", { label: "Nueva contraseña", required: true, minlength: 10, maxlength: 200, autocomplete: "new-password" }),
                meter, meterLabel),
              f.password(pw, "confirm", { label: "Repite la nueva contraseña", required: true, autocomplete: "new-password" }),
            ),
            pw.actions({ saveLabel: "Cambiar contraseña", showDiscard: false }),
          ),
        })));
      updMeter();
    },
  },
];
