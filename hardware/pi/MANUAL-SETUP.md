# Raspberry Pi — manual setup (no `setup_pi.sh`)

**Status:** If **`smoke_test.py`** already prints **Firestore OK**, you can skip to **[../PHASE1.md](../PHASE1.md)** for ESP32 serial.

Do everything **on the Pi** in a terminal. User is **`pi`**. If your username is different, replace `/home/pi` with your home path.

Your Firebase key file name here: **`firebase-adminsdk.json`** inside `~/smartlib/secrets/`.

---

## Step 1 — folders

**Tell the Pi:**

```bash
mkdir -p ~/smartlib/secrets
chmod 700 ~/smartlib/secrets
```

---

## Step 2 — Firebase service account file (the JSON key)

You must have **one** file on disk, for example:

`/home/pi/smartlib/secrets/firebase-adminsdk.json`

**Tell the Pi** (only if the file is already there):

```bash
chmod 600 ~/smartlib/secrets/firebase-adminsdk.json
ls -la ~/smartlib/secrets/
```

You should see `firebase-adminsdk.json`.

If the file is **not** there yet: on your PC, download a **new** key from Firebase Console → Project settings → Service accounts → Generate new private key, copy the file to the Pi (USB or SCP), save it **exactly** as:

`~/smartlib/secrets/firebase-adminsdk.json`

Then run the `chmod` and `ls` above.

---

## Step 3 — create `pi-config.local.json` (no script)

This file lives next to `secrets/`, **not** inside it:

`/home/pi/smartlib/pi-config.local.json`

**Tell the Pi** (copy the whole block, paste once, press Enter):

```bash
cat > ~/smartlib/pi-config.local.json <<EOF
{
  "schema_version": 1,
  "pi_runtime": "python",
  "serial": {
    "port_linux": "/dev/ttyUSB0",
    "baud": 115200,
    "line_delimiter": "\n"
  },
  "seat_index_to_seat_id": {
    "1": "seat_1",
    "2": "seat_2"
  },
  "seat_index_to_esp_gpio": {
    "2": 35
  },
  "rfid_uid_to_student_id": {
    "93BA9456": "241-7504",
    "31FC9616": "656-5454",
    "999EB402": "564-6616"
  },
  "test_barcodes": {
    "great_expectations": "9782070793143",
    "l_enfant": "9781853260049",
    "the_american": "9780140390827"
  },
  "timeouts_seconds": {
    "barcode_then_rfid": 10
  },
  "firebase_credentials_path": "/home/pi/smartlib/secrets/firebase-adminsdk.json",
  "notes": "Pi only — do not commit to git."
}
EOF
chmod 600 ~/smartlib/pi-config.local.json
```

Check:

```bash
cat ~/smartlib/pi-config.local.json
```

If your key file has a **different name or path**, edit only that one string:

```bash
nano ~/smartlib/pi-config.local.json
```

(change `firebase_credentials_path`, save with Ctrl+O, Enter, exit with Ctrl+X)

---

## Step 4 — Python venv + packages

**Tell the Pi:**

```bash
python3 -m venv ~/smartlib/venv
source ~/smartlib/venv/bin/activate
pip install --upgrade pip
pip install firebase-admin pyserial
deactivate
```

---

## Step 5 — download the smoke test (if you do not have the full repo)

**Tell the Pi:**

```bash
mkdir -p ~/smartlib/bin
wget -qO ~/smartlib/bin/smoke_test.py \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/smoke_test.py
```

If `wget` is missing:

```bash
sudo apt-get update && sudo apt-get install -y wget
```

*(If you already cloned the repo on the Pi, you can skip `wget` and use the file at `.../isss/hardware/pi/smoke_test.py` instead.)*

---

## Step 6 — run the smoke test

**Tell the Pi:**

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/smoke_test.py --config ~/smartlib/pi-config.local.json
```

**Success:** prints `Firestore OK` and some `seats` data.

**Failure:** read the error (wrong path to JSON key, wrong project, or venv not installed).

---

## Step 7 — serial port for the ESP32 (later)

When the board is plugged in:

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Put the right device in `serial.port_linux` inside `~/smartlib/pi-config.local.json` (nano again).

---

## What you should have on disk

```text
/home/pi/smartlib/
  pi-config.local.json       ← config (not inside secrets)
  venv/                      ← Python env
  bin/
    smoke_test.py            ← if you used wget
  secrets/
    firebase-adminsdk.json   ← Firebase private key only
```

Never `git add` the `secrets` folder or `pi-config.local.json` from the Pi into a public repo.

---

## Troubleshooting

**`JSONDecodeError: Expecting value: line 1 column 1`** — almost always means **`pi-config.local.json` is empty or not valid JSON**.

**Tell the Pi:**

```bash
wc -c ~/smartlib/pi-config.local.json
cat -A ~/smartlib/pi-config.local.json | head -5
```

If `wc -c` prints `0` or the file looks wrong, **delete and recreate** Step 3 in this document (`rm ~/smartlib/pi-config.local.json` then paste the `cat <<EOF` block again). Make sure you paste the **entire** heredoc and that the closing line is exactly **`EOF`** alone at the start of the line (no spaces before `EOF`).

