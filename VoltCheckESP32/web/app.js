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

// TEMPORARY_UI_MOCK_STATE
const mockVehicleSelection = { brand: 'Ather', model: 'Rizta', variant: '2.9 kWh' };
function logUiStateChange(step) { console.debug('[UI-TRACE]', step); }
// END_MOCK_STATE
