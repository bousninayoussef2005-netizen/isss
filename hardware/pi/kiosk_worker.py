#!/usr/bin/env python3
"""
Pi + Firestore (Admin SDK): kiosk queue from serial_bridge → borrow/return (same rules as Firebase.js).

Events in `kiosk_auth_events` (pi_worker_state == "pending"):
  - action `rfid_scan` — arms worker: student must scan book barcode within timeouts_seconds.barcode_then_rfid.
  - action `barcode_scan` — completes borrow or return if arm valid; see serial_bridge `{"t":"barcode",...}`.

Optional pi-config.local.json:
  "kiosk": { "max_active_borrows": 3, "borrow_due_days": 14 }
  "timeouts_seconds": { "barcode_then_rfid": 10 }
  "kiosk_worker": { "poll_seconds": 5, "batch": 5 }   # lower Firestore read rate; on 429 the worker backs off automatically

Recommend: pip install python-dateutil  (better ordering of legacy transaction timestamps)
See hardware/PHASE3.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# In-memory arm: last RFID student + deadline (seconds since epoch). Lost on worker restart.
_ARM: dict[str, Any] | None = None


def load_config(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8-sig")
    if not raw.strip():
        raise ValueError(f"Empty config: {path}")
    return json.loads(raw)


def resolve_firebase_credentials_path(cfg: dict) -> Path | None:
    v = cfg.get("firebase_credentials_path")
    if not v or not isinstance(v, str):
        return None
    root = os.environ.get("SMARTLIB_HOME", str(Path.home() / "smartlib"))
    s = v.replace("__SMARTLIB_HOME__", root)
    return Path(s).expanduser().resolve()


def init_db(cfg: dict):
    p = resolve_firebase_credentials_path(cfg)
    if not p:
        print("firebase_credentials_path missing", file=sys.stderr)
        raise SystemExit(2)
    if not p.is_file():
        print(f"Missing key file: {p}", file=sys.stderr)
        raise SystemExit(3)
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(p)))
    return firestore.client()


def _kiosk_cfg(cfg: dict) -> dict:
    k = cfg.get("kiosk")
    return k if isinstance(k, dict) else {}


def _kiosk_worker_runtime(cfg: dict, args) -> tuple[float, int]:
    """poll_seconds and batch from pi-config kiosk_worker (optional), else CLI defaults."""
    poll = max(2.0, float(getattr(args, "poll_seconds", 5.0) or 5.0))
    batch = max(1, min(50, int(getattr(args, "batch", 10) or 10)))
    kw = cfg.get("kiosk_worker")
    if isinstance(kw, dict):
        if kw.get("poll_seconds") is not None:
            try:
                poll = max(2.0, float(kw["poll_seconds"]))
            except (TypeError, ValueError):
                pass
        if kw.get("batch") is not None:
            try:
                batch = max(1, min(50, int(kw["batch"])))
            except (TypeError, ValueError):
                pass
    return poll, batch


def _quota_exhausted(exc: BaseException) -> bool:
    s = str(exc).lower()
    return "429" in s or "quota" in s or "resource exhausted" in s or "rate limit" in s


def _arm_timeout_sec(cfg: dict) -> float:
    to = cfg.get("timeouts_seconds") or {}
    return float(to.get("barcode_then_rfid", 10))


def parse_timestamp(val: Any) -> float:
    """Best-effort ordering for borrow/return pairing (matches Firebase.js Date comparisons)."""
    if val is None:
        return 0.0
    s = str(val).strip()
    if not s:
        return 0.0
    try:
        from dateutil import parser as du_parser  # type: ignore

        return du_parser.parse(s, fuzzy=True).timestamp()
    except Exception:
        pass
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
        if "T" in s:
            return datetime.fromisoformat(s).timestamp()
    except Exception:
        pass
    for fmt in ("%m/%d/%Y, %I:%M:%S %p", "%d/%m/%Y, %I:%M:%S %p", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:40], fmt).timestamp()
        except Exception:
            continue
    return 0.0


def _pending_query(db, limit: int):
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter

        return (
            db.collection("kiosk_auth_events")
            .where(filter=FieldFilter("pi_worker_state", "==", "pending"))
            .limit(limit)
        )
    except ImportError:
        return db.collection("kiosk_auth_events").where("pi_worker_state", "==", "pending").limit(limit)


def _field_filter():
    from google.cloud.firestore_v1.base_query import FieldFilter

    return FieldFilter


def load_sorted_student_transactions(db, student_uid: str) -> list[dict[str, Any]]:
    q = db.collection("transactions").where(filter=_field_filter()("student_uid", "==", student_uid))
    rows: list[dict[str, Any]] = []
    for snap in q.stream():
        d = dict(snap.to_dict() or {})
        d["_ts"] = parse_timestamp(d.get("timestamp"))
        d["_id"] = snap.id
        rows.append(d)
    rows.sort(key=lambda r: (r["_ts"], r["_id"]))
    return rows


def is_returned_after(borrow: dict[str, Any], txs: list[dict[str, Any]]) -> bool:
    for r in txs:
        if r.get("type") != "return":
            continue
        if r.get("student_uid") != borrow.get("student_uid"):
            continue
        if r.get("book_id") != borrow.get("book_id"):
            continue
        if r["_ts"] > borrow["_ts"]:
            return True
    return False


def active_borrow_count(txs: list[dict[str, Any]], student_uid: str) -> int:
    n = 0
    for t in txs:
        if t.get("type") != "borrow" or t.get("student_uid") != student_uid:
            continue
        if not is_returned_after(t, txs):
            n += 1
    return n


def has_active_borrow(txs: list[dict[str, Any]], student_uid: str, book_id: str) -> bool:
    for t in txs:
        if t.get("type") != "borrow":
            continue
        if t.get("student_uid") != student_uid or t.get("book_id") != book_id:
            continue
        if not is_returned_after(t, txs):
            return True
    return False


def find_book_by_barcode(db, code: str) -> tuple[str | None, dict[str, Any] | None]:
    code = str(code).strip()
    q = db.collection("books").where(filter=_field_filter()("barcode", "==", code)).limit(1)
    for snap in q.stream():
        return snap.id, dict(snap.to_dict() or {})
    return None, None


def finish_kiosk(
    snap,
    firestore_mod,
    *,
    dry_run: bool,
    ok: bool,
    note: str,
    err: str | None = None,
) -> None:
    if dry_run:
        print(f"[worker] dry-run finish id={snap.id} ok={ok} note={note!r} err={err!r}", flush=True)
        return
    upd: dict[str, Any] = {
        "pi_worker_state": "done" if ok else "error",
        "pi_worker_done_at": firestore_mod.SERVER_TIMESTAMP,
        "pi_worker_note": note,
    }
    if err:
        upd["pi_worker_error"] = err
    snap.reference.update(upd)


def do_borrow(
    db,
    firestore_mod,
    *,
    student_uid: str,
    book_doc_id: str,
    book: dict[str, Any],
    cfg: dict,
    dry_run: bool,
) -> tuple[bool, str, str | None]:
    """Returns (ok, note, error_message)."""
    k = _kiosk_cfg(cfg)
    max_b = int(k.get("max_active_borrows", 3))
    due_days = int(k.get("borrow_due_days", 14))

    book_id = book.get("id")
    title = book.get("title") or ""
    if not book_id:
        return False, "", "Book document missing field id"

    if book.get("status") == "missing":
        return False, "", "Book is marked missing"

    if int(book.get("available") or 0) <= 0:
        return False, "", "No copies available"

    txs = load_sorted_student_transactions(db, student_uid)
    if active_borrow_count(txs, student_uid) >= max_b:
        return False, "", f"Borrow limit reached ({max_b} books). Return one book first."

    if has_active_borrow(txs, student_uid, str(book_id)):
        return False, "", "You already borrowed this book"

    due = (datetime.now(timezone.utc) + timedelta(days=due_days)).date().isoformat()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    next_available = int(book.get("available") or 0) - 1
    st = book.get("status")
    if st == "missing":
        next_status = "missing"
    else:
        next_status = "available" if next_available > 0 else "checked-out"

    tx_payload = {
        "student_uid": student_uid,
        "book_id": book_id,
        "book_title": title,
        "type": "borrow",
        "timestamp": ts,
        "dueDate": due,
    }

    if dry_run:
        print(f"[worker] dry-run BORROW tx={tx_payload} book_update available={next_available} status={next_status}", flush=True)
        return True, "dry-run borrow", None

    batch = db.batch()
    tx_ref = db.collection("transactions").document()
    batch.set(tx_ref, tx_payload)
    batch.update(db.collection("books").document(book_doc_id), {"available": next_available, "status": next_status})
    batch.commit()
    return True, f"borrow ok tx={tx_ref.id}", None


def do_return(
    db,
    firestore_mod,
    *,
    student_uid: str,
    book_doc_id: str,
    book: dict[str, Any],
    dry_run: bool,
) -> tuple[bool, str, str | None]:
    book_id = book.get("id")
    title = book.get("title") or ""
    if not book_id:
        return False, "", "Book document missing field id"

    txs = load_sorted_student_transactions(db, student_uid)
    ok_borrow = False
    for t in txs:
        if (
            t.get("student_uid") == student_uid
            and t.get("book_id") == book_id
            and t.get("type") == "borrow"
            and not is_returned_after(t, txs)
        ):
            ok_borrow = True
            break
    if not ok_borrow:
        return False, "", "No active borrow found"

    cur_avail = int(book.get("available") or 0)
    qv = book.get("qty")
    try:
        qty = int(qv) if qv is not None else cur_avail + 1
    except (TypeError, ValueError):
        qty = cur_avail + 1
    next_available = min(qty, cur_avail + 1)
    st = book.get("status")
    if st == "missing":
        next_status = "missing"
    else:
        next_status = "available" if next_available > 0 else "checked-out"

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    tx_payload = {
        "student_uid": student_uid,
        "book_id": book_id,
        "book_title": title,
        "type": "return",
        "timestamp": ts,
        "dueDate": None,
    }

    if dry_run:
        print(f"[worker] dry-run RETURN tx={tx_payload} book_update available={next_available} status={next_status}", flush=True)
        return True, "dry-run return", None

    batch = db.batch()
    tx_ref = db.collection("transactions").document()
    batch.set(tx_ref, tx_payload)
    batch.update(db.collection("books").document(book_doc_id), {"available": next_available, "status": next_status})
    batch.commit()
    return True, f"return ok tx={tx_ref.id}", None


def process_one_event(
    snap,
    data: dict[str, Any],
    *,
    cfg: dict,
    db,
    firestore_mod,
    dry_run: bool,
) -> None:
    global _ARM
    action = data.get("action") or ""

    if action == "rfid_scan":
        sid = data.get("student_id")
        if not sid:
            finish_kiosk(snap, firestore_mod, dry_run=dry_run, ok=False, note="", err="rfid_scan missing student_id")
            return
        if not dry_run:
            _ARM = {"student_id": str(sid), "deadline": time.time() + _arm_timeout_sec(cfg)}
        finish_kiosk(
            snap,
            firestore_mod,
            dry_run=dry_run,
            ok=True,
            note=f"armed student_id={sid!r} (scan barcode within {_arm_timeout_sec(cfg):.0f}s)",
            err=None,
        )
        return

    if action == "barcode_scan":
        code = (data.get("barcode") or "").strip()
        intent = (data.get("intent") or "borrow").strip().lower()
        if intent not in ("borrow", "return"):
            intent = "borrow"
        if not code:
            finish_kiosk(snap, firestore_mod, dry_run=dry_run, ok=False, note="", err="barcode_scan missing barcode")
            return

        now = time.time()
        if _ARM is None or not _ARM.get("student_id") or now > float(_ARM.get("deadline", 0)):
            finish_kiosk(
                snap,
                firestore_mod,
                dry_run=dry_run,
                ok=False,
                note="",
                err="Scan student RFID first (or window expired — scan card again).",
            )
            return

        student_uid = str(_ARM["student_id"])
        book_doc_id, book = find_book_by_barcode(db, code)
        if not book or not book_doc_id:
            finish_kiosk(snap, firestore_mod, dry_run=dry_run, ok=False, note="", err=f"Unknown barcode {code!r}")
            return

        if intent == "return":
            ok, note, err = do_return(db, firestore_mod, student_uid=student_uid, book_doc_id=book_doc_id, book=book, dry_run=dry_run)
        else:
            ok, note, err = do_borrow(
                db, firestore_mod, student_uid=student_uid, book_doc_id=book_doc_id, book=book, cfg=cfg, dry_run=dry_run
            )

        if ok:
            if not dry_run:
                _ARM = None
            finish_kiosk(snap, firestore_mod, dry_run=dry_run, ok=True, note=note, err=None)
        else:
            finish_kiosk(snap, firestore_mod, dry_run=dry_run, ok=False, note="", err=err or "borrow/return failed")
        return

    finish_kiosk(
        snap,
        firestore_mod,
        dry_run=dry_run,
        ok=False,
        note="",
        err=f"unknown action {action!r}",
    )


def process_batch(db, *, cfg: dict, dry_run: bool, limit: int, firestore_mod) -> int:
    q = _pending_query(db, limit)
    snaps = list(q.stream())
    snaps.sort(
        key=lambda s: (
            0 if (s.to_dict() or {}).get("action") == "rfid_scan" else 1,
            str((s.to_dict() or {}).get("timestamp") or ""),
            s.id,
        )
    )
    n = 0
    for snap in snaps:
        n += 1
        data = snap.to_dict() or {}
        print(
            f"[worker] pending id={snap.id} action={data.get('action')!r} "
            f"student_id={data.get('student_id')!r} barcode={data.get('barcode')!r}",
            flush=True,
        )
        try:
            process_one_event(snap, data, cfg=cfg, db=db, firestore_mod=firestore_mod, dry_run=dry_run)
        except Exception as e:
            print(f"[worker] exception on {snap.id}: {e}", file=sys.stderr, flush=True)
            if not dry_run:
                try:
                    snap.reference.update(
                        {
                            "pi_worker_state": "error",
                            "pi_worker_done_at": firestore_mod.SERVER_TIMESTAMP,
                            "pi_worker_note": "worker exception",
                            "pi_worker_error": str(e)[:500],
                        }
                    )
                except Exception as e2:
                    print(f"[worker] could not mark error: {e2}", file=sys.stderr, flush=True)
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="SmartLib Pi — Firestore kiosk worker (Phase 3)")
    ap.add_argument("--config", default=str(Path.home() / "smartlib" / "pi-config.local.json"))
    ap.add_argument("--dry-run", action="store_true", help="No Firestore writes (still reads)")
    ap.add_argument("--once", action="store_true", help="Process one batch and exit")
    ap.add_argument("--poll-seconds", type=float, default=5.0, help="Seconds between polls (min 2); also set kiosk_worker.poll_seconds in pi-config")
    ap.add_argument("--batch", type=int, default=10, help="Max pending events per poll; also kiosk_worker.batch in pi-config")
    args = ap.parse_args()

    cfg_path = Path(args.config).expanduser().resolve()
    cfg = load_config(cfg_path)
    poll_sec, batch_limit = _kiosk_worker_runtime(cfg, args)

    from firebase_admin import firestore as firestore_mod

    db = init_db(cfg)
    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"[worker] {mode} poll={poll_sec}s batch={batch_limit}", flush=True)

    if args.once or args.dry_run:
        n = process_batch(db, cfg=cfg, dry_run=args.dry_run, limit=batch_limit, firestore_mod=firestore_mod)
        print(f"[worker] processed {n} document(s)", flush=True)
        if n == 0:
            print(
                "[worker] hint: no rows with pi_worker_state==\"pending\". "
                "Update serial_bridge + restart service; RFID must create pending rows.",
                file=sys.stderr,
                flush=True,
            )
        return 0

    print(f"[worker] loop every {poll_sec}s (Ctrl+C to stop); on 429/quota backs off up to ~2m", flush=True)
    quota_backoff = poll_sec
    max_quota_backoff = 120.0
    while True:
        sleep_for = poll_sec
        try:
            process_batch(db, cfg=cfg, dry_run=False, limit=batch_limit, firestore_mod=firestore_mod)
            quota_backoff = poll_sec
        except Exception as e:
            print(f"[worker] error: {e}", file=sys.stderr, flush=True)
            if _quota_exhausted(e):
                sleep_for = min(max_quota_backoff, max(poll_sec, quota_backoff))
                quota_backoff = min(max_quota_backoff, max(poll_sec, quota_backoff * 2.0))
                print(
                    f"[worker] quota/rate limit — sleeping {sleep_for:.0f}s before retry "
                    f"(raise poll_seconds in pi-config kiosk_worker to reduce reads)",
                    file=sys.stderr,
                    flush=True,
                )
        time.sleep(sleep_for)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[worker] stopped", file=sys.stderr)
        raise SystemExit(0)
