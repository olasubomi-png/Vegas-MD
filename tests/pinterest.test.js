'use strict';

const assert = require('assert');
process.env.PINTEREST_TEST_INTERNALS = '1';
const searchCommands = require('../commands/search');
const {
  parsePinterestRequest,
  isAllowedPinterestImageUrl,
  normalizePinterestResults,
  pinterestCaption,
} = searchCommands._internals;

assert.deepStrictEqual(parsePinterestRequest(['$naruto', '3']), { query: 'naruto', count: 3 });
assert.deepStrictEqual(parsePinterestRequest(['anime', 'wallpaper', '99']), { query: 'anime wallpaper', count: 6 });
assert.deepStrictEqual(parsePinterestRequest(['naruto']), { query: 'naruto', count: 3 });

assert.strictEqual(isAllowedPinterestImageUrl('https://i.pinimg.com/736x/example.jpg'), true);
assert.strictEqual(isAllowedPinterestImageUrl('http://i.pinimg.com/example.jpg'), false);
assert.strictEqual(isAllowedPinterestImageUrl('https://example.com/image.jpg'), false);

const normalized = normalizePinterestResults({
  success: true,
  result: [
    { uploader: 'user', fullName: 'Full User', followers: 12, caption: '  Naruto  art  ', image: 'https://i.pinimg.com/a.jpg', source: 'https://www.pinterest.com/pin/123/' },
    { uploader: 'duplicate', image: 'https://i.pinimg.com/a.jpg', source: 'https://www.pinterest.com/pin/456/' },
    { uploader: 'unsafe', image: 'https://example.com/a.jpg', source: 'https://www.pinterest.com/pin/789/' },
  ]
}, 6);
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].caption, 'Naruto art');
assert.ok(pinterestCaption(normalized[0], 1, 1, 'naruto').includes('https://www.pinterest.com/pin/123/'));

console.log('Pinterest unit tests passed.');
