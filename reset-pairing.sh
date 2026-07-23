#!/bin/bash
# reset-pairing.sh — Clean-slate pairing reset
#
# Run this whenever:
#   • Your WhatsApp was banned and reinstated
#   • Pairing codes keep failing / bot won't connect
#   • You want to link a different WhatsApp number
#
# Usage:
#   bash reset-pairing.sh          # reset only (you restart the bot yourself)
#   bash reset-pairing.sh --pm2    # reset + restart via PM2

set -e

echo ""
echo "═══════════════════════════════════════════════"
echo "  OLASUBOMI-MD — Pairing Reset"
echo "═══════════════════════════════════════════════"

# 1. Stop PM2 process if running (suppress errors if not running)
if [ "$1" = "--pm2" ]; then
  echo "→ Stopping PM2 process..."
  pm2 stop olasubomi 2>/dev/null || pm2 stop olasubom 2>/dev/null || true
fi

# 2. Clear pairing failure counter
if [ -f .pairing_attempts.json ]; then
  rm -f .pairing_attempts.json
  echo "✓ Cleared pairing failure counter"
else
  echo "✓ No pairing counter to clear"
fi

# 3. Wipe auth keys (stale keys cause 401 loops)
if [ -d auth_info_baileys ]; then
  rm -rf auth_info_baileys/
  echo "✓ Wiped auth_info_baileys/"
else
  echo "✓ No stale auth keys to wipe"
fi

echo ""
echo "✅ Reset complete. Bot will start fresh."
echo ""

if [ "$1" = "--pm2" ]; then
  echo "→ Restarting bot via PM2..."
  pm2 start main.js --name olasubomi 2>/dev/null || pm2 restart olasubomi
  echo ""
  echo "   Watch logs:  pm2 logs olasubomi"
fi

echo "   When the pairing code appears:"
echo "   WhatsApp → Settings → Linked Devices → Link a Device → enter code"
echo "   You have ~60 seconds to enter it before it expires."
echo ""
