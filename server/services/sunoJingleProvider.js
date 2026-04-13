'use strict';

const SHORTAPI_CREATE_URL = 'https://api.shortapi.ai/api/v1/job/create';
const SHORTAPI_QUERY_URL = 'https://api.shortapi.ai/api/v1/job/query';

const DEFAULT_SUNO_MODEL = 'suno/suno-v5.5/generate';

const POLL_MS = 2500;
const POLL_MAX_MS = parseInt(process.env.SHORTAPI_SUNO_POLL_MAX_MS || '300000', 10) || 300000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sunoModelSlug() {
  const s = process.env.SHORTAPI_SUNO_MODEL;
  return s != null && String(s).trim() ? String(s).trim() : DEFAULT_SUNO_MODEL;
}

function sunoConfigured() {
  return !!process.env.SHORTAPI_KEY;
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

function shortapiJobStatusIsRunning(raw) {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw < 2;
  const st = String(raw).toLowerCase();
  return ['pending', 'processing', 'queued', 'running', 'in_progress', 'starting', '0', '1'].includes(st);
}

function jobFailedOrError(q) {
  const raw = q?.status ?? q?.state ?? q?.job_status ?? q?.data?.status ?? q?.data?.state;
  const st = raw == null || raw === '' ? '' : String(raw).toLowerCase();
  if (['failed', 'error', 'cancelled', 'canceled'].includes(st)) {
    return q.message || q.info || q.error || q.data?.error || 'Job failed';
  }
  return null;
}

/**
 * @param {unknown} root
 * @returns {{ url: string, title?: string, cover?: string }[]}
 */
function extractMusicsFromPayload(root) {
  const out = [];
  const seen = new Set();

  function pushFromArray(arr) {
    if (!Array.isArray(arr)) return;
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue;
      const u = typeof m.url === 'string' ? m.url.trim() : '';
      if (!u || !/^https?:\/\//i.test(u) || seen.has(u)) continue;
      seen.add(u);
      out.push({
        url: u,
        title: typeof m.title === 'string' ? m.title : undefined,
        cover: typeof m.cover === 'string' ? m.cover : undefined,
      });
    }
  }

  function walk(x, depth) {
    if (depth > 14 || x == null) return;
    if (typeof x !== 'object') return;
    if (Array.isArray(x)) {
      x.forEach((y) => walk(y, depth + 1));
      return;
    }
    if (Array.isArray(x.musics)) pushFromArray(x.musics);
    for (const k of Object.keys(x)) walk(x[k], depth + 1);
  }

  if (root && typeof root === 'object') {
    if (Array.isArray(root.musics)) pushFromArray(root.musics);
    walk(root, 0);
  }
  return out;
}

function extFromMime(ct) {
  const c = String(ct || '').toLowerCase();
  if (c.includes('mpeg') || c.includes('mp3')) return 'mp3';
  if (c.includes('wav')) return 'wav';
  if (c.includes('ogg')) return 'ogg';
  if (c.includes('mp4') || c.includes('m4a') || c.includes('aac')) return 'm4a';
  return 'mp3';
}

/**
 * Poll ShortAPI until Suno returns `musics[]` with URLs.
 * @param {Record<string, unknown>} sunoArgs
 * @returns {Promise<{ musics: { url: string, title?: string, cover?: string }[] }>}
 */
async function createAndPollSunoJingle(sunoArgs) {
  const apiKey = process.env.SHORTAPI_KEY;
  if (!apiKey) {
    const e = new Error('SHORTAPI_KEY is not set');
    e.status = 503;
    throw e;
  }

  const model = sunoModelSlug();
  const res = await fetch(SHORTAPI_CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, args: sunoArgs }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.info || data?.message || data?.error || res.statusText || 'ShortAPI job create failed';
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }
  if (data.code != null && data.code !== 0) {
    const err = new Error(String(data.info || data.message || 'ShortAPI rejected request'));
    err.status = 400;
    throw err;
  }

  const jobId = getJobIdFromResponse(data);
  if (!jobId) {
    const err = new Error('ShortAPI did not return job_id');
    err.status = 502;
    throw err;
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
      const err = new Error(lastQuery.info || lastQuery.message || 'ShortAPI job query failed');
      err.status = qRes.status >= 400 && qRes.status < 500 ? qRes.status : 502;
      throw err;
    }
    if (lastQuery.code != null && lastQuery.code !== 0) {
      const err = new Error(String(lastQuery.info || lastQuery.message || 'ShortAPI query error'));
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

    let musics = extractMusicsFromPayload(payloadRoot);
    if (!musics.length) musics = extractMusicsFromPayload(lastQuery);

    if (musics.length > 0) {
      return { musics, jobId, model };
    }

    if (!running) {
      console.error('[suno-jingle] no musics in payload:', model, JSON.stringify(lastQuery).slice(0, 3500));
      const err = new Error('ShortAPI finished but no audio URLs were returned');
      err.status = 502;
      throw err;
    }
  }

  const err = new Error('Suno jingle generation timed out');
  err.status = 504;
  throw err;
}

/**
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function downloadAudioUrl(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'FrequenciesGame/1.0' },
  });
  if (!r.ok) {
    const err = new Error(`Failed to download audio (${r.status})`);
    err.status = 502;
    throw err;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) {
    const err = new Error('Empty audio download');
    err.status = 502;
    throw err;
  }
  const ext = extFromMime(r.headers.get('content-type'));
  return { buffer: buf, ext };
}

module.exports = {
  sunoModelSlug,
  sunoConfigured,
  createAndPollSunoJingle,
  downloadAudioUrl,
  extractMusicsFromPayload,
};
