# Phase 0 — Freeze the spec

**Draft status:** Tables below are **partially filled** from your SmartLib Firestore screenshots and this repo. Anything marked **VERIFY** or **PENDING_SCAN** must be corrected in **Firebase Console** or by **scanning tags** before you trust it in production.

---

## 1) Physical seat → Firestore seat

For **each** FSR / seat channel on the ESP32, record how it maps to a document in the `seats` collection.

**How to read Firestore:** Firestore → `seats` → each document’s **Document ID** and field **`id`**.

| # | Physical label (tape on chair / cable) | ESP32 channel / wire label | Firestore **document ID** | Field **`id`** (if different from doc ID) |
|---|----------------------------------------|-----------------------------|-----------------------------|-------------------------------------------|
| 1 | Chair / FSR #1 | *fill when wired* e.g. `ADC1` / `GPIO34` | `seat_1` | `seat_1` (VERIFY) |
| 2 | Chair / FSR #2 | *fill when wired* | `seat_2` | `seat_2` (VERIFY) |
| 3 | *(add a row per extra FSR)* | | | |

**Notes:**

- Your console showed documents **`seat_1`** and **`seat_2`** with `id` matching — **confirm** in your project today (IDs might be `S001` style elsewhere).
- When the ESP32 sends `seat_index: 1`, the Pi will map to Firestore document id **`seat_1`** (or whatever you lock in the last column).

---

## 2) RFID tag UID → Student id

**Convention:** UID = **uppercase hex**, no spaces (match your RFID library output).

**PENDING_SCAN:** Run a small RFID read sketch once per tag; paste the UID here.

| RFID UID (hex) | Firestore `students` document id (= `id` field) | Student name (for you) |
|----------------|--------------------------------------------------|--------------------------|
| `PENDING_SCAN_TAG_1` | `241-7504` | Youssef Bousnina (VERIFY id in `students`) |
| `PENDING_SCAN_TAG_2` | *e.g. second test student id* | *name* |
| `PENDING_SCAN_TAG_3` | | |

**Notes:**

- `241-7504` appeared in your **`seats`** / **`transactions`** sample data — **open `students`** and confirm that document exists and matches the person holding tag 1.
- Replace `PENDING_SCAN_TAG_*` with real hex (example shape: `E3D4A1B2C90F`).

---

## 3) Test book barcodes

Pick **2–3** books from Firestore **`books`**. Copy **`id`** and **`barcode`** exactly as stored (and test what the **USB scanner** actually types into a text editor).

| Book `id` | `barcode` (exact string from scanner) | Notes |
|-----------|----------------------------------------|--------|
| `BK-002` | `52145645` | From your Firestore book sample — **VERIFY** barcode still matches doc + scanner output |
| `BK-006` | *paste from Firestore `books` row for BK-006* | Borrow sample referenced `BK-006` / Great Expectations — **VERIFY** |
| *optional third* | | |

**Check:** If the scanner adds a prefix/suffix or lowercase, either fix scanner programming or normalize in Pi code **on purpose** (document that choice here).

---

## 4) Pi runtime (pick one)

Check **one** box:

- [x] **Python 3** + `firebase-admin` + `pyserial` *(recommended default for Pi)*  
- [ ] **Node.js** + `firebase-admin` + `serialport`

**Chosen:** Python 3 **Version:** *(e.g. 3.11 — fill when Pi is set up)* _______________

---

## 5) Copy-paste checklist (done = Phase 0 complete)

- [ ] Table **1**: every **wired FSR** has a row; Firestore doc ids **verified** in console.
- [ ] Table **2**: every demo **RFID UID** is **real hex** (no `PENDING_SCAN_*`), student ids exist in **`students`**.
- [ ] Table **3**: barcodes **typed once with scanner** into Notepad and match Firestore.
- [ ] Section **4**: Pi language + version recorded.
- [ ] Copy filled seat + RFID map into **`pi-config.local.json`** on the Pi (never commit; see `.gitignore`).

When the checklist is done, Phase 0 is complete → **Phase 1** (ESP32 ↔ Pi serial).
