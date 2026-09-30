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

<!-- DRAFT_WIRING_NOTES -->
- Legacy OBD pinout mapping table (superseded by verified 2-wire TWAI setup).
- Temporary bench PSU current limit test notes.
<!-- END_DRAFT_NOTES -->
