'use strict';
// commands/audio.js — Audio effect commands (require ffmpeg for full processing)

function audioStub(cmdName, label, emoji) {
  return {
    category:    'audio',
    desc:        `Apply ${label} effect to a voice note or audio`,
    usage:       `.${cmdName} (reply to audio)`,
    aliases:     [],
    permissions: 'all',
    examples:    [`.${cmdName} (reply to a voice note)`],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted  = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasAudio = quoted?.audioMessage || quoted?.videoMessage;
      if (!hasAudio) {
        return sock.sendMessage(jid, {
          text:
            `${emoji} *${label} Effect*\n\n` +
            `Reply to a *voice note* or *audio file* with *.${cmdName}*.\n\n` +
            `*Steps:*\n` +
            `1️⃣ Send or find a voice note\n` +
            `2️⃣ Reply to it with *.${cmdName}*`
        });
      }
      await sock.sendMessage(jid, {
        text: `${emoji} *${label} Effect*\n\n⏳ Processing audio...\n\n_Full audio processing requires ffmpeg. Coming soon._`
      });
    }
  };
}

const audioCommands = {
  bass:     audioStub('bass',     'Bass Boost',  '🎵'),
  deep:     audioStub('deep',     'Deep Voice',  '🎤'),
  fast:     audioStub('fast',     'Speed Up',    '⏩'),
  slow:     audioStub('slow',     'Slow Down',   '⏪'),
  reverse:  audioStub('reverse',  'Reverse',     '🔄'),
  robot:    audioStub('robot',    'Robot Voice', '🤖'),
  chipmunk: audioStub('chipmunk', 'Chipmunk',    '🐿️'),
  smooth:   audioStub('smooth',   'Smooth',      '🎶'),
};

module.exports = audioCommands;
