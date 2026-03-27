/**
 * Grok / xAI image generation for station logos.
 * Uses GROK_API_KEY (never sent to the client).
 */

const XAI_IMAGES_URL = 'https://api.x.ai/v1/images/generations';

/**
 * @param {{ prompt: string }} args
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function generateStationLogo({ prompt }) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY is not set');
  }

  const res = await fetch(XAI_IMAGES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-imagine-image',
      prompt,
      n: 1,
      aspect_ratio: '1:1',
      quality: 'medium',
      resolution: '1k',
      // Prefer inline bytes; still handle URL responses if the API omits b64.
      response_format: 'b64_json',
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || res.statusText || 'xAI image error';
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }

  const item = data?.data?.[0];
  if (!item) {
    throw new Error('No image in Grok response');
  }

  if (item.b64_json) {
    const buffer = Buffer.from(item.b64_json, 'base64');
    const ext = mimeToExt(item.mime_type) || inferExtFromBuffer(buffer);
    return { buffer, ext };
  }

  if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`Failed to download image URL (${imgRes.status})`);
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const ct = imgRes.headers.get('content-type') || '';
    const ext = mimeToExt(ct) || mimeToExt(item.mime_type) || 'png';
    return { buffer, ext };
  }

  throw new Error('Grok returned neither b64_json nor url');
}

function mimeToExt(mime) {
  if (!mime || typeof mime !== 'string') return null;
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return null;
}

function inferExtFromBuffer(buf) {
  if (!buf || buf.length < 12) return 'png';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  return 'png';
}

module.exports = { generateStationLogo };
