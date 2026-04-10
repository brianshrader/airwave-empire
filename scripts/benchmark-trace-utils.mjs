/**
 * Shared helpers for Playwright + vite preview trace pipelines (snowball / early economics).
 */
import { createConnection } from 'net';

/**
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @returns {Promise<boolean>} true if something accepts TCP connections on the port
 */
export function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const finish = (v) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    socket.setTimeout(2000, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', (err) => {
      if (err && err.code === 'ECONNREFUSED') finish(false);
      else finish(false);
    });
  });
}

/**
 * Throws if the preview port is already bound (avoids attaching to a stale vite preview).
 *
 * @param {number} port
 * @param {string} [envHint='EARLY_PORT / OPS_PORT / TRACE_PORT']
 */
export async function assertPortFreeForPreview(port, envHint = 'EARLY_PORT / OPS_PORT / TRACE_PORT') {
  if (await isPortInUse(port)) {
    throw new Error(
      `Port ${port} is already in use — another vite preview or process may be bound. ` +
        `Stop it or set ${envHint} to a free port.`
    );
  }
}

/** @param {import('child_process').ChildProcess} preview */
export function logPreviewEarlyExit(preview, label = 'vite preview') {
  preview.on('exit', (code, signal) => {
    if (code !== 0 && code != null) {
      console.error(`[${label}] exited with code ${code}${signal ? ' signal ' + signal : ''}`);
    }
  });
}
