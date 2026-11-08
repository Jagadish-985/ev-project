# Readable firmware and website guide

## Start here

Open `VoltCheckESP32/VoltCheckESP32.ino` in Arduino IDE. Keep all `.h` files in that folder. Arduino compiles them together. The website is already embedded; rebuilding assets is only required after changing the web source.

Board: classic ESP32 Dev Module, 4 MB flash, Huge APP partition. Arduino-ESP32 core 3.3.2. Disconnect the vehicle connector while uploading. Join VoltCheck-CAN / VoltCheck29 and open http://192.168.4.1/ afterward.

## Read the firmware in this order

| File | Responsibility |
| --- | --- |
| VoltCheckESP32.ino | Entry point: start receiver, start local Wi-Fi/server, service HTTP requests. |
| Config.h | Pin assignments, Wi-Fi credentials, buffer and batch limits. |
| CanCapture.h | Listen-only CAN setup, receive task, sequence numbers, locked RAM ring buffer. |
| LocalWebServer.h | HTTP frame endpoint and serving compressed website files from flash. |
| WebAssets.h | Machine-generated compressed website bytes. This is an embedded data file, not handwritten logic. |

The transceiver receives electrical CAN signals and presents logic-level signals to the ESP32 TWAI controller. GPIO23 connects to transceiver CTX; GPIO22 connects from transceiver CRX. Vehicle connector pins must be verified separately. Software uses classic CAN at 500 kbps and listen-only mode; there is no CAN transmit call.

`setup()` runs once after boot. `CanCapture::begin()` configures TWAI and starts a FreeRTOS receive task on core 1. `LocalWeb::begin()` starts a one-client Wi-Fi access point and port-80 web server. `loop()` services HTTP requests while the receive task independently collects frames.

The ring buffer retains the latest 2048 frames. Each frame has a software receive timestamp, sequence number, identifier, format flags, DLC and up to eight bytes. Critical sections protect concurrent buffer access. This RAM buffer is temporary; restarting the board clears it.

## Browser source

The editable web files are in `VoltCheckESP32/web/`:

- `index.html`: webpage entry and asset references.
- `styles.css`: responsive appearance and transitions.
- `app.js`: screens, owner intake, vehicle selection, guided workflow and actions.
- `engine.mjs`: CAN decoding, inspection transition rules, SHA-256, CSV and ZIP helpers.
- `standalone.mjs`: browser-side station API, IndexedDB records, capture coordination and export.
- `certificate.mjs`: PDF report layout and generation.
- `profiles.json` and `catalogue/`: mapping metadata and dated manufacturer catalogue.
- `images/`, `fonts/`, `vendor/`: bundled images, licensed fonts and third-party libraries.

Application JavaScript, HTML and CSS are formatted for reading. Third-party vendor files retain their supplied distribution format and notices.

## How data travels

1. The CAN receive task stores raw frames in ESP32 RAM.
2. The browser requests `/frames?since=N` with its next desired sequence number.
3. The ESP32 copies up to 128 frames and sends JSON.
4. Browser code decodes supported signals and checks initial/changed control states.
5. IndexedDB retains raw evidence, samples, events, intake and reports on that phone.
6. The browser produces PDF reports and downloadable CSV/evidence ZIP files.

The compact frame array is `[sequence, time_us, CAN_ID, extended, remote, DLC, byte0, ...]`. The response includes `boot` for restart detection, `cursor` for the next request, `lost` for overwritten frames, controller error counters and free heap. Preserve these field names and order when modifying either side of the protocol.

## Editing without losing synchronization

1. Edit firmware logic in the named `.h` files or `.ino`.
2. Edit webpage logic in `web/`; do not modify compressed byte arrays manually.
3. After web edits, run `python3 build_assets.py` from this package directory.
4. Compile/upload the Arduino sketch again. No filesystem upload is required.

`build_assets.py` compresses each web file and generates WebAssets.h and asset-manifest.json. Asset hashes allow checking that the embedded bytes correspond to the supplied source.

## Verification and limitations

Run `node --test tests/test_engine.mjs tests/test_station.mjs` for synthetic browser-engine tests. See BUILD-REPORT.txt for target compilation results. A successful compile does not establish physical scooter operation.

Only the generic Rizta 2.9 reference profile has live mappings. No independent SOH or city/highway range model is provided. Phone GPS normally cannot run on the ESP32's ordinary HTTP origin. Keep capture in the foreground and export records before clearing browser data. A report checksum checks integrity, not measurement accuracy or accredited certification.
