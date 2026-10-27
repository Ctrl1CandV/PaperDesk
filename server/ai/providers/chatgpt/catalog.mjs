// Per-runtime, memory-only catalog. No account identifiers or credentials are
// cached. The runtime invalidates this on every authorization lifecycle change.
export class ChatGptCatalog {
  constructor(load, { now = Date.now, ttlMs = 5 * 60 * 1000 } = {}) {
    this.load = load; this.now = now; this.ttlMs = ttlMs;
    this.cached = null; this.pending = null; this.generation = 0;
  }

  clear() {
    this.generation++; this.cached = null;
    this.pending?.controller.abort(); this.pending = null;
  }

  async get(signal, { refresh = false } = {}) {
    signal?.throwIfAborted();
    if (!refresh && this.cached && this.cached.expiresAt > this.now()) return structuredClone(this.cached.models);
    let pending = this.pending;
    if (!pending || pending.controller.signal.aborted) {
      // A failed explicit refresh must not leave a stale catalog usable.
      this.cached = null;
      const generation = this.generation, controller = new AbortController();
      pending = { controller, users: 0, settled: false, promise: null };
      this.pending = pending;
      const operation = pending;
      operation.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return this.load(controller.signal);
      }).then(models => {
        controller.signal.throwIfAborted();
        if (generation === this.generation && this.pending === operation)
          this.cached = { models: structuredClone(models), expiresAt: this.now() + this.ttlMs };
        return models;
      }).finally(() => {
        operation.settled = true;
        if (this.pending === operation) this.pending = null;
      });
    }
    pending.users++;
    let abort;
    try {
      const models = await (signal ? Promise.race([pending.promise, new Promise((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      })]) : pending.promise);
      signal?.throwIfAborted();
      return structuredClone(models);
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
      if (--pending.users === 0 && !pending.settled) {
        pending.controller.abort();
        if (this.pending === pending) this.pending = null;
      }
    }
  }
}
