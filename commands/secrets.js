'use strict';

const {
  listSecretNames,
  removeSecret,
  setSecret,
} = require('../lib/secret-store');
const { resolveIsOwner, normalizeJid } = require('../lib/helpers');

function ownerOnly(exec) {
  return async (args, sock, jid, isGroup, sender, message, botConfig) => {
    if (resolveIsOwner(message, sender, botConfig)) return exec(args, sock, jid, isGroup, sender, message, botConfig);
    const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
    return sock.sendMessage(jid, {
      text: ownerNum ? '🔒 This command is *owner-only*.' : '🔒 Owner not configured. Set OWNER_NUMBER first.'
    });
  };
}

function usage() {
  return [
    '🔐 *Encrypted Secret Store*',
    '',
    '`.secret set NAME VALUE` — save or replace a secret',
    '`.secret list` — show secret names only',
    '`.secret remove NAME` — delete a secret',
    '',
    '_Values are encrypted at rest and never shown in bot replies. For maximum security, set SECRET_STORE_KEY in your host secret manager._'
  ].join('\n');
}

const secretCommands = {
  secret: {
    category: 'owner', reaction: '🔐', desc: 'Store API secrets encrypted at rest',
    usage: '.secret <set|list|remove> [name] [value]', aliases: ['secrets'], permissions: 'owner',
    examples: ['.secret set OPENAI_API_KEY sk-...', '.secret list', '.secret remove ZST_API_KEY'],
    exec: ownerOnly(async (args, sock, jid) => {
      const action = String(args[0] || '').toLowerCase();
      if (!action) return sock.sendMessage(jid, { text: usage() });

      try {
        if (action === 'list') {
          const names = listSecretNames();
          return sock.sendMessage(jid, {
            text: names.length ? `🔐 Stored secret names:\n\n${names.map(name => `• ${name}`).join('\n')}` : '🔐 No encrypted secrets are stored.'
          });
        }
        if (action === 'set') {
          const name = args[1];
          const value = args.slice(2).join(' ').trim();
          if (!name || !value) return sock.sendMessage(jid, { text: '❌ Usage: .secret set NAME VALUE\nExample: .secret set OPENAI_API_KEY sk-...' });
          const savedName = setSecret(name, value);
          return sock.sendMessage(jid, { text: `✅ ${savedName} was encrypted and stored. Its value is not displayed.` });
        }
        if (action === 'remove' || action === 'delete' || action === 'unset') {
          if (!args[1]) return sock.sendMessage(jid, { text: '❌ Usage: .secret remove NAME' });
          const removed = removeSecret(args[1]);
          return sock.sendMessage(jid, { text: removed ? '✅ Secret removed.' : 'ℹ️ That secret was not stored.' });
        }
        return sock.sendMessage(jid, { text: usage() });
      } catch (error) {
        console.error('[secrets] command failed:', error.message);
        return sock.sendMessage(jid, { text: `❌ Secret operation failed: ${error.message}` });
      }
    })
  }
};

module.exports = secretCommands;
