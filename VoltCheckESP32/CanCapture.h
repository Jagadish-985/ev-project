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

// TEMPORARY_CAN_DIAGNOSTIC_DUMP
// Serial.println(message.identifier, HEX);
// Serial.println(message.data_length_code);
// END_TEMPORARY_DUMP
