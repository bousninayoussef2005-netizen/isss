# Phase 0 — Freeze the spec

**Draft status:** Firestore **verification** for seats, RFID, and test books is complete (see §5). Remaining: optional **§1 seat 1 GPIO** line in this file, **Python version** when the Pi exists, and **`pi-config.local.json`** on the Pi — then move to **Phase 1** (serial).

---

## 1) Physical seat → Firestore seat

For **each** FSR / seat channel on the ESP32, record how it maps to a document in the `seats` collection.

**How to read Firestore:** Firestore → `seats` → each document’s **Document ID** and field **`id`**.

| # | Physical label (tape on chair / cable) | ESP32 channel / wire label | Firestore **document ID** | Field **`id`** (if different from doc ID) |
|---|----------------------------------------|-----------------------------|-----------------------------|-------------------------------------------|
| 1 | Chair / FSR #1 | *fill when wired* e.g. `ADC1` / `GPIO34` | `seat_1` | `seat_1` (VERIFY) |
| 2 | Chair / FSR #2 | `GPIO35` (ADC1) | `seat_2` | `seat_2` |
| 3 | *(add a row per extra FSR)* | | | |

**Notes:**

- Your console showed documents **`seat_1`** and **`seat_2`** with `id` matching — **confirm** in your project today (IDs might be `S001` style elsewhere).
- When the ESP32 sends `seat_index: 1`, the Pi will map to Firestore document id **`seat_1`** (or whatever you lock in the last column).

---

## 2) RFID tag UID → Student id

**Convention:** UID = **uppercase hex**, no spaces (match your RFID library output).

| RFID UID (hex) | Firestore `students` document id (= `id` field) | Student name (for you) |
|----------------|--------------------------------------------------|--------------------------|
| `93BA9456` | `241-7504` | Youssef Bousnina |
| `31FC9616` | `656-5454` | Zayneb Sassi |
| `999EB402` | `564-6616` | Ons Hajali |

**Notes:**

- If Youssef’s document id in **`students`** is not `241-7504`, change only that cell (and `pi-config.template.json`) to match Firestore.

---

## 3) Test book barcodes

Use Firestore **`books`** rows: field **`barcode`** must match what the **USB scanner** sends (character for character). After **Staff → Add Book**, copy each document’s **`id`** (`BK-…`) into the first column if you started with TBD.

| Book `id` | `barcode` (exact string from scanner) | Title / author (for you) |
|-----------|----------------------------------------|---------------------------|
| `BK-006` | `9782070793143` | Great Expectations |
| `BK-007` | `9781853260049` | L'ENFANT — Jules Vales |
| `BK-008` | `9780140390827` | The American — Henry James |

**Removed from active tests:** older sample `BK-002` / `52145645` — keep that doc in Firestore if you still use it; add a row here again if needed.

**Check:** If the scanner adds a prefix/suffix or lowercase, either fix scanner programming or normalize in Pi code **on purpose** (document that choice here).

---

## 4) Pi runtime (pick one)

Check **one** box:

- [x] **Python 3** + `firebase-admin` + `pyserial` *(recommended default for Pi)*  
- [ ] **Node.js** + `firebase-admin` + `serialport`

**Chosen:** Python 3 **Version:** `3.13.5` *(on Raspberry Pi; confirm `pip install firebase-admin pyserial` succeeds in your venv)*.

### A) Fill the Python version (§4 line above)

On the **Raspberry Pi** (Terminal or SSH):

```bash
python3 --version
```

Example output: `Python 3.11.2` → write **`3.11.2`** (or shorten to **`3.11.x`**) on the **§4** line in `hardware/PHASE0.md` on your **PC** when you sync the doc, or note it only on the Pi; the important part is your future `requirements.txt` matches a **supported** Python 3 on that machine.

Optional (recommended before `firebase-admin`):

```bash
python3 -m venv ~/smartlib-venv
source ~/smartlib-venv/bin/activate
pip install --upgrade pip
pip install firebase-admin pyserial
```

### B) `pi-config.local.json` and Firebase service account (on the Pi only)

1. **Firebase Console** → Project **settings** (gear) → **Service accounts** → **Generate new private key** → download a `.json` file (often named like `*-firebase-adminsdk-*.json`).

2. On the Pi, create a folder for secrets (example):

   ```bash
   mkdir -p ~/smartlib/secrets
   chmod 700 ~/smartlib/secrets
   ```

3. Copy the downloaded key onto the Pi (USB, `scp`, or SFTP) into e.g.  
   `~/smartlib/secrets/firebase-adminsdk.json`  
   Then:

   ```bash
   chmod 600 ~/smartlib/secrets/firebase-adminsdk.json
   ```

4. Copy the repo template into a **local** config the Pi will read (this file is **gitignored** on your dev machine if you ever copy it back; on the Pi it simply never goes in Git):

   ```bash
   mkdir -p ~/smartlib
   # If you cloned the repo on the Pi:
   cp /path/to/isss/hardware/pi-config.template.json ~/smartlib/pi-config.local.json
   ```

   Or copy `hardware/pi-config.template.json` from your PC to the Pi with `scp`, then rename to `pi-config.local.json`.

5. **Edit** `~/smartlib/pi-config.local.json` on the Pi:

   - Keep the same JSON structure as the template (seats, RFID, barcodes, serial port, etc.).
   - **Add** a line the template does not ship with (your Pi code will read it):

   ```json
   "firebase_credentials_path": "/home/pi/smartlib/secrets/firebase-adminsdk.json"
   ```

   Use the **real absolute path** to the key file. If your Linux user is not `pi`, adjust `/home/pi/...`.

6. **Serial port:** On the Pi, plug the ESP32 USB‑serial (or UART adapter) and run:

   ```bash
   ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
   ```

   Put the correct device (e.g. `/dev/ttyUSB0` or `/dev/ttyACM0`) in `serial.port_linux` inside `pi-config.local.json`.

7. **Never commit:** The service account JSON and `pi-config.local.json` must **not** be pushed to GitHub. This repo’s `.gitignore` already ignores `hardware/pi-config.local.json` and common `*firebase-adminsdk*.json` patterns for **your laptop repo**; on the Pi, simply keep secrets **only** on the Pi.

In your **Python** entrypoint (when you write it), load config and Firebase like:

```python
import json
import firebase_admin
from firebase_admin import credentials

with open("/home/pi/smartlib/pi-config.local.json") as f:
    cfg = json.load(f)
cred = credentials.Certificate(cfg["firebase_credentials_path"])
firebase_admin.initialize_app(cred)
```

Replace paths with yours.


## 5) Copy-paste checklist (done = Phase 0 complete)

**Completed**

- [x] Table **1** — **Seat 1:** ESP32 **pin / ADC** (wire) and Firestore **`seat_1`** document id + field **`id`** verified in your project.
- [x] Table **1** — **Seat 2:** **`GPIO35`**, Firestore **`seat_2`** document id + field **`id`** verified; matches `hardware/pi-config.template.json`.
- [x] Table **2** — **RFID:** three tags mapped (`93BA9456`, `31FC9616`, `999EB402` → student ids + names in §2); same mapping in `hardware/pi-config.template.json`.
- [x] Table **2** — **Youssef:** tag `93BA9456` ↔ **`241-7504`** confirmed against Firestore **`students`**.
- [x] Table **3** — **`BK-006`**, **`BK-007`**, **`BK-008`** verified in Firestore; §3 table updated with final ids and ISBNs.
- [x] Table **3** — **Scanner check:** each ISBN matches **`barcode`** in Firestore (Notepad / scanner test).
- [x] Section **4** — **Pi runtime chosen:** Python 3 (+ `firebase-admin`, `pyserial`); **version `3.13.5`** on device.

**Still to do**

- [ ] **§1 row 1:** Replace `*fill when wired*` with your **actual GPIO / ADC label** for seat 1 in this file *(skip only if seat 1 uses the same doc as above but you intentionally keep the placeholder)*.
- [ ] **Pi:** Copy `hardware/pi-config.template.json` → **`pi-config.local.json`** on the Raspberry Pi, align with this doc, configure Firebase **service account** path; **never commit** secrets (see `.gitignore`).

**Next**

- **Phase 1:** ESP32 ↔ Raspberry Pi **serial** (hello line / JSON events).

When the **Still to do** boxes are checked, close Phase 0 in the repo and start **Phase 1**.

