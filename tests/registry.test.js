'use strict';

const commands = require('../commands');
const required = ['code', 'speak', 'freechat', 'freechatgroups', 'play'];
for (const name of required) {
  if (!commands[name] || typeof commands[name].exec !== 'function') {
    throw new Error(`Missing command: ${name}`);
  }
}
console.log(`Command registry loaded: ${Object.keys(commands).length} entries; required commands present.`);
