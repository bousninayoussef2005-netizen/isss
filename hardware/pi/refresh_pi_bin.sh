#!/usr/bin/env bash
# Refresh SmartLib Python scripts under ~/smartlib/bin from GitHub (main branch).
#
# Run ON the Raspberry Pi:
#   chmod +x refresh_pi_bin.sh && ./refresh_pi_bin.sh
#   # or from anywhere, if you cloned the repo:
#   bash /path/to/isss/hardware/pi/refresh_pi_bin.sh
#
# Optional: install directory (default ~/smartlib)
#   SMARTLIB_HOME=/opt/smartlib bash refresh_pi_bin.sh
#
# Requires: wget (sudo apt-get install -y wget)
#
# Does NOT overwrite pi-config.local.json or secrets.

set -euo pipefail

RAW_BASE="${SMARTLIB_RAW_BASE:-https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi}"
SMARTLIB_HOME="${SMARTLIB_HOME:-$HOME/smartlib}"
BIN="${SMARTLIB_HOME}/bin"

mkdir -p "${BIN}"

FILES=(
  serial_bridge.py
  kiosk_worker.py
  barcode_hid_to_kiosk.py
  serial_listen.py
  smoke_test.py
)

echo "==> SmartLib bin refresh → ${BIN}"
echo "    source: ${RAW_BASE}"

for name in "${FILES[@]}"; do
  echo "    fetching ${name} ..."
  wget -qO "${BIN}/${name}" "${RAW_BASE}/${name}"
  chmod +x "${BIN}/${name}" || true
done

echo ""
echo "Done. If you use systemd, restart edge services, for example:"
echo "  sudo systemctl restart smartlib-serial-bridge.service"
echo "  sudo systemctl restart smartlib-kiosk-worker.service 2>/dev/null || true"
echo "  sudo systemctl restart smartlib-barcode-serial.service 2>/dev/null || true"
