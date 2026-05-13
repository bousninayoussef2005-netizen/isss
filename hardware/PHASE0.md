# Phase 0 — Freeze the spec

**Draft status:** RFID table **filled** from your scans (see §2). Seats and book barcodes may still need **VERIFY** in Firestore / with the scanner.

---

## 1) Physical seat → Firestore seat

For **each** FSR / seat channel on the ESP32, record how it maps to a document in the `seats` collection.

**How to read Firestore:** Firestore → `seats` → each document’s **Document ID** and field **`id`**.

| # | Physical label (tape on chair / cable) | ESP32 channel / wire label | Firestore **document ID** | Field **`id`** (if different from doc ID) |
|---|----------------------------------------|-----------------------------|-----------------------------|-------------------------------------------|
| 1 | Chair / FSR #1 | *fill when wired* e.g. `ADC1` / `GPIO34` | `seat_1` | `seat_1` (VERIFY) |
| 2 | Chair / FSR #2 | `GPIO35` (ADC1) | `seat_2` | `seat_2` (VERIFY) |
| 3 | *(add a row per extra FSR)* | | | |

**Notes:**

- Your console showed documents **`seat_1`** and **`seat_2`** with `id` matching — **confirm** in your project today (IDs might be `S001` style elsewhere).
- When the ESP32 sends `seat_index: 1`, the Pi will map to Firestore document id **`seat_1`** (or whatever you lock in the last column).

---

## 2) RFID tag UID → Student id

**Convention:** UID = **uppercase hex**, no spaces (match your RFID library output).

| RFID UID (hex) | Firestore `students` document id (= `id` field) | Student name (for you) |
|----------------|--------------------------------------------------|--------------------------|
| `93BA9456` | `241-7504` | Youssef Bousnina — **confirm** `students` doc id matches this tag in your console |
| `31FC9616` | `656-5454` | Zayneb Sassi |
| `999EB402` | `564-6616` | Ons Hajali |

**Notes:**

- If Youssef’s document id in **`students`** is not `241-7504`, change only that cell (and `pi-config.template.json`) to match Firestore.

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
- [x] Table **2**: RFID UIDs scanned and mapped to **`students`** ids (Youssef id **verify** in console if needed).
- [ ] Table **3**: barcodes **typed once with scanner** into Notepad and match Firestore.
- [ ] Section **4**: Pi language + version recorded.
- [ ] Copy filled seat + RFID map into **`pi-config.local.json`** on the Pi (never commit; see `.gitignore`).

When the checklist is done, Phase 0 is complete → **Phase 1** (ESP32 ↔ Pi serial).
