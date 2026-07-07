'use strict';
// commands/index.js — Central command loader + registry
// Builds a flat allCommands map and a categoryRegistry from command metadata.
const fs   = require('fs');
const path = require('path');

const allCommands      = {};
const categoryRegistry = {}; // { catKey: string[] }

// Display order for categories in the menu
const CATEGORY_ORDER = [
  'general', 'ai', 'downloader', 'search', 'converter',
  'sticker', 'group', 'moderation', 'fun', 'games',
  'economy', 'audio', 'utility', 'owner'
];

function register(mod, sourceLabel) {
  for (const [name, cmd] of Object.entries(mod)) {
    if (typeof cmd?.exec !== 'function') continue;
    if (allCommands[name]) {
      // Warn but allow override so plugins can intentionally replace core commands
      console.warn(`[CommandLoader] Duplicate command "${name}" — overwriting previous definition${sourceLabel ? ` (source: ${sourceLabel})` : ''}`);
    }
    allCommands[name] = cmd;
    const cat = (cmd.category || 'utility').toLowerCase();
    if (!categoryRegistry[cat]) categoryRegistry[cat] = [];
    if (!categoryRegistry[cat].includes(name)) categoryRegistry[cat].push(name);

    // Register aliases so they resolve to the same exec — without this,
    // declared aliases silently fail as "unknown command" at dispatch time.
    if (Array.isArray(cmd.aliases)) {
      for (const alias of cmd.aliases) {
        if (!alias) continue;
        if (!allCommands[alias]) {
          allCommands[alias] = cmd;
          // Aliases are not added to categoryRegistry to avoid duplicate entries in menus
        }
      }
    }
  }
}

// ─── Core command files ────────────────────────────────────
const coreFiles = [
  './main', './general', './ai', './download', './search',
  './converter', './tools', './group', './moderation',
  './fun', './games', './audio', './economy', './settings', './owner'
];

for (const file of coreFiles) {
  try {
    register(require(file));
  } catch (err) {
    console.error(`[CommandLoader] Failed to load ${file}:`, err.message);
  }
}

// ─── Plugin system ─────────────────────────────────────────
const pluginsDir = path.join(__dirname, '../plugins');
if (fs.existsSync(pluginsDir)) {
  const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
  for (const file of pluginFiles) {
    try {
      const plugin  = require(path.join(pluginsDir, file));
      const cmds    = plugin.commands || plugin;
      if (typeof cmds === 'object') {
        register(cmds);
        console.log(`[Plugin] Loaded ${file} (${Object.keys(cmds).length} commands)`);
      }
    } catch (err) {
      console.error(`[Plugin] Failed to load ${file}:`, err.message);
    }
  }
}

// Sort each category alphabetically
for (const cat of Object.keys(categoryRegistry)) {
  categoryRegistry[cat].sort();
}

module.exports                  = allCommands;
module.exports.categoryRegistry = categoryRegistry;
module.exports.CATEGORY_ORDER   = CATEGORY_ORDER;
