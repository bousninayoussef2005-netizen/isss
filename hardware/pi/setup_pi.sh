#!/usr/bin/env bash
# Run ON the Raspberry Pi after copying this folder or cloning the repo.
# Usage:  chmod +x setup_pi.sh && ./setup_pi.sh
# Optional: SMARTLIB_HOME=/opt/smartlib ./setup_pi.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMARTLIB_HOME="${SMARTLIB_HOME:-$HOME/smartlib}"
KEY_PATH="${SMARTLIB_HOME}/secrets/firestore-key.json"
CONFIG_OUT="${SMARTLIB_HOME}/pi-config.local.json"
VENV="${SMARTLIB_HOME}/venv"

echo "==> SmartLib Pi layout: ${SMARTLIB_HOME}"
mkdir -p "${SMARTLIB_HOME}/secrets"
chmod 700 "${SMARTLIB_HOME}/secrets"

if [[ -f "${CONFIG_OUT}" ]]; then
  echo "==> Config already exists: ${CONFIG_OUT} (not overwriting). Use --force to replace."
  if [[ "${1:-}" == "--force" ]]; then
    rm -f "${CONFIG_OUT}"
    echo "==> Removed existing config (--force)."
  else
    echo "    Keeping existing pi-config.local.json"
  fi
fi

if [[ ! -f "${CONFIG_OUT}" ]]; then
  echo "==> Writing ${CONFIG_OUT}"
  sed "s|__SMARTLIB_HOME__|${SMARTLIB_HOME}|g" \
    "${SCRIPT_DIR}/pi-config.example.json" > "${CONFIG_OUT}"
  chmod 600 "${CONFIG_OUT}" || true
fi

echo "==> Python venv: ${VENV}"
if [[ ! -d "${VENV}" ]]; then
  python3 -m venv "${VENV}"
fi
# shellcheck source=/dev/null
source "${VENV}/bin/activate"
pip install --upgrade pip
pip install firebase-admin pyserial evdev

echo ""
if [[ ! -f "${KEY_PATH}" ]]; then
  echo ">>> NEXT (required): place your Firebase service account JSON here:"
  echo "    ${KEY_PATH}"
  echo "    (Firebase Console → Project settings → Service accounts → Generate new private key)"
  echo "    Then:"
  echo "    chmod 600 ${KEY_PATH}"
  echo "    ${VENV}/bin/python ${SCRIPT_DIR}/smoke_test.py"
else
  echo "==> Found key: ${KEY_PATH}"
  echo "==> Running smoke test..."
  "${VENV}/bin/python" "${SCRIPT_DIR}/smoke_test.py" --config "${CONFIG_OUT}" || {
    echo "Smoke test failed — check key file and Firestore rules (Admin SDK bypasses client rules but project must match)."
    exit 1
  }
fi

echo ""
echo "Done. Activate venv later with:"
echo "  source ${VENV}/bin/activate"
