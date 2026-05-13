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

## Step 1b — USB barcode scanner on the Pi

The ESP32 uses **`serial.port_linux`** (e.g. **`/dev/ttyUSB0`**). A **second** USB device is usually your **USB-serial** scanner (e.g. **`/dev/ttyUSB1`**). It does **not** send data on the ESP32 cable, so use **`barcode_hid_to_kiosk.py --mode serial`** (same Firestore queue as a JSON **`barcode`** line from the bridge).

1. Find the scanner device:

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Unplug the scanner, run again, plug it in — the **new** path is the scanner.

2. Add to **`~/smartlib/pi-config.local.json`** (example — use **your** path and baud from the scanner manual):

```json
"barcode_serial": {
  "port_linux": "/dev/ttyUSB1",
  "baud": 9600
}
```

3. Install script and run (**`dialout`** group so you can open the port):

```bash
sudo usermod -aG dialout $USER
# log out and back in

wget -qO ~/smartlib/bin/barcode_hid_to_kiosk.py \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/barcode_hid_to_kiosk.py

python3 ~/smartlib/bin/barcode_hid_to_kiosk.py --config ~/smartlib/pi-config.local.json --mode serial
```

Override without editing JSON: **`--port /dev/ttyUSB1 --baud 115200`**.

Run this **alongside** **`serial_bridge`** (ESP32) and **`kiosk_worker`** — three processes.

### HID “keyboard” scanner (optional)

If the scanner is **keyboard emulation** instead of serial, use **`--mode hid`**, **`python3-evdev`**, and **`--list`** / **`--device /dev/input/eventN`** (reads raw scancodes so layout does not corrupt digits). See script header comments.

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

## Step 3 — Run on boot (**systemd**)

Copy unit files from **`hardware/pi/`** (adjust **`User=`** and **`/home/pi`** if needed), then:

```bash
cd /path/to/isss/hardware/pi
sudo cp smartlib-serial-bridge.service.example /etc/systemd/system/smartlib-serial-bridge.service
sudo cp smartlib-kiosk-worker.service.example /etc/systemd/system/smartlib-kiosk-worker.service
sudo cp smartlib-barcode-serial.service.example /etc/systemd/system/smartlib-barcode-serial.service
sudo cp smartlib-edge.target.example /etc/systemd/system/smartlib-edge.target
sudo systemctl daemon-reload
sudo systemctl enable --now smartlib-edge.target
```

Or enable the three **`.service`** units individually (see comments inside each file). **Stop** any manual **`python ...`** copies first so serial ports are free.

**Logs:** see **`hardware/pi/MONITORING.md`**.

**Do not** run two **`kiosk_worker`** instances.

---

## Step 4 — Optional config (`pi-config.local.json`)

```json
"kiosk": { "max_active_borrows": 3, "borrow_due_days": 14 },
"timeouts_seconds": { "barcode_then_rfid": 10 }
```

Defaults match **`Firebase.js`** (`MAX_ACTIVE_BORROWS = 3`, 14-day due). **`python-dateutil`** is recommended for ordering legacy **`timestamp`** strings on old **`transactions`** rows (`pip install python-dateutil`).

---

## Step 5 — Firestore + monitoring

- **Rules vs Pi:** the Pi uses the **Admin SDK** — read **`hardware/pi/FIRESTORE-LAB.md`**. Optional client rule snippet: **`hardware/firestore.rules.kiosk-snippet.txt`**.
- **Logs / health:** **`hardware/pi/MONITORING.md`**.
- Persist **arm** state in Firestore if the worker must survive restarts mid-session (future).
- **Leases / idempotency** if two worker processes could run by mistake (future).

---

## Files in this repo

| Path | Role |
|------|------|
| `hardware/pi/kiosk_worker.py` | Pi: **`kiosk_auth_events`** queue → **borrow/return** → **`transactions`** + **`books`**. |
| `hardware/pi/serial_bridge.py` | **`rfid`** / **`barcode`** / **`fsr`** → Firestore (ESP32 serial). |
| `hardware/pi/barcode_hid_to_kiosk.py` | Pi: **USB HID** or **USB-serial** scanner → **`kiosk_auth_events`** (`barcode_scan`). |
| `hardware/pi/smartlib-kiosk-worker.service.example` | **systemd** — **`kiosk_worker.py`**. |
| `hardware/pi/smartlib-barcode-serial.service.example` | **systemd** — **`barcode_hid_to_kiosk.py --mode serial`**. |
| `hardware/pi/smartlib-edge.target.example` | **systemd** — start bridge + worker + barcode together. |
| `hardware/pi/MONITORING.md` | **`journalctl`** / health checks. |
| `hardware/pi/FIRESTORE-LAB.md` | IAM + Firestore rules notes for the lab. |
| `hardware/firestore.rules.kiosk-snippet.txt` | Optional **client** deny for **`kiosk_auth_events`**. |
| `hardware/PHASE3.md` | This guide |
