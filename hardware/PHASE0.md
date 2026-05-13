# Phase 0 — Freeze the spec

**Draft status:** RFID (§2) and test ISBNs (§3) are filled; seat **2** GPIO recorded. Use **§5 checklist** for what is done vs still open (Firestore VERIFY, seat **1** wire, Pi version, `pi-config.local.json`).

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

Use Firestore **`books`** rows: field **`barcode`** must match what the **USB scanner** sends (character for character). After **Staff → Add Book**, copy each document’s **`id`** (`BK-…`) into the first column if you started with TBD.

| Book `id` | `barcode` (exact string from scanner) | Title / author (for you) |
|-----------|----------------------------------------|---------------------------|
| `BK-006` *(VERIFY — or replace with actual `id` in your project)* | `9782070793143` | Great Expectations |
| *Paste `BK-007` from Firestore after adding the book* | `9781853260049` | L'ENFANT — Jules Vales |
| *Paste `BK-008` from Firestore after adding the book* | `9780140390827` | The American — Henry James |

**Removed from active tests:** older sample `BK-002` / `52145645` — keep that doc in Firestore if you still use it; add a row here again if needed.

**Check:** If the scanner adds a prefix/suffix or lowercase, either fix scanner programming or normalize in Pi code **on purpose** (document that choice here).

---

## 4) Pi runtime (pick one)

Check **one** box:

- [x] **Python 3** + `firebase-admin` + `pyserial` *(recommended default for Pi)*  
- [ ] **Node.js** + `firebase-admin` + `serialport`

**Chosen:** Python 3 **Version:** *(e.g. 3.11 — fill when Pi is set up)* _______________

---

## 5) Copy-paste checklist (done = Phase 0 complete)

**Completed so far**

- [x] Table **2** — **RFID:** three tags mapped (`93BA9456`, `31FC9616`, `999EB402` → student ids + names in §2). Same mapping exists in `hardware/pi-config.template.json`.
- [x] Table **1** — **Seat 2:** ESP32 **`GPIO35`** recorded; Firestore target **`seat_2`** (still **VERIFY** doc id / field `id` in console).
- [x] Table **3** — **Barcodes:** three ISBN strings recorded with titles (§3); `BK-007` / `BK-008` called out as the ids to paste after **Add Book**.
- [x] Section **4** — **Pi runtime chosen:** Python 3 (+ `firebase-admin`, `pyserial`).

**Still to do**

- [ ] Table **1** — **Seat 1:** fill ESP32 **pin / ADC** (wire label); **VERIFY** Firestore **`seat_1`** doc id and field **`id`**.
- [ ] Table **1** — **Seat 2:** **VERIFY** `seat_2` in Firestore matches this doc (if your project uses different ids, update §1 + `pi-config.template.json`).
- [ ] Table **2** — Confirm **Youssef** tag → **`241-7504`** matches the real **`students`** document id (or update §2 + `pi-config.template.json`).
- [ ] Table **3** — **VERIFY** **`BK-006`** for Great Expectations in your Firestore (or replace with actual `id`).
- [ ] Table **3** — After books exist in Firestore: set **`BK-007`** / **`BK-008`** (or whatever ids the app assigned) in §3 first column; remove “paste” wording.
- [ ] Table **3** — **Scanner check:** scan each ISBN into Notepad (or similar) and confirm the string **exactly** matches the `barcode` field in Firestore.
- [ ] Section **4** — Fill **Python version** on the Pi line (e.g. `3.11.x`) when the device is set up.
- [ ] **Pi:** Copy `hardware/pi-config.template.json` → **`pi-config.local.json`** on the Raspberry Pi, align with this doc, and **never commit** secrets (see `.gitignore`).

When every box is checked, Phase 0 is complete → **Phase 1** (ESP32 ↔ Pi serial).

