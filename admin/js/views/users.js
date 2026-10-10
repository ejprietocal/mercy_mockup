/* ==========================================================================
   Mercy Studio · Panel — views/users.js
   Usuarios (#/usuarios, solo administrador; contrato §3 "Usuarios", §4.3 y §5):
   · Lista del equipo: avatar con iniciales, nombre, correo, rol, acceso activo/inactivo, último ingreso, "Tú".
   · Crear y editar en un diálogo: nombre, correo, rol (con lo que permite cada uno), acceso activo y
     contraseña (mínimo 10 caracteres) con generador seguro, mostrar y copiar; al crear o restablecer
     se muestran los datos de acceso para compartirlos.
   · Eliminar con confirmación. Mensajes claros para los 409 del servidor: último administrador activo,
     no puedes borrarte/desactivarte a ti mismo, correo repetido.
   · Tabla de permisos por rol (igual a la del contrato §5; el servidor vuelve a verificar siempre).
   ========================================================================== */
import { h, replace, uid } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { api } from "../core/api.js";
import { session } from "../core/session.js";
import { createForm, fields as f } from "../core/forms.js";
import { badge, button, card, confirmDialog, dataTable, modal, pageHeader, showApiError, statusBadge, toast } from "../core/ui.js";
import { date, dateTime, initials, plural, relativeTime } from "../core/format.js";

const enc = encodeURIComponent;
/** Concurrencia optimista (§4.3): X-Base-Updated-At = updatedAt leído; si otra persona lo cambió el servidor responde 409 conflict con `current`. */
const baseHeaders = (u) => (u?.updatedAt ? { "X-Base-Updated-At": u.updatedAt } : {});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LAST_ADMIN = "Debe quedar al menos un administrador activo. Dale el rol Administrador a otra persona antes de cambiar este usuario.";

export const ROLE_HELP = {
  admin: "Todo el panel: contenido, productos y medios, y además cupones, suscriptores, usuarios, ajustes e historial de cambios.",
  editor: "Contenido del sitio, productos, categorías, reseñas y medios. No ve cupones, suscriptores, usuarios, ajustes ni el historial.",
};

/** Contrato §5 (Roles). */
const PERMS = [
  { label: "Escritorio y Mi perfil", admin: true, editor: true },
  { label: "Inicio, Textos y Modal de descuento (textos e imagen)", admin: true, editor: true },
  { label: "Productos, Categorías, Colores, Colecciones, Hormas, Guía de tallas y Reseñas", admin: true, editor: true },
  { label: "Biblioteca de medios", admin: true, editor: true },
  { label: "Cupón de bienvenida del modal de descuento", admin: true, editor: false },
  { label: "Cupones y Suscriptores", admin: true, editor: false },
  { label: "Usuarios y Ajustes generales", admin: true, editor: false },
  { label: "Actividad y Revisiones (ver y restaurar)", admin: true, editor: false },
];

/* ---------- Utilidades ---------- */
/** Copia al portapapeles (con respaldo para navegadores sin permiso). → true si se copió. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const host = document.querySelector("dialog[open]") || document.body;
    const ta = h("textarea", { style: "position:fixed;top:0;left:0;opacity:0;pointer-events:none", "aria-hidden": "true" });
    ta.value = text;
    host.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Entero aleatorio uniforme en [0, n) (sin sesgo de módulo). */
function randomInt(n) {
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= max);
  return buf[0] % n;
}

/** Contraseña de 16 caracteres con mayúsculas, minúsculas, números y símbolos (sin caracteres confusos). */
export function generatePassword(length = 16) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!#$%&*+-=?@"];
  const all = sets.join("");
  const out = sets.map((s) => s[randomInt(s.length)]);
  while (out.length < length) out.push(all[randomInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

/** 0–4 según largo y variedad (orientativo, como en "Mi perfil"). */
function strength(pw) {
  if (!pw) return 0;
  let score = [...pw].length >= 10 ? 1 : 0;
  if (pw.length >= 14) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds >= 3) score++;
  if (kinds >= 4 || pw.length >= 20) score++;
  return Math.min(4, score);
}
const LEVELS = ["Muy corta (mínimo 10 caracteres)", "Aceptable", "Buena", "Fuerte", "Muy fuerte"];

const avatar = (u) => h("span.avatar.mk-avatar", { class: !u.active && "is-off", "aria-hidden": "true" }, initials(u.name));
const loginCell = (u) => (u.lastLoginAt
  ? h("time.nowrap", { datetime: u.lastLoginAt, title: dateTime(u.lastLoginAt) }, relativeTime(u.lastLoginAt))
  : h("span.muted", "Nunca ha entrado"));

/* ---------- Datos de acceso (tras crear o restablecer) ---------- */
function accessDialog(user, password, { created }) {
  const url = `${location.origin}/admin/`;
  const text = `Panel de Mercy Studio\n${url}\nCorreo: ${user.email}\nContraseña: ${password}`;
  modal({
    title: created ? "Usuario creado" : "Contraseña restablecida",
    description: "Comparte estos datos por un canal privado. Por seguridad no volveremos a mostrar la contraseña.",
    size: "sm",
    content: [
      h("dl.kv.mk-access",
        h("dt", "Panel"), h("dd", h("code", url)),
        h("dt", "Correo"), h("dd", user.email),
        h("dt", "Contraseña"), h("dd", h("code.mk-access__pw", password))),
      h("p.muted.small", "La persona puede cambiarla cuando quiera en «Mi perfil»."),
    ],
    actions: [
      { label: "Copiar datos de acceso", icon: "copy", onClick: async () => { const ok = await copyText(text); toast(ok ? "Datos de acceso copiados." : "No se pudo copiar. Cópialos a mano.", { type: ok ? "success" : "warning" }); return false; } },
      { label: "Listo", variant: "primary", autofocus: true },
    ],
  });
}

/* ---------- Crear / editar ---------- */
/**
 * Abre el diálogo de un usuario (nuevo si `user` es null). → Promise<usuario guardado | null>
 *   opts.resetPassword: abre con "Restablecer la contraseña" marcado.
 */
function userDialog(user, { resetPassword = false } = {}) {
  const me = session.user;
  const isNew = !user;
  const isSelf = !!user && user.id === me?.id;
  let withPassword = isNew || resetPassword;
  let saved = null;
  let sentPassword = "";

  const form = createForm({
    value: { name: user?.name || "", email: user?.email || "", role: user?.role || "editor", active: user ? !!user.active : true, password: "" },
    saveBar: false,
    guard: false,
    successMessage: null,
    onSubmit: async (v) => {
      const body = { name: v.name.trim(), email: v.email.trim(), role: v.role, active: !!v.active };
      if (withPassword && v.password) body.password = v.password;
      try {
        const r = isNew ? await api.post("/api/admin/users", body) : await api.put(`/api/admin/users/${enc(user.id)}`, body, { headers: baseHeaders(user) });
        saved = r.item;
        sentPassword = body.password || "";
      } catch (e) {
        if (e.status === 409 && e.fields?.role) e.fields.role = LAST_ADMIN;
        throw e;
      }
      return { name: saved.name, email: saved.email, role: saved.role, active: saved.active, password: "" };
    },
  });

  /* --- Contraseña --- */
  const pwSlot = h("div.mk-pw");
  const meter = h("div.pw-meter", { "aria-hidden": "true", dataset: { level: 0 } }, h("span"), h("span"), h("span"), h("span"));
  const meterLabel = h("p.pw-meter__label", { "aria-live": "polite" });
  const updMeter = () => {
    const p = form.get("password") || "";
    const lvl = strength(p);
    meter.dataset.level = String(p ? Math.max(1, lvl) : 0);
    meterLabel.textContent = p ? `Seguridad: ${LEVELS[lvl]}` : "";
  };
  form.on("change", updMeter);

  function renderPassword() {
    if (!withPassword) { replace(pwSlot, null); return; }
    const field = f.password(form, "password", {
      label: isNew ? "Contraseña" : "Nueva contraseña",
      required: true, minlength: 10, maxlength: 200, autocomplete: "new-password",
      help: "Mínimo 10 caracteres. Una frase larga o una contraseña generada son lo más seguro.",
      validate: (v) => (v && !v.trim() ? "La contraseña no puede ser solo espacios." : null),
    });
    const show = () => {
      const input = field.querySelector("input");
      if (input?.type === "password") field.querySelector(".input-group__btn")?.click();
    };
    const copyBtn = button({
      label: "Copiar", icon: "copy", size: "sm",
      onClick: async () => {
        const pw = form.get("password");
        if (!pw) { toast("Primero escribe o genera una contraseña.", { type: "warning" }); return; }
        const ok = await copyText(pw);
        toast(ok ? "Contraseña copiada." : "No se pudo copiar. Cópiala a mano.", { type: ok ? "success" : "warning" });
      },
    });
    const genBtn = button({ label: "Generar contraseña segura", icon: "key", size: "sm", onClick: () => { form.set("password", generatePassword()); show(); field.querySelector("input")?.focus(); } });
    replace(pwSlot, field, h("div.mk-pw__tools", genBtn, copyBtn), h("div.stack-sm", meter, meterLabel));
    updMeter();
  }

  let resetToggle = null;
  if (!isNew) {
    const rid = uid("rp");
    const cb = h("input.check__input", { type: "checkbox", id: rid, checked: withPassword });
    cb.addEventListener("change", () => {
      withPassword = cb.checked;
      if (!withPassword) form.set("password", "");
      renderPassword();
      if (withPassword) pwSlot.querySelector("input")?.focus();
    });
    resetToggle = h("div.field.field--check",
      h("label.check", { for: rid }, cb,
        h("span.check__box", { "aria-hidden": "true" }, icon("check", { size: 14, strokeWidth: 3 })),
        h("span.check__label", "Restablecer la contraseña", h("span.check__desc", isSelf ? "Tus otras sesiones abiertas se cerrarán." : "Escribe o genera una nueva. Se cierran sus sesiones abiertas."))));
  }
  renderPassword();

  /* --- Guardar --- */
  async function save() {
    if (form.saving) return;
    if (isSelf && user.role === "admin" && form.get("role") !== "admin") {
      const ok = await confirmDialog({
        title: "¿Quitarte el rol de Administrador?",
        message: "Dejarás de ver Cupones, Suscriptores, Usuarios, Ajustes y el historial de cambios. Solo otro administrador podrá devolverte el rol.",
        confirmLabel: "Sí, quitarme el rol",
        danger: true,
      });
      if (!ok) return;
    }
    if (await form.submit()) m.close(saved);
  }

  const body = h("form.form.mk-user-form", { novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } },
    f.row(
      f.text(form, "name", { label: "Nombre", required: true, maxlength: 80, autocomplete: "off", help: "Aparece en el historial de cambios." }),
      f.text(form, "email", { label: "Correo electrónico", type: "email", required: true, inputmode: "email", autocomplete: "off", spellcheck: false, help: "Es su usuario para entrar al panel.", validate: (v) => (EMAIL_RE.test(String(v).trim()) ? null : "Escribe un correo válido, p. ej. nombre@correo.com.") }),
    ),
    f.radio(form, "role", {
      label: "Rol",
      options: [
        { value: "admin", label: "Administrador", help: ROLE_HELP.admin },
        { value: "editor", label: "Editor", help: ROLE_HELP.editor },
      ],
    }),
    f.switch(form, "active", {
      label: "Acceso activo",
      description: isSelf ? "No puedes desactivar tu propio usuario." : "Si lo apagas, no puede entrar al panel y se cierran sus sesiones abiertas.",
      disabled: isSelf,
    }),
    resetToggle,
    pwSlot);
  body.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(e.target.type)) {
      e.preventDefault();
      save();
    }
  });

  const m = modal({
    title: isNew ? "Nuevo usuario" : isSelf ? "Editar tu usuario" : `Editar a ${user.name}`,
    description: isNew ? "La persona entra al panel con este correo y contraseña." : user.email,
    size: "md",
    content: body,
    actions: [
      { label: "Cancelar", value: null },
      { label: isNew ? "Crear usuario" : "Guardar cambios", icon: isNew ? "plus" : "check", variant: "primary", onClick: async () => { await save(); return false; } },
    ],
    onClose: () => form.destroy(),
  });
  return m.result.then((v) => (v && typeof v === "object" ? { user: v, password: sentPassword } : null));
}

/* ==========================================================================
   Vista
   ========================================================================== */
export default [
  {
    path: "/usuarios",
    title: "Usuarios",
    roles: ["admin"],
    async render(el, params, ctx) {
      let { items: users } = await api.get("/api/admin/users", { signal: ctx.signal });
      const meId = () => session.user?.id;
      const subtitle = h("p.page-subtitle");
      const renderSubtitle = () => {
        const admins = users.filter((u) => u.role === "admin" && u.active).length;
        subtitle.textContent = `${plural(users.length, "persona", "personas")} con acceso al panel · ${plural(admins, "administrador activo", "administradores activos")}.`;
      };

      const upsert = (u) => {
        users = users.some((x) => x.id === u.id) ? users.map((x) => (x.id === u.id ? u : x)) : [...users, u];
        table.setRows(users);
        renderSubtitle();
      };

      async function openUser(u, opts) {
        const r = await userDialog(u, opts);
        if (!r) return;
        const saved = r.user;
        upsert(saved);
        if (!u) toast(`Usuario ${saved.name} creado.`);
        else toast(r.password ? `Cambios guardados. Se cerraron las sesiones abiertas de ${saved.name}.` : "Cambios guardados.");
        if (saved.id === meId()) {
          session.set(saved);
          if (saved.role !== "admin") {
            toast("Ahora tienes el rol Editor.", { type: "info" });
            ctx.navigate("/", { force: true });
            return;
          }
        }
        if (r.password) accessDialog(saved, r.password, { created: !u });
      }

      async function toggleActive(u) {
        const off = u.active;
        if (off) {
          const ok = await confirmDialog({
            title: `¿Quitarle el acceso a ${u.name}?`,
            message: "No podrá entrar al panel y se cerrarán sus sesiones abiertas. Puedes volver a activarlo cuando quieras.",
            confirmLabel: "Desactivar acceso",
            danger: true,
          });
          if (!ok) return;
        }
        try {
          const { item } = await api.put(`/api/admin/users/${enc(u.id)}`, { name: u.name, email: u.email, role: u.role, active: !u.active }, { headers: baseHeaders(u) });
          upsert(item);
          toast(item.active ? `${item.name} ya puede entrar al panel.` : `${item.name} ya no puede entrar al panel.`);
        } catch (e) {
          if (e.isConflict) upsert(e.data.current); // otra persona lo cambió: la fila muestra la versión vigente
          conflictDialog(e, "No se pudo cambiar el acceso");
        }
      }

      /** Los 409 de usuarios (último admin, tú mismo) se explican en un diálogo; el resto como siempre. */
      function conflictDialog(e, title) {
        if (e?.status !== 409) { showApiError(e); return; }
        const last = /administrador activo/i.test(e.message);
        modal({
          title,
          size: "sm",
          content: [h("p.modal__text", last ? LAST_ADMIN : e.message), !last && /propio usuario/i.test(e.message) ? h("p.muted", "Pídele a otro administrador que lo haga por ti.") : null],
          actions: [{ label: "Entendido", variant: "primary" }],
        });
      }

      async function remove(u) {
        if (u.id === meId()) {
          modal({
            title: "No puedes eliminarte",
            size: "sm",
            content: [h("p.modal__text", "No puedes eliminar tu propio usuario."), h("p.muted", "Si vas a dejar el equipo, pídele a otro administrador que te elimine o que te quite el acceso.")],
            actions: [{ label: "Entendido", variant: "primary" }],
          });
          return;
        }
        const ok = await confirmDialog({
          title: `¿Eliminar a ${u.name}?`,
          message: `${u.email} pierde el acceso al panel de inmediato y se cierran sus sesiones. Su nombre se conserva en el historial de cambios. No se puede deshacer.`,
          confirmLabel: "Eliminar usuario",
          danger: true,
        });
        if (!ok) return;
        try {
          await api.del(`/api/admin/users/${enc(u.id)}`);
          users = users.filter((x) => x.id !== u.id);
          table.setRows(users);
          renderSubtitle();
          toast(`Usuario ${u.name} eliminado.`);
        } catch (e) {
          conflictDialog(e, "No se puede eliminar");
        }
      }

      const table = dataTable({
        caption: "Usuarios del panel",
        stateKey: "usuarios",
        search: users.length > 8 ? { placeholder: "Buscar por nombre o correo…", keys: ["email"] } : false,
        rows: users,
        rowKey: (u) => u.id,
        onRowClick: (u) => openUser(u),
        columns: [
          {
            key: "name", label: "Usuario", sortable: true, value: (u) => u.name,
            render: (u) => h("div.mk-user", avatar(u),
              h("div.mk-user__text",
                h("span.mk-user__name", h("span", u.name), u.id === meId() ? badge("Tú", "neutral") : null),
                h("span.mk-user__email", u.email),
                h("div.mk-only-mobile.mk-cell-sub", statusBadge(u.role), !u.active ? statusBadge("inactive") : null))),
          },
          { key: "role", label: "Rol", sortable: true, render: (u) => statusBadge(u.role), value: (u) => (u.role === "admin" ? 0 : 1), hideOn: "mobile" },
          { key: "active", label: "Acceso", sortable: true, render: (u) => statusBadge(u.active ? "active" : "inactive"), value: (u) => (u.active ? 0 : 1), hideOn: "mobile" },
          { key: "lastLoginAt", label: "Último ingreso", sortable: true, render: loginCell, value: (u) => u.lastLoginAt || "", hideOn: "mobile" },
          { key: "createdAt", label: "En el equipo desde", sortable: true, render: (u) => h("time.nowrap", { datetime: u.createdAt, title: dateTime(u.createdAt) }, date(u.createdAt)), hideOn: "tablet" },
        ],
        rowActions: (u) => {
          const self = u.id === meId();
          return [
            { label: "Editar", icon: "edit", primary: true, onClick: () => openUser(u) },
            { label: "Restablecer contraseña", icon: "key", onClick: () => openUser(u, { resetPassword: true }) },
            { label: self ? "No puedes desactivarte" : u.active ? "Desactivar acceso" : "Activar acceso", icon: u.active ? "lock" : "check-circle", disabled: self, onClick: () => toggleActive(u) },
            { divider: true },
            { label: "Eliminar", icon: "trash", danger: true, onClick: () => remove(u) },
          ];
        },
        empty: { icon: "users", title: "Aún no hay usuarios" },
      });
      renderSubtitle();

      const yes = () => h("span.mk-perm.is-yes", icon("check", { size: 16, strokeWidth: 2.4 }), h("span.sr-only", "Sí"));
      const no = () => h("span.mk-perm.is-no", icon("minus", { size: 16 }), h("span.sr-only", "No"));
      const perms = h("div.table-wrap", h("table.table.mk-perms",
        h("caption.sr-only", "Permisos de cada rol"),
        h("thead", h("tr", h("th", { scope: "col" }, "Sección del panel"), h("th.is-center", { scope: "col" }, "Administrador"), h("th.is-center", { scope: "col" }, "Editor"))),
        h("tbody", PERMS.map((p) => h("tr", h("th", { scope: "row" }, p.label), h("td.is-center", p.admin ? yes() : no()), h("td.is-center", p.editor ? yes() : no()))))));

      const header = pageHeader({
        title: "Usuarios",
        breadcrumbs: [{ label: "Sistema" }],
        actions: [button({ label: "Nuevo usuario", icon: "plus", variant: "primary", onClick: () => openUser(null) })],
      });
      header.querySelector(".page-header__titles")?.append(subtitle);

      el.append(h("div.page",
        header,
        card({ title: "Equipo", description: "Haz clic en una persona para editar sus datos, su rol o su contraseña.", flush: true, className: "mk-tbl", body: table.el }),
        h("div.mk-roles",
          card({
            title: "Permisos por rol",
            description: "Lo que puede ver y editar cada rol. El servidor también lo verifica en cada cambio.",
            flush: true,
            body: perms,
          }),
          card({
            title: "Buenas prácticas",
            className: "mk-tips",
            body: h("ul.mk-tips__list",
              h("li", icon("users", { size: 16 }), h("span", "Crea un usuario por persona: así el historial muestra quién hizo cada cambio.")),
              h("li", icon("user", { size: 16 }), h("span", "Da el rol Administrador solo a quien maneje cupones, clientes o el equipo. Para editar contenido basta Editor.")),
              h("li", icon("lock", { size: 16 }), h("span", "Si alguien deja el equipo, desactiva su acceso o elimínalo. Se cierran sus sesiones al instante.")),
              h("li", icon("key", { size: 16 }), h("span", "Debe quedar siempre al menos un administrador activo."))),
          }))));
    },
  },
];
