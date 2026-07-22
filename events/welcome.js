'use strict';
// events/welcome.js — Welcome & goodbye message handler
//
// Flow when a member joins (action === 'add'):
//   1. Check settings.welcome is enabled.
//   2. Fetch group metadata for name + member count.
//   3. Resolve the image to send (priority order):
//        a) Custom group welcome image (saved via .setwelcomeimage)
//        b) Joining member's WhatsApp profile picture
//        c) No image → text-only message
//   4. Replace @user / @group / @count variables in the template.
//   5. Send as imageMessage+caption (with mention) or text+mention.
//
// Flow when a member leaves (action === 'remove'): same, using goodbye settings.
//
// NOTE: WhatsApp's Baileys library does not provide a pre-send hook for
// messages the user types on their phone.  The group-participants.update event
// fires AFTER the participant change is confirmed by WhatsApp servers, so
// by definition the welcome is always sent AFTER the member appears in the group.
// Profile-picture fetching may fail for users with privacy settings — the code
// catches those errors and falls back gracefully.

const fs   = require('fs');
const path = require('path');
const http  = require('http');
const https = require('https');
const db   = require('../lib/database');

const IMAGES_DIR = path.join(__dirname, '../data/group_images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ── Download a URL to a Buffer ─────────────────────────────────────────────
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 8000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Read a saved group image from disk ────────────────────────────────────
function readGroupImage(type, groupId) {
  const p = path.join(IMAGES_DIR, `${type}_${groupId}.jpg`);
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch {}
  return null;
}

// ── Substitute @user / @group / @count in a message template ─────────────
function resolveVars(template, { userNum, groupName, count }) {
  return template
    .replace(/@user/g,  `@${userNum}`)
    .replace(/@group/g, groupName)
    .replace(/@count/g, count);
}

// ── Core handler — called from the group-participants.update listener ─────
async function handleParticipantUpdate(sock, { id: groupJid, participants, action }) {
  if (action !== 'add' && action !== 'remove') return;

  const settings = db.getGroup(groupJid);
  const groupId  = groupJid.replace(/@.*/g, '');

  if (action === 'add'    && !settings.welcome) return;
  if (action === 'remove' && !settings.goodbye) return;

  // Fetch group metadata once — needed for group name + member count
  let meta;
  try {
    meta = await sock.groupMetadata(groupJid);
  } catch (err) {
    console.error(`[welcome] groupMetadata failed for ${groupJid}:`, err.message);
    return;
  }

  for (const participantJid of participants) {
    try {
      const userNum   = participantJid.replace(/@.*/g, '');
      const count     = meta.participants.length;
      const groupName = meta.subject || groupJid;
      const isAdd     = action === 'add';

      const template = isAdd
        ? (settings.welcomeMsg || '👋 Welcome @user to *@group*! You are member #@count.')
        : (settings.goodbyeMsg || '👋 *@user* has left *@group*.');

      const caption = resolveVars(template, { userNum, groupName, count });

      // ── Resolve image (custom → profile pic → none) ─────────────────
      let imageBuffer = null;

      // 1. Custom saved image for this group
      imageBuffer = readGroupImage(isAdd ? 'welcome' : 'goodbye', groupId);

      // 2. Member's profile picture
      if (!imageBuffer) {
        try {
          const ppUrl = await sock.profilePictureUrl(participantJid, 'image');
          if (ppUrl) imageBuffer = await fetchBuffer(ppUrl);
        } catch {
          // privacy settings or no picture — not an error
        }
      }

      // ── Send ─────────────────────────────────────────────────────────
      if (imageBuffer) {
        await sock.sendMessage(groupJid, {
          image:    imageBuffer,
          caption:  caption,
          mentions: [participantJid]
        });
      } else {
        await sock.sendMessage(groupJid, {
          text:     caption,
          mentions: [participantJid]
        });
      }

    } catch (err) {
      console.error(`[welcome] failed for ${participantJid} in ${groupJid}:`, err.message);
    }
  }
}

module.exports = { handleParticipantUpdate, IMAGES_DIR };
