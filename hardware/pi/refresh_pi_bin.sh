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
SYSTEMD_EXAMPLES="${SMARTLIB_HOME}/systemd"

mkdir -p "${BIN}" "${SYSTEMD_EXAMPLES}"

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

SERVICE_EXAMPLES=(
  smartlib-serial-bridge.service.example
  smartlib-barcode-hid.service.example
  smartlib-barcode-serial.service.example
  smartlib-kiosk-worker.service.example
)

echo ""
echo "==> systemd unit examples → ${SYSTEMD_EXAMPLES}"
for name in "${SERVICE_EXAMPLES[@]}"; do
  echo "    fetching ${name} ..."
  wget -qO "${SYSTEMD_EXAMPLES}/${name}" "${RAW_BASE}/${name}" || echo "    (skip ${name} — not on branch yet)"
done

echo ""
echo "Done. Install HID barcode unit (first time only):"
echo "  sudo cp ${SYSTEMD_EXAMPLES}/smartlib-barcode-hid.service.example /etc/systemd/system/smartlib-barcode-hid.service"
echo "  sudo systemctl daemon-reload && sudo systemctl enable --now smartlib-barcode-hid.service"
echo ""
echo "Restart edge services if already installed:"
echo "  sudo systemctl restart smartlib-serial-bridge.service"
echo "  sudo systemctl restart smartlib-kiosk-worker.service 2>/dev/null || true"
echo "  sudo systemctl restart smartlib-barcode-hid.service 2>/dev/null || true"
echo "  sudo systemctl restart smartlib-barcode-serial.service 2>/dev/null || true"
