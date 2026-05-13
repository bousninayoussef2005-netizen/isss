# Phase 2 — Serial JSON → Firestore (Pi bridge)

**Goal:** The Raspberry Pi reads **one JSON object per line** from the ESP32 (same serial setup as Phase 1), interprets a small **`t` (type)** field, and **writes to Firestore** using the **Admin SDK** (same project as SmartLib).

**Prerequisites (you already did these):**

- Phase 1: **`serial_listen.py`** shows lines like `{"t":"ping","src":"esp32"}`.
- Phase 0: **`smoke_test.py`** prints **Firestore OK**; `~/smartlib/pi-config.local.json` contains **`firebase_credentials_path`**, **`rfid_uid_to_student_id`**, **`seat_index_to_seat_id`**, and **`serial`**.

**Safety:** Start with **`--dry-run`** so nothing is written to Firestore while you verify parsing. Then run without it.

---

## Step 1 — Line protocol (contract with ESP32 firmware)

Every message from ESP32 → Pi is **one line** ending with **`\n`**. The line must be **valid JSON** (UTF-8).

Minimum fields:

| `t` value | Meaning | Other fields (examples) |
|-----------|---------|-------------------------|
| `ping` | heartbeat / keepalive | optional `src` |
| `rfid` | RFID tag read | **`uid`** (hex string, same style as Phase 0 table) |
| `fsr` | force reading for one seat | **`seat`** (1-based index, matches `seat_index_to_seat_id`), **`raw`** (integer ADC) |

**Examples (copy these for tests):**

```json
{"t":"ping","src":"esp32"}
```

```json
{"t":"rfid","uid":"93BA9456"}
```

```json
{"t":"fsr","seat":2,"raw":1850}
```

**Rules:**

- Use **double quotes** in JSON.
- **`uid`** must match a key in `pi-config.local.json` → `rfid_uid_to_student_id` (uppercase hex as in Phase 0).
- **`seat`** must match a key in `seat_index_to_seat_id` (string `"1"` or `"2"` in config; JSON may send number `2` — the bridge normalizes).

---

## Step 2 — Put the bridge script on the Pi

**Option A — `wget` (no full repo clone):**

```bash
mkdir -p ~/smartlib/bin
wget -qO ~/smartlib/bin/serial_bridge.py \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/serial_bridge.py
chmod +x ~/smartlib/bin/serial_bridge.py
```

**Option B — copy from your repo clone** on the Pi:

```bash
cp /path/to/isss/hardware/pi/serial_bridge.py ~/smartlib/bin/
chmod +x ~/smartlib/bin/serial_bridge.py
```

---

## Step 3 — Dry run (no Firestore writes)

**Tell the Pi:**

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/serial_bridge.py \
  --config ~/smartlib/pi-config.local.json \
  --dry-run
```

**Expected:**

- Still opens **`/dev/ttyUSB0`** (or whatever is in config).
- For each **`ping`**: logs a line like **`[bridge] ping {...}`** (no Firestore).
- For **`rfid`**: either **`[dry-run] kiosk_auth_events add {...}`** with mapped **`student_id`**, or **`unknown uid`** on stderr if the UID is not in config.
- For **`fsr`**: **`[dry-run] seats/<doc_id> update {...}`**, or **`unknown seat`** on stderr if the seat index is not in config.

**If nothing prints:** ESP32 not sending lines, wrong port, or sketch not flashed.

Stop: **Ctrl+C**.

---

## Step 4 — Live Firestore writes (careful first test)

1. **Pick a quiet time** (or a **test Firestore project**) — the bridge **writes real data**.
2. Run **without** `--dry-run`:

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/serial_bridge.py \
  --config ~/smartlib/pi-config.local.json
```

3. **What the reference script does** (read `serial_bridge.py` header comment if behavior changes):

   - **`ping`:** no Firestore write (keeps serial alive only).
   - **`rfid`:** adds a document to **`kiosk_auth_events`** with `action`, `student_id`, `uid`, `timestamp` so you can trace scans in the console.
   - **`fsr`:** **`update`** on the **`seats`** document id from your map (`occupied` / `studentId` are **not** changed here — only telemetry like `fsrRaw` + `updatedAt` so the web app keeps working as today).

4. **Verify:** Firebase Console → **`kiosk_auth_events`** / **`seats`** → watch new rows / field changes while you trigger events from the ESP32 (or paste test lines via a second serial tool only if you know what you are doing).

Stop: **Ctrl+C**.

---

## Step 5 — ESP32 firmware beyond `ping`

Phase 1 sketch only sends **`ping`**. For Phase 2 you extend firmware to send **`rfid`** / **`fsr`** when hardware fires. A **reference implementation** is in the repo: **`hardware/esp32/Phase2SerialJson/Phase2SerialJson.ino`** (RC522 + two FSR channels on GPIO 34/35 by default — change the `#define`s if your wiring differs).

1. **RFID:** when the library gives you a UID string, send **one line**:  
   `{"t":"rfid","uid":"<HEX>"}`  
   (hex style must match Phase 0 config keys.)
2. **FSR:** on a timer or on change, send:  
   `{"t":"fsr","seat":2,"raw":<adc>}`  
   Use the **seat index** that matches **`seat_index_to_seat_id`** in JSON.

**Throttle** FSR lines (e.g. at most every 200–500 ms per seat) so you do not flood Firestore.

---

## Step 6 — Exit criteria (Phase 2 “basic” done)

- [ ] **`--dry-run`** shows correct interpretation of **`ping`**, **`rfid`**, **`fsr`** lines from real hardware or manual test.
- [ ] Without **`--dry-run`**, **`rfid`** creates readable rows in **`kiosk_auth_events`** (or your chosen audit collection — adjust script if you rename).
- [ ] **`fsr`** updates the correct **`seats/{id}`** document; SmartLib still loads seats normally in the browser.
- [ ] You documented any **extra** fields you added to `seats` (`fsrRaw`, `updatedAt`) so the web team knows they are **telemetry**, not required for current UI logic.

---

## Step 7 — Hardening (do this next once the bridge works)

### Step 7a — Run the bridge under **systemd** (survives reboot / SSH disconnect)

1. **Stop** any manual bridge you left running (**Ctrl+C** in that terminal), or the serial port stays open and the service will fail.

2. Copy the unit file from this repo (adjust the **source path** if your clone lives elsewhere):

```bash
cd /path/to/isss/hardware/pi
sudo cp smartlib-serial-bridge.service.example /etc/systemd/system/smartlib-serial-bridge.service
```

Or download without a full clone:

```bash
sudo wget -qO /etc/systemd/system/smartlib-serial-bridge.service \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/smartlib-serial-bridge.service.example
```

3. **Edit** if your Linux user is not **`pi`** or your home is not **`/home/pi`** — set **`User=`**, **`Group=`**, **`WorkingDirectory=`**, **`Environment=HOME=`**, and every **`/home/pi/...`** path in **`ExecStart=`** to match (or keep one user `pi` and use that account for SmartLib).

4. Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smartlib-serial-bridge.service
sudo systemctl status smartlib-serial-bridge.service
```

5. **Watch logs** (should show `[bridge] LIVE` and handler lines, not immediate exit):

```bash
journalctl -u smartlib-serial-bridge -f
```

6. **If status shows “failed”** — often **serial busy** (another process), **wrong `User`** (cannot read the key file or `/dev/ttyUSB0`), or **missing `SupplementaryGroups=dialout`**. Fix, then `sudo systemctl restart smartlib-serial-bridge.service`.

**Disable** (go back to manual runs only):

```bash
sudo systemctl disable --now smartlib-serial-bridge.service
```

---

### Step 7b — Later (optional)

- Add **logging** to a file under `~/smartlib/log/`.
- Add **rate limits** and **invalid JSON** counters.
- Map **`rfid`** → real **seat / borrow** business rules (Phase 3+).

---

## Files in this repo

| Path | Role |
|------|------|
| `hardware/pi/serial_bridge.py` | Pi: serial → parse JSON → Firestore |
| `hardware/pi/smartlib-serial-bridge.service.example` | **systemd** unit — install on Pi (see Step 7a) |
| `hardware/PHASE2.md` | This guide |
