# SmartLib hardware notes

Step-by-step docs and Pi / ESP32 helpers for the **lab edge** (Raspberry Pi + ESP32 + Firestore). The **website** stays in the repo root; secrets never go in Git.

| Doc | What it is |
|-----|------------|
| [PHASE0.md](./PHASE0.md) | Seat / RFID / book barcode mapping + Pi Python version; checklist |
| [PHASE1.md](./PHASE1.md) | ESP32 ↔ Pi **serial proof** (USB or UART) |
| [pi/MANUAL-SETUP.md](./pi/MANUAL-SETUP.md) | Pi-only: folders, `pi-config.local.json`, venv, Firestore **smoke_test** (no `setup_pi.sh`) |
| [pi/README.md](./pi/README.md) | Pi folder overview + optional `setup_pi.sh` |

## Status (update as you go)

- **Phase 0 — spec:** tables filled (RFID, seats, books); Pi **Python 3.13.5**; config + Firebase key on device; **`smoke_test.py` → Firestore OK**.
- **Phase 1 — serial:** follow **PHASE1.md**; use **`hardware/esp32/Phase1SerialPing/`** + **`hardware/pi/serial_listen.py`**.

## Layout on the Pi (reference)

```text
~/smartlib/
  pi-config.local.json
  venv/
  bin/
    smoke_test.py
    serial_listen.py
  secrets/
    firebase-adminsdk.json   (or your chosen key filename — path must match JSON)
```
