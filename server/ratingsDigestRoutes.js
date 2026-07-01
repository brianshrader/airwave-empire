'use strict';

const { posthog } = require('./posthog');
const { verifyClerkBearer } = require('./clerkVerify');
const { verifyGuestToken } = require('./guestJwt');
const { resolveStripePlanForUser } = require('./stripePlanResolve');
const { CLERK_PLAN, digestMonthlyLimitForPlan } = require('./aiEntitlements');
const { tryConsume, refundOne } = require('./aiUsageStore');
const guestAiUsage = require('./guestAiUsageStore');

/**
 * Trade-press style ratings digest via ShortAPI LLM (job/create + job/query, same transport as images).
 * POST /api/ratings-digest — body: { payload: { market, periodLabel, year, period, book: [{ rank, call, brand?, format, sharePct, deltaPts, band }], marketContext?: string[] } }
 * Optional `Authorization: Bearer` (Clerk): trial + Starter → advanced insights; Pro → elite (extended); free_user / unsigned → standard column.
 * Monthly digest quotas (UTC month) enforced for signed-in users; guest tokens get a lifetime cap; unsigned requests rely on IP rate limit only.
 * GET  /api/ratings-digest/status — { configured, model }
 *
 * Env: SHORTAPI_KEY and/or OPENROUTER_API_KEY and/or OPENAI_API_KEY; digest model vars below.
 * RATINGS_DIGEST_PROVIDER=auto|shortapi|openrouter|openai (default auto: OpenRouter → OpenAI if set; ShortAPI digest only if no OpenRouter key, or after OR failure when RATINGS_DIGEST_FALLBACK_SHORTAPI=1).
 *
 * ShortAPI: same key as images; if job/create returns "invalid model" for every slug, your key likely has no LLM
 * queue access — ask ShortAPI support which model IDs and product tier enable chat jobs.
 * OpenRouter: OpenAI-compatible chat (https://openrouter.ai/) — recommended for digest when ShortAPI LLM jobs are unavailable.
 */

const SHORTAPI_CREATE_URL = 'https://api.shortapi.ai/api/v1/job/create';
const SHORTAPI_QUERY_URL = 'https://api.shortapi.ai/api/v1/job/query';
const POLL_MS = 1200;
const POLL_MAX_MS = 90000;

/** Primary slug when SHORTAPI_DIGEST_MODEL is unset (see shortapi.ai/models — language / chat). */
const DEFAULT_DIGEST_MODEL = 'openai/gpt-5.4-mini/chat';

/** Tried after the resolved primary when job/create reports an invalid/disabled model (same `args.messages` shape). */
const DIGEST_MODEL_FALLBACKS = [
  'openai/gpt-5.4-nano/chat',
  'openai/gpt-4o/chat',
  'deepseek/deepseek-v3.2/chat',
];

/** ShortAPI chat models use …/chat. Legacy GPT-4o mini slugs often fail job/create even if docs pages still exist. */
function resolveDigestModel(envVal) {
  const s = envVal != null && String(envVal).trim() ? String(envVal).trim() : DEFAULT_DIGEST_MODEL;
  if (s === 'openai/gpt-4o-mini' || s === 'openai/gpt-4o-mini/chat') return DEFAULT_DIGEST_MODEL;
  return s;
}

function digestModelCandidates() {
  const primary = resolveDigestModel(process.env.SHORTAPI_DIGEST_MODEL);
  const out = [];
  const seen = new Set();
  function add(m) {
    if (!m || seen.has(m)) return;
    seen.add(m);
    out.push(m);
  }
  add(primary);
  for (const f of DIGEST_MODEL_FALLBACKS) add(f);
  return out;
}

function isInvalidModelShortapiError(message) {
  const m = String(message || '').toLowerCase();
  return m.includes('invalid model') || m.includes('unknown model') || m.includes('model not found');
}

const RATE_WINDOW_MS = 60 * 60 * 1000;
const digestRateMap = new Map();

/** Max digest POSTs per client IP per rolling hour. Set to 0 for unlimited (local dev only). Env: RATINGS_DIGEST_MAX_PER_HOUR */
function digestRateLimitPerHour() {
  const raw = process.env.RATINGS_DIGEST_MAX_PER_HOUR;
  if (raw == null || String(raw).trim() === '') return 120;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return 120;
  if (n <= 0) return 0;
  return Math.min(2000, n);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 80);
  return String(req.socket?.remoteAddress || req.ip || '').slice(0, 80) || 'unknown';
}

function allowDigestRate(ip) {
  const max = digestRateLimitPerHour();
  if (max <= 0) return true;
  const now = Date.now();
  let e = digestRateMap.get(ip);
  if (!e || now > e.reset) {
    e = { n: 0, reset: now + RATE_WINDOW_MS };
    digestRateMap.set(ip, e);
  }
  if (e.n >= max) return false;
  e.n += 1;
  return true;
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

function extractTextFromShortapiPayload(root) {
  if (root == null) return '';
  if (typeof root === 'string') {
    const t = root.trim();
    if (t.length > 80 && !/^[\[{<!]/i.test(t)) return t;
    return '';
  }
  if (typeof root !== 'object') return '';
  const tryStr = (v) => (typeof v === 'string' && v.trim().length > 40 ? v.trim() : '');
  const direct = [
    tryStr(root.text),
    tryStr(root.content),
    tryStr(root.output),
    tryStr(root.message),
    tryStr(root.result),
    tryStr(root.response),
    tryStr(root.data?.text),
    tryStr(root.data?.content),
    tryStr(root.data?.output),
    tryStr(root.choices?.[0]?.message?.content),
    tryStr(root.choices?.[0]?.text),
  ].filter(Boolean);
  if (direct.length) return direct[0];

  let best = '';
  function walk(x, depth) {
    if (depth > 14 || x == null) return;
    if (typeof x === 'string') {
      const t = x.trim();
      if (
        t.length > best.length &&
        t.length > 70 &&
        !/^[\[{]/.test(t) &&
        !/job_id/i.test(t)
      ) {
        best = t;
      }
      return;
    }
    if (typeof x !== 'object') return;
    if (Array.isArray(x)) {
      x.forEach((y) => walk(y, depth + 1));
      return;
    }
    for (const k of Object.keys(x)) walk(x[k], depth + 1);
  }
  walk(root, 0);
  return best.trim();
}

async function shortapiCreateChatJob(apiKey, model, messages, max_tokens, temperature) {
  const createBody = {
    model,
    args: {
      messages,
      max_tokens,
      temperature,
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
    const msg = data?.info || data?.message || data?.error || res.statusText || 'ShortAPI create failed';
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
  return jobId;
}

async function shortapiPollChatJobForText(apiKey, jobId, modelUsed) {
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

    const rawStatus = lastQuery.data?.status ?? lastQuery.status ?? lastQuery.state ?? lastQuery.job_status;
    const running = shortapiJobStatusIsRunning(rawStatus);
    const payloadRoot =
      lastQuery.result ?? lastQuery.output ?? lastQuery.data?.result ?? lastQuery.data ?? lastQuery;

    let text = extractTextFromShortapiPayload(payloadRoot);
    if (text && text.length > 40) return text;
    text = extractTextFromShortapiPayload(lastQuery);
    if (text && text.length > 40) return text;

    if (!running) {
      console.error('[ratings-digest] no text in job payload:', modelUsed, JSON.stringify(lastQuery).slice(0, 4000));
      const err = new Error(
        'ShortAPI returned no article text — pick a chat model from ShortAPI’s model list and set SHORTAPI_DIGEST_MODEL (see server logs).'
      );
      err.status = 502;
      throw err;
    }
  }
  const err = new Error('ShortAPI digest timed out');
  err.status = 504;
  throw err;
}

async function shortapiChatComplete(messages) {
  const apiKey = process.env.SHORTAPI_KEY;
  if (!apiKey) {
    const e = new Error('SHORTAPI_KEY is not configured on the server');
    e.status = 503;
    throw e;
  }
  const max_tokens = Math.min(2048, parseInt(process.env.SHORTAPI_DIGEST_MAX_TOKENS || '900', 10) || 900);
  const temperature = Math.min(1.5, Math.max(0, parseFloat(process.env.SHORTAPI_DIGEST_TEMPERATURE || '0.65') || 0.65));

  const candidates = digestModelCandidates();
  let lastErr = null;

  for (const model of candidates) {
    try {
      const jobId = await shortapiCreateChatJob(apiKey, model, messages, max_tokens, temperature);
      if (model !== candidates[0]) {
        console.warn('[ratings-digest] using fallback ShortAPI chat model:', model);
      }
      return await shortapiPollChatJobForText(apiKey, jobId, model);
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (isInvalidModelShortapiError(msg) && candidates.indexOf(model) < candidates.length - 1) {
        console.warn('[ratings-digest] ShortAPI rejected model, trying next:', model, msg);
        continue;
      }
      throw e;
    }
  }

  throw lastErr || new Error('ShortAPI digest failed');
}

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

async function openaiDigestChatComplete(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const e = new Error('OPENAI_API_KEY is not configured on the server');
    e.status = 503;
    throw e;
  }
  const model = (process.env.OPENAI_DIGEST_MODEL || 'gpt-4o-mini').trim();
  const max_tokens = Math.min(2048, parseInt(process.env.SHORTAPI_DIGEST_MAX_TOKENS || '900', 10) || 900);
  const temperature = Math.min(1.5, Math.max(0, parseFloat(process.env.SHORTAPI_DIGEST_TEMPERATURE || '0.65') || 0.65));

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || res.statusText || 'OpenAI chat failed';
    const err = new Error(msg);
    err.status = res.status === 401 || res.status === 403 ? 502 : res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    const err = new Error('OpenAI returned no article text');
    err.status = 502;
    throw err;
  }
  return text.trim();
}

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * OpenRouter model ids differ from ShortAPI (no …/chat suffix). Copy slugs from https://openrouter.ai/models
 * Suffixes like `:free` are valid (OpenRouter free-tier route) — do not strip them.
 */
function normalizeOpenRouterDigestModel(raw) {
  let m = String(raw || '').trim();
  if (!m) m = 'openai/gpt-4o-mini';
  if (m.endsWith('/chat')) m = m.slice(0, -'/chat'.length);
  if (m === 'google/gemini-2.0-flash') m = 'google/gemini-2.0-flash-001';
  return m;
}

async function openrouterDigestChatComplete(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const e = new Error('OPENROUTER_API_KEY is not configured on the server');
    e.status = 503;
    throw e;
  }
  const rawModel = (process.env.OPENROUTER_DIGEST_MODEL || 'openai/gpt-4o-mini').trim();
  const model = normalizeOpenRouterDigestModel(rawModel);
  if (model !== rawModel) {
    console.warn('[ratings-digest] OpenRouter model normalized:', JSON.stringify(rawModel), '→', JSON.stringify(model));
  }
  const max_tokens = Math.min(2048, parseInt(process.env.SHORTAPI_DIGEST_MAX_TOKENS || '900', 10) || 900);
  const temperature = Math.min(1.5, Math.max(0, parseFloat(process.env.SHORTAPI_DIGEST_TEMPERATURE || '0.65') || 0.65));

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  if (referer) headers['HTTP-Referer'] = referer;
  const appTitle = process.env.OPENROUTER_APP_TITLE?.trim();
  if (appTitle) headers['X-Title'] = appTitle;

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, max_tokens, temperature }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg =
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : null) ||
      data?.message ||
      res.statusText ||
      'OpenRouter chat failed';
    if (res.status === 429) {
      msg += ' (OpenRouter rate limit — wait and retry, or check usage / limits at openrouter.ai.)';
    }
    const err = new Error(msg);
    err.status = res.status === 401 || res.status === 403 ? 502 : res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    const err = new Error('OpenRouter returned no article text');
    err.status = 502;
    throw err;
  }
  return text.trim();
}

function digestProviderMode() {
  const p = (process.env.RATINGS_DIGEST_PROVIDER || 'auto').trim().toLowerCase();
  if (p === 'shortapi' || p === 'openai' || p === 'openrouter' || p === 'auto') return p;
  return 'auto';
}

async function digestChatComplete(messages) {
  const mode = digestProviderMode();
  const hasShort = Boolean(process.env.SHORTAPI_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (mode === 'openai') {
    return openaiDigestChatComplete(messages);
  }
  if (mode === 'openrouter') {
    return openrouterDigestChatComplete(messages);
  }
  if (mode === 'shortapi') {
    return shortapiChatComplete(messages);
  }
  // auto: OpenRouter first when key is set. Do not fall back to ShortAPI LLM jobs after OpenRouter fails — many ShortAPI keys
  // reject every chat slug (misleading "invalid model: deepseek/…"). Opt-in: RATINGS_DIGEST_FALLBACK_SHORTAPI=1
  const allowShortapiAfterOpenrouter = String(process.env.RATINGS_DIGEST_FALLBACK_SHORTAPI || '').trim() === '1';
  if (hasOpenRouter) {
    try {
      return await openrouterDigestChatComplete(messages);
    } catch (e) {
      console.warn('[ratings-digest] OpenRouter failed:', e.message);
      if (hasShort && allowShortapiAfterOpenrouter) {
        try {
          console.warn('[ratings-digest] falling back to ShortAPI (RATINGS_DIGEST_FALLBACK_SHORTAPI=1)');
          return await shortapiChatComplete(messages);
        } catch (e2) {
          console.warn('[ratings-digest] ShortAPI failed:', e2.message);
          if (hasOpenAI) {
            console.warn('[ratings-digest] falling back to OpenAI');
            return openaiDigestChatComplete(messages);
          }
          throw e2;
        }
      }
      if (hasOpenAI) {
        console.warn('[ratings-digest] falling back to OpenAI');
        return openaiDigestChatComplete(messages);
      }
      throw e;
    }
  }
  if (hasShort) {
    try {
      return await shortapiChatComplete(messages);
    } catch (e) {
      console.warn('[ratings-digest] ShortAPI failed:', e.message);
      if (hasOpenAI) {
        console.warn('[ratings-digest] falling back to OpenAI');
        return openaiDigestChatComplete(messages);
      }
      throw e;
    }
  }
  if (hasOpenAI) return openaiDigestChatComplete(messages);
  const e = new Error('Ratings digest: set SHORTAPI_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY on the server');
  e.status = 503;
  throw e;
}

const DIGEST_SYSTEM = `You are a veteran U.S. radio trade columnist writing for an industry newsletter (Radio Ink / Inside Radio tone).

Rules:
- Use ONLY the JSON facts in the user message. Do not invent stations, formats, or numbers not in the data.
- The ratings table is in "book". Optional "marketContext" strings include: (a) explicit simulation facts — often local sports broadcast rights (lines may start with 📋), holder call letters, season standing and tier, simulcast halo notes; (b) in-sim news headlines (franchise deals, consolidation, reformats, simulcasts, talent moves, etc.). When present, weave 1–3 of the most relevant items into the column as color — still no facts beyond those strings and the book. Tie share moves to sports rights when marketContext names that station as the rights holder and the book numbers support it.
- Write 2–4 short paragraphs of fluent prose. Plain text only: no Markdown — do not wrap station names or phrases in asterisks or underscores for emphasis, no markdown headings, no numbered lists, no code backticks.
- Refer to stations using field "call" (facility-style ID, e.g. WZZZ-FM). Each row may include "brand" (on-air name / slogan). When "brand" is non-empty, prefer trade-press style CALL (Brand) on first mention, e.g. WZZZ-FM (Power 102.3) — plain characters only, parentheses, no nested quotes unless the brand itself contains them. If "brand" is empty, use the call alone. Do not invent brands.
- Field "sharePct" is AQH share in the radio-industry sense (Arbitron/Nielsen-style points): 12.1 means a 12.1 share — write "12.1 share", "at a 12.1", "with 12.1s", etc. Never use "%" or the word "percent" for station shares.
- Field "deltaPts" (when not null): signed book-to-book change in the **same share-point units** as sharePct (not percent, not rating ratio). It is a decimal number whose **absolute value** is the size of the move. Examples: deltaPts -0.1 = lost one tenth of one share point; deltaPts -1.1 = lost 1.1 share points (e.g. from 4.6 to 3.5) — say "off 1.1 points", "down more than a full share", or "slipped eleven tenths", never "fell a tenth". deltaPts +0.6 = up six tenths of a point. Always match your words to the magnitude of the number; do not round a multi-point move to "a tenth" or "a few tenths" unless abs(deltaPts) is under about 0.15.
- If every row has deltaPts null, this is the first book in the simulation window — describe the rank/share snapshot only; do not pretend to know trends.
- Sound like insider trade press: confident, concise, slightly cynical about consultants and format wars — but stay grounded in the numbers provided.`;

/** Trial / Starter — deeper column + desk notes (same factual discipline as DIGEST_SYSTEM). */
const DIGEST_SYSTEM_ADVANCED = `${DIGEST_SYSTEM}

Subscriber advanced insights tier (signup trial or Starter — same factual rules as above; expanded output):
- Write 4 to 6 paragraphs of fluent trade prose total (plain text only: no Markdown emphasis markers, no bullet lists, no numbered lists).
- Include one paragraph that reads like an insider strategic memo: identify who gained and lost meaningful AQH share this book using calls from "book" only — when there are at least four ranked stations, explicitly contrast the two largest positive deltaPts moves versus the two largest negative deltaPts moves by station call (if fewer than four stations, cover everyone present).
- After the main column, end with a separate short paragraph that begins with the exact words "Desk notes." (including the period and space). That paragraph must contain exactly three sentences about what to monitor next book — each sentence must follow only from deltaPts trends, sharePct clustering, or marketContext strings; when every deltaPts value is null (first book), describe snapshot positioning and competitive tension only — do not imply momentum you cannot see.
`;

/** Pro — builds on advanced: ownership-style read + longer desk notes + band/format coda (still facts-only). */
const DIGEST_SYSTEM_ELITE = `${DIGEST_SYSTEM_ADVANCED}

Pro tier — additions on top of Subscriber advanced tier (overwrite only where this block conflicts; plain text still):
- Target roughly 7–10 paragraphs total blending the main trade column plus the structured inserts below — still no Markdown emphasis markers or lists.
- Insert one standalone paragraph immediately *before* the paragraph that begins "Desk notes." — board/ownership readability: exactly three sentences tying leader, challenger, and at-risk stations to ranks, sharePct, and deltaPts; name every call listed in "book" when fewer than seven rows, otherwise prioritize top six by rank and mention aggregate AM vs FM share pressure only when both bands appear in rows.
- The paragraph beginning "Desk notes." must contain **exactly five** sentences (not three), same grounding rules as the advanced tier Desk notes sentence constraints.
- Immediately after Desk notes, add one final paragraph beginning with exactly "Competitive snapshot." (period and space) containing exactly four sentences analyzing band rivalry (FM cluster vs outliers, AM standing) using only ranks, bands, sharePct, deltaPts, formats, plus marketContext when it explains a cited move — ending on practical watch-outs for programmers or sales grounded only in supplied data (no speculative audience research).
`;

async function optionalClerkUserId(req) {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return await verifyClerkBearer(m[1]);
  } catch {
    return null;
  }
}

/** @returns {'standard'|'advanced'|'elite'} */
async function digestInsightsTierForRequest(req) {
  const uid = await optionalClerkUserId(req);
  if (!uid) return 'standard';
  try {
    const r = await resolveStripePlanForUser(uid);
    const slug = r.planSlug;
    if (slug === CLERK_PLAN.PRO) return 'elite';
    if (slug === CLERK_PLAN.TRIAL || slug === CLERK_PLAN.STARTER) return 'advanced';
  } catch (e) {
    console.warn('[ratings-digest] plan resolve:', e.message || e);
  }
  return 'standard';
}

/**
 * Reserve one digest generation slot before calling the LLM (refund on failure).
 * @returns {Promise<
 *   | { ok: true, refund: () => Promise<void> }
 *   | { ok: false, status: number, body: Record<string, unknown> }
 * >}
 */
async function tryConsumeDigestQuota(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const bearer = m[1].trim();
    const guestId = verifyGuestToken(bearer);
    if (guestId) {
      const out = await guestAiUsage.tryConsume(guestId, 'digest');
      if (!out.ok) {
        return {
          ok: false,
          status: 403,
          body: {
            ok: false,
            code: 'guest_digest_quota_exhausted',
            error: 'Guest ratings digest limit reached. Create a free account or subscribe for more.',
            limit: out.limit,
            used: out.used,
          },
        };
      }
      return { ok: true, refund: () => guestAiUsage.refundOne(guestId, 'digest') };
    }
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const userId = await verifyClerkBearer(bearer);
        let planSlug = CLERK_PLAN.FREE;
        try {
          const r = await resolveStripePlanForUser(userId);
          planSlug = r.planSlug || planSlug;
        } catch (e) {
          console.warn('[ratings-digest] plan resolve for quota:', e.message || e);
        }
        const limit = digestMonthlyLimitForPlan(planSlug);
        const out = await tryConsume(userId, 'digest', limit);
        if (!out.ok) {
          return {
            ok: false,
            status: 403,
            body: {
              ok: false,
              code: 'digest_quota_exceeded',
              error:
                'Monthly ratings digest limit reached for your plan — upgrade or try next month (UTC).',
              plan: planSlug,
              limit: out.limit,
              used: out.used,
              period: out.period,
            },
          };
        }
        return { ok: true, refund: () => refundOne(userId, 'digest') };
      } catch {
        /* invalid bearer — fall through to anonymous (IP rate limit only) */
      }
    }
  }
  return { ok: true, refund: async () => {} };
}

function sanitizeDigestPayload(body) {
  const raw = body && typeof body === 'object' ? body.payload : null;
  if (!raw || typeof raw !== 'object') return null;
  const market = String(raw.market || 'Market').slice(0, 96);
  const periodLabel = String(raw.periodLabel || '').slice(0, 96);
  const year = parseInt(raw.year, 10);
  const period = parseInt(raw.period, 10);
  const book = Array.isArray(raw.book) ? raw.book.slice(0, 40) : [];
  const rows = book.map((r) => ({
    rank: Math.max(0, Math.min(99, parseInt(r.rank, 10) || 0)),
    call: String(r.call || '').slice(0, 36),
    brand: String(r.brand || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 72),
    format: String(r.format || '').slice(0, 72),
    sharePct:
      typeof r.sharePct === 'number' && !Number.isNaN(r.sharePct) ? Math.round(r.sharePct * 100) / 100 : 0,
    deltaPts: r.deltaPts == null || r.deltaPts === '' ? null : Math.round(Number(r.deltaPts) * 100) / 100,
    band: r.band === 'FM' ? 'FM' : 'AM',
  }));
  const mc = Array.isArray(raw.marketContext) ? raw.marketContext : [];
  const marketContext = mc
    .map((s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 24);
  return {
    market,
    periodLabel,
    year: Number.isFinite(year) ? year : null,
    period: Number.isFinite(period) ? period : null,
    book: rows,
    marketContext,
  };
}

function mountRatingsDigestRoutes(app) {
  app.get('/api/ratings-digest/status', (_req, res) => {
    const hasShort = Boolean(process.env.SHORTAPI_KEY);
    const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const mode = digestProviderMode();
    res.json({
      configured: hasShort || hasOpenRouter || hasOpenAI,
      provider: mode,
      digestMaxPerHour: digestRateLimitPerHour(),
      shortapiConfigured: hasShort,
      openrouterConfigured: hasOpenRouter,
      openaiConfigured: hasOpenAI,
      shortapiModel: hasShort ? resolveDigestModel(process.env.SHORTAPI_DIGEST_MODEL) : null,
      openrouterModel: hasOpenRouter
        ? normalizeOpenRouterDigestModel(process.env.OPENROUTER_DIGEST_MODEL || 'openai/gpt-4o-mini')
        : null,
      openaiModel: hasOpenAI ? (process.env.OPENAI_DIGEST_MODEL || 'gpt-4o-mini').trim() : null,
    });
  });

  app.post('/api/ratings-digest', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!allowDigestRate(ip)) {
        const lim = digestRateLimitPerHour();
        return res.status(429).json({
          ok: false,
          error: `Too many digest requests (${lim} per hour per IP). Wait up to an hour or raise RATINGS_DIGEST_MAX_PER_HOUR in server .env.`,
        });
      }

      const payload = sanitizeDigestPayload(req.body || {});
      if (!payload || !payload.book.length) {
        return res.status(400).json({ error: 'Invalid or empty ratings payload.' });
      }

      let userMsg = JSON.stringify(payload);
      if (userMsg.length > 16000) {
        payload.marketContext = (payload.marketContext || []).slice(0, 12);
        userMsg = JSON.stringify(payload);
      }
      if (userMsg.length > 16000) {
        return res.status(400).json({ error: 'Payload too large.' });
      }

      const quota = await tryConsumeDigestQuota(req);
      if (!quota.ok) {
        return res.status(quota.status).json(quota.body);
      }

      const insightsTier = await digestInsightsTierForRequest(req);
      const systemPrompt =
        insightsTier === 'elite'
          ? DIGEST_SYSTEM_ELITE
          : insightsTier === 'advanced'
            ? DIGEST_SYSTEM_ADVANCED
            : DIGEST_SYSTEM;

      let article;
      try {
        article = await digestChatComplete([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ]);
      } catch (e) {
        await quota.refund();
        throw e;
      }

      posthog.capture({
        distinctId: ip,
        event: 'ratings digest generated',
        properties: {
          market: payload.market,
          year: payload.year,
          period: payload.period,
          station_count: payload.book.length,
          provider: digestProviderMode(),
          insights_tier: insightsTier,
        },
      });
      res.json({ ok: true, article, insightsTier });
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      console.error('[ratings-digest]', e.message);
      if (status >= 500) posthog.captureException(e, clientIp(req));
      res.status(status).json({ ok: false, error: e.message || 'Digest failed' });
    }
  });
}

module.exports = { mountRatingsDigestRoutes };
