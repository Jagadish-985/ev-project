import {
  PROFILE,
  STEPS,
  FIELDS,
  Check,
  decode,
  canonical,
  sha256,
  csv,
  zip,
} from "./engine.mjs";
export { sha256 };
const copy = (v) => JSON.parse(JSON.stringify(v));
const req = (r) =>
  new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
const done = (t) =>
  new Promise((ok, no) => {
    t.oncomplete = ok;
    t.onerror = () => no(t.error);
    t.onabort = () => no(t.error || Error("Record transaction aborted"));
  });
class Storage {
  async init() {
    if (!globalThis.indexedDB)
      throw Error(
        "Browser storage unavailable. Use a normal browser tab, not private mode.",
      );
    const r = indexedDB.open("voltcheck-esp32-v1", 1);
    r.onupgradeneeded = () => {
      let d = r.result;
      d.createObjectStore("sessions", { keyPath: "id" });
      let c = d.createObjectStore("chunks", {
        keyPath: "id",
        autoIncrement: true,
      });
      c.createIndex("session", "session");
    };
    this.db = await req(r);
    return this;
  }
  async all() {
    return req(
      this.db.transaction("sessions").objectStore("sessions").getAll(),
    );
  }
  async get(id) {
    return req(this.db.transaction("sessions").objectStore("sessions").get(id));
  }
  async save(s, chunks = []) {
    const t = this.db.transaction(["sessions", "chunks"], "readwrite"),
      d = done(t);
    t.objectStore("sessions").put(copy(s));
    for (const c of chunks)
      t.objectStore("chunks").add({ session: s.id, ...copy(c) });
    await d;
  }
  async chunks(id) {
    return req(
      this.db
        .transaction("chunks")
        .objectStore("chunks")
        .index("session")
        .getAll(id),
    );
  }
}
export class BrowserStation {
  constructor() {
    this.store = new Storage();
    this.latest = {};
    this.boot = null;
    this.cursor = 0;
    this.now_us = 0;
    this.synced = 0;
    this.connected = false;
    this.error = "Connecting to ESP32";
    this.counters = {};
    this.lost = 0;
    this.session = null;
    this.check = null;
    this.phase = "stationary";
    this.rtt = 0;
    this.nextSample = 0;
    this.rows = [];
    this.storageError = "";
    this.serial = Promise.resolve();
    this.tabId = Math.random().toString(36).slice(2);
    this.nextHeart = 0;
    this.lastPoll = performance.now();
    this.ready = this.init();
  }
  async init() {
    await this.store.init();
    this.rows = await this.store.all();
    return this;
  }
  exclusive(fn) {
    const r = this.serial.then(fn);
    this.serial = r.catch(() => {});
    return r;
  }
  assertLease() {
    const key = "voltcheck-esp32-recorder";
    let old;
    try {
      old = JSON.parse(localStorage.getItem(key) || "null");
      if (old && old.id !== this.tabId && Date.now() - old.at < 12000)
        throw Error(
          "Another tab is recording on this device. Use one inspection tab.",
        );
      localStorage.setItem(
        key,
        JSON.stringify({ id: this.tabId, at: Date.now() }),
      );
    } catch (e) {
      throw Error(e.message || "Recorder lock unavailable");
    }
  }
  async ensureSession() {
    this.rows = await this.store.all();
    let active = this.rows.find((s) => s.state === "recording");
    if (active && !this.session) {
      this.assertLease();
      this.session = active;
      this.phase = active.phase || "stationary";
      this.cursor = active.cursor || 0;
      this.boot = active.boot ?? null;
      this.lost = active.transportLost || 0;
      active.recorder_interruptions = (active.recorder_interruptions || 0) + 1;
      if (active.running) {
        active.results[active.running] = {
          id: active.running,
          title: STEPS.find((s) => s.id === active.running)?.title,
          status: "not_observed",
          phase: "done",
          reason: "Page was reloaded during check; retry required",
          evidence: [],
        };
        active.running = null;
      }
      await this.persist([
        {
          kind: "event",
          payload: { type: "page_resumed", epoch_ms: Date.now() },
        },
      ]);
    }
  }
  async persist(chunks = []) {
    if (!this.session) return;
    this.session.phase = this.phase;
    this.session.cursor = this.cursor;
    this.session.boot = this.boot;
    this.session.transportLost = this.lost;
    this.session.updated_ms = Date.now();
    this.session.bytes =
      (this.session.bytes || 0) +
      new TextEncoder().encode(JSON.stringify(chunks)).length;
    if (this.session.bytes > 64 * 1024 * 1024) {
      this.session.state = "interrupted";
      this.storageError =
        "64 MB inspection limit reached. Export this inspection and start another.";
      this.check?.fail(this.storageError);
      this.session.running = null;
      chunks = [
        {
          kind: "event",
          payload: { type: "capture_limit", epoch_ms: Date.now() },
        },
      ];
    }
    try {
      await this.store.save(this.session, chunks);
    } catch (e) {
      this.connected = false;
      this.storageError =
        "Recording stopped: browser storage could not save data. Export retained records. " +
        e.message;
      throw Error(this.storageError);
    }
    if (this.session.state !== "recording") {
      this.session = null;
      this.check = null;
    }
  }
  snapshot() {
    const now =
      this.now_us + Math.max(0, performance.now() - this.synced) * 1000;
    return Object.fromEntries(
      Object.entries(this.latest).map(([k, v]) => {
        let age = Math.max(0, (now - v.t) / 1000);
        return [
          k,
          {
            value: v.value,
            age_ms: Math.round(age),
            fresh: this.connected && age <= 1500,
          },
        ];
      }),
    );
  }
  async poll() {
    await this.ready;
    if (this.storageError) return;
    return this.exclusive(async () => {
      if (this.session) {
        this.assertLease();
      }
      let start = Date.now(),
        j;
      const c = new AbortController(),
        timer = setTimeout(() => c.abort(), 2500);
      try {
        const r = await fetch("/frames?since=" + this.cursor, {
          cache: "no-store",
          signal: c.signal,
        });
        if (!r.ok) throw Error("ESP32 request failed");
        j = await r.json();
      } finally {
        clearTimeout(timer);
      }
      const end = Date.now(),
        mid = (start + end) / 2;
      for (const k of [
        "boot",
        "now_us",
        "next",
        "cursor",
        "frames",
        "lost",
        "missed",
        "overrun",
        "bus_errors",
        "can_ok",
      ])
        if (!(k in j)) throw Error("Unexpected bridge response");
      let events = [],
        frames = [],
        samples = [],
        gap = performance.now() - this.lastPoll;
      this.lastPoll = performance.now();
      if (gap > 3000 && this.session) {
        this.session.recorder_interruptions =
          (this.session.recorder_interruptions || 0) + 1;
        this.check?.fail("Recorder paused; retry this check");
        events.push({
          type: "recorder_pause",
          duration_ms: gap,
          epoch_ms: end,
        });
      }
      if (this.boot !== null && this.boot !== j.boot) {
        this.latest = {};
        if (this.session)
          this.session.recorder_interruptions =
            (this.session.recorder_interruptions || 0) + 1;
        this.check?.fail("ESP32 restarted; retry this check");
        events.push({ type: "esp_restart", epoch_ms: end });
        this.cursor = j.next;
      } else {
        for (const a of j.frames) {
          if (!Array.isArray(a) || a.length < 6 || a[5] > 8)
            throw Error("Invalid CAN frame");
          const f = {
            seq: a[0],
            t: a[1],
            id: a[2],
            ext: !!a[3],
            rtr: !!a[4],
            dlc: a[5],
            data: a.slice(6),
          };
          if (!f.rtr && f.data.length !== f.dlc)
            throw Error("Short CAN payload");
          if (this.session) {
            frames.push({ boot: j.boot, ...f });
            this.check?.observe(
              j.boot,
              f,
              mid - (j.now_us - f.t) / 1000,
              end,
              j.now_us,
            );
          }
          for (const [k, value] of Object.entries(decode(f)))
            this.latest[k] = { value, t: f.t };
        }
        this.cursor = j.cursor;

// LEGACY_LOCALSTORAGE_FALLBACK
function saveDraftSessionToLocalStorage(id, data) { localStorage.setItem(id, JSON.stringify(data)); }
function clearDraftSession(id) { localStorage.removeItem(id); }
// END_LEGACY_FALLBACK
