#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include "Config.h"
#include "CanCapture.h"
#include "WebAssets.h"  // Generated compressed assets; do not edit by hand.

namespace LocalWeb {
static WebServer server(Config::HTTP_PORT);

// Browser protocol: /frames?since=N returns a bounded batch starting at N.
// Keep the JSON keys and compact frame-array order compatible with engine.mjs.
inline void handleFrames() {
    uint32_t start = strtoul(server.arg("since").c_str(), nullptr, 10);
    const uint32_t head = CanCapture::head();
    const uint32_t oldest = head > Config::FRAME_CAPACITY
        ? head - Config::FRAME_CAPACITY : 0;
    if (start > head) {
        start = head;
    }
    const uint32_t lost = start < oldest ? oldest - start : 0;
    if (start < oldest) {
        start = oldest;
    }

    // Static storage avoids placing the batch on the task's limited stack.
    static CanCapture::Frame batch[Config::HTTP_BATCH_SIZE];
    const uint32_t requested = min(head - start, Config::HTTP_BATCH_SIZE);
    const uint32_t copied = CanCapture::copyBatch(start, requested, batch);
    twai_status_info_t status = {};
    if (CanCapture::ready) {
        twai_get_status_info(&status);
    }

    String json;
    json.reserve(18000);
    json = "{\"boot\":" + String(CanCapture::bootId);
    json += ",\"can_ok\":" + String(CanCapture::ready ? "true" : "false");
    json += ",\"now_us\":" + String((unsigned long long)esp_timer_get_time());
    json += ",\"next\":" + String(head);
    json += ",\"cursor\":" + String(start + copied);
    json += ",\"lost\":" + String(lost);
    json += ",\"missed\":" + String(status.rx_missed_count);
    json += ",\"overrun\":" + String(status.rx_overrun_count);
    json += ",\"bus_errors\":" + String(status.bus_error_count);
    json += ",\"free_heap\":" + String(ESP.getFreeHeap());
    json += ",\"frames\":[";

    for (uint32_t i = 0; i < copied; ++i) {
        const CanCapture::Frame& frame = batch[i];
        if (i != 0) {
            json += ",";
        }
        // [sequence, time_us, CAN_ID, extended, remote, DLC, byte0, ...]
        json += "[" + String(frame.sequence);
        json += "," + String((unsigned long long)frame.timestampUs);
        json += "," + String(frame.identifier);
        json += "," + String(frame.extended);
        json += "," + String(frame.remote);
        json += "," + String(frame.length);
        if (!frame.remote) {
            for (int byte = 0; byte < min((int)frame.length, 8); ++byte) {
                json += "," + String(frame.data[byte]);
            }
        }
        json += "]";
    }
    json += "]}";
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", json);
}

// HTML, scripts, pictures and fonts are served from flash, already gzip-packed.
// The browser decompresses them. No SPIFFS upload or Internet request is needed.
inline void handleAsset() {
    String path = server.uri();
    if (path == "/") {
        path = "/index.html";
    }
    for (const auto& asset : WEB_ASSETS) {
        if (path == asset.path) {
            server.sendHeader("Content-Encoding", "gzip");
            server.sendHeader("Cache-Control", "no-cache");
            server.sendHeader("X-Content-Type-Options", "nosniff");
            server.send_P(200, asset.mime, (const char*)asset.data, asset.size);
            return;
        }
    }
    server.send(404, "text/plain", "Not found");
}

inline void begin() {
    WiFi.mode(WIFI_AP);
    WiFi.setSleep(false);
    WiFi.softAP(Config::WIFI_NAME, Config::WIFI_PASSWORD, Config::WIFI_CHANNEL,
                0, Config::WIFI_CLIENT_LIMIT);
    server.on("/frames", HTTP_GET, handleFrames);
    server.onNotFound(handleAsset);
    server.begin();
}

inline void poll() {
    server.handleClient();
}
}  // namespace LocalWeb
