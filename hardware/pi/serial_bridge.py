#!/usr/bin/env python3
"""
Read JSON lines from ESP32 (serial) and write to Firestore (Admin SDK).

See hardware/PHASE2.md. Use --dry-run first.

Phase 3: each RFID row includes pi_worker_state \"pending\" so hardware/pi/kiosk_worker.py
(or your own worker) can poll kiosk_auth_events and apply borrow/return rules.

Message shapes:
  {"t":"ping"}  — no Firestore write
  {"t":"rfid","uid":"93BA9456"}  — if student already holds a seat, seat is freed first (leave tx, clear away
    timer / reservation on that seat), then kiosk_auth_events rfid_scan. Disable via pi-config
    serial_bridge.release_seat_on_rfid_rescan: false.
  {"t":"barcode","code":"9782070793143"}  — optional "intent":"borrow"|"return" (default borrow) → kiosk_auth_events
  {"t":"fsr","seat":2,"raw":1850}  — occupied seats only. Two modes in pi-config fsr_presence:
    **mode \"zero\"**: raw>0 => present (clear away timer, like I'm back); raw<=0 => absent (start away timer, like I'm leaving).
    **threshold mode** (pressure_on_raw / pressure_off_raw): hysteresis + same timer rules as before.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import serial
except ImportError:
    print("pip install pyserial", file=sys.stderr)
    raise SystemExit(1)


def _field_filter_cls():
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter

        return FieldFilter
    except ImportError:
        return None


def _where_eq(coll, field: str, value):
    """Firestore query equality; prefers FieldFilter (google-cloud-firestore >= 2.14)."""
    FF = _field_filter_cls()
    if FF is not None:
        try:
            return coll.where(filter=FF(field, "==", value))
        except Exception:
            pass
    return coll.where(field, "==", value)


def load_config(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8-sig")
    if not raw.strip():
        raise ValueError(f"Empty config: {path}")
    return json.loads(raw)


def resolve_firebase_credentials_path(cfg: dict) -> Path | None:
    """Expand __SMARTLIB_HOME__ (from pi-config.example.json) to real ~/smartlib or $SMARTLIB_HOME."""
    v = cfg.get("firebase_credentials_path")
    if not v or not isinstance(v, str):
        return None
    root = os.environ.get("SMARTLIB_HOME", str(Path.home() / "smartlib"))
    s = v.replace("__SMARTLIB_HOME__", root)
    return Path(s).expanduser().resolve()


def seat_doc_id(cfg: dict, seat: object) -> str | None:
    m = cfg.get("seat_index_to_seat_id") or {}
    key = str(int(seat)) if isinstance(seat, (int, float)) else str(seat).strip()
    sid = m.get(key)
    return str(sid) if sid else None


def _fsr_seat_index_key(seat: object) -> str:
    if isinstance(seat, (int, float)):
        return str(int(seat))
    return str(seat).strip()


def _fsr_zero_mode(cfg: dict) -> bool:
    """
    When true: raw > 0 => present (like \"I'm back\" — clear away timer); raw <= 0 => absent (like \"I'm leaving\" — start timer).
    Set fsr_presence.mode to \"zero\" (see pi-config.example.json).
    """
    fp = cfg.get("fsr_presence")
    if not isinstance(fp, dict):
        return False
    m = str(fp.get("mode") or "").strip().lower()
    if m in ("zero", "zero_raw", "raw"):
        return True
    d = fp.get("defaults")
    if isinstance(d, dict):
        m2 = str(d.get("mode") or "").strip().lower()
        if m2 in ("zero", "zero_raw", "raw"):
            return True
    return False


def _fsr_presence_thresholds(cfg: dict, seat_key: str) -> tuple[int, int] | None:
    """Returns (pressure_on_raw, pressure_off_raw) for hysteresis, or None if not configured."""
    if _fsr_zero_mode(cfg):
        return None
    fp = cfg.get("fsr_presence")
    if not isinstance(fp, dict):
        return None
    defaults: dict = {}
    d = fp.get("defaults")
    if isinstance(d, dict):
        defaults = dict(d)
    seat_cfg = fp.get(seat_key)
    if seat_cfg is False:
        return None
    merged = {**defaults}
    if isinstance(seat_cfg, dict) and seat_cfg:
        merged = {**defaults, **seat_cfg}
    try:
        on_t = int(merged["pressure_on_raw"])
        off_t = int(merged["pressure_off_raw"])
    except (KeyError, TypeError, ValueError):
        return None
    if on_t <= off_t:
        return None
    return on_t, off_t


def _next_fsr_presence(raw: int, prev: str | None, on_t: int, off_t: int) -> str:
    if prev == "present":
        return "absent" if raw < off_t else "present"
    if prev == "absent":
        return "present" if raw >= on_t else "absent"
    return "present" if raw >= (on_t + off_t) // 2 else "absent"


def _away_timer_seconds(cfg: dict) -> int:
    to = cfg.get("timeouts_seconds") or {}
    if isinstance(to, dict) and to.get("away_timer_seconds") is not None:
        try:
            return max(15, int(to["away_timer_seconds"]))
        except (TypeError, ValueError):
            pass
    return 60


def _fsr_start_away_timer_enabled(cfg: dict) -> bool:
    sb = cfg.get("serial_bridge")
    if isinstance(sb, dict) and "fsr_start_away_timer" in sb:
        return bool(sb["fsr_start_away_timer"])
    return True


def _has_active_away_timer(db, seat_id: str, student_id: str) -> bool:
    now_ms = int(time.time() * 1000)
    for t in _where_eq(db.collection("away_timers"), "seatId", seat_id).stream():
        td = dict(t.to_dict() or {})
        if str(td.get("studentId") or "") != student_id:
            continue
        if not td.get("active", False):
            continue
        if (td.get("expiresAt") or 0) > now_ms:
            return True
    return False


def _start_away_timer_for_fsr(db, seat_id: str, student_id: str, seconds: int) -> bool:
    """Same shape as Firebase.js startAwayTimer. Returns True if a new away_timers doc was added."""
    if _has_active_away_timer(db, seat_id, student_id):
        return False
    now_ms = int(time.time() * 1000)
    db.collection("away_timers").add(
        {
            "seatId": seat_id,
            "studentId": student_id,
            "active": True,
            "startedAt": now_ms,
            "expiresAt": now_ms + seconds * 1000,
        }
    )
    return True


def _clear_away_timers_for_fsr(db, seat_id: str, student_id: str) -> int:
    """Mirror Firebase.js clearAwayTimer (reason return). Returns number cleared."""
    now_ms = int(time.time() * 1000)
    n = 0
    for t in _where_eq(db.collection("away_timers"), "seatId", seat_id).stream():
        td = dict(t.to_dict() or {})
        if str(td.get("studentId") or "") != student_id:
            continue
        if not td.get("active", False):
            continue
        if (td.get("expiresAt") or 0) <= now_ms:
            continue
        t.reference.update({"active": False, "endedAt": now_ms, "reason": "return"})
        n += 1
    return n


def student_for_uid(cfg: dict, uid: str) -> str | None:
    uid = (uid or "").strip().upper()
    m = cfg.get("rfid_uid_to_student_id") or {}
    sid = m.get(uid)
    return str(sid) if sid else None


def _release_seat_on_rfid_rescan(cfg: dict) -> bool:
    sb = cfg.get("serial_bridge")
    if isinstance(sb, dict) and "release_seat_on_rfid_rescan" in sb:
        return bool(sb["release_seat_on_rfid_rescan"])
    return True


def release_assigned_seats_for_student(db, student_id: str, *, dry_run: bool) -> list[str]:
    """
    Free every seat where studentId matches (occupied or away-locked same as web: student still on seat doc).
    Mirrors Firebase.js releaseSeatByStudent + clearAwayTimer + cancel reservation on that seat.
    """
    if dry_run or db is None:
        return []
    now_iso = datetime.now(timezone.utc).isoformat()
    now_ms = int(time.time() * 1000)
    released: list[str] = []

    for snap in _where_eq(db.collection("seats"), "studentId", student_id).stream():
        data = dict(snap.to_dict() or {})
        logical_id = str(data.get("id") or snap.id)
        snap.reference.update({"occupied": False, "studentId": None, "fsrPresence": None})
        released.append(logical_id)
        db.collection("seat_transactions").add(
            {
                "seatId": logical_id,
                "studentId": student_id,
                "type": "leave",
                "timestamp": now_iso,
            }
        )

    if not released:
        return released

    released_set = set(released)
    for t in _where_eq(db.collection("away_timers"), "studentId", student_id).stream():
        td = dict(t.to_dict() or {})
        if str(td.get("seatId") or "") not in released_set:
            continue
        if not td.get("active", False):
            continue
        t.reference.update({"active": False, "endedAt": now_ms, "reason": "rfid_leave"})

    for r in _where_eq(db.collection("reservations"), "studentId", student_id).stream():
        rd = dict(r.to_dict() or {})
        if not rd.get("active", False):
            continue
        seat_sid = str(rd.get("seatId") or "")
        if seat_sid not in released_set:
            continue
        r.reference.update({"active": False, "cancelledAt": now_iso, "reason": "rfid_leave"})
        try:
            db.collection("reservation_slots").document(seat_sid).delete()
        except Exception:
            pass
        db.collection("seat_transactions").add(
            {
                "seatId": seat_sid,
                "studentId": student_id,
                "type": "cancel",
                "timestamp": now_iso,
            }
        )

    return released


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
        if _release_seat_on_rfid_rescan(cfg) and db is not None:
            try:
                freed = release_assigned_seats_for_student(db, sid, dry_run=dry_run)
                if freed:
                    print(f"[bridge] rfid released seat(s) {', '.join(freed)} for student {sid}", flush=True)
            except Exception as e:
                print(f"[bridge] rfid seat release failed (still emitting scan): {e}", file=sys.stderr, flush=True)
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
        seat_key = _fsr_seat_index_key(seat)
        if dry_run:
            print(f"[dry-run] fsr seat_index={seat_key} doc={doc_id} raw={raw_int} (would read seat doc)", flush=True)
            return
        ref = db.collection("seats").document(doc_id)
        try:
            snap = ref.get()
        except Exception as e:
            print(f"[bridge] fsr: read seats/{doc_id} failed: {e}", file=sys.stderr, flush=True)
            return
        if not snap.exists:
            print(
                f"[bridge] fsr: no Firestore document seats/{doc_id} — create it or fix seat_index_to_seat_id",
                file=sys.stderr,
                flush=True,
            )
            return
        data = dict(snap.to_dict() or {})
        if not data.get("occupied") or not data.get("studentId"):
            return
        logical_id = str(data.get("id") or doc_id)
        prev = data.get("fsrPresence")
        if prev not in ("present", "absent", None):
            prev = None
        updates: dict = {
            "fsrRaw": raw_int,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        zero_mode = _fsr_zero_mode(cfg)
        th = _fsr_presence_thresholds(cfg, seat_key) if not zero_mode else None
        if zero_mode:
            updates["fsrPresence"] = "present" if raw_int > 0 else "absent"
        elif th:
            on_t, off_t = th
            updates["fsrPresence"] = _next_fsr_presence(raw_int, prev, on_t, off_t)
        try:
            ref.update(updates)
        except Exception as e:
            print(f"[bridge] fsr: seats/{doc_id} update failed: {e}", file=sys.stderr, flush=True)
            return
        pr = updates.get("fsrPresence", "—")
        zm = "zero" if zero_mode else "adc"
        print(f"[bridge] fsr seat={logical_id} raw={raw_int} mode={zm} presence={pr}", flush=True)
        new_pres = updates.get("fsrPresence")
        fsr_drives_timers = (zero_mode or th) and new_pres and _fsr_start_away_timer_enabled(cfg)
        if fsr_drives_timers:
            sid_st = str(data.get("studentId"))
            sec = _away_timer_seconds(cfg)
            try:
                if new_pres == "present":
                    cleared = _clear_away_timers_for_fsr(db, logical_id, sid_st)
                    if cleared:
                        print(f"[bridge] fsr cleared {cleared} away timer(s) seat={logical_id}", flush=True)
                elif new_pres == "absent":
                    skip_baseline = (
                        not zero_mode
                        and prev is None
                        and not _has_active_away_timer(db, logical_id, sid_st)
                    )
                    if skip_baseline:
                        pass
                    elif _start_away_timer_for_fsr(db, logical_id, sid_st, sec):
                        print(f"[bridge] fsr away timer started seat={logical_id} student={sid_st} ({sec}s)", flush=True)
            except Exception as e:
                print(f"[bridge] fsr away timer update failed: {e}", file=sys.stderr, flush=True)
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
        p = resolve_firebase_credentials_path(cfg)
        if not p:
            print("firebase_credentials_path missing", file=sys.stderr)
            return 2
        if not p.is_file():
            print(f"Missing key file: {p}", file=sys.stderr)
            return 3
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(p)))
        db = firestore.client()
        print(
            f"[bridge] config: release_seat_on_rfid_rescan={_release_seat_on_rfid_rescan(cfg)} "
            f"fsr_zero_mode={_fsr_zero_mode(cfg)} fsr_start_away_timer={_fsr_start_away_timer_enabled(cfg)}",
            file=sys.stderr,
            flush=True,
        )

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"[bridge] {mode} serial {port} @ {baud}", file=sys.stderr, flush=True)

    # Re-open serial after transient USB errors (RFID power dip, cable) instead of exiting.
    while True:
        try:
            with serial.Serial(port, baud, timeout=0.5) as s:
                s.reset_input_buffer()
                print(f"[bridge] opened {port}", file=sys.stderr, flush=True)
                while True:
                    try:
                        raw = s.readline()
                    except (serial.SerialException, OSError) as e:
                        print(f"[bridge] serial read error (will reopen): {e}", file=sys.stderr, flush=True)
                        break
                    if not raw:
                        continue
                    line = raw.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError as e:
                        print(
                            f"[bridge] bad json: {e}: {line[:120]!r}\n"
                            "  hint: ESP32 must send one JSON object per line at 115200; only one program may use the port;\n"
                            "  match pi-config serial.baud to firmware; bad lines often mean wrong baud or USB power glitch on scan.",
                            file=sys.stderr,
                            flush=True,
                        )
                        continue
                    if not isinstance(msg, dict):
                        print(f"[bridge] not an object: {line[:120]!r}", file=sys.stderr, flush=True)
                        continue
                    try:
                        handle_line(msg, db=db, cfg=cfg, dry_run=args.dry_run)
                    except Exception as e:
                        print(f"[bridge] handler error: {e}", file=sys.stderr, flush=True)
        except (serial.SerialException, OSError) as e:
            print(f"[bridge] serial open failed: {e} — retry in 2s", file=sys.stderr, flush=True)
        time.sleep(2.0)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[bridge] stopped", file=sys.stderr)
        raise SystemExit(0)
