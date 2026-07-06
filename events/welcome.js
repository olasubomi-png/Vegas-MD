// Auto welcome / goodbye messages

const db = require('../lib/database');

async function handleParticipantUpdate(sock, { id: groupJid, participants, action }) {
  const settings = db.getGroup(groupJid);

  if (action === 'add' && settings.welcome) {
    for (const jid of participants) {
      try {
        const meta = await sock.groupMetadata(groupJid);
        const count = meta.participants.length;
        const name = jid.split('@')[0];
        const msg = (settings.welcomeMsg || '👋 Welcome @user to *@group*! You are member #@count.')
          .replace('@user', `@${name}`)
          .replace('@group', meta.subject)
          .replace('@count', count);

        await sock.sendMessage(groupJid, {
          text: msg,
          mentions: [jid]
        });
      } catch (err) {
        console.error('Welcome error:', err.message);
      }
    }
  }

  if (action === 'remove' && settings.goodbye) {
    for (const jid of participants) {
      try {
        const name = jid.split('@')[0];
        const msg = (settings.goodbyeMsg || '👋 *@user* has left the group.')
          .replace('@user', `@${name}`);

        await sock.sendMessage(groupJid, {
          text: msg,
          mentions: [jid]
        });
      } catch (err) {
        console.error('Goodbye error:', err.message);
      }
    }
  }
}

module.exports = { handleParticipantUpdate };
