'use strict';

const assert = require('assert');
const { askPrivateText } = require('../lib/ai-service');

const previousKey = process.env.OPENAI_API_KEY;
const previousAltKey = process.env.OPEN_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPEN_API_KEY;

(async () => {
  await assert.rejects(
    () => askPrivateText([{ role: 'user', content: 'do not send this anywhere' }]),
    /Private repository AI requires/
  );
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousAltKey === undefined) delete process.env.OPEN_API_KEY;
  else process.env.OPEN_API_KEY = previousAltKey;
  console.log('Private AI fail-closed test passed.');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
