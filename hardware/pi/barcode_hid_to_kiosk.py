#!/usr/bin/env python3
"""
USB barcode scanner on the Raspberry Pi → same Firestore queue as serial_bridge barcode lines.

**USB-serial (your case):** the scanner shows as a **second** serial device, e.g. **`/dev/ttyUSB1`**
while the ESP32 uses **`/dev/ttyUSB0`**. Add **`barcode_serial`** to **`pi-config.local.json`**, then run
**`--mode serial`**. Find the port with **`ls /dev/ttyUSB*`** (unplug scanner, list, plug, list again).
Set **`baud`** from the manual (often **9600** or **115200**).

**USB HID "keyboard" scanner:** use **`--mode hid`** + **`python3-evdev`**; reads raw digit keys so keyboard
layout does not corrupt ISBNs.

Install (HID only):  sudo apt install python3-evdev && sudo usermod -aG input $USER  # relog

List HID:  python3 barcode_hid_to_kiosk.py --list

Serial:  python3 barcode_hid_to_kiosk.py --config ~/smartlib/pi-config.local.json --mode serial
         python3 barcode_hid_to_kiosk.py --config ... --mode serial --port /dev/ttyUSB1 --baud 9600

HID:     python3 barcode_hid_to_kiosk.py --config ... --mode hid --device /dev/input/eventN

See hardware/PHASE3.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def load_config(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8-sig")
    if not raw.strip():
        raise ValueError(f"Empty config: {path}")
    return json.loads(raw)


def init_db(cfg: dict):
    cred_path = cfg.get("firebase_credentials_path")
    if not cred_path or not isinstance(cred_path, str):
        print("firebase_credentials_path missing", file=sys.stderr)
        raise SystemExit(2)
    p = Path(cred_path).expanduser().resolve()
    if not p.is_file():
        print(f"Missing key file: {p}", file=sys.stderr)
        raise SystemExit(3)
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(p)))
    return firestore.client()


def kiosk_barcode_payload(code: str, intent: str) -> dict:
    code = str(code).strip()
    intent = (intent or "borrow").strip().lower()
    if intent not in ("borrow", "return"):
        intent = "borrow"
    return {
        "action": "barcode_scan",
        "barcode": code,
        "intent": intent,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pi_worker_state": "pending",
        "ingest_source": "pi_barcode_hid",
    }


def push_barcode(db, code: str, intent: str, *, dry_run: bool) -> None:
    payload = kiosk_barcode_payload(code, intent)
    if dry_run:
        print(f"[barcode-hid] dry-run add {payload}", flush=True)
        return
    db.collection("kiosk_auth_events").add(payload)
    print(f"[barcode-hid] queued barcode={code!r} intent={intent}", flush=True)


def _digit_map():
    try:
        from evdev import ecodes
    except ImportError:
        return None, None
    m = {}
    for i in range(10):
        m[getattr(ecodes, f"KEY_{i}")] = str(i)
    for i in range(10):
        m[getattr(ecodes, f"KEY_KP{i}")] = str(i)
    m[ecodes.KEY_X] = "X"
    m[ecodes.KEY_MINUS] = "-"
    return m, ecodes


def list_input_devices() -> int:
    try:
        import evdev
    except ImportError:
        print("Install: sudo apt install python3-evdev", file=sys.stderr)
        return 2
    for p in sorted(Path("/dev/input").glob("event*")):
        try:
            dev = evdev.InputDevice(str(p))
            print(f"{p}\t{dev.name!r}")
        except OSError as e:
            print(f"{p}\t(unreadable: {e})", file=sys.stderr)
    return 0


def run_hid(device_path: str, cfg: dict, db, *, dry_run: bool, intent_default: str) -> int:
    try:
        import evdev
        from evdev import ecodes
    except ImportError:
        print("Install: sudo apt install python3-evdev", file=sys.stderr)
        return 2

    digit_map, _ = _digit_map()
    if digit_map is None:
        return 2

    dev = evdev.InputDevice(device_path)
    dev.grab()
    print(f"[barcode-hid] listening {device_path!r} ({dev.name!r}) Ctrl+C to stop", flush=True)

    buf: list[str] = []
    try:
        for ev in dev.read_loop():
            if ev.type != ecodes.EV_KEY:
                continue
            if ev.value != 1:
                continue
            if ev.code in (ecodes.KEY_ENTER, ecodes.KEY_KPENTER):
                code = "".join(buf).strip()
                buf.clear()
                if not code:
                    continue
                push_barcode(db, code, intent_default, dry_run=dry_run)
                continue
            if ev.code in (ecodes.KEY_BACKSPACE, ecodes.KEY_DELETE):
                if buf:
                    buf.pop()
                continue
            if ev.code in digit_map:
                buf.append(digit_map[ev.code])
    except KeyboardInterrupt:
        print("\n[barcode-hid] stopped", flush=True)
    finally:
        try:
            dev.ungrab()
        except OSError:
            pass
    return 0


def run_serial(cfg: dict, db, *, dry_run: bool, intent_default: str) -> int:
    try:
        import serial
    except ImportError:
        print("pip install pyserial", file=sys.stderr)
        return 2

    bs = cfg.get("barcode_serial") or {}
    port = bs.get("port_linux")
    baud = int(bs.get("baud") or 9600)
    if not port:
        print(
            'Config needs barcode_serial.port_linux (or pass --port). Example in pi-config.local.json:\n'
            '  "barcode_serial": { "port_linux": "/dev/ttyUSB1", "baud": 9600 }',
            file=sys.stderr,
        )
        return 2

    print(f"[barcode-hid] serial {port} @ {baud}", flush=True)
    with serial.Serial(port, baud, timeout=0.3) as ser:
        ser.reset_input_buffer()
        while True:
            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            # Some scanners send control chars; keep printable
            line = re.sub(r"[^\x20-\x7E]", "", line)
            if not line:
                continue
            push_barcode(db, line, intent_default, dry_run=dry_run)


def pick_default_hid_device() -> str | None:
    try:
        import evdev
    except ImportError:
        return None
    best = None
    best_score = -1
    for p in Path("/dev/input").glob("event*"):
        try:
            d = evdev.InputDevice(str(p))
            name = (d.name or "").lower()
            score = 0
            for kw in ("barcode", "scanner", "symbol", "zebra", "honeywell", "datalogic", "handheld"):
                if kw in name:
                    score += 2
            if "keyboard" in name:
                score += 0
            if score > best_score:
                best_score = score
                best = str(p)
        except OSError:
            continue
    return best


def main() -> int:
    ap = argparse.ArgumentParser(description="SmartLib Pi — HID or serial barcode → kiosk_auth_events")
    ap.add_argument("--config", default=str(Path.home() / "smartlib" / "pi-config.local.json"))
    ap.add_argument("--mode", choices=("hid", "serial"), default="serial")
    ap.add_argument("--device", default="", help="HID: /dev/input/eventN (default: auto-guess)")
    ap.add_argument("--port", default="", help="serial: override barcode_serial.port_linux (e.g. /dev/ttyUSB1)")
    ap.add_argument("--baud", type=int, default=0, help="serial: override barcode_serial.baud (0 = use config)")
    ap.add_argument("--intent", default="borrow", choices=("borrow", "return"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list", action="store_true", help="List /dev/input/event* names and exit")
    args = ap.parse_args()

    if args.list:
        return list_input_devices()

    cfg = load_config(Path(args.config).expanduser().resolve())

    db = None
    if not args.dry_run:
        db = init_db(cfg)

    if args.mode == "serial":
        cfg_merged = dict(cfg)
        bs = dict(cfg.get("barcode_serial") or {})
        if args.port.strip():
            bs["port_linux"] = args.port.strip()
        if args.baud > 0:
            bs["baud"] = args.baud
        cfg_merged["barcode_serial"] = bs
        try:
            run_serial(cfg_merged, db, dry_run=args.dry_run, intent_default=args.intent)
        except KeyboardInterrupt:
            print("\n[barcode-hid] stopped", flush=True)
        return 0

    devpath = args.device.strip()
    if not devpath:
        devpath = pick_default_hid_device() or "/dev/input/event0"
        print(f"[barcode-hid] using device {devpath!r} (override with --device)", flush=True)

    return run_hid(devpath, cfg, db, dry_run=args.dry_run, intent_default=args.intent)


if __name__ == "__main__":
    raise SystemExit(main())
