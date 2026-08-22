'use strict';

const axios = require('axios');
const { downloadMedia, MAX_IMAGE_BYTES } = require('./david-cyril-api');

const DEFAULT_ENDPOINT = 'https://api.zstlab.cyou/api/v1/ai/deepai-v2/image';

function getEndpoint() {
  return process.env.ZST_IMAGE_API_URL || DEFAULT_ENDPOINT;
}

function collectImageUrls(payload) {
  const data = payload?.data || payload?.result || payload || {};
  const preferred = [
    ...(Array.isArray(data.imageUrls) ? data.imageUrls : []),
    ...(Array.isArray(data.images) ? data.images : []),
  ];
  return [...new Set(preferred.map(value => String(value || '').trim()).filter(value => /^https:\/\//i.test(value)))];
}

async function generateZstImage(prompt) {
  const headers = {
    'User-Agent': 'Vegas-MD/3.0',
    Accept: 'application/json',
  };
  if (process.env.ZST_API_KEY) headers['x-api-key'] = process.env.ZST_API_KEY;
  const response = await axios.get(getEndpoint(), {
    params: { prompt },
    timeout: Number(process.env.ZST_IMAGE_TIMEOUT_MS || 90_000),
    headers,
  });
  const payload = response.data;
  if (payload?.status === false || payload?.data?.success === false) {
    throw new Error(String(payload?.message || payload?.data?.message || 'ZST image generation failed'));
  }
  const imageUrl = collectImageUrls(payload)[0];
  if (!imageUrl) throw new Error('ZST image API returned no image URL');
  return downloadMedia(imageUrl, {
    maxBytes: Number(process.env.IMAGE_MAX_BYTES) || MAX_IMAGE_BYTES,
    timeout: 90_000,
  });
}

module.exports = { DEFAULT_ENDPOINT, collectImageUrls, generateZstImage };
