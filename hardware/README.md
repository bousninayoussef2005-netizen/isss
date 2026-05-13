# SmartLib hardware notes

Step-by-step docs and Pi / ESP32 helpers for the **lab edge** (Raspberry Pi + ESP32 + Firestore). The **website** stays in the repo root; secrets never go in Git.

| Doc | What it is |
|-----|------------|
| [PHASE0.md](./PHASE0.md) | Seat / RFID / book barcode mapping + Pi Python version; checklist |
| [PHASE1.md](./PHASE1.md) | ESP32 ↔ Pi **serial proof** (USB or UART) |
| [PHASE2.md](./PHASE2.md) | Pi **serial bridge** — JSON lines → Firestore (`serial_bridge.py`) |
| [PHASE3.md](./PHASE3.md) | Pi **kiosk worker** — rules in Python + Firestore (`kiosk_worker.py`) |
| [pi/MANUAL-SETUP.md](./pi/MANUAL-SETUP.md) | Pi-only: folders, `pi-config.local.json`, venv, Firestore **smoke_test** (no `setup_pi.sh`) |
| [pi/README.md](./pi/README.md) | Pi folder overview + optional `setup_pi.sh` |

## Status (update as you go)

- **Phase 0 — spec:** tables filled (RFID, seats, books); Pi **Python 3.13.5**; config + Firebase key on device; **`smoke_test.py` → Firestore OK**.
- **Phase 1 — serial:** **Done** — ESP32 @ **`/dev/ttyUSB0`**, `Phase1SerialPing` + **`serial_listen.py`** printing JSON ping lines.
- **Phase 2 — bridge:** **Done (core)** — **`serial_bridge.py`** + optional **systemd** (**[PHASE2.md](./PHASE2.md)** Step 7a). **Phase 3 — Pi + Firestore:** **[PHASE3.md](./PHASE3.md)** — **`kiosk_worker.py`** polls **`kiosk_auth_events`** (extend to **`transactions`** / barcode).

## Layout on the Pi (reference)

```text
~/smartlib/
  pi-config.local.json
  venv/
  bin/
    smoke_test.py
    serial_listen.py
    serial_bridge.py
    kiosk_worker.py
  secrets/
    firebase-adminsdk.json   (or your chosen key filename — path must match JSON)
```
