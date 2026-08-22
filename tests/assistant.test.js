'use strict';

const assert = require('assert');
const assistant = require('../commands/assistant');
const { remember, isBotGenerated } = require('../lib/bot-messages');

const { parseSpeechRequest, setHistory, getHistory, clearHistoryFor } = assistant._internals;

const parsed = parseSpeechRequest(['--voice', 'Nova', 'Hello', 'there'], null);
assert.deepStrictEqual(parsed, { voice: 'nova', text: 'Hello there' });

const defaultVoice = parseSpeechRequest(['Hello', 'there'], null);
assert.strictEqual(defaultVoice.text, 'Hello there');
assert.ok(defaultVoice.voice);

const key = 'test-owner|test-chat';
setHistory(key, Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `message-${i}` })));
const history = getHistory(key);
assert.ok(history.length <= 10, 'history should be capped by message count');
clearHistoryFor('test-owner', 'test-chat');
assert.deepStrictEqual(getHistory(key), []);

const messageId = `test-${Date.now()}`;
assert.strictEqual(isBotGenerated(messageId), false);
remember(messageId);
assert.strictEqual(isBotGenerated(messageId), true);

console.log('Assistant unit tests passed.');
