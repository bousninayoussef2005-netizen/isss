/**
 * Phase 1 — send one JSON line per second on USB Serial (115200).
 * Flash this when the ESP32 is plugged into the Pi via USB (common: Pi sees /dev/ttyACM0).
 *
 * For UART to the Pi instead of USB: use Serial2 and cross-connect TX/RX + GND.
 * Many ESP32 boards: Serial2.begin(115200, SERIAL_8N1, RX_pin, TX_pin);
 * Example (check your board pinout): Serial2.begin(115200, SERIAL_8N1, 16, 17);
 * Then replace Serial below with Serial2 for output lines.
 */
void setup() {
  Serial.begin(115200);
  delay(800);
}

void loop() {
  Serial.println("{\"t\":\"ping\",\"src\":\"esp32\"}");
  delay(1000);
}
