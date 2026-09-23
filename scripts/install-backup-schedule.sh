#!/bin/zsh
# Installs a weekly backup (Sundays 20:00; if the Mac was asleep, it runs at the next wake).
# Copies go to private/backups AND to Google Drive ("My Drive/Cost tracker backups") when
# Google Drive for desktop is installed. Re-run this script after installing Drive.
# Remove with:  launchctl bootout gui/$(id -u)/com.costtracker.backup
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
[ -z "$NODE" ] && { echo "node not found"; exit 1; }
[ -f "$REPO/.env.local" ] || { echo "$REPO/.env.local missing"; exit 1; }
mkdir -p "$REPO/private/backups"
OUTS="<string>--out</string><string>$REPO/private/backups</string>"
DRIVE="$(ls -d "$HOME"/Library/CloudStorage/GoogleDrive-*/"My Drive" 2>/dev/null | head -1 || true)"
if [ -n "$DRIVE" ]; then
  mkdir -p "$DRIVE/Cost tracker backups"
  OUTS="$OUTS<string>--out</string><string>$DRIVE/Cost tracker backups</string>"
  echo "Google Drive found: $DRIVE/Cost tracker backups"
else
  echo "Google Drive for desktop not found: backups go to private/backups only (install Drive, then re-run this)."
fi
PLIST="$HOME/Library/LaunchAgents/com.costtracker.backup.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.costtracker.backup</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>--env-file=$REPO/.env.local</string><string>$REPO/scripts/backup.mjs</string>$OUTS</array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$REPO/private/backups/backup.log</string>
  <key>StandardErrorPath</key><string>$REPO/private/backups/backup.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/com.costtracker.backup" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scheduled. Running a first backup now through the scheduler..."
launchctl kickstart "gui/$(id -u)/com.costtracker.backup"
sleep 15
tail -n 5 "$REPO/private/backups/backup.log"
