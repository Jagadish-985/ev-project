import { stationApi, downloadEvidence, sha256 } from "./standalone.mjs";
import { downloadCertificate } from "./certificate.mjs";
const $ = (s) => document.querySelector(s),
  E = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const icons = {
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  switch: '<path d="M12 3v9M6.3 5.5a8 8 0 1 0 11.4 0"/>',
  stand: '<path d="M7 5h7v9l-5 6M14 14l5 6M6 20h14"/>',
  document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  listening: '<path d="M4 12h3l3-7 4 14 3-7h3"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
}
function arrow() {
  return icon("arrow");
}
function checkIcon() {
  return icon("check");
}
function switchIcon() {
  return icon("switch");
}
function standIcon() {
  return icon("stand");
}
function documentIcon() {
  return icon("document");
}
function listeningIcon() {
  return icon("listening");
}
function openInfo(title, body, drawer = false) {
  let m = $("#modal");
  m.className = drawer ? "drawer" : "";
  $("#modalContent").innerHTML = `<h2>${E(title)}</h2>${body}`;
  $("#closeModal").onclick = () => m.close();
  m.oncancel = () => m.close();
  m.showModal();
}
function connectDevice() {
  openInfo(
    "ESP32 station",
    `<p class="dialog-copy">Join <b>VoltCheck-CAN</b> and open <b>http://192.168.4.1/</b>. No Python service or Internet connection is needed.</p><p class="dialog-copy">Keep this page visible during capture. Records are saved on this phone/browser, not permanently on the ESP32. Export each completed inspection.</p><p class="dialog-copy">Phone GPS is normally blocked on this HTTP address. The remaining inspection workflow works without GPS.</p><div class="drawer-footer"><button class="text-button" data-action="demo">Try without a vehicle</button><a class="text-button" href="START-HERE.md">Setup guide</a></div>`,
    true,
  );
}
function profileInfo() {
  openInfo(
    "Diagnostic profile",
    `<dl class="profile-info"><div><dt>Vehicle</dt><dd>Ather Rizta · 2.9 kWh</dd></div><div><dt>Source</dt><dd>Supplied wroom-v5 decoder</dd></div><div><dt>Validation</dt><dd>Vehicle-specific validation pending</dd></div><div><dt>Interface</dt><dd>Passive CAN · 500 kbps</dd></div></dl><p class="dialog-copy">Checks record switch signals and reference battery readings. They do not establish usable capacity, internal resistance, fault-code status, physical brake performance or remaining warranty.</p><p class="dialog-copy">Manufacturer range figures are references. No validated range model is attached.</p>`,
  );
}
const vehicleImages = {
  Rizta: { src: "images/rizta-grey.png", label: "Model reference" },
  "Rizta S": { src: "images/rizta-s.webp", label: "Model reference" },
  "Rizta Z": { src: "images/rizta-z.webp", label: "Model reference" },
  "450S": { src: "images/450s.webp", label: "Model reference" },
  "450X": { src: "images/450x.webp", label: "Model reference" },
  "450 Apex": { src: "images/450-apex.webp", label: "Model reference" },
  "Konarc S": { src: "images/konarc.webp", label: "Konarc family reference" },
  "Konarc Z": { src: "images/konarc.webp", label: "Konarc family reference" },
};
function vehiclePhoto(model, kind = "preview") {
  let photo = vehicleImages[model];
  return photo
    ? `<div class="vehicle-photo photo-${kind}"><img src="${photo.src}" alt="Ather ${E(model)}${model.startsWith("Konarc") ? " family reference" : ""}" width="1080" height="600" ${kind === "thumb" ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"><span class="photo-fallback" aria-hidden="true">${E(model)}</span></div>`
    : `<div class="model-wordmark">${E(model)}</div>`;
}
document.addEventListener(
  "error",
  (e) => {
    if (e.target.matches?.(".vehicle-photo img")) {
      e.target.closest(".vehicle-photo").classList.add("photo-unavailable");
      e.target.alt = "";
    }
  },
  true,
);
const profile = {
  id: "ather-rizta-2.9-reference-v1",
  manufacturer: "Ather",
  model: "Rizta",
  variant: "2.9 kWh",
};
const steps = [
  [
    "key",
    "key_on",
    "Key switch",
    "Switch the key OFF. Wait for an OFF message.",
    "Turn the key ON. Leave the scooter stationary.",
    false,
    true,
  ],
  [
    "stand",
    "side_stand",
    "Side stand",
    "Lower the side stand fully.",
    "Support the stationary scooter securely with both feet, then raise the side stand. Do not touch the throttle.",
    true,
    false,
  ],
  [
    "front",
    "front_brake",
    "Front brake switch",
    "Release the front brake lever.",
    "Squeeze and hold the front brake lever.",
    false,
    true,
  ],
  [
    "rear",
    "rear_brake",
    "Rear brake switch",
    "Release the rear brake lever.",
    "Squeeze and hold the rear brake lever.",
    false,
    true,
  ],
  [
    "left",
    "indicator_left",
    "Left indicator",
    "Switch indicators OFF.",
    "Switch the LEFT indicator ON.",
    false,
    true,
  ],
  [
    "right",
    "indicator_right",
    "Right indicator",
    "Switch indicators OFF.",
    "Switch the RIGHT indicator ON.",
    false,
    true,
  ],
  [
    "beam",
    "high_beam",
    "High beam switch",
    "Select low beam.",
    "Select and hold high beam.",
    false,
    true,
  ],
  [
    "horn",
    "horn",
    "Horn switch",
    "Release the horn button.",
    "Press the horn briefly, holding for about half a second.",
    false,
    true,
  ],
  [
    "return",
    "side_stand",
    "Return side stand",
    "Support the stationary scooter and keep the side stand UP.",
    "Lower the side stand fully.",
    false,
    true,
  ],
].map(([id, signal, title, prepare, action, from, to]) => ({
  id,
  signal,
  title,
  prepare,
  action,
  from,
  to,
}));
let catalogue = null;
let state = {
  view: "workspace",
  step: 0,
  local: false,
  demo: false,
  token: null,
  status: null,
  selected: "key",
  report: null,
  reportIntegrity: "",
  draft: {
    manufacturer: "Ather",
    model: "Rizta",
    variant: "2.9 kWh",
    station: "",
    technician: "",
    owner_name: "",
    owner_phone: "",
    registration: "",
    vin: "",
    route_type: "mixed",
    carried_load_kg: "",
    consent: false,
  },
  manual: { tyres: "", brakes: "", lights: "", battery_casing: "", wiring: "" },
  notes: "",
};
let demoChecks = {},
  demoCurrent = null,
  gpsWatch = null,
  wake = null,
  polling = false;
function askReason() {
  return new Promise((resolve) => {
    let m = $("#modal");
    m.className = "";
    $("#modalContent").innerHTML =
      '<h2>Not observed</h2><p>Add a reason for the inspection record.</p><label class="field">Reason<textarea id="skipReason" rows="3" placeholder="For example: no key-OFF traffic was received."></textarea></label><button id="saveSkip" class="primary" style="margin:15px 0">Save observation</button>';
    let close = () => {
      m.close();
      resolve(null);
    };
    $("#closeModal").onclick = close;
    m.oncancel = close;
    $("#saveSkip").onclick = () => {
      let v = $("#skipReason").value.trim();
      if (!v) {
        toast("Enter a reason first.");
        return;
      }
      m.close();
      resolve(v);
    };
    m.showModal();
    $("#skipReason").focus();
  });
}
function toast(s) {
  clearTimeout(toastTimer);
  $("#toast").textContent = s;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 5000);
}
async function api(path, data) {
  return stationApi(path, data);
}
function catalogueModels() {
  return [
    "Rizta",
    ...(catalogue?.models || []).map((m) => m.name),
    "Other model",
  ];
}
function catalogueBatteries(model) {
  if (model === "Rizta") return ["2.9 kWh", "Other variant"];
  let rows = (catalogue?.variants || []).filter((v) => v.model === model),
    options = [
      ...new Set(rows.flatMap((v) => v.battery_capacity_options_kwh || [])),
    ]
      .sort((a, b) => a - b)
      .map((v) => v + " kWh");
  for (let v of rows)
    if (!v.battery_capacity_options_kwh?.length)
      options.push("Not published (" + v.idc_range_km + " km IDC)");
  return [...new Set(options)].length
    ? [...new Set(options)]
    : ["Not published"];
}
function selectedCatalogueRows() {
  return (catalogue?.variants || []).filter(
    (v) =>
      v.model === state.draft.model &&
      ((v.battery_capacity_options_kwh || []).some(
        (n) => state.draft.variant === n + " kWh",
      ) ||
        (!v.battery_capacity_options_kwh?.length &&
          state.draft.variant ===
            "Not published (" + v.idc_range_km + " km IDC)")),
  );
}
function catalogueSummary() {
  let rows = selectedCatalogueRows();
  if (!rows.length)
    return state.draft.model === "Rizta"
      ? '<p class="hint">Existing generic CAN reference. Choose Rizta S or Z above to browse the manufacturer’s current trim specifications.</p>'
      : "";
  let v = rows[0];
  return `<div class="tip"><strong>Manufacturer reference · ${E(catalogue.snapshot_date)}</strong>Variant code: ${E(v.variant_code || "Not published")}<br>Installed-capacity label: ${E(v.battery_capacity_label || "Not published")}<br>IDC: ${E(v.idc_range_km ?? "Not published")} km · Top speed: ${E(v.top_speed_kmh ?? "Not published")} km/h<br><a href="${E(v.source_url)}" target="_blank" rel="noopener">Official specification source</a>${v.battery_capacity_mapping_note ? '<p class="hint">' + E(v.battery_capacity_mapping_note) + "</p>" : ""}<p class="hint">Manufacturer figures are reference claims, not inspected-vehicle measurements or ML predictions.</p></div>`;
}
function mapped() {
  return (
    state.draft.manufacturer === "Ather" &&
    state.draft.model === "Rizta" &&
    state.draft.variant === "2.9 kWh"
  );
}

function intro(title, desc) {
  let names = {
    "New vehicle inspection": "New inspection",
    "Inspection records": "Inspections",
    "Set up your inspection station": "Station settings",
    "Ather vehicle catalogue": "Vehicle catalogue",
  };
  return `<div class="page-title"><h1 tabindex="-1">${E(names[title] || title)}</h1>${state.view === "catalogue" ? `<span class="quiet">Updated ${E(catalogue?.snapshot_date || "—")}</span>` : ""}</div>`;
}
function sidebar() {
  return "";
}
function stepper() {
  return `<nav class="workflow" aria-label="Inspection progress" style="--progress:${state.step * 25}%">${["Vehicle", "Owner", "Checks", "Review", "Report"].map((x, i) => `<button data-step="${i}" ${i > state.step ? "disabled" : ""} ${i === state.step ? 'aria-current="step"' : ""} class="${i === state.step ? "active" : i < state.step ? "done" : ""}"><span>${String(i + 1).padStart(2, "0")}</span>${x}</button>`).join("")}</nav>`;
}
function select(key, label, options) {
  return `<label class="field">${label}<select data-field="${key}">${options.map((v) => `<option ${state.draft[key] === v ? "selected" : ""}>${E(v)}</option>`).join("")}</select></label>`;
}
function input(key, label, type = "text", optional = false) {
  return `<label class="field">${label}${optional ? "" : '<span class="required" aria-hidden="true"> *</span>'}<input data-field="${key}" type="${type}" value="${E(state.draft[key])}" ${optional ? "" : "required"} autocomplete="${key === "owner_name" ? "name" : key === "owner_phone" ? "tel" : "off"}"></label>`;
}
function banner() {
  return state.demo
    ? '<div class="demo-note">Demo session <span>No vehicle connected</span></div>'
    : "";
}
let lastRoute = "",
  pageTransition = null,
  detailKey = "",
  busyAction = false,
  toastTimer;
function updateConnection() {
  let notice = document.querySelector(".standalone-notice");
  if (notice) {
    notice.textContent = state.status?.error
      ? "ESP32 station: " + state.status.error
      : "ESP32 standalone · Records on this browser · Keep page visible during capture";
  }
  let key = state.demo
      ? "demo"
      : state.local
        ? state.status?.connected
          ? "online"
          : "offline"
        : "unlinked",
    el = $("#connection");
  if (el.dataset.status === key) return;
  el.dataset.status = key;
  let label = {
    demo: "Demo mode",
    online: "Bridge connected",
    offline: "Bridge offline",
    unlinked: "Connect device",
  }[key];
  el.innerHTML = `<span class="status-dot"></span><span class="connection-label">${label}</span>`;
  el.setAttribute("aria-label", label);
}
function render() {
  let route = state.view + ":" + state.step,
    changed = route !== lastRoute;
  lastRoute = route;
  let field = document.activeElement?.dataset?.field;
  let paint = () => {
    renderNow();
    if (field && !changed)
      document
        .querySelector(`[data-field="${field}"]`)
        ?.focus({ preventScroll: true });
    if (changed) {
      $("#app h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };
  if (
    changed &&
    document.startViewTransition &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    pageTransition?.skipTransition();
    pageTransition = document.startViewTransition(paint);
    pageTransition.finished.catch(() => {});
  } else paint();
}

function renderNow() {
  updateConnection();
  document.querySelectorAll(".nav").forEach((n) => {
    let active = n.dataset.view === state.view;
    n.classList.toggle("active", active);
    if (active) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  if (state.view === "catalogue") return renderCatalogue();
  if (state.view === "setup") return renderSetup();
  if (state.view === "records") return renderRecords();
  $("#app").innerHTML =
    intro(
      "New vehicle inspection",
      "Select the vehicle, register the owner and complete the guided checks.",
    ) +
    banner() +
    stepper() +
    `<div id="workspace"></div>`;
  if (state.step === 0) renderVehicle();
  if (state.step === 1) renderOwner();
  if (state.step === 2) renderChecks();
  if (state.step === 3) renderReview();
  if (state.step === 4) renderReport();
}
function renderVehicle() {
  let d = state.draft,
    rows = selectedCatalogueRows(),
    v = rows[0],
    rizta = d.model.startsWith("Rizta");
  $("#workspace").innerHTML =
    `<div class="vehicle-layout"><section class="vehicle-form"><h2>Vehicle details</h2><div class="fields">${select("manufacturer", "Manufacturer", ["Ather", "Other manufacturer"])}${d.manufacturer === "Ather" ? select("model", "Model", catalogueModels()) : input("model", "Model")}<div class="span2">${d.manufacturer === "Ather" ? select("variant", "Battery", catalogueBatteries(d.model)) : input("variant", "Battery")}</div></div><div class="profile-line"><span class="small-dot ${mapped() ? "available" : ""}"></span><span>${mapped() ? "Reference decoder" : "No diagnostic profile"}</span><button class="text-button" data-action="profile-info" aria-label="View diagnostic profile details">Details</button></div>${!mapped() ? '<p class="inline-note">Live checks are unavailable for this variant.</p>' : ""}<div class="form-actions"><button class="primary" data-action="vehicle-next" ${mapped() ? "" : "disabled"}>Continue ${arrow()}</button></div></section><figure class="vehicle-reference">${d.manufacturer === "Ather" ? vehiclePhoto(d.model) : '<div class="model-wordmark">' + E(d.model) + "</div>"}<figcaption><div><span class="quiet">${E(vehicleImages[d.model]?.label || "Vehicle")}</span><h3>${E(d.manufacturer)} ${E(d.model)}</h3></div><span class="vehicle-battery">${E(d.variant)}</span></figcaption>${v ? `<div class="reference-spec"><span>Manufacturer IDC</span><b>${E(v.idc_range_km ?? "—")} km</b><span>Top speed</span><b>${E(v.top_speed_kmh ?? "—")} km/h</b></div>` : ""}</figure></div>`;
}
function renderOwner() {
  $("#workspace").innerHTML =
    `<form id="intake" class="intake-form"><section class="form-section"><h2>Owner</h2><div class="fields">${input("owner_name", "Full name")}${input("owner_phone", "Phone number", "tel", true)}</div></section><section class="form-section"><h2>Vehicle</h2><div class="fields">${input("registration", "Registration number")}${input("vin", "VIN / chassis number", "text", true)}${input("first_registered", "First registered", "date", true)}</div></section><section class="form-section"><h2>Station</h2><div class="fields">${input("station", "Centre / branch")}${input("technician", "Technician")}</div></section><details class="optional-section"><summary>Ride details <span>Optional</span></summary><div class="fields">${select("route_type", "Route", ["city", "highway", "mixed"])}${input("carried_load_kg", "Rider + passenger + luggage (kg)", "number", true)}</div></details><label class="consent"><input type="checkbox" data-field="consent" ${state.draft.consent ? "checked" : ""} required><span>Owner consent received for inspection and data recording.</span></label><div class="form-actions"><button type="button" class="text-button" data-action="back">Back</button><button class="primary" ${!state.local && !state.demo ? "disabled" : ""}>Start inspection ${arrow()}</button></div>${!state.local && !state.demo ? '<button type="button" class="text-button connection-help" data-action="connect">Connect a device to start</button>' : ""}</form>`;
  $("#intake").onsubmit = async (e) => {
    e.preventDefault();
    await act(async () => {
      if (state.demo) {
        state.draft.session_id = "DEMO-" + Date.now();
        demoChecks = {};
        state.status = {
          active: state.draft.session_id,
          signals: {},
          checks: {},
          samples: 0,
          phase: "stationary",
        };
      } else {
        let r = await api("/api/intake", {
          ...state.draft,
          profile_id: profile.id,
        });
        state.draft.session_id = r.id;
        await refreshStatus();
      }
      state.step = 2;
      render();
    }, e.submitter);
  };
}
function metric(name, key, unit) {
  return `<div class="live-metric"><span>${name}</span><strong data-metric="${key}">—</strong><small>${unit}</small></div>`;
}
function renderChecks() {
  detailKey = "";
  $("#workspace").innerHTML =
    `<div class="readings-strip" id="metrics">${metric("Battery", "soc", "%") + metric("Voltage", "voltage", "V") + metric("Current", "current", "A") + metric("Temperature", "temp1", "°C")}</div><div class="checks-layout"><section class="check-rail"><div class="rail-heading">Checks <span id="checkProgress"></span></div><div id="checkList">${steps.map((s, i) => `<button data-check="${s.id}"><span class="check-number">${String(i + 1).padStart(2, "0")}</span><span>${E(s.title)}</span><span class="check-status" data-check-status="${s.id}"></span></button>`).join("")}</div><button class="text-button review-link" data-action="review" id="reviewBtn" disabled>Review inspection ${arrow()}</button></section><section id="checkDetail" aria-live="polite"></section></div>`;
  updateChecks();
}
function signalLabel(signal, value) {
  if (signal === "key_on") return value ? "Key on" : "Key off";
  if (signal === "side_stand") return value ? "Stand down" : "Stand up";
  if (signal.includes("brake")) return value ? "Applied" : "Released";
  return value ? "On" : "Off";
}

function updateChecks() {
  if (!$("#checkDetail")) return;
  let checks = state.status?.checks || {},
    s = steps.find((x) => x.id === state.selected),
    r = checks[s.id],
    v = state.status?.signals?.[s.signal],
    running = r?.status === "running",
    done = r?.status === "observed",
    finished = r && r.status !== "running",
    complete = steps.every((x) =>
      ["observed", "not_observed"].includes(checks[x.id]?.status),
    );
  for (let [key, unit] of [
    ["soc", "%"],
    ["voltage", "V"],
    ["current", "A"],
    ["temp1", "°C"],
  ]) {
    let el = document.querySelector(`[data-metric="${key}"]`),
      val = state.status?.signals?.[key],
      str = val?.fresh
        ? Number(val.value).toFixed(key === "current" ? 2 : 1)
        : "—";
    if (el && el.textContent !== str) el.textContent = str;
  }
  $("#checkProgress").textContent =
    Object.values(checks).filter((x) =>
      ["observed", "not_observed"].includes(x.status),
    ).length +
    "/" +
    steps.length;
  for (let x of steps) {
    let el = document.querySelector(`[data-check="${x.id}"]`),
      status = checks[x.id]?.status;
    el.classList.toggle("selected", x.id === s.id);
    el.classList.toggle("is-observed", status === "observed");
    el.classList.toggle("is-incomplete", status === "not_observed");
    el.setAttribute("aria-pressed", String(x.id === s.id));
    let target = el.querySelector(".check-status"),
      str =
        status === "observed"
          ? "✓"
          : status === "not_observed"
            ? "—"
            : status === "running"
              ? "•"
              : "";
    if (target.textContent !== str) target.textContent = str;
  }
  let key = [
    s.id,
    r?.status,
    r?.phase,
    r?.reason,
    state.demo,
    state.status?.connected,
  ].join("|");
  if (detailKey !== key) {
    detailKey = key;
    let infoOpen = $("#signalDetails")?.open;
    $("#checkDetail").innerHTML =
      `<div class="test-stage ${done ? "test-complete" : ""}"><div class="test-heading"><span>${String(steps.indexOf(s) + 1).padStart(2, "0")} / ${steps.length}</span><h2>${E(s.title)}</h2></div><div class="test-state-icon ${running ? "listening" : ""}">${done ? checkIcon() : running ? listeningIcon() : s.id === "stand" || s.id === "return" ? standIcon() : switchIcon()}</div><h3 class="test-instruction">${done ? "Signal received" : running ? E(r.phase === "prepare" ? s.prepare : s.action) : finished ? "Not observed" : "Ready to check"}</h3><p class="test-subtitle">${running ? (r.phase === "prepare" ? "Waiting for the initial state." : "Initial state recorded. Perform the action above.") : r?.reason ? E(r.reason) : done ? "Both states recorded." : "Keep the vehicle stationary."}</p><div class="signal-pill"><span class="small-dot"></span><span id="signalValue">Waiting for signal</span></div><div class="test-actions">${!running && !finished ? '<button class="primary" data-action="begin-check">Begin check ' + arrow() + "</button>" : ""}${finished ? `<button class="primary" data-action="${steps.indexOf(s) === steps.length - 1 && complete ? "review" : "next-check"}">${steps.indexOf(s) === steps.length - 1 && complete ? "Review" : "Next check"} ${arrow()}</button><button class="text-button" data-action="begin-check">Retry</button>` : ""}${state.demo && running ? '<button class="primary" data-action="simulate">Simulate change ' + arrow() + "</button>" : ""}<button class="text-button subtle" data-action="skip">Mark not observed</button></div><details class="signal-details" id="signalDetails" ${infoOpen ? "open" : ""}><summary>Signal details</summary><dl><div><dt>CAN ID</dt><dd>0x102</dd></div><div><dt>Field</dt><dd>${E(s.signal)}</dd></div><div><dt>Age</dt><dd id="signalAge">—</dd></div><div><dt>Expected</dt><dd>${String(s.from)} → ${String(s.to)}</dd></div></dl><p>Two fresh frames over 200 ms per state. Timeout: 60 seconds.</p></details></div>`;
  }
  $("#signalValue").textContent = v?.fresh
    ? signalLabel(s.signal, v.value)
    : "Waiting for signal";
  $("#signalValue").parentElement.classList.toggle("has-signal", !!v?.fresh);
  $("#signalAge").textContent = v ? v.age_ms + " ms" : "Not received";
  $("#reviewBtn").disabled = !complete;
}
function renderReview() {
  let checks = state.status?.checks || {};
  $("#workspace").innerHTML =
    `<div class="review-layout"><section class="review-section"><div class="section-heading"><h2>Signal checks</h2><span class="quiet">${Object.values(checks).filter((c) => c.status === "observed").length} of ${steps.length} observed</span></div><div class="review-checks">${steps
      .map((s) => {
        let r = checks[s.id];
        return `<div><span>${E(s.title)}</span><span class="result ${r?.status === "observed" ? "observed" : "incomplete"}">${r?.status === "observed" ? "Observed" : "Not observed"}</span></div>`;
      })
      .join(
        "",
      )}</div></section><section class="review-section"><h2>Manual inspection</h2><div class="manual-checks">${[
      ["tyres", "Tyres"],
      ["brakes", "Brakes"],
      ["lights", "Lights & indicators"],
      ["battery_casing", "Battery casing"],
      ["wiring", "Wiring & connector"],
    ]
      .map(
        ([k, label]) =>
          `<label>${label}<select data-manual="${k}" aria-label="${label}"><option value="">Select result</option>${[
            ["acceptable", "Acceptable"],
            ["attention", "Needs attention"],
            ["not_inspected", "Not checked"],
          ]
            .map(
              ([v, l]) =>
                `<option value="${v}" ${state.manual[k] === v ? "selected" : ""}>${l}</option>`,
            )
            .join("")}</select></label>`,
      )
      .join(
        "",
      )}</div><label class="field notes-field">Notes<textarea id="techNotes" rows="3" placeholder="Add findings, if any.">${E(state.notes)}</textarea></label></section><details class="road-section"><summary>Road recording <span>Optional</span></summary><div class="road-content"><div id="roadStatus"></div><div class="row"><button class="secondary" data-action="gps">Phone GPS</button><button class="primary" id="roadToggle" data-action="road">Start recording</button></div><p id="gpsStatus" class="hint">GPS off</p><p class="hint">Start and stop while parked. Keep this page visible for GPS.</p></div></details><div class="form-actions"><button class="text-button" data-action="back">Back</button><button class="primary" data-action="finalize">Finalize inspection ${arrow()}</button></div></div>`;
  updateRoad();
}
function updateRoad() {
  if (!$("#roadStatus")) return;
  let road = state.status?.phase === "road";
  $("#roadStatus").innerHTML =
    `<div class="recording-status ${road ? "active" : ""}"><span class="small-dot"></span>${road ? "Recording road data" : "Not recording"}<span class="quiet">${state.status?.samples || 0} session samples</span></div>`;
  let b = $("#roadToggle");
  b.dataset.action = road ? "stationary" : "road";
  b.textContent = road ? "Stop recording" : "Start recording";
}
function cert(report) {
  let d = report.intake || {},
    checks = report.checks || [],
    snapshot = report.snapshot || {},
    val = (k, u = "") =>
      snapshot[k]?.fresh
        ? E(
            Number(snapshot[k].value).toFixed(
              k.startsWith("cell")
                ? 3
                : k === "current" || k === "voltage"
                  ? 2
                  : 1,
            ),
          ) +
          " " +
          u
        : "Not available / stale";
  return `<article class="certificate">${report.demo ? '<div class="demo-watermark">DEMONSTRATION · NOT A VEHICLE INSPECTION</div>' : ""}<div class="cert-top"><div><div class="eyebrow">${E(d.station || "EV RESALE CENTRE")}</div><h1>Vehicle inspection record</h1><p>${E(report.session_id)} · ${new Date(report.finished_ms).toLocaleString()}</p></div><div style="text-align:right"><h2>VoltCheck</h2><span class="badge ${report.status !== "observations_complete" ? "warning" : ""}">${report.status === "observations_complete" ? "Observations complete" : "Attention / incomplete"}</span></div></div><div class="fields"><div><h3>Vehicle</h3><p>${E(d.manufacturer || d.profile?.manufacturer)} ${E(d.model || d.profile?.model)} · ${E(d.variant || d.profile?.variant)}<br>Registration: ${E(d.registration)}<br>VIN: ${E(d.vin || "Not recorded")}</p></div><div><h3>Owner & technician</h3><p>${E(d.owner_name)}${d.owner_phone ? "<br>" + E(d.owner_phone) : ""}<br>Technician: ${E(d.technician)}</p></div></div><div class="cert-section"><h2>CAN switch observations</h2><table><thead><tr><th>Check</th><th>Result</th><th>Evidence / limitation</th></tr></thead><tbody>${steps
    .map((s) => {
      let r = checks.find((x) => x.id === s.id);
      return `<tr><td>${E(s.title)}</td><td>${r?.status === "observed" ? "Observed" : "Not observed"}</td><td>${r?.status === "observed" ? "Fresh initial + target states · 0x102" : E(r?.reason || "Not recorded")}</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><div class="cert-section"><h2>Battery snapshot · reference decoding</h2><div class="fields">${[
    ["SoC", val("soc", "%")],
    ["Pack voltage", val("voltage", "V")],
    ["Pack current", val("current", "A")],
    ["Battery temperature, channel 1", val("temp1", "°C")],
    ["Odometer", val("odometer", "km")],
    ["BMS-reported SoH (unvalidated)", val("bms_soh", "%")],
  ]
    .map(
      ([k, v]) => `<div class="summary-row"><span>${k}</span><b>${v}</b></div>`,
    )
    .join(
      "",
    )}</div><p class="hint">Reported SoH is not a measured usable-capacity result. Missing/stale values are not replaced by defaults.</p></div><div class="cert-section"><h2>Cell voltage reference readings</h2><div class="scroll"><table><thead><tr><th>Channel</th><th>Voltage</th><th>Channel</th><th>Voltage</th></tr></thead><tbody>${Array.from({ length: 7 }, (_, i) => `<tr><td>Cell ${i + 1}</td><td>${val("cell" + (i + 1), "V")}</td><td>Cell ${i + 8}</td><td>${val("cell" + (i + 8), "V")}</td></tr>`).join("")}</tbody></table></div><p class="hint">Decoded channel labels follow the supplied firmware. This snapshot is not a load test or internal-resistance measurement.</p></div><div class="cert-section"><h2>Manual observations</h2><table>${Object.entries(
    report.manual || {},
  )
    .map(
      ([k, v]) =>
        `<tr><td>${E(k.replaceAll("_", " "))}</td><td>${E(v.replaceAll("_", " "))}</td></tr>`,
    )
    .join(
      "",
    )}</table><p>${E(report.technician_notes || "No additional notes.")}</p></div><div class="cert-section"><h2>Real-world range</h2><div class="range-grid">${["City", "Highway", "Mixed"].map((x) => `<div>${x}<strong>—</strong><small>Not assessed</small></div>`).join("")}</div><p class="hint">No validated range model is attached. Export the riding dataset to train and validate one; stationary switch checks cannot determine range.</p></div><div class="notice">${E(report.scope || "Reference decoder observations only. This is not an OEM certificate, a battery capacity certificate or a roadworthiness approval.")}</div><p class="hint">CAN counters at finalization: ${E(JSON.stringify(report.can_counters_final || {}))}. Transport losses, cumulative: ${E(report.transport_lost_total_final ?? "—")}. Review data quality before relying on measurements.</p><p class="hash">Report SHA-256: ${E(report.evidence_sha256 || "DEMO — no live evidence")}<br>${E(state.reportIntegrity || "Checksum covers the report, not an issuer identity or the entire raw dataset.")}</p><p class="hint">Technician acknowledgement: ${E(d.technician)} · Recorded digitally by the local station. No third-party certification is implied.</p></article>`;
}
function renderReport() {
  if (!state.report) {
    $("#workspace").innerHTML =
      '<div class="empty"><h2>No report yet</h2><p>Complete an inspection to generate a report.</p></div>';
    return;
  }
  let r = state.report;
  $("#workspace").innerHTML =
    `<section class="report-ready"><div class="report-icon">${documentIcon()}</div><span class="quiet">${E(r.session_id)}</span><h2>Inspection recorded</h2><p>${E(r.intake?.registration || "")} · ${E(r.intake?.manufacturer || "Ather")} ${E(r.intake?.model || "Rizta")}</p><span class="result ${r.status === "observations_complete" ? "observed" : "incomplete"}">${r.demo ? "Demo report" : r.status === "observations_complete" ? "Observations complete" : "Attention / incomplete"}</span><div class="report-actions"><button class="primary" data-action="pdf">Download PDF ${arrow()}</button><button class="secondary" data-action="export" ${r.demo ? "disabled" : ""}>Export data</button></div><div class="row report-tools"><button class="text-button" data-action="report-json">Report JSON</button><button class="text-button" data-action="print">Print</button><button class="text-button" data-action="new">New inspection</button></div></section><details class="report-details"><summary>Inspection details</summary>${cert(r)}</details>`;
}
function renderRecords() {
  let sessions = state.status?.sessions || [];
  $("#app").innerHTML =
    intro("Inspections", "") +
    banner() +
    `<section class="records-section"><div class="section-heading"><span class="quiet">${sessions.length} records</span><button class="secondary" data-action="import">Import report</button><input id="reportFile" type="file" accept=".json" hidden></div>${sessions.length ? `<div class="scroll"><table><thead><tr><th>Inspection</th><th>Registration</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>${sessions.map((s) => `<tr><td>${E(s.id)}</td><td>${E(s.registration)}</td><td>${E(s.owner)}</td><td>${E(s.state)}</td><td class="table-actions">${s.state === "finalized" ? `<button class="text-button" data-report="${E(s.id)}">View</button>` : ""}<button class="text-button" data-export="${E(s.id)}">Export</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><div class="empty-icon">' + documentIcon() + '</div><h2>No inspections on this browser</h2><p>Completed inspections appear here.</p><button class="primary" data-view="workspace">New inspection ' + arrow() + "</button></div>"}</section>`;
  $("#reportFile").onchange = async (e) => {
    try {
      let r = JSON.parse(await e.target.files[0].text());
      await openReport(r);
    } catch (e) {
      toast("Unable to import: " + e.message);
    }
  };
}
function renderSetup() {
  $("#app").innerHTML =
    intro("Station settings", "") +
    `<div class="settings-layout"><section class="settings-section"><h2>Standalone ESP32</h2><ol class="setup-steps"><li><span>01</span><div><h3>Join VoltCheck-CAN</h3><p>Wi-Fi password: <code>VoltCheck29</code></p></div></li><li><span>02</span><div><h3>Open 192.168.4.1</h3><p>This website and its assets are served directly by the ESP32.</p></div></li><li><span>03</span><div><h3>Keep this page open</h3><p>Inspection records are stored in this browser. Export them before clearing browser data or changing devices.</p></div></li></ol><a class="text-button" href="START-HERE.md">Setup guide</a></section><section class="settings-section"><h2>Diagnostic profile</h2><div class="setting-row"><span>Vehicle</span><b>Ather Rizta · 2.9 kWh</b></div><div class="setting-row"><span>Mode</span><b>Listen-only · 500 kbps</b></div><button class="text-button" data-action="profile-info">Profile details</button><p class="hint">Catalogue variants require their own validated diagnostic mapping.</p></section><section class="settings-section"><h2>Phone GPS</h2><p class="dialog-copy">Android browsers normally block geolocation on the ESP32 HTTP address. Use the existing localhost recorder for live phone GPS.</p><h2>Preview</h2><button class="secondary" data-action="demo">Try demo</button></section></div>`;
}
let catalogueFilter = "all",
  catalogueSearch = "";
function renderCatalogue() {
  $("#app").innerHTML =
    intro("Vehicle catalogue", "") +
    `<section class="catalogue-section"><div class="catalogue-toolbar"><div class="filter-tabs" role="group" aria-label="Vehicle family">${[
      ["all", "All models"],
      ["rizta", "Rizta"],
      ["450", "450"],
      ["konarc", "Konarc"],
    ]
      .map(
        ([v, label]) =>
          `<button data-family="${v}" class="${catalogueFilter === v ? "active" : ""}" aria-pressed="${catalogueFilter === v}">${label}</button>`,
      )
      .join(
        "",
      )}</div><label class="search-field"><span class="sr-only">Search vehicles</span><input id="catalogueSearch" type="search" placeholder="Search model or variant" value="${E(catalogueSearch)}"></label><a class="secondary" href="catalogue/AtherCatalogue-2026-11-06.zip" download>Export</a></div><div class="scroll"><table><thead><tr><th>Model</th><th>Battery</th><th>IDC range</th><th>Top speed</th><th></th></tr></thead><tbody id="catalogueRows"></tbody></table></div><div class="table-footer"><span class="quiet" id="catalogueCount"></span><button class="text-button" data-action="catalogue-notes">Data notes</button></div></section>`;
  renderCatalogueRows();
}
function renderCatalogueRows() {
  let variants = (catalogue?.variants || []).filter(
    (v) =>
      (catalogueFilter === "all" || v.family === catalogueFilter) &&
      [v.model, v.variant_code, v.battery_capacity_label]
        .join(" ")
        .toLowerCase()
        .includes(catalogueSearch.toLowerCase()),
  );
  $("#catalogueRows").innerHTML =
    variants
      .map(
        (v) =>
          `<tr><td><div class="vehicle-cell">${vehiclePhoto(v.model, "thumb")}<div><button class="model-link" data-spec="${E(v.id)}">${E(v.model)}</button><span class="variant-code">${E(v.variant_code || "Announced")}</span></div></div></td><td data-label="Battery">${E(v.battery_capacity_label || "Not published")}</td><td data-label="IDC range">${E(v.idc_range_km ?? "—")} km</td><td data-label="Top speed">${E(v.top_speed_kmh ?? "—")} km/h</td><td><button class="icon-button" data-spec="${E(v.id)}" aria-label="View ${E(v.model)} specifications">${arrow()}</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="5" class="no-results">No matching vehicles</td></tr>';
  $("#catalogueCount").textContent = variants.length + " variants";
}
