# Phase 3 — Kiosk logic on the **Pi** using **Firestore** (Admin SDK)

**Goal:** Keep the ESP32 → Pi **serial bridge** thin (events only). Run **business rules** in Python on the Raspberry Pi, reading and writing the **same Firestore collections** the website uses (`transactions`, `books`, `students`, …).

**Prerequisites:** Phase 2 done — `serial_bridge.py` writes `kiosk_auth_events` with RFID mapped to `student_id`. Service account has read/write on those collections.

---

## Architecture (recommended)

| Layer | Responsibility |
|--------|----------------|
| **ESP32** | Sensors → JSON lines on **USB serial** (`ping`, `rfid`, `fsr`). |
| **USB barcode scanner** | Usually **HID keyboard** on the Pi → use **`barcode_hid_to_kiosk.py`** (or USB-serial mode). Same Firestore queue as a **`barcode`** JSON line. |
| **`serial_bridge.py`** | Serial → Firestore **`kiosk_auth_events`** (`rfid_scan`, **`barcode_scan`**, …) and **`seats`**. RFID / barcode rows use **`pi_worker_state: "pending"`**. |
| **`kiosk_worker.py`** | Poll **`pending`** → **borrow/return** (same rules as **`Firebase.js`**) → **`transactions`** + **`books`** → mark **`done`** / **`error`**. |
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

## Step 1b — USB barcode scanner on the Pi (HID keyboard)

The ESP32 **serial** line is only for the microcontroller. A **USB scanner** that pretends to be a keyboard does **not** go through that cable, so **`serial_bridge.py` never sees it**.

Use **`barcode_hid_to_kiosk.py`**: it reads **`/dev/input/event*`** **key scancodes** (digits + Enter), so you get **correct numbers** even when the desktop layout would show “weird” characters.

```bash
sudo apt install python3-evdev
sudo usermod -aG input $USER
# log out and back in (or reboot)

wget -qO ~/smartlib/bin/barcode_hid_to_kiosk.py \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/barcode_hid_to_kiosk.py

python3 ~/smartlib/bin/barcode_hid_to_kiosk.py --list
python3 ~/smartlib/bin/barcode_hid_to_kiosk.py --config ~/smartlib/pi-config.local.json --device /dev/input/eventN
```

If your scanner is **USB-serial** (shows as **`/dev/ttyACM1`** etc.), put in **`pi-config.local.json`**:

```json
"barcode_serial": { "port_linux": "/dev/ttyACM1", "baud": 9600 }
```

and run:

```bash
python3 ~/smartlib/bin/barcode_hid_to_kiosk.py --config ~/smartlib/pi-config.local.json --mode serial
```

Run this script **alongside** **`serial_bridge`** and **`kiosk_worker`** (three processes, or three systemd units).

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

Each pending doc is handled: **`rfid_scan`** arms the worker in memory; **`barcode_scan`** completes **borrow** or **return** if a card was scanned within **`timeouts_seconds.barcode_then_rfid`**. Errors set **`pi_worker_state: "error"`** with **`pi_worker_error`**.

**Happy path test:** send one line `{"t":"rfid","uid":"..."}` then within 10s a line `{"t":"barcode","code":"978..."}` (same serial as the bridge). Run **`kiosk_worker.py --once`** (or leave the loop running). Check **`transactions`** and **`books`** in the console.

---

## Step 3 — Run continuously (optional)

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/kiosk_worker.py \
  --config ~/smartlib/pi-config.local.json
```

Default poll interval: **2 s**. Add a second **systemd** unit (copy **`smartlib-serial-bridge.service.example`**) with **`ExecStart=... kiosk_worker.py`** if you want it on boot. **Do not** run two worker copies against the same queue.

---

## Step 4 — Optional config (`pi-config.local.json`)

```json
"kiosk": { "max_active_borrows": 3, "borrow_due_days": 14 },
"timeouts_seconds": { "barcode_then_rfid": 10 }
```

Defaults match **`Firebase.js`** (`MAX_ACTIVE_BORROWS = 3`, 14-day due). **`python-dateutil`** is recommended for ordering legacy **`timestamp`** strings on old **`transactions`** rows (`pip install python-dateutil`).

---

## Step 5 — Later hardening

- Persist **arm** state in Firestore if the worker must survive restarts mid-session.
- **Firestore security rules** for kiosk collections.
- **Leases / idempotency** if two worker processes could run by mistake.

---

## Files in this repo

| Path | Role |
|------|------|
| `hardware/pi/kiosk_worker.py` | Pi: **`kiosk_auth_events`** queue → **borrow/return** → **`transactions`** + **`books`**. |
| `hardware/pi/serial_bridge.py` | **`rfid`** / **`barcode`** / **`fsr`** → Firestore (ESP32 serial). |
| `hardware/pi/barcode_hid_to_kiosk.py` | Pi: **USB HID** or **USB-serial** scanner → **`kiosk_auth_events`** (`barcode_scan`). |
| `hardware/PHASE3.md` | This guide |
