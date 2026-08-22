'use strict';

const assert = require('assert');

process.env.ZST_API_KEY = 'test-zst-key';
process.env.ZST_CHAT_API_URL = 'https://zst.example.test/api/v1/ai/deepai-v2/chat';
process.env.ZST_CHAT_MODEL = 'google/gemini-test';

const axios = require('axios');
const originalPost = axios.post;
const { askChat, askZstChat } = require('../lib/ai-service');

(async () => {
  let captured;
  axios.post = async (url, body, config) => {
    captured = { url, body, config };
    return {
      data: {
        success: true,
        response: 'ZST chat response',
      },
    };
  };

  const answer = await askChat([
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'Explain APIs.' },
  ]);

  assert.strictEqual(answer, 'ZST chat response');
  assert.strictEqual(captured.url, process.env.ZST_CHAT_API_URL);
  assert.strictEqual(captured.body.model, 'google/gemini-test');
  assert.match(captured.body.prompt, /Instructions: Be concise\./);
  assert.match(captured.body.prompt, /User: Explain APIs\./);
  assert.strictEqual(captured.config.headers['x-api-key'], 'test-zst-key');
  assert.strictEqual(captured.config.headers.Accept, 'application/json');

  delete process.env.ZST_API_KEY;
  await assert.rejects(
    () => askZstChat([{ role: 'user', content: 'Hello' }]),
    /ZST_API_KEY is not configured/
  );

  axios.post = originalPost;
  console.log('ZST chat integration tests passed.');
})().catch(error => {
  axios.post = originalPost;
  console.error(error.stack || error.message);
  process.exit(1);
});
