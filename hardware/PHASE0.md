# Phase 0 — Freeze the spec

Complete this **before** writing ESP32 or Raspberry Pi code. Copy values from **Firebase Console → Firestore** and from your **physical labels** (tape on cables / seat numbers).

---

## 1) Physical seat → Firestore seat

For **each** FSR / seat channel on the ESP32, record how it maps to a document in the `seats` collection.

**How to read Firestore:**

1. Open **Firestore → `seats`**.
2. For each document, note **Document ID** (often `seat_1`, `S003`, …) and the field **`id`** inside the document (shown on the map in SmartLib).

| # | Physical label (your choice) | ESP32 channel / wire label | Firestore **document ID** | Field **`id`** (if different from doc ID) |
|---|------------------------------|----------------------------|-----------------------------|-------------------------------------------|
| 1 | | ADC0 / GPIO … | | |
| 2 | | | | |
| 3 | | | | |
| _add rows_ | | | | |

**Rule for the Pi later:** one stable key per chair, e.g. `seat_index` 1…N in JSON from the ESP32, maps to **exactly one** Firestore `seats` document (use `firebaseId` = document ID in code paths).

---

## 2) RFID tag UID → Student id

Use **hex UID** as printed by your RFID library (define convention: **uppercase**, no spaces, e.g. `E3A1B2C4`).

| RFID UID (hex) | Firestore `students` document id (= `id` field) | Student name (for you, not for code) |
|----------------|---------------------------------------------------|----------------------------------------|
| | | |
| | | |
| | | |

**How to fill:** scan each tag once with a test sketch or phone NFC app if applicable; match to the student row in **`students`**.

---

## 3) Test book barcodes

Pick **2–3 books** in Firestore **`books`** where you know **`barcode`** and **`id`**.

| Book `id` (e.g. BK-002) | `barcode` (exact string scanner will send) | Notes |
|-------------------------|---------------------------------------------|--------|
| | | |
| | | |

**Check:** Scanner output must match **`barcode`** character-for-character (including leading zeros). Trim only if you explicitly decide that in Pi code.

---

## 4) Pi runtime (pick one)

Check **one** box and use it for all Pi services:

- [ ] **Python 3** + `firebase-admin` + `pyserial` (common for Pi + GPIO/serial tutorials)
- [ ] **Node.js** + `firebase-admin` + `serialport` (fine if you prefer JS end-to-end)

**Chosen:** _________________________  **Version:** _________________________

---

## 5) Copy-paste checklist (done = Phase 0 complete)

- [ ] Every **wired seat** has a row in table **1**.
- [ ] Every **RFID tag** you will use in demos has a row in table **2**.
- [ ] At least **two** books in table **3** (one for borrow tests, one optional second).
- [ ] **Pi language** decided in section **4**.
- [ ] Optional: duplicate table **1** and **2** into `hardware/pi-config.template.json` (rename to `pi-config.local.json` on the Pi, **never commit** secrets).

When this file is filled, Phase 0 is done — proceed to **Phase 1** (ESP32 ↔ Pi serial pipe).
