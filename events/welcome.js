'use strict';
// events/welcome.js — Welcome & goodbye message handler
//
// Baileys versions and secondary-session wrappers may deliver
// group-participants.update as either one object or an array. This module
// normalises both forms before processing so joins, voluntary leaves, and
// removals/kicks all use the same reliable path.

const fs    = require('fs');
const path  = require('path');
const http  = require('http');
const https = require('https');
const db    = require('../lib/database');

const IMAGES_DIR = path.join(__dirname, '../data/group_images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

function normalizeAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (['add', 'added', 'join', 'joined', 'invite'].includes(value)) return 'add';
  if (['remove', 'removed', 'leave', 'left', 'leftgroup', 'kick', 'kicked'].includes(value)) return 'remove';
  return value;
}

function normalizeParticipant(participant) {
  if (typeof participant === 'string') return participant.trim();
  if (!participant || typeof participant !== 'object') return '';
  return String(participant.id || participant.jid || participant.user || '').trim();
}

function normalizeParticipantUpdates(input) {
  const rawUpdates = Array.isArray(input) ? input : [input];
  return rawUpdates.map(update => {
    if (!update || typeof update !== 'object') return null;
    const groupJid = String(update.id || update.jid || update.groupJid || '').trim();
    const participants = (Array.isArray(update.participants) ? update.participants : [update.participants])
      .map(normalizeParticipant)
      .filter(Boolean);
    return {
      id: groupJid,
      participants,
      action: normalizeAction(update.action || update.type || update.event),
    };
  }).filter(update =>
    update && /^\d+@(?:g\.us|group)$/i.test(update.id) &&
    update.participants.length > 0 &&
    (update.action === 'add' || update.action === 'remove')
  );
}

// ── Download a URL to a Buffer ─────────────────────────────────────────────
function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!/^https?:\/\//i.test(String(url || ''))) return reject(new Error('invalid image URL'));
    if (redirects > 3) return reject(new Error('too many image redirects'));
    const target = new URL(url);
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.get(target, { timeout: 8_000, headers: { 'User-Agent': 'Vegas-MD/3.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, target).toString();
        return fetchBuffer(next, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total <= 10 * 1024 * 1024) chunks.push(chunk);
        else res.destroy(new Error('image exceeds 10 MB'));
      });
      res.on('end', () => {
        if (total > 10 * 1024 * 1024) return reject(new Error('image exceeds 10 MB'));
        resolve(Buffer.concat(chunks));
      });
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
  return String(template || '')
    .replace(/@user/g, `@${userNum}`)
    .replace(/@group/g, groupName)
    .replace(/@count/g, String(count));
}

async function handleSingleParticipantUpdate(sock, { id: groupJid, participants, action }) {
  const settings = db.getGroup(groupJid);
  const groupId  = groupJid.replace(/@.*/g, '');

  if (action === 'add' && !settings.welcome) return;
  if (action === 'remove' && !settings.goodbye) return;

  let meta;
  try {
    meta = await sock.groupMetadata(groupJid);
  } catch (err) {
    console.error(`[welcome] groupMetadata failed for ${groupJid}:`, err.message);
    return;
  }

  const groupParticipants = Array.isArray(meta?.participants) ? meta.participants : [];
  const count = groupParticipants.length;
  const groupName = meta?.subject || groupJid;
  const isAdd = action === 'add';

  for (const participantJid of participants) {
    try {
      const userNum = participantJid.replace(/@.*/g, '');
      const template = isAdd
        ? (settings.welcomeMsg || '👋 Welcome @user to *@group*! You are member #@count.')
        : (settings.goodbyeMsg || '👋 *@user* has left *@group*.');
      const caption = resolveVars(template, { userNum, groupName, count });

      // Custom group image takes priority; profile-picture fallback is best effort.
      let imageBuffer = readGroupImage(isAdd ? 'welcome' : 'goodbye', groupId);
      if (!imageBuffer) {
        try {
          const ppUrl = await sock.profilePictureUrl(participantJid, 'image');
          if (ppUrl) imageBuffer = await fetchBuffer(ppUrl);
        } catch {
          // Privacy settings or missing picture — continue with text-only output.
        }
      }

      if (imageBuffer) {
        await sock.sendMessage(groupJid, {
          image: imageBuffer,
          caption,
          mentions: [participantJid],
        });
      } else {
        await sock.sendMessage(groupJid, {
          text: caption,
          mentions: [participantJid],
        });
      }
    } catch (err) {
      console.error(`[welcome] failed for ${participantJid} in ${groupJid}:`, err.message);
    }
  }
}

// Accept one update, an array of updates, or a wrapper that exposes the
// update fields. Returning a promise lets primary and secondary sessions use
// the exact same handler.
async function handleParticipantUpdate(sock, input) {
  const updates = normalizeParticipantUpdates(input);
  for (const update of updates) {
    await handleSingleParticipantUpdate(sock, update);
  }
}

module.exports = {
  handleParticipantUpdate,
  normalizeParticipantUpdates,
  normalizeAction,
  IMAGES_DIR,
};
