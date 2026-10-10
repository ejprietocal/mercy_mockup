/* ==========================================================================
   Mercy Studio — server/lib/db.js
   "Base de datos" de archivos JSON en DATA_DIR:
   · Caché en memoria: cada colección se lee UNA vez al arrancar.
   · Escritura atómica: archivo temporal + fsync + rename (nunca queda un JSON a medias).
   · Escrituras coalescidas por archivo: nunca hay dos escrituras simultáneas del mismo
     archivo; si llegan varias mientras se escribe, se escribe una vez más con lo último.
   · tx(fn): cola serializada para operaciones leer-modificar-escribir (una a la vez).
   ========================================================================== */
import { mkdir, open, readFile, readdir, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/** Escribe `data` en `file` de forma atómica (temporal en la misma carpeta + rename). */
export async function writeFileAtomic(file, data, mode = 0o644) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const fh = await open(tmp, "w", mode);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

export class Db {
  constructor(dir) {
    this.dir = dir;
    this.files = new Map();          // nombre → { value, pretty, version, dirty, writing }
    this.queue = Promise.resolve();  // cola de transacciones
  }

  /** Crea DATA_DIR, uploads/, revisions/ y tmp/; comprueba que se pueda escribir. */
  async init() {
    try {
      await mkdir(this.dir, { recursive: true });
      for (const d of ["uploads", "revisions", "tmp"]) await mkdir(join(this.dir, d), { recursive: true });
      const probe = join(this.dir, ".escritura-ok");
      await writeFileAtomic(probe, "ok");
      await unlink(probe);
    } catch (err) {
      const e = new Error(
        `No se puede escribir en la carpeta de datos "${this.dir}" (${err.code || err.message}). ` +
        "En Docker/Easypanel monta un volumen en /data con permisos para el usuario node (uid 1000)."
      );
      e.cause = err;
      throw e;
    }
    // Restos de subidas interrumpidas en una ejecución anterior
    const tmpDir = join(this.dir, "tmp");
    for (const f of await readdir(tmpDir).catch(() => [])) await rm(join(tmpDir, f), { force: true, recursive: true });
  }

  path(name) { return join(this.dir, name + ".json"); }
  get tmpDir() { return join(this.dir, "tmp"); }
  get uploadsDir() { return join(this.dir, "uploads"); }
  get revisionsDir() { return join(this.dir, "revisions"); }

  /** Carga una colección en memoria. Si el archivo no existe usa `fallback` (no lo escribe). */
  async load(name, fallback, { pretty = true } = {}) {
    let value;
    let exists = true;
    try {
      value = JSON.parse(await readFile(this.path(name), "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw new Error(`No se pudo leer ${name}.json (${err.message}). Revisa el archivo o restaura una copia de seguridad.`);
      }
      exists = false;
      value = structuredClone(fallback);
    }
    this.files.set(name, { value, pretty, version: 0, dirty: false, writing: null });
    return { value, exists };
  }

  #file(name) {
    const f = this.files.get(name);
    if (!f) throw new Error(`Colección no cargada: ${name}`);
    return f;
  }

  /** Valor en caché (referencia viva: clónalo antes de modificarlo si la operación puede fallar). */
  get(name) { return this.#file(name).value; }
  /** Contador que sube con cada cambio (sirve para invalidar cachés derivadas). */
  version(name) { return this.#file(name).version; }

  /** Reemplaza el valor y lo persiste. La promesa se resuelve cuando ya está en disco. */
  set(name, value) {
    this.#file(name).value = value;
    return this.save(name);
  }

  /** Persiste el valor actual en caché (coalescido). */
  save(name) {
    const f = this.#file(name);
    f.version++;
    f.dirty = true;
    if (!f.writing) f.writing = this.#drain(name, f);
    return f.writing;
  }

  async #drain(name, f) {
    await null; // garantiza que f.writing quede asignado antes de terminar
    try {
      while (f.dirty) {
        f.dirty = false;
        const data = f.pretty ? JSON.stringify(f.value, null, 2) : JSON.stringify(f.value);
        await writeFileAtomic(this.path(name), data + "\n", 0o600); // solo el usuario del servidor (users.json tiene hashes)
      }
    } catch (err) {
      f.dirty = true; // se reintenta en la próxima escritura
      throw err;
    } finally {
      f.writing = null;
    }
  }

  /** Ejecuta `fn` en exclusiva (cola FIFO). Los errores se propagan al llamador sin romper la cola. */
  tx(fn) {
    const run = this.queue.then(() => fn());
    this.queue = run.catch(() => {});
    return run;
  }

  /** Espera a que terminen las transacciones y escrituras pendientes (apagado limpio). */
  async flush() {
    for (let i = 0; i < 20; i++) {
      await this.queue;
      const pending = [...this.files.values()].map((f) => f.writing).filter(Boolean);
      if (!pending.length) return;
      await Promise.allSettled(pending);
    }
  }
}
