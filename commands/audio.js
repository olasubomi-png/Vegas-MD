// Audio Effect Commands
// These commands require the user to reply to an audio message.
// Full ffmpeg-based processing can be added when audio files are accessible.

function audioStub(effect, emoji) {
  return {
    desc: `Apply ${effect} effect to audio`,
    exec: async (args, sock, jid, isGroup, sender, message) => {
      // Check if replying to an audio/voice message
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasAudio = quoted?.audioMessage || quoted?.videoMessage;

      if (!hasAudio) {
        return await sock.sendMessage(jid, {
          text: `${emoji} *${effect} Effect*\n\nReply to a voice note or audio file with *.${effect.toLowerCase()}* to apply this effect.\n\n*Example:*\n1. Send or find a voice note\n2. Reply to it with .${effect.toLowerCase()}`
        });
      }

      // Audio message found — acknowledge (full processing requires ffmpeg)
      await sock.sendMessage(jid, {
        text: `${emoji} *${effect} Effect*\n\n⏳ Processing audio...\n\n_Note: Full audio processing requires ffmpeg to be configured on the server._`
      });
    }
  };
}

const audioCommands = {
  bass:     audioStub('Bass Boost', '🎵'),
  deep:     audioStub('Deep Voice', '🎤'),
  fast:     audioStub('Speed Up', '⏩'),
  slow:     audioStub('Slow Down', '⏪'),
  reverse:  audioStub('Reverse', '🔄'),
  robot:    audioStub('Robot Voice', '🤖'),
  chipmunk: audioStub('Chipmunk', '🐿️'),
  smooth:   audioStub('Smooth', '🎶')
};

module.exports = audioCommands;
