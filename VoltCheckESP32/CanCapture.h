#pragma once
#include <Arduino.h>
#include "driver/twai.h"
#include "esp_timer.h"
#include "Config.h"

// Receives classic CAN frames only. Decoding happens in the phone browser.
namespace CanCapture {
struct Frame {
    uint64_t timestampUs;  // ESP32 software receive time since boot.
    uint32_t sequence;
    uint32_t identifier;
    uint8_t extended;
    uint8_t remote;
    uint8_t length;
    uint8_t data[8];
};

static Frame buffer[Config::FRAME_CAPACITY];
static uint32_t nextSequence = 0;
static uint32_t bootId = 0;
static bool ready = false;
static portMUX_TYPE bufferLock = portMUX_INITIALIZER_UNLOCKED;

// This FreeRTOS task runs on core 1 while the HTTP server runs in loop().
// Critical sections protect only buffer access; JSON/network work stays outside.
inline void receiveTask(void*) {
    twai_message_t message;
    for (;;) {
        if (twai_receive(&message, pdMS_TO_TICKS(20)) != ESP_OK) {
            continue;
        }

        Frame frame = {};
        frame.timestampUs = esp_timer_get_time();
        frame.identifier = message.identifier;
        frame.extended = message.extd;
        frame.remote = message.rtr;
        frame.length = message.data_length_code;
        if (!message.rtr) {
            memcpy(frame.data, message.data, min((int)message.data_length_code, 8));
        }

        portENTER_CRITICAL(&bufferLock);
        frame.sequence = nextSequence;
        buffer[nextSequence % Config::FRAME_CAPACITY] = frame;
        ++nextSequence;
        portEXIT_CRITICAL(&bufferLock);
    }
}

inline bool begin() {
    bootId = esp_random();  // Browser uses this to identify restarts.
    twai_general_config_t general = TWAI_GENERAL_CONFIG_DEFAULT(
        Config::CAN_TX_PIN, Config::CAN_RX_PIN, TWAI_MODE_LISTEN_ONLY);
    general.tx_queue_len = 0;  // No application transmission queue.
    general.rx_queue_len = 256;
    twai_timing_config_t timing = TWAI_TIMING_CONFIG_500KBITS();
    twai_filter_config_t filter = TWAI_FILTER_CONFIG_ACCEPT_ALL();

    ready = twai_driver_install(&general, &timing, &filter) == ESP_OK;
    if (ready) {
        ready = twai_start() == ESP_OK;
    }
    if (ready) {
        ready = xTaskCreatePinnedToCore(
            receiveTask, "can-rx", 4096, nullptr, 3, nullptr, 1) == pdPASS;
    }
    return ready;
}

// Return a snapshot of the next sequence number without racing the receiver.
inline uint32_t head() {
    portENTER_CRITICAL(&bufferLock);
    uint32_t result = nextSequence;
    portEXIT_CRITICAL(&bufferLock);
    return result;
}

// Copy a bounded batch into caller storage. A slot may have been overwritten
// since head() was read; the sequence check detects that rather than mixing data.
inline uint32_t copyBatch(uint32_t start, uint32_t count, Frame* destination) {
    uint32_t copied = 0;
    portENTER_CRITICAL(&bufferLock);
    for (uint32_t i = 0; i < count; ++i) {
        Frame frame = buffer[(start + i) % Config::FRAME_CAPACITY];
        if (frame.sequence != start + i) {
            break;
        }
        destination[copied++] = frame;
    }
    portEXIT_CRITICAL(&bufferLock);
    return copied;
}
}  // namespace CanCapture
