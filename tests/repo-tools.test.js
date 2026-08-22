'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vegas-repo-test-'));
const secretFile = path.join(tempDir, 'secrets.enc.json');
process.env.REPO_WORKSPACE = tempDir;
process.env.SECRETS_FILE = secretFile;
process.env.SECRET_STORE_KEY = 'test-master-key-do-not-use';

const repo = require('../lib/repo-workspace');
const secrets = require('../lib/secret-store');
const zst = require('../lib/zst-image');

assert.strictEqual(repo.relativeWorkspacePath('src/app.js'), 'src/app.js');
assert.throws(() => repo.relativeWorkspacePath('../outside.txt'), /inside/);
assert.throws(() => repo.relativeWorkspacePath('.env'), /protected/);
assert.throws(() => repo.relativeWorkspacePath('id_rsa.pem'), /protected/);

const written = repo.writeRepoFile('src/app.js', 'console.log("ok");\n');
assert.strictEqual(written, 'src/app.js');
assert.match(repo.readRepoFile('src/app.js').content, /console\.log/);

const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vegas-outside-'));
fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'do not expose');
fs.symlinkSync(outsideDir, path.join(tempDir, 'linked'), 'dir');
assert.throws(() => repo.readRepoFile('linked/secret.txt'), /outside/);
assert.throws(() => repo.writeRepoFile('linked/new.txt', 'blocked'), /outside/);

const patch = [
  'diff --git a/src/app.js b/src/app.js',
  '--- a/src/app.js',
  '+++ b/src/app.js',
  '@@ -1 +1 @@',
  '-console.log("ok");',
  '+console.log("fixed");',
].join('\n');
assert.strictEqual(repo.extractUnifiedDiff(`Here is the patch:\n\n\`\`\`diff\n${patch}\n\`\`\``), patch);
assert.strictEqual(repo.validatePatch(patch, 'src/app.js'), patch);
assert.throws(() => repo.validatePatch(patch.replaceAll('src/app.js', 'src/other.js'), 'src/app.js'), /target file/);

assert.strictEqual(zst.collectImageUrls({ data: { images: ['https://signed.example/image.jpg'], imageUrls: ['https://proxy.example/image.jpg'] } })[0], 'https://proxy.example/image.jpg');

assert.strictEqual(secrets.setSecret('TEST_API_KEY', 'secret-value'), 'TEST_API_KEY');
assert.deepStrictEqual(secrets.listSecretNames(), ['TEST_API_KEY']);
delete process.env.TEST_API_KEY;
secrets.loadSecretsIntoEnv();
assert.strictEqual(process.env.TEST_API_KEY, 'secret-value');
assert.strictEqual(secrets.removeSecret('TEST_API_KEY'), true);
assert.deepStrictEqual(secrets.listSecretNames(), []);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('Repository and secret-store tests passed.');
