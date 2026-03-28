/**
 * Grok / xAI image generation (logos, portraits, etc.).
 * Uses GROK_API_KEY (never sent to the client).
 *
 * xAI image API (see REST reference): `resolution` is "1k"|"2k"; `aspect_ratio` controls layout.
 * Only send fields xAI documents (model, prompt, n, aspect_ratio, resolution, response_format).
 * Omit OpenAI-only fields like `size` and `quality` — they trigger 400 Bad Request.
 * Exact 512×512 output is enforced with sharp after decode.
 */

const sharp = require('sharp');

const XAI_IMAGES_URL = 'https://api.x.ai/v1/images/generations';

const OUTPUT_SIZE = 512;

/** @type {import('sharp').ResizeOptions} */
const RESIZE_OPTS = { width: OUTPUT_SIZE, height: OUTPUT_SIZE, fit: 'cover', position: 'centre' };

/**
 * @param {{ prompt: string, aspect_ratio?: string }} args
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function generateXaiImage({ prompt, aspect_ratio = '1:1' }) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY is not set');
  }

  const body = {
    model: 'grok-imagine-image',
    prompt,
    n: 1,
    aspect_ratio,
    resolution: '1k',
    response_format: 'b64_json',
  };

  const res = await fetch(XAI_IMAGES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('[xai-image]', res.status, JSON.stringify(data).slice(0, 2000));
    const msg = data?.error?.message || data?.message || res.statusText || 'xAI image error';
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }

  const item = data?.data?.[0];
  if (!item) {
    throw new Error('No image in Grok response');
  }

  let buffer;
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`Failed to download image URL (${imgRes.status})`);
    }
    buffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error('Grok returned neither b64_json nor url');
  }

  try {
    buffer = await sharp(buffer).resize(RESIZE_OPTS).png().toBuffer();
  } catch (e) {
    const wrap = new Error(`Image post-process failed: ${e.message || e}`);
    wrap.status = 502;
    throw wrap;
  }

  return { buffer, ext: 'png' };
}

/** @param {{ prompt: string }} args */
async function generateStationLogo({ prompt }) {
  return generateXaiImage({ prompt, aspect_ratio: '1:1' });
}

module.exports = { generateXaiImage, generateStationLogo };
