// Reference-style A4 certificate. Fonts and libraries are bundled for offline use.
export function buildCertificate(
  report,
  { jsPDF, qr, fonts },
  { appendix = true } = {},
) {
  const doc = new jsPDF({
    unit: "pt",
    format: [595.92, 842.88],
    compress: true,
  });
  doc.addFileToVFS("Montserrat-Regular.ttf", fonts.regular);
  doc.addFont("Montserrat-Regular.ttf", "Montserrat", "normal");
  doc.addFileToVFS("Montserrat-Bold.ttf", fonts.bold);
  doc.addFont("Montserrat-Bold.ttf", "Montserrat", "bold");
  const W = 595.92,
    H = 842.88,
    L = 30,
    R = W - 30,
    BLUE = "#203FD5",
    GREY = "#727A8C",
    BLACK = "#101113",
    LIGHT = "#E5E8F1";
  const d = report.intake || {},
    s = report.snapshot || {},
    make = d.manufacturer || d.profile?.manufacturer || "Not recorded",
    model = d.model || d.profile?.model || "Not recorded",
    variant = d.variant || d.profile?.variant || "Not recorded";
  const fresh = (k) =>
    s[k] && s[k].fresh && Number.isFinite(Number(s[k].value));
  const value = (k, unit = "", digits = 1) =>
    fresh(k)
      ? Number(s[k].value).toFixed(digits) + (unit ? " " + unit : "")
      : "Not assessed";
  const date = new Date(report.finished_ms || Date.now()),
    day = date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }),
    clock = date.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  function text(
    str,
    x,
    y,
    size = 12,
    bold = false,
    color = BLACK,
    align = "left",
  ) {
    doc.setFont("Montserrat", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(String(str ?? ""), x, y, { baseline: "top", align });
  }
  function fit(
    str,
    x,
    y,
    width,
    size = 12,
    bold = false,
    color = BLACK,
    align = "left",
  ) {
    str = String(str ?? "");
    doc.setFont("Montserrat", bold ? "bold" : "normal");
    let n = size;
    while (
      (doc.getTextWidth(String(str)) * n) / doc.getFontSize() > width &&
      n > 6
    )
      n -= 0.25;
    while (
      (doc.getTextWidth(str) * n) / doc.getFontSize() > width &&
      str.length > 3
    )
      str = str.slice(0, -4) + "...";
    text(str, x, y, n, bold, color, align);
  }
  function para(str, x, y, width, size = 8.5, color = GREY, maxLines = 10) {
    doc.setFont("Montserrat", "normal");
    doc.setFontSize(size);
    let lines = doc.splitTextToSize(String(str ?? ""), width);
    if (lines.length > maxLines)
      lines = [
        ...lines.slice(0, maxLines - 1),
        "See the full inspection record for additional details.",
      ];
    lines.forEach((v, i) =>
      text(v, x, y + i * size * 1.45, size, false, color),
    );
    return y + lines.length * size * 1.45;
  }
  function line(x1, y, x2, width = 1.2, color = BLACK) {
    doc.setDrawColor(color);
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
  }
  function heading(str, x, y, width = R - L, size = 15) {
    fit(str, x, y, width, size, true);
    line(x, y + 25, x + width);
  }
  function row(label, val, x, y, width, size = 12) {
    text(label, x, y, size, false, GREY);
    fit(val, x + width, y, width * 0.59, size, true, BLACK, "right");
  }
  function band(y) {
    doc.setFillColor(BLUE);
    doc.rect(0, y, W, 50, "F");
    // Small calendar and shield symbols drawn as vectors.
    doc.setDrawColor("#FFFFFF");
    doc.setLineWidth(1.4);
    doc.roundedRect(31, y + 18, 12, 14, 1, 1);
    doc.line(31, y + 22, 43, y + 22);
    doc.line(34, y + 15, 34, y + 20);
    doc.line(40, y + 15, 40, y + 20);
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        doc.setFillColor("#FFFFFF");
        doc.rect(34 + a * 5, y + 25 + b * 4, 1.4, 1.4, "F");
      }
    text("Test date:", 49, y + 20, 10, false, "#FFFFFF");
    text(day, 104, y + 20, 10, true, "#FFFFFF");
    text("[" + clock + "]", 173, y + 20, 10, false, "#FFFFFF");
    doc.setFillColor("#FFFFFF");
    doc.lines(
      [
        [6, -2],
        [6, 2],
        [0, 9],
        [-6, 6],
        [-6, -6],
        [0, -9],
      ],
      338,
      y + 18,
      [1, 1],
      "F",
      true,
    );
    doc.setDrawColor(BLUE);
    doc.setLineWidth(1.2);
    doc.line(344, y + 20, 344, y + 27);
    doc.line(341, y + 23, 347, y + 23);
    text("Tested by:", 355, y + 20, 10, false, "#FFFFFF");
    fit(
      d.station || "Local inspection station",
      R,
      y + 20,
      147,
      10,
      true,
      "#FFFFFF",
      "right",
    );
  }
  function footer(page) {
    fit(
      d.station_url || d.station || "VoltCheck inspection station",
      W / 2,
      783,
      500,
      12,
      true,
      GREY,
      "center",
    );
    text(
      "This is a point-in-time assessment for information purposes only.",
      W / 2,
      800,
      8.4,
      false,
      GREY,
      "center",
    );
    text(
      "Reference-decoded observations. Not an OEM approval or a measured-capacity certificate.",
      W / 2,
      814,
      7.4,
      false,
      GREY,
      "center",
    );
    text(
      "VoltCheck Station 1.0  |  " +
        page +
        " / " +
        (appendix ? "3" : "2") +
        (report.demo ? "  |  LAYOUT SAMPLE - SYNTHETIC DATA" : ""),
      W / 2,
      828,
      7.4,
      false,
      GREY,
      "center",
    );
  }
  function subHeader() {
    fit("Assessment ID: " + report.session_id, L, 27, 340, 11);
    text("Powered by", 402, 15, 11);
    text("VOLT CHECK", 401, 38, 18, false, BLUE);
    band(66);
  }
  function arc(cx, cy, r, start, end, color, width) {
    doc.setDrawColor(color);
    doc.setLineWidth(width);
    let steps = Math.max(2, Math.ceil(Math.abs(end - start) / 3)),
      pts = [];
    let x0 = cx + r * Math.cos((start * Math.PI) / 180),
      y0 = cy + r * Math.sin((start * Math.PI) / 180),
      px = x0,
      py = y0;
    for (let i = 1; i <= steps; i++) {
      let a = ((start + ((end - start) * i) / steps) * Math.PI) / 180,
        x = cx + r * Math.cos(a),
        y = cy + r * Math.sin(a);
      pts.push([x - px, y - py]);
      px = x;
      py = y;
    }
    doc.lines(pts, x0, y0, [1, 1], "S", false);
  }
  // Page 1 mirrors the reference's title, band, two columns, gauge and range table.
  text(
    report.demo ? "Diagnostics report - LAYOUT SAMPLE" : "Diagnostics report",
    L,
    27,
    12,
    false,
    GREY,
  );
  fit("Battery Health Check", L, 43, 445, 36, true, BLUE);
  text("Powered by", L, 95, 12, false, GREY);
  text("VOLT CHECK", L, 117, 25, false, BLUE);
  if (qr) {
    const q = qr(0, "M");
    q.addData(
      "VOLTCHECK|" +
        report.session_id +
        "|" +
        (report.evidence_sha256 || "DEMO"),
    );
    q.make();
    let count = q.getModuleCount(),
      sz = 72 / count;
    doc.setFillColor(BLACK);
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (q.isDark(r, c))
          doc.rect(487 + c * sz, 30 + r * sz, sz + 0.03, sz + 0.03, "F");
  }
  text("Record fingerprint", 523, 112, 8, true, BLUE, "center");
  text("Assessment ID", 523, 134, 8.4, false, GREY, "center");
  fit(report.session_id, 523, 146, 95, 8.4, false, GREY, "center");
  band(169);
  heading("Vehicle information", L, 233);
  row("Make", make, L, 270, 260);
  row("Model", model, L, 294, 260);
  row("Registration", d.registration || "Not recorded", 306, 270, 259);
  row(
    "First registered",
    (d.first_registered || "Not recorded").replace(
      /^(\d{4})-(\d{2})-(\d{2})$/,
      "$3/$2/$1",
    ),
    306,
    294,
    259,
  );
  row("Mileage", value("odometer", "km", 1), 306, 318, 259);
  heading("Battery health", L, 378, 260);
  heading("Manufacturer battery warranty", 306, 378, 259);
  row("Battery capacity", "Not measured | " + variant, L, 411, 260, 10.5);
  text(
    "Usable energy measured | vehicle variant label.",
    L,
    430,
    8.1,
    false,
    GREY,
  );
  text("State of health*", L, 450, 12, false, GREY);
  text(
    "BMS-reported value; not an independent capacity test.",
    L,
    468,
    7.7,
    false,
    GREY,
  );
  const pct =
    fresh("bms_soh") && s.bms_soh.value >= 0 && s.bms_soh.value <= 100
      ? Number(s.bms_soh.value)
      : null;
  arc(160, 540, 47, 135, 405, LIGHT, 16);
  if (pct !== null)
    arc(160, 540, 47, 135, 135 + (270 * pct) / 100, "#AEC1F2", 16);
  text(
    pct === null ? "N/A" : Math.round(pct) + "%",
    160,
    529,
    pct === null ? 24 : 26,
    true,
    BLACK,
    "center",
  );
  const cells = Array.from({ length: 14 }, (_, i) =>
      fresh("cell" + (i + 1)) ? Number(s["cell" + (i + 1)].value) : null,
    ),
    complete = cells.every((x) => x !== null),
    actual = cells.filter((x) => x !== null),
    delta = complete
      ? (Math.max(...actual) - Math.min(...actual)) * 1000
      : null;
  row(
    "Cell voltage difference",
    delta === null ? "Not assessed" : Math.round(delta) + " mV",
    L,
    593,
    260,
    11.5,
  );
  text(
    "Calculated only when all 14 reference channels are fresh.",
    L,
    613,
    7.7,
    false,
    GREY,
  );
  para(
    "Warranty information has not been independently verified. Confirm the applicable terms, registration date, distance and transfer conditions with the manufacturer.",
    306,
    411,
    259,
    8.2,
    GREY,
    4,
  );
  for (let [i, [label, v]] of [
    ["Distance limit", "Not verified"],
    ["Duration", "Not verified"],
    ["Provider", "Not verified"],
    ["In warranty period", "Not verified"],
    ["Remaining duration", "Not verified"],
    ["Remaining distance", "Not verified"],
  ].entries())
    row(label, v, 306, 460 + i * 24, 259, 11.3);
  heading("Real range", L, 639);
  para(
    "Estimated range depends on usable energy and future riding conditions. No validated range prediction model is attached to this assessment.",
    L,
    674,
    R - L,
    8.1,
    GREY,
    2,
  );
  const columns = [218, 374, 530];
  ["Urban riding", "Mixed riding", "Highway riding"].forEach((v, i) =>
    text(v, columns[i], 707, 11, false, GREY, "center"),
  );
  ["Summer", "Winter"].forEach((season, i) => {
    text(season, L, 731 + i * 24, 12, false, GREY);
    columns.forEach((x) =>
      text("Not assessed", x, 732 + i * 24, 10, true, BLACK, "center"),
    );
  });
  footer(1);
  // Page 2: cell bars, measured spread and pack data in the same positions as reference.
  doc.addPage();
  subHeader();
  heading("Cell voltage balance", L, 138);
  const chart = { x: 65, y: 182, w: 495, h: 188 };
  let min = actual.length ? Math.min(...actual) : 0,
    max = actual.length ? Math.max(...actual) : 0;
  let lo = actual.length ? Math.max(0, min - 0.2) : 0,
    hi = actual.length ? Math.max(max + 0.01, lo + 0.2) : 4.5;
  doc.setDrawColor(GREY);
  doc.setLineWidth(1);
  doc.line(chart.x, chart.y, chart.x, chart.y + chart.h);
  doc.line(chart.x, chart.y + chart.h, chart.x + chart.w, chart.y + chart.h);
  text(
    actual.length ? hi.toFixed(3) + " V" : "V",
    59,
    chart.y - 2,
    7,
    false,
    GREY,
    "right",
  );
  text(
    actual.length ? lo.toFixed(3) + " V" : "No data",
    59,
    chart.y + chart.h - 5,
    7,
    false,
    GREY,
    "right",
  );
  doc.setFont("Montserrat", "normal");
  doc.setFontSize(10);
  doc.setTextColor(GREY);
  doc.text("Voltage (V)", 45, 280, { angle: 90 });
  text("Cells", 312, 379, 10, false, GREY, "center");
  const gap = chart.w / 14,
    bw = gap * 0.48;
  cells.forEach((v, i) => {
    let x = chart.x + i * gap + gap * 0.25;
    if (v !== null) {
      let h = ((v - lo) / (hi - lo)) * chart.h;
      doc.setFillColor(BLUE);
      doc.rect(x, chart.y + chart.h - h, bw, h, "F");
    } else {
      doc.setDrawColor("#D7DCE7");
      doc.rect(x, chart.y + 8, bw, chart.h - 8);
    }
    text(i + 1, x + bw / 2, chart.y + chart.h + 4, 6.5, false, GREY, "center");
  });
  if (!actual.length)
    text(
      "No fresh cell-voltage channels were recorded.",
      314,
      266,
      11,
      false,
      GREY,
      "center",
    );
  heading("Voltage difference between cells", L, 410, 260, 12);
  heading("Battery pack data", 306, 410, 259, 12);
  row(
    "Min voltage",
    complete ? min.toFixed(3) + " V" : "Not assessed",
    L,
    439,
    260,
    11.5,
  );
  row(
    "Max voltage",
    complete ? max.toFixed(3) + " V" : "Not assessed",
    L,
    463,
    260,
    11.5,
  );
  doc.setFillColor("#DCE1EA");
  doc.roundedRect(38, 503, 245, 23, 11, 11, "F");
  if (delta !== null) {
    let x = 38 + (Math.min(100, delta) / 100) * 245;
    doc.setDrawColor(BLUE);
    doc.setLineWidth(2.5);
    doc.line(x, 503, x, 526);
    text(
      Math.round(delta) + " mV",
      Math.min(260, Math.max(50, x)),
      489,
      8,
      false,
      GREY,
      "center",
    );
  } else text("Not assessed", 160, 509, 9, false, GREY, "center");
  text("0 mV", L, 532, 8.5, false, GREY);
  text("100 mV", 290, 532, 8.5, false, GREY, "right");
  para(
    "A voltage spread is a snapshot, not an internal-resistance or capacity test. Retest under controlled conditions before drawing conclusions.",
    L,
    561,
    260,
    8.2,
    GREY,
    4,
  );
  const pack = [
    ["Fresh reference channels", actual.length + " / 14"],
    ["State of charge*", value("soc", "%", 1)],
    ["Pack temperature*", value("temp1", "°C", 1)],
    ["Pack voltage*", value("voltage", "V", 2)],
    ["Pack current*", value("current", "A", 2)],
  ];
  pack.forEach(([k, v], i) => row(k, v, 306, 439 + i * 24, 259, 11.5));
  text(
    "*As observed at time of test; reference units.",
    306,
    561,
    8,
    false,
    GREY,
  );
  heading("About this assessment", L, 607);
  para(
    "This report records observations made by " +
      (d.station || "the inspection station") +
      ". CAN signal names, units and channel counts follow the supplied Ather reference decoder and require validation on the inspected vehicle.",
    L,
    640,
    R - L,
    8.5,
    GREY,
    4,
  );
  para(
    "Battery state of health, if shown, is BMS-reported. Usable capacity, manufacturer warranty, internal resistance, fault-code status and real-world range have not been independently established by this passive inspection.",
    L,
    686,
    R - L,
    8.5,
    GREY,
    4,
  );
  para(
    appendix
      ? "The diagnostic appendix lists the guided switch observations, manual checks and data-quality findings. Raw evidence and CSV data are retained with the local station record."
      : "Raw evidence, guided switch observations and CSV data are retained with the local station record.",
    L,
    731,
    R - L,
    8.2,
    GREY,
    3,
  );
  footer(2);
  if (appendix) {
    doc.addPage();
    subHeader();
    heading("Diagnostic inspection record", L, 138);
    row("Owner", d.owner_name || "Not recorded", L, 175, 260, 10);
    row("Technician", d.technician || "Not recorded", 306, 175, 259, 10);
    row("Contact", d.owner_phone || "Not recorded", L, 195, 260, 10);
    row("VIN / chassis", d.vin || "Not recorded", 306, 195, 259, 10);
    text("Guided CAN observations", L, 230, 13, true);
    let y = 256;
    text("CHECK", L, y, 8, true, GREY);
    text("RESULT", 220, y, 8, true, GREY);
    text("EVIDENCE / REASON", 330, y, 8, true, GREY);
    line(L, y + 15, R, 0.7, LIGHT);
    y += 25;
    for (let c of report.checks || []) {
      text(c.title, L, y, 10);
      text(
        c.status === "observed" ? "Observed" : "Not observed",
        220,
        y,
        9,
        true,
        c.status === "observed" ? BLUE : GREY,
      );
      para(
        c.status === "observed"
          ? report.demo
            ? "Simulated transition"
            : "Fresh initial and target state; CAN 0x102"
          : c.reason || "Not recorded",
        330,
        y,
        235,
        8,
        GREY,
        2,
      );
      y += 35;
    }
    heading("Manual checks", L, 595, 260, 12);
    heading("Data quality", 306, 595, 259, 12);
    Object.entries(report.manual || {}).forEach(([k, v], i) =>
      row(
        k.replaceAll("_", " "),
        v.replaceAll("_", " "),
        L,
        627 + i * 19,
        260,
        9,
      ),
    );
    let q = report.quality || {};
    para(
      "Overall result: " +
        report.status.replaceAll("_", " ") +
        ". Missing / stale essential measurements: " +
        (q.missing_or_stale_essential_signals?.join(", ") ||
          "See station record") +
        ".",
      306,
      627,
      259,
      8.5,
      GREY,
      4,
    );
    para(
      "Technician notes: " + (report.technician_notes || "None recorded."),
      306,
      685,
      259,
      8.2,
      GREY,
      5,
    );
    text(
      "Report integrity checksum (not an issuer signature)",
      L,
      741,
      7.5,
      false,
      GREY,
    );
    fit(
      report.evidence_sha256 || "DEMONSTRATION - NO LIVE EVIDENCE",
      L,
      756,
      R - L,
      7,
      false,
      GREY,
    );
    footer(3);
  }
  doc.setProperties({
    title: "Battery Health Check - " + report.session_id,
    subject: "Passive inspection record; reference decoding",
    author: d.station || "VoltCheck Station",
    creator: "VoltCheck Station 1.0",
  });
  return doc;
}
let fontsPromise;
async function browserFonts() {
  if (!fontsPromise)
    fontsPromise = Promise.all(
      ["Regular", "Bold"].map(async (name) => {
        let r = await fetch("fonts/Montserrat-" + name + ".ttf");
        if (!r.ok) throw Error("Bundled certificate font unavailable");
        let b = new Uint8Array(await r.arrayBuffer()),
          str = "";
        for (let i = 0; i < b.length; i += 8192)
          str += String.fromCharCode(...b.subarray(i, i + 8192));
        return btoa(str);
      }),
    ).then(([regular, bold]) => ({ regular, bold }));
  return fontsPromise;
}
export async function downloadCertificate(report) {
  let doc = buildCertificate(report, {
    jsPDF: window.jspdf.jsPDF,
    qr: window.qrcode,
    fonts: await browserFonts(),
  });
  doc.save(report.session_id + "-certificate.pdf");
}
