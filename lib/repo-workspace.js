'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = path.resolve(process.env.REPO_WORKSPACE || process.cwd());
const MAX_FILE_BYTES = Number(process.env.REPO_MAX_FILE_BYTES) || 180_000;
const MAX_CONTEXT_CHARS = Number(process.env.REPO_MAX_CONTEXT_CHARS) || 11_000;
const MAX_OUTPUT_CHARS = 6_000;
const BLOCKED_NAMES = /(^|\/)(\.env(?:\.|$)|\.secrets\.enc\.json(?:\.|$)|auth_info_baileys|\.git(?:\/|$)|node_modules(?:\/|$)|.*\.pem$|.*\.key$|.*\.p12$)/i;

function truncate(value, limit = MAX_OUTPUT_CHARS) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}\n…[output truncated]` : text;
}

function relativeWorkspacePath(input = '.') {
  const raw = String(input || '.').trim().replace(/^['"]|['"]$/g, '');
  const candidate = raw || '.';
  const absolute = path.resolve(WORKSPACE_ROOT, candidate);
  const relative = path.relative(WORKSPACE_ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path must stay inside the configured repository workspace');
  if (BLOCKED_NAMES.test(relative)) throw new Error('That path is protected and cannot be accessed');
  return relative || '.';
}

function absoluteWorkspacePath(input = '.') {
  const candidate = path.resolve(WORKSPACE_ROOT, relativeWorkspacePath(input));
  const root = fs.realpathSync(WORKSPACE_ROOT);
  let probe = candidate;
  const suffix = [];
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    suffix.unshift(path.basename(probe));
    probe = parent;
  }
  const resolved = path.resolve(fs.realpathSync(probe), ...suffix);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path resolves outside the configured repository workspace');
  }
  return candidate;
}

function assertRegularFile(relativePath) {
  const absolute = absoluteWorkspacePath(relativePath);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error('The requested path is not a regular file');
  if (stat.size > MAX_FILE_BYTES) throw new Error(`File is too large (limit ${MAX_FILE_BYTES} bytes)`);
  return { absolute, stat };
}

function readRepoFile(input, startLine = 1, endLine = null) {
  const relative = relativeWorkspacePath(input);
  const { absolute } = assertRegularFile(relative);
  const content = fs.readFileSync(absolute, 'utf8');
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.min(lines.length, Number(endLine) || Math.min(lines.length, start + 220));
  const body = lines.slice(start - 1, end).map((line, index) => `${String(start + index).padStart(4, ' ')} | ${line}`).join('\n');
  return { relative, start, end, totalLines: lines.length, content, body };
}

function writeRepoFile(input, content) {
  const relative = relativeWorkspacePath(input);
  if (relative === '.') throw new Error('A file path is required');
  const value = String(content || '');
  if (!value.trim()) throw new Error('File content cannot be empty');
  if (Buffer.byteLength(value, 'utf8') > MAX_FILE_BYTES) throw new Error(`Content is too large (limit ${MAX_FILE_BYTES} bytes)`);
  const absolute = absoluteWorkspacePath(relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, absolute);
  return relative;
}

async function runCommand(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: WORKSPACE_ROOT,
      timeout: options.timeout || 120_000,
      maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
    });
    return { code: 0, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || ''),
      timedOut: error.killed === true,
    };
  }
}

async function listRepoFiles() {
  const result = await runCommand('git', ['ls-files', '-co', '--exclude-standard'], { timeout: 30_000 });
  if (result.code === 0) {
    return result.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      .filter(file => !BLOCKED_NAMES.test(file)).slice(0, 700);
  }
  const output = [];
  function walk(dir, prefix = '') {
    if (output.length >= 700) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (BLOCKED_NAMES.test(rel)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) output.push(rel);
      if (output.length >= 700) return;
    }
  }
  walk(WORKSPACE_ROOT);
  return output;
}

async function getRepoStatus() {
  const status = await runCommand('git', ['status', '--short', '--branch'], { timeout: 30_000 });
  const diff = await runCommand('git', ['diff', '--stat'], { timeout: 30_000 });
  return truncate([status.stdout || status.stderr, diff.stdout].filter(Boolean).join('\n'), 5_500);
}

function chooseContextFiles(files, request) {
  const text = String(request || '').toLowerCase();
  const scored = files.map(file => {
    const lower = file.toLowerCase();
    let score = 0;
    if (text.includes(lower)) score += 100;
    const tokens = text.split(/[^a-z0-9_./-]+/).filter(token => token.length > 2);
    score += tokens.filter(token => lower.includes(token)).length * 10;
    if (['package.json', 'readme.md', 'main.js'].includes(lower)) score += 3;
    if (/\.(js|ts|json|md|py|go|java|rb|php|css|html)$/.test(lower)) score += 1;
    return { file, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, 8).map(item => item.file);
}

async function buildRepoContext(request) {
  const files = await listRepoFiles();
  const selected = chooseContextFiles(files, request);
  const sections = [`Repository workspace: ${WORKSPACE_ROOT}`, `Files:\n${files.slice(0, 240).join('\n')}`];
  const status = await getRepoStatus();
  if (status) sections.push(`Git status:\n${status}`);
  for (const file of selected) {
    try {
      const data = readRepoFile(file, 1, 180);
      sections.push(`File: ${file}\n${data.body}`);
    } catch (error) {
      sections.push(`File: ${file}\n[unavailable: ${error.message}]`);
    }
  }
  return truncate(sections.join('\n\n'), MAX_CONTEXT_CHARS);
}

async function runProjectTests() {
  let packageJson = null;
  try { packageJson = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf8')); } catch {}
  const testScript = packageJson?.scripts?.test;
  if (testScript) {
    const result = await runCommand('npm', ['test'], { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
    return { strategy: 'npm test', ...result, output: truncate([result.stdout, result.stderr].filter(Boolean).join('\n'), 5_500) };
  }

  const files = (await listRepoFiles()).filter(file => /(?:^|\/)(?:test|tests)\/.*\.test\.js$|\.test\.js$/i.test(file)).slice(0, 40);
  if (files.length) {
    const results = [];
    for (const file of files) {
      const result = await runCommand('node', [file], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
      results.push(`${file}: ${result.code === 0 ? 'PASS' : 'FAIL'}\n${truncate([result.stdout, result.stderr].filter(Boolean).join('\n'), 1_000)}`);
      if (result.code !== 0) return { strategy: 'node test files', code: result.code, output: results.join('\n\n') };
    }
    return { strategy: 'node test files', code: 0, output: results.join('\n\n') };
  }

  const jsFiles = (await listRepoFiles()).filter(file => file.endsWith('.js')).slice(0, 80);
  const results = [];
  for (const file of jsFiles) {
    const result = await runCommand('node', ['--check', file], { timeout: 30_000, maxBuffer: 1 * 1024 * 1024 });
    results.push(`${file}: ${result.code === 0 ? 'PASS' : 'FAIL'}`);
    if (result.code !== 0) return { strategy: 'node --check', code: result.code, output: `${results.join('\n')}\n${truncate(result.stderr, 2_000)}` };
  }
  return { strategy: 'node --check', code: 0, output: results.join('\n') || 'No JavaScript files found.' };
}

function extractUnifiedDiff(text) {
  const raw = String(text || '').replace(/\r/g, '');
  const fenced = raw.match(/```(?:diff|patch)?\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('diff --git ');
  const altStart = candidate.indexOf('--- a/');
  if (start >= 0) return candidate.slice(start).trim();
  if (altStart >= 0) return candidate.slice(altStart).trim();
  return '';
}

function validatePatch(patch, targetFile) {
  const normalizedTarget = relativeWorkspacePath(targetFile);
  if (!patch || !/^--- (?:a\/[^\n]+|\/dev\/null)\n\+\+\+ (?:b\/[^\n]+|\/dev\/null)/m.test(patch)) {
    throw new Error('The AI response did not contain a valid unified diff');
  }
  const paths = [...patch.matchAll(/^(?:---|\+\+\+) (?:a\/|b\/)?([^\n]+)$/gm)]
    .map(match => match[1].trim().split('\t')[0]).filter(file => file !== '/dev/null');
  if (!paths.length || paths.some(file => relativeWorkspacePath(file) !== normalizedTarget)) {
    throw new Error('Patch is restricted to the requested target file');
  }
  if (!patch.includes('diff --git ') && !patch.includes('@@ ')) throw new Error('Patch has no hunks');
  return patch;
}

async function applyPatch(patch, targetFile) {
  const validated = validatePatch(patch, targetFile);
  const temp = path.join(WORKSPACE_ROOT, `.vegas-patch-${process.pid}-${Date.now()}.diff`);
  fs.writeFileSync(temp, validated, { mode: 0o600 });
  try {
    const check = await runCommand('git', ['apply', '--check', '--whitespace=nowarn', temp], { timeout: 30_000 });
    if (check.code !== 0) throw new Error(`Patch check failed: ${truncate(check.stderr || check.stdout, 1_500)}`);
    const applied = await runCommand('git', ['apply', '--whitespace=nowarn', temp], { timeout: 30_000 });
    if (applied.code !== 0) throw new Error(`Patch apply failed: ${truncate(applied.stderr || applied.stdout, 1_500)}`);
    return relativeWorkspacePath(targetFile);
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

module.exports = {
  WORKSPACE_ROOT,
  MAX_FILE_BYTES,
  MAX_CONTEXT_CHARS,
  relativeWorkspacePath,
  absoluteWorkspacePath,
  readRepoFile,
  writeRepoFile,
  listRepoFiles,
  getRepoStatus,
  buildRepoContext,
  runProjectTests,
  runCommand,
  truncate,
  extractUnifiedDiff,
  validatePatch,
  applyPatch,
};
