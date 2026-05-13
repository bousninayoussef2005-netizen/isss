#!/usr/bin/env python3
"""
Pi + Firestore (Admin SDK): process kiosk edge events stored in Firestore.

Phase 3 starter — runs on the Raspberry Pi with the same venv + key as serial_bridge.py.
Today: finds RFID auth rows with pi_worker_state == "pending", logs them, marks "done".

Extend this file to mirror Firebase.js borrow/return rules: write `transactions`, update `books`,
read barcodes from a second serial device or your scanner integration.

See hardware/PHASE3.md.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
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


def process_batch(db, *, dry_run: bool, limit: int, firestore_mod) -> int:
    q = db.collection("kiosk_auth_events").where("pi_worker_state", "==", "pending").limit(limit)
    n = 0
    for snap in q.stream():
        n += 1
        data = snap.to_dict() or {}
        print(
            f"[worker] pending id={snap.id} action={data.get('action')!r} "
            f"student_id={data.get('student_id')!r} uid={data.get('uid')!r}",
            flush=True,
        )
        if dry_run:
            continue
        snap.reference.update(
            {
                "pi_worker_state": "done",
                "pi_worker_done_at": firestore_mod.SERVER_TIMESTAMP,
                "pi_worker_note": "stub: extend kiosk_worker.py to create transactions",
            }
        )
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="SmartLib Pi — Firestore kiosk worker (Phase 3)")
    ap.add_argument("--config", default=str(Path.home() / "smartlib" / "pi-config.local.json"))
    ap.add_argument("--dry-run", action="store_true", help="List pending events only; no writes")
    ap.add_argument("--once", action="store_true", help="Process one batch and exit (good for tests)")
    ap.add_argument("--poll-seconds", type=float, default=2.0, help="Sleep between polls (loop mode)")
    ap.add_argument("--batch", type=int, default=10, help="Max pending docs per poll")
    args = ap.parse_args()

    cfg_path = Path(args.config).expanduser().resolve()
    cfg = load_config(cfg_path)

    from firebase_admin import firestore as firestore_mod

    db = init_db(cfg)
    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"[worker] {mode}", flush=True)

    if args.once or args.dry_run:
        n = process_batch(db, dry_run=args.dry_run, limit=args.batch, firestore_mod=firestore_mod)
        print(f"[worker] processed {n} document(s)", flush=True)
        return 0

    print(f"[worker] loop every {args.poll_seconds}s (Ctrl+C to stop)", flush=True)
    while True:
        try:
            process_batch(db, dry_run=False, limit=args.batch, firestore_mod=firestore_mod)
        except Exception as e:
            print(f"[worker] error: {e}", file=sys.stderr, flush=True)
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[worker] stopped", file=sys.stderr)
        raise SystemExit(0)
