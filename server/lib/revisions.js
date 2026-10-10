/* ==========================================================================
   Mercy Studio — server/lib/revisions.js
   Revisiones del contenido (DATA_DIR/revisions/<id>.json, máx. 200).
   Cada archivo: { id, at, user: { id, name }, summary, content, pinned? }.
   El índice (sin el contenido) vive en memoria y se reconstruye al arrancar.
   `pinned: true` (las instantáneas del contenido de fábrica: «Contenido inicial» y la de un content.json
   recreado) = nunca se descarta al pasar del máximo: siempre se puede volver al contenido de fábrica.
   ========================================================================== */
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./db.js";
import { newId, nowIso } from "./util.js";

export const MAX_REVISIONS = 200;
export const INITIAL_SUMMARY = "Contenido inicial";
const ID_RE = /^r-[a-z0-9]{6,40}$/;

export class Revisions {
  constructor(dir, { max = MAX_REVISIONS } = {}) {
    this.dir = dir;
    this.max = max;
    this.index = []; // { id, at, user, summary, bytes, pinned } — la más reciente primero
  }

  async init() {
    const files = (await readdir(this.dir).catch(() => [])).filter((f) => f.endsWith(".json"));
    const out = [];
    for (const f of files) {
      const id = f.slice(0, -5);
      if (!ID_RE.test(id)) continue;
      try {
        const full = join(this.dir, f);
        const [raw, st] = await Promise.all([readFile(full, "utf8"), stat(full)]);
        const r = JSON.parse(raw);
        out.push({ id, at: r.at, user: r.user, summary: r.summary, bytes: st.size, pinned: r.pinned === true });
      } catch {
        // archivo dañado: se ignora (no impide arrancar)
      }
    }
    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
    // Datos de antes de `pinned`: la revisión «Contenido inicial» del Sistema (la más antigua) queda fijada
    if (!out.some((r) => r.pinned)) {
      const first = out.findLast((r) => r.summary === INITIAL_SUMMARY && !r.user?.id);
      if (first) first.pinned = true;
    }
    this.index = out;
  }

  get count() { return this.index.length; }
  list() { return this.index.map(({ pinned, ...r }) => ({ ...r })); }
  meta(id) { return this.index.find((r) => r.id === id) || null; }

  /** Revisión anterior (más antigua) a `id`, o null. */
  previousOf(id) {
    const i = this.index.findIndex((r) => r.id === id);
    return i === -1 ? null : this.index[i + 1] || null;
  }

  async add({ user, summary, content, pinned = false }) {
    const id = newId("r-");
    const rev = { id, at: nowIso(), user: user ? { id: user.id ?? null, name: user.name } : { id: null, name: "Sistema" }, summary, content };
    if (pinned) rev.pinned = true;
    const data = JSON.stringify(rev);
    await writeFileAtomic(join(this.dir, id + ".json"), data, 0o600);
    this.index.unshift({ id, at: rev.at, user: rev.user, summary, bytes: Buffer.byteLength(data), pinned: !!pinned });
    // Se descarta la más antigua NO fijada (si todas lo estuvieran, la más antigua)
    while (this.index.length > this.max) {
      let i = this.index.findLastIndex((r) => !r.pinned);
      if (i === -1) i = this.index.length - 1;
      const [old] = this.index.splice(i, 1);
      await unlink(join(this.dir, old.id + ".json")).catch(() => {});
    }
    return rev;
  }

  async get(id) {
    if (!ID_RE.test(String(id)) || !this.meta(id)) return null;
    try {
      return JSON.parse(await readFile(join(this.dir, id + ".json"), "utf8"));
    } catch {
      return null;
    }
  }
}
