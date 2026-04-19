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

const countrySung = buildSunoJingleArgs({
  brand: '96.5 KD Country',
  format: 'Country',
  year: 1995,
  formatId: 'COUNTRY',
  tagline: "Seattle's Number One Country",
  frequency: '96.5',
  band: 'FM',
});
assert(!countrySung.lyrics.includes('[Spoken word]'), 'music formats use flat lyrics, not spoken block');
assert(countrySung.tags.includes('sung jingle'), 'country should ask for sung tagline + brand');
assert(countrySung.lyrics.includes('Seattle'), 'tagline should appear in lyrics');

const callsNotInBrand = buildSunoJingleArgs({
  brand: '96.5 The River',
  format: 'Country',
  year: 1995,
  formatId: 'COUNTRY',
  tagline: 'Number one for country',
  frequency: '96.5',
  band: 'FM',
  callLetters: 'KRVR',
});
assert(
  !callsNotInBrand.tags.includes('melodic vocal syllables'),
  'do not add call-letter tags when brand omits those letters',
);
assert(!callsNotInBrand.lyrics.includes('K R V R'), 'do not append spaced calls to lyrics');

const callsInBrand = buildSunoJingleArgs({
  brand: 'KRVR 96.5 The River',
  format: 'Country',
  year: 1995,
  formatId: 'COUNTRY',
  tagline: 'Country',
  frequency: '96.5',
  band: 'FM',
  callLetters: 'KRVR',
});
assert(callsInBrand.tags.includes('melodic vocal syllables'), 'call-letter tag when brand contains calls');

const q96Brand = buildSunoJingleArgs({
  brand: 'Q96',
  format: 'CHR',
  year: 1995,
  formatId: 'TOP40',
  tagline: '',
  frequency: '96.1',
  band: 'FM',
});
assert(
  /\bQ\s+ninety\s+six\b/i.test(q96Brand.lyrics),
  'Q96 + FM 96.1 should become Q ninety six in lyrics',
);
assert(!/\bQ96\b/.test(q96Brand.lyrics), 'lyrics should not leave raw Q96');

const top4075 = buildSunoJingleArgs({
  ...base,
  year: 1975,
  formatId: 'TOP40',
});
assert(
  !top4075.tags.includes('ARP-style analog synth brass'),
  'TOP40 should not use default 70s ARP brass ladder',
);
assert(
  /CHR|hit-radio/i.test(top4075.tags),
  'TOP40 should get CHR-specific era bed',
);

const news75 = buildSunoJingleArgs({
  brand: 'NewsRadio 9',
  format: 'News/Talk',
  year: 1975,
  formatId: 'NEWS_TALK',
  tagline: 'Where the valley gets its news',
  frequency: '600',
  band: 'AM',
});
assert(
  !news75.tags.includes('ARP-style analog synth brass'),
  'spoken news should not inherit music-format brass ladder',
);
assert(/talk|news|booth/i.test(news75.tags), 'news/talk gets VO-forward bed wording');

const oldies90 = buildSunoJingleArgs({
  brand: 'Oldies 105',
  format: 'Oldies',
  year: 1990,
  formatId: 'OLDIES',
  frequency: '105.3',
  band: 'FM',
});
assert(
  /gold|classic hits|retro/i.test(oldies90.tags),
  'oldies should get gold/classic imaging not generic brass default',
);

console.log('OK — jingle prompt hints');
console.log('Sample tags (truncated):', withHints.tags.slice(0, 320) + (withHints.tags.length > 320 ? '…' : ''));
