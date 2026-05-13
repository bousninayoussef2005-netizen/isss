# Raspberry Pi — SmartLib edge setup

Run everything **on the Pi** (SSH or local terminal). Do **not** commit `~/smartlib/secrets/*.json` to Git.

- **Phase 1 (serial):** follow **[../PHASE1.md](../PHASE1.md)** and use **`serial_listen.py`** in this folder.  
- **Manual install (no script):** **[MANUAL-SETUP.md](./MANUAL-SETUP.md)**  
- **Optional script:** `setup_pi.sh` below

## 1) Get these files onto the Pi

Either:

- **Clone** this repo on the Pi and `cd` into `hardware/pi`, or  
- **Copy** the folder `hardware/pi/` (this directory) to the Pi with USB / SCP.

## 2) Run the setup script

```bash
cd /path/to/isss/hardware/pi
chmod +x setup_pi.sh
./setup_pi.sh
```

This will:

- Create `~/smartlib/secrets/` (mode `700`)
- Write `~/smartlib/pi-config.local.json` (unless it already exists — use `./setup_pi.sh --force` to replace)
- Create `~/smartlib/venv` and install **`firebase-admin`** and **`pyserial`**

## 3) Add the Firebase service account key

1. [Firebase Console](https://console.firebase.google.com/) → your project → **Project settings** (gear) → **Service accounts** → **Generate new private key**.
2. Save the downloaded file on the Pi as:

   **`~/smartlib/secrets/firestore-key.json`**

3. Lock permissions:

   ```bash
   chmod 600 ~/smartlib/secrets/firestore-key.json
   ```

If you use another filename, edit `firebase_credentials_path` inside `~/smartlib/pi-config.local.json` to match.

## 4) Serial port (ESP32)

With the device plugged in:

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Edit `~/smartlib/pi-config.local.json` → `serial.port_linux` to the correct device (e.g. `/dev/ttyACM0`).

## 5) Smoke test (Firestore)

```bash
source ~/smartlib/venv/bin/activate
python /path/to/isss/hardware/pi/smoke_test.py
```

Or without activating the venv:

```bash
~/smartlib/venv/bin/python /path/to/isss/hardware/pi/smoke_test.py
```

You should see at least one line printing a `seats` document id and data. If it errors, read the message (missing key, wrong path, wrong project).

## Optional: custom install directory

```bash
SMARTLIB_HOME=/opt/smartlib sudo -E ./setup_pi.sh
```

(Adjust permissions/ownership for `/opt/smartlib` if you use `sudo`.)
