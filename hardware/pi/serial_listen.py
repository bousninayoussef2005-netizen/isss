#!/usr/bin/env python3
"""Read lines from ESP32 serial (port from pi-config.local.json). Ctrl+C to stop."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import serial
except ImportError:
    print("Install pyserial: pip install pyserial", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    p = argparse.ArgumentParser(description="SmartLib Pi — serial line listener")
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
    cfg = json.loads(cfg_path.read_text(encoding="utf-8-sig"))
    ser = cfg.get("serial") or {}
    port = ser.get("port_linux")
    baud = int(ser.get("baud") or 115200)
    if not port:
        print("Config missing serial.port_linux", file=sys.stderr)
        return 2

    print(f"Opening {port} @ {baud} … (Ctrl+C to stop)", file=sys.stderr)
    with serial.Serial(port, baud, timeout=0.5) as s:
        s.reset_input_buffer()
        while True:
            raw = s.readline()
            if raw:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                print(line, flush=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
        raise SystemExit(0)
