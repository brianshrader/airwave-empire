/**
 * POST /api/feedback — forwards to FormSubmit (https://formsubmit.co). Fallback when the client is
 * not built with VITE_FEEDBACK_FORMSUBMIT_EMAIL (browser POST avoids Cloudflare blocking VPS IPs).
 * Note: server-side requests to FormSubmit often get HTTP 403 (Cloudflare “Just a moment…”).
 * First use: confirm the destination inbox once via FormSubmit’s email.
 */
const https = require('https');

const DEFAULT_TO = 'airwaveempire@gmail.com';
const MAX_MSG = 12000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 24;
const rateMap = new Map();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 80);
  return String(req.socket?.remoteAddress || req.ip || '').slice(0, 80) || 'unknown';
}

function allowRate(ip) {
  const now = Date.now();
  let e = rateMap.get(ip);
  if (!e || now > e.reset) {
    e = { n: 0, reset: now + RATE_WINDOW_MS };
    rateMap.set(ip, e);
  }
  if (e.n >= RATE_MAX) return false;
  e.n += 1;
  return true;
}

/**
 * FormSubmit /ajax/ accepts JSON or form-urlencoded; server-side calls are more reliable
 * with urlencoded (matches their jQuery examples). Invalid placeholder emails (e.g. *.local)
 * are often rejected.
 */
function postFormSubmit(toEmail, payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([k, v]) => {
    if (v != null && v !== '') params.append(k, String(v));
  });
  const body = params.toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'formsubmit.co',
        port: 443,
        path: '/ajax/' + encodeURIComponent(toEmail),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8'),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw);
          else reject(new Error(`FormSubmit HTTP ${res.statusCode}: ${raw.slice(0, 400)}`));
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function mountFeedback(app) {
  app.post('/api/feedback', (req, res) => {
    const ip = clientIp(req);
    if (!allowRate(ip)) {
      return res.status(429).json({ error: 'Too many feedback submissions. Try again later.' });
    }
    const hp = String(req.body?._gotcha || req.body?.gotcha || '').trim();
    if (hp) {
      return res.json({ ok: true });
    }
    let message = String(req.body?.message || '').trim();
    if (message.length < 3) {
      return res.status(400).json({ error: 'Please enter a message (at least a few characters).' });
    }
    if (message.length > MAX_MSG) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MSG} characters).` });
    }
    let replyEmail = String(req.body?.replyEmail || req.body?.email || '').trim().slice(0, 254);
    if (replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    const to = (process.env.FEEDBACK_TO || DEFAULT_TO).trim() || DEFAULT_TO;
    // Syntactically valid address — FormSubmit rejects many fake TLDs (e.g. .local).
    const anonEmail = (process.env.FEEDBACK_ANONYMOUS_EMAIL || 'anonymous@airwaveempire.com').trim();
    const ua = String(req.headers['user-agent'] || '').slice(0, 500);
    const meta = [`IP: ${ip}`, `UA: ${ua}`].join('\n');
    const fullMessage = `${message}\n\n---\n${meta}`;

    const payload = {
      name: 'Airwave Empire beta',
      email: replyEmail || anonEmail,
      message: fullMessage,
      _subject: 'Airwave Empire — beta feedback',
      _template: 'table',
      _captcha: 'false',
    };

    postFormSubmit(to, payload)
      .then(() => res.json({ ok: true }))
      .catch((e) => {
        console.error('[FEEDBACK]', e.message || e);
        res.status(502).json({ error: 'Could not send feedback. Try again or use the Contact page.' });
      });
  });
}

module.exports = { mountFeedback };
