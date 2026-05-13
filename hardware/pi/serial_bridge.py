#!/usr/bin/env python3
"""
Read JSON lines from ESP32 (serial) and write to Firestore (Admin SDK).

See hardware/PHASE2.md. Use --dry-run first.

Phase 3: each RFID row includes pi_worker_state \"pending\" so hardware/pi/kiosk_worker.py
(or your own worker) can poll kiosk_auth_events and apply borrow/return rules.

Message shapes:
  {"t":"ping"}  — no Firestore write
  {"t":"rfid","uid":"93BA9456"}  — kiosk_auth_events (action, student_id, uid, timestamp, pi_worker_state)
  {"t":"barcode","code":"9782070793143"}  — optional "intent":"borrow"|"return" (default borrow) → kiosk_auth_events
  {"t":"fsr","seat":2,"raw":1850}  — updates seats/{id} fsrRaw + updatedAt only
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import serial
except ImportError:
    print("pip install pyserial", file=sys.stderr)
    raise SystemExit(1)


def load_config(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8-sig")
    if not raw.strip():
        raise ValueError(f"Empty config: {path}")
    return json.loads(raw)


def seat_doc_id(cfg: dict, seat: object) -> str | None:
    m = cfg.get("seat_index_to_seat_id") or {}
    key = str(int(seat)) if isinstance(seat, (int, float)) else str(seat).strip()
    sid = m.get(key)
    return str(sid) if sid else None


def student_for_uid(cfg: dict, uid: str) -> str | None:
    uid = (uid or "").strip().upper()
    m = cfg.get("rfid_uid_to_student_id") or {}
    sid = m.get(uid)
    return str(sid) if sid else None


def handle_line(msg: dict, *, db, cfg: dict, dry_run: bool) -> None:
    t = msg.get("t")
    if t == "ping":
        print(f"[bridge] ping {msg!r}", flush=True)
        return

    if t == "rfid":
        uid = msg.get("uid")
        if not uid:
            print(f"[bridge] rfid missing uid: {msg!r}", file=sys.stderr, flush=True)
            return
        sid = student_for_uid(cfg, str(uid))
        if not sid:
            print(f"[bridge] rfid unknown uid={uid!r}", file=sys.stderr, flush=True)
            return
        payload = {
            "action": "rfid_scan",
            "student_id": sid,
            "uid": str(uid).strip().upper(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "pi_worker_state": "pending",
            "ingest_source": "pi_serial_bridge",
        }
        if dry_run:
            print(f"[dry-run] kiosk_auth_events add {payload}", flush=True)
            return
        db.collection("kiosk_auth_events").add(payload)
        print(f"[bridge] rfid -> {sid}", flush=True)
        return

    if t == "barcode":
        code = msg.get("code") if msg.get("code") is not None else msg.get("barcode")
        if not code:
            print(f"[bridge] barcode missing code: {msg!r}", file=sys.stderr, flush=True)
            return
        code = str(code).strip()
        intent = (msg.get("intent") or "borrow").strip().lower()
        if intent not in ("borrow", "return"):
            intent = "borrow"
        payload = {
            "action": "barcode_scan",
            "barcode": code,
            "intent": intent,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "pi_worker_state": "pending",
            "ingest_source": "pi_serial_bridge",
        }
        if dry_run:
            print(f"[dry-run] kiosk_auth_events add {payload}", flush=True)
            return
        db.collection("kiosk_auth_events").add(payload)
        print(f"[bridge] barcode -> {code!r} intent={intent}", flush=True)
        return

    if t == "fsr":
        seat = msg.get("seat")
        raw = msg.get("raw")
        if seat is None or raw is None:
            print(f"[bridge] fsr missing seat/raw: {msg!r}", file=sys.stderr, flush=True)
            return
        doc_id = seat_doc_id(cfg, seat)
        if not doc_id:
            print(f"[bridge] fsr unknown seat={seat!r}", file=sys.stderr, flush=True)
            return
        try:
            raw_int = int(raw)
        except (TypeError, ValueError):
            print(f"[bridge] fsr bad raw={raw!r}", file=sys.stderr, flush=True)
            return
        updates = {
            "fsrRaw": raw_int,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        if dry_run:
            print(f"[dry-run] seats/{doc_id} update {updates}", flush=True)
            return
        ref = db.collection("seats").document(doc_id)
        try:
            ref.update(updates)
        except Exception as e:
            err = str(e).lower()
            if "not found" in err or "no document" in err or "404" in err:
                print(
                    f"[bridge] fsr: no Firestore document seats/{doc_id} — create it or fix seat_index_to_seat_id",
                    file=sys.stderr,
                    flush=True,
                )
            else:
                print(f"[bridge] fsr: seats/{doc_id} update failed: {e}", file=sys.stderr, flush=True)
            return
        print(f"[bridge] fsr seat={doc_id} raw={raw_int}", flush=True)
        return

    print(f"[bridge] unknown t={t!r} msg={msg!r}", file=sys.stderr, flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="SmartLib Pi — serial JSON to Firestore")
    ap.add_argument("--config", default=str(Path.home() / "smartlib" / "pi-config.local.json"))
    ap.add_argument("--dry-run", action="store_true", help="Parse and log only; no Firestore writes")
    args = ap.parse_args()

    cfg_path = Path(args.config).expanduser().resolve()
    cfg = load_config(cfg_path)

    ser = cfg.get("serial") or {}
    port = ser.get("port_linux")
    baud = int(ser.get("baud") or 115200)
    if not port:
        print("Config missing serial.port_linux", file=sys.stderr)
        return 2

    db = None
    if not args.dry_run:
        cred_path = cfg.get("firebase_credentials_path")
        if not cred_path or not isinstance(cred_path, str):
            print("firebase_credentials_path missing", file=sys.stderr)
            return 2
        p = Path(cred_path).expanduser().resolve()
        if not p.is_file():
            print(f"Missing key file: {p}", file=sys.stderr)
            return 3
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(p)))
        db = firestore.client()

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"[bridge] {mode} serial {port} @ {baud}", file=sys.stderr, flush=True)

    with serial.Serial(port, baud, timeout=0.5) as s:
        s.reset_input_buffer()
        while True:
            raw = s.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"[bridge] bad json: {e}: {line[:120]!r}", file=sys.stderr, flush=True)
                continue
            if not isinstance(msg, dict):
                print(f"[bridge] not an object: {line[:120]!r}", file=sys.stderr, flush=True)
                continue
            try:
                handle_line(msg, db=db, cfg=cfg, dry_run=args.dry_run)
            except Exception as e:
                print(f"[bridge] handler error: {e}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[bridge] stopped", file=sys.stderr)
        raise SystemExit(0)
