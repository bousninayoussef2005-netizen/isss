# Phase 3 — Kiosk logic on the **Pi** using **Firestore** (Admin SDK)

**Goal:** Keep the ESP32 → Pi **serial bridge** thin (events only). Run **business rules** in Python on the Raspberry Pi, reading and writing the **same Firestore collections** the website uses (`transactions`, `books`, `students`, …).

**Prerequisites:** Phase 2 done — `serial_bridge.py` writes `kiosk_auth_events` with RFID mapped to `student_id`. Service account has read/write on those collections.

---

## Architecture (recommended)

| Layer | Responsibility |
|--------|----------------|
| **ESP32** | Sensors → JSON lines (`ping`, `rfid`, `fsr`). |
| **`serial_bridge.py`** | Serial → Firestore **events** (`kiosk_auth_events`, `seats` telemetry). Tags new RFID rows with **`pi_worker_state: "pending"`** for the worker. |
| **`kiosk_worker.py`** (this phase) | Poll Firestore for **`pending`** rows → apply rules → update **`transactions`** / **`books`** (same shapes as **`Firebase.js`**) → mark event **`done`** or **`error`**. |
| **Website** | Staff / student UI unchanged at first; later you can hide duplicate flows if the kiosk is fully automated. |

**Why Pi + Firestore (not Cloud Functions only):** your lab already has the key, venv, and USB devices on the Pi. You can add a **USB barcode scanner** (serial or HID) next to the Pi without extra cloud runtime. You can still add **Cloud Functions** later for redundancy.

---

## Step 1 — Deploy the worker script on the Pi

Same pattern as `serial_bridge.py`:

```bash
wget -qO ~/smartlib/bin/kiosk_worker.py \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/kiosk_worker.py
chmod +x ~/smartlib/bin/kiosk_worker.py
```

Ensure **`serial_bridge.py`** on the Pi is **updated** (RFID rows must include **`pi_worker_state": "pending"`**). Pull from Git or re-`wget` **`serial_bridge.py`**.

---

## Step 2 — Test (one batch, no loop)

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/kiosk_worker.py \
  --config ~/smartlib/pi-config.local.json \
  --dry-run --once
```

You should see **`pending`** RFID events (if any). Then live **once**:

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/kiosk_worker.py \
  --config ~/smartlib/pi-config.local.json \
  --once
```

Each pending doc should get **`pi_worker_state: "done"`** and a stub **`pi_worker_note`**. Scan a tag again to create a **new** pending row and re-run **`--once`** to verify the pipeline.

---

## Step 3 — Run continuously (optional)

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/kiosk_worker.py \
  --config ~/smartlib/pi-config.local.json
```

Default poll interval: **2 s**. Add a second **systemd** unit (copy **`smartlib-serial-bridge.service.example`**) with **`ExecStart=... kiosk_worker.py`** if you want it on boot.

**Do not** run two copies of the worker against the same queue unless you add **transactions / leases** (future hardening).

---

## Step 4 — Implement real borrows (your code)

1. **Mirror `Firebase.js`** helpers: `studentBorrowBook` / `studentReturnBook` field names (`student_uid`, `book_id`, `book_title`, `type`, `timestamp`, `dueDate`).
2. **Barcode:** add a path for the book id (USB scanner serial line, `stdin`, or extra JSON type on a second UART). Match **`books.barcode`** like Phase 0.
3. **State machine:** e.g. after **`rfid_scan`**, wait N seconds for a **`barcode_scan`** event (store **`kiosk_session`** doc or in-memory on Pi — document your choice).
4. **Errors:** set **`pi_worker_state": "error"`**, **`pi_worker_error`**: human-readable string, and do **not** leave the row **`pending`** forever.

---

## Files in this repo

| Path | Role |
|------|------|
| `hardware/pi/kiosk_worker.py` | Pi: poll **`kiosk_auth_events`** → stub **`done`**; extend for **`transactions`**. |
| `hardware/pi/serial_bridge.py` | Sets **`pi_worker_state": "pending"`** on new RFID events. |
| `hardware/PHASE3.md` | This guide |
