/**
 * VoltCheck: complete offline inspection website on classic ESP32-WROOM.
 * Board: ESP32 Dev Module | Flash: 4 MB | Partition: Huge APP (3 MB).
 * Arduino-ESP32 core: 3.3.2.
 *
 * Data flow:
 * Vehicle CAN -> transceiver -> receive task -> RAM ring buffer
 * -> HTTP frame batches -> phone browser -> inspection, PDF and CSV.
 *
 * The phone stores inspection records. The ESP32 only buffers recent frames.
 * No CAN transmission function is used. Live mappings are vehicle-specific.
 */
#include "Config.h"
#include "CanCapture.h"
#include "LocalWebServer.h"

void setup() {
    Serial.begin(Config::SERIAL_BAUD);
    const bool canReady = CanCapture::begin();
    LocalWeb::begin();

    Serial.printf("Open http://192.168.4.1/ on Wi-Fi %s\n", Config::WIFI_NAME);
    Serial.printf("CAN receiver: %s | Free heap: %u bytes\n",
                  canReady ? "ready" : "FAILED", ESP.getFreeHeap());
}

void loop() {
    LocalWeb::poll();
    delay(1);  // Yield while the receive task independently collects CAN frames.
}
