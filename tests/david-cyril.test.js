'use strict';

const assert = require('assert');
process.env.VISUAL_SEARCH_TEST_INTERNALS = '1';

const api = require('../lib/david-cyril-api');
const searchCommands = require('../commands/search');
const aiMusicCommands = require('../commands/aimusic');
const downloadCommands = require('../commands/download');

assert.strictEqual(api.unwrapResult({ success: true, result: { id: 1 } }).id, 1);
assert.strictEqual(api.firstMediaUrl({ download_url: 'https://cdn.example/audio.mp3', title: 'Song' }), 'https://cdn.example/audio.mp3');
assert.strictEqual(api.isSafeRemoteUrl('https://cdn.example/media.mp3'), true);
assert.strictEqual(api.isSafeRemoteUrl('http://cdn.example/media.mp3'), false);
assert.strictEqual(api.isSafeRemoteUrl('https://127.0.0.1/private'), false);
assert.strictEqual(api.extractTaskId({ result: { task_id: 'task-123' } }), 'task-123');
assert.strictEqual(api.isFailedStatus({ status: 'failed' }), true);
assert.strictEqual(api.isReadyStatus({ status: 'completed' }), true);

const visual = searchCommands._internals.normalizeVisualResults({
  success: true,
  result: [
    { title: '  Naruto wallpaper  ', image: 'https://cdn.example/naruto.webp', source: 'Unknown Source' },
    { title: 'Duplicate', image: 'https://cdn.example/naruto.webp' },
    { title: 'Second', thumbnail: 'https://cdn.example/second.webp' },
  ],
}, 2);
assert.strictEqual(visual.length, 2);
assert.strictEqual(visual[0].title, 'Naruto wallpaper');

const parsed = aiMusicCommands._internals.parseAiMusicRequest([
  'cinematic', 'piano', '--instrumental', '--model', 'v5.0', '--title=Sunrise'
]);
assert.deepStrictEqual(parsed, {
  prompt: 'cinematic piano',
  modelId: 'v5.0',
  title: 'Sunrise',
  instrumental: true,
});

assert.strictEqual(typeof downloadCommands.pindl.exec, 'function');
assert.strictEqual(typeof searchCommands.danimesearch.exec, 'function');
assert.strictEqual(typeof searchCommands.dwallpaper.exec, 'function');
assert.strictEqual(typeof aiMusicCommands.aimusic.exec, 'function');

console.log('David Cyril integration tests passed.');
