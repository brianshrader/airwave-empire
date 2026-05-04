'use strict';

const { PostHog } = require('posthog-node');

/** posthog-node throws if api key is missing; server must boot without analytics configured. */
const noopClient = {
  capture() {},
  captureException() {},
  /** posthog-node’s real client has shutdown(); keep noop compatible for SIGINT/SIGTERM. */
  shutdown() {
    return Promise.resolve();
  },
};

const key = (process.env.POSTHOG_API_KEY && String(process.env.POSTHOG_API_KEY).trim()) || '';
const host = (process.env.POSTHOG_HOST && String(process.env.POSTHOG_HOST).trim()) || undefined;

let client = noopClient;
if (key) {
  try {
    client = new PostHog(key, {
      host,
      enableExceptionAutocapture: true,
    });
  } catch (_e) {
    client = noopClient;
  }
}

module.exports = { posthog: client };
