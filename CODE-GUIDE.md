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

<!-- DRAFT_ARCHITECTURE_SCRATCHPAD -->
- Initial polling interval benchmark notes (replaced by FreeRTOS core-1 task).
<!-- END_SCRATCHPAD -->
