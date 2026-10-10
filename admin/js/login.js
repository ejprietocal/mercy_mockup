/* ==========================================================================
   Mercy Studio · Panel — login.js (página admin/login.html)
   · Si ya hay sesión → entra directo al panel (a ?next= o al Escritorio).
   · Errores claros: campos vacíos, credenciales incorrectas (mensaje genérico del servidor),
     usuario desactivado (403), demasiados intentos (429 con los minutos de espera), sin conexión.
   · next solo acepta rutas del panel ("#/…") para evitar redirecciones abiertas.
   ========================================================================== */
import { api } from "./core/api.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

/** "#/productos/fe" válido; cualquier otra cosa → "#/" */
function safeNext(v) {
  return typeof v === "string" && /^#\/[^\s\\]*$/.test(v) && !v.startsWith("#//") ? v : "#/";
}
const next = safeNext(params.get("next"));
const goPanel = () => location.replace(`./${next}`);

const form = $("login-form");
const email = $("login-email");
const password = $("login-password");
const remember = $("login-remember");
const submit = $("login-submit");
const submitLabel = submit.querySelector(".btn__label");
const errorBox = $("login-error");
const errorText = $("login-error-text");
const noticeBox = $("login-notice");
const noticeText = $("login-notice-text");
const toggle = $("login-toggle");

let lockTimer = null;

/* ---------- Avisos de llegada ---------- */
const motivo = params.get("motivo");
if (params.get("salida") === "1") showNotice("Cerraste sesión. ¡Hasta pronto!");
else if (motivo === "sesion") showNotice("Tu sesión expiró. Vuelve a ingresar para continuar donde ibas.");

function showNotice(msg) {
  noticeText.textContent = msg;
  noticeBox.hidden = false;
}

/* ---------- Errores ---------- */
function fieldError(input, msg) {
  const err = $(`${input.id}-err`);
  err.textContent = msg || "";
  err.hidden = !msg;
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  input.closest(".field")?.classList.toggle("has-error", !!msg);
}

function showError(msg) {
  errorText.textContent = msg;
  errorBox.hidden = !msg;
  if (msg) noticeBox.hidden = true;
}

function clearErrors() {
  fieldError(email, "");
  fieldError(password, "");
  showError("");
}

/* ---------- Mostrar / ocultar contraseña ---------- */
const EYE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/></svg>';
toggle.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(show));
  const label = show ? "Ocultar contraseña" : "Mostrar contraseña";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
  toggle.innerHTML = show ? EYE_OFF : EYE;
  password.focus();
});

/* ---------- Bloqueo por demasiados intentos ---------- */
function lockFor(seconds) {
  clearInterval(lockTimer);
  let left = Math.max(1, Math.ceil(seconds));
  const tick = () => {
    const mins = Math.ceil(left / 60);
    showError(`Demasiados intentos fallidos. Por seguridad, espera ${mins} ${mins === 1 ? "minuto" : "minutos"} antes de volver a intentarlo.`);
    submit.disabled = true;
    submitLabel.textContent = left > 60 ? `Espera ${mins} min` : `Espera ${left} s`;
    if (--left < 0) {
      clearInterval(lockTimer);
      submit.disabled = false;
      submitLabel.textContent = "Ingresar";
      showError("");
    }
  };
  tick();
  lockTimer = setInterval(tick, 1000);
}

function setBusy(busy) {
  submit.disabled = busy;
  submit.setAttribute("aria-busy", busy ? "true" : "false");
  submitLabel.textContent = busy ? "Ingresando…" : "Ingresar";
  let sp = submit.querySelector(".spinner");
  if (busy && !sp) {
    sp = document.createElement("span");
    sp.className = "spinner";
    sp.setAttribute("aria-hidden", "true");
    submit.prepend(sp);
  } else if (!busy && sp) sp.remove();
}

/* ---------- Envío ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submit.disabled) return;
  clearErrors();
  const em = email.value.trim();
  const pw = password.value;
  let bad = null;
  if (!em) { fieldError(email, "Escribe tu correo."); bad = bad || email; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { fieldError(email, "Escribe un correo válido (por ejemplo, nombre@mercystudio.co)."); bad = bad || email; }
  if (!pw) { fieldError(password, "Escribe tu contraseña."); bad = bad || password; }
  if (bad) { bad.focus(); return; }

  setBusy(true);
  try {
    await api.post("/api/auth/login", { email: em, password: pw, remember: remember.checked }, { auth: false });
    submitLabel.textContent = "Entrando…";
    goPanel();
  } catch (err) {
    setBusy(false);
    if (err.status === 429) {
      lockFor(err.retryAfter || 900);
      return;
    }
    if (err.status === 422 && err.fields) {
      if (err.fields.email) fieldError(email, err.fields.email);
      if (err.fields.password) fieldError(password, err.fields.password);
      (err.fields.email ? email : password).focus();
      return;
    }
    showError(err.message || "No se pudo ingresar. Intenta de nuevo.");
    if (err.status === 401) {
      password.select();
      password.focus();
    }
  }
});

for (const input of [email, password]) input.addEventListener("input", () => fieldError(input, ""));

/* ---------- ¿Ya hay sesión? ---------- */
(async () => {
  // La cookie indicadora mercy_admin=1 existe solo mientras hay sesión: sin ella no se pregunta al servidor
  if (/(?:^|;\s*)mercy_admin=1(?:;|$)/.test(document.cookie)) {
    try {
      await api.get("/api/auth/me", { auth: false });
      goPanel();
      return;
    } catch {
      // sesión vencida: se queda en el formulario
    }
  }
  if (!email.value) email.focus();
})();
