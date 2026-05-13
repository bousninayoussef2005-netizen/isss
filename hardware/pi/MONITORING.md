# SmartLib Pi — monitoring (edge services)

All services log to **journald**. Use the **same** unit names you installed (examples use `smartlib-*`).

## Live logs (all edge units)

```bash
journalctl -u smartlib-serial-bridge -u smartlib-kiosk-worker -u smartlib-barcode-serial -f
```

## Last 100 lines per unit

```bash
journalctl -u smartlib-serial-bridge -n 100 --no-pager
journalctl -u smartlib-kiosk-worker -n 100 --no-pager
journalctl -u smartlib-barcode-serial -n 100 --no-pager
```

## Failed units after boot

```bash
systemctl --failed
```

## Quick health check

```bash
systemctl is-active smartlib-serial-bridge smartlib-kiosk-worker smartlib-barcode-serial
```

All three should print **`active`**.

## Optional: email / webhook on failure

Use **`OnFailure=`** in a unit override, or an external monitor (Uptime Kuma, cron + curl) hitting a Cloud Function — not included in this repo.
