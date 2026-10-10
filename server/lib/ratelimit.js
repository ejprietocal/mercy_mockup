/* ==========================================================================
   Mercy Studio — server/lib/ratelimit.js
   Limitador de intentos en memoria con ventanas deslizantes.
   · check(clave, límite, ventana)  → ¿se puede? (sin contar)
   · add(clave, límite, ventana)    → cuenta un evento
   · hit(clave, límite, ventana)    → check + add (lo típico para límites públicos)
   Devuelve { ok, retryAfter } (segundos) para la cabecera Retry-After.
   ========================================================================== */
const MAX_KEYS = 50_000;

export class RateLimiter {
  constructor() {
    this.buckets = new Map(); // clave → { windowMs, times: number[] }
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  #prune(b, now) {
    while (b.times.length && b.times[0] <= now - b.windowMs) b.times.shift();
  }

  check(key, limit, windowMs, now = Date.now()) {
    const b = this.buckets.get(key);
    if (!b) return { ok: true, retryAfter: 0, count: 0 };
    b.windowMs = windowMs;
    this.#prune(b, now);
    if (b.times.length < limit) return { ok: true, retryAfter: 0, count: b.times.length };
    const oldest = b.times[b.times.length - limit];
    return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)), count: b.times.length };
  }

  add(key, limit, windowMs, now = Date.now()) {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= MAX_KEYS) this.sweep(now);
      if (this.buckets.size >= MAX_KEYS) this.buckets.delete(this.buckets.keys().next().value);
      b = { windowMs, times: [] };
      this.buckets.set(key, b);
    }
    b.windowMs = windowMs;
    b.times.push(now);
    if (b.times.length > limit) b.times.splice(0, b.times.length - limit); // solo hacen falta los últimos `limit`
  }

  hit(key, limit, windowMs, now = Date.now()) {
    const r = this.check(key, limit, windowMs, now);
    if (r.ok) this.add(key, limit, windowMs, now);
    return r;
  }

  reset(key) { this.buckets.delete(key); }

  sweep(now = Date.now()) {
    for (const [k, b] of this.buckets) {
      this.#prune(b, now);
      if (!b.times.length) this.buckets.delete(k);
    }
  }

  stop() { clearInterval(this.timer); }
}
