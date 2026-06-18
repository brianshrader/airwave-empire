'use strict';

/**
 * Quick check that sonic hints merge into Suno tags (no API call).
 * Run: node scripts/test-jingle-prompt-hints.cjs
 */

const { buildSunoJingleArgs, sunoJinglePromptConfidenceMessage } = require('../server/jinglePrompt.js');

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

const CROWD_TRIGGER = /\bcrowd\b|\bcheer|\bapplause\b|\bstadium\b|\bfestival\b|\bfestive\b|\barena\b|\bparty\b|\bsingalong\b|stacked harmon|\brisers?\b|sign-on\b|choir swell|hook stacks?|melodic stack|\banthemic\b/i;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertNoCrowdTriggers(tags, label) {
  assert(!CROWD_TRIGGER.test(tags), `${label} should not contain crowd/celebration trigger words: ${tags.match(CROWD_TRIGGER)}`);
}

assert(withHints.tags.length <= 1000, 'tags should stay within 1000 cap');
assert(withHints.tags.length < 900, 'tags should leave headroom under 1000 cap');
assert(!withHints.tags.includes('Audience target'), 'audience hint should be ignored for jingles');
assert(!withHints.tags.includes('Rock Edge'), 'position hint should be ignored for jingles');
assert(!noHints.tags.includes('Audience target'), 'no hint when omitted');

assertNoCrowdTriggers(withHints.tags, 'TOP40 with hints');
assertNoCrowdTriggers(noHints.tags, 'TOP40 base');

assert(sunoJinglePromptConfidenceMessage(base) === '', 'Suno prompt confidence line removed from player UI');

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
assert(countrySung.tags.includes('sung booth ID'), 'country should ask for sung tagline + brand');
assert(countrySung.lyrics.includes('Seattle'), 'tagline should appear in lyrics');
assertNoCrowdTriggers(countrySung.tags, 'country');

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
assert(!callsNotInBrand.tags.includes('call letters sing'), 'do not add call-letter tags when brand omits those letters');
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
assert(callsInBrand.tags.includes('call letters sing'), 'call-letter tag when brand contains calls');

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
assert(!top4075.tags.includes('ARP-style analog synth brass'), 'TOP40 should not use default 70s ARP brass ladder');
assert(/CHR|booth/i.test(top4075.tags), 'TOP40 should get CHR-specific era bed');
assertNoCrowdTriggers(top4075.tags, '1975 TOP40');

const news75 = buildSunoJingleArgs({
  brand: 'NewsRadio 9',
  format: 'News/Talk',
  year: 1975,
  formatId: 'NEWS_TALK',
  tagline: 'Where the valley gets its news',
  frequency: '600',
  band: 'AM',
});
assert(!news75.tags.includes('ARP-style analog synth brass'), 'spoken news should not inherit music-format brass ladder');
assert(/talk|news|booth/i.test(news75.tags), 'news/talk gets VO-forward bed wording');
assertNoCrowdTriggers(news75.tags, 'news talk');

const oldies90 = buildSunoJingleArgs({
  brand: 'Oldies 105',
  format: 'Oldies',
  year: 1990,
  formatId: 'OLDIES',
  frequency: '105.3',
  band: 'FM',
});
assert(/gold|classic hits|booth/i.test(oldies90.tags), 'oldies should get gold/classic imaging not generic brass default');
assertNoCrowdTriggers(oldies90.tags, 'oldies');

const rock76 = buildSunoJingleArgs({
  brand: 'Rock Radio 76',
  format: 'Album Rock',
  year: 1975,
  formatId: 'ALBUM_ROCK',
  tagline: '',
  frequency: '760',
  band: 'AM',
});
assert(/\bseventy[\s-]*six\b/i.test(rock76.lyrics), 'isolated 76 in brand should be seventy six for singing');
assertNoCrowdTriggers(rock76.tags, 'rock');

const dial104 = buildSunoJingleArgs({
  brand: 'The Buzz',
  format: 'Top 40',
  year: 2000,
  formatId: 'TOP40',
  frequency: '104.7',
  band: 'FM',
});
assert(dial104.tags.includes('one oh four'), '104.7 FM dial uses one oh four');
assert(/point/.test(dial104.tags) && /seven/.test(dial104.tags), '104.7 includes point seven in dial tag');

const dial995 = buildSunoJingleArgs({
  brand: 'Mix',
  format: 'Top 40',
  year: 1999,
  formatId: 'TOP40',
  frequency: '99.5',
  band: 'FM',
});
assert(/ninety[\s-]*nine/i.test(dial995.tags), '99.5 FM dial uses ninety nine');

const top40name = buildSunoJingleArgs({
  brand: 'Hot Hits Top 40',
  format: 'Top 40',
  year: 1985,
  formatId: 'TOP40',
  frequency: '98.5',
  band: 'FM',
});
assert(/\btop\s+40\b/i.test(top40name.lyrics), 'Top 40 format name should stay as words, not split forty');
assertNoCrowdTriggers(top40name.tags, '1985 TOP40');

const taglineOrd = buildSunoJingleArgs({
  brand: 'Hot Hits 98.5',
  format: 'Top 40',
  year: 1985,
  formatId: 'TOP40',
  tagline: "Atlanta's #1 hits",
  frequency: '98.5',
  band: 'FM',
});
assert(taglineOrd.lyrics.includes('number one'), '#1 in tagline should verbalize to number one');
assert(taglineOrd.tags.includes('dry studio outro'), 'outro tag should be present');
assertNoCrowdTriggers(taglineOrd.tags, 'tagline CHR');

const laTagline = buildSunoJingleArgs({
  brand: 'Big Country 92.5',
  format: 'Country',
  year: 1985,
  formatId: 'COUNTRY',
  tagline: "LA's country favorites",
  frequency: '92.5',
  band: 'FM',
});
assert(laTagline.lyrics.includes("L A's country favorites"), "LA's in tagline should space to L A's for singing");
assert(!/\bLA's country\b/i.test(laTagline.lyrics), 'raw LA apostrophe form should not remain in lyrics');

const gospel85 = buildSunoJingleArgs({
  brand: 'Praise 88',
  format: 'Gospel',
  year: 1985,
  formatId: 'GOSPEL',
  tagline: 'Inspiring faith',
  frequency: '88.1',
  band: 'FM',
});
assert(gospel85.tags.includes('solo gospel vocal'), 'gospel should prefer solo vocal not choir');
assertNoCrowdTriggers(gospel85.tags, 'gospel');

console.log('OK — jingle prompt hints');
console.log('Sample tags (truncated):', withHints.tags.slice(0, 320) + (withHints.tags.length > 320 ? '…' : ''));
