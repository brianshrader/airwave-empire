/**
 * POST /api/ratings-digest — trade-journal style period recap via ShortAPI LLM (testing).
 * Body: { brief: { marketLabel, year, season, headlines[], movers[], commercialCount? } }
 * Requires SHORTAPI_KEY. Model: SHORTAPI_RATINGS_MODEL or openai/gpt-5.4-nano
 */
const SHORTAPI_CREATE_URL = 'https://api.shortapi.ai/api/v1/job/create';
const SHORTAPI_QUERY_URL = 'https://api.shortapi.ai/api/v1/job/query';
function normalizedRatingsModel() {
  let m = String(process.env.SHORTAPI_RATINGS_MODEL || 'openai/gpt-5.4-nano').trim();
  m = m.replace(/^['"]|['"]$/g, '');
  if (!m) m = 'openai/gpt-5.4-nano';
  if (/z-image|text-to-image|flux|midjourney|kling|veo|suno|music|video-to|image-to/i.test(m)) {
    console.warn('[ratings-digest] SHORTAPI_RATINGS_MODEL looks like a non-LLM model; forcing openai/gpt-5.4-nano');
    return 'openai/gpt-5.4-nano';
  }
  return m;
}

const RATINGS_MODEL = normalizedRatingsModel();

/** Extra model slugs to try if primary returns "unsupported task kind" (comma-separated env). */
function ratingsModelFallbackList() {
  const raw = String(process.env.SHORTAPI_RATINGS_FALLBACK_MODELS || 'openai/gpt-4o-mini,openai/gpt-4o');
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function ratingsModelCandidates() {
  const primary = RATINGS_MODEL;
  const out = [primary, ...ratingsModelFallbackList()];
  return [...new Set(out)];
}

const POLL_MS = 400;
const POLL_MAX_MS = 90000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return raw < 2;
  }
  const st = String(raw).toLowerCase();
  return ['pending', 'processing', 'queued', 'running', 'in_progress', 'inprogress', 'starting', '0', '1'].includes(st);
}

function jobFailedOrError(q) {
  const raw = q?.status ?? q?.state ?? q?.job_status ?? q?.data?.status ?? q?.data?.state;
  const st = raw == null || raw === '' ? '' : String(raw).toLowerCase();
  if (['failed', 'error', 'cancelled', 'canceled'].includes(st)) {
    return (
      q.data?.info ||
      q.data?.message ||
      q.data?.error ||
      q.message ||
      q.info ||
      q.error ||
      'Job failed'
    );
  }
  return null;
}

/**
 * ShortAPI LLM jobs return text in varying shapes; collect candidates and pick the best paragraph.
 * @param {unknown} root
 * @returns {string|null}
 */
function extractLlmTextFromPayload(root) {
  if (root == null) return null;
  if (typeof root === 'string' && root.trim().length > 20) return root.trim();
  if (typeof root === 'object') {
    const direct = ['text', 'output', 'content', 'response', 'message', 'result', 'completion', 'answer'].map(
      (k) => (typeof root[k] === 'string' ? root[k].trim() : null)
    );
    const best = direct.filter(Boolean).sort((a, b) => b.length - a.length)[0];
    if (best && best.length > 20) return best;
    if (root.choices && Array.isArray(root.choices) && root.choices[0]) {
      const c0 = root.choices[0];
      const msg = c0.message?.content || c0.text || c0.content;
      if (typeof msg === 'string' && msg.trim().length > 20) return msg.trim();
    }
    let longest = '';
    (function walk(o, depth) {
      if (depth > 12 || o == null) return;
      if (typeof o === 'string' && o.length > longest.length && o.trim().length > 30 && !o.startsWith('data:')) {
        longest = o.trim();
      }
      if (typeof o === 'object' && !Array.isArray(o)) {
        Object.keys(o).forEach((k) => walk(o[k], depth + 1));
      } else if (Array.isArray(o)) {
        o.forEach((x) => walk(x, depth + 1));
      }
    })(root, 0);
    if (longest.length > 40) return longest;
  }
  return null;
}

function extractTextFromQuery(lastQuery) {
  const payloadRoot =
    lastQuery?.data?.result ?? lastQuery?.result ?? lastQuery?.data?.output ?? lastQuery?.output ?? lastQuery?.data;
  let t = extractLlmTextFromPayload(payloadRoot);
  if (!t) t = extractLlmTextFromPayload(lastQuery?.data);
  if (!t) t = extractLlmTextFromPayload(lastQuery);
  return t;
}

function buildPromptFromBrief(brief) {
  const lines = [];
  lines.push('Write a trade-journal column (180–220 words) for "Radio Business Journal" about ratings competition.');
  lines.push('Tone: professional, slightly dry, industry jargon OK (AQH, PPM, cume where appropriate).');
  lines.push('Use ONLY the stations and facts below — do not invent real-world station names.');
  lines.push('No investment advice. No profanity.');
  lines.push('');
  lines.push(`Market: ${brief.marketLabel || 'Unknown'} (${brief.marketId || ''}).`);
  lines.push(`Book: ${brief.season || ''} ${brief.year || ''}.`);
  if (brief.commercialCount != null) lines.push(`Commercial stations in market: approximately ${brief.commercialCount}.`);
  lines.push('');
  lines.push('Headlines / notes from this period:');
  (brief.headlines || []).slice(0, 18).forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  lines.push('');
  lines.push('Share movers (percentage points vs prior book; game scale):');
  (brief.movers || []).slice(0, 14).forEach((m, i) => {
    lines.push(
      `${i + 1}. ${m.call} (${m.fmt}) — ${m.sharePct != null ? m.sharePct + '% share' : '?'}; Δ ${m.deltaPP != null ? (m.deltaPP >= 0 ? '+' : '') + m.deltaPP + ' pp' : 'n/a'}`
    );
  });
  lines.push('');
  lines.push('Structure: lede on market trend, 2–3 paragraphs on who gained/lost and format story, kicker on ad season or competition.');
  return lines.join('\n');
}

function shortapiCreateErrorMessage(data, res) {
  if (!data || typeof data !== 'object') return res?.statusText || 'ShortAPI create failed';
  const candidates = [
    data.data?.info,
    data.data?.message,
    data.data?.error,
    data.info,
    data.message,
    data.error,
    data.msg,
    typeof data.data === 'string' ? data.data : null,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c);
  }
  return res?.statusText || 'ShortAPI create failed';
}

/**
 * ShortAPI job/create body variants — their queue routes by model + optional category/kind.
 * Many accounts now require explicit llm+inference; others accept bare { model, args }.
 * We try (model × body shape) until one returns job_id.
 */
function shortapiCreateBodiesForModel(model, prompt) {
  const msg = [{ role: 'user', content: prompt }];
  return [
    { model, category: 'llm', kind: 'inference', args: { prompt } },
    { model, category: 'LLM', kind: 'inference', args: { prompt } },
    { model, kind: 'inference', args: { prompt } },
    { model, task: 'inference', args: { prompt } },
    { model, type: 'llm', args: { prompt } },
    { model, args: { prompt } },
    { model, category: 'llm', kind: 'inference', args: { messages: msg } },
    { model, kind: 'inference', args: { messages: msg } },
    { model, args: { messages: msg } },
    { model, category: 'llm', kind: 'chat', args: { messages: msg } },
    { model, kind: 'llm', args: { prompt } },
    { model, args: { input: prompt } },
    { model, args: { text: prompt } },
  ];
}

async function shortapiCreateLlmJob(apiKey, prompt) {
  const models = ratingsModelCandidates();
  const retryable =
    /unsupported task kind|unknown field|invalid.*kind|invalid.*model|model.*not found|not supported|no such model/i;

  let lastMsg = null;
  let lastData = null;
  let attemptIdx = 0;

  for (const model of models) {
    const bodies = shortapiCreateBodiesForModel(model, prompt);
    for (let j = 0; j < bodies.length; j++) {
      const createBody = bodies[j];
      const res = await fetch(SHORTAPI_CREATE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createBody),
      });

      const data = await res.json().catch(() => ({}));
      lastData = data;
      const msg = shortapiCreateErrorMessage(data, res);
      lastMsg = msg;

      const isLastModel = model === models[models.length - 1];
      const isLastBody = j === bodies.length - 1;
      const canRetry = !(isLastModel && isLastBody);

      if (!res.ok) {
        if (canRetry && retryable.test(String(msg))) {
          console.warn(
            '[ratings-digest] create attempt',
            attemptIdx,
            'model',
            model,
            'HTTP',
            res.status,
            String(msg).slice(0, 160)
          );
          attemptIdx++;
          continue;
        }
        const err = new Error(msg);
        err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
        throw err;
      }
      if (data.code != null && data.code !== 0) {
        if (canRetry && retryable.test(String(msg))) {
          console.warn(
            '[ratings-digest] create attempt',
            attemptIdx,
            'model',
            model,
            'code',
            data.code,
            String(msg).slice(0, 160)
          );
          attemptIdx++;
          continue;
        }
        const err = new Error(msg);
        err.status = 400;
        throw err;
      }

      const jobId = getJobIdFromResponse(data);
      if (jobId) {
        if (attemptIdx > 0 || model !== RATINGS_MODEL) {
          console.log(
            '[ratings-digest] ShortAPI create ok — model',
            model,
            'body#',
            j,
            'totalAttempts',
            attemptIdx
          );
        }
        return jobId;
      }
      if (canRetry) {
        attemptIdx++;
        continue;
      }
    }
  }

  console.error('[ratings-digest] all create attempts failed. Last JSON:', JSON.stringify(lastData).slice(0, 2500));
  const err = new Error(lastMsg || 'ShortAPI create failed');
  err.status = 502;
  throw err;
}

async function shortapiPollJobForText(apiKey, jobId) {
  const started = Date.now();
  let lastQuery = {};

  while (Date.now() - started < POLL_MAX_MS) {
    await sleep(POLL_MS);

    const qRes = await fetch(`${SHORTAPI_QUERY_URL}?id=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    lastQuery = await qRes.json().catch(() => ({}));

    if (!qRes.ok) {
      const err = new Error(lastQuery.info || lastQuery.message || 'ShortAPI query failed');
      err.status = 502;
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

    const rawStatus = lastQuery.data?.status ?? lastQuery.status ?? lastQuery.state ?? lastQuery.job_status;
    const running = shortapiJobStatusIsRunning(rawStatus);

    const text = extractTextFromQuery(lastQuery);
    if (text && !running) {
      return text;
    }
    if (text && running) {
      continue;
    }

    if (!running) {
      console.error('[ratings-digest] no text in payload:', JSON.stringify(lastQuery).slice(0, 3500));
      const err = new Error('ShortAPI job finished but LLM text not recognized');
      err.status = 502;
      throw err;
    }
  }

  const err = new Error('ShortAPI job timed out');
  err.status = 504;
  throw err;
}

async function shortapiRatingsDigestPrompt(prompt) {
  const apiKey = process.env.SHORTAPI_KEY;
  if (!apiKey) {
    const err = new Error('SHORTAPI_KEY is not set on server');
    err.status = 503;
    throw err;
  }

  const jobId = await shortapiCreateLlmJob(apiKey, prompt);
  return await shortapiPollJobForText(apiKey, jobId);
}

function mountRatingsDigest(app) {
  app.post('/api/ratings-digest', async (req, res) => {
    try {
      const brief = req.body && req.body.brief;
      if (!brief || typeof brief !== 'object') {
        return res.status(400).json({ error: 'Missing brief object' });
      }
      const prompt = buildPromptFromBrief(brief);
      const text = await shortapiRatingsDigestPrompt(prompt);
      return res.json({ ok: true, text, model: RATINGS_MODEL });
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      console.error('[ratings-digest]', e.message);
      return res.status(status).json({ ok: false, error: e.message || 'Ratings digest failed' });
    }
  });
}

module.exports = { mountRatingsDigest, buildPromptFromBrief };
