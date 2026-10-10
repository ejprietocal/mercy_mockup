/* ==========================================================================
   Mercy Studio · Panel — core/reauth.js
   Sesión que se cierra mientras se trabaja (venció, se cambió la contraseña en otro equipo, un administrador
   desactivó o editó el acceso): en vez de llevar al ingreso y perder lo escrito, el panel pide la contraseña en un
   diálogo SIN salir de la página y repite la petición que falló (p. ej. «Guardar»).
   · Sin cambios sin guardar y en una lectura (abrir una sección) → al ingreso, como siempre (no hay nada que perder).
   · Cambios sin guardar o una acción (guardar, borrar, subir…) → diálogo «Tu sesión se cerró».
   · Usuario desactivado (403 al entrar) → se dice claramente; la persona puede copiar lo que escribió antes de salir.
   Lo registra main.js con installReauth() (api.js → onSessionLost).
   ========================================================================== */
import { h, uid } from "./dom.js";
import { icon } from "./icons.js";
import { api, loginUrl, onSessionLost, redirectToLogin } from "./api.js";
import { session } from "./session.js";
import { isDirty, leaveTo } from "./router.js";
import { modal } from "./ui.js";

export function installReauth() {
  onSessionLost(async ({ method }) => {
    const action = method !== "GET" && method !== "HEAD";
    if (!action && !isDirty()) {
      redirectToLogin("sesion");
      return "redirect";
    }
    return reauthDialog({ dirty: isDirty() });
  });
}

/** Diálogo para volver a entrar. → "retry" (entró de nuevo) | "dismissed" (lo cerró y sigue en la página) | "redirect" */
function reauthDialog({ dirty }) {
  const user = session.user;
  const pwId = uid("reauth-pw");
  const errId = uid("reauth-e");
  const input = h("input.input", { id: pwId, type: "password", autocomplete: "current-password", spellcheck: "false", required: true, "aria-describedby": errId });
  const toggle = h("button.input-group__btn", { type: "button", "aria-pressed": "false", "aria-label": "Mostrar contraseña", title: "Mostrar contraseña" }, icon("eye", { size: 18 }));
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    toggle.title = toggle.getAttribute("aria-label");
    toggle.replaceChildren(icon(show ? "eye-off" : "eye", { size: 18 }));
    input.focus();
  });
  const err = h("p.field__error", { id: errId, role: "alert", hidden: true });
  const showError = (msg) => {
    err.hidden = !msg;
    err.replaceChildren(...(msg ? [icon("alert-circle", { size: 14 }), h("span", msg)] : []));
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    input.closest(".field")?.classList.toggle("has-error", !!msg);
  };
  input.addEventListener("input", () => showError(""));

  let blocked = false; // usuario desactivado: no tiene sentido seguir intentando
  let lockTimer = 0;
  let enter;
  // withBusy() devuelve el botón a su estado al terminar: deshabilitarlo justo después
  const disableEnter = () => setTimeout(() => { if (enter) enter.disabled = true; }, 0);
  const m = modal({
    title: "Tu sesión se cerró",
    size: "sm",
    className: "reauth",
    content: () => h("form.stack", { novalidate: true, onSubmit: (e) => { e.preventDefault(); enter?.click(); } },
      h("p.modal__text", dirty
        ? "Por seguridad, tu sesión terminó (venció, cambiaste la contraseña en otro equipo o un administrador cambió tu acceso). Lo que escribiste sigue en esta página: vuelve a entrar y lo guardamos."
        : "Por seguridad, tu sesión terminó (venció, cambiaste la contraseña en otro equipo o un administrador cambió tu acceso). Vuelve a entrar para terminar lo que estabas haciendo."),
      h("div.field",
        h("span.field__label", "Cuenta"),
        h("p.reauth__who", icon("user", { size: 16 }), h("span", user?.name || ""), user?.email ? h("span.muted", `· ${user.email}`) : null)),
      h("div.field",
        h("label.field__label", { for: pwId }, "Contraseña"),
        h("div.input-group.input-group--btn", input, toggle),
        err)),
    actions: [
      {
        label: dirty ? "Salir sin guardar" : "Ir al ingreso",
        variant: "ghost",
        value: "redirect",
        onClick: () => { leaveTo(loginUrl({ reason: "sesion" })); },
      },
      {
        label: dirty ? "Entrar y guardar" : "Entrar y continuar",
        variant: "primary",
        busyLabel: "Entrando…",
        onClick: async () => {
          if (blocked) return false;
          const password = input.value;
          if (!password) { showError("Escribe tu contraseña."); input.focus(); return false; }
          try {
            const r = await api.post("/api/auth/login", { email: user?.email || "", password }, { auth: false });
            if (r?.user) session.set(r.user);
            return undefined; // cierra con "retry"
          } catch (e) {
            if (e.status === 403) {
              blocked = true;
              showError(e.message || "Tu usuario está desactivado. Pídele a un administrador que lo active.");
              disableEnter();
            } else if (e.status === 429) {
              const mins = Math.max(1, Math.ceil((e.retryAfter || 900) / 60));
              showError(`Demasiados intentos fallidos. Espera ${mins} ${mins === 1 ? "minuto" : "minutos"} e intenta de nuevo.`);
              disableEnter();
              clearTimeout(lockTimer);
              lockTimer = setTimeout(() => { if (!blocked) enter.disabled = false; }, (e.retryAfter || 900) * 1000);
            } else {
              showError(e.message || "No se pudo entrar. Intenta de nuevo.");
              input.select();
            }
            input.focus();
            return false;
          }
        },
        value: "retry",
      },
    ],
    initialFocus: input,
  });
  enter = m.footer.querySelector(".btn--primary");
  return m.result.then((v) => {
    clearTimeout(lockTimer);
    return v === "retry" ? "retry" : v === "redirect" ? "redirect" : "dismissed";
  });
}
