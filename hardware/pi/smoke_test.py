#!/usr/bin/env python3
"""Quick Firestore check using pi-config.local.json + service account key."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser(description="SmartLib Pi — Firestore smoke test")
    p.add_argument(
        "--config",
        default=str(Path.home() / "smartlib" / "pi-config.local.json"),
        help="Path to pi-config.local.json",
    )
    args = p.parse_args()
    cfg_path = Path(args.config).expanduser().resolve()
    if not cfg_path.is_file():
        print(f"Missing config: {cfg_path}", file=sys.stderr)
        return 2
    raw = cfg_path.read_text(encoding="utf-8-sig")
    if not raw.strip():
        print(
            f"Config file is empty: {cfg_path}\n"
            "Recreate it (see hardware/pi/MANUAL-SETUP.md Step 3) or run: cat ~/smartlib/pi-config.local.json",
            file=sys.stderr,
        )
        return 2
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON in {cfg_path}: {e}\nFirst 200 characters:\n{raw[:200]!r}", file=sys.stderr)
        return 2
    cred_path = cfg.get("firebase_credentials_path")
    if not cred_path or not isinstance(cred_path, str):
        print("Config missing string firebase_credentials_path", file=sys.stderr)
        return 2
    cred_path = Path(cred_path).expanduser().resolve()
    if not cred_path.is_file():
        print(f"Missing Firebase key file: {cred_path}", file=sys.stderr)
        return 3

    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(cred_path)))

    db = firestore.client()
    docs = list(db.collection("seats").limit(3).stream())
    if not docs:
        print("Firestore OK, but collection 'seats' has no documents (or no read access).")
        return 0
    print("Firestore OK — sample seat(s):")
    for d in docs:
        print(f"  id={d.id!r} data={d.to_dict()!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
