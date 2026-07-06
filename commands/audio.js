// Audio Edit Commands
const audioCommands = {
  bass: {
    desc: 'Apply bass boost',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '🎵 Applying bass boost effect...' });
    }
  },
  deep: {
    desc: 'Make audio deeper',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '🎵 Deepening audio...' });
    }
  },
  smooth: {
    desc: 'Smooth audio',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '🎵 Smoothing audio...' });
    }
  },
  fast: {
    desc: 'Speed up audio',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '⏩ Speeding up audio...' });
    }
  },
  slow: {
    desc: 'Slow down audio',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '⏪ Slowing down audio...' });
    }
  },
  reverse: {
    desc: 'Reverse audio',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '🔄 Reversing audio...' });
    }
  },
  robot: {
    desc: 'Robot voice effect',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '🤖 Applying robot voice effect...' });
    }
  },
  chipmunk: {
    desc: 'Chipmunk voice effect',
    exec: async (args, sock, jid) => {
      sock.sendMessage(jid, { text: '🐿️ Applying chipmunk voice effect...' });
    }
  }
};

module.exports = audioCommands;
