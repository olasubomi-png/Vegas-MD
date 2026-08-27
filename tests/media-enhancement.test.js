'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const tools = require('../commands/tools');

function tmp(name) {
  return path.join(os.tmpdir(), `vegas_media_test_${process.pid}_${Date.now()}_${name}`);
}

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${binary} failed: ${(result.stderr || result.stdout || '').slice(-400)}`);
  return result.stdout;
}

function dimensions(file) {
  const output = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]).trim();
  return output.split('x').map(Number);
}

async function runTest() {
  assert.match(tools._internals.imageQualityFilter('enhance'), /iw\*4/);
  assert.match(tools._internals.imageQualityFilter('enhance'), /lanczos/);
  assert.match(tools._internals.videoQualityFilter(), /iw\*2/);
  assert.match(tools._internals.videoQualityFilter(), /hqdn3d/);
  assert.ok(tools.enhancevideo, 'dedicated HD video command must be registered');
  assert.ok(tools.enhance, 'generic enhancement command must remain registered');

  const inputImage = tmp('input.jpg');
  const inputVideo = tmp('input.mp4');
  try {
    run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=48x32:rate=1', '-frames:v', '1', inputImage]);
    const enhancedImage = await tools._internals.enhanceLocal(fs.readFileSync(inputImage), 'upscale');
    const outputImage = tmp('output.jpg');
    fs.writeFileSync(outputImage, enhancedImage);
    assert.deepStrictEqual(dimensions(outputImage), [192, 128], 'image fallback should upscale a small source by 4×');
    assert.ok(tools._internals.validImageOutput(enhancedImage));

    run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=12', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', inputVideo]);
    const enhancedVideo = await tools._internals.enhanceVideoLocal(fs.readFileSync(inputVideo));
    const outputVideo = tmp('output.mp4');
    fs.writeFileSync(outputVideo, enhancedVideo);
    const [width, height] = dimensions(outputVideo);
    assert.ok(width >= 64 && height >= 36, 'enhanced video must not reduce the source dimensions');
    assert.deepStrictEqual([width, height], [128, 72], 'small video should be enlarged up to 2×');
    assert.ok(enhancedVideo.length >= 1_000, 'enhanced video should be a non-empty MP4 buffer');
    fs.unlinkSync(outputImage);
    fs.unlinkSync(outputVideo);
  } finally {
    for (const file of [inputImage, inputVideo]) {
      try { fs.unlinkSync(file); } catch (_) {}
    }
  }

  console.log('Media enhancement regression tests passed.');
}

runTest().catch(error => {
  console.error(error);
  process.exit(1);
});
