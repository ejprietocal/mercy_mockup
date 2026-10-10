/* ==========================================================================
   Mercy Studio — server/test/helpers.js
   Utilidades de prueba:
   · makeFixtureRoot(): sitio de prueba aislado (copia el js/defaults.js real) para no
     depender de archivos que otros agentes/personas estén editando.
   · startServer(): arranca el servidor real en un puerto libre del rango 4110–4199 con
     DATA_DIR temporal. stop() lo cierra y borra las carpetas temporales.
   · Client: cliente HTTP con cookies (node:http: rutas crudas, sin descompresión automática).
   · makePng(): PNG real y válido generado en memoria.
   ========================================================================== */
import http from "node:http";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { createServer, REPO_ROOT } from "../app.js";

export const ADMIN = { email: "admin@prueba.co", password: "ClaveAdmin2026!" };

export async function makeFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "mercy-root-"));
  const put = async (rel, data) => {
    const f = join(root, rel);
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, data);
  };
  const page = (t) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${t}</title></head><body>${"<p>Mercy Studio</p>".repeat(120)}</body></html>`;
  await put("index.html", page("Inicio"));
  await put("catalogo.html", page("Catálogo"));
  await put("producto.html", page("Producto"));
  await put("checkout.html", page("Checkout"));
  await put("css/base.css", "body{color:#3b2d23}\n".repeat(200));
  await put("js/app.mjs", "export const x = 1;\n");
  await put("js/chico.js", "window.x=1;\n");
  await mkdir(join(root, "js"), { recursive: true });
  await copyFile(join(REPO_ROOT, "js", "defaults.js"), join(root, "js", "defaults.js"));
  await put("assets/fonts/titulo.woff2", Buffer.alloc(2048, 7));
  await put("assets/logo/logo.png", makePng(4, 4));
  await put("assets/video/demo.mp4", Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256)));
  await put("assets/fonts/README.md", "# fuentes\n");
  await put("admin/index.html", page("Panel"));
  await put("admin/login.html", page("Entrar"));
  await put("admin/js/main.js", "console.log('panel');\n");
  // Archivos que NUNCA deben salir
  await put("server/secret.js", "export const SECRET = 'no';\n");
  await put("data/content.json", "{\"secreto\":true}\n");
  await put("docs/ADMIN-CONTRATO.md", "# secreto\n");
  await put(".git/config", "[core]\n");
  await put(".env", "ADMIN_PASSWORD=secreta\n");
  await put("package.json", "{}\n");
  await put("tools/x.py", "print(1)\n");
  return root;
}

let nextPort = 4110 + (process.pid % 90);

export async function startServer(opts = {}) {
  const dataDir = opts.dataDir || (await mkdtemp(join(tmpdir(), "mercy-data-")));
  const rootDir = opts.rootDir || (await makeFixtureRoot());
  let lastErr;
  for (let i = 0; i < 90; i++) {
    const port = nextPort;
    nextPort = 4110 + ((nextPort - 4110 + 7) % 90);
    try {
      const srv = await createServer({
        dataDir,
        rootDir,
        port,
        host: "127.0.0.1",
        trustProxy: 1,
        log: false,
        announce: () => {},
        adminEmail: ADMIN.email,
        adminPassword: ADMIN.password,
        adminName: "Ana Admin",
        gitSha: "test-sha",
        ...opts,
      });
      return {
        ...srv,
        dataDir,
        rootDir,
        base: `http://127.0.0.1:${srv.port}`,
        client: (o) => new Client(`http://127.0.0.1:${srv.port}`, o),
        async stop({ keepData = false } = {}) {
          await srv.close();
          if (!keepData) await rm(dataDir, { recursive: true, force: true });
          if (!opts.rootDir) await rm(rootDir, { recursive: true, force: true });
        },
      };
    } catch (e) {
      lastErr = e;
      if (e.code !== "EADDRINUSE") throw e;
    }
  }
  throw lastErr;
}

let ipSeq = 1;
/** IP falsa única (vía X-Forwarded-For; las pruebas usan trustProxy=1). */
export const freshIp = () => `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

export class Client {
  constructor(base, { ip = freshIp(), admin = true } = {}) {
    this.base = new URL(base);
    this.jar = new Map();
    this.ip = ip;
    this.admin = admin; // agrega X-Mercy-Admin: 1 a las peticiones no-GET
  }

  request(method, path, { json, body, headers = {} } = {}) {
    const h = { ...headers };
    if (this.jar.size && !("cookie" in h)) h.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (this.ip && !("x-forwarded-for" in h)) h["x-forwarded-for"] = this.ip;
    if (this.admin && method !== "GET" && method !== "HEAD" && !("x-mercy-admin" in h)) h["x-mercy-admin"] = "1";
    let payload = body;
    if (json !== undefined) {
      payload = Buffer.from(JSON.stringify(json));
      if (!("content-type" in h)) h["content-type"] = "application/json";
    }
    if (payload !== undefined) h["content-length"] = Buffer.byteLength(payload);
    for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
    return new Promise((resolve, reject) => {
      const r = http.request({ host: this.base.hostname, port: this.base.port, method, path, headers: h, agent: false }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          for (const sc of [].concat(res.headers["set-cookie"] || [])) {
            const [pair, ...attrs] = sc.split(";");
            const i = pair.indexOf("=");
            const k = pair.slice(0, i).trim();
            const v = pair.slice(i + 1).trim();
            if (attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || v === "") this.jar.delete(k);
            else this.jar.set(k, v);
          }
          let data = null;
          if (String(res.headers["content-type"] || "").includes("json") && !res.headers["content-encoding"] && buf.length) {
            try { data = JSON.parse(buf.toString("utf8")); } catch { data = null; }
          }
          resolve({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString("utf8"), data });
        });
      });
      r.on("error", reject);
      if (payload !== undefined) r.write(payload);
      r.end();
    });
  }

  get(p, o) { return this.request("GET", p, o); }
  head(p, o) { return this.request("HEAD", p, o); }
  post(p, json, o = {}) { return this.request("POST", p, { ...o, json }); }
  put(p, json, o = {}) { return this.request("PUT", p, { ...o, json }); }
  del(p, o) { return this.request("DELETE", p, o); }

  async login(email = ADMIN.email, password = ADMIN.password, extra = {}) {
    const r = await this.post("/api/auth/login", { email, password, ...extra });
    if (r.status !== 200) throw new Error(`login falló (${r.status}): ${r.text}`);
    return r.data.user;
  }
}

/** Crea un usuario con el cliente admin y devuelve un Client con su sesión iniciada. */
export async function makeUser(srv, adminClient, { role = "editor", email, password = "ClaveEditor2026", name = "Eva Editora" } = {}) {
  const em = email || `${role}-${Math.random().toString(36).slice(2, 8)}@prueba.co`;
  const r = await adminClient.post("/api/admin/users", { name, email: em, role, active: true, password });
  if (r.status !== 201) throw new Error(`crear usuario falló (${r.status}): ${r.text}`);
  const c = srv.client();
  await c.login(em, password);
  return { client: c, user: r.data.item, email: em, password };
}

/* ---------- PNG real (con CRC32) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function makePng(w = 2, h = 2, rgb = [187, 63, 23]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** MP4 mínimo (solo cabecera ftyp + relleno): suficiente para la detección por firma. */
export function makeMp4(size = 64 * 1024) {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftyp", 4, "latin1");
  ftyp.write("isom", 8, "latin1");
  ftyp.writeUInt32BE(512, 12);
  ftyp.write("isomiso2", 16, "latin1");
  return Buffer.concat([ftyp, Buffer.alloc(size - 24, 1)]);
}
