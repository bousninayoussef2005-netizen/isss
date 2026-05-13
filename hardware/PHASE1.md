# Phase 1 — ESP32 ↔ Raspberry Pi serial (proof pipe)

**Goal:** One **reliable text line** (JSON) per event from ESP32 → Pi, printed on the Pi. No Firestore writes in this phase yet.

**Prerequisite (done in your lab):** `~/smartlib/pi-config.local.json` valid JSON; **`smoke_test.py`** prints **Firestore OK**; `pyserial` installed in `~/smartlib/venv/`.

---

## Step 1 — Choose how the ESP32 talks to the Pi

**Option A — USB (simplest for first test)**  
Plug the ESP32 into the Pi with a **USB data cable**. The Pi usually sees **`/dev/ttyACM0`** (sometimes `ttyUSB0`).

**Option B — 3.3 V UART wires**  
ESP32 **TX** → Pi **RX**, ESP32 **RX** → Pi **TX**, **GND** ↔ **GND**. Do **not** connect 5 V UART to ESP32 GPIO. Pick a UART on the ESP32 (e.g. `Serial2` on fixed pins — see sketch comments in repo).

---

## Step 2 — Find the serial device on the Pi

**Tell the Pi:**

```bash
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Unplug the ESP32, run again, plug back — whichever device **appears/disappears** is the one to use.

**Tell the Pi** (edit config):

```bash
nano ~/smartlib/pi-config.local.json
```

Set **`serial.port_linux`** to that path (e.g. `/dev/ttyACM0`). Save (Ctrl+O, Enter, Ctrl+X).

---

## Step 3 — Flash the ESP32 (USB “ping” sketch)

Use **Arduino IDE** or **PlatformIO** on your PC. Open the sketch in this repo:

**`hardware/esp32/Phase1SerialPing/Phase1SerialPing.ino`**

It prints one JSON line per second on **USB Serial** (`Serial` @ 115200):

`{"t":"ping","src":"esp32"}`

Flash the board. If you use **UART to the Pi** instead of USB, follow the comments in that file and use `Serial2` (or your wiring).

---

## Step 4 — Copy the Pi listener script

On the Pi, download the listener (or use your clone):

```bash
mkdir -p ~/smartlib/bin
wget -qO ~/smartlib/bin/serial_listen.py \
  https://raw.githubusercontent.com/bousninayoussef2005-netizen/isss/main/hardware/pi/serial_listen.py
```

If you already have the repo on the Pi, you can instead:

```bash
cp /path/to/isss/hardware/pi/serial_listen.py ~/smartlib/bin/
```

---

## Step 5 — Run the listener (read lines from the ESP32)

**Tell the Pi:**

```bash
~/smartlib/venv/bin/python ~/smartlib/bin/serial_listen.py --config ~/smartlib/pi-config.local.json
```

You should see **`{"t":"ping","src":"esp32"}`** (or similar) **once per second**.

- **Nothing prints:** wrong `port_linux`, wrong baud, ESP not flashed, or wrong cable (charge-only USB).
- **Garbage:** baud mismatch (must be **115200** on both sides for the example sketch).

Stop with **Ctrl+C**.

---

## Step 6 — Exit criteria (Phase 1 done)

- [x] Correct **`serial.port_linux`** in `pi-config.local.json` (e.g. **`/dev/ttyUSB0`**).
- [x] ESP32 sketch running; Pi **`serial_listen.py`** prints clean JSON lines (ping) without crashes.

**Next — Phase 2:** **[PHASE2.md](./PHASE2.md)** — **`serial_bridge.py`**: parse JSON on the Pi (`t` == `ping` / `rfid` / `fsr`) and call Firestore (Admin SDK) using the same config + key you already verified. Start with **`--dry-run`**.

---

## Files in this repo

| Path | Role |
|------|------|
| `hardware/esp32/Phase1SerialPing/Phase1SerialPing.ino` | Minimal ESP32 firmware |
| `hardware/pi/serial_listen.py` | Pi: read serial, print lines |
| `hardware/pi/smoke_test.py` | Pi: Firestore check (Phase 0) |
