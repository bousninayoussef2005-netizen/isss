#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Copy SmartLib Pi Python scripts from this repo to ~/smartlib/bin on the Raspberry Pi (SCP).

.DESCRIPTION
  Use this from your Windows dev machine when the Pi is on your LAN (SSH keys or password).
  Does not touch pi-config.local.json or secrets.

.EXAMPLE
  .\sync_bin_to_pi.ps1 -PiHost 192.168.1.42

.EXAMPLE
  $env:SMARTLIB_PI_HOST = "192.168.1.42"; .\sync_bin_to_pi.ps1 -Restart
#>
param(
  [string] $PiHost = $env:SMARTLIB_PI_HOST,
  [string] $User = $(if ($env:SMARTLIB_PI_USER) { $env:SMARTLIB_PI_USER } else { "pi" }),
  [switch] $Restart
)

$ErrorActionPreference = "Stop"
if (-not $PiHost) {
  Write-Host "Usage: .\sync_bin_to_pi.ps1 -PiHost <IP-or-hostname> [-User pi] [-Restart]" -ForegroundColor Yellow
  Write-Host "   or: `$env:SMARTLIB_PI_HOST = '192.168.x.x'; .\sync_bin_to_pi.ps1" -ForegroundColor Yellow
  exit 1
}

$src = $PSScriptRoot
$remote = "${User}@${PiHost}:smartlib/bin/"
$files = @(
  "serial_bridge.py",
  "kiosk_worker.py",
  "barcode_hid_to_kiosk.py",
  "serial_listen.py",
  "smoke_test.py",
  "refresh_pi_bin.sh"
)

Write-Host "==> mkdir smartlib/bin on ${User}@${PiHost}" -ForegroundColor Cyan
ssh "${User}@${PiHost}" "mkdir -p smartlib/bin"

foreach ($f in $files) {
  $local = Join-Path $src $f
  if (-not (Test-Path -LiteralPath $local)) {
    Write-Warning "Skip missing: $local"
    continue
  }
  Write-Host "==> scp $f" -ForegroundColor Cyan
  scp $local "${User}@${PiHost}:smartlib/bin/$f"
}

ssh "${User}@${PiHost}" "chmod +x smartlib/bin/refresh_pi_bin.sh 2>/dev/null; true"

if ($Restart) {
  Write-Host "==> restart systemd units (ignore errors if unit missing)" -ForegroundColor Cyan
  ssh "${User}@${PiHost}" @'
sudo systemctl restart smartlib-serial-bridge.service 2>/dev/null || true
sudo systemctl restart smartlib-kiosk-worker.service 2>/dev/null || true
sudo systemctl restart smartlib-barcode-serial.service 2>/dev/null || true
'@
}

Write-Host "Done." -ForegroundColor Green
