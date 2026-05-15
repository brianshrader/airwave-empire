/**
 * Station / portrait image generation: ShortAPI (z-image) or Grok / xAI.
 * Keys: SHORTAPI_KEY, GROK_API_KEY (never sent to the client).
 *
 * IMAGE_GEN_PROVIDER=shortapi | grok | auto
 *   auto (default): ShortAPI if SHORTAPI_KEY is set, else Grok if GROK_API_KEY is set.
 *
 * ShortAPI: async job create + poll (https://api.shortapi.ai).
 * Grok: synchronous xAI images/generations.
 * Logos: resized to 512×512 PNG.
 *
 * ShortAPI z-image: resolution must be exactly "1K" or "1.5K" (API-enforced). Default 1K.
 */

const sharp = require('sharp');

const XAI_IMAGES_URL = 'https://api.x.ai/v1/images/generations';
const XAI_IMAGES_EDITS_URL = 'https://api.x.ai/v1/images/edits';
const SHORTAPI_CREATE_URL = 'https://api.shortapi.ai/api/v1/job/create';
const SHORTAPI_QUERY_URL = 'https://api.shortapi.ai/api/v1/job/query';

const SHORTAPI_MODEL = process.env.SHORTAPI_IMAGE_MODEL || 'shortapi/z-image/text-to-image';

/**
 * ShortAPI only accepts resolution "1K" | "1.5K" (capital K).
 * @returns {'1K' | '1.5K'}
 */
function normalizeShortapiResolution() {
  var raw = String(process.env.SHORTAPI_RESOLUTION != null ? process.env.SHORTAPI_RESOLUTION : '1K').trim();
  var lower = raw.toLowerCase().replace(/\s/g, '');
  if (lower === '1.5k' || lower === '1_5k') return '1.5K';
  if (lower === '1k') return '1K';
  if (raw === '1K' || raw === '1.5K') return raw;
  return '1K';
}

const OUTPUT_SIZE = 512;

/** @type {import('sharp').ResizeOptions} */
const RESIZE_OPTS = { width: OUTPUT_SIZE, height: OUTPUT_SIZE, fit: 'cover', position: 'centre' };

/** Remote van art: max width for cache + UI (xAI may return 1k–2k wide). Height scales proportionally — never force a square box, which has caused horizontally “squished” vans with some PNGs. */
const VAN_MAX_EDGE = 1680;

const POLL_MS = 1500;
const POLL_MAX_MS = 120000;

/**
 * @param {Buffer} buf
 */
function looksLikeRasterBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
  var g = buf.slice(0, 6).toString('ascii');
  if (g === 'GIF87a' || g === 'GIF89a') return true;
  if (buf.slice(0, 4).toString('ascii') === 'II*\x00' || buf.slice(0, 4).toString('ascii') === 'MM\x00*') return true;
  return false;
}

/**
 * @param {string} raw
 * @returns {Buffer}
 */
function bufferFromBase64OrDataUrl(raw) {
  var s = String(raw).trim();
  var m = /^data:image\/[^;]+;base64,(.+)$/is.exec(s);
  if (m) s = m[1];
  var clean = s.replace(/\s/g, '');
  var pad = clean.length % 4;
  if (pad) clean += '='.repeat(4 - pad);
  try {
    return Buffer.from(clean, 'base64');
  } catch (_e) {
    return Buffer.from(clean, 'base64url');
  }
}

/** Keys whose string values are almost never image base64 (avoid false positives). */
const SHORTAPI_SKIP_HEURISTIC_B64 = new Set([
  'message',
  'error',
  'info',
  'description',
  'prompt',
  'model',
  'job_id',
  'id',
  'task_id',
  'status',
  'state',
  'name',
  'type',
  'request',
  'input',
  'text',
  'output',
]);

/** Minimum length for treating an arbitrary long string as possible base64 image (real outputs are much larger). */
const SHORTAPI_HEURISTIC_B64_MIN = 2800;

/**
 * Gather every https URL and prioritized base64 candidates from a ShortAPI job payload.
 * Order: explicit base64 keys first, heuristic long strings, then output/result strings (often real image but sometimes noise).
 * @param {unknown} data
 * @param {number} depth
 * @param {{ urls: string[], b64Explicit: string[], b64Heuristic: string[], b64Late: string[] }} acc
 * @param {string} [parentKey]
 */
function collectShortapiImageCandidates(data, depth, acc, parentKey) {
  if (depth == null) depth = 0;
  if (depth > 16 || data == null) return;
  parentKey = parentKey || '';

  if (typeof data === 'string') {
    const s = data.trim();
    if (/^https?:\/\//i.test(s)) {
      acc.urls.push(s);
      return;
    }
    if (!SHORTAPI_SKIP_HEURISTIC_B64.has(parentKey) && s.length >= SHORTAPI_HEURISTIC_B64_MIN) {
      if (/^[A-Za-z0-9+/=\s_-]+$/.test(s.slice(0, 512))) {
        acc.b64Heuristic.push(s.replace(/\s/g, ''));
      }
    }
    return;
  }

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      collectShortapiImageCandidates(data[i], depth + 1, acc, parentKey);
    }
    return;
  }

  if (typeof data === 'object') {
    const explicitB64Keys = [
      'b64_json',
      'image_base64',
      'base64',
      'image_b64',
      'image_data',
      'result_image',
    ];
    for (let k = 0; k < explicitB64Keys.length; k++) {
      const key = explicitB64Keys[k];
      if (Object.prototype.hasOwnProperty.call(data, key) && typeof data[key] === 'string') {
        const v = data[key].replace(/\s/g, '');
        if (v.length > 30) acc.b64Explicit.push(v);
      }
    }

    const lateB64Keys = ['output', 'result'];
    for (let li = 0; li < lateB64Keys.length; li++) {
      const lk = lateB64Keys[li];
      if (Object.prototype.hasOwnProperty.call(data, lk) && typeof data[lk] === 'string') {
        const raw = data[lk].trim();
        if (/^https?:\/\//i.test(raw)) continue;
        const v = raw.replace(/\s/g, '');
        if (v.length >= 400) acc.b64Late.push(v);
      }
    }

    if (Array.isArray(data.images)) {
      for (let j = 0; j < data.images.length; j++) {
        const el = data.images[j];
        if (typeof el === 'string') {
          const t = el.trim();
          if (/^https?:\/\//i.test(t)) acc.urls.push(t);
          else if (t.length > 30) acc.b64Explicit.push(t.replace(/\s/g, ''));
        }
      }
    }

    ['image_urls', 'urls', 'outputs'].forEach((arrKey) => {
      if (!Array.isArray(data[arrKey])) return;
      data[arrKey].forEach((el) => {
        if (typeof el === 'string' && /^https?:\/\//i.test(el.trim())) acc.urls.push(el.trim());
        else if (el && typeof el === 'object' && typeof el.url === 'string' && /^https?:\/\//i.test(el.url))
          acc.urls.push(el.url.trim());
      });
    });

    for (const key of Object.keys(data)) {
      collectShortapiImageCandidates(data[key], depth + 1, acc, key);
    }
  }
}

function dedupeStrings(arr) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (typeof s !== 'string' || !s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * If ShortAPI (or a CDN) returns JSON with a nested URL instead of raw bytes, unwrap once.
 * @param {Buffer} buf
 * @returns {Promise<Buffer | null>}
 */
async function tryBufferFromJsonImageUrl(buf, depth) {
  if (depth == null) depth = 0;
  if (depth > 5 || !Buffer.isBuffer(buf) || buf.length < 4) return null;
  var t = buf.toString('utf8').trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try {
    var parsed = JSON.parse(t);
    var acc = { urls: [], b64Explicit: [], b64Heuristic: [], b64Late: [] };
    collectShortapiImageCandidates(parsed, 0, acc);
    var urls = dedupeStrings(acc.urls);
    for (var i = 0; i < urls.length; i++) {
      var imgRes = await fetch(urls[i], { redirect: 'follow' });
      if (!imgRes.ok) continue;
      var b = Buffer.from(await imgRes.arrayBuffer());
      if (looksLikeRasterBuffer(b)) return b;
      var nested = await tryBufferFromJsonImageUrl(b, depth + 1);
      if (nested && looksLikeRasterBuffer(nested)) return nested;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Resize/covert any supported raster to 512×512 PNG for cache + UI.
 * @param {Buffer} input
 */
async function resizeToLogoPng(input) {
  if (!Buffer.isBuffer(input) || input.length < 8) {
    throw new Error('Empty or invalid image buffer');
  }
  var sniff = input.slice(0, 400).toString('utf8');
  if (/^\s*[\[{]/.test(sniff) || sniff.trim().startsWith('<!DOCTYPE') || sniff.trim().toLowerCase().startsWith('<html')) {
    throw new Error('Image payload looks like JSON or HTML, not binary image data');
  }
  try {
    return await sharp(input, { failOn: 'none', unlimited: true })
      .resize(RESIZE_OPTS)
      .png()
      .toBuffer();
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    var hex = input.slice(0, 12).toString('hex');
    throw new Error(
      msg +
        ' (len=' +
        input.length +
        ' hex=' +
        hex +
        (looksLikeRasterBuffer(input) ? '' : '; unknown magic — check API image field)')
    );
  }
}

/**
 * @returns {'shortapi' | 'grok' | null}
 */
function resolveImageProvider() {
  const explicit = String(process.env.IMAGE_GEN_PROVIDER || 'auto').toLowerCase();
  if (explicit === 'grok') {
    return process.env.GROK_API_KEY ? 'grok' : null;
  }
  if (explicit === 'shortapi') {
    return process.env.SHORTAPI_KEY ? 'shortapi' : null;
  }
  if (process.env.SHORTAPI_KEY) return 'shortapi';
  if (process.env.GROK_API_KEY) return 'grok';
  return null;
}

function imageGenerationConfigured() {
  return resolveImageProvider() != null;
}

function getActiveImageProvider() {
  return resolveImageProvider();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * ShortAPI job/query returns `data.status` as small integers: 0/1 = still in queue or processing,
 * 2+ = finished (image fields appear). String statuses use the usual English tokens.
 * @param {unknown} raw
 * @returns {boolean}
 */
function shortapiJobStatusIsRunning(raw) {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return raw < 2;
  }
  const st = String(raw).toLowerCase();
  return ['pending', 'processing', 'queued', 'running', 'in_progress', 'starting', '0', '1'].includes(st);
}

/**
 * @param {object} q
 */
function jobFailedOrError(q) {
  const raw = q?.status ?? q?.state ?? q?.job_status ?? q?.data?.status ?? q?.data?.state;
  const st = raw == null || raw === '' ? '' : String(raw).toLowerCase();
  if (['failed', 'error', 'cancelled', 'canceled'].includes(st)) {
    return q.message || q.info || q.error || q.data?.error || 'Job failed';
  }
  return null;
}

/**
 * @param {object} data
 */
function getJobIdFromResponse(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    data.job_id ||
    data.data?.job_id ||
    data.data?.id ||
    data.id ||
    (typeof data.data === 'string' ? data.data : null) ||
    null
  );
}

/**
 * @param {{ prompt: string, aspect_ratio?: string }} args
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
/**
 * Pixel width/height to pair with ShortAPI resolution (long edge ≈ 1024 for 1K, ≈1536 for 1.5K).
 * @param {string} ar
 * @param {'1K' | '1.5K'} resLabel
 */
function shortapiPixelSizeForAspect(ar, resLabel) {
  var edge = resLabel === '1.5K' ? 1536 : 1024;
  if (ar === '16:9') return { w: edge, h: Math.round((edge * 9) / 16) };
  if (ar === '9:16') return { w: Math.round((edge * 9) / 16), h: edge };
  return { w: edge, h: edge };
}

/**
 * Walk the job result, try every https URL then every base64 blob until sharp accepts one.
 * Avoids picking a single wrong "output" string before a real image_url elsewhere in the JSON.
 * @param {unknown} payloadRoot
 * @returns {Promise<Buffer | null>}
 */
async function attemptShortapiPayloadToPng(payloadRoot) {
  const acc = { urls: [], b64Explicit: [], b64Heuristic: [], b64Late: [] };
  collectShortapiImageCandidates(payloadRoot, 0, acc);
  const urls = dedupeStrings(acc.urls);
  const b64s = dedupeStrings(acc.b64Explicit.concat(acc.b64Heuristic).concat(acc.b64Late));

  for (let i = 0; i < urls.length; i++) {
    try {
      const imgRes = await fetch(urls[i], { redirect: 'follow' });
      if (!imgRes.ok) continue;
      let buffer = Buffer.from(await imgRes.arrayBuffer());
      const ct = (imgRes.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json') || (buffer.length > 0 && buffer[0] === 0x7b)) {
        const unwrapped = await tryBufferFromJsonImageUrl(buffer);
        if (unwrapped && looksLikeRasterBuffer(unwrapped)) buffer = unwrapped;
        else continue;
      } else if (!looksLikeRasterBuffer(buffer)) {
        const unwrapped = await tryBufferFromJsonImageUrl(buffer);
        if (unwrapped && looksLikeRasterBuffer(unwrapped)) buffer = unwrapped;
        else continue;
      }
      return await resizeToLogoPng(buffer);
    } catch (_e) {
      continue;
    }
  }

  for (let j = 0; j < b64s.length; j++) {
    try {
      let buffer = bufferFromBase64OrDataUrl(b64s[j]);
      if (!looksLikeRasterBuffer(buffer)) {
        const unwrapped = await tryBufferFromJsonImageUrl(buffer);
        if (unwrapped && looksLikeRasterBuffer(unwrapped)) buffer = unwrapped;
      }
      if (!looksLikeRasterBuffer(buffer)) continue;
      return await resizeToLogoPng(buffer);
    } catch (_e) {
      continue;
    }
  }
  return null;
}

async function generateShortapiImage({ prompt, aspect_ratio = '1:1' }) {
  const apiKey = process.env.SHORTAPI_KEY;
  if (!apiKey) {
    const err = new Error('SHORTAPI_KEY is not set');
    err.status = 503;
    throw err;
  }

  var ar = '1:1';
  if (aspect_ratio === '16:9') ar = '16:9';
  else if (aspect_ratio === '9:16') ar = '9:16';

  var resLabel = normalizeShortapiResolution();
  var wh = shortapiPixelSizeForAspect(ar, resLabel);

  const createBody = {
    model: SHORTAPI_MODEL,
    args: {
      prompt,
      aspect_ratio: ar,
      resolution: resLabel,
      width: wh.w,
      height: wh.h,
    },
  };

  const res = await fetch(SHORTAPI_CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[shortapi-image] create', res.status, JSON.stringify(data).slice(0, 2000));
    const msg = data?.info || data?.message || data?.error || res.statusText || 'ShortAPI job create failed';
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }
  if (data.code != null && data.code !== 0) {
    const msg = data.info || data.message || 'ShortAPI rejected request';
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }

  const jobId = getJobIdFromResponse(data);
  if (!jobId) {
    console.error('[shortapi-image] unexpected create body:', JSON.stringify(data).slice(0, 1500));
    throw new Error('ShortAPI did not return job_id');
  }

  const started = Date.now();
  let lastQuery = {};

  while (Date.now() - started < POLL_MAX_MS) {
    await sleep(POLL_MS);

    const qRes = await fetch(`${SHORTAPI_QUERY_URL}?id=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    lastQuery = await qRes.json().catch(() => ({}));

    if (!qRes.ok) {
      console.error('[shortapi-image] query', qRes.status, JSON.stringify(lastQuery).slice(0, 1500));
      const err = new Error(lastQuery.info || lastQuery.message || 'ShortAPI job query failed');
      err.status = qRes.status >= 400 && qRes.status < 500 ? qRes.status : 502;
      throw err;
    }

    if (lastQuery.code != null && lastQuery.code !== 0) {
      const msg = lastQuery.info || lastQuery.message || 'ShortAPI job query error';
      const err = new Error(String(msg));
      err.status = 502;
      throw err;
    }

    const failMsg = jobFailedOrError(lastQuery);
    if (failMsg) {
      const err = new Error(String(failMsg));
      err.status = 502;
      throw err;
    }

    const rawStatus =
      lastQuery.data?.status ?? lastQuery.status ?? lastQuery.state ?? lastQuery.job_status;
    const running = shortapiJobStatusIsRunning(rawStatus);

    const payloadRoot =
      lastQuery.result ?? lastQuery.output ?? lastQuery.data?.result ?? lastQuery.data ?? lastQuery;

    let png = await attemptShortapiPayloadToPng(payloadRoot);
    if (!png) {
      png = await attemptShortapiPayloadToPng(lastQuery);
    }
    if (png) {
      return { buffer: png, ext: 'png' };
    }

    if (running) {
      continue;
    }

    console.error('[shortapi-image] no image in payload:', JSON.stringify(lastQuery).slice(0, 2500));
    throw new Error('ShortAPI job finished but image payload not recognized');
  }

  throw new Error('ShortAPI job timed out');
}

/**
 * @param {{ prompt: string, aspect_ratio?: string }} args
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function generateGrokImage({ prompt, aspect_ratio = '1:1' }) {
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
    buffer = await resizeToLogoPng(buffer);
  } catch (e) {
    const wrap = new Error(e.message || String(e));
    wrap.status = 502;
    throw wrap;
  }

  return { buffer, ext: 'png' };
}

/**
 * Grok Imagine: edit / compose from a source image (reference logo → scene).
 * @param {{ prompt: string, sourcePngBuffer: Buffer, aspect_ratio?: string, resolution?: string }} args
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function generateGrokImageEdit({ prompt, sourcePngBuffer, aspect_ratio = '16:9', resolution = '1k' }) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    const err = new Error('GROK_API_KEY is not set');
    err.status = 503;
    throw err;
  }
  if (!Buffer.isBuffer(sourcePngBuffer) || sourcePngBuffer.length < 32) {
    const err = new Error('Reference logo image is missing or invalid');
    err.status = 400;
    throw err;
  }

  const dataUri = `data:image/png;base64,${sourcePngBuffer.toString('base64')}`;
  const body = {
    model: 'grok-imagine-image',
    prompt,
    image: {
      url: dataUri,
      type: 'image_url',
    },
    n: 1,
    aspect_ratio,
    resolution: resolution === '2k' ? '2k' : '1k',
    response_format: 'b64_json',
  };

  const res = await fetch(XAI_IMAGES_EDITS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('[xai-image-edit]', res.status, JSON.stringify(data).slice(0, 2000));
    const msg = data?.error?.message || data?.message || res.statusText || 'xAI image edit error';
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }

  const item = data?.data?.[0];
  if (!item) {
    throw new Error('No image in Grok edit response');
  }

  let buffer;
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`Failed to download edited image URL (${imgRes.status})`);
    }
    buffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error('Grok edit returned neither b64_json nor url');
  }

  try {
    buffer = await sharp(buffer, { failOn: 'none', unlimited: true })
      .rotate()
      .resize({
        width: VAN_MAX_EDGE,
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (e) {
    const wrap = new Error(e.message || String(e));
    wrap.status = 502;
    throw wrap;
  }

  return { buffer, ext: 'png' };
}

function grokImageEditConfigured() {
  return !!process.env.GROK_API_KEY;
}

/**
 * @param {{ prompt: string, aspect_ratio?: string }} args
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function generateXaiImage(args) {
  const p = resolveImageProvider();
  if (!p) {
    const err = new Error('No image API configured: set SHORTAPI_KEY and/or GROK_API_KEY (IMAGE_GEN_PROVIDER=shortapi|grok|auto)');
    err.status = 503;
    throw err;
  }
  if (p === 'shortapi') return generateShortapiImage(args);
  return generateGrokImage(args);
}

/** @param {{ prompt: string }} args */
async function generateStationLogo({ prompt }) {
  return generateXaiImage({ prompt, aspect_ratio: '1:1' });
}

module.exports = {
  generateXaiImage,
  generateStationLogo,
  generateShortapiImage,
  generateGrokImage,
  generateGrokImageEdit,
  grokImageEditConfigured,
  resolveImageProvider,
  imageGenerationConfigured,
  getActiveImageProvider,
};
