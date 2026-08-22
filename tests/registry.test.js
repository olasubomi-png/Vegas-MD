'use strict';

const commands = require('../commands');
const required = ['pinterest', 'pin', 'chat', 'aichat', 'code', 'coding', 'speak', 'freechat', 'freechatgroups', 'vibe', 'workrepo', 'play'];
for (const name of required) {
  if (!commands[name] || typeof commands[name].exec !== 'function') {
    throw new Error(`Missing command: ${name}`);
  }
}
console.log(`Command registry loaded: ${Object.keys(commands).length} entries; required commands present.`);
