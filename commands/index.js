// Command loader + plugin system
// Auto-loads all files in commands/ and plugins/
const fs = require('fs');
const path = require('path');

const allCommands = {};

// ─── Core command files ───────────────────────────────────
const coreFiles = [
  './main', './ai', './download', './group',
  './fun', './audio', './tools', './settings',
  './economy', './owner', './moderation'
];

for (const file of coreFiles) {
  try {
    const mod = require(file);
    Object.assign(allCommands, mod);
  } catch (err) {
    console.error(`[CommandLoader] Failed to load ${file}:`, err.message);
  }
}

// ─── Plugin system ────────────────────────────────────────
const pluginsDir = path.join(__dirname, '../plugins');

if (fs.existsSync(pluginsDir)) {
  const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));

  for (const file of pluginFiles) {
    try {
      const pluginPath = path.join(pluginsDir, file);
      const plugin = require(pluginPath);

      // Plugins export { commands: { ... } } or directly export commands
      const cmds = plugin.commands || plugin;

      if (typeof cmds === 'object') {
        const count = Object.keys(cmds).length;
        Object.assign(allCommands, cmds);
        console.log(`[Plugin] Loaded ${file} (${count} commands)`);
      }
    } catch (err) {
      console.error(`[Plugin] Failed to load ${file}:`, err.message);
    }
  }
}

module.exports = allCommands;
