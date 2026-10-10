/* ==========================================================================
   Mercy Studio — server/lib/media.js
   Biblioteca de medios (media.json + DATA_DIR/uploads/AAAA/MM/<id>-<slug>.<ext>):
   · Tipo detectado por FIRMA de bytes (no por la extensión ni el Content-Type):
     JPEG, PNG, GIF, WebP, AVIF, MP4/MOV (ftyp), WebM. SVG/HTML/otros → 415.
   · Subida en streaming (imágenes ≤ 12 MB, video ≤ 150 MB), miniatura ≤ 2 MB.
   · Usos: dónde aparece la URL en el contenido ("products/fe", "home.hero"…).
   ========================================================================== */
import { open, mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "./db.js";
import { err, readBuffer, receiveToFile } from "./http.js";
import { colombiaYearMonth, fold, newId, nowIso, slugify } from "./util.js";

export const MEDIA_LIMITS = { image: 12 * 1024 * 1024, video: 150 * 1024 * 1024, thumb: 2 * 1024 * 1024 };
const FORMAT_MSG = "Formato no permitido. Sube JPG, PNG, GIF, WebP o AVIF (imágenes) o MP4, MOV o WebM (video).";
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4VP", "M4VH", "dash", "mmp4", "MSNV", "f4v ", "3gp4", "3gp5", "3gp6", "3g2a"]);

/** Detecta el tipo real por firma. → { kind, mime, ext } | null */
export function sniff(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(PNG_SIG)) return { kind: "image", mime: "image/png", ext: "png" };
  const a6 = b.toString("latin1", 0, 6);
  if (a6 === "GIF87a" || a6 === "GIF89a") return { kind: "image", mime: "image/gif", ext: "gif" };
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  if (b.toString("latin1", 4, 8) === "ftyp") {
    const size = b.readUInt32BE(0);
    const major = b.toString("latin1", 8, 12);
    const brands = [major];
    for (let i = 16; i + 4 <= Math.min(size, b.length, 256); i += 4) brands.push(b.toString("latin1", i, i + 4));
    if (major === "avif" || major === "avis" || ((major === "mif1" || major === "msf1") && (brands.includes("avif") || brands.includes("avis")))) {
      return { kind: "image", mime: "image/avif", ext: "avif" };
    }
    if (major === "qt  ") return { kind: "video", mime: "video/quicktime", ext: "mov" };
    if (MP4_BRANDS.has(major)) return { kind: "video", mime: "video/mp4", ext: "mp4" };
    return null; // HEIC, audio M4A, etc.
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return b.subarray(0, 64).includes(Buffer.from("webm")) ? { kind: "video", mime: "video/webm", ext: "webm" } : null;
  }
  return null;
}

/** Dimensiones de la imagen a partir de la cabecera del archivo (o null). */
export function imageSize(b, mime) {
  try {
    if (mime === "image/png" && b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === "image/gif" && b.length >= 10) return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === "image/webp" && b.length >= 30) {
      const chunk = b.toString("latin1", 12, 16);
      if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
        return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
      }
      if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
    if (mime === "image/avif") {
      const at = b.indexOf("ispe", 0, "latin1");
      if (at > 0 && at + 16 <= b.length) return { width: b.readUInt32BE(at + 8), height: b.readUInt32BE(at + 12) };
    }
  } catch {
    // cabecera truncada o rara: sin dimensiones
  }
  return null;
}

async function readHead(file, n) {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function headerDim(v) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) && n > 0 && n <= 30000 ? n : null;
}

function cleanName(raw, ext) {
  let s = "";
  if (raw) {
    try { s = decodeURIComponent(String(raw)); } catch { s = String(raw); }
  }
  s = s.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>"]/g, "").trim().slice(0, 120);
  return s || `archivo.${ext}`;
}

export class MediaService {
  constructor(app) {
    this.app = app;
    this.db = app.db;
  }

  async init() { await this.db.load("media", []); }
  get items() { return this.db.get("media"); }
  get(id) { return this.items.find((m) => m.id === id) || null; }

  list({ kind, q } = {}) {
    let items = this.items;
    if (kind === "image" || kind === "video") items = items.filter((m) => m.kind === kind);
    if (q) {
      const k = fold(q).trim();
      if (k) items = items.filter((m) => fold(`${m.name} ${m.alt}`).includes(k));
    }
    return items;
  }

  stats() {
    return { total: this.items.length, bytes: this.items.reduce((s, m) => s + (m.bytes || 0), 0) };
  }

  /** Ruta física de una URL /uploads/… propia. */
  #fileOf(url) {
    const clean = String(url || "").split(/[?#]/)[0];
    if (!clean.startsWith("/uploads/")) return null;
    const parts = clean.slice("/uploads/".length).split("/");
    if (parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) return null;
    return join(this.db.uploadsDir, ...parts);
  }

  /** POST /api/admin/media (cuerpo binario crudo). */
  async upload(ctx, user) {
    const declared = String(ctx.req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (declared === "image/svg+xml" || declared.includes("svg")) throw err.unsupported("Los archivos SVG no están permitidos por seguridad. Usa PNG, JPG o WebP.");
    let limit;
    if (declared.startsWith("image/")) limit = MEDIA_LIMITS.image;
    else if (declared.startsWith("video/") || !declared || declared === "application/octet-stream") limit = MEDIA_LIMITS.video;
    else throw err.unsupported(FORMAT_MSG);

    const tmp = join(this.db.tmpDir, newId("up-"));
    const bytes = await receiveToFile(ctx, tmp, limit);
    try {
      if (!bytes) throw err.badRequest("El archivo está vacío.");
      const head = await readHead(tmp, 512 * 1024);
      const t = sniff(head);
      if (!t) throw err.unsupported(FORMAT_MSG);
      if (t.kind === "image" && bytes > MEDIA_LIMITS.image) throw err.tooLarge("La imagen supera el máximo de 12 MB.");
      const parsed = t.kind === "image" ? imageSize(head, t.mime) : null;
      const hw = headerDim(ctx.req.headers["x-media-width"]);
      const hh = headerDim(ctx.req.headers["x-media-height"]);
      // El panel envía las medidas ya corregidas por la orientación EXIF; si no vienen, las de la cabecera.
      const width = hw && hh ? hw : parsed?.width || hw || null;
      const height = hw && hh ? hh : parsed?.height || hh || null;
      const name = cleanName(ctx.req.headers["x-file-name"], t.ext);
      const id = newId("m-");
      const [y, m] = colombiaYearMonth();
      const dir = join(this.db.uploadsDir, y, m);
      await mkdir(dir, { recursive: true });
      const slug = slugify(name.replace(/\.[^.]+$/, ""), 40) || (t.kind === "video" ? "video" : "imagen");
      const fileName = `${id}-${slug}.${t.ext}`;
      await rename(tmp, join(dir, fileName));
      const item = {
        id, kind: t.kind, mime: t.mime, url: `/uploads/${y}/${m}/${fileName}`, thumbUrl: "",
        width, height, bytes, name, alt: "", createdAt: nowIso(), createdBy: user.name,
      };
      await this.db.tx(async () => {
        await this.db.set("media", [item, ...this.items]);
        await this.app.activity.log(user, "upload", "media", id, `Archivo «${name}» subido`);
      });
      return item;
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }

  /** PUT /api/admin/media/:id/thumb (binario de imagen ≤ 2 MB). */
  async setThumb(ctx, id) {
    const item = this.get(id);
    if (!item) throw err.notFound("El archivo no existe.");
    const buf = await readBuffer(ctx, MEDIA_LIMITS.thumb);
    const t = sniff(buf);
    if (!t || t.kind !== "image") throw err.unsupported("La miniatura debe ser una imagen JPG, PNG, WebP, GIF o AVIF.");
    const mainFile = this.#fileOf(item.url);
    if (!mainFile) throw err.badRequest("Este archivo no admite miniatura.");
    const dirUrl = item.url.slice(0, item.url.lastIndexOf("/"));
    const thumbName = `${id}-thumb.${t.ext}`;
    await writeFileAtomic(join(dirname(mainFile), thumbName), buf, 0o644);
    return this.db.tx(async () => {
      const cur = this.get(id);
      if (!cur) throw err.notFound("El archivo no existe.");
      const old = cur.thumbUrl ? this.#fileOf(cur.thumbUrl) : null;
      const next = `${dirUrl}/${thumbName}`;
      if (old && !old.endsWith("/" + thumbName)) await unlink(old).catch(() => {});
      // Si se reemplaza una miniatura con el mismo nombre se agrega ?v= para saltar la caché "immutable"
      const thumbUrl = cur.thumbUrl && cur.thumbUrl.split("?")[0] === next ? `${next}?v=${Date.now().toString(36)}` : next;
      const updated = { ...cur, thumbUrl };
      await this.db.set("media", this.items.map((m) => (m.id === id ? updated : m)));
      return updated;
    });
  }

  /** PUT /api/admin/media/:id { name, alt } */
  update(id, body, user) {
    return this.db.tx(async () => {
      const cur = this.get(id);
      if (!cur) throw err.notFound("El archivo no existe.");
      const b = body && typeof body === "object" ? body : {};
      const fields = {};
      const txt = (k, max) => {
        const v = b[k];
        if (v === undefined || v === null) return cur[k];
        if (typeof v !== "string") { fields[k] = "Debe ser un texto."; return cur[k]; }
        const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
        if ([...s].length > max) fields[k] = `Máximo ${max} caracteres.`;
        return s;
      };
      const name = txt("name", 120);
      const alt = txt("alt", 160);
      if (!name) fields.name = "Este campo es obligatorio.";
      if (Object.keys(fields).length) throw err.validation(fields);
      // Sin cambios (p. ej. guardar el diálogo tal cual): ni se escribe media.json ni se registra actividad
      if (name === cur.name && alt === cur.alt) return cur;
      const updated = { ...cur, name, alt };
      await this.db.set("media", this.items.map((m) => (m.id === id ? updated : m)));
      await this.app.activity.log(user, "update", "media", id, `Archivo «${name}» actualizado`);
      return updated;
    });
  }

  /** Dónde aparece el archivo en el contenido: ["products/fe", "home.hero", "discountModal.image"…] */
  usages(item, content = this.app.content.data) {
    const needles = [item.url, item.thumbUrl ? item.thumbUrl.split("?")[0] : ""].filter(Boolean);
    const out = new Set();
    const visit = (v, path) => {
      if (typeof v === "string") {
        if (needles.some((n) => v.includes(n))) {
          if (path[0] === "products") out.add(`products/${content.products[path[1]]?.id}`);
          else out.add(path.filter((p) => typeof p === "string").slice(0, 2).join("."));
        }
      } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, [...path, i]));
      else if (v && typeof v === "object") for (const k of Object.keys(v)) visit(v[k], [...path, k]);
    };
    for (const k of Object.keys(content || {})) if (k !== "meta") visit(content[k], [k]);
    return [...out];
  }

  /**
   * Archivos /uploads/… que el contenido usa y ya NO existen en disco (p. ej. se borraron de la biblioteca cuando
   * solo los usaba una versión vieja y luego se restauró esa versión). → ["/uploads/2026/10/m-…-modal.png", …]
   */
  async missingUploads(content) {
    const urls = new Set();
    const visit = (v) => {
      if (typeof v === "string") {
        const m = /^\/?uploads\/[^?#\s]+/.exec(v.trim());
        if (m) urls.add("/" + m[0].replace(/^\//, ""));
      } else if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") Object.values(v).forEach(visit);
    };
    for (const k of Object.keys(content || {})) if (k !== "meta") visit(content[k]);
    const out = [];
    for (const u of urls) {
      const f = this.#fileOf(u);
      const st = f ? await stat(f).catch(() => null) : null;
      if (!st || !st.isFile()) out.push(u);
    }
    return out;
  }

  /** DELETE /api/admin/media/:id[?force=1] */
  remove(id, { force = false } = {}, user) {
    return this.db.tx(async () => {
      const cur = this.get(id);
      if (!cur) throw err.notFound("El archivo no existe.");
      const usages = this.usages(cur);
      if (usages.length && !force) {
        throw err.inUse(`Este archivo se está usando en ${usages.length === 1 ? "1 lugar" : usages.length + " lugares"}. Quítalo de ahí antes de eliminarlo, o elimínalo de todas formas.`, { usages });
      }
      await this.db.set("media", this.items.filter((m) => m.id !== id));
      for (const u of [cur.url, cur.thumbUrl]) {
        const f = u ? this.#fileOf(u) : null;
        if (f) await unlink(f).catch(() => {});
      }
      await this.app.activity.log(user, "delete", "media", id, `Archivo «${cur.name}» eliminado${usages.length ? " (estaba en uso)" : ""}`);
      return { ok: true };
    });
  }
}
