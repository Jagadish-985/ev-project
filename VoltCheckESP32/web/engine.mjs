// Pure decoding/check logic, shared with deterministic tests. No CAN writes.
export const PROFILE = {
  id: "ather-rizta-2.9-reference-v1",
  manufacturer: "Ather",
  model: "Rizta",
  variant: "2.9 kWh",
  validation: "Reference decoder; validate on the inspected vehicle",
};
export const STEPS = [
  ["key", "key_on", "Key switch", false, true],
  ["stand", "side_stand", "Side stand", true, false],
  ["front", "front_brake", "Front brake switch", false, true],
  ["rear", "rear_brake", "Rear brake switch", false, true],
  ["left", "indicator_left", "Left indicator", false, true],
  ["right", "indicator_right", "Right indicator", false, true],
  ["beam", "high_beam", "High beam switch", false, true],
  ["horn", "horn", "Horn switch", false, true],
  ["return", "side_stand", "Return side stand", false, true],
].map(([id, signal, title, from, to]) => ({
  id,
  signal,
  title,
  from,
  to,
  timeout_s: 60,
}));
export const FIELDS = [
  "voltage",
  "current",
  "soc",
  "odometer",
  "mode",
  "temp1",
  "temp2",
  "temp3",
  "temp4",
  "temp5",
  "ambient",
  "rpm",
  "bms_soh",
  "imbalance",
  ...Array.from({ length: 14 }, (_, i) => "cell" + (i + 1)),
];
export function controls(d) {
  if (d.length < 8) return null;
  return {
    key_on: !!(d[4] & 8),
    side_stand: !!(d[4] & 1),
    front_brake: !!(d[0] & 1),
    rear_brake: !!(d[0] & 2),
    high_beam: !!(d[0] & 4),
    horn: !!(d[1] & 2),
    indicator_left: !!(d[2] & 2),
    indicator_right: !!(d[2] & 1),
  };
}
export function decode(f) {
  if (f.ext || f.rtr) return {};
  const d = f.data,
    u = (i) => d[i] | (d[i + 1] << 8),
    si = (v) => (v >= 32768 ? v - 65536 : v),
    v = {},
    id = f.id;
  if (id === 0x102) Object.assign(v, controls(d) || {});
  if (id === 0x141 && d.length >= 8) {
    v.voltage = u(0) / 100;
    v.imbalance = u(2) / 10000;
  }
  if (id === 0x14d && d.length >= 8) v.bms_soh = u(4) / 100;
  if ([0x132, 0x133, 0x134].includes(id) && d.length >= 8) {
    let start = 1 + (id - 0x132) * 4;
    for (let i = 0; i < 4; i++) v["cell" + (start + i)] = u(i * 2) / 10000;
  }
  if (id === 0x135 && d.length >= 4) {
    v.cell13 = u(0) / 10000;
    v.cell14 = u(2) / 10000;
  }
  if (id === 0x135 && d.length >= 8) v.current = si(u(6)) / 100;
  if (id === 0x131 && d.length >= 6) v.soc = u(4) / 100;
  if (id === 0x212 && d.length >= 4)
    v.odometer = (d[0] + d[1] * 256 + d[2] * 65536 + d[3] * 16777216) / 1000;
  if (id === 0x101 && d.length >= 5) v.mode = d[1];
  if (id === 0x136 && d.length >= 8)
    for (let i = 0; i < 4; i++) v["temp" + (i + 1)] = si(u(i * 2)) / 100;
  if (id === 0x137 && d.length >= 8) v.temp5 = si(u(0)) / 100;
  if (id === 0x140 && d.length >= 4) v.ambient = si(u(2)) / 100;
  if (id === 0x510 && d.length >= 4) v.rpm = Math.trunc((si(u(2)) * 5) / 6);
  return v;
}
export class Check {
  constructor(step, boot, seq, after_us, now = Date.now()) {
    Object.assign(this, {
      step,
      boot,
      seq,
      after_us,
      started: now,
      phase: "prepare",
      status: "running",
      reason: "",
      first: null,
      count: 0,
      evidence: [],
    });
  }
  fail(reason) {
    if (this.status === "running") {
      this.status = "not_observed";
      this.phase = "done";
      this.reason = reason;
    }
  }
  tick(now = Date.now()) {
    if (now - this.started > 60000)
      this.fail(
        "Fresh initial and target states were not observed within 60 seconds",
      );
  }
  observe(boot, f, wall, now = Date.now(), batchNow = f.t) {
    if (this.status !== "running") return;
    if (boot !== this.boot) {
      this.fail("ESP32 restarted; retry this check");
      return;
    }
    if (
      f.t <= this.after_us ||
      now - wall > 1500 ||
      f.seq <= this.seq ||
      f.ext ||
      f.rtr ||
      f.id !== 0x102
    )
      return;
    this.seq = f.seq;
    const v = controls(f.data);
    if (!v) return;
    const expected = this.phase === "prepare" ? this.step.from : this.step.to;
    if (v[this.step.signal] !== expected) {
      this.first = null;
      this.count = 0;
      return;
    }
    if (this.first === null) this.first = f.t;
    this.count++;
    if (this.count >= 2 && f.t - this.first >= 200000) {
      this.evidence.push({
        phase: this.phase,
        value: expected,
        boot,
        frame: f,
        phone_epoch_ms: wall,
      });
      if (this.phase === "prepare") {
        this.phase = "action";
        this.first = null;
        this.count = 0;
        this.after_us = batchNow;
      } else {
        this.status = "observed";
        this.phase = "done";
      }
    }
  }
  result() {
    return {
      id: this.step.id,
      title: this.step.title,
      signal: this.step.signal,
      status: this.status,
      phase: this.phase,
      reason: this.reason,
      evidence: this.evidence,
    };
  }
}
export const canonical = (v) => JSON.stringify(sort(v));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
// SHA-256 fallback works on plain HTTP, where WebCrypto subtle is unavailable.
export function sha256(input) {
  const bytes =
      typeof input === "string" ? new TextEncoder().encode(input) : input,
    k = new Uint32Array(64),
    h = new Uint32Array(8);
  let primes = 0;
  for (let n = 2; primes < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++)
      if (n % d === 0) {
        prime = false;
        break;
      }
    if (prime) {
      if (primes < 8) h[primes] = (Math.sqrt(n) % 1) * 2 ** 32;
      k[primes++] = (Math.cbrt(n) % 1) * 2 ** 32;
    }
  }
  const data = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  data.set(bytes);
  data[bytes.length] = 128;
  const dv = new DataView(data.buffer);
  const bits = bytes.length * 8;
  dv.setUint32(data.length - 8, Math.floor(bits / 2 ** 32));
  dv.setUint32(data.length - 4, bits >>> 0);
  const rr = (x, n) => (x >>> n) | (x << (32 - n)),
    w = new Uint32Array(64);
  for (let off = 0; off < data.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      let a = w[i - 15],
        b = w[i - 2];
      w[i] =
        (w[i - 16] +
          (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) +
          w[i - 7] +
          (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, j] = h;
    for (let i = 0; i < 64; i++) {
      let t1 =
          (j +
            (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) +
            ((e & f) ^ (~e & g)) +
            k[i] +
            w[i]) >>>
          0,
        t2 =
          ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) +
            ((a & b) ^ (a & c) ^ (b & c))) >>>
          0;
      j = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, j].forEach((v, i) => (h[i] = (h[i] + v) >>> 0));
  }
  return [...h].map((v) => v.toString(16).padStart(8, "0")).join("");
}
export function csv(
  rows,
  keys = rows.length ? Object.keys(rows[0]) : ["session_id"],
) {
  const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return (
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
export function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  let parts = [],
    central = [],
    offset = 0;
  const enc = new TextEncoder();
  for (const [name, contents] of Object.entries(files)) {
    const n = enc.encode(name),
      data = typeof contents === "string" ? enc.encode(contents) : contents,
      crc = crc32(data);
    const hdr = new Uint8Array(30 + n.length),
      v = new DataView(hdr.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    hdr.set(n, 30);
    parts.push(hdr, data);
    const ch = new Uint8Array(46 + n.length),
      cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    ch.set(n, 46);
    central.push(ch);
    offset += hdr.length + data.length;
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer),
    cs = central.reduce((a, b) => a + b.length, 0);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cs, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
