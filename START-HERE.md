# Readable edition

Start with CODE-GUIDE.md for a file-by-file explanation. Keep Config.h, CanCapture.h, LocalWebServer.h and WebAssets.h beside VoltCheckESP32.ino when opening it in Arduino IDE.

# VoltCheck ESP32 standalone

This package serves the existing VoltCheck interface directly from an ESP32-WROOM with **4 MB flash**. No Python service, Internet connection, filesystem upload or external JavaScript library installation is required for normal use.

## What runs where

- ESP32: Wi-Fi access point, website/assets in flash, listen-only classic CAN reception, bounded RAM frame buffer and HTTP batches.
- Phone/laptop browser: decoding, inspection state machine, persistent IndexedDB records, report checksum, PDF generation and CSV/evidence ZIP download.
- The original hosted site and original Python station package are unchanged.

The inspection sequence, vehicle catalogue/images, owner intake, nine guided control checks, manual findings, report viewer, PDF and evidence export are retained. Only the generic Rizta 2.9 kWh reference profile has live diagnostic mappings. Selecting a catalogue variant does not assign it a decoder. Independent SOH and real-world range models are not included.

## 1. Flash the sketch

1. Back up your existing sketch. Disconnect the vehicle diagnostic wiring while uploading.
2. Install Espressif **esp32** board support in Arduino IDE. This package is checked against version 3.3.2.
3. Extract the ZIP. Open **VoltCheckESP32/VoltCheckESP32.ino**. Keep WebAssets.h beside it.
4. Select **ESP32 Dev Module**, **Flash Size: 4MB**, and **Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS)**. The large app partition is needed because the complete website, fonts, images and PDF libraries are embedded. Do not use the default small app partition.
5. Select the correct USB port. Verify, then Upload. Serial Monitor speed is 115200 baud.
6. Reconnect only your previously verified CAN wiring and power arrangement.

Firmware uses TX GPIO23 to transceiver CTX, RX GPIO22 from transceiver CRX, 3.3 V transceiver power and common reference as required by the verified wiring. It listens at 500 kbps using TWAI_MODE_LISTEN_ONLY with no CAN transmit function. It cannot receive CAN FD. This software does not verify the vehicle connector pinout or provide galvanic isolation.

## 2. Open the website

1. On Android, join Wi-Fi **VoltCheck-CAN**, password **VoltCheck29**.
2. If Android says the network has no Internet, choose to stay connected.
3. In Chrome, enter **http://192.168.4.1/** directly. Use the same address every time to access the same browser records.
4. Allow the page to finish loading before beginning capture. The ESP32 receiver may be ready before any CAN measurements arrive. Verify actual battery values and fresh signals.

One Wi-Fi client and one recording tab are supported. Keep the browser visible and screen awake during recording. Backgrounding or closing the page interrupts capture; the ESP32 buffer is temporary and may overwrite frames. This is not an unattended logger.

## 3. Complete an inspection

1. Choose **Ather > Rizta > 2.9 kWh** (the generic reference profile).
2. Enter owner, registration, centre and technician, then record consent.
3. Start inspection. The browser stores raw frames and decoded samples as batches arrive.
4. Begin each check, follow its initial-state instruction, then perform the prompted action. Each state requires at least two distinct fresh matching frames spanning 200 ms. A missing key-OFF message is not treated as proof of OFF.
5. Complete all nine checks or mark an unavailable check as not observed with a reason. Complete the five manual observations.
6. Optional: record a road phase only while operating safely; start/stop while parked. GPS limitation is explained below.
7. Finalize, download the PDF, Report JSON and evidence ZIP. Reopen finalized reports from Records on the same browser.

A report remains attention/incomplete if required signals are unavailable, a check is not observed, a manual item needs attention or capture quality is insufficient. The report is an inspection record, not OEM or accredited battery certification. Displayed BMS SOH is labelled separately from a measured usable-capacity result.

## 4. Important differences from the laptop station

**Records live on the phone/browser**, not in ESP32 permanent storage. Refresh resumes an inspection from IndexedDB but fails any in-progress transition check so it must be retried. Records do not follow the ESP32 to another phone. Clearing browser data, changing browser/origin, private mode or browser eviction may remove records. Export after each inspection and retain backups.

The recorder limits an inspection to approximately 64 MB of serialized evidence. At that limit it stops the session as interrupted and retains saved evidence for export. Exporting large sessions requires phone memory. No flash writes per CAN frame occur.

**Phone GPS:** Android Chrome normally denies geolocation on http://192.168.4.1 because it is not HTTPS or localhost. The GPS button explains this rather than fabricating fixes. The rest of the inspection works without GPS; GPS CSV columns stay blank. For live phone GPS use the existing Android localhost/Termux station workflow. This release does not weaken Chrome security settings or install certificates. A future trusted HTTPS/app approach would be a separate implementation.

**Range predictions:** No model has been trained or validated in this package. City/highway/mixed report values remain not assessed. Road-phase CSV preserves measurements for subsequent modelling.

## 5. Export contents

- intake.json and report.json: inspection details and frozen report.
- raw_can.jsonl: received identifiers, payloads, software receive times, sequence and boot IDs.
- telemetry.csv: decoded snapshots with per-signal age/freshness, transport counters and optional matched GPS.
- range_training.csv: road-phase rows only; empty when no road phase was captured.
- events.json: inspection events, gaps and restart/pause observations.
- gps.json: actual fixes only; normally empty on direct ESP32 HTTP.
- DATA-NOTES.txt: interpretation limits.

CSV timing is measured, not assumed. Target snapshots are at most four per second; each underlying signal updates at its own CAN rate. The 2048-frame buffer and 128-frame batches can overflow under high traffic or long HTTP asset requests; losses remain visible. Validate current polarity, scaling and odometer before computing energy labels. Software receive timestamps are not CAN hardware arrival timestamps. GPS matching, when available on a secure origin, uses <=2 seconds and <=50 m reported horizontal accuracy.

## 6. Editing and rebuilding

The web/ directory contains editable copies of the existing interface and standalone backend modules. After changing assets, run `python3 build_assets.py` from this package's root to regenerate WebAssets.h, then compile/upload the sketch again. The website is embedded in that header; editing web/ alone does not update a flashed ESP32. Runtime needs no Python, but rebuilding assets uses the Python standard library.

Fonts and bundled vendor library licence notices are retained. The same report checksum detects report changes; it is not a trusted issuer signature. No cloud sync is included.

## Verification boundary

Automated logic and browser tests use synthetic CAN frames. Target compilation and exact flash/RAM usage are recorded in BUILD-REPORT.txt. On-vehicle CAN throughput, physical passivity, power stability and phone screen-lock behaviour require testing on your actual hardware. Do a short stationary inspection first and inspect its exported evidence before relying on a resale assessment.
