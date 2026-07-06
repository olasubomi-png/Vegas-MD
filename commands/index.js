// Command loader that combines all commands
const aiCommands = require('./ai');
const downloadCommands = require('./download');
const groupCommands = require('./group');
const funCommands = require('./fun');
const audioCommands = require('./audio');
const toolsCommands = require('./tools');
const mainCommands = require('./main');
const settingsCommands = require('./settings');

const allCommands = {
  ...mainCommands,
  ...aiCommands,
  ...downloadCommands,
  ...groupCommands,
  ...funCommands,
  ...audioCommands,
  ...toolsCommands,
  ...settingsCommands
};

module.exports = allCommands;
