// Auto welcome / goodbye messages

const db = require('../lib/database');

async function handleParticipantUpdate(sock, { id: groupJid, participants, action }) {
  console.log(`[welcome] group-participants.update → action=${action} group=${groupJid} participants=${JSON.stringify(participants)}`);

  const settings = db.getGroup(groupJid);
  console.log(`[welcome] group settings → welcome=${settings.welcome} goodbye=${settings.goodbye} welcomeMsg="${settings.welcomeMsg}"`);

  if (action === 'add') {
    if (!settings.welcome) {
      console.log(`[welcome] welcome is disabled for ${groupJid} — skipping`);
    } else {
      for (const jid of participants) {
        try {
          const meta  = await sock.groupMetadata(groupJid);
          const count = meta.participants.length;
          const name  = jid.split('@')[0];
          const msg   = (settings.welcomeMsg || '👋 Welcome @user to *@group*! You are member #@count.')
            .replace(/@user/g,  `@${name}`)
            .replace(/@group/g, meta.subject)
            .replace(/@count/g, count);

          console.log(`[welcome] sending welcome for ${jid} in ${groupJid}: "${msg.slice(0, 80)}"`);
          await sock.sendMessage(groupJid, { text: msg, mentions: [jid] });
          console.log(`[welcome] ✅ welcome sent for ${jid} in ${groupJid}`);
        } catch (err) {
          console.error(`[welcome] ❌ error sending welcome for ${jid} in ${groupJid}:`, err.message);
        }
      }
    }
  }

  if (action === 'remove') {
    if (!settings.goodbye) {
      console.log(`[welcome] goodbye is disabled for ${groupJid} — skipping`);
    } else {
      for (const jid of participants) {
        try {
          const name = jid.split('@')[0];
          const msg  = (settings.goodbyeMsg || '👋 *@user* has left the group.')
            .replace(/@user/g, `@${name}`);

          console.log(`[welcome] sending goodbye for ${jid} in ${groupJid}`);
          await sock.sendMessage(groupJid, { text: msg, mentions: [jid] });
          console.log(`[welcome] ✅ goodbye sent for ${jid} in ${groupJid}`);
        } catch (err) {
          console.error(`[welcome] ❌ error sending goodbye for ${jid} in ${groupJid}:`, err.message);
        }
      }
    }
  }
}

module.exports = { handleParticipantUpdate };
