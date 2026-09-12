#pragma once
#include <Arduino.h>

// All user-adjustable hardware and network settings live here.
namespace Config {
constexpr gpio_num_t CAN_TX_PIN = GPIO_NUM_23;  // To transceiver CTX input.
constexpr gpio_num_t CAN_RX_PIN = GPIO_NUM_22;  // From transceiver CRX output.
constexpr uint32_t FRAME_CAPACITY = 2048;       // Temporary RAM ring buffer.
constexpr uint32_t HTTP_BATCH_SIZE = 128;      // Maximum frames per response.
constexpr char WIFI_NAME[] = "VoltCheck-CAN";
constexpr char WIFI_PASSWORD[] = "VoltCheck29";
constexpr uint8_t WIFI_CHANNEL = 1;
constexpr uint8_t WIFI_CLIENT_LIMIT = 1;
constexpr uint16_t HTTP_PORT = 80;
constexpr uint32_t SERIAL_BAUD = 115200;
}  // namespace Config
