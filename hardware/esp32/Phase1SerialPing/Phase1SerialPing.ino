/**
 * SmartLib ESP32 → Pi (USB Serial 115200): ping + RFID + FSR as one JSON line each.
 * Same program as ../Phase2SerialJson/Phase2SerialJson.ino — keep both in sync if you edit.
 *
 * Libraries (Arduino Library Manager):
 *   - MFRC522 by GithubCommunity
 *
 * Protocol: one JSON object per line (Serial.println). Matches hardware/PHASE2.md + Pi serial_bridge.py.
 *
 * --- Wiring (edit #defines below if yours differs) ---
 *
 * RC522 RFID (SPI — ESP32 VSPI):
 *   RC522  SDA/SS  -> GPIO 5
 *   RC522  RST     -> GPIO 22
 *   RC522  SCK     -> GPIO 18
 *   RC522  MOSI    -> GPIO 23
 *   RC522  MISO    -> GPIO 19
 *   RC522  3.3V / GND to ESP32 (3.3V only)
 *
 * FSR (voltage divider to ADC):
 *   Seat 1 -> GPIO 34   (Pi seat_index 1 → seat_1)
 *   Seat 2 -> GPIO 35   (Pi seat_index 2 → seat_2, matches pi-config seat_index_to_esp_gpio)
 *
 * UART to Pi instead of USB: use Serial2.begin(115200, SERIAL_8N1, RX, TX); replace Serial with Serial2 for output.
 */
#include <Arduino.h>
#include <cstdio>
#include <cstring>

// Max UID bytes for MFRC522 (4 or 7 typical; buffer for hex = 2 * max + NUL)
static const size_t RFID_UID_BYTES_MAX = 10;
static const size_t RFID_UID_HEX_MAX = RFID_UID_BYTES_MAX * 2u + 1u;

// ----------------------------- config ---------------------------------
static const uint32_t PING_INTERVAL_MS = 1000;
static const uint32_t RFID_DEBOUNCE_MS = 2000;  // same tag re-fire delay
static const uint32_t FSR_MIN_INTERVAL_MS = 400;
static const int FSR_DELTA_THRESHOLD = 80;  // also send when ADC jumps this much

#define FSR_PIN_SEAT1 34
#define FSR_PIN_SEAT2 35

#define ENABLE_RFID 1

#if ENABLE_RFID
#include <SPI.h>
#include <MFRC522.h>

#define RFID_SS_PIN 5
#define RFID_RST_PIN 22
MFRC522 mfrc522(RFID_SS_PIN, RFID_RST_PIN);
#endif

// ----------------------------- state ----------------------------------
static uint32_t lastPingMs;
#if ENABLE_RFID
static uint32_t lastRfidMs;
static char lastRfidUid[RFID_UID_HEX_MAX];
#endif
static uint32_t lastFsrMs[2];
static int lastFsrRaw[2] = {-1, -1};

#if ENABLE_RFID
static void uidToHexUpper(const MFRC522::Uid& uid, char* out, size_t outCap) {
  const size_t need = (size_t)uid.size * 2u + 1u;
  if (outCap < need) {
    out[0] = '\0';
    return;
  }
  for (byte i = 0; i < uid.size; i++)
    snprintf(out + i * 2u, outCap - i * 2u, "%02X", uid.uidByte[i]);
  out[uid.size * 2u] = '\0';
}

static void handleRfid() {
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial())
    return;

  char uidHex[RFID_UID_HEX_MAX];
  uidToHexUpper(mfrc522.uid, uidHex, sizeof(uidHex));

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  const uint32_t now = millis();
  if (strcmp(uidHex, lastRfidUid) == 0 && (now - lastRfidMs) < RFID_DEBOUNCE_MS)
    return;
  strncpy(lastRfidUid, uidHex, sizeof(lastRfidUid));
  lastRfidUid[sizeof(lastRfidUid) - 1] = '\0';
  lastRfidMs = now;

  Serial.printf("{\"t\":\"rfid\",\"uid\":\"%s\"}\n", uidHex);
}
#endif

static void handleFsr() {
  const int pins[2] = {FSR_PIN_SEAT1, FSR_PIN_SEAT2};
  const uint32_t now = millis();

  for (int i = 0; i < 2; i++) {
    const int seat = i + 1;
    const int raw = analogRead(pins[i]);
    const int prev = lastFsrRaw[i];
    const bool intervalOk = (now - lastFsrMs[i]) >= FSR_MIN_INTERVAL_MS;
    const bool bigJump = (prev < 0) || (abs(raw - prev) >= FSR_DELTA_THRESHOLD);
    if (!intervalOk && !bigJump)
      continue;
    lastFsrMs[i] = now;
    lastFsrRaw[i] = raw;
    Serial.printf("{\"t\":\"fsr\",\"seat\":%d,\"raw\":%d}\n", seat, raw);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  analogSetPinAttenuation(FSR_PIN_SEAT1, ADC_11db);
  analogSetPinAttenuation(FSR_PIN_SEAT2, ADC_11db);
  analogReadResolution(12);

#if ENABLE_RFID
  SPI.begin(18, 19, 23, RFID_SS_PIN);
  mfrc522.PCD_Init();
  delay(4);
  // Do not call PCD_DumpVersionToSerial() — non-JSON breaks the Pi bridge.
  lastRfidUid[0] = '\0';
#endif

  lastPingMs = millis();
}

void loop() {
#if ENABLE_RFID
  handleRfid();
#endif
  handleFsr();

  const uint32_t now = millis();
  if (now - lastPingMs >= PING_INTERVAL_MS) {
    lastPingMs = now;
    Serial.println(F("{\"t\":\"ping\",\"src\":\"esp32\"}"));
  }
}
