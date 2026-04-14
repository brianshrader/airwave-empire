'use strict';

/**
 * Quick check that sonic hints merge into Suno tags (no API call).
 * Run: node scripts/test-jingle-prompt-hints.cjs
 */

const { buildSunoJingleArgs } = require('../server/jinglePrompt.js');

const base = {
  brand: 'Test Hits FM',
  format: 'Top 40',
  year: 1975,
  formatId: 'TOP40',
  tagline: '',
  frequency: '98.5',
  band: 'FM',
};

const withHints = buildSunoJingleArgs({
  ...base,
  audienceHint: 'Audience target ADULTS 18–34; young-adult bright catchy',
  positionHint: 'Format positioning: leans Rock Edge with Bubblegum Pop undertones',
});

const noHints = buildSunoJingleArgs({ ...base });

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(withHints.tags.length <= 1000, 'tags should stay within 1000 cap');
assert(
  withHints.tags.includes('Audience target ADULTS 18–34'),
  'audience hint should appear in tags',
);
assert(
  withHints.tags.includes('Rock Edge'),
  'position hint should appear in tags',
);
assert(!noHints.tags.includes('Audience target'), 'no hint when omitted');

console.log('OK — jingle prompt hints');
console.log('Sample tags (truncated):', withHints.tags.slice(0, 320) + (withHints.tags.length > 320 ? '…' : ''));
