'use strict';

const {
  applyPatch,
  buildRepoContext,
  extractUnifiedDiff,
  getRepoStatus,
  listRepoFiles,
  readRepoFile,
  relativeWorkspacePath,
  runProjectTests,
  truncate,
  validatePatch,
  writeRepoFile,
} = require('../lib/repo-workspace');
const {
  askPrivateText,
  getCodingSystemPrompt,
  trimText,
} = require('../lib/ai-service');
const { resolveIsOwner, normalizeJid } = require('../lib/helpers');

const MAX_REQUEST_CHARS = 2_000;

function ownerOnly(exec) {
  return async (args, sock, jid, isGroup, sender, message, botConfig) => {
    if (resolveIsOwner(message, sender, botConfig)) return exec(args, sock, jid, isGroup, sender, message, botConfig);
    const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
    return sock.sendMessage(jid, {
      text: ownerNum ? '🔒 Repository and coding controls are *owner-only*.' : '🔒 Owner not configured. Set OWNER_NUMBER first.'
    });
  };
}

function usage() {
  return [
    '🧑‍💻 *Vegas Vibe Coding Assistant*',
    '',
    '`.vibe <request>` — inspect the repository and suggest code changes',
    '`.repo status` — show branch and working-tree status',
    '`.repo files [filter]` — list accessible repository files',
    '`.repo read <path> [start] [end]` — read a bounded file range',
    '`.repo test` — run the project test strategy',
    '`.repo review <request>` — review the repository against a goal',
    '`.repo fix <path> <problem>` — generate a patch preview',
    '`.repo fix --apply <path> <problem>` — apply a validated patch',
    '`.repo write --apply <path> <content>` — overwrite a file intentionally',
    '',
    '_Protected paths include .env, encrypted secrets, auth files, .git, node_modules, and private key files._'
  ].join('\n');
}

function parseApply(args) {
  const copy = [...args];
  const index = copy.findIndex(arg => String(arg).toLowerCase() === '--apply');
  if (index < 0) return { apply: false, args: copy };
  copy.splice(index, 1);
  return { apply: true, args: copy };
}

function normalizeRequest(args) {
  return trimText(args.join(' ').trim(), MAX_REQUEST_CHARS);
}

async function sendRepoStatus(sock, jid) {
  const status = await getRepoStatus();
  await sock.sendMessage(jid, { text: `📦 *Repository Status*\n\n${status || 'No status output.'}` });
}

async function sendRepoFiles(args, sock, jid) {
  const filter = String(args.join(' ').trim()).toLowerCase();
  const files = await listRepoFiles();
  const filtered = filter ? files.filter(file => file.toLowerCase().includes(filter)) : files;
  const visible = filtered.slice(0, 120);
  const suffix = filtered.length > visible.length ? `\n\n…and ${filtered.length - visible.length} more file(s).` : '';
  await sock.sendMessage(jid, {
    text: visible.length ? `📁 *Repository Files*${filter ? ` matching _${filter}_` : ''}\n\n${visible.map(file => `• ${file}`).join('\n')}${suffix}` : '📁 No accessible files matched.'
  });
}

async function sendRepoRead(args, sock, jid) {
  const relative = args[0];
  if (!relative) return sock.sendMessage(jid, { text: '❌ Usage: .repo read <path> [start] [end]' });
  const data = readRepoFile(relative, args[1], args[2]);
  await sock.sendMessage(jid, {
    text: `📄 *${data.relative}* (lines ${data.start}-${data.end} of ${data.totalLines})\n\n${truncate(data.body, 5_500)}`
  });
}

async function sendRepoTest(sock, jid) {
  await sock.sendMessage(jid, { text: '🧪 Running the project test strategy...' });
  const result = await runProjectTests();
  await sock.sendMessage(jid, {
    text: `${result.code === 0 ? '✅' : '❌'} *Project Test Result*\n\nStrategy: ${result.strategy}\nExit code: ${result.code}\n\n${truncate(result.output || 'No output.', 5_400)}`
  });
}

async function runVibeReview(request, sock, jid) {
  if (!request) return sock.sendMessage(jid, { text: usage() });
  await sock.sendMessage(jid, { text: '🧑‍💻 Inspecting the repository and preparing a coding response...' });
  const context = await buildRepoContext(request);
  const answer = await askPrivateText([
    { role: 'system', content: `${getCodingSystemPrompt('Vegas-MD')} You have a read-only repository snapshot below. Do not claim to have changed or tested files. Identify likely issues, explain the smallest safe fix, and provide copy-pasteable code or a precise patch plan. Never expose secrets from the snapshot.` },
    { role: 'user', content: `User request:\n${request}\n\nRepository snapshot:\n${context}` },
  ], { model: process.env.CODING_AI_MODEL || process.env.AI_MODEL || 'gpt-5-mini', maxTokens: 1_600, temperature: 0.2 });
  await sock.sendMessage(jid, { text: `🧑‍💻 *Vibe Coding Review*\n\n${answer}` });
}

async function runRepoFix(args, sock, jid) {
  const parsed = parseApply(args);
  const target = parsed.args[0];
  const problem = normalizeRequest(parsed.args.slice(1));
  if (!target || !problem) return sock.sendMessage(jid, { text: '❌ Usage: .repo fix [--apply] <path> <problem>' });

  const data = readRepoFile(target, 1, 260);
  const relative = relativeWorkspacePath(target);
  await sock.sendMessage(jid, { text: `🛠️ Generating a focused patch for *${relative}*...${parsed.apply ? '\n⚠️ Apply mode is enabled; the patch will be checked before it is written.' : ''}` });
  const answer = await askPrivateText([
    { role: 'system', content: `${getCodingSystemPrompt('Vegas-MD')} Return ONLY a unified diff for the requested single file. The diff must use a/ and b/ paths and contain no prose. Do not change secrets, dependencies, or other files.` },
    { role: 'user', content: `Target file: ${relative}\nProblem to fix:\n${problem}\n\nCurrent file contents:\n${data.content.slice(0, 14_000)}` },
  ], { model: process.env.CODING_AI_MODEL || process.env.AI_MODEL || 'gpt-5-mini', maxTokens: 2_400, temperature: 0.1 });

  const patch = extractUnifiedDiff(answer);
  try {
    validatePatch(patch, relative);
  } catch (error) {
    return sock.sendMessage(jid, { text: `❌ The coding model did not return an applicable patch: ${error.message}\n\n${truncate(answer, 3_800)}` });
  }

  if (!parsed.apply) {
    return sock.sendMessage(jid, { text: `🧾 *Patch Preview for ${relative}*\n\n${truncate(patch, 5_300)}\n\n_To apply it, repeat with: .repo fix --apply ${relative} <same problem>_` });
  }

  try {
    await applyPatch(patch, relative);
    await sock.sendMessage(jid, { text: `✅ Patch applied to *${relative}*. Run *.repo test* to verify it.` });
  } catch (error) {
    await sock.sendMessage(jid, { text: `❌ Patch was rejected and no change was applied: ${error.message}` });
  }
}

async function runRepoWrite(args, sock, jid) {
  const parsed = parseApply(args);
  if (!parsed.apply) return sock.sendMessage(jid, { text: '❌ Direct writes require the explicit `--apply` flag. Usage: .repo write --apply <path> <content>' });
  const target = parsed.args[0];
  const content = parsed.args.slice(1).join(' ');
  if (!target || !content.trim()) return sock.sendMessage(jid, { text: '❌ Usage: .repo write --apply <path> <content>' });
  try {
    const relative = writeRepoFile(target, content);
    await sock.sendMessage(jid, { text: `✅ Wrote *${relative}*. Run *.repo test* before deploying.` });
  } catch (error) {
    await sock.sendMessage(jid, { text: `❌ Repository write failed: ${error.message}` });
  }
}

async function handleRepo(args, sock, jid) {
  try {
    const action = String(args[0] || '').toLowerCase();
    const rest = args.slice(1);
    if (!action) return sock.sendMessage(jid, { text: usage() });
    if (action === 'status') return sendRepoStatus(sock, jid);
    if (action === 'files' || action === 'ls') return sendRepoFiles(rest, sock, jid);
    if (action === 'read' || action === 'cat') return sendRepoRead(rest, sock, jid);
    if (action === 'test' || action === 'check') return sendRepoTest(sock, jid);
    if (action === 'review' || action === 'vibe') return runVibeReview(normalizeRequest(rest), sock, jid);
    if (action === 'fix' || action === 'patch') return runRepoFix(rest, sock, jid);
    if (action === 'write') return runRepoWrite(rest, sock, jid);
    return sock.sendMessage(jid, { text: usage() });
  } catch (error) {
    console.error('[workrepo] command failed:', error.stack || error.message);
    return sock.sendMessage(jid, { text: `❌ Repository operation failed: ${error.message}` });
  }
}

const repoCommands = {
  workrepo: {
    category: 'owner', reaction: '🧑‍💻', desc: 'Read, test, review, and safely modify the bot repository',
    usage: '.workrepo <status|files|read|test|review|fix|write>', aliases: ['workspace', 'repoadmin'], permissions: 'owner',
    examples: ['.workrepo status', '.workrepo read commands/assistant.js 1 180', '.workrepo test', '.workrepo fix commands/search.js handle timeout'],
    exec: ownerOnly(handleRepo),
  },
  vibe: {
    category: 'owner', reaction: '🧑‍💻', desc: 'Ask the repository-aware vibe coding assistant for a review',
    usage: '.vibe <coding request>', aliases: ['vibecode', 'coderepo'], permissions: 'owner',
    examples: ['.vibe find why the Pinterest command fails and suggest a fix'],
    exec: ownerOnly(async (args, sock, jid) => {
      try {
        return await runVibeReview(normalizeRequest(args), sock, jid);
      } catch (error) {
        console.error('[vibe] command failed:', error.stack || error.message);
        return sock.sendMessage(jid, { text: `❌ Vibe coding request failed: ${error.message}` });
      }
    }),
  },
};

repoCommands._internals = { parseApply, normalizeRequest, usage };

module.exports = repoCommands;
