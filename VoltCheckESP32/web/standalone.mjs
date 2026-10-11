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
      }
      this.boot = j.boot;
      this.now_us = j.now_us;
      this.synced = performance.now();
      this.rtt = end - start;
      this.connected = j.can_ok;
      this.error = j.can_ok
        ? ""
        : "CAN receiver unavailable. Check firmware/board.";
      this.counters = {
        missed: j.missed,
        overrun: j.overrun,
        bus_errors: j.bus_errors,
      };
      this.lost += j.lost;
      if (j.lost) {
        events.push({ type: "transport_gap", frames: j.lost, epoch_ms: end });
        this.check?.fail("CAN frames were lost; retry this check");
      }
      if (this.session) {
        this.check?.tick();
        if (this.check) {
          this.session.results[this.check.step.id] = this.check.result();
          if (this.check.status !== "running" && this.session.running) {
            events.push({
              type: "check_result",
              result: this.check.result(),
              epoch_ms: end,
            });
            this.session.running = null;
          }
        }
        if (end >= this.nextSample) {
          samples.push({
            epoch_ms: mid,
            esp_boot: this.boot,
            capture_phase: this.phase,
            signals: this.snapshot(),
            counters: copy(this.counters),
            transport_lost_total: this.lost,
            http_round_trip_ms: this.rtt,
            connected: this.connected,
          });
          this.session.samples++;
          this.nextSample = end + 250;
        }
        await this.persist([{ kind: "batch", frames, samples, events }]);
      }
      return this.cursor < j.next;
    });
  }
  async start() {
    await this.ready;
    await this.exclusive(() => this.ensureSession());
    this.loop();
  }
  async loop() {
    let backlog = false;
    try {
      backlog = await this.poll();
    } catch (e) {
      this.connected = false;
      this.error = e.message;
      this.check?.tick();
    }
    setTimeout(() => this.loop(), backlog ? 0 : 100);
  }
  async api(path, data) {
    await this.ready;
    return this.exclusive(async () => {
      if (path === "/api/token") return { token: "browser-local" };
      if (path === "/api/status") {
        this.rows = await this.store.all();
        this.check?.tick();
        if (this.check && this.session)
          this.session.results[this.check.step.id] = this.check.result();
        return {
          local_service: true,
          connected: this.connected && !this.storageError,
          error: this.storageError || this.error,
          active: this.session?.id || null,
          intake: this.session?.intake || null,
          profile: PROFILE,
          steps: STEPS,
          signals: this.snapshot(),
          checks: this.session?.results || {},
          phase: this.phase,
          samples: this.session?.samples || 0,
          counters: this.counters,
          lost: this.lost,
          sessions: this.rows
            .sort((a, b) => b.intake.started_ms - a.intake.started_ms)
            .map((s) => ({
              id: s.id,
              state: s.state,
              registration: s.intake.registration,
              owner: s.intake.owner_name,
            })),
        };
      }
      if (path.startsWith("/api/report/")) {
        let s = await this.store.get(decodeURIComponent(path.split("/").pop()));
        if (!s?.report) throw Error("Finalised report not found");
        return s.report;
      }
      if (path === "/api/intake") {
        if (this.session) throw Error("Finish the active inspection first");
        if (this.storageError) throw Error(this.storageError);
        this.assertLease();
        if (data.profile_id !== PROFILE.id)
          throw Error("This vehicle has no validated diagnostic mapping");
        for (const k of ["owner_name", "registration", "station", "technician"])
          if (!String(data[k] || "").trim()) throw Error("Complete " + k);
        if (!data.consent) throw Error("Record owner consent");
        let id =
          "VC-" +
          new Date().toISOString().slice(0, 10).replaceAll("-", "") +
          "-" +
          Math.random().toString(36).slice(2, 10).toUpperCase();
        this.session = {
          id,
          state: "recording",
          results: {},
          running: null,
          samples: 0,
          bytes: 0,
          intake: {
            ...data,
            session_id: id,
            started_ms: Date.now(),
            profile: PROFILE,
            initial_counters: copy(this.counters),
            initial_transport_lost: this.lost,
          },
        };
        this.phase = "stationary";
        await this.persist([
          { kind: "event", payload: { type: "intake", epoch_ms: Date.now() } },
        ]);
        return { id };
      }
      if (!this.session) throw Error("Start an inspection first");
      this.assertLease();
      if (path === "/api/check") {
        if (!this.connected) throw Error("ESP32 is offline");
        if (this.check?.status === "running")
          throw Error("Complete or skip the current check");
        let step = STEPS.find((s) => s.id === data.id);
        if (!step) throw Error("Unknown check");
        this.check = new Check(
          step,
          this.boot,
          this.cursor - 1,
          this.now_us + Math.max(0, performance.now() - this.synced) * 1000,
        );
        this.session.running = step.id;
        this.session.results[step.id] = this.check.result();
        await this.persist([
          {
            kind: "event",
            payload: {
              type: "check_started",
              step_id: step.id,
              epoch_ms: Date.now(),
            },
          },
        ]);
        return { ok: true };
      }
      if (path === "/api/skip") {
        let step = STEPS.find((s) => s.id === data.id);
        if (!step || !String(data.reason || "").trim())
          throw Error("A check and reason are required");
        if (this.check?.status === "running" && this.check.step.id !== data.id)
          throw Error("Complete the active check");
        if (this.check?.step.id === data.id) this.check = null;
        this.session.running = null;
        this.session.results[data.id] = {
          ...step,
          status: "not_observed",
          phase: "done",
          reason: data.reason,
          evidence: [],
        };
        await this.persist();
        return { ok: true };
      }
      if (path === "/api/phase") {
        if (!["stationary", "road"].includes(data.phase))
          throw Error("Invalid phase");
        this.phase = data.phase;
        await this.persist([
          {
            kind: "event",
            payload: { type: "phase", phase: this.phase, epoch_ms: Date.now() },
          },
        ]);
        return { ok: true };
      }
      if (path === "/api/gps") {
        if (
          !Number.isFinite(data.latitude) ||
          Math.abs(data.latitude) > 90 ||
          !Number.isFinite(data.longitude) ||
          Math.abs(data.longitude) > 180 ||
          !Number.isFinite(data.accuracy_m) ||
          data.accuracy_m < 0 ||
          !Number.isFinite(data.fix_ms)
        )
          throw Error("Invalid GPS fix");
        await this.persist([{ kind: "gps", payload: data }]);
        return { ok: true };
      }
      if (path === "/api/finalize") {
        if (this.phase === "road")
          throw Error("End road recording while parked first");
        if (
          STEPS.some(
            (s) =>
              !["observed", "not_observed"].includes(
                this.session.results[s.id]?.status,
              ),
          )
        )
          throw Error("Attempt each check or record a reason");
        for (const k of [
          "tyres",
          "brakes",
          "lights",
          "battery_casing",
          "wiring",
        ])
          if (
            !["acceptable", "attention", "not_inspected"].includes(
              data.manual?.[k],
            )
          )
            throw Error("Complete manual review");
        const sn = this.snapshot(),
          missing = ["voltage", "current", "soc", "odometer"].filter(
            (k) => !sn[k]?.fresh,
          ),
          initial = this.session.intake.initial_counters || {},
          deltas = Object.fromEntries(
            Object.entries(this.counters).map(([k, v]) => [
              k,
              Math.max(0, v - (initial[k] || 0)),
            ]),
          ),
          gaps = this.lost - this.session.intake.initial_transport_lost;
        const checks = Object.values(this.session.results);
        const r = {
          schema: "voltcheck-inspection-v1",
          session_id: this.session.id,
          intake: this.session.intake,
          finished_ms: Date.now(),
          checks,
          manual: data.manual,
          technician_notes: data.notes || "",
          snapshot: sn,
          samples: this.session.samples,
          can_counters_final: copy(this.counters),
          transport_lost_total_final: this.lost,
          quality: {
            missing_or_stale_essential_signals: missing,
            can_counter_increases: deltas,
            transport_gaps: gaps,
            recorder_interruptions: this.session.recorder_interruptions || 0,
          },
          status:
            checks.every((c) => c.status === "observed") &&
            Object.values(data.manual).every((v) => v === "acceptable") &&
            !missing.length &&
            !gaps &&
            !Object.values(deltas).some(Boolean) &&
            !this.session.recorder_interruptions
              ? "observations_complete"
              : "attention_or_incomplete",
          scope:
            "Reference-decoded CAN observations and technician checks. No OEM approval, usable-capacity certification or roadworthiness certification.",
          range: {
            city_km: null,
            highway_km: null,
            mixed_km: null,
            reason: "No validated range model attached.",
          },
        };
        r.evidence_payload_json = canonical(r);
        r.evidence_sha256 = sha256(r.evidence_payload_json);
        this.session.report = r;
        this.session.state = "finalized";
        await this.persist([
          {
            kind: "event",
            payload: { type: "finalized", epoch_ms: r.finished_ms },
          },
        ]);
        return r;
      }
      throw Error("Unknown station action");
    });
  }
  async export(id) {
    await this.ready;
    return this.exclusive(async () => {
      let s = await this.store.get(id);
      if (!s) throw Error("Inspection not found on this browser");
      const chunks = await this.store.chunks(id),
        frames = [],
        samples = [],
        events = [],
        gps = [];
      for (const c of chunks) {
        if (c.kind === "batch") {
          frames.push(...c.frames);
          samples.push(...c.samples);
          events.push(...c.events);
        }
        if (c.kind === "event") events.push(c.payload);
        if (c.kind === "gps") gps.push(c.payload);
      }
      gps.sort((a, b) => a.fix_ms - b.fix_ms);
      let gi = 0;
      const rename = {
        voltage: "pack_voltage_v",
        current: "pack_current_a",
        soc: "soc_pct",
        odometer: "odometer_km",
        mode: "drive_mode_code",
        ambient: "ambient_temp_c",
        rpm: "motor_rpm",
        ...Object.fromEntries(
          [1, 2, 3, 4, 5].map((i) => ["temp" + i, "battery_temp_" + i + "_c"]),
        ),
      };
      const rows = samples.map((x) => {
        const r = {
          session_id: id,
          timestamp_ms: x.epoch_ms,
          esp_boot: x.esp_boot,
          capture_phase: x.capture_phase,
          route_type: s.intake.route_type || "mixed",
          carried_load_kg: s.intake.carried_load_kg || "",
          http_round_trip_ms: x.http_round_trip_ms,
          transport_lost_cumulative: x.transport_lost_total,
          ...Object.fromEntries(
            Object.entries(x.counters).map(([k, v]) => ["can_" + k, v]),
          ),
        };
        for (const k of FIELDS) {
          const v = x.signals[k];
          r[rename[k] || k] = v?.value ?? "";
          r[k + "_age_ms"] = v?.age_ms ?? "";
          r[k + "_fresh"] = v?.fresh ? 1 : 0;
        }
        r.essential_fresh = ["voltage", "current", "soc", "odometer"].every(
          (k) => x.signals[k]?.fresh,
        )
          ? 1
          : 0;
        for (const k of [
          "latitude",
          "longitude",
          "speed_kmh",
          "accuracy_m",
          "fix_ms",
          "offset_ms",
        ])
          r["gps_" + k] = "";
        while (gi + 1 < gps.length && gps[gi + 1].fix_ms <= x.epoch_ms) gi++;
        let g = [gps[gi], gps[gi + 1]]
          .filter(Boolean)
          .sort(
            (a, b) =>
              Math.abs(a.fix_ms - x.epoch_ms) - Math.abs(b.fix_ms - x.epoch_ms),
          )[0];
        if (
          g &&
          g.accuracy_m <= 50 &&
          Math.abs(g.fix_ms - x.epoch_ms) <= 2000
        ) {
          for (const k of [
            "latitude",
            "longitude",
            "speed_kmh",
            "accuracy_m",
            "fix_ms",
          ])
            r["gps_" + k] = g[k] ?? "";
          r.gps_offset_ms = g.fix_ms - x.epoch_ms;
        }
        return r;
      });
      return zip({
        "intake.json": JSON.stringify(s.intake, null, 2),
        "report.json": JSON.stringify(s.report || {}, null, 2),
        "raw_can.jsonl": frames.map((f) => JSON.stringify(f)).join("\n"),
        "telemetry.csv": csv(rows),
        "range_training.csv": csv(
          rows.filter((r) => r.capture_phase === "road"),
          rows.length ? Object.keys(rows[0]) : ["session_id"],
        ),
        "events.json": JSON.stringify(events, null, 2),
        "gps.json": JSON.stringify(gps, null, 2),
        "DATA-NOTES.txt":
          "Phone/browser stored records, not ESP32 permanent storage. Keep page visible. Software receive timestamps, not hardware arrival. Check freshness/gaps before training. Verify current sign and distance. No measured range or capacity labels are invented. GPS is unavailable on ordinary ESP32 HTTP in most Android browsers. No road phase means no training samples. Sample timing is measured; do not assume a fixed rate.",
      });
    });
  }
}
export const station =
  typeof window !== "undefined" ? new BrowserStation() : null;
export async function stationApi(path, data) {
  await station.ready;
  return station.api(path, data);
}
export async function downloadEvidence(id) {
  const blob = await station.export(id),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = id + "-evidence.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
if (station) {
  station.start().catch((e) => {
    station.error = e.message;
    station.storageError = e.message;
  });
  window.addEventListener("pagehide", () => {
    try {
      let x = JSON.parse(
        localStorage.getItem("voltcheck-esp32-recorder") || "null",
      );
      if (x?.id === station.tabId)
        localStorage.removeItem("voltcheck-esp32-recorder");
    } catch {}
  });
}
