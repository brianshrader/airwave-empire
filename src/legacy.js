// ── VERSION: 2026-03-10-SESSION29 ──────────────────────────────────
console.log('[WAVELENGTH] v2026-03-10-S29 loaded. If you see this, JS is running.');
// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════
// POP: derived from active market data (scaled to individuals)
// Using MARKETS[ACTIVE_MARKET].pop × 1000 — defined after MARKETS block above
// This is a getter so it always reflects the active market
const POP={cohorts:{'12-17':{t:180000},'18-24':{t:195000},'25-34':{t:210000},'35-49':{t:265000},'50-64':{t:220000},'65+':{t:130000}}};
// getPOP(): returns market-aware cohort populations for calculations
function getPOP(){
  const mkt=MARKETS[ACTIVE_MARKET]||MARKETS.atlanta;
  const cohorts={};
  for(const [c,v] of Object.entries(mkt.pop)) cohorts[c]={t:v*1000};
  return {cohorts};
}
const COH=['12-17','18-24','25-34','35-49','50-64','65+'];
const CPM={
  // Terrestrial radio CPM per AQH person (Atlanta market, calibrated with correct metro population).
  // 35-49 is the primary radio advertising target — car buyers, homeowners, financial services.
  // 50-64 rising post-2000 for pharma, finance, travel. Youth depressed by digital shift.
  '12-17':1.9,'18-24':4.4,'25-34':5.6,'35-49':7.7,'50-64':4.9,'65+':2.6
};

// Streaming digital CPM — much higher than terrestrial by 2015 (targeted, measurable)
// 2008: $2-4 CPM. 2015: $8-12. 2020: $12-18.
const SCPM={'12-17':3.5,'18-24':6.0,'25-34':8.5,'35-49':7.0,'50-64':4.5,'65+':2.5};

// Per-format streaming affinity — how naturally does this format translate online?
// Younger-skewing formats get more organic streaming lift.
// News/Talk gets smart speaker boost post-2015.
const STRAF={
  TOP40:.90,CHR:.92,RHYTHMIC:.88,HOT_AC:.80,URBAN_CONTEMP:.82,ALT_ROCK:.85,
  ADULT_CONTEMP:.72,CLASSIC_ROCK:.68,CLASSIC_HITS:.65,OLDIES:.55,COUNTRY:.58,SOUL_RNB:.75,
  ALBUM_ROCK:.70,NEWS_TALK:.62,SPORTS_TALK:.60,PODCAST_TALK:1.0,
  MOR:.35,GOSPEL:.30,BEAUTIFUL_MUSIC:.28,
};

// Streaming infrastructure cost — flat regardless of wattage.
// Once you're online, a 1kw AM can reach as many people as a 50kw blowtorch.
// Signal power is a terrestrial constraint; streaming has none.
// What drives streaming success: format affinity, investment timing, station quality.
// Gender audience skew by format (female fraction 0-1, 0.5=balanced).
// Used to apply CPM premium: female-skewed formats (AC, Hot AC) command packaged-goods
// premiums; male-skewed formats (Sports Talk, Classic Rock) command auto/finance premiums.
// This is surfaced in the station card as an audience character note, not as a lever
// the player can pull directly — it's a consequence of format choice.
const FGS={
  BEAUTIFUL_MUSIC:.72, ADULT_CONTEMP:.67, HOT_AC:.64, GOSPEL:.62, CHR:.57,
  SOUL_RNB:.55, URBAN_CONTEMP:.54, COUNTRY:.53, TOP40:.53, MOR:.51, ADULT_STANDARDS:.48,
  RHYTHMIC:.51, CLASSIC_HITS:.51, SPANISH:.50, OLDIES:.48,
  PUBLIC_CLASSICAL:.52, PUBLIC_NEWS:.48,
  PODCAST_TALK:.43, NEWS_TALK:.40, ALT_ROCK:.38, CLASSIC_ROCK:.32,
  ALBUM_ROCK:.30, SPORTS_TALK:.24,
};
// Gender CPM multiplier: concentrated female or male audiences command advertiser premiums
function genderCPM(fmt){
  const f=FGS[fmt]||0.50;
  if(f>=0.60)return 1+(f-0.50)*0.30;    // up to +15% for 100% female
  if(f<=0.40)return 1+(0.50-f)*0.25;    // up to +12.5% for 100% male
  return 1.0;
}
// Label for UI display
function genderLabel(fmt){
  const f=FGS[fmt]||0.50;
  if(f>=0.65)return '♀ Female-skewed audience';
  if(f>=0.58)return '♀ Slight female lean';
  if(f<=0.30)return '♂ Heavily male audience';
  if(f<=0.42)return '♂ Male-skewed audience';
  return '⚥ Balanced audience';
}
const STREAM_COST_BASE=250000;   // one-time setup (hosting, encoder, web player)
const STREAM_UPKEEP_BASE=50000; // annual upkeep / 2 per period
const CLR=['#52e36e','#5ab4ff','#f05858','#c471ed','#56ccf2','#dce35b','#6ee2f5','#ff8fab','#a8dadc','#b7e4c7','#ffd166','#06d6a0','#ef476f','#118ab2','#8338ec','#ff9f1c','#2ec4b6','#e9c46a','#f4a261','#264653'];
const PERIODS=['SPR','FAL']; // Spring=0, Fall=1

// ── SEASONAL AD MARKET ────────────────────────────────────────────
// Radio ad spending is strongly seasonal: Fall (Q3+Q4) runs ~27% hotter
// than Spring (Q1+Q2). Q4 alone carries holiday retail, auto year-end,
// and political buys. Q1 is the industry's lean season.
//
// Spring = 0.88  ·  Fall = 1.12  (ratio 1.27)
// Election years add ~4% to Fall for News/Talk and Sports stations.
// Political ads are 80% radio/TV — they flood into those formats specifically.
const SEASONAL={
  spring: 0.88,
  fall:   1.12,
};
// Talk format bonus in election years (even years, fall period)
const ELECTION_FORMATS=['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'];
const ELECTION_BONUS=0.04;

function seasonMult(year, period, format){
  const base=period===2?SEASONAL.fall:SEASONAL.spring;
  // Election year political ad bonus: even years, Fall period, talk formats
  const isElectionFall=period===2&&(year%2===0)&&ELECTION_FORMATS.includes(format);
  return base*(isElectionFall?1+ELECTION_BONUS:1);
}

// FCC ownership rules — pre-1996: separate AM/FM caps per market
// Post-1996 Telecom Act: total cap by market size + per-service sub-cap
const FCC_PRE96=[
  {year:1970,am:1,fm:1},
  {year:1992,am:2,fm:2},
  {year:1994,am:3,fm:3},
];
// 1996+ tiers: by total commercial signals in market
// Source: Telecom Act of 1996, 47 CFR §73.3555
const FCC_96_TIERS=[
  {minSignals:45, total:8, perService:5, label:'8 stations (45+ signals)'},
  {minSignals:30, total:7, perService:4, label:'7 stations (30–44 signals)'},
  {minSignals:15, total:6, perService:4, label:'6 stations (15–29 signals)'},
  {minSignals:0,  total:5, perService:3, label:'5 stations (≤14 signals)'},
];

function fccLimits(year, totalSignals){
  totalSignals=totalSignals||10; // fallback
  if(year<1996){
    let r=FCC_PRE96[0];
    for(const l of FCC_PRE96){if(year>=l.year)r=l;}
    return {mode:'pre96', am:r.am, fm:r.fm, total:r.am+r.fm,
      label:`${r.am} AM + ${r.fm} FM`};
  }
  // 1996+: market-size bracket
  let tier=FCC_96_TIERS[FCC_96_TIERS.length-1];
  for(const t of FCC_96_TIERS){if(totalSignals>=t.minSignals){tier=t;break;}}
  return {mode:'96', total:tier.total, perService:tier.perService,
    label:tier.label, signals:totalSignals};
}

function fccOwned(entity, G){
  // Count stations owned by entity (player or corp id)
  // entity='player' checks isPlayer; otherwise checks corpOwner===entity
  const mine = entity==='player'
    ? G.stations.filter(s=>s.isPlayer && (MP.mode!=='live' || s._mpOwner===MP.playerId))
    : G.stations.filter(s=>s.corpOwner===entity&&!s.isPlayer);
  const am=mine.filter(s=>s.sig.type==='AM').length;
  const fm=mine.filter(s=>s.sig.type==='FM'||s.fmBooster).length;
  return {total:mine.length, am, fm};
}

function fccCanAcquire(entity, sigType, G){
  const lim=fccLimits(G.year, G.stations.length);
  const owned=fccOwned(entity, G);
  if(lim.mode==='pre96'){
    if(sigType==='AM')return owned.am<lim.am;
    return owned.fm<lim.fm;
  }
  // 1996+ total cap + per-service sub-cap
  if(owned.total>=lim.total)return false;
  const serviceCount=sigType==='AM'?owned.am:owned.fm;
  return serviceCount<lim.perService;
}

// ── FM BOOSTER COSTS ─────────────────────────────────────────────
// FM Translator for AM stations — NOT available until 2009 (FCC AM Revitalization).
// The FCC's AM Revitalization proceeding + 2010 rule change allowed AM stations
// to acquire FM translators via HD Radio subchannels. Before 2009, AM operators
// who wanted FM presence had to buy a real FM license or do a full simulcast.
// Cost curve: expensive at first (legal/engineering overhead), drops as process
// becomes routine 2013+, bottoms out as a commodity service by 2018.
const FM_BOOSTER_COST={
  2009:380000, 2011:280000, 2013:210000,
  2015:160000, 2017:120000, 2019:90000,
};
function getBoosterCost(year){
  const keys=Object.keys(FM_BOOSTER_COST).map(Number).sort((a,b)=>a-b);
  let cost=FM_BOOSTER_COST[keys[0]];
  for(const k of keys){if(year>=k)cost=FM_BOOSTER_COST[k];}
  return cost;
}

// ── FORMATS ───────────────────────────────────────────────────────
const FM={
  TOP40:          {l:'Top 40',            cpm:1.05,sp:16,fm:false,ab:0,   unlock:1970,d:'The hits, all day. Youth-focused, high energy.'},
  COUNTRY:        {l:'Country',            cpm:.92, sp:14,fm:false,ab:0,   unlock:1970,d:'Strong Southern loyalty. Deep demographic roots.'},
  SOUL_RNB:       {l:'Soul / R&B',         cpm:.88, sp:14,fm:false,ab:.15, unlock:1970,d:'Community-driven. Atlanta bonus. Undervalued by advertisers.'},
  MOR:            {l:'Middle of Road',     cpm:.85, sp:18,fm:false,ab:0,   unlock:1970,d:'Older demos. High spot load. Declining after 1973.'},
  NEWS_TALK:      {l:'News / Talk',        cpm:1.55,sp:12,fm:false,ab:0,   unlock:1970,d:'Highest CPM format. Affluent 35-64 demo. AM-native. Profitable at 3%+ share.'},
  ALBUM_ROCK:     {l:'Album Rock',         cpm:1.22,sp:10,fm:true, ab:0,   unlock:1970,d:'FM only. Low spots = high loyalty. Strong car/beer/concert advertisers.'},
  BEAUTIFUL_MUSIC:{l:'Beautiful Music',    cpm:.80, sp:20,fm:true, ab:0,   unlock:1970,d:'FM easy listening. Older demos. Very high spot load.'},
  GOSPEL:         {l:'Gospel',             cpm:.72, sp:12,fm:false,ab:0,   unlock:1970,d:'Niche but intensely loyal. Direct response.'},
  CHR:            {l:'Contemporary Hit',   cpm:1.14,sp:14,fm:true, ab:0,   unlock:1982,d:'Evolved Top 40. FM-native, youth-focused.'},
  CLASSIC_ROCK:   {l:'Classic Rock',       cpm:1.10,sp:12,fm:true, ab:0,   unlock:1980,d:'Nostalgia for Boomers. Loyal Boomer demo with high disposable income.'},
  ADULT_CONTEMP:  {l:'Adult Contemporary', cpm:1.05,sp:16,fm:true, ab:0,   unlock:1980,d:'Soft hits. 25–49 demo. Dominant in the 80s.'},
  URBAN_CONTEMP:  {l:'Urban Contemporary', cpm:.95, sp:14,fm:true, ab:.10, unlock:1983,d:'R&B-influenced pop. Strong Atlanta bonus.'},
  SPORTS_TALK:    {l:'Sports Talk',        cpm:1.40,sp:10,fm:false,ab:0,   unlock:1990,d:'AM lifeblood post-1996. Male 18-49. Premium CPM. Profitable at 3%+ share.'},
  SPANISH:        {l:'Spanish / Latin',    cpm:.90, sp:14,fm:false,ab:.08, unlock:1992,d:'Growing Hispanic audience. Underserved.'},
  ALT_ROCK:       {l:'Alternative Rock',   cpm:1.00,sp:10,fm:true, ab:0,   unlock:1991,d:'Post-grunge. 18–34. Low spots, high credibility.'},
  RHYTHMIC:       {l:'Rhythmic CHR',       cpm:1.02,sp:14,fm:true, ab:.08, unlock:2000,d:'Hip-hop and R&B crossover pop. Dominates 12–24.'},
  HOT_AC:         {l:'Hot Adult Contemp',  cpm:1.06,sp:15,fm:true, ab:0,   unlock:2000,d:'Younger AC. 18–34 women. Strong advertiser demand.'},
  OLDIES:         {l:'Oldies',             cpm:.90, sp:15,fm:false,ab:0,   unlock:1983,d:'50s–60s rock & roll nostalgia. Boomer-dominant. Evolves into Classic Hits or ages out.'},
  CLASSIC_HITS:   {l:'Classic Hits',       cpm:.92, sp:16,fm:true, ab:0,   unlock:2005,d:'70s–80s nostalgia. Rebranded Oldies with broader library. 35–55.'},
  PODCAST_TALK:   {l:'Podcast / Talk',     cpm:1.25,sp:8,  fm:false,ab:0,  unlock:2012,d:'Hybrid terrestrial/digital. Premium CPM.'},
  ADULT_STANDARDS:{l:'Adult Standards',   cpm:.82, sp:14,fm:false,ab:0,  unlock:1981,d:'Sinatra, Ella, Nat King Cole. "Music of Your Life" blazed the trail in \'81. AM\'s refuge after MOR dies — low shares, intensely loyal 55+ audience.'},
  // Public stations — rival-only, non-commercial
  PUBLIC_NEWS:    {l:'Public News / Talk', cpm:0,   sp:0,  fm:true, ab:0,  unlock:1975,d:'NPR affiliate. Non-commercial. Educated 35-64. Unbeatable loyalty.',public:true},
  PUBLIC_CLASSICAL:{l:'Public Classical',  cpm:0,   sp:0,  fm:true, ab:0,  unlock:1975,d:'Classical and jazz. Older educated demos. Pledge-drive funded.',public:true},
};
const FADJ={
  TOP40:['SOUL_RNB','ALBUM_ROCK','CHR'],SOUL_RNB:['TOP40','GOSPEL','URBAN_CONTEMP'],
  ALBUM_ROCK:['TOP40','CLASSIC_ROCK','ALT_ROCK'],COUNTRY:['MOR','GOSPEL','CLASSIC_HITS'],
  MOR:['COUNTRY','BEAUTIFUL_MUSIC','NEWS_TALK','ADULT_CONTEMP'],NEWS_TALK:['MOR','SPORTS_TALK','PODCAST_TALK'],
  BEAUTIFUL_MUSIC:['MOR','ADULT_CONTEMP'],GOSPEL:['SOUL_RNB','COUNTRY'],
  CHR:['TOP40','URBAN_CONTEMP','RHYTHMIC'],CLASSIC_ROCK:['ALBUM_ROCK','CLASSIC_HITS'],
  ADULT_CONTEMP:['MOR','BEAUTIFUL_MUSIC','HOT_AC'],URBAN_CONTEMP:['SOUL_RNB','CHR','RHYTHMIC'],
  SPORTS_TALK:['NEWS_TALK'],ALT_ROCK:['ALBUM_ROCK'],SPANISH:['URBAN_CONTEMP'],
  RHYTHMIC:['CHR','URBAN_CONTEMP'],HOT_AC:['ADULT_CONTEMP','CHR'],
  OLDIES:['MOR','CLASSIC_HITS','COUNTRY'],CLASSIC_HITS:['OLDIES','CLASSIC_ROCK','MOR'],PODCAST_TALK:['NEWS_TALK','SPORTS_TALK'],
  ADULT_STANDARDS:['MOR','BEAUTIFUL_MUSIC','OLDIES','NEWS_TALK'],
};
const FA={
  TOP40:          {'12-17':.90,'18-24':.80,'25-34':.45,'35-49':.18,'50-64':.06,'65+':.03},
  COUNTRY:        {'12-17':.30,'18-24':.38,'25-34':.52,'35-49':.58,'50-64':.50,'65+':.35},
  ADULT_STANDARDS:{'12-17':.01,'18-24':.03,'25-34':.08,'35-49':.18,'50-64':.42,'65+':.70},
  SOUL_RNB:       {'12-17':.55,'18-24':.58,'25-34':.50,'35-49':.38,'50-64':.22,'65+':.12},
  MOR:            {'12-17':.05,'18-24':.10,'25-34':.22,'35-49':.48,'50-64':.62,'65+':.65},
  NEWS_TALK:      {'12-17':.04,'18-24':.08,'25-34':.18,'35-49':.35,'50-64':.48,'65+':.42},
  ALBUM_ROCK:     {'12-17':.45,'18-24':.65,'25-34':.38,'35-49':.08,'50-64':.02,'65+':.01},
  BEAUTIFUL_MUSIC:{'12-17':.03,'18-24':.06,'25-34':.15,'35-49':.38,'50-64':.55,'65+':.58},
  GOSPEL:         {'12-17':.08,'18-24':.10,'25-34':.18,'35-49':.28,'50-64':.35,'65+':.42},
  CHR:            {'12-17':.88,'18-24':.82,'25-34':.50,'35-49':.20,'50-64':.07,'65+':.02},
  CLASSIC_ROCK:   {'12-17':.20,'18-24':.42,'25-34':.55,'35-49':.62,'50-64':.35,'65+':.12},
  ADULT_CONTEMP:  {'12-17':.10,'18-24':.28,'25-34':.52,'35-49':.58,'50-64':.40,'65+':.22},
  URBAN_CONTEMP:  {'12-17':.60,'18-24':.65,'25-34':.52,'35-49':.30,'50-64':.12,'65+':.05},
  SPORTS_TALK:    {'12-17':.06,'18-24':.22,'25-34':.38,'35-49':.48,'50-64':.35,'65+':.18},
  SPANISH:        {'12-17':.45,'18-24':.50,'25-34':.48,'35-49':.35,'50-64':.20,'65+':.10},
  ALT_ROCK:       {'12-17':.50,'18-24':.68,'25-34':.42,'35-49':.12,'50-64':.03,'65+':.01},
  RHYTHMIC:       {'12-17':.72,'18-24':.70,'25-34':.45,'35-49':.18,'50-64':.06,'65+':.02},
  HOT_AC:         {'12-17':.25,'18-24':.52,'25-34':.62,'35-49':.42,'50-64':.20,'65+':.08},
  OLDIES:         {'12-17':.05,'18-24':.12,'25-34':.28,'35-49':.52,'50-64':.62,'65+':.45},
  CLASSIC_HITS:   {'12-17':.08,'18-24':.20,'25-34':.42,'35-49':.58,'50-64':.50,'65+':.25},
  PODCAST_TALK:   {'12-17':.08,'18-24':.20,'25-34':.32,'35-49':.38,'50-64':.30,'65+':.20},
  // Public radio: skews educated, older — strong 35-64 concentration
  PUBLIC_NEWS:    {'12-17':.02,'18-24':.06,'25-34':.20,'35-49':.52,'50-64':.60,'65+':.48},
  PUBLIC_CLASSICAL:{'12-17':.01,'18-24':.04,'25-34':.12,'35-49':.38,'50-64':.62,'65+':.58},
};
const SW={morningDrive:.38,afternoonDrive:.26,midday:.18,evening:.11,overnight:.07};
const SL={morningDrive:'MORNING',afternoonDrive:'AFTERNOON',midday:'MIDDAY',evening:'EVENING',overnight:'O/NIGHT'};
const TALK_FMTS=['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'];
// Community identity potential by format (0–1 scale)
// Formats with deep cultural roots build identity faster and lose it harder
const COMMUNITY_IDENTITY={
  SOUL_RNB:1.0,      // Highest — cultural institution, civil rights legacy
  GOSPEL:0.95,       // Church community, intensely personal loyalty
  COUNTRY:0.85,      // Rural/Southern identity, deeply tribal
  SPANISH:0.90,      // Immigrant community anchor, irreplaceable
  NEWS_TALK:0.70,    // Civic institution, opinion leader status
  SPORTS_TALK:0.65,  // Fan community hub
  ADULT_STANDARDS:0.75, // Nostalgic, older community cornerstone
  MOR:0.55,          // Broad but shallow — friendly to everyone, vital to no one
  ALBUM_ROCK:0.60,   // Subculture identity, loyal but not civic
  CLASSIC_ROCK:0.65, // Generational identity — "the station I grew up with"
  ALT_ROCK:0.55,     // Scene credibility, younger and more fickle
  URBAN_CONTEMP:0.75,// Youth community, cultural tastemaker
  ADULT_CONTEMP:0.40,// Demographically broad = identity-thin
  HOT_AC:0.35,
  CHR:0.30,          // High ratings, low roots — listeners leave without guilt
  TOP40:0.25,
  BEAUTIFUL_MUSIC:0.45,
  OLDIES:0.60,       // "This is the station my dad listened to"
  CLASSIC_HITS:0.55,
  PODCAST_TALK:0.35,
};

const MUSIC_FMTS=['TOP40','COUNTRY','SOUL_RNB','MOR','ADULT_STANDARDS','ALBUM_ROCK','BEAUTIFUL_MUSIC','CHR',
  'CLASSIC_ROCK','ADULT_CONTEMP','URBAN_CONTEMP','ALT_ROCK','RHYTHMIC','HOT_AC','CLASSIC_HITS','OLDIES','GOSPEL','SPANISH'];
function vacantLabel(fmt,slot){
  const isTalk=TALK_FMTS.includes(fmt);
  // Overnight is always automation or paid programming regardless of format
  if(slot==='overnight')return isTalk?'PAID PROGRAMMING':'AUTOMATION';
  if(slot==='evening')return isTalk?'SYNDICATED':'AUTOMATION';
  // Prime dayparts: the distinction matters most
  if(isTalk)return 'SYNDICATED';
  return 'AUTOMATION';
}
const DAYPART_SLOTS=['morningDrive','afternoonDrive','midday','evening','overnight'];
/** Market-wide superstar talent — prior 80/60/5y gates rarely fired by 1980 in normal play; tuned so 0–2 stars can emerge late 70s without trivializing. */
const SUPERSTAR={
  RAW_QUALITY_MIN:55,
  QUALITY_THRESHOLD:75,
  TENURE_THRESHOLD:3,
  MAX_PER_MARKET:2,
  EFF_Q_MULT:1.40,
  OQ_BONUS:8,
  SHARE_BOOST_ON_ARRIVE:0.008,
  SHARE_LOSS_ON_DEPART:0.006,
  SALARY_FLOOR_BASE:55000,
  SALARY_CAP_MULT_BONUS:0.50,
  POACH_RESIST_BONUS:0.30,
};
const SUPERSTAR_DAYPART_ORDER={morningDrive:0,afternoonDrive:1,midday:2,evening:3,overnight:4};

/** Effective daypart quality for station OQ weighting — superstars lift slot contribution (capped at 100). */
function effSlotQForOq(sd){
  let q=sd?.quality||20;
  if(sd?.talent && (sd.talent._suspended||0)>0){
    return Math.max(12,Math.round(q*0.48));
  }
  if(sd?.talent?.superstar===true){
    q=Math.min(100,q*SUPERSTAR.EFF_Q_MULT);
  }
  return q;
}

// ── TALENT TROUBLE (Phase 1: FCC / sponsor / DUI decision events) ─
const TROUBLE_SCENARIOS=[
  {id:'fcc_language',tier:'minor',
   title:'FCC Language Violation',
   desc:'{name} dropped an expletive live on air. The FCC is investigating.',
   flavor:'It was a slip during an emotional sports argument. Or maybe not.',
   options:[
     {label:'Pay fine + public apology',cost:'fine',effect:{morale:-8,fine:15000},outcome:'Fine paid. {name} is embarrassed but grateful. Audience mostly forgets within a period.'},
     {label:'Suspend for one period',cost:'none',effect:{morale:-18,quality:-3,suspendPeriods:1},outcome:'{name} suspended. Listeners notice the absence. Some respect the accountability.'},
     {label:'Fire immediately',cost:'buyout',effect:{stationShare:-0.003},outcome:'Clean break. {name} exits with some bitterness. Rival stations are already calling them.'},
   ]},
  {id:'fcc_indecency',tier:'major',
   title:'FCC Indecency Complaint',
   desc:'{name} crossed the line on a morning segment. Three listener complaints filed. The FCC is reviewing.',
   flavor:'A joke that went too far. Or satire that nobody understood. Either way, the phones are ringing.',
   options:[
     {label:'Fight the complaint ($25K legal)',cost:25000,effect:{morale:+5},outcome:'Legal team files response. 60% chance the fine is reduced or dismissed.'},
     {label:'Settle: pay max fine',cost:'fine',effect:{morale:-10,fine:50000},outcome:'Quick resolution. {name} survives but is on thin ice. One more incident and the FCC flags the station.'},
     {label:'Fire + issue statement',cost:'buyout',effect:{stationShare:-0.005,identity:+5},outcome:'Bold accountability move. Community responds positively. Rivals notice your standards.'},
   ]},
  {id:'sponsor_boycott',tier:'major',
   title:'Sponsor Boycott',
   desc:'{name} made comments that upset three major advertisers. They have pulled their buys.',
   flavor:'It started on social media. Now it is in the trades.',
   options:[
     {label:'Have {name} issue apology',cost:'none',effect:{morale:-12,sell:+0.03},outcome:'Apology aired. Two of three sponsors return next period. {name} is chastened.'},
     {label:'Defend {name} publicly',cost:'none',effect:{morale:+10,sell:-0.05},outcome:'You doubled down. Core listeners love it. Advertisers are nervous. High risk, high reward.'},
     {label:'Quietly reassign to overnight',cost:'none',effect:{morale:-20,quality:-5},outcome:'{name} moved off morning. Advertisers relieved. Listeners confused. Ratings dip.'},
     {label:'Buy out contract',cost:'buyout',effect:{sell:+0.04,stationShare:-0.004},outcome:'Clean break. Advertisers return. Listeners grumble for one period then move on.'},
   ]},
  {id:'dui',tier:'minor',
   title:'DUI Arrest',
   desc:'{name} was arrested for DUI. It is in the local paper.',
   flavor:'Morning show hosts and their demons. Classic radio.',
   options:[
     {label:'Mandatory leave + treatment',cost:20000,effect:{morale:-5,quality:-2,suspendPeriods:1},outcome:'{name} enters treatment. Returns with better morale and a compelling comeback story.'},
     {label:'Issue statement, no action',cost:'none',effect:{morale:-8,sell:-0.02},outcome:'Advertisers are watching. {name} continues on air. Community is divided.'},
     {label:'Terminate contract',cost:'buyout',effect:{},outcome:'By the book. {name} exits. The slot needs filling.'},
   ]},
];

const TROUBLE_MAJOR_DAYPARTS=['morningDrive','afternoonDrive','midday','evening'];

function triggerTalentTrouble(G){
  const acts=[];
  if(!G||!G.ps||G.pendingDecisionEvent)return acts;
  const cands=[];
  G.ps.forEach(s=>{
    if(!s.prog)return;
    TROUBLE_MAJOR_DAYPARTS.forEach(slot=>{
      const sd=s.prog[slot];
      if(!sd?.talent)return;
      const t=sd.talent;
      if((t._suspended||0)>0)return;
      cands.push({s,slot,t});
    });
  });
  if(!cands.length)return acts;
  const pick=cands[Math.floor(Math.random()*cands.length)];
  const baseProb=pick.t.superstar?0.010:0.005;
  const moraleMod=pick.t.morale<50?1.35:pick.t.morale<65?1.0:0.65;
  if(Math.random()>baseProb*moraleMod)return acts;
  const tierRoll=Math.random();
  const pool=tierRoll<0.3
    ? TROUBLE_SCENARIOS.filter(sc=>sc.tier==='major')
    : TROUBLE_SCENARIOS.filter(sc=>sc.tier==='minor');
  if(!pool.length)return acts;
  const scenario=pool[Math.floor(Math.random()*pool.length)];
  const rivalPool=G.stations.filter(st=>st&&!st._bpSlotDeferred&&!st.isPlayer&&!st.isPublic&&st.rat?.share>0.03);
  const rival=rivalPool.length?rivalPool[Math.floor(Math.random()*rivalPool.length)]:null;
  G.pendingDecisionEvent={
    scenarioId:scenario.id,
    stationId:pick.s.id,
    slot:pick.slot,
    talentName:pick.t.name,
    rivalStation:rival?.callLetters||'a rival',
    year:G.year,
    period:G.period,
    ownerId:pick.s._mpOwner!==undefined?pick.s._mpOwner:0,
  };
  acts.push({v:'HIGH',
    t:`⚠ INCIDENT: ${scenario.title} — ${pick.t.name} at ${pick.s.callLetters}. Decision required.`,
    y:G.year,p:G.period,iy:true});
  return acts;
}

function clearPendingTroubleIfStale(){
  const p=G?.pendingDecisionEvent;
  if(!p)return;
  const s=G.stations.find(st=>st.id===p.stationId);
  const sd=s?.prog?.[p.slot];
  if(!sd?.talent||!TROUBLE_SCENARIOS.find(sc=>sc.id===p.scenarioId))G.pendingDecisionEvent=null;
}

function showTalentTroubleModal(){
  clearPendingTroubleIfStale();
  const pending=G.pendingDecisionEvent;
  if(!pending)return;
  const scenario=TROUBLE_SCENARIOS.find(sc=>sc.id===pending.scenarioId);
  if(!scenario)return;
  const s=G.stations.find(st=>st.id===pending.stationId);
  const sd=s?.prog?.[pending.slot];
  const t=sd?.talent;
  if(!t){G.pendingDecisionEvent=null;return;}
  const ownerPid=pending.ownerId!=null?pending.ownerId:MP.playerId;
  const ownerCash=MP.mode==='live'?(G._playerCash?.[ownerPid]??G.cash):G.cash;
  const cyr=t.cyr||0;
  const buyout=cyr>0.1?Math.round(t.salary*cyr*0.60/500)*500:0;
  const fineAmt=scenario.id==='fcc_language'?15000:scenario.id==='fcc_indecency'?50000:0;
  const raiseAmt=Math.round(t.salary*0.15/500)*500;
  const desc=scenario.desc.replace(/{name}/g,t.name).replace(/{rivalStation}/g,pending.rivalStation);
  const optRows=scenario.options.map((opt,i)=>{
    let costLabel='',costColor='var(--off)',canAfford=true;
    const isFcc = scenario.id==='fcc_language' || scenario.id==='fcc_indecency';
    const mandatoryFine = isFcc ? fineAmt : 0;
    if(opt.cost==='fine'){
      costLabel=` — Mandatory FCC fine: ${f$(mandatoryFine)}`;
      costColor='var(--red)';
      canAfford=ownerCash>=mandatoryFine;
    }
    else if(opt.cost==='buyout'){
      const totalNeed = mandatoryFine + (buyout||0);
      costLabel=buyout>0
        ?` — FCC fine: ${f$(mandatoryFine)} + Buyout: ${f$(buyout)}`
        :` — FCC fine: ${f$(mandatoryFine)}`;
      costColor='var(--amb)';
      canAfford=ownerCash>=totalNeed;
    }
    else if(opt.cost==='raise'){
      costLabel=` — FCC fine: ${f$(mandatoryFine)} + Salary +${f$(raiseAmt)}/yr`;
      costColor='var(--amb)';
      canAfford=ownerCash>=mandatoryFine;
    }
    else if(opt.cost==='leave' || opt.cost==='none'){
      costLabel=mandatoryFine>0 ? ` — Mandatory FCC fine: ${f$(mandatoryFine)}` : (opt.cost==='leave' ? ' — 1 period paid leave' : 'No cash cost');
      costColor=mandatoryFine>0 ? 'var(--red)' : 'var(--mut)';
      canAfford=ownerCash>=mandatoryFine;
    }
    else if(typeof opt.cost==='number'){
      const totalNeed = mandatoryFine + opt.cost;
      costLabel= mandatoryFine>0
        ? ` — FCC fine: ${f$(mandatoryFine)} + $${Math.round(opt.cost/1000)}K legal`
        : ` — $${Math.round(opt.cost/1000)}K legal`;
      costColor='var(--amb)';
      canAfford=ownerCash>=totalNeed;
    }
    return `<button class="to${canAfford?'':' nope'}" style="display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;cursor:${canAfford?'pointer':'not-allowed'}" onclick="${canAfford?`resolveTrouble('${pending.stationId}','${pending.slot}',${i})`:''}">
      <div style="font-family:var(--fd);font-size:15px;color:var(--wht)">${opt.label.replace(/{name}/g,t.name)}</div>
      <div style="font-size:13px;color:${costColor};margin-top:2px">${costLabel||'No cost'}</div>
    </button>`;
  }).join('');
  const tt=document.getElementById('trouble-title');
  const tb=document.getElementById('trouble-body');
  if(!tt||!tb)return;
  tt.textContent=`⚠ ${scenario.title.toUpperCase()}`;
  tb.innerHTML=`
    <div style="background:rgba(240,88,88,.06);border:1px solid rgba(240,88,88,.15);border-radius:6px;padding:14px;margin-bottom:16px">
      <div style="font-family:var(--fd);font-size:17px;color:var(--wht);margin-bottom:6px">${t.name} <span style="color:var(--mut);font-weight:normal">· ${s?.callLetters||''} ${SL[pending.slot]||''}</span></div>
      <div style="font-size:15px;color:var(--off);margin-bottom:6px">${desc}</div>
      <div style="font-size:14px;color:var(--mut);font-style:italic">${scenario.flavor}</div>
    </div>
    <div style="font-size:14px;color:var(--mut);margin-bottom:10px">How do you respond?</div>
    ${optRows}`;
  om('m-talent-trouble');
}

function applyTroubleResolution(sid,slot,optionIdx,appealRemote){
  const pending=G.pendingDecisionEvent;
  if(!pending||pending.stationId!==sid||pending.slot!==slot)return;
  const s=G.stations.find(st=>st.id===sid);
  const sd=s?.prog?.[slot];
  const t=sd?.talent;
  if(!t)return;
  const scenario=TROUBLE_SCENARIOS.find(sc=>sc.id===pending.scenarioId);
  if(!scenario)return;
  const opt=scenario.options[optionIdx];
  if(!opt)return;
  const eff=opt.effect||{};
  const ownerPid=pending.ownerId!=null?pending.ownerId:MP.playerId;
  const tCash=d=>{
    if(MP.mode!=='live'){G.cash+=d;return;}
    if(!G._playerCash)G._playerCash={};
    G._playerCash[ownerPid]=(G._playerCash[ownerPid]||0)+d;
    if(MP.playerId===ownerPid)G.cash=G._playerCash[ownerPid];
    MP.emit('player_cash_update',{playerId:ownerPid,cash:G._playerCash[ownerPid]});
  };
  const cyr=t.cyr||0;
  const buyout=cyr>0.1?Math.round(t.salary*cyr*0.60/500)*500:0;
  const fineAmt=pending.scenarioId==='fcc_language'?15000:pending.scenarioId==='fcc_indecency'?50000:0;
  const raiseAmt=Math.round(t.salary*0.15/500)*500;
  let costPaid=0;
  const isFcc = pending.scenarioId==='fcc_language' || pending.scenarioId==='fcc_indecency';
  const mandatoryFine = isFcc ? fineAmt : 0;
  if(mandatoryFine>0){
    tCash(-mandatoryFine);
    costPaid+=mandatoryFine;
  }
  if(opt.cost==='fine'){
    // already paid via mandatoryFine for FCC
  }
  else if(opt.cost==='buyout'&&buyout>0){
    tCash(-buyout);
    costPaid+=buyout;
  }
  else if(opt.cost==='raise'){
    t.salary=Math.round((t.salary+raiseAmt)/500)*500;
    t.cyr=Math.max(t.cyr||2,(t.cyr||2)+2);
    t.morale=Math.min(100,(t.morale||65)+5);
  }
  else if(opt.cost==='leave'){
    // effect.suspendPeriods handles suspension
  }
  else if(typeof opt.cost==='number'){tCash(-opt.cost);costPaid+=opt.cost;}
  let troubleOutcomeNote='';
  if(pending.scenarioId==='fcc_indecency' && optionIdx===0){
    let refund=0;
    if(appealRemote!=null && typeof appealRemote.refund==='number'){
      refund=appealRemote.refund;
      troubleOutcomeNote=appealRemote.note||'';
    } else {
      const roll=Math.random();
      if(roll<0.60){
        refund = roll<0.25 ? fineAmt : Math.round(fineAmt*0.5);
        troubleOutcomeNote = refund>=fineAmt
          ? ' Legal appeal succeeds — the FCC fine is dismissed.'
          : ` Legal appeal partially succeeds — ${f$(refund)} of the FCC fine is recovered.`;
      } else {
        troubleOutcomeNote = ' Legal appeal fails — the FCC fine stands.';
      }
    }
    if(refund>0){
      tCash(refund);
      costPaid-=refund;
    }
  }
  if(eff.morale)t.morale=Math.max(20,Math.min(100,(t.morale||65)+eff.morale));
  if(eff.quality)t.quality=Math.max(20,Math.min(100,(t.quality||50)+eff.quality));
  if(eff.loyalty)t._poachResist=(t._poachResist||0)+eff.loyalty/100;
  if(eff.suspendPeriods){t._suspended=(t._suspended||0)+eff.suspendPeriods;t._preSuspendQuality=t.quality;}
  if(eff.sell&&s)s.ops.sell=Math.max(0.20,Math.min(0.96,(s.ops.sell||0.65)+eff.sell));
  if(eff.stationShare&&s){COH.forEach(c=>{if(s.mom?.[c])s.mom[c].tgt=Math.max(0.001,s.mom[c].tgt+eff.stationShare);});}
  if(eff.identity&&s)s.identity=Math.max(0,Math.min(100,(s.identity||0)+eff.identity));
  if(eff.fine){tCash(-eff.fine);}
  const fireOpt=opt.cost==='buyout'||opt.label.toLowerCase().includes('fire')||opt.label.toLowerCase().includes('terminate');
  if(fireOpt){
    if(sd){sd.talent=null;sd.quality=Math.max(10,Math.round((sd.quality||30)*0.75));}
    s.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w,0));
  }
  const outcome=(opt.outcome||'Resolved.').replace(/{name}/g,t.name);
  G.news.unshift({v:'MEDIUM',t:`📋 ${scenario.title}: ${outcome}${costPaid>0?' Cost: '+f$(costPaid)+'.':''}${troubleOutcomeNote}`,y:G.year,p:G.period,iy:true});
  G.pendingDecisionEvent=null;
}

function resolveTrouble(sid,slot,optionIdx){
  if(!G.pendingDecisionEvent)return;
  const pending=G.pendingDecisionEvent;
  let appealRemote=null;
  if(pending.scenarioId==='fcc_indecency' && optionIdx===0){
    const fineAmt=50000;
    const roll=Math.random();
    let refund=0,note='';
    if(roll<0.60){
      refund = roll<0.25 ? fineAmt : Math.round(fineAmt*0.5);
      note = refund>=fineAmt
        ? ' Legal appeal succeeds — the FCC fine is dismissed.'
        : ` Legal appeal partially succeeds — ${f$(refund)} of the FCC fine is recovered.`;
    } else {
      note = ' Legal appeal fails — the FCC fine stands.';
    }
    appealRemote={refund,note};
  }
  applyTroubleResolution(sid,slot,optionIdx,appealRemote);
  MP.action('trouble_resolve',{sid,slot,optionIdx,appealRefund:appealRemote?.refund,appealNote:appealRemote?.note});
  cm('m-talent-trouble');
  renderAll();
}

window._mpApply_trouble_resolve=function({sid,slot,optionIdx,appealRefund,appealNote}){
  const p=G.pendingDecisionEvent;
  let ar=null;
  if(p?.scenarioId==='fcc_indecency'&&optionIdx===0){
    ar={refund:typeof appealRefund==='number'?appealRefund:0,note:appealNote||''};
  }
  applyTroubleResolution(sid,slot,optionIdx,ar);
};

/** Count talents with superstar flag in the current market. */
function countSuperstars(G){
  if(!G?.stations)return 0;
  let n=0;
  G.stations.forEach(st=>{
    if(!st.prog)return;
    DAYPART_SLOTS.forEach(sl=>{
      if(st.prog[sl]?.talent?.superstar)n++;
    });
  });
  return n;
}

/**
 * Promote/revoke talent.superstar across the market (max MAX_PER_MARKET).
 * Eligible: raw Q ≥ RAW_QUALITY_MIN, hybrid effQ ≥ QUALITY_THRESHOLD, tenure ≥ TENURE_THRESHOLD calendar years (periods/2).
 * effQ = round(rawQ×0.65 + slotQ×0.35) — blends personal ability with on-air slot strength without slot-only “fake” stars.
 * Tie-break: prime dayparts first (morning → afternoon → …), then effQ, then callsign/slot.
 */
function updateSuperstars(G){
  if(!G?.stations)return;
  const S=SUPERSTAR;
  const minPeriods=S.TENURE_THRESHOLD*2;
  G.stations.forEach(st=>{
    if(!st.prog)return;
    DAYPART_SLOTS.forEach(sl=>{
      const t=st.prog[sl]?.talent;
      if(t)t.superstar=false;
    });
  });
  const candidates=[];
  G.stations.forEach(st=>{
    if(st.isPublic||!st.prog)return;
    DAYPART_SLOTS.forEach(sl=>{
      const sd=st.prog[sl];
      const t=sd?.talent;
      if(!t)return;
      const rawQ=Math.round(t.quality||0);
      if(rawQ<S.RAW_QUALITY_MIN)return;
      const slotQ=Math.round(sd.quality||0);
      const effQ=Math.round(rawQ*0.65+slotQ*0.35);
      const ten=t.periodsAtStation||0;
      if(effQ<S.QUALITY_THRESHOLD||ten<minPeriods)return;
      candidates.push({
        st,slot:sl,t,
        q:effQ,
        dp:SUPERSTAR_DAYPART_ORDER[sl]??9,
      });
    });
  });
  candidates.sort((a,b)=>{
    if(a.dp!==b.dp)return a.dp-b.dp;
    if(b.q!==a.q)return b.q-a.q;
    const ca=`${a.st.callLetters||''}|${a.slot}`,cb=`${b.st.callLetters||''}|${b.slot}`;
    return ca.localeCompare(cb);
  });
  candidates.slice(0,S.MAX_PER_MARKET).forEach(({t})=>{t.superstar=true;});
}

function nonLocalDaypartCaption(fmt,slot,isPublic){
  if(isPublic)return 'PROGRAMMED';
  return vacantLabel(fmt,slot);
}
/** Competitor intel + market ranker: per-daypart talent name, Q, salary, or syndication/automation/public label */
function htmlOnAirTalentRoster(s){
  return DAYPART_SLOTS.map(sl=>{
    const sd=s.prog?.[sl];
    if(!sd)return '';
    const lbl=SL[sl];
    const t=sd.talent;
    const slotQ=Math.round(sd.quality||0);
    if(t){
      const tq=Math.round(t.quality||0);
      const salStr=(typeof t.salary==='number'&&!Number.isNaN(t.salary))?f$(t.salary)+'/yr':'—';
      const star=t.superstar===true?'⭐ ':'';
      return `<div class="sr" style="align-items:flex-start"><span class="lb" style="font-size:13px;letter-spacing:1px">${lbl}</span><span class="vl" style="font-size:15px;font-family:var(--ft);line-height:1.45"><strong style="font-weight:600;color:var(--wht)">${star}${t.name}</strong> · Q ${tq} · slot ${slotQ} · ${salStr}</span></div>`;
    }
    const cap=nonLocalDaypartCaption(s.format,sl,!!s.isPublic);
    return `<div class="sr"><span class="lb" style="font-size:13px;letter-spacing:1px">${lbl}</span><span class="vl" style="font-size:14px;color:var(--mut)"><em>${cap}</em> · slot Q ${slotQ}</span></div>`;
  }).join('');
}
/** Ranker modal footer only: all on-air talent in the market, quality desc (no per-station lineup duplication above). */
function htmlMarketTalentRankerList(){
  const rows=[];
  G.stations.forEach(st=>{
    if(!st.prog)return;
    DAYPART_SLOTS.forEach(sl=>{
      const tal=st.prog[sl]?.talent;
      if(!tal)return;
      const q=Math.round(tal.quality||0);
      rows.push({tal,st,sl,q});
    });
  });
  rows.sort((a,b)=>b.q-a.q);
  if(!rows.length)return '<p style="color:var(--mut);font-size:14px;font-style:italic">No on-air talent in the market yet.</p>';
  return rows.map(({tal,st,sl,q})=>{
    const star=tal.superstar===true?'⭐ ':'';
    return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:13px;font-family:var(--ft)">
      <span style="color:var(--off);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${star}<strong style="color:var(--wht)">${tal.name}</strong> <span style="color:var(--mut)">· ${SL[sl]} · ${callDisplay(st)}</span></span>
      <span style="color:var(--amb);flex-shrink:0;font-family:var(--fd);font-size:14px">Q ${q}</span>
    </div>`;
  }).join('');
}
const MQR=3000000,FMP0=.42; // MQR retained as legacy fallback; total market revenue is now scaled from MARKET_BILLING_CURVE

// ── ERA CURVES (smoothstep — replaces event-driven step function) ─
// Duncan's data: Atlanta FM share: 63% in 1980, 82% in 1990, 84% in 2003
// These curves match that real-world trajectory.
function _clamp01(x){return Math.max(0,Math.min(1,x));}
function _smoothstep(a,b,x){const t=_clamp01((x-a)/(b-a));return t*t*(3-2*t);}
function fmpForYear(year){
  // FM receiver penetration — calibrated to real history
  // 1970: ~20% (FM radios mostly home hi-fi, rare in cars)
  // 1977: FM car radios becoming common (40%+)
  // 1983: FM standard in most new cars (65%)
  // 1990: near-universal (85%)
  const base=0.20;
  const p1=_smoothstep(1970,1977,year)*0.25; // early adoption
  const p2=_smoothstep(1977,1983,year)*0.20; // car radio boom
  const p3=_smoothstep(1983,1990,year)*0.20; // saturation
  const p4=_smoothstep(1990,2000,year)*0.12; // final holdouts
  return _clamp01(base+p1+p2+p3+p4);
}
function streamForYear(year){
  if(year<2000)return 0;
  return _clamp01(0.02+_smoothstep(2000,2020,year)*0.58);
}
function amViabForYear(year){
  // AM music cultural viability — collapses post-1985, near-zero by 1998
  // Calibrated to Duncan data: AM music stations reformatting 1988-1997.
  // Last Atlanta AM music holdouts (WQXI/WPLO equivalents) gone by 1996-97.
  // Viability should hit near-zero ~1998; tiny floor (old gospel AMs, etc.) = 0.04.
  const v1=_smoothstep(1975,1988,year)*0.45; // steady erosion through late 80s
  const v2=_smoothstep(1988,1997,year)*0.51; // rapid collapse — last music AMs gone by ~1997
  return Math.max(0.04,1.0-v1-v2);
}
/**
 * Late-1970s FM music listening preference: stereo music and clean audio pull audiences
 * to FM as receiver penetration rises, while talk stays AM-weighted. Ramps mid-70s, full
 * by ~1979–86, then fades (FM is the default — no permanent artificial lift). Applied only
 * in appl() for full-power FM; does not affect revenue.
 */
function fmMusicEraPreferenceMult(s, year, fmp) {
  if (!s || s.isPublic || s.sig.type !== 'FM') return 1;
  if (['NEWS_TALK', 'SPORTS_TALK', 'PODCAST_TALK'].includes(s.format)) return 1;
  const strong = new Set(['TOP40', 'ALBUM_ROCK', 'BEAUTIFUL_MUSIC', 'ADULT_CONTEMP', 'SOUL_RNB', 'CHR', 'CLASSIC_ROCK', 'MOR', 'OLDIES', 'RHYTHMIC', 'HOT_AC', 'URBAN_CONTEMP', 'ALT_ROCK']);
  let fmtW = 0;
  if (strong.has(s.format)) fmtW = 1;
  else if (s.format === 'COUNTRY') fmtW = 0.55;
  else if (['SPANISH', 'GOSPEL', 'CLASSIC_HITS', 'ADULT_STANDARDS'].includes(s.format)) fmtW = 0.45;
  else return 1;
  const eraWindow = _smoothstep(1971, 1978, year) * (1 - _smoothstep(1986, 1992, year));
  const fmpRamp = _smoothstep(0.30, 0.58, fmp);
  const raw = 0.46 * eraWindow * fmpRamp * fmtW;
  return Math.min(1.5, 1 + raw);
}
// AQH engagement rates by cohort (from Arbitron methodology)
// Fraction of population in an average quarter-hour
const AQH_ENGAGE={
  // Fraction of cohort in an average quarter-hour. Pre-streaming, radio dominated.
  // Arbitron 1991 data: 18-34 had highest radio penetration of any demographic.
  // Raised 18-24 (.072→.092) and 25-34 (.065→.076) to reflect actual Arbitron
  // engagement levels. Post-2005, streamDrag erodes these cohorts hardest (already modeled).
  '12-17':.068,'18-24':.092,'25-34':.076,
  '35-49':.060,'50-64':.055,'65+':.048
};
// Format competition bleed: dense competition in same format reduces everyone's share
const FMT_COMPETITION={
  TOP40:['TOP40','SOUL_RNB','ALBUM_ROCK','CHR','RHYTHMIC','HOT_AC'],
  CHR:['CHR','TOP40','RHYTHMIC','HOT_AC'],
  COUNTRY:['COUNTRY','CLASSIC_HITS','OLDIES'],
  SOUL_RNB:['SOUL_RNB','TOP40','CHR','URBAN_CONTEMP','RHYTHMIC'],
  ALBUM_ROCK:['ALBUM_ROCK','TOP40','CLASSIC_ROCK','ALT_ROCK'],
  CLASSIC_ROCK:['CLASSIC_ROCK','ALBUM_ROCK'],
  ALT_ROCK:['ALT_ROCK','ALBUM_ROCK','CHR'],
  MOR:['MOR','ADULT_CONTEMP','CLASSIC_HITS','OLDIES','ADULT_STANDARDS'],
  ADULT_STANDARDS:['ADULT_STANDARDS','MOR','BEAUTIFUL_MUSIC','OLDIES'],
  ADULT_CONTEMP:['ADULT_CONTEMP','MOR','HOT_AC','CLASSIC_HITS','OLDIES'],
  HOT_AC:['HOT_AC','ADULT_CONTEMP','CHR'],
  BEAUTIFUL_MUSIC:['BEAUTIFUL_MUSIC','MOR'],
  CLASSIC_HITS:['CLASSIC_HITS','OLDIES','ADULT_CONTEMP','COUNTRY'],
  OLDIES:['OLDIES','CLASSIC_HITS','MOR'],
  GOSPEL:['GOSPEL','MOR'],
  NEWS_TALK:['NEWS_TALK','SPORTS_TALK'],
  SPORTS_TALK:['SPORTS_TALK','NEWS_TALK'],
  PODCAST_TALK:['PODCAST_TALK','NEWS_TALK'],
  URBAN_CONTEMP:['URBAN_CONTEMP','SOUL_RNB','RHYTHMIC'],
  RHYTHMIC:['RHYTHMIC','CHR','SOUL_RNB','URBAN_CONTEMP'],
};
const COMPETITION_BLEED=0.16; // per competing station, max 22% total bleed

const BRANDS={
  TOP40:['The Rocket','Power {FREQ}','The Pulse','Flash {FREQ}','The Buzz','Hit {FREQ}','{FREQ} Jams','Party {FREQ}'],
  COUNTRY:['The Wagon Wheel','Ranch Radio','The Heartland','Dixie {FREQ}','Country Roads','Big Country','Y-{FREQ}','The Bull'],
  SOUL_RNB:['The Soul Station','Groove {FREQ}','The Vibe','Soul City','The Sound','Silk {FREQ}','Old School {FREQ}'],
  MOR:['Easy {FREQ}','The Standard','Melody Radio','{FREQ} Gold','Soft {FREQ}','Beautiful {FREQ}','Mellow {FREQ}'],
  ADULT_STANDARDS:['The Standard','{FREQ} Classics','Memories {FREQ}','The Great Songs','{FREQ} Timeless','Easy {FREQ}','Forever {FREQ}'],
  NEWS_TALK:['News {FREQ}','Talk of the Town','The Voice','{CITY} Talks','{CITY} News Radio','Freedom {FREQ}','Patriot {FREQ}','{FREQ} Talk','The Truth','Real Talk {FREQ}','{FREQ} Opinion'],
  ALBUM_ROCK:['The Rock','Free {FREQ}','Album Radio','The Underground','Deep Tracks','The Planet','Raw {FREQ}'],
  BEAUTIFUL_MUSIC:['Soft {FREQ}','The Breeze','Easy Sounds','Smooth Radio','Mellow {FREQ}','Tranquil {FREQ}'],
  GOSPEL:['The Light','Gospel {FREQ}','The Word','Grace Radio','Praise {FREQ}','Heaven {FREQ}','Inspiration {FREQ}'],
  CHR:['Z-{FREQ}','Kiss {FREQ}','Hot {FREQ}','The Beat','Pop {FREQ}','{FREQ} Hits','{CITY} Pop'],
  CLASSIC_ROCK:['The Eagle','The Fox','Rock {FREQ}','Classic Rock {FREQ}','The Mountain','Thunder {FREQ}','The Hawk'],
  ADULT_CONTEMP:['Lite {FREQ}','Star {FREQ}','Sunny {FREQ}','The Mix','Soft Hits','Warm {FREQ}','{FREQ} Today'],
  URBAN_CONTEMP:['The Spot','Power {FREQ}','The Heat','Urban {FREQ}','Flavor {FREQ}','Fire {FREQ}'],
  SPORTS_TALK:['The Fan','Sports {FREQ}','ESPN {FREQ}','The Game','Sports Talk {FREQ}','The Lineup','The Blitz'],
  SPANISH:['La Mega','Latino {FREQ}','El Sol','La Raza','Ritmo {FREQ}','Fuego {FREQ}','La Kalle'],
  ALT_ROCK:['The Edge','X-{FREQ}','Alternative {FREQ}','The Buzz','Indie {FREQ}','The Ramp'],
  RHYTHMIC:['The Beat','Jammin {FREQ}','Hip Hop {FREQ}','The Banger','Urban Hits','{FREQ} Jams'],
  HOT_AC:['The Mix','Today\'s Hits','Fresh {FREQ}','The Vibe','Now {FREQ}','{FREQ} Now','Breeze {FREQ}'],
  OLDIES:['Oldies {FREQ}','Rock & Roll {FREQ}','{FREQ} Oldies','Super Oldies {FREQ}','Golden {FREQ}','The Memories','Sock Hop {FREQ}'],
  CLASSIC_HITS:['Classic Hits {FREQ}','The Vault','{FREQ} Throwback','{FREQ} Gold','The Classics','Magic {FREQ}','Rewind {FREQ}'],
  PODCAST_TALK:['The Feed','Talk Plus','Podcast {FREQ}','The Stream','Digital Talk'],
  PUBLIC_NEWS:['Public Radio','Community Radio','Metro Public Radio','{CITY} Public Radio','Public Broadcasting Radio'],
  PUBLIC_CLASSICAL:['Public Classical','Classical Radio','Jazz & Classical','Community Classical','Fine Arts Radio'],
};
// Resolve {FREQ} and {CITY} tokens in a brand name
function resolveBrand(brand, freq, city){
  const freqShort=(freq||'').replace(/ (AM|FM)$/,''); // "96.1" or "920"
  return brand.replace(/{FREQ}/g, freqShort).replace(/{CITY}/g, city||'City');
}
// Get format-aware brand suggestions for a station (with resolved tokens)
function getBrandSuggestions(s){
  const raw=BRANDS[s.format]||['Radio'];
  const city=G?.city||'Atlanta';
  return raw.map(b=>resolveBrand(b, s.freq, city));
}

// ── EVENT TIMELINE (period: 1=SPR, 2=FAL) ─────────────────────────
const EVDATA=[
  {y:1970,p:2,t:'FCC Pushes FM Stereo',d:'FM stereo adoption accelerates.',e:'fp+.04'},
  {y:1971,p:1,t:'Atlanta Population Boom',d:'Sun Belt growth surges. New ad dollars pour in.',e:'ad+.03'},
  {y:1971,p:2,t:'Nixon Wage-Price Freeze',d:'Economic controls tighten. Ad budgets cut.',e:'ad-.06'},
  {y:1972,p:1,t:'FM Car Radios Mainstream',d:'Automakers make FM standard. FM penetration accelerates.',e:'fp+.08'},
  {y:1973,p:1,t:'Watergate — News Surge',d:'Senate hearings dominate. News/Talk ratings spike.',e:'ntb'},
  {y:1973,p:2,t:'OPEC Oil Embargo',d:'Gas prices spike. Ad budgets slashed market-wide.',e:'ad-.09'},
  {y:1974,p:1,t:'Recession Deepens',d:'Stagflation hits. Ad revenue under sustained pressure.',e:'ad-.07'},
  {y:1975,p:2,t:'Economy Recovers',d:'Consumer confidence returns. Ad spending rebounds.',e:'ad+.10'},
  {y:1976,p:1,t:'Disco Breaks Through',d:'Disco explodes. Soul/R&B faces identity pressure.',e:'disco'},
  {y:1977,p:1,t:'FM Overtakes AM Nationally',d:'FM audience exceeds AM for the first time. Permanent shift.',e:'fp+.10'},
  {y:1978,p:1,t:'Saturday Night Fever',d:'The soundtrack sells 40 million copies. Disco owns FM. Album Rock and Soul/R&B both feel the squeeze.',e:'disco|ad+.06'},
  {y:1978,p:2,t:'FCC Drops Format Regulation',d:'The FCC eliminates its format diversity requirements. Stations are free to chase any audience they want. The era of pure market logic begins.',e:'ad+.03'},
  {y:1979,p:2,t:'Disco Backlash',d:'Disco Demolition Night. The format collapses. Rock benefits.',e:'anti-disco'},
  {y:1979,p:2,t:'Second Oil Crisis',d:'Iranian Revolution. Gas spikes. Ad budgets cut.',e:'ad-.07'},
  {y:1980,p:1,t:'Classic Rock Format Arrives',d:'Album Rock stations begin mining the catalog. New format unlocked.',e:'unlock-CLASSIC_ROCK|rival-CLASSIC_ROCK-FM-50kw-emerging'},
  {y:1980,p:2,t:'Adult Contemporary Arrives',d:'Soft hits format dominates 25–49 demo.',e:'unlock-ADULT_CONTEMP|rival-ADULT_CONTEMP-FM-50kw-moderate'},
  {y:1981,p:1,t:'Cable TV Competition',d:'Cable TV launches. Ad dollars begin diversifying.',e:'ad-.05'},
  {y:1981,p:2,t:'Reagan Recession',d:'Deep recession hits. Radio ad spending contracts.',e:'ad-.10'},
  {y:1982,p:2,t:'CHR Format Matures',d:'Contemporary Hit Radio becomes the dominant FM format.',e:'unlock-CHR|rival-CHR-FM-100kw-strong'},
  {y:1983,p:1,t:'Urban Contemporary Arrives',d:'R&B-pop crossover explodes. Atlanta bonus format.',e:'unlock-URBAN_CONTEMP|rival-URBAN_CONTEMP-FM-50kw-emerging'},
  {y:1983,p:1,t:'FM Dominates Music',d:'FM captures 70% of music listening. AM music stations face existential pressure.',e:'fp+.06'},
  {y:1975,p:1,t:'Talk Radio Emerges',d:'AM stations discover that talk can thrive on personalities and older demos FM cannot easily reach.',e:'rival-NEWS_TALK-AM-50kw-emerging'},
  {y:1981,p:1,t:'Adult Standards: Music of Your Life',d:'Gordon McLendon\'s syndicated format goes national — Sinatra, Ella, Nat King Cole on AM. A quiet audience nobody else wanted. Low shares, intensely loyal 55+ listeners. The format that never goes away.',e:'unlock-ADULT_STANDARDS|rival-ADULT_STANDARDS-AM-10kw-niche'},
  {y:1983,p:1,t:'MOR in Terminal Decline',d:'Middle of Road is dying on AM. FM ate the music audience. Survivors pivoting to News/Talk, Adult Contemporary, or Adult Standards.',e:'fmt_sunset:MOR:NEWS_TALK|rival-NEWS_TALK-AM-10kw-niche'},
  {y:1983,p:2,t:'Economy Roars Back',d:'Reagan boom. Ad spending surges.',e:'ad+.15'},
  {y:1983,p:2,t:'Oldies Format Emerges',d:'\u201950s & 60s rock & roll becomes its own format. WCBS-FM pioneering. Boomer nostalgia is a business.',e:'unlock-OLDIES|rival-OLDIES-AM-50kw-emerging'},
  {y:1984,p:1,t:'Olympics Ad Boom',d:'LA Olympics drives massive advertising demand.',e:'ad+.08'},
  {y:1985,p:1,t:'Beautiful Music Fades',d:'Lush orchestral formats aging out fast. Stations pivoting to Soft AC or Adult Contemporary.',e:'fmt_sunset:BEAUTIFUL_MUSIC:ADULT_CONTEMP'},
  {y:1986,p:2,t:'AM Stereo Fails',d:'The industry\'s last hope to save AM music. Listeners don\'t care. FM wins.',e:'fp+.05'},
  {y:1987,p:2,t:'Black Monday — Stock Crash',d:'Market collapses. Ad budgets frozen at many companies.',e:'ad-.08'},
  {y:1988,p:1,t:'Ad Market Rebounds',d:'A year after Black Monday, ad spending comes back stronger than expected. Radio benefits from TV\'s rising rates — local budgets flowing back to the dial.',e:'ad+.10'},
  {y:1988,p:2,t:'Soft AC Dominates',d:'Adult Contemporary has become the most-listened-to format in America. Stations targeting women 25-54 are printing money. The format war on FM is effectively over — until the next wave.',e:'ad+.04'},
  {y:1989,p:1,t:'FM Penetration Peaks',d:'FM reaches near-saturation. AM music is functionally dead.',e:'fp+.04'},
  {y:1990,p:1,t:'Sports Talk Goes National',d:'ESPN Radio launches. Sports Talk is now a real format.',e:'unlock-SPORTS_TALK|rival-SPORTS_TALK-AM-50kw-emerging'},
  {y:1990,p:2,t:'Gulf War News Surge',d:'24-hour coverage spikes talk radio ratings.',e:'ntb2'},
  {y:1991,p:1,t:'Alternative Rock Explodes',d:'Nirvana changes everything. Alternative format emerges.',e:'unlock-ALT_ROCK|rival-ALT_ROCK-FM-50kw-emerging'},
  {y:1991,p:2,t:'Recession — Ad Pullback',d:'Gulf War recession. Ad market contracts.',e:'ad-.08'},
  {y:1992,p:1,t:'Adult Standards Grows',d:'Adult Standards solidifies as an AM refuge — Sinatra, Ella, Nat King Cole. Low shares, intensely loyal 55+ audience. The format that never goes away.',e:'rival-ADULT_STANDARDS-AM-10kw-niche'},
  {y:1992,p:1,t:'FCC Expands Ownership',d:'FCC allows 2 AM + 2 FM per market. Acquisition window opens.',e:'fcc-1992'},
  {y:1992,p:2,t:'Spanish Radio Boom',d:'Hispanic population growth. Spanish-language radio unlocked.',e:'unlock-SPANISH|rival-SPANISH-AM-10kw-emerging'},
  {y:1993,p:2,t:'AM Music Collapses',d:'The last holdout music AMs reformat or go dark. FM is the only viable music signal.',e:'fp+.04'},
  {y:1993,p:2,t:'Rush Limbaugh Effect',d:'Talk radio audience explodes. News/Talk and Sports Talk benefit.',e:'talkboost'},
  {y:1994,p:1,t:'FCC Expands Further',d:'FCC allows 3 AM + 3 FM per market.',e:'fcc-1994'},
  {y:1994,p:2,t:'Economy Recovers Strong',d:'Clinton boom begins. Ad spending surges.',e:'ad+.12'},
  {y:1995,p:1,t:'Beautiful Music Extinct',d:'The last Beautiful Music stations have converted. Adult Contemporary is the successor format.',e:'fmt_purge:BEAUTIFUL_MUSIC'},
  {y:1996,p:1,t:'MOR Extinct',d:'Middle of Road no longer viable as a commercial format. The format is dead.',e:'fmt_purge:MOR'},
  {y:1996,p:1,t:'Telecom Act — Deregulation',d:'Ownership caps lifted. Up to 8 stations per market. Consolidation begins.',e:'fcc-1996'},
  {y:1997,p:1,t:'FM Saturation Complete',d:'97% of new cars have FM. A music AM in 1997 is a museum piece.',e:'fp+.03'},
  {y:1997,p:2,t:'Consolidation Wave',d:'Clear Channel and Infinity buying everything. Independents pressured.',e:'consolidate'},
  {y:1998,p:1,t:'Corporate Radio Peaks',d:'Clear Channel and Chancellor are buying stations faster than regulators can process the filings. Independent operators are getting offers they can\'t refuse. The era of local radio is ending.',e:'consolidate'},
  {y:1998,p:2,t:'Tech Ad Money Arrives',d:'Silicon Valley start-ups are buying radio time. The dot-com ad boom is starting to flood local markets. Revenue is climbing ahead of expectations.',e:'ad+.08'},
  {y:1999,p:1,t:'Dot-Com Ad Boom',d:'Tech companies flooding radio with ad dollars. Revenue peaks.',e:'ad+.20'},
  {y:2000,p:1,t:'New Formats Emerge',d:'Rhythmic CHR and Hot AC become dominant with younger demos.',e:'unlock-RHYTHMIC|unlock-HOT_AC|rival-RHYTHMIC-FM-100kw-emerging|rival-HOT_AC-FM-50kw-emerging'},
  {y:2001,p:1,t:'Dot-Com Bust',d:'Tech ad spending collapses. Radio revenue drops sharply.',e:'ad-.18'},
  {y:2001,p:2,t:'9/11 — News Surge',d:'News/Talk ratings spike dramatically.',e:'ntb3'},
  {y:2002,p:1,t:'Voice-Tracking Arrives',d:'Corporate groups roll out pre-recorded DJ tracks coast to coast. One personality now voices six markets. The live local DJ is becoming an endangered species.',e:'ad-.04'},
  {y:2002,p:2,t:'Country Surge',d:'Post-9/11 patriotism drives Country radio to record ratings. Toby Keith is everywhere. If you\'re in Country, this is your moment.',e:'ad+.05'},
  {y:2003,p:1,t:'Iraq War News Surge',d:'Another round of News/Talk ratings boost.',e:'ntb2'},
  {y:2004,p:1,t:'Satellite Radio Arrives',d:'XM and Sirius pull premium listeners. Quiet drag begins.',e:'sat+'},
  {y:2005,p:1,t:'Oldies Becomes Classic Hits',d:'Stations adding 70s & 80s, dropping \'Oldies\' branding. The music is getting younger.',e:'unlock-CLASSIC_HITS|fmt_sunset:OLDIES:CLASSIC_HITS|rival-CLASSIC_HITS-FM-50kw-emerging'},
  {y:2005,p:2,t:'Streaming Begins',d:'Pandora launches. Terrestrial revenue begins long decline.',e:'stream+'},
  {y:2006,p:1,t:'Economy Strong',d:'Mid-decade boom. Ad spending growing.',e:'ad+.08'},
  {y:2007,p:1,t:'HD Radio Fizzles',d:'The industry spent $500 million promoting HD Radio as the answer to satellite and streaming. Nobody bought the receivers. The last technical fix for terrestrial radio has failed.',e:'ad-.03'},
  {y:2008,p:1,t:'AM Talk Under Pressure',d:'Podcasts, streaming news apps, and satellite radio are eating into AM audiences. Pure AM Talk stations without FM simulcasts will face gradual share erosion through the 2010s. An FM simulcast or translator stops this immediately.',e:'amtalk_warn'},
  {y:2008,p:1,t:'Sirius-XM Merger',d:'Satellite consolidates. Drag on terrestrial intensifies.',e:'sat+'},
  {y:2008,p:2,t:'Financial Crisis',d:'Worst recession since 1930s. Ad spending collapses.',e:'ad-.25'},
  {y:2009,p:2,t:'Slow Recovery',d:'Green shoots. Ad market begins cautious recovery.',e:'ad+.06'},
  {y:2010,p:2,t:'Smartphone Radio',d:'iHeartRadio launches. Terrestrial content finds new distribution.',e:'stream+'},
  {y:2011,p:1,t:'Pandora Goes Public',d:'Pandora\'s IPO values the streaming service at $2.6 billion. For the first time, Wall Street is betting against terrestrial radio. The existential threat is now priced in.',e:'stream+'},
  {y:2011,p:2,t:'Talk Radio Polarizes',d:'AM Talk has become the loudest voice in American politics. Ratings are strong but the demo is aging and getting narrower. You\'re winning the argument and losing the audience.',e:'ad+.04'},
  {y:2012,p:1,t:'Podcast Era Begins',d:'Podcast listening goes mainstream. Hybrid talk format unlocked.',e:'unlock-PODCAST_TALK|rival-PODCAST_TALK-AM-10kw-niche'},
  {y:2012,p:2,t:'Oldies Format Extinct',d:'The last pure Oldies stations have converted. Classic Hits is the successor — or the demo is 75+ and the format is dying.',e:'fmt_purge:OLDIES'},
  {y:2012,p:2,t:'Streaming Accelerates',d:'Spotify growing fast. 18–34 demo drifting from terrestrial FM.',e:'stream+'},
  {y:2013,p:1,t:'Ad Market Recovers',d:'Digital ad spend growing. Radio holds share in local markets.',e:'ad+.08'},
  {y:2013,p:2,t:'AM Signal Becoming a Liability',d:'Clear Channel (now iHeart) and CBS Radio scramble to add FM simulcasts for their AM flagships. The AM signal quality gap vs. FM and streaming is now undeniable — even for dominant News/Talk and Sports stations.',e:'amtalk_warn2'},
  {y:2014,p:1,t:'Spotify Mainstream',d:'Spotify crosses 40 million active users. The 18-34 demo now has a credible alternative to FM for music. Radio still wins in the car — for now.',e:'stream+'},
  {y:2014,p:2,t:'Radio\'s Last Peak',d:'Broadcast radio will generate $17.4 billion this year — the last time the industry posts growth before a multi-year slide. If you\'re not positioned now, you won\'t be.',e:'ad+.06'},
  {y:2015,p:1,t:'Streaming Mainstream',d:'Half of all 18–34s now stream more than they listen to radio.',e:'stream+'},
  {y:2016,p:2,t:'Political Ad Bonanza',d:'Election year. News/Talk and local stations flooded with political spend.',e:'ntb2'},
  {y:2017,p:1,t:'Smart Speakers',d:'Amazon Echo and Google Home put a radio in every kitchen — but also Spotify, podcasts, and Pandora. Radio\'s smart speaker presence is strong. The competition is stronger.',e:'ad-.02'},
  {y:2017,p:2,t:'iHeart Debt Crisis',d:'iHeartMedia warns of possible bankruptcy — $20 billion in debt from the Clear Channel LBO. The consolidation era is eating itself. Highly-leveraged group owners are cutting costs everywhere.',e:'ad-.04'},
  {y:2018,p:1,t:'Podcast Advertising Boom',d:'Podcast ad revenue explodes. Podcast/Talk CPM rises further.',e:'podboost'},
  {y:2019,p:2,t:'Streaming Saturation',d:'Streaming has fundamentally reshaped radio economics.',e:'stream+'},
  {y:2020,p:1,t:'COVID-19 — Ad Collapse',d:'Pandemic. Ad spending collapses overnight. Drive-time audiences vanish.',e:'ad-.30'},
  {y:2020,p:2,t:'Campaign End',d:'50 years in Atlanta radio. The campaign is complete.',e:'end'},
];

const GRADE_TITLES={
  A:['Market Dominator','The Legend','Top Dog','Untouchable'],
  B:['Strong Performer','Solid Operator','Market Player','The Pro'],
  C:['Middling Manager','Surviving','Holding On','In the Pack'],
  D:['Struggling Broadcaster','Barely Afloat','On the Bubble','Under Pressure'],
  F:['Station Failure','Going Dark','Distress Sale','Bankrupt'],
};
const DECADE_NAMES={1979:'THE SEVENTIES',1989:'THE EIGHTIES',1999:'THE NINETIES',2009:'THE 2000s',2019:'THE 2010s',2020:'THE FULL ERA'};

// ── TALENT & GENERATION ───────────────────────────────────────────
const SAL={morningDrive:{entry:[12000,20000],mid:[22000,35000],star:[35000,60000]},afternoonDrive:{entry:[9000,16000],mid:[16000,26000],star:[26000,45000]},midday:{entry:[7000,12000],mid:[12000,20000],star:[20000,32000]},evening:{entry:[6000,10000],mid:[10000,17000],star:[17000,26000]},overnight:{entry:[5000,8000],mid:[8000,13000],star:[13000,20000]}};
const QRG={entry:[28,52],mid:[45,72],star:[68,92]};
const NF=['Jack','Bobby','Ray','Don','Mike','Larry','Gary','Jim','Dave','Steve','Tom','Bill','Frank','Gene','Roy','Earl','Betty','Carol','Sandra','Diane','Linda','Sharon','Pat','Ruth','Duke','Hank','Wanda','Al','Jerry','Ted','Maria','Carlos','Marcus','Keisha','Tanya','DeShawn','Renee'];
const NL=['Williams','Johnson','Davis','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia','Clark','Lewis','Walker','Hall','Young','King','Rivera','Washington','Brown'];
const gn=()=>{
  // Collect first names already in use across all stations in current market
  const usedFirst=new Set();
  if(typeof G!=='undefined'&&G?.stations){
    G.stations.forEach(st=>{
      if(!st.prog)return;
      Object.values(st.prog).forEach(sd=>{
        if(sd?.talent?.name){
          usedFirst.add(sd.talent.name.split(' ')[0]);
        }
      });
    });
  }
  const avail=NF.filter(f=>!usedFirst.has(f));
  const pool=avail.length?avail:NF; // fallback to full list if market is saturated
  return `${pick(pool)} ${pick(NL)}`;
};
let UC=new Set(),UB=new Set();
function gc(){const c='BCDFGJKLMNPRSTVXZ',a=c+'AEIOU';let s,t=0;do{s='W'+c[ri(0,c.length-1)]+a[ri(0,a.length-1)]+a[ri(0,a.length-1)];t++;}while(UC.has(s)&&t<200);UC.add(s);return s;}
function gb(f,freq,city){const p=BRANDS[f]||['Radio'],av=p.filter(b=>!UB.has(b));const raw=av.length?pick(av):p[0];const b=typeof resolveBrand==='function'?resolveBrand(raw,freq,city):raw;UB.add(raw);return b;}
const rnd=(a,b)=>Math.random()*(b-a)+a;
const ri=(a,b)=>Math.floor(rnd(a,b+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const f$=n=>'$'+(Math.abs(n)>=1000?Math.round(n/1000)+'K':Math.round(n).toLocaleString());
const pct=n=>(n*100).toFixed(1)+'%';
// Lightweight transient notification — uses alertbar briefly, then restores
function showToast(msg,type='info'){
  const ab=document.getElementById('alertbar');
  if(!ab)return;
  const prev={cls:ab.className,txt:ab.textContent,bg:ab.style.background,bc:ab.style.borderColor,col:ab.style.color};
  ab.className='on';
  ab.style.background=type==='warn'?'rgba(240,88,88,.15)':'rgba(80,180,120,.15)';
  ab.style.borderColor=type==='warn'?'var(--red)':'var(--grn)';
  ab.style.color=type==='warn'?'var(--red)':'var(--grn)';
  ab.textContent=msg;
  setTimeout(()=>{ab.className=prev.cls;ab.textContent=prev.txt;ab.style.background=prev.bg;ab.style.borderColor=prev.bc;ab.style.color=prev.col;},3500);
}
const qc=q=>q>=68?'good':q>=44?'warn':'poor';
function salInfl(base,year){
  // Three-phase talent inflation:
  // 1970-1985: inflation era + FM talent wars
  // 1985-2000: moderated growth
  // 2000+: digital era caps growth
  const p1=Math.max(0,Math.min(15,year-1970));
  const p2=Math.max(0,Math.min(15,year-1985));
  const p3=Math.max(0,year-2000);
  const m=1.0+p1*0.070+p2*0.035+p3*0.015;
  return Math.round(base*m/500)*500;
}

function eraTalentMult(year){
  // Early-70s: stronger compression so 1971 top morning Q~85 lands ~$22–26K (not $30K+); 1975+ unchanged from prior curve.
  if(year<=1970) return 0.42;
  if(year<=1971) return 0.48;
  if(year<=1972) return 0.54;
  if(year<=1973) return 0.60;
  if(year<=1974) return 0.70;
  if(year<=1977) return 0.74 + (year-1973)*0.055;
  if(year<=1980) return 0.96 + (year-1977)*0.0133;
  return 1.00;
}

function marketTalentMult(marketId){
  const mkt=MARKETS[marketId||ACTIVE_MARKET]||MARKETS.atlanta;
  const rs=typeof mkt.revScale==='number'?mkt.revScale:1.0;
  return Math.max(0.70, Math.min(1.35, 0.70 + rs*0.30));
}

function mkTal(slot,fmt,tier='mid',year=1970){
  const isTalkFmt = TALK_FMTS.includes(fmt);
  const isAllNews = fmt === 'ALL_NEWS';
  const talkDiscount = isAllNews ? 0.60
    : isTalkFmt ? (tier==='star'?0.92:tier==='mid'?0.72:0.62)
    : 1.0;

  if(!FM[fmt]||FM[fmt]?.public)return null;

  const sr=SAL[slot]?.[tier]||[15000,40000],qr=QRG[tier]||QRG.mid;
  const q=Math.round(rnd(qr[0],qr[1]));
  const ff={};Object.keys(FM).forEach(f=>{ff[f]=f===fmt?rnd(.70,.95):rnd(.12,.50);});

  const _rawSal = tier==='star'
    ? Math.max(rnd(sr[0],sr[1]), rnd(sr[0],sr[1]))
    : rnd(sr[0],sr[1]);
  const baseSal=Math.round(_rawSal/500)*500;
  const _careerStartYear=Math.max(1950, year-ri(0,18));

  const entryLo=SAL[slot]?.entry?.[0]||5000;
  const starHi=SAL[slot]?.star?.[1]||40000;
  const qNorm=Math.max(0,Math.min(1,q/100));
  const salSpan=starHi-entryLo;
  const salPos=qNorm*qNorm*(3-2*qNorm);
  const qualTarget=Math.round((entryLo+salSpan*salPos)/500)*500;

  let qualAdjSal=Math.round((qualTarget*0.82+baseSal*0.18)/500)*500;

  if(q<80) qualAdjSal=Math.round(qualAdjSal*0.85/500)*500;
  if(year>=1974 && year<=1978 && q<80) qualAdjSal=Math.round(qualAdjSal*0.90/500)*500;

  const marketId=(typeof G!=='undefined'&&G?.marketId)||ACTIVE_MARKET||'atlanta';
  let finalSal=Math.round(
    salInfl(qualAdjSal,year)
    * talkDiscount
    * eraTalentMult(year)
    * marketTalentMult(marketId)
  /500)*500;

  // Anchor new hires to on-air salaries for this daypart (same slot across the market).
  if(G?.stations?.length){
    const salz=[];
    for(let i=0;i<G.stations.length;i++){
      const v=G.stations[i]?.prog?.[slot]?.talent?.salary;
      if(typeof v==='number'&&!Number.isNaN(v)) salz.push(v);
    }
    if(salz.length>=3){
      const avg=salz.reduce((a,b)=>a+b,0)/salz.length;
      finalSal=Math.min(finalSal,avg*1.25);
    }
  }
  // Mild pool bias: entry/mid draw slightly below star ask (does not touch superstar scaling later).
  if(tier!=='star') finalSal*=0.90;
  finalSal=Math.round(finalSal/500)*500;

  return{
    id:Math.random().toString(36).substr(2,8),
    name:gn(fmt,year),
    slot,
    quality:q,
    formatFit:ff,
    salary:finalSal,
    cyr:ri(1,2),
    morale:Math.round(rnd(55,85)),
    _hireYear:year,
    _careerStartYear,
    superstar:false
  };
}

function mkPool(slot,fmt,year){
  // Collect all first names currently active in the market to avoid duplicates
  const usedFirstNames=new Set();
  if(G&&G.stations){
    G.stations.forEach(st=>{
      if(st.prog)Object.values(st.prog).forEach(sd=>{
        if(sd?.talent?.name)usedFirstNames.add(sd.talent.name.split(' ')[0]);
      });
    });
  }
  const pool=[];
  let attempts=0;
  for(const tier of['entry','mid','mid','star']){
    let t=null;
    do{t=mkTal(slot,fmt,tier,year);attempts++;}
    while(t&&usedFirstNames.has(t.name.split(' ')[0])&&attempts<30);
    if(t){usedFirstNames.add(t.name.split(' ')[0]);pool.push(t);}
  }
  return pool.sort((a,b)=>b.quality-a.quality);
}

/** Hire modal only: experience + rough remaining-career band (does not expose retirement triggers). */
function hireTalentCareerLine(t, year){
  const cs=t._careerStartYear;
  if(typeof cs!=='number'||Number.isNaN(cs))return '';
  const exp=Math.max(0, Math.floor(year-cs));
  const softCap=35;
  const rem=Math.max(0, softCap-exp);
  let band;
  if(rem>=22)band='~20–30+ yrs left';
  else if(rem>=15)band='~15–22 yrs left';
  else if(rem>=10)band='~10–15 yrs left';
  else if(rem>=5)band='~5–10 yrs left';
  else if(rem>=1)band='~1–5 yrs left';
  else band='~0–5 yrs left';
  return `<div style="font-size:13px;color:var(--mut);margin-top:2px;line-height:1.25">${exp} yrs experience · <span style="color:var(--off)">${band}</span></div>`;
}

// ══════════════════════════════════════════════════════════════════
// MARKETS — each city has its own population, station slate, and feel
// Atlanta is the shipped market. Others are scaffolded for expansion.
// ══════════════════════════════════════════════════════════════════
const MARKETS={
  atlanta:{
    id:'atlanta', label:'Atlanta', region:'Southeast',
    // 1970 metro pop by cohort (thousands — scaled to game universe)
    pop:{'12-17':180,'18-24':195,'25-34':210,'35-49':265,'50-64':220,'65+':130},
    // Market revenue baseline (relative to Atlanta=1.0)
    revScale:1.0,
    // Ad market growth curve relative to national (some markets over/underindex)
    adxBonus:0.02, // Atlanta grew faster than national avg in 70s-90s
    // Starting station count and power distribution
    amFreqs:['590 AM','640 AM','750 AM','860 AM','920 AM','1010 AM','1090 AM','1160 AM','1230 AM','1340 AM'],
    fmFreqs:['96.1 FM','99.7 FM','102.3 FM','104.5 FM','107.1 FM','94.9 FM','88.5 FM','101.5 FM','103.3 FM'],
  },
  // ── EXPANSION MARKETS (not yet active) ──────────────────────────
  chicago:{
    id:'chicago', label:'Chicago', region:'Midwest',
    pop:{'12-17':480,'18-24':510,'25-34':560,'35-49':700,'50-64':580,'65+':340},
    revScale:2.8, adxBonus:0.01,
    amFreqs:['720 AM','780 AM','890 AM','1000 AM','1160 AM','1200 AM','1390 AM','1490 AM','1590 AM','1690 AM'],
    fmFreqs:['93.1 FM','94.7 FM','96.3 FM','97.9 FM','99.5 FM','101.9 FM','103.5 FM','104.3 FM','105.9 FM'],
  },
  losangeles:{
    id:'losangeles', label:'Los Angeles', region:'West Coast',
    pop:{'12-17':820,'18-24':890,'25-34':980,'35-49':1200,'50-64':950,'65+':540},
    revScale:5.2, adxBonus:0.04,
    amFreqs:['570 AM','640 AM','710 AM','790 AM','980 AM','1070 AM','1150 AM','1230 AM','1430 AM','1580 AM'],
    fmFreqs:['93.5 FM','95.5 FM','97.1 FM','98.7 FM','100.3 FM','101.9 FM','102.7 FM','104.3 FM','105.1 FM'],
  },
  nashville:{
    id:'nashville', label:'Nashville', region:'South',
    pop:{'12-17':95,'18-24':110,'25-34':120,'35-49':150,'50-64':125,'65+':75},
    revScale:0.5, adxBonus:0.03, // Country music capital — country formats get +15% here
    amFreqs:['650 AM','760 AM','1040 AM','1160 AM','1240 AM','1300 AM','1400 AM','1470 AM','1510 AM','1560 AM'],
    fmFreqs:['94.1 FM','96.3 FM','97.9 FM','100.1 FM','102.9 FM','104.5 FM','107.5 FM'],
  },
};
const ACTIVE_MARKET='atlanta'; // Future: set per game session
const MARKET_BILLING_CURVE={1970:14000000,1975:24000000,1980:42000000,1985:68000000,1987:82000000,1990:100000000,1995:130000000,2000:160000000,2005:148000000,2010:130000000,2015:116000000,2020:110000000};
function marketAnnualBilling(year,marketId){
  const mkt=MARKETS[marketId||ACTIVE_MARKET]||MARKETS[ACTIVE_MARKET]||{revScale:1};
  const ys=Object.keys(MARKET_BILLING_CURVE).map(Number).sort((a,b)=>a-b);
  if(year<=ys[0])return Math.round(MARKET_BILLING_CURVE[ys[0]]*(mkt.revScale||1));
  if(year>=ys[ys.length-1])return Math.round(MARKET_BILLING_CURVE[ys[ys.length-1]]*(mkt.revScale||1));
  for(let i=1;i<ys.length;i++){
    const y0=ys[i-1],y1=ys[i];
    if(year<=y1){
      const t=(year-y0)/(y1-y0);
      const v=MARKET_BILLING_CURVE[y0]+(MARKET_BILLING_CURVE[y1]-MARKET_BILLING_CURVE[y0])*t;
      return Math.round(v*(mkt.revScale||1));
    }
  }
  return Math.round(MARKET_BILLING_CURVE[1987]*(mkt.revScale||1));
}
function marketHalfSeasonFactor(year,period){
  const base=period===2?1.04:0.96;
  const election=(period===2&&year%2===0)?1.03:1.00;
  return base*election;
}
// Sync POP.cohorts to the active market — the static POP constant is a fallback only.
// All AQH calculations read POP.cohorts, so this must run before any ratings work.
(function syncMarketPop(){
  const mkt=MARKETS[ACTIVE_MARKET]||MARKETS.atlanta;
  if(mkt?.pop) Object.keys(mkt.pop).forEach(c=>{if(POP.cohorts[c])POP.cohorts[c].t=mkt.pop[c]*1000;});
})();

// ══════════════════════════════════════════════════════════════════
// MULTIPLAYER STUB — Socket.io integration points
// Single-player: MP.mode='solo', all actions execute locally
// Multiplayer: MP.mode='live', actions emit to server, state arrives via socket
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// MULTIPLAYER SYSTEM
// ══════════════════════════════════════════════════════════════════
const MP = {
  mode: 'solo',       // 'solo' | 'live'
  playerId: null,     // 0=host, 1-3=guests (numeric index in players array)
  socketId: null,     // this socket's id
  roomId: null,
  socket: null,
  isHost: false,
  players: [],        // [{socketId, name, playerId, ready, connected}]
  commitLog: {},      // {socketId: bool}
  _chatOpen: false,
  _unreadChat: 0,

  // ── emit to server ──────────────────────────────────────────────
  emit(event, payload) {
    if (this.mode !== 'live' || !this.socket) return;
    this.socket.emit(event, { roomId: this.roomId, ...payload });
  },

  // ── broadcast player action ─────────────────────────────────────
  // Call this from every do*() function that mutates G.
  // In solo: no-op. In live: tells server (and other clients) what happened.
  action(action, payload) {
    if (this.mode !== 'live') return;
    // Host includes current G so server can persist mid-period state on every action.
    // This ensures rejoiners get settings like progBudget, salesForce, etc.
    this.emit('player_action', { action, payload, G: this.isHost ? G : undefined });
  },

  // ── handle incoming action from another player ──────────────────
  applyRemoteAction(envelope) {
    const { action, payload, playerId } = envelope;
    // Remote actions are applied directly — no UI modal flow needed.
    // Merge playerId into payload so handlers know which player sent the action.
    if (typeof window['_mpApply_' + action] === 'function') {
      window['_mpApply_' + action]({ ...payload, _fromPlayerId: playerId });
      renderAll();
    }
  },

  // ── period commit status ─────────────────────────────────────────
  renderStatus() {
    if (this.mode !== 'live') return;
    const bar = document.getElementById('mp-statusbar');
    if (!bar) return;
    bar.style.display = 'block';
    const names = this.players.map(p =>
      `<span style="color:${p.socketId===this.socketId?'var(--amb)':p.connected?'#fff':'var(--mut)'}">${p.name}${this.commitLog[p.socketId]?' ✓':''}</span>`
    ).join(' &nbsp;·&nbsp; ');
    const committed = Object.values(this.commitLog).filter(Boolean).length;
    const total = this.players.filter(p=>p.connected).length;
    document.getElementById('mp-status-players').innerHTML = names;
    document.getElementById('mp-status-commits').textContent = `${committed}/${total} committed`;
    document.getElementById('mp-status-room').textContent = `ROOM ${this.roomId}`;
    // NEXT PERIOD button: only host can advance, only when all committed
    const btn = document.getElementById('abtn');
    if (this.isHost) {
      const totalExpected = this.players.length;
      const connectedPlayers = this.players.filter(p=>p.connected);
      const allConnected = connectedPlayers.length >= Math.min(2, totalExpected);
      const nonHost = this.players.filter(p=>p.connected && p.socketId !== this.socketId);
      const guestsReady = nonHost.every(p=>this.commitLog[p.socketId]);
      const guestCount = nonHost.length;
      const guestCommitted = nonHost.filter(p=>this.commitLog[p.socketId]).length;
      const notYetJoined = this.players.filter(p=>!p.connected && p.socketId !== this.socketId);
      btn.disabled = !guestsReady || !allConnected;
      btn.textContent = !allConnected
        ? `⏳ WAITING FOR ${notYetJoined.map(p=>p.name).join(', ')} TO REJOIN`
        : guestsReady
          ? '▶ ADVANCE PERIOD'
          : `⏳ WAITING ${guestCommitted}/${guestCount}`;
    } else {
      const alreadyCommitted = !!this.commitLog[this.socketId];
      btn.disabled = alreadyCommitted;
      btn.textContent = alreadyCommitted ? '✓ READY — WAITING FOR HOST' : '▶ END TURN';
    }
  },
};


// ══════════════════════════════════════════════════════════════════
// MULTIPLAYER DRAFT SYSTEM
// ══════════════════════════════════════════════════════════════════

// Draft state (client-side mirror of server draft object)
const DRAFT = {
  order: [],        // [socketId, socketId, ...] snake order
  pickIdx: 0,
  picks: {},        // {socketId: [stationId, ...]}
  phase: 'first',   // 'first' | 'second' | 'done'
  G: null,          // the pre-draft market state
};

// Era descriptions for the lobby
const ERA_DESC = {
  '1970': 'Start in 1970 Atlanta — AM dominates, FM is wide open. Full 50-year arc.',
  '1978': 'Start in 1978 — FM just passed AM in total audience. The format wars are beginning.',
  '1985': 'Start in 1985 — CHR wars peak, AM is fading fast, consolidation on the horizon.',
};

function mpPickEra(era) {
  document.getElementById('mp-era').value = era;
  document.getElementById('mp-era-desc').textContent = ERA_DESC[era] || '';
  ['1970','1978','1985'].forEach(e => {
    const btn = document.getElementById('mp-era-' + e);
    if (btn) btn.className = e === era ? 'abt g' : 'abt';
  });
}

// ── DIFFICULTY RATING ─────────────────────────────────────────────
function stationDifficulty(s) {
  const share = s.rat?.share || 0;
  if (share > 0.10) return { stars: 1, label: '★ EASY',   color: 'var(--grn)' };
  if (share > 0.05) return { stars: 2, label: '★★ MED',   color: 'var(--amb)' };
  if (share > 0.02) return { stars: 3, label: '★★★ HARD', color: '#f87171' };
  return              { stars: 3, label: '★★★ HARD', color: '#f87171' };
}

// VP underdog bonus based on difficulty
function underdogVP(s) {
  const d = stationDifficulty(s);
  return d.stars === 1 ? 0 : d.stars === 2 ? 2 : 5;
}

// ── STARTING CASH PER ERA ─────────────────────────────────────────
const DRAFT_CASH = { '1970': 800000, '1978': 1200000, '1985': 2000000 };

// ── STATION MARKET VALUE (for 2nd station purchase cost) ──────────
function draftStationPrice(s) {
  const annualRev = (s.fin?.rev || 50000) * 2;
  const multiple = s.sig?.type === 'FM' ? 9 : 6;
  return Math.round(annualRev * multiple / 50000) * 50000;
}

// ── OPEN DRAFT SCREEN ─────────────────────────────────────────────
function mpOpenDraft(draftData, players, era) {
  Object.assign(DRAFT, draftData);
  DRAFT.G = G; // G is already set from draft_started event

  document.getElementById('mp-draft').style.display = 'block';
  document.getElementById('mp-lobby').style.display = 'none';

  const cash = DRAFT_CASH[era] || 800000;
  document.getElementById('draft-subtitle').textContent =
    `${era} ATLANTA  ·  ${players.length} PLAYERS  ·  SNAKE DRAFT  ·  STARTING CASH ${f$(cash)}`;
  document.getElementById('draft-cash-show').textContent = f$(cash);

  mpRenderDraft(players, era);
}

// ── RENDER DRAFT STATE ────────────────────────────────────────────
function mpRenderDraft(players, era) {
  const draft = DRAFT;
  const mySocketId = MP.socketId;
  const currentPicker = draft.order[draft.pickIdx];
  const isMyTurn = currentPicker === mySocketId;
  const isDone = draft.pickIdx >= draft.order.length || draft.phase === 'done';

  // ── Order strip ───────────────────────────────────────────────
  const orderStrip = document.getElementById('draft-order-strip');
  if (orderStrip) {
    orderStrip.innerHTML = draft.order.map((sid, i) => {
      const p = players.find(pl => pl.socketId === sid);
      const isPast = i < draft.pickIdx;
      const isCurrent = i === draft.pickIdx && !isDone;
      return `<div style="padding:4px 10px;font-size:14px;letter-spacing:1px;
        background:${isCurrent?'var(--amb)':isPast?'#1a1a1a':'#111'};
        color:${isCurrent?'#000':isPast?'#444':'var(--mut)'};
        border:1px solid ${isCurrent?'var(--amb)':'#222'};white-space:nowrap">
        ${p?.name || '?'}${i >= draft.order.length/2 ? ' ②' : ' ①'}
      </div>`;
    }).join('');
  }

  // ── Banner ────────────────────────────────────────────────────
  const banner = document.getElementById('draft-banner-text');
  if (isDone) {
    banner.innerHTML = `<span style="color:var(--grn)">✓ Draft complete.</span> ${MP.isHost ? 'Click START GAME below to begin.' : 'Waiting for host to start the game…'}`;
  } else {
    const pickerPlayer = players.find(p => p.socketId === currentPicker);
    const roundLabel = draft.pickIdx < players.length ? 'ROUND 1' : 'ROUND 2 (optional 2nd station)';
    banner.innerHTML = isMyTurn
      ? `<span style="color:var(--amb)">YOUR PICK</span> — ${roundLabel}. Click a station below.`
      : `<span style="color:var(--mut)">${pickerPlayer?.name || '?'} is picking… (${roundLabel})</span>`;
  }

  // ── Station cards ─────────────────────────────────────────────
  const allPicked = Object.values(draft.picks).flat();
  const playerStations = G ? G.stations.filter(s => s&&!s._bpSlotDeferred&&!s.isPublic) : [];

  const cards = document.getElementById('draft-cards');
  if (cards) {
    cards.innerHTML = playerStations.map(s => {
      const pickedBy = players.find(p => (draft.picks[p.socketId]||[]).includes(s.id));
      const isPicked = !!pickedBy;
      const isMyStation = (draft.picks[mySocketId]||[]).includes(s.id);
      const canPick = isMyTurn && !isPicked && !isDone &&
        (draft.pickIdx < draft.order.length);
      // In round 2, can only pick if I haven't already passed or picked
      const myPickCount = (draft.picks[mySocketId]||[]).length;
      const isRound2 = draft.pickIdx >= players.length;
      // Enforce 1 AM + 1 FM max: check what sig types I've already picked
      const myPickedStations = (draft.picks[mySocketId]||[]).map(id => playerStations.find(st=>st.id===id)).filter(Boolean);
      const myAMCount = myPickedStations.filter(st => st.sig?.type==='AM').length;
      const myFMCount = myPickedStations.filter(st => st.sig?.type==='FM').length;
      const thisSigType = s.sig?.type === 'FM' ? 'FM' : 'AM';
      const wouldExceedSigLimit = (thisSigType==='AM' && myAMCount>=1) || (thisSigType==='FM' && myFMCount>=1);
      const canPickRound2 = isRound2 && myPickCount < 2 && !isPicked && !wouldExceedSigLimit;

      const diff = stationDifficulty(s);
      const vp = underdogVP(s);
      const price = draftStationPrice(s);
      const share = ((s.rat?.share || 0) * 100).toFixed(1);
      const fmt = FM[s.format]?.l || s.format;

      return `<div onclick="${canPick || canPickRound2 ? `mpDraftPick('${s.id}')` : ''}"
        style="background:${isMyStation?'rgba(245,166,35,.08)':isPicked?'rgba(255,255,255,.03)':'#111'};
               border:1px solid ${isMyStation?'var(--amb)':isPicked?'#1a1a1a':'#2a2a2a'};
               padding:16px;border-radius:2px;cursor:${canPick||canPickRound2?'pointer':'default'};
               opacity:${isPicked&&!isMyStation?'.45':'1'};
               transition:border-color .15s,background .15s;
               ${canPick||canPickRound2?'hover:border-color:var(--amb)':''}"
        onmouseover="if(${canPick||canPickRound2})this.style.borderColor='var(--amb)'"
        onmouseout="if(${canPick||canPickRound2})this.style.borderColor='#2a2a2a'">

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-size:16px;color:${isMyStation?'var(--amb)':'#fff'};letter-spacing:1px">${s.callLetters}</div>
            <div style="font-size:14px;color:var(--mut)">${s.sig?.type} · ${s.sig?.pw} · ${(s.str||'').toUpperCase()}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:14px;color:${diff.color}">${diff.label}</div>
            ${vp > 0 ? `<div style="font-size:14px;color:var(--grn)">+${vp} VP bonus</div>` : ''}
          </div>
        </div>

        <div style="font-size:14px;color:var(--off);margin-bottom:6px">${fmt}</div>
        <div style="font-size:15px;color:var(--mut);margin-bottom:2px">${share}% share · ${f$(s.fin?.rev||0)}/period</div>
        <div style="font-size:14px;color:#444">2nd station cost: ${f$(price)}</div>

        ${isPicked ? `<div style="margin-top:8px;font-size:14px;color:${isMyStation?'var(--amb)':'var(--mut)'};letter-spacing:1px">
          ${isMyStation ? '✓ YOUR STATION' : `PICKED BY ${pickedBy?.name?.toUpperCase()}`}</div>` : ''}
        ${canPick ? `<div style="margin-top:8px;font-size:14px;color:var(--amb);letter-spacing:1px">▶ CLICK TO PICK</div>` : ''}
        ${canPickRound2 ? `<div style="margin-top:8px;font-size:14px;color:var(--amb);letter-spacing:1px">▶ BUY FOR ${f$(price)}</div>` : ''}
        ${isRound2 && !isPicked && !isMyStation && wouldExceedSigLimit ? `<div style="margin-top:8px;font-size:14px;color:var(--mut);letter-spacing:1px">— ALREADY HAVE ${thisSigType}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ── Second station pass button ─────────────────────────────────
  const secondWrap = document.getElementById('draft-second-wrap');
  if (secondWrap) {
    const isMyRound2 = currentPicker === mySocketId &&
      draft.pickIdx >= players.length &&
      draft.pickIdx < draft.order.length;
    secondWrap.style.display = isMyRound2 ? 'block' : 'none';
  }

  // ── Draft log ─────────────────────────────────────────────────
  // (appended separately in mpDraftPickMade)

  // ── Host: show start button when done ─────────────────────────
  if (isDone && MP.isHost) {
    const banner = document.getElementById('draft-banner');
    if (banner && !document.getElementById('draft-start-btn')) {
      const btn = document.createElement('button');
      btn.id = 'draft-start-btn';
      btn.className = 'abt g';
      btn.style = 'margin-top:12px;padding:12px 32px;font-size:15px;width:100%';
      btn.textContent = '▶ START GAME';
      btn.onclick = mpDraftFinalize;
      banner.appendChild(btn);
    }
  }
}

// ── MAKE A PICK ───────────────────────────────────────────────────
function mpDraftPick(stationId) {
  if (!MP.socket) return;
  MP.socket.emit('draft_pick', { roomId: MP.roomId, stationId });
}

function mpDraftPass() {
  if (!MP.socket) return;
  MP.socket.emit('draft_pass', { roomId: MP.roomId });
}

// ── RECEIVE A PICK (from server broadcast) ────────────────────────
function mpDraftPickMade({ socketId, playerId, playerName, stationId, draft }) {
  Object.assign(DRAFT, draft);
  const players = MP.players;
  const era = document.getElementById('mp-era')?.value || '1970';

  // Update log
  const log = document.getElementById('draft-log');
  if (log) {
    const s = stationId ? G.stations.find(st => st.id === stationId) : null;
    const entry = stationId
      ? `<div><span style="color:var(--amb)">${playerName}</span> picks <strong style="color:#fff">${s?.callLetters || stationId}</strong> (${FM[s?.format]?.l || '?'})</div>`
      : `<div style="color:var(--mut)">${playerName} passes on a second station.</div>`;
    log.innerHTML += entry;
    log.scrollTop = log.scrollHeight;
  }

  mpRenderDraft(players, era);
}

// ── FINALIZE DRAFT (host only) ────────────────────────────────────
function mpDraftFinalize() {
  if (!MP.isHost || !MP.socket) return;
  const players = MP.players;
  const era = document.getElementById('mp-era')?.value || '1970';
  const cash = DRAFT_CASH[era] || 800000;

  // Apply picks to G: mark stations as player-owned
  players.forEach(p => {
    const stationIds = DRAFT.picks[p.socketId] || [];
    stationIds.forEach((sid, idx) => {
      const s = G.stations.find(st => st.id === sid);
      if (!s) return;
      s.isPlayer = true;
      s._mpOwner = p.playerId;  // which player owns this station
      s.color = ['#f5a623','#60a5fa','#34d399','#f87171'][p.playerId % 4];
      // Set player-specific cash (first station free, second costs market rate)
      if (idx === 0) {
        if (!G._playerCash) G._playerCash = {};
        G._playerCash[p.playerId] = cash;
        // Record each player's actual starting cash for scoreCalc baseline
        if (!G._draftStartCash) G._draftStartCash = {};
        G._draftStartCash[p.playerId] = cash;
      } else {
        // Deduct 2nd station cost from their cash
        const price = draftStationPrice(s);
        if (!G._playerCash) G._playerCash = {};
        G._playerCash[p.playerId] = (G._playerCash[p.playerId] || cash) - price;
        if (!G._draftStartCash) G._draftStartCash = {};
        G._draftStartCash[p.playerId] = G._playerCash[p.playerId];
      }
      // Apply underdog VP bonus
      const vp = underdogVP(s);
      if (vp > 0) {
        if (!G._underdogVP) G._underdogVP = {};
        G._underdogVP[p.playerId] = (G._underdogVP[p.playerId] || 0) + vp;
      }
    });
  });

  // For the host (player 0), set G.cash to their starting amount
  const hostStations = DRAFT.picks[MP.socketId] || [];
  G.cash = G._playerCash?.[0] || cash;
  G.ps = G.stations.filter(s => s.isPlayer);

  // Each player will set their own G.cash when they receive game_started
  // Store _playerCash in G so guests can read it
  migrateSave(G);

  MP.socket.emit('draft_complete', { roomId: MP.roomId, G });
}

// ── MP HELPER: this player's stations only ──────────────────────
function myPS() {
  if (!G || !G.ps) return [];
  if (MP.mode !== 'live') return G.ps;
  return G.ps.filter(s => s._mpOwner === MP.playerId);
}

// ── NEXT PERIOD ROUTER ────────────────────────────────────────────
// Solo: just run advTurn()
// MP host: run advTurn() (only when all players committed — button is gated)
// MP guest: commit to server, wait for host to advance
function mpHandleNextPeriod() {
  if (MP.mode === 'solo') {
    advTurn();
  } else {
    // Both host and guest commit the same way
    // Server fires run_advturn to host once everyone committed
    mpCommit();
  }
}

// ── LOBBY FUNCTIONS ──────────────────────────────────────────────
function mpOpenLobby() {
  document.getElementById('mp-lobby').style.display = 'block';
  // If browser has a stored MP session, pre-fill rejoin tab and switch to it
  try {
    const saved = JSON.parse(localStorage.getItem('wl_mp_session') || 'null');
    if (saved?.roomId && saved?.name) {
      document.getElementById('mp-player-name').value = saved.name;
      document.getElementById('mp-rejoin-code').value = saved.roomId;
      document.getElementById('mp-server-url').value  = saved.serverUrl || 'http://localhost:3000';
      mpShowTab('rejoin');
      document.getElementById('mp-connect-status').textContent =
        `Last session: room ${saved.roomId} · Connect to rejoin`;
    }
  } catch(e) {}
}
function mpCloseLobby() {
  document.getElementById('mp-lobby').style.display = 'none';
}
function mpShowTab(tab) {
  ['create','join','rejoin'].forEach(t => {
    const panel = document.getElementById(`mp-${t}-tab`);
    const btn   = document.getElementById(`mp-tab-${t}`);
    if (panel) panel.style.display = t===tab ? 'block' : 'none';
    if (btn)   { btn.style.color = t===tab ? 'var(--amb)' : 'var(--mut)'; btn.style.borderBottomColor = t===tab ? 'var(--amb)' : 'transparent'; }
  });
}
function mpShowError(msg) {
  document.getElementById('mp-cj-error').textContent = msg;
}

function mpRejoinRoom() {
  if (!MP.socket) { mpShowError('Not connected to server.'); return; }
  const name = document.getElementById('mp-player-name').value.trim();
  const code = document.getElementById('mp-rejoin-code').value.trim().toUpperCase();
  if (!name) { mpShowError('Enter the name you used originally.'); return; }
  if (code.length !== 6) { mpShowError('Room code must be 6 characters.'); return; }
  // Store name so server can match the player slot
  // Include stored playerId so server can match slot reliably
  let savedPlayerId = null;
  try { savedPlayerId = JSON.parse(localStorage.getItem('wl_mp_session') || 'null')?.playerId ?? null; } catch(e){}
  MP.socket.emit('rejoin_room', { roomId: code, name, playerId: savedPlayerId });
}


function mpSaveSession() {
  try {
    localStorage.setItem('wl_mp_session', JSON.stringify({
      roomId:    MP.roomId,
      playerId:  MP.playerId,
      name:      document.getElementById('mp-player-name')?.value?.trim() || '',
      serverUrl: document.getElementById('mp-server-url')?.value?.trim() || 'http://localhost:3000',
      savedAt:   Date.now(),
    }));
  } catch(e) {}
}
function mpClearSession() {
  try { localStorage.removeItem('wl_mp_session'); } catch(e) {}
}
// ── CONNECT TO SERVER ─────────────────────────────────────────────
function mpConnect() {
  const url = document.getElementById('mp-server-url').value.trim();
  const status = document.getElementById('mp-connect-status');
  status.textContent = 'Connecting…';
  status.style.color = 'var(--mut)';

  // Load socket.io from server dynamically
  const scriptTag = document.createElement('script');
  scriptTag.src = url + '/socket.io/socket.io.js';
  scriptTag.onload = () => {
    try {
      const socket = io(url, { transports: ['websocket', 'polling'] });
      MP.socket = socket;

      socket.on('connect', () => {
        status.textContent = '✓ Connected · Enter your name to create or join a room';
        status.style.color = 'var(--grn)';
        const cbtn = document.getElementById('mp-connect-btn');
        if (cbtn) cbtn.style.display = 'none';
        document.getElementById('mp-cj-panel').style.display = 'block';
        mpSetupSocketHandlers(socket);
      });
      socket.on('disconnect', () => {
        status.textContent = '✗ Disconnected — click CONNECT to retry';
        status.style.color = 'var(--red)';
        const cbtn = document.getElementById('mp-connect-btn');
        if (cbtn) cbtn.style.display = 'inline-block';
        document.getElementById('mp-cj-panel').style.display = 'none';
      });
      socket.on('connect_error', (err) => {
        status.textContent = '✗ Could not connect: ' + err.message;
        status.style.color = 'var(--red)';
      });
    } catch(e) {
      status.textContent = '✗ Error: ' + e.message;
      status.style.color = 'var(--red)';
    }
  };
  scriptTag.onerror = () => {
    status.textContent = '✗ Could not reach server. Is it running?';
    status.style.color = 'var(--red)';
  };
  document.head.appendChild(scriptTag);
}

function mpSetupSocketHandlers(socket) {
  // ── Room state update ──────────────────────────────────────────
  socket.on('room_state', (state) => {
    MP.players = state.players;
    MP.commitLog = state.commitLog || {};
    MP.roomId = state.roomId;

    const waiting = document.getElementById('mp-waiting-panel');
    const cj = document.getElementById('mp-cj-panel');
    if (waiting.style.display !== 'none') {
      mpRenderWaitingRoom(state);
    }
    MP.renderStatus();
  });

  // ── Room created (I am host) ───────────────────────────────────
  socket.on('room_created', ({ roomId, playerId, socketId }) => {
    MP.roomId = roomId;
    MP.playerId = playerId;
    MP.socketId = socketId;
    MP.isHost = true;
    MP.mode = 'live';
    document.getElementById('mp-cj-panel').style.display = 'none';
    document.getElementById('mp-waiting-panel').style.display = 'block';
    document.getElementById('mp-room-display').textContent = roomId;
    document.getElementById('mp-host-controls').style.display = 'block';
    document.getElementById('mp-guest-waiting').style.display = 'none';
  });

  // ── Room joined (I am guest) ───────────────────────────────────
  socket.on('room_joined', ({ roomId, playerId, socketId }) => {
    MP.roomId = roomId;
    MP.playerId = playerId;
    MP.socketId = socketId;
    MP.isHost = false;
    MP.mode = 'live';
    document.getElementById('mp-cj-panel').style.display = 'none';
    document.getElementById('mp-waiting-panel').style.display = 'block';
    document.getElementById('mp-room-display').textContent = roomId;
    document.getElementById('mp-host-controls').style.display = 'none';
    document.getElementById('mp-guest-waiting').style.display = 'block';
  });

  // ── Join/start errors ──────────────────────────────────────────
  socket.on('join_error', (msg) => mpShowError(msg));
  socket.on('start_error', (msg) => mpShowError(msg));

  // ── Rejoined mid-game ──────────────────────────────────────────
  socket.on('room_rejoined', ({ roomId, playerId, socketId, isHost, G: savedG, players, commitLog }) => {
    MP.roomId    = roomId;
    MP.playerId  = playerId;
    MP.socketId  = socketId;
    // Trust server's isHost flag — server now assigns by playerId not arrival order
    MP.isHost    = isHost;
    MP.mode      = 'live';
    MP.players   = players;
    MP.commitLog = commitLog || {};

    // Restore game state
    G = savedG;
    migrateSave(G);

    // Restore this player's cash from per-player tracking
    if (G._playerCash?.[playerId] !== undefined) {
      G.cash = G._playerCash[playerId];
    }
    // Restore this player's loans view
    if (G._playerLoans?.[playerId]) {
      G.loans = G._playerLoans[playerId];
    } else {
      G.loans = [];
    }

    mpSaveSession();
    mpCloseLobby();
    renderAll();

    document.getElementById('mp-statusbar').style.display = 'block';
    document.getElementById('mp-chat-wrap').style.display = 'block';
    document.getElementById('mp-chat-input-row').style.display = 'flex';
    MP.renderStatus();

    G.news.unshift({
      v: 'MEDIUM',
      t: `📡 Reconnected to room ${roomId} — ${isHost ? 'you are the host.' : 'waiting for host to advance.'}`,
      y: G.year, p: G.period
    });
    renderAll();
  });

  // ── Another player reconnected ─────────────────────────────────
  socket.on('player_reconnected', ({ playerId, name }) => {
    if (G) {
      G.news.unshift({ v: 'LOW', t: `📡 ${name} reconnected.`, y: G.year, p: G.period });
      renderAll();
    }
    MP.renderStatus();
  });

  // ── Draft started ──────────────────────────────────────────────
  socket.on('draft_started', ({ G: draftG, players, draft, era }) => {
    MP.players = players;
    G = draftG;
    migrateSave(G);
    mpCloseLobby();
    mpOpenDraft(draft, players, era);
  });

  // ── Draft pick made (by anyone) ────────────────────────────────
  socket.on('draft_pick_made', (data) => {
    mpDraftPickMade(data);
  });

  // ── Game started — receive initial G ──────────────────────────
  socket.on('game_started', ({ G: incomingG, players }) => {
    MP.players = players;
    MP.commitLog = {};
    players.forEach(p => { MP.commitLog[p.socketId] = false; });
    mpSaveSession();
    // Close draft screen if open
    document.getElementById('mp-draft').style.display = 'none';
    mpCloseLobby();
    // Apply received G
    G = incomingG;
    migrateSave(G);
    // Set this player's starting cash and loans from the draft result
    if (G._playerCash && G._playerCash[MP.playerId] !== undefined) {
      G.cash = G._playerCash[MP.playerId];
    }
    if (G._playerLoans?.[MP.playerId]) {
      G.loans = G._playerLoans[MP.playerId];
    } else {
      G.loans = [];
    }
    // Apply underdog VP bonus immediately
    if (G._underdogVP && G._underdogVP[MP.playerId]) {
      // Store for display — actual VP scoring happens in advTurn
      G._myUnderdogVP = G._underdogVP[MP.playerId];
    }
    renderAll();
    // Show chat and status bar
    document.getElementById('mp-statusbar').style.display = 'block';
    document.getElementById('mp-chat-wrap').style.display = 'block';
    document.getElementById('mp-chat-input-row').style.display = 'flex';
    MP.renderStatus();
    G.news.unshift({v:'HIGH', t:`🎙 Multiplayer game started — ${players.length} stations in the market.`, y:G.year, p:G.period});
    renderAll();
  });

  // ── Incoming action from another player ───────────────────────
  socket.on('action_broadcast', (envelope) => {
    if (envelope.socketId === MP.socketId) return; // my own action echoed back — already applied
    MP.applyRemoteAction(envelope);
  });

  // ── Player committed ──────────────────────────────────────────
  socket.on('player_committed', ({ socketId, commitLog }) => {
    MP.commitLog = commitLog;
    MP.renderStatus();
  });

  // ── Host: run advTurn ─────────────────────────────────────────
  socket.on('run_advturn', ({ roomId }) => {
    if (!MP.isHost) {
      // Server thinks we're host but client disagrees — or vice versa.
      // Self-correct: if we receive run_advturn, we ARE the host for this turn.
      console.warn('[MP] run_advturn received but MP.isHost=false — self-correcting to host');
      MP.isHost = true;
      G.news.unshift({v:'LOW', t:'📡 Host role confirmed.', y:G?.year||0, p:G?.period||0});
    }
    const btn = document.getElementById('abtn');
    if (btn) { btn.disabled = true; btn.textContent = '⚙ PROCESSING…'; }
    advTurn();
  });

  // ── State broadcast from host ─────────────────────────────────
  socket.on('state_broadcast', ({ G: newG, decadeYear, sumData }) => {
    if (MP.isHost) return; // host already has the new state
    G = newG;
    migrateSave(G);
    // Restore this player's own cash and loans from shared state
    if (G._playerCash && G._playerCash[MP.playerId] !== undefined) {
      G.cash = G._playerCash[MP.playerId];
    }
    if (G._playerLoans?.[MP.playerId]) {
      G.loans = G._playerLoans[MP.playerId];
    } else {
      G.loans = G.loans || [];
    }
    renderAll();
    MP.commitLog = {};
    MP.players.forEach(p => { MP.commitLog[p.socketId] = false; });
    MP.renderStatus();
    // Show period-end summary for guest with their own profit figure
    if (sumData) {
      const myProfit = myPS().reduce((s,st) => s + st.fin.ebitda, 0);
      setTimeout(() => showSum(myProfit, sumData.ev, sumData.acts, sumData.alerts, sumData.wasYear, sumData.wasPeriod), 300);
    }
    // Decade grade modal — per-player score
    if (decadeYear) {
      const myPScore = G._playerScore?.[MP.playerId];
      const baseSc = myPScore?.decadeScores?.[decadeYear] || G.score.decadeScores[decadeYear];
      if (baseSc) {
        // Use the pre-computed per-player score stored by host's advTurn
        const guestSc = myPScore?.decadeScores?.[decadeYear] || baseSc;
        setTimeout(() => showGrade(decadeYear, guestSc), sumData ? 950 : 650);
      }
    }
    // Load milestones from host broadcast — only show ones belonging to this player
    if (sumData?.milestones?.length) {
      sumData.milestones
        .filter(m => m.owner === undefined || m.owner === MP.playerId)
        .forEach(m => MILESTONE_Q.push(m));
    }
    if (MILESTONE_Q.length) setTimeout(flushMilestones, 900);
  });

  // ── Host migrated ─────────────────────────────────────────────
  socket.on('host_migrated', ({ newHostId, playerId }) => {
    // playerId-based check is more reliable than socketId match (socketId changes on reconnect)
    const amNewHost = (newHostId === MP.socketId) || (playerId !== undefined && playerId === MP.playerId);
    MP.isHost = amNewHost;
    if (MP.isHost) {
      G.news.unshift({v:'HIGH', t:'📡 You are the host — you control period advancement.', y:G.year, p:G.period});
      renderAll();
    }
    MP.renderStatus();
  });

  // ── Player disconnect ─────────────────────────────────────────
  socket.on('player_disconnected', ({ playerId, name }) => {
    if (G) {
      G.news.unshift({v:'LOW', t:`📡 ${name} disconnected from the game.`, y:G?.year||1970, p:G?.period||1});
      renderAll();
    }
    MP.renderStatus();
  });

  // ── Chat ──────────────────────────────────────────────────────
  socket.on('chat_message', ({ from, playerId, text }) => {
    const msgs = document.getElementById('mp-chat-msgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.innerHTML = `<strong style="color:var(--amb)">${from}:</strong> ${text}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    if (!MP._chatOpen) {
      MP._unreadChat++;
      const badge = document.getElementById('mp-chat-badge');
      if (badge) { badge.style.display = 'block'; badge.textContent = MP._unreadChat; }
    }
  });
}

// ── WAITING ROOM RENDER ───────────────────────────────────────────
function mpRenderWaitingRoom(state) {
  const list = document.getElementById('mp-player-list');
  if (!list) return;
  list.innerHTML = state.players.map(p =>
    `<div style="padding:8px 0;border-bottom:1px solid #1a1a1a;font-size:15px;display:flex;justify-content:space-between">
      <span style="color:${p.connected?'#fff':'var(--mut)'}">${p.name || 'Player ' + (p.playerId+1)}
        ${p.socketId===MP.socketId?' <span style="color:var(--amb);font-size:14px">(you)</span>':''}
        ${p.playerId===0?' <span style="color:var(--mut);font-size:14px">HOST</span>':''}
      </span>
      <span style="color:${p.connected?'var(--grn)':'var(--red)'};font-size:14px">${p.connected?'●':'○'}</span>
    </div>`
  ).join('');

  // Enable start button when 2+ connected
  if (MP.isHost) {
    const connected = state.players.filter(p=>p.connected).length;
    const btn = document.getElementById('mp-start-btn');
    if (btn) {
      btn.disabled = connected < 2;
      btn.style.opacity = connected >= 2 ? '1' : '.4';
    }
  }
}

// ── CREATE / JOIN ─────────────────────────────────────────────────
function mpCreateRoom() {
  if (!MP.socket) { mpShowError('Not connected to server.'); return; }
  const name = document.getElementById('mp-player-name').value.trim() || 'Host';
  MP.socket.emit('create_room', { name });
}

function mpJoinRoom() {
  if (!MP.socket) { mpShowError('Not connected to server.'); return; }
  const name = document.getElementById('mp-player-name').value.trim() || 'Guest';
  const code = document.getElementById('mp-room-code').value.trim().toUpperCase();
  if (code.length !== 6) { mpShowError('Room code must be 6 characters.'); return; }
  MP.socket.emit('join_room', { roomId: code, name });
}

// ── START GAME (host) ──────────────────────────────────────────────
function mpStartGame() {
  if (!MP.isHost || !MP.socket || !MP.socket.connected || MP.mode !== 'live') {
    alert('Not connected. Please wait for "✓ Connected" status before starting.');
    return;
  }
  const era = document.getElementById('mp-era').value;
  // Generate market with NO player stations — draft will assign them
  G = genMarketMP(era);
  migrateSave(G);
  // Tell server to start draft phase (broadcasts G + player list to all clients)
  MP.socket.emit('start_draft', { roomId: MP.roomId, era, G });
}

// Generate a market with all stations as AI (no isPlayer set)
function genMarketMP(era) {
  // Map era to a neutral base scenario that just sets the year
  const eraMap = { '1970':'under', '1978':'fmrev', '1985':'chrwar' };
  const scenId = eraMap[era] || 'under';
  const sc = SC.find(s => s.id === scenId);
  // Temporarily blank out sc.idx so genMarket doesn't mark any station as player
  const origIdx = sc.idx;
  sc.idx = [];
  const newG = genMarket(scenId);
  sc.idx = origIdx; // restore
  // All stations are rivals — none are player-controlled yet
  newG.stations.forEach(s => { s.isPlayer = false; });
  newG.ps = [];
  // Replace scenario-specific opening news with neutral MP message
  newG.news = [{v:'LOW', t:`Atlanta radio, ${newG.year}. The draft is complete — your station is live.`, y:newG.year, p:1}];
  return newG;
}

// ── COMMIT PERIOD ─────────────────────────────────────────────────
// Called by non-host players instead of advTurn()
function mpCommit() {
  if (MP.mode !== 'live') return;
  // Save this player's cash into shared state so it survives the broadcast
  if (G && !G._playerCash) G._playerCash = {};
  if (G) G._playerCash[MP.playerId] = G.cash;
  MP.emit('player_cash_update', { playerId: MP.playerId, cash: G.cash });
  MP.commitLog[MP.socketId] = true;
  MP.emit('commit_period', { roomId: MP.roomId });
  MP.renderStatus();
}

// ── HOST: BROADCAST STATE AFTER advTurn ───────────────────────────
// Called at the end of advTurn() when in multiplayer host mode
function mpBroadcastState(decadeYear, sumData) {
  if (MP.mode !== 'live' || !MP.isHost) return;
  MP.emit('state_update', { G, decadeYear: decadeYear || null, sumData: sumData || null });  // decadeScore computed guest-side from _playerScore
  // Reset: everyone must commit again next period
  MP.commitLog = {};
  MP.players.forEach(p => { MP.commitLog[p.socketId] = false; });
  MP.renderStatus();
}

// ── CHAT ──────────────────────────────────────────────────────────
function mpToggleChat() {
  MP._chatOpen = !MP._chatOpen;
  const body = document.getElementById('mp-chat-body');
  const input = document.getElementById('mp-chat-input-row');
  if (body) body.style.display = MP._chatOpen ? 'block' : 'none';
  if (input) input.style.display = MP._chatOpen ? 'flex' : 'none';
  if (MP._chatOpen) {
    MP._unreadChat = 0;
    const badge = document.getElementById('mp-chat-badge');
    if (badge) badge.style.display = 'none';
  }
}
function mpSendChat() {
  const inp = document.getElementById('mp-chat-in');
  const text = inp?.value?.trim();
  if (!text) return;
  MP.emit('chat', { text });
  inp.value = '';
}

// ── REMOTE ACTION APPLIERS ────────────────────────────────────────
// These are called when we receive another player's action broadcast.
// They apply the state mutation directly, without opening any UI modals.
// Naming: window['_mpApply_' + action](payload)

// Format change by another player
window._mpApply_fmt = function({ sid, format }) {
  const s = G.stations.find(st=>st.id===sid);
  if (!s) return;
  const _talkFmts=['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'];
  s.ops.sell = _talkFmts.includes(format) ? 0.60 : 0.55;
  s._formatAge = 0;
  s.format = format;
  s.brand = gb(format, s.freq, G?.city);
  calcRev(s, G);
};

// Hire talent by another player
window._mpApply_hire = function({ sid, slot, talent }) {
  const s = G.stations.find(st=>st.id===sid);
  if (!s || !s.prog[slot]) return;
  s.prog[slot].talent = talent;
  s.oq = Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w, 0));
};

// Fire talent
window._mpApply_fire = function({ sid, slot }) {
  const s = G.stations.find(st=>st.id===sid);
  if (!s) return;
  if (s.prog[slot]) s.prog[slot].talent = null;
  s.oq = Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w, 0));
};

// Sell station
window._mpApply_sell = function({ sid }) {
  const s = G.stations.find(st=>st.id===sid);
  if(s){ s.isPlayer=false; s._mpOwner=undefined; s.color=s.color||'#6b7280'; }
  G.ps = G.stations.filter(s=>s.isPlayer);
};

// Poach talent
window._mpApply_poach = function({ sid, slot, rivalId, talentId }) {
  const s = G.stations.find(st=>st.id===sid);
  const rival = G.stations.find(st=>st.id===rivalId);
  if (!s || !rival) return;
  const t = rival.prog[slot]?.talent;
  if (!t) return;
  rival.prog[slot].talent = null;
  if (s.prog[slot]) s.prog[slot].talent = t;
};

// Drift adjustment
window._mpApply_drift = function({ sid, fmt, val }) {
  const s = G.stations.find(st=>st.id===sid);
  if (s) s.drift[fmt] = val;
};

// Rename
window._mpApply_rename = function({ sid, callLetters, brand }) {
  const s = G.stations.find(st=>st.id===sid);
  if (s) { s.callLetters = callLetters; s.brand = brand; }
};

// Stream launch
window._mpApply_stream = function({ sid }) {
  const s = G.stations.find(st=>st.id===sid);
  if (s && s.stream) { s.stream.active = true; s.stream.launchYear = G.year; calcRev(s, G); }
};

// Simulcast create/break
window._mpApply_sim = function({ sid, partnerId }) {
  // Same semantics as doSim: sid = programming source, partnerId = receiver.
  if(!applySimulcastPair(sid, partnerId, { suppressNews: true }))return;
  const src=G.stations.find(st=>st.id===sid), dst=G.stations.find(st=>st.id===partnerId);
  logSimulcastPairHistory(src,dst,G);
};
window._mpApply_breaksim = function({ sid }) {
  breakSimulcast(G, sid);
};

// Identity investment
window._mpApply_ident = function({ sid, budget }) {
  const s = G.stations.find(st=>st.id===sid);
  if (s) s.identityBudget = budget;
};

// Loan / repay
window._mpApply_sales = function({ sid, level }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  s.salesForce = { level, periodsHeld: 0 }; renderAll();
};
window._mpApply_spots = function({ sid, spots }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  s.ops.spots = spots; calcRev(s, G); renderAll();
};
window._mpApply_promo = function({ sid, promo }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  s.ops.promo = promo; calcRev(s, G); renderAll();
};
window._mpApply_prog = function({ sid, progBudget }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  if(!s.ops) s.ops={}; s.ops.progBudget = progBudget; renderAll();
};
/** Cross-station talent move: mutates G, news, history, recomputes OQ on both stations. */
function applyTalentCrossStationXferFull(fromSid, fromSlot, toSid, toSlot) {
  const src = G.stations.find(st => st.id === fromSid);
  const dst = G.stations.find(st => st.id === toSid);
  if (!src || !dst || fromSid === toSid) return false;
  const fromSd = src.prog[fromSlot], toSd = dst.prog[toSlot];
  if (!fromSd?.talent || toSd?.talent) return false;
  const talA = fromSd.talent;
  const adjDip = 0.10;
  const fit = t => t.formatFit[dst.format] || 0.3;
  const boost = t => Math.round((t.quality / 100) * fit(t) * 0.35 * 18);
  toSd.talent = talA;
  toSd.quality = Math.min(100, Math.max(10, Math.round((toSd.quality || 30) * (1 - adjDip))) + boost(talA));
  fromSd.talent = null;
  const pen = { morningDrive: .20, afternoonDrive: .14, midday: .09, evening: .06, overnight: .03 }[fromSlot] || .09;
  fromSd.quality = Math.max(10, Math.round(fromSd.quality * (1 - pen)));
  src.oq = Math.round(Object.entries(SW).reduce((sum, [sl, w]) => sum + effSlotQForOq(src.prog[sl]) * w, 0));
  dst.oq = Math.round(Object.entries(SW).reduce((sum, [sl, w]) => sum + effSlotQForOq(dst.prog[sl]) * w, 0));
  G.news.unshift({ v: 'LOW', t: `${talA.name} moves from ${callDisplay(src)} ${SL[fromSlot]} to ${callDisplay(dst)} ${SL[toSlot]}.`, y: G.year, p: G.period });
  logHistory(src, 'TALENT', `Transferred ${talA.name} to ${callDisplay(dst)} ${SL[toSlot]}`, G);
  logHistory(dst, 'TALENT', `Received ${talA.name} from ${callDisplay(src)} ${SL[fromSlot]}`, G);
  return true;
}
window._mpApply_shuffle = function({ sid, fromSlot, toSlot }) {
  // Apply swap logic directly — do NOT call doShuffle (would re-broadcast + open modal)
  const s = G.stations.find(st => st.id === sid); if (!s) return;
  const fromSd = s.prog[fromSlot], toSd = s.prog[toSlot];
  if (!fromSd?.talent) return;
  const talA = fromSd.talent, talB = toSd?.talent || null;
  const isSwap = !!talB;
  const adjDip = isSwap ? 0.05 : 0.08;
  const fit = t => t.formatFit[s.format] || 0.3;
  const boost = t => Math.round((t.quality / 100) * fit(t) * 0.35 * 18);
  toSd.talent = talA;
  toSd.quality = Math.min(100, Math.max(10, Math.round((toSd.quality || 30) * (1 - adjDip))) + boost(talA));
  if (isSwap) {
    fromSd.talent = talB;
    fromSd.quality = Math.min(100, Math.max(10, Math.round((fromSd.quality || 30) * (1 - adjDip))) + boost(talB));
  } else {
    fromSd.talent = null;
    const pen = {morningDrive:.20,afternoonDrive:.14,midday:.09,evening:.06,overnight:.03}[fromSlot] || .09;
    fromSd.quality = Math.max(10, Math.round(fromSd.quality * (1 - pen)));
  }
  s.oq = Math.round(Object.entries(SW).reduce((sum, [sl, w]) => sum + effSlotQForOq(s.prog[sl]) * w, 0));
  // renderAll() is called by applyRemoteAction after this returns
};
window._mpApply_talent_xfer = function({ fromSid, fromSlot, toSid, toSlot, _fromPlayerId }) {
  if (MP.mode === 'live') {
    const owns = id => G.ps.some(st => st.id === id && st._mpOwner === _fromPlayerId);
    if (_fromPlayerId === undefined || !owns(fromSid) || !owns(toSid)) return;
  }
  applyTalentCrossStationXferFull(fromSid, fromSlot, toSid, toSlot);
};
window._mpApply_extend = function({ sid, slot, years, newSalary }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  const t = s.prog[slot]?.talent; if(!t) return;
  t.salary = newSalary; t.cyr = years*2; t.morale = Math.min(100,(t.morale||50)+10);
  renderAll();
};
window._mpApply_bonus = function({ sid, slot, amount, boost }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  const t = s.prog[slot]?.talent; if(!t) return;
  t.morale = Math.min(100,(t.morale||50)+(boost||15));
  renderAll();
};
window._mpApply_letexpire = function({ sid, slot }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  const t = s.prog[slot]?.talent; if(!t) return;
  t._letExpire = true; t.morale = Math.max(20,(t.morale||50)-15);
  renderAll();
};
window._mpApply_lean = function({ sid, val }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  s.demoLean = val;
  if(s.simulcastWith){ const p=G.stations.find(st=>st.id===s.simulcastWith); if(p) p.demoLean=val; }
  renderAll();
};
window._mpApply_fmbooster = function({ sid }) {
  // Apply the same station mutations that doFmBooster does on the host
  const s = G.stations.find(st=>st.id===sid);
  if(s && s.sig.type==='AM' && !s.fmBooster){
    s.fmBooster = true;
    s._boosterOrigSig = {type:s.sig.type, pw:s.sig.pw, reach:s.sig.reach, universe:s.sig.universe};
    s.sig.type = 'FM';
    s.sig.pw = 'translator';
    // Pick an FM frequency not already in use
    const fmFreqs=['92.3 FM','93.7 FM','96.9 FM','98.3 FM','101.1 FM','105.3 FM','106.7 FM'];
    const usedFm=G.stations.map(st=>st.freq||st._deferFreq).filter(Boolean);
    const newFm=fmFreqs.find(f=>!usedFm.includes(f))||'107.9 FM';
    s._boosterOrigFreq=s.freq;
    s.freq=newFm;
  }
  renderAll();
};
window._mpApply_migrate = function({ amId, fmId }) {
  applyFmSimulcastMigration(amId, fmId);
};
window._mpApply_acq = function({ sid, playerId, color }) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  s.isPlayer=true;
  s._mpOwner = playerId;
  s.color = color || ['#f5a623','#60a5fa','#34d399','#f87171'][(playerId||0)%4];
  // Clear corp ownership if any
  s.corpOwner=null; s.corpName=null; s.corpColor=null;
  G.ps=G.stations.filter(st=>st.isPlayer); renderAll();
};
window._mpApply_loan = function({ tierId, amount, owed, label, rate, periods, takenYear, interestPerPeriod, _fromPlayerId }) {
  // Host stores guest's loan in _playerLoans so playerScoreCalc can include debt penalty
  if(_fromPlayerId === undefined) return;
  if(!G._playerLoans) G._playerLoans = {};
  if(!G._playerLoans[_fromPlayerId]) G._playerLoans[_fromPlayerId] = [];
  const loanKey = tierId + (takenYear || G.year);
  if(G._playerLoans[_fromPlayerId].some(l=>l.tierId===tierId)) return; // already have it
  G._playerLoans[_fromPlayerId].push({tierId, id:loanKey, label:label||'Loan', amount:amount||0,
    owed:owed||0, rate:rate||0, periods:periods||4, takenYear:takenYear||G.year,
    interestPerPeriod:interestPerPeriod||0});
};
window._mpApply_repay = function({ loanKey, _fromPlayerId }) {
  if(_fromPlayerId === undefined) return;
  if(G._playerLoans?.[_fromPlayerId])
    G._playerLoans[_fromPlayerId] = G._playerLoans[_fromPlayerId].filter(l=>(l.id+'')!==(loanKey+''));
};



const BP=[
  // idx 0: AM Top40 dominant 50kw
  {type:'AM',fmt:'TOP40',    pw:'50kw',str:'dominant'},
  // idx 1: AM Top40 strong 50kw  (Underdog)
  {type:'AM',fmt:'TOP40',    pw:'50kw',str:'strong'},
  // idx 2: AM Country dominant 50kw  (Country Roads)
  {type:'AM',fmt:'COUNTRY',  pw:'50kw',str:'dominant'},
  // idx 3: AM Soul/RnB strong 10kw  (Soul City)
  {type:'AM',fmt:'SOUL_RNB', pw:'10kw',str:'strong'},
  // idx 4: AM MOR dominant 50kw — the clear-channel giant (WSB/WPTF/WGN equivalent)
  // Sole dominant MOR in the market; no format competition from other 50kw MOR
  {type:'AM',fmt:'MOR',      pw:'50kw',str:'dominant'},
  // idx 5: AM News/Talk emerging 50kw  (Stack AM)
  {type:'AM',fmt:'NEWS_TALK',pw:'50kw',str:'emerging'},
  // idx 6: AM Gospel niche 5kw
  {type:'AM',fmt:'GOSPEL',   pw:'5kw', str:'niche'},
  // idx 7: FM Album Rock emerging 100kw
  {type:'FM',fmt:'ALBUM_ROCK',     pw:'100kw',str:'emerging'},
  // idx 8: FM Beautiful Music moderate 50kw  (Stack FM)
  {type:'FM',fmt:'ADULT_CONTEMP',  pw:'50kw', str:'moderate'}, // replaced BEAUTIFUL_MUSIC (extinct by 1995)
  // idx 9: FM Album Rock moderate 25kw  (FM Pioneer — cult following, but unmonetized)
  {type:'FM',fmt:'ALBUM_ROCK',     pw:'25kw',str:'moderate'},

  // ── MARKET DEPTH (indices 10-17) ─────────────────────────────────
  // Spring 1970 start uses ~13 on-air commercials + 5 BP slots deferred to 1972–76
  // (see ATLANTA_1970_DEFERRED_LAUNCHES). Duncan data shows by 1998 only ~6 AMs
  // survive with ratings — all non-music (NT/Sports/Talk/Gospel/Standards).
  // AM music stations die or flip formats through the 70s-90s naturally.
  // Rivals here are constructed to create that arc realistically.

  // idx 10: AM Top40 50kw strong — the youth challenger (WQXI equivalent)
  // WQXI was a real Atlanta powerhouse; went 7.5 share in '79, gone by early 90s
  {type:'AM',fmt:'TOP40',      pw:'50kw',str:'strong'},

  // idx 11: AM Soul/RnB 5kw moderate — second Black-format AM (WIGO/WERD equivalent)
  // These flipped to Talk/Gospel/Urban by mid-80s as FM Soul took their audience
  {type:'AM',fmt:'SOUL_RNB',   pw:'5kw', str:'moderate'},

  // idx 12: AM Gospel 5kw niche — Southern daytimer gospel staple
  // Gospel was one of the few AM formats that survived into the 2000s
  {type:'AM',fmt:'GOSPEL',     pw:'5kw', str:'niche'},

  // idx 13: AM Country 10kw/DA moderate — second country station, runs DA (daytime only at full power)
  // Country AM fled to FM by mid-80s; this will erode and flip
  {type:'AM',fmt:'COUNTRY',    pw:'DA',str:'moderate'},

  // idx 14: FM Beautiful Music 50kw moderate — easy-listening FM already on air by 1970
  // Will sunset naturally as the format dies off in the mid-to-late 80s
  {type:'FM',fmt:'BEAUTIFUL_MUSIC',pw:'50kw',str:'moderate'},

  // idx 15: FM Album Rock 50kw moderate — second AOR station, fighting for 18-34 men
  {type:'FM',fmt:'ALBUM_ROCK',  pw:'50kw',str:'moderate'},

  // idx 16: FM Country 50kw emerging — FM country starts showing up in the late 70s
  // This is the WYAY/WKHX equivalent; emerges as AM country fades
  {type:'FM',fmt:'COUNTRY',     pw:'50kw',str:'emerging'},

  // idx 17: AM Gospel 1kw DA weak — tiny daytimer, brokered time by 1985
  {type:'AM',fmt:'GOSPEL',     pw:'DA', str:'weak'},
];
// Early-1970 Atlanta should start less fragmented: fewer weak FMs and tail AMs on day one.
// Additional competitors roll on via ATLANTA_1970_DEFERRED_LAUNCHES (same path as mid-game rival entry:
// mkStn → seedNewEntry → news) as FM uptake and dial fragmentation rise in the 70s.
const ATLANTA_1970_DEFERRED_LAUNCHES=[
  {bpIdx:7,  y:1972,p:1}, // FM Album Rock 100kw emerging — big-FM rock after the pioneer era beds in
  {bpIdx:12, y:1972,p:2}, // second AM Gospel 5kw niche — tail clutter, not a 1970 core
  {bpIdx:15, y:1974,p:1}, // FM Album Rock 50kw moderate — fragmentation / second AOR fight
  {bpIdx:16, y:1976,p:1}, // FM Country 50kw emerging — AM country handoff window
  {bpIdx:17, y:1976,p:2}, // weak gospel daytimer — marginal tail
];
const ATLANTA_1970_DEFER_IDX=new Set(ATLANTA_1970_DEFERRED_LAUNCHES.map(e=>e.bpIdx));
const STT={dominant:'star',strong:'mid',moderate:'mid',emerging:'entry',niche:'entry',weak:'entry'};
const STQ={dominant:[68,88],strong:[55,75],moderate:[42,62],emerging:[30,52],niche:[25,48],weak:[18,38]};
// STM: base appeal multiplier at FULL MATURITY for each strength tier.
// New stations always start at launchB and ramp toward their tier's b over ~8-12 periods.
const STM={dominant:{b:1.20,v:.12,launchB:.55,ramp:10},strong:{b:1.10,v:.12,launchB:.38,ramp:9},moderate:{b:.85,v:.10,launchB:.25,ramp:8},emerging:{b:.60,v:.12,launchB:.10,ramp:8},niche:{b:.45,v:.10,launchB:.08,ramp:6},weak:{b:.25,v:.08,launchB:.05,ramp:5}};
const SBR={dominant:[.82,.94],strong:[.72,.85],moderate:[.60,.75],emerging:[.40,.60],niche:[.35,.55],weak:[.25,.45]};
const SF_LEVELS=[
  {id:0,l:'No Sales Staff',cost:0,sellBonus:0,desc:'Algorithmic fill only.'},
  {id:1,l:'Local Sales Manager',cost:40000,sellBonus:0.08,desc:'Fills local inventory gaps. Worth it above 5% share.'},
  {id:2,l:'General Sales Manager',cost:90000,sellBonus:0.18,desc:'Opens national buys. Recommended for any station above 6% share.'},
  {id:3,l:'National Rep Firm',cost:160000,sellBonus:0.28,desc:'Premium national rates and agency relationships. High upside for top-5 stations.'},
];
// Signal reach efficiency (quality of signal within universe)
const RA={'50kw':.97,'10kw':.92,'5kw':.85,'1kw':.72,'DA':.88};
// DA = Directional Antenna / Daytimer: licensed 50kw or 10kw daytime, drops to 1-5kw at night
// Night power reduction means listeners in fringe areas lose the signal after sunset.
// In drive-time radio this matters a lot — morning drive is unaffected but evening is diminished.
const RF={'100kw':.92,'50kw':.82,'25kw':.68,'10kw':.52};
// Population universe: persons who can clearly receive this signal in Atlanta metro
// Total metro ~1.2M. 50kw AM clears = full market. 1kw daytimer = limited coverage area.
// clearChannel=true adds ~18% universe bonus — WSB's nighttime footprint covers the SE
const UNIVERSE={
  'AM_50kw':1.00,'AM_10kw':0.65,'AM_5kw':0.42,'AM_1kw':0.18,'AM_DA':0.72,
  'FM_100kw':0.92,'FM_50kw':0.78,'FM_25kw':0.58,'FM_10kw':0.38,
};
// Clear channel AM stations (Class A, unlimited power, no nighttime directionality)
// These stations have a larger effective universe — their signal covers the full metro
// at night and reaches fringe areas daytime competitors cannot. Revenue premium applies.
// In Atlanta: WSB 750 AM is the archetypal clear channel. ~1/3 of 50kW AMs are clear.
const CLEAR_CHANNEL_UNIVERSE_BONUS = 0.18; // +18% addressable audience
const CLEAR_CHANNEL_REVENUE_BONUS  = 0.12; // +12% revenue premium (nighttime reach = more impressions)

// Effective universe for a station — applies clear channel bonus where applicable
function effUniverse(s){
  const base = s.sig.universe || 0.65;
  if(s.clearChannel && s.sig.type==='AM' && !s.fmBooster) {
    return Math.min(1.0, base * (1 + CLEAR_CHANNEL_UNIVERSE_BONUS));
  }
  return base;
}
const PD={
  // rs=reformat sensitivity, ag=aggression, ms=morale/slot nudge, tr=talent retention
  // pt=pressure threshold, ic=innovation chance
  // pi=programming investment rate (fraction of revenue per period), pm=promo investment rate
  INCUMBENT:{l:'The Incumbent',rs:.20,ag:.35,ms:.70,tr:.80,pt:.025,ic:.05, pi:.04,pm:.02},
  SCRAPPER: {l:'The Scrapper', rs:.70,ag:.75,ms:.55,tr:.55,pt:.015,ic:.12, pi:.06,pm:.05},
  CORPORATE:{l:'The Corporate',rs:.50,ag:.55,ms:.85,tr:.72,pt:.020,ic:.08, pi:.08,pm:.04},
  COASTER:  {l:'The Coaster',  rs:.15,ag:.20,ms:.45,tr:.60,pt:.035,ic:.02, pi:.01,pm:.01},
  MAVERICK: {l:'The Maverick', rs:.60,ag:.80,ms:.65,tr:.65,pt:.018,ic:.18, pi:.07,pm:.06},
  PUBLIC:   {l:'Public Station',rs:.20,ag:.00,ms:.20,tr:.20,pt:.002,ic:.05, pi:.12,pm:.00},
  CORP_RADIO:{l:'Corporate Group',rs:.30,ag:.65,ms:.95,tr:.88,pt:.008,ic:.04,pi:.09,pm:.05},
};
const PM={dominant:['INCUMBENT','INCUMBENT','CORPORATE','MAVERICK'],strong:['CORPORATE','CORPORATE','INCUMBENT','SCRAPPER'],moderate:['SCRAPPER','CORPORATE','COASTER','MAVERICK'],emerging:['SCRAPPER','SCRAPPER','MAVERICK','COASTER'],niche:['COASTER','SCRAPPER','COASTER','MAVERICK'],weak:['COASTER','COASTER','SCRAPPER','COASTER']};
function ap(str){return{...PD[pick(PM[str]||['CORPORATE'])]};}
const AMF=['590 AM','640 AM','750 AM','860 AM','920 AM','1010 AM','1090 AM','1160 AM','1230 AM','1340 AM'];
const FMF=['96.1 FM','99.7 FM','102.3 FM','104.5 FM','107.1 FM','94.9 FM','88.5 FM','101.5 FM','103.3 FM'];
let amfIdx=0,fmfIdx=0;
function nextFreq(type){return type==='AM'?AMF[amfIdx++%AMF.length]:FMF[fmfIdx++%FMF.length];}

function mkStn(bp,freq,year=1970){
  const{type,fmt,pw,str}=bp,tt=STT[str]||'mid',qb=STQ[str]||[40,60];
  // Tier step-down: each slot is one tier weaker than the previous
  // star→mid→entry. Morning leads, afternoon follows, midday is bench depth.
  const afTier=tt==='star'?'mid':tt==='mid'?'entry':'entry';
  const prog={
    morningDrive:  {talent:mkTal('morningDrive',fmt,tt,year),quality:Math.round(rnd(qb[0],qb[1]))},
    midday:        {talent:fmt!=='BEAUTIFUL_MUSIC'?mkTal('midday',fmt,'entry',year):null,quality:Math.round(rnd(qb[0]-10,qb[1]-10))},
    afternoonDrive:{talent:mkTal('afternoonDrive',fmt,afTier,year),quality:Math.round(rnd(qb[0]-5,qb[1]-5))},
    evening:       {talent:Math.random()>.4?mkTal('evening',fmt,'entry',year):null,quality:Math.round(rnd(qb[0]-15,qb[1]-15))},
    overnight:     {talent:null,quality:Math.round(rnd(15,30))},
  };
  Object.values(prog).forEach(s=>s.quality=Math.max(10,Math.min(100,s.quality)));
  const oq=Math.round(Object.entries(SW).reduce((acc,[sl,w])=>acc+effSlotQForOq(prog[sl])*w,0));
  const reach=type==='AM'?(RA[pw]||.85):(RF[pw]||.70);
  const sb=SBR[str]||[.50,.70];
  return{
    id:Math.random().toString(36).substr(2,8),
    callLetters:gc(),freq,brand:gb(fmt),
    sig:{type,pw,reach,universe:UNIVERSE[`${type}_${pw}`]||0.65},
    launchPeriod:0, // set after creation — total periods elapsed at launch
    format:fmt,prog,oq,str,
    rat:{cur:{},hist:[],share:0,aqh:0,margin:type==='AM'?.012:.018},
    ops:{spots:FM[fmt]?.sp||14,sell:rnd(sb[0],sb[1]),promo:0,progBudget:0},
    stream:{active:false,aqh:0,rev:0,upkeep:0,dragOffset:0,launchYear:0},
    fin:{rev:0,cost:0,ebitda:0},
    cp:null,mom:{},pers:ap(str),isPlayer:false,color:'#888',flog:[],
    simulcastWith:null, // id of paired station, or null
    demoLean:0,         // -1.0 younger .. +1.0 older
    progInvestment:0,   // one-time spend this period
    entryTurn:null,     // {year,period} when entered market (for ranker blanks)
    identity:0,         // 0–100 community identity score; builds slowly, burns fast
    identityBudget:0,   // recurring community investment spend per period
    _formatAge:0,       // periods in current format (resets on format change)
    _identityPeak:0,    // highest identity ever reached (used for betrayal penalty)
  };
}

const SC=[
  {id:'under',l:'The Underdog',  d:"Inherited a struggling AM station. Ratings soft, morning host just quit. Nowhere to go but up. You have enough runway to turn it around — if you move fast.",idx:[1],cash:250000},
  {id:'cntry',l:'Country Roads', d:"Atlanta's established country AM. Solid ratings, loyal audience, profitable from day one. The question isn't survival — it's whether you can make the FM transition before erosion catches up.",idx:[2],cash:450000},
  {id:'soul', l:'Soul City',     d:"Soul/R&B — deeply embedded in the community. Loyal listeners, but undervalued by advertisers and squeezed by a small signal. Build your audience and fight for every dollar.",idx:[3],cash:1750000},
  {id:'stack',l:'The Stack',     d:"An AM/FM combo. The AM pays the bills. The FM is a blank canvas — simulcast to build an audience, then differentiate. High overhead, high ceiling.",idx:[5,8],cash:4000000},
  {id:'fmpn', l:'FM Pioneer',   d:"One of Atlanta's first FM licenses. Album Rock on FM — a cult following in 1970, but advertisers haven't noticed yet. FM is about to become everything. Survive the lean years and you'll dominate the decade.",idx:[9],cash:900000},
  {id:'wsb',  l:'King of the Dial', d:"Atlanta’s dominant AM station. 50kw, Middle of Road, 14% share. You’re the biggest thing on the dial in 1970 — but FM specialization is coming and your broad format is a liability. What will you become?",idx:[4],cash:2200000},
  // ── 1978 ERA ───────────────────────────────────────────────────
  {id:'fmrev', l:'FM Revolution', startYear:1978,
   d:"It's 1978. FM just passed AM in total audience for the first time in American radio history. You've scraped together enough to buy a mid-market FM Album Rock license — decent signal, thin cash, no morning host. The format wars are just beginning and the big groups haven't arrived yet. Build a winner before they do.",
   idx:[7], cash:620000, diff:'HARD',
   oqBoost:-5, // slightly below market average — room to grow
   hint:'Survive the lean 1978-80 period. Album Rock explodes after that.'},
  {id:'acrise', l:'The Soft Touch', startYear:1978,
   d:"1978. Adult Contemporary is emerging as FM's most profitable format — softer hits, 25-49 women, premium CPM. You've acquired a good-signal FM that's been drifting as Beautiful Music. The format pivot to AC is obvious. The challenge: it gets crowded fast, and brand loyalty is everything once the format matures.",
   idx:[14], cash:980000, diff:'MEDIUM',
   oqBoost:5, // inherited a reasonably-run station
   hint:'AC gets crowded by 1983. Build advertiser relationships early.'},
  // ── 1985 ERA ───────────────────────────────────────────────────
  {id:'chrwar', l:'Format Wars', startYear:1985,
   d:"1985. CHR is king, Classic Rock is rising, and every FM license in Atlanta is spoken for. You've just closed on an FM Album Rock station with a good signal and mediocre ratings — right as the format battles peak. Three formats can realistically win from here: stay the course, pivot to CHR, or reformat to Classic Rock. Choose your lane before the window closes.",
   idx:[9], cash:1800000, diff:'MEDIUM',
   oqBoost:0,
   hint:'Stay Album Rock, pivot to CHR, or reformat to Classic Rock. First move matters — do it in Period 1.'},
  {id:'amtalk', l:'Talk or Die', startYear:1985,
   d:"1985. Your AM Top 40 station is hemorrhaging listeners to FM. Revenue is still okay — for now. The writing is on the wall: music AM is finished. Do you pivot to News/Talk before the cliff hits, or squeeze the last profitable years out of a dying format? Rush Limbaugh just signed with a Sacramento station. Everything is about to change.",
   idx:[1], cash:380000, diff:'HARD',
   oqBoost:-8, // the station has been sliding
   hint:'Revenue cliff hits hard by 1988. Pivot to News/Talk — or watch your audience walk to FM.'},
];


// ── FORMAT DRIFT SYSTEM ───────────────────────────────────────────
// Each driftable format has poles (0=conservative, 100=aggressive trend)
// plus historical inflection events tied to real years
const DRIFT={
  // TOP 40 / CHR: Bubblegum vs Rock Edge
  TOP40:{
    label:'Format Strategy',
    poleA:{name:'Bubblegum Pop',desc:'Pure hits, youngest demos, maximum share ceiling early'},
    poleB:{name:'Rock Edge',desc:'Credibility with 18-34, resilient through rock surges'},
    default:40,
    // Drift affects demographic lean — higher = more youth, lower = more 18-34
    demoEffect:(drift,coh)=>{
      const lean=drift/100; // 0=rock edge, 1=bubblegum
      const youthBonus={'12-17':lean*.25,'18-24':lean*.10,'25-34':(1-lean)*.08};
      return 1+(youthBonus[coh]||0);
    },
    inflections:[
      {y:1979,p:1,id:'disco_crash',name:'Disco Demolition Night',
       desc:'Anti-disco backlash sweeps the country. Stations leaning pop/disco lose 18-24 males rapidly to rock.',
       effect:(s,drift)=>{if(drift>60)return -0.04*(drift/100);return 0.01;}},
      {y:1991,p:2,id:'grunge_wave',name:'Nevermind Drops',
       desc:'Alternative rock breaks mainstream. CHR stations that went too pop lose 18-24 to rock stations.',
       effect:(s,drift)=>{if(drift>65)return -0.03;return 0.005;}},
    ]
  },
  // NEWS/TALK: Hard News vs Political Talk
  NEWS_TALK:{
    label:'Editorial Direction',
    poleA:{name:'Hard News',desc:'Credentialed journalism. Premium CPM. Legacy reputation builds over time.'},
    poleB:{name:'Political Talk',desc:'Opinion & outrage. Election-year revenue spikes. Narrow but passionate audience.'},
    default:30,
    demoEffect:(drift,coh)=>{
      const pol=drift/100;
      // Political talk skews older male; hard news skews educated 35-64
      const shift={'35-49':pol*.12,'50-64':pol*.08,'18-24':(1-pol)*.05,'25-34':(1-pol)*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1988,p:2,id:'rushbo',name:'Talk Radio Goes Political',
       desc:'Rush Limbaugh goes national. Political Talk stations surge. Hard News loses 35-54 male listeners.',
       effect:(s,drift)=>{return drift>50?0.03:-0.015;}},
      {y:1994,p:2,id:'revolution94',name:'Republican Revolution',
       desc:'Political wave supercharges talk radio. Opinion-heavy stations see their biggest ratings ever.',
       effect:(s,drift)=>{return drift>55?0.05:0;}},
      {y:2004,p:1,id:'fragmentation',name:'Media Fragmentation',
       desc:'Blogs, cable news, and podcasts begin pulling the political talk audience. Lean too far and your demo ages out.',
       effect:(s,drift)=>{const age=G.year-s.driftHistory?.NEWS_TALK?.commitYear||0;return drift>70&&age>6?-0.025:0;}},
      {y:2016,p:2,id:'election16',name:'Election Supercycle',
       desc:'Record political engagement. Opinion stations spike — then advertiser pressure hits the most extreme positions.',
       effect:(s,drift)=>{return drift>65?0.04:0.01;}},
    ]
  },
  // SOUL/R&B: Classic Soul vs Funk/Disco
  SOUL_RNB:{
    label:'Sound Direction',
    poleA:{name:'Classic Soul',desc:'Older Black audience, loyal and stable. Motown, gospel-influenced.'},
    poleB:{name:'Funk / Disco',desc:'Young and explosive 1974-79. The crash when it comes is brutal.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const funk=drift/100;
      const shift={'12-17':funk*.20,'18-24':funk*.15,'35-49':(1-funk)*.12,'50-64':(1-funk)*.10};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1974,p:1,id:'disco_rise',name:'Disco Rises',
       desc:'Disco explodes across Black radio. Funk/Disco positioning captures the wave.',
       effect:(s,drift)=>{return drift>50?0.04:0;}},
      {y:1979,p:2,id:'disco_death',name:'Disco is Dead',
       desc:'The backlash is total. Stations deep in Funk/Disco lose 25-40% of younger listeners over two periods.',
       effect:(s,drift)=>{return drift>60?-0.05*(drift/100)*1.5:-0.005;}},
      {y:1982,p:1,id:'quiet_storm',name:'The Quiet Storm',
       desc:'Smooth, sophisticated R&B emerges. Stations near Classic Soul reclaim listeners who fled during Disco.',
       effect:(s,drift)=>{return drift<40?0.025:0;}},
    ]
  },
  // COUNTRY: Traditional vs Crossover Pop
  COUNTRY:{
    label:'Crossover Strategy',
    poleA:{name:'Traditional Country',desc:'Core rural audience. Deep loyalty. Lower ceiling but bulletproof retention.'},
    poleB:{name:'Crossover Pop Country',desc:'Pulls suburban demos who never touched Country. Hot 1990-1997.'},
    default:25,
    demoEffect:(drift,coh)=>{
      const cross=drift/100;
      const shift={'25-34':cross*.15,'35-49':cross*.08,'50-64':(1-cross)*.10,'65+':(1-cross)*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1989,p:1,id:'garth',name:'Garth Brooks Era',
       desc:'Country goes mainstream. Crossover-leaning stations explode into suburban demos.',
       effect:(s,drift)=>{return drift>45?0.04:0.01;}},
      {y:1996,p:1,id:'new_trad',name:'New Traditionalist Backlash',
       desc:'Core country fans rebel against pop production. Crossover stations start losing their base.',
       effect:(s,drift)=>{return drift>65?-0.025:0.005;}},
      {y:2012,p:1,id:'bro_country',name:'Bro Country Wave',
       desc:'Young male audience surges, but women 35+ start tuning out the party-truck sound.',
       effect:(s,drift)=>{return drift>55?0.02:-0.01;}},
    ]
  },
  // ALBUM ROCK: AOR Purist vs Mainstream Rock
  ALBUM_ROCK:{
    label:'Programming Philosophy',
    poleA:{name:'AOR Purist',desc:'Deep cuts, album tracks, credibility. Intense loyalty, lower spot tolerance.'},
    poleB:{name:'Mainstream Rock',desc:'Hits-focused, broader demo, competes with CHR for same listeners.'},
    default:40,
    demoEffect:(drift,coh)=>{
      const main=drift/100;
      const shift={'18-24':(1-main)*.10,'25-34':(1-main)*.08,'35-49':main*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1991,p:2,id:'grunge_rock',name:'Alternative Breaks',
       desc:'Purist AOR stations absorb Alt listeners naturally. Mainstream Rock gets squeezed from both sides.',
       effect:(s,drift)=>{return drift<40?0.025:-0.02;}},
      {y:1995,p:1,id:'classic_rock',name:'Classic Rock Solidifies',
       desc:'35-54 males lock in to Classic Rock. You have ceded 18-24 — but the core never leaves.',
       effect:(s,drift)=>{return drift<50?0.015:0;}},
    ]
  },
  // MOR: Music-Leaning vs Talk-Leaning — the WSB choice
  MOR:{
    label:'Format Direction',
    poleA:{name:'Music-Leaning',desc:'Soft standards & easy listening. Preserves female 35-64 base. Smooth path to Adult Contemporary.'},
    poleB:{name:'Talk-Leaning',desc:'News, personality, community. Builds male 35-64 infrastructure. Smooth path to News/Talk.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const talk=drift/100; // 0=music, 1=talk
      // Music-lean preserves female demos; talk-lean builds male demos
      const shift={
        '35-49':talk*.12,
        '50-64':talk*.08,
        '65+':  (1-talk)*.06,
        '25-34':(1-talk)*.04,
      };
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1973,p:2,id:'fm_spec',name:'FM Specialization Accelerates',
       desc:'FM is eating AM alive with targeted formats. MOR\'s broad appeal is suddenly a liability — you\'re the station nobody hates and nobody loves.',
       effect:(s,drift)=>{
         // Both directions feel the squeeze, but music-heavy more so
         return drift>50?0.005:-0.015;
       }},
      {y:1979,p:1,id:'am_crisis',name:'AM Music Collapses',
       desc:'FM has won the music war. AM music is dying. Talk-leaning MOR stations pivot cleanly — music-leaning stations face an existential reckoning.',
       effect:(s,drift)=>{
         return drift>50?0.02:drift<30?-0.04:-0.01;
       }},
      {y:1982,p:2,id:'talk_surge',name:'Talk Radio Finds Its Audience',
       desc:'News/Talk is proving viable on AM. Stations that built talk infrastructure are ahead of the curve.',
       effect:(s,drift)=>{
         return drift>60?0.03:0;
       }},
    ]
  },
  // OLDIES: Pure 50s-60s vs Broader Library
  OLDIES:{
    label:'Music Era',
    poleA:{name:'Pure Oldies',desc:'50s & 60s rock & roll. Intense loyalty from core Boomers. Demographic ceiling is low.'},
    poleB:{name:'Broader Library',desc:'Add 70s & early 80s. Expand the tent. This is the path to becoming Classic Hits.'},
    default:30,
    demoEffect:(drift,coh)=>{
      const broad=drift/100;
      const shift={
        '35-49':broad*.15,
        '50-64':(1-broad)*.10,
        '65+':(1-broad)*.08,
      };
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1995,p:2,id:'oldies_demo_shift',name:'Boomer Demographics Shift',
       desc:'The core Oldies audience is pushing into their 50s-60s. Pure 50s-60s oldies stations watch their demos age. Broader library buys time.',
       effect:(s,drift)=>{
         return drift<30?-0.02:0.01;
       }},
      {y:2003,p:1,id:'classic_hits_emerge',name:'Classic Hits Rebranding Wave',
       desc:'Stations across the country are adding 70s and 80s content, dropping \'Oldies\' branding. The format is evolving.',
       effect:(s,drift)=>{
         return drift>60?0.025:-0.015;
       }},
    ]
  },
  // SOUL / R&B: Classic Soul vs Funk & Disco
  SOUL_RNB:{
    label:'Sound Direction',
    poleA:{name:'Classic Soul',desc:'Deep gospel roots, Motown and Stax. Loyal older Black listeners. Community anchor identity.'},
    poleB:{name:'Funk & Disco',desc:'Groove-forward and dance-oriented. Pulls 18-34, crossover pop appeal. Vulnerable to backlash.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const funk=drift/100; // 0=classic soul, 1=funk/disco
      const shift={
        '18-24':funk*.18,
        '25-34':funk*.12,
        '35-49':(1-funk)*.10,
        '50-64':(1-funk)*.08,
      };
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1975,p:2,id:'disco_rise',name:'Disco Goes Mainstream',
       desc:'Disco is everywhere. Funk & Disco-leaning Soul stations surge with the youth wave.',
       effect:(s,drift)=>{return drift>55?0.025:0;}},
      {y:1979,p:2,id:'disco_backlash',name:'Disco Demolition Night',
       desc:'Anti-disco backlash hits hard. Stations that chased the trend lose credibility. Classic Soul stations emerge as the authentic alternative.',
       effect:(s,drift)=>{return drift>60?-0.045:drift<35?0.020:0;}},
      {y:1983,p:1,id:'rb_split',name:'Urban Contemporary Emerges',
       desc:'R&B is fracturing. Young listeners want hip-hop-adjacent sounds. Classic Soul holds its loyal base while Funk fades.',
       effect:(s,drift)=>{return drift>60?-0.020:drift<30?0.010:0;}},
    ]
  },
  // CHR: Pop Hits vs Rhythmic Edge
  CHR:{
    label:'Playlist Direction',
    poleA:{name:'Pure Pop Hits',desc:'Maximum mainstream appeal, 12–24 focus. Highest ceiling in youth markets.'},
    poleB:{name:'Rhythmic Edge',desc:'Hip-hop and R&B-influenced pop. Pulls 18–34 and survives trend cycles better.'},
    default:40,
    demoEffect:(drift,coh)=>{
      const rb=drift/100;
      const shift={'12-17':(1-rb)*.18,'18-24':rb*.12,'25-34':rb*.10,'35-49':(1-rb)*.04};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1984,p:1,id:'mtv_era',name:'MTV Reshapes Pop',
       desc:'Video-friendly pop dominates. Pure Pop CHR stations ride the wave — Rhythmic leans miss the visual culture moment.',
       effect:(s,drift)=>{return drift<45?0.025:0;}},
      {y:1991,p:2,id:'grunge_chills_pop',name:'Alternative Goes Mainstream',
       desc:'Grunge/alt crashes the pop party. Pure Pop CHR stations lose 18-24 males hard. Rhythmic Edge holds better.',
       effect:(s,drift)=>{return drift<40?-0.025:0.010;}},
      {y:1996,p:1,id:'backstreet_era',name:'Teen Pop Explosion',
       desc:'Boy bands and teen pop dominate. Pure Pop leans surge with 12–17. The demographic ceiling is very high — and very temporary.',
       effect:(s,drift)=>{return drift<50?0.03:0.01;}},
      {y:2001,p:2,id:'teenpop_crash',name:'Teen Pop Collapses',
       desc:'The bubble bursts. Pure Pop stations that rode teen pop lose their audience to hip-hop and rock simultaneously.',
       effect:(s,drift)=>{return drift<45?-0.030:0.008;}},
    ]
  },
  // ADULT_CONTEMP: Soft AC vs Hot AC crossover
  ADULT_CONTEMP:{
    label:'Sound Direction',
    poleA:{name:'Soft AC',desc:'Mellow, background-friendly. 35–54 women. Loyal and undemanding. High spot tolerance.'},
    poleB:{name:'AC Crossover',desc:'Edges toward current pop. Younger women 25–44. Vulnerable to CHR and Hot AC competition.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const hot=drift/100;
      const shift={'25-34':hot*.15,'35-49':(1-hot)*.12,'18-24':hot*.08,'50-64':(1-hot)*.10};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1985,p:2,id:'ac_boom',name:'AC Becomes Dominant Format',
       desc:'Adult Contemporary is the most-listened format in America. Both poles benefit — this is the decade of AC.',
       effect:(s,drift)=>{return 0.020;}},
      {y:1997,p:1,id:'hot_ac_rise',name:'Hot AC Emerges as Competitor',
       desc:'Hot AC stations are carving off the younger AC audience. Crossover-leaning AC stations face direct competition.',
       effect:(s,drift)=>{return drift>60?-0.025:0.005;}},
      {y:2005,p:2,id:'ac_fragmentation',name:'AC Fragments',
       desc:'iPods and online radio let listeners self-curate. Soft AC loses casual background listeners. Crossover edges hold better with active listeners.',
       effect:(s,drift)=>{return drift<35?-0.020:0.005;}},
    ]
  },
  // CLASSIC_ROCK: Album-Era Purist vs Classic Hits Crossover
  CLASSIC_ROCK:{
    label:'Era Selection',
    poleA:{name:'70s Album Era',desc:'Zeppelin, Floyd, Sabbath. Male 35-54 purists. Intense loyalty, narrow tent.'},
    poleB:{name:'Classic Hits Crossover',desc:'Add early 80s and power pop. Broader 35-54 demo, attracts some women. Softer loyalty.'},
    default:40,
    demoEffect:(drift,coh)=>{
      const cross=drift/100;
      const shift={'35-49':(1-cross)*.14,'25-34':cross*.12,'50-64':(1-cross)*.08,'18-24':cross*.06};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1988,p:1,id:'classic_rock_peak',name:'Classic Rock Peaks',
       desc:'The format finds its identity. 70s Album-era stations dominate. Male 35-54 is locked in.',
       effect:(s,drift)=>{return drift<50?0.025:0.010;}},
      {y:1998,p:2,id:'boomer_aging',name:'Boomers Age Into 50s',
       desc:'Your core male demo is pushing 50. Crossover-leaning stations adapt better — purists hold their audience but the ceiling starts to drop.',
       effect:(s,drift)=>{return drift>55?0.010:drift<35?-0.015:0;}},
    ]
  },
  // URBAN_CONTEMP: R&B Soul vs Hip-Hop Lean
  URBAN_CONTEMP:{
    label:'Sound Balance',
    poleA:{name:'R&B / Soul Core',desc:'Smooth R&B, classic and current. 18–44 Black audience. Community identity anchor.'},
    poleB:{name:'Hip-Hop Lean',desc:'Rap and hip-hop forward. Dominant 12–24 share. Alienates some 35+ core but wins the youth ceiling.'},
    default:40,
    demoEffect:(drift,coh)=>{
      const hh=drift/100;
      const shift={'12-17':hh*.22,'18-24':hh*.15,'25-34':(1-hh)*.10,'35-49':(1-hh)*.12};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1991,p:1,id:'hiphop_mainstream',name:'Hip-Hop Goes Mainstream',
       desc:'Rap is no longer underground. Urban stations leaning Hip-Hop explode with 12–24.',
       effect:(s,drift)=>{return drift>55?0.035:0.005;}},
      {y:1998,p:2,id:'hiphop_dominance',name:'Hip-Hop Is the #1 Genre',
       desc:'Hip-Hop outsells every other genre. Urban stations leaning too R&B start losing 12–24 fast.',
       effect:(s,drift)=>{return drift>60?0.030:drift<35?-0.025:0.005;}},
      {y:2010,p:1,id:'rb_revival',name:'R&B and Soul Revival',
       desc:'Adele, Frank Ocean, The Weeknd. Sophisticated R&B comes back. Stations that kept the soul foundation reclaim 25–34.',
       effect:(s,drift)=>{return drift<40?0.020:0;}},
    ]
  },
  // SPORTS_TALK: Local Teams vs National Shows
  SPORTS_TALK:{
    label:'Programming Focus',
    poleA:{name:'Local Teams First',desc:'Deep local sports coverage. Community identity. Survives weak national show cycles.'},
    poleB:{name:'National Syndication',desc:'ESPN Radio, sports personalities. Lower overhead, broader topics, but less local identity.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const natl=drift/100;
      const shift={'18-24':natl*.10,'25-34':natl*.08,'35-49':(1-natl)*.12,'50-64':(1-natl)*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1994,p:1,id:'sports_talk_boom',name:'Sports Talk Explodes',
       desc:'WFAN proves the model. Sports Talk is the AM format of the 90s. Both strategies benefit.',
       effect:(s,drift)=>{return 0.030;}},
      {y:2000,p:2,id:'local_sports_rights',name:'Local Sports Rights Get Expensive',
       desc:'Teams demand rights fees. Local-first stations face cost pressure — national syndication looks cheap by comparison.',
       effect:(s,drift)=>{return drift<40?-0.010:0.010;}},
      {y:2015,p:1,id:'sports_podcast_era',name:'Sports Podcasts Arrive',
       desc:'The Bill Simmons era. National shows feel generic compared to the podcast universe. Local voices hold better.',
       effect:(s,drift)=>{return drift<45?0.010:drift>65?-0.020:0;}},
    ]
  },
  // SPANISH: Regional Mexican vs Tropical/Hits
  SPANISH:{
    label:'Musical Style',
    poleA:{name:'Regional Mexican',desc:'Norteño, banda, ranchera. Deep loyalty in Mexican-heritage communities. Narrow but intense.'},
    poleB:{name:'Tropical / Latin Hits',desc:'Salsa, merengue, Latin pop crossover. Broader Hispanic demo, higher CPM growth.'},
    default:40,
    demoEffect:(drift,coh)=>{
      const trop=drift/100;
      const shift={'18-24':trop*.15,'25-34':trop*.12,'35-49':(1-trop)*.12,'50-64':(1-trop)*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1994,p:2,id:'tejano_boom',name:'Tejano / Latin Pop Crossover',
       desc:'Selena and Latin pop goes mainstream. Tropical/Hits-leaning stations catch the crossover surge.',
       effect:(s,drift)=>{return drift>55?0.030:0.010;}},
      {y:2002,p:1,id:'reggaeton_rise',name:'Reggaeton Rises',
       desc:'Reggaeton is taking over Latin radio. Tropical-leaning stations absorb the new audience; Regional Mexican holds its base.',
       effect:(s,drift)=>{return drift>50?0.025:0.005;}},
      {y:2010,p:2,id:'latin_mainstream',name:'Latin Music Crosses Over',
       desc:'Latin music is mainstream American pop. Tropical stations earn CPM parity with English-language formats in major markets.',
       effect:(s,drift)=>{return drift>50?0.020:0.010;}},
    ]
  },
  // ALT_ROCK: College Radio Indie vs Post-Grunge Mainstream
  ALT_ROCK:{
    label:'Sound Positioning',
    poleA:{name:'College / Indie',desc:'New music discovery, credibility-focused. Loyal 18–29. Low spot load. Identity builder.'},
    poleB:{name:'Post-Grunge Mainstream',desc:'Creed, Nickelback, radio-friendly alt. Broader 18–34 share, higher spot tolerance.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const main=drift/100;
      const shift={'18-24':(1-main)*.14,'25-34':main*.12,'35-49':main*.08,'12-17':(1-main)*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1994,p:1,id:'alt_nation_peak',name:'Alternative Nation Peaks',
       desc:'Alternative is the defining sound of a generation. Indie-leaning stations earn credibility dividends for years.',
       effect:(s,drift)=>{return drift<45?0.035:0.015;}},
      {y:1997,p:2,id:'alt_commercializes',name:'Alternative Goes Commercial',
       desc:'Post-grunge dominates rock radio. Mainstream leans earn the audience but indie purists begin migrating to college radio and the internet.',
       effect:(s,drift)=>{return drift>55?0.020:drift<30?-0.010:0;}},
      {y:2005,p:1,id:'alt_fragmentation',name:'Alt Fragments Online',
       desc:'MySpace, blogs, and mp3s are fragmenting rock audiences. Indie-credibility stations hold their core; mainstream alt bleeds to streaming.',
       effect:(s,drift)=>{return drift<40?0.010:drift>65?-0.025:0;}},
    ]
  },
  // RHYTHMIC: Hip-Hop Dominant vs Pop Crossover
  RHYTHMIC:{
    label:'Mix Direction',
    poleA:{name:'Hip-Hop Dominant',desc:'Rap-heavy playlist. 12–24 ownership. Dominant in markets with large Black/Hispanic youth demos.'},
    poleB:{name:'Pop Crossover',desc:'R&B-flavored pop, broader appeal. 18–34 women. Sacrifices edge for sellout rate.'},
    default:45,
    demoEffect:(drift,coh)=>{
      const pop=drift/100;
      const shift={'12-17':(1-pop)*.20,'18-24':(1-pop)*.10,'25-34':pop*.15,'35-49':pop*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:2001,p:1,id:'bling_era',name:'Hip-Hop Goes Platinum',
       desc:'Rap is the biggest genre in America. Hip-Hop dominant Rhythmic stations dominate 12-24 in every major market.',
       effect:(s,drift)=>{return drift<45?0.030:0.010;}},
      {y:2008,p:2,id:'rnb_pop_merge',name:'R&B and Pop Merge',
       desc:'Beyoncé, Rihanna, and pop-R&B dominate. Crossover-leaning Rhythmic captures women 25-34 who weren\'t listening before.',
       effect:(s,drift)=>{return drift>55?0.025:0.005;}},
    ]
  },
  // HOT_AC: Current Hits vs AC Core
  HOT_AC:{
    label:'Playlist Age',
    poleA:{name:'Current Hits',desc:'Chart-focused, 18–34 women. Competes with CHR. High energy, lower spot tolerance.'},
    poleB:{name:'AC Core',desc:'Mix of current and recent. 25–44 women. Broader appeal, higher spot load, easier to sell.'},
    default:45,
    demoEffect:(drift,coh)=>{
      const curr=drift/100;
      const shift={'18-24':curr*.16,'25-34':(1-curr)*.12,'35-49':(1-curr)*.10,'12-17':curr*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:2001,p:1,id:'hot_ac_peak',name:'Hot AC Finds Its Identity',
       desc:'Hot AC is the dominant format for women 18-34. Current-leaning stations own the demo.',
       effect:(s,drift)=>{return drift<50?0.025:0.010;}},
      {y:2010,p:2,id:'streaming_hits',name:'Streaming Defines Hits',
       desc:'Spotify defines what\'s "current." Stations that chase current hits find themselves competing with algorithms. AC Core holds up better.',
       effect:(s,drift)=>{return drift<40?0.015:drift>65?-0.020:0;}},
    ]
  },
  // CLASSIC_HITS: 70s Nostalgia vs 80s Power Mix
  CLASSIC_HITS:{
    label:'Era Mix',
    poleA:{name:'70s Core',desc:'Soft rock, album cuts, singer-songwriters. 40–59 demo. Crossover from Oldies listeners.'},
    poleB:{name:'80s Power Mix',desc:'New Wave, power pop, rock ballads. Younger 35–49 demo. Higher ceiling in the 2000s-2010s.'},
    default:45,
    demoEffect:(drift,coh)=>{
      const eighties=drift/100;
      const shift={'35-49':eighties*.15,'50-64':(1-eighties)*.14,'25-34':eighties*.08,'65+':(1-eighties)*.10};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:2008,p:1,id:'classic_hits_surge',name:'Classic Hits Rebranding Wave',
       desc:'Oldies stations across America add 80s content and rebrand Classic Hits. 80s-leaning positions thrive.',
       effect:(s,drift)=>{return drift>50?0.030:0.010;}},
      {y:2015,p:2,id:'80s_nostalgia_peak',name:'80s Nostalgia Peaks',
       desc:'Gen X nostalgia hits full commercial force. Stranger Things, 80s revival culture. 80s-heavy stations earn a premium.',
       effect:(s,drift)=>{return drift>55?0.025:0;}},
    ]
  },
  // GOSPEL: Inspirational Crossover vs Traditional
  GOSPEL:{
    label:'Sound Style',
    poleA:{name:'Traditional Gospel',desc:'Classic church sounds, quartet, choirs. Intense core loyalty. Brokered time slots viable.'},
    poleB:{name:'Contemporary Christian',desc:'Modern production, broader appeal. Attracts white evangelical demo and younger Black listeners.'},
    default:30,
    demoEffect:(drift,coh)=>{
      const contemp=drift/100;
      const shift={'18-24':contemp*.12,'25-34':contemp*.10,'50-64':(1-contemp)*.12,'65+':(1-contemp)*.10};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1993,p:1,id:'ccm_boom',name:'Contemporary Christian Music Boom',
       desc:'CCM becomes a mainstream genre with mainstream distribution. Contemporary-leaning Gospel stations crossover.',
       effect:(s,drift)=>{return drift>50?0.025:0.005;}},
      {y:2000,p:1,id:'gospel_mainstream',name:'Gospel Crosses Over',
       desc:'Kirk Franklin, Mary Mary. Gospel earns mainstream chart presence. Contemporary leans earn broader audience.',
       effect:(s,drift)=>{return drift>45?0.020:0.010;}},
    ]
  },
  // PODCAST_TALK: Personality-Driven vs Journalistic
  PODCAST_TALK:{
    label:'Voice Style',
    poleA:{name:'Journalistic / Narrative',desc:'Reported storytelling, Serial-style. Premium educated demo. Slow build, strong loyalty.'},
    poleB:{name:'Personality / Opinion',desc:'Host-driven, fan-first. Faster audience build. Higher churn if the host leaves.'},
    default:50,
    demoEffect:(drift,coh)=>{
      const pers=drift/100;
      const shift={'18-24':pers*.14,'25-34':pers*.10,'35-49':(1-pers)*.12,'50-64':(1-pers)*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:2014,p:2,id:'serial_effect',name:'Serial Changes Podcasting',
       desc:'Serial becomes a cultural phenomenon. Journalistic/Narrative podcasting earns mainstream legitimacy and premium ad rates.',
       effect:(s,drift)=>{return drift<40?0.035:0.010;}},
      {y:2018,p:1,id:'podcast_wars',name:'Platform Wars Begin',
       desc:'Spotify, Apple, Amazon race to lock up personalities. Personality-driven hosts face acquisition pressure. Journalistic formats benefit from independence.',
       effect:(s,drift)=>{return drift<40?0.015:0.010;}},
    ]
  },
  // BEAUTIFUL_MUSIC / ADULT_STANDARDS: Automation vs Personality
  BEAUTIFUL_MUSIC:{
    label:'Programming Model',
    poleA:{name:'Full Automation',desc:'Zero staff, purely automated. Maximum margin. Survives on the 55+ passive listener.'},
    poleB:{name:'Personality + Music',desc:'Light local talk breaks. Builds community loyalty. Slightly higher cost, better retention.'},
    default:30,
    demoEffect:(drift,coh)=>{
      const pers=drift/100;
      const shift={'35-49':pers*.10,'50-64':(1-pers)*.08,'65+':(1-pers)*.06};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1983,p:2,id:'beautiful_music_fade',name:'Beautiful Music Fades',
       desc:'The format\'s passive older listeners are dying off or switching to Adult Contemporary. Personality-driven stations hold better.',
       effect:(s,drift)=>{return drift>50?0.005:drift<25?-0.020:-0.010;}},
    ]
  },
  // ADULT_STANDARDS: The Sinatra Format
  ADULT_STANDARDS:{
    label:'Programming Era',
    poleA:{name:'Classic Standards',desc:'Sinatra, Tony Bennett, big band. The 55+ loyalists. Pure niche, deep identity.'},
    poleB:{name:'Nostalgic Pop Mix',desc:'Add 60s pop, light early rock. Younger 45–64 demo. Slower decline curve.'},
    default:35,
    demoEffect:(drift,coh)=>{
      const pop=drift/100;
      const shift={'45-54':pop*.12,'55-64':(1-pop)*.10,'65+':(1-pop)*.12,'35-49':pop*.08};
      return 1+(shift[coh]||0);
    },
    inflections:[
      {y:1994,p:1,id:'standards_niche',name:'Standards Finds Its Niche',
       desc:'As Baby Boomers hit 45, the nostalgic pop mix captures them. Pure Sinatra-era stations begin demographic aging.',
       effect:(s,drift)=>{return drift>50?0.020:drift<25?-0.015:0.005;}},
    ]
  }
};

// Which formats can drift, and their current drift value per station
// s.drift = {FORMAT_KEY: 0-100}
function getDrift(s){
  if(!s.drift)s.drift={};
  const d=DRIFT[s.format];
  if(!d)return null;
  if(s.drift[s.format]===undefined)s.drift[s.format]=d.default;
  return {cfg:d,val:s.drift[s.format]};
}

// ── RATINGS ENGINE ────────────────────────────────────────────────
// Demo lean: s.demoLean is -1.0 (full younger) to +1.0 (full older). 0 = neutral.
const COH_IDX={'12-17':0,'18-24':1,'25-34':2,'35-49':3,'50-64':4,'65+':5};
function leanLabel(lean){
  // Translates -1.0..+1.0 lean value into standard Nielsen demo band label
  const v=Math.round(lean*100);
  if(v<=-60)return 'ADULTS 12–24';
  if(v<=-20)return 'ADULTS 18–34';
  if(v<=20) return 'ADULTS 25–54';
  if(v<=60) return 'ADULTS 35–54';
  return 'ADULTS 50+';
}
function leanMult(coh,lean){
  if(!lean)return 1;
  const idx=COH_IDX[coh]||0; // 0=youngest..5=oldest
  const axis=(idx/5)-.5;     // -0.5 to +0.5
  return Math.max(.15, 1 + lean * axis * 2);
}
function appl(s,coh,G){
  // BP-slot placeholders and any malformed row must not break appeal math (e.g. seedNewEntry
  // iterates the full G.stations list while 1976-deferred slots still exist in 1975).
  if(!s||s._bpSlotDeferred||!s.sig||!s.format||typeof s.oq!=='number'||!s.ops)return 0;
  // Use smoothstep era curves — computed from year, not event-driven steps
  const year=G.year||1970;
  const fmp=fmpForYear(year);
  const satDrag=G.satDrag||0;
  const streamDrag=G.streamDrag||0;

  const baseAff=FA[s.format]?.[coh]||.1;
  const aff=baseAff*leanMult(coh,s.demoLean||0);
  if(aff<.01)return 0;

  const q=s.oq/65;

  // Signal reach: FM stations benefit from FM penetration growth
  const pen=s.sig.type==='FM'?fmp:.99;
  const eff=s.sig.reach*pen;

  const fmd=FM[s.format]||{};

  // AM music penalty — calibrated to Duncan's data
  // 88% viability in 1970 → 10% floor by 1993 (matches last music AM reformats)
  // News/Talk, Gospel, Sports, Podcast are AM-native — no penalty through 2004
  // BUT: after 2005, even AM Talk faces mounting pressure from streaming/podcasts/smart speakers.
  // AM signal quality (interference, static) becomes a liability vs pristine FM/digital.
  // Real-world: WBAP, WGN, WSB all scrambled for FM simulcasts 2010-2020.
  // Modeled as a soft penalty starting 2007, accelerating 2015+.
  const amMusicFormats=['TOP40','COUNTRY','SOUL_RNB','MOR','ALBUM_ROCK','BEAUTIFUL_MUSIC',
    'CHR','CLASSIC_ROCK','ADULT_CONTEMP','URBAN_CONTEMP','ALT_ROCK','RHYTHMIC','HOT_AC','CLASSIC_HITS',
    'OLDIES','SPANISH','GOSPEL','ADULT_STANDARDS'];
  // FM translator coverage fraction: how much of the AM footprint gets FM protection
  // A translator covers city core only — fringe listeners beyond the FM signal still erode.
  // tFrac=1.0 means full coverage (same as owning FM); tFrac~0.35-0.55 is typical translator.
  const _tFrac = s.fmBooster
    ? Math.min(1, (s.sig?.universe||0.32) / Math.max(s._boosterOrigSig?.universe||0.85, 0.01))
    : 1.0;
  // Station is "AM music" if it's AM without a full FM simulcast
  const isAMMusic=s.sig.type==='AM'&&!s.fmBooster&&amMusicFormats.includes(s.format);
  // Booster with music format: partial immunity — only _tFrac fraction is protected
  const isAMBoosterMusic=s.fmBooster&&amMusicFormats.includes(s.format)&&s._boosterOrigSig;
  const isAMTalk=s.sig.type==='AM'&&!s.fmBooster&&!s.simulcastWith&&['NEWS_TALK','SPORTS_TALK'].includes(s.format);
  const amViab=amViabForYear(year);
  // Full AM music penalty (no booster)
  const _rawAMPenalty = Math.max(.10,(1.0-0.60*fmp)*amViab);
  // Translator: weighted blend — covered portion is protected (penalty=1.0), fringe still erodes
  const amP=isAMMusic
    ? _rawAMPenalty
    : isAMBoosterMusic
      // Translator: _tFrac of listeners are on FM (no penalty), (1-_tFrac) still on AM (full penalty)
      ? _tFrac * 1.0 + (1-_tFrac) * _rawAMPenalty
      : isAMTalk&&year>=2007
        ?Math.max(0.55, 1.0-_smoothstep(2007,2015,year)*0.20-_smoothstep(2015,2022,year)*0.20)
        :1;
  // FM Booster: signal type is FM but reach/universe are limited (translator-class)
  // No hard cap — the lower reach values in sig naturally constrain the audience footprint.

  // Atlanta signal bonus
  const atl=1+(fmd.ab||0);

  // Spot load vs format norm
  const rv=s.ops.spots/(fmd.sp||14);
  const sp=rv<=.85?1.05:rv<=1?1:rv<=1.15?.97:rv<=1.3?.93:rv<=1.5?.87:.80;

  // Market saturation
  const sat=1-satDrag*(s.sig.type==='FM'?.6:.3);

  // Streaming drag by cohort age (younger listeners leave terrestrial first)
  const cohIdx=COH.indexOf(coh);
  const offset=s.stream?.dragOffset||0;
  const effectiveDrag=Math.max(0,streamDrag-offset);
  const strm=cohIdx<=1?1-effectiveDrag*.8:cohIdx<=3?1-effectiveDrag*.4:1-effectiveDrag*.1;

  // Simulcast bonus
  const simBonus=s.simulcastWith?1.15:1;

  // Format drift modifier
  const dr=getDrift(s);
  const driftMod=dr&&dr.cfg.demoEffect?Math.max(0.5,dr.cfg.demoEffect(dr.val,coh)):1;

  // Format era viability — smoothstep sunset curves
  const FORMAT_SUNSET={
    BEAUTIFUL_MUSIC:{peak:1985,dead:1995},
    MOR:            {peak:1978,dead:1996},
    OLDIES:         {peak:2000,dead:2015},
    FULL_SERVICE:   {peak:1960,dead:1975},
  };
  let eraMult=1.0;
  const fs2=FORMAT_SUNSET[s.format];
  if(fs2&&year){
    if(year>=fs2.dead){eraMult=0.02;}
    else if(year>fs2.peak){
      eraMult=Math.max(0.02,1-_smoothstep(fs2.peak,fs2.dead,year)*0.98);
    }
  }

  // OLDIES demo aging: stations that haven't evolved toward Classic Hits
  // watch their audience literally die off. By 2010+ a pure Oldies station
  // has 65+ as its dominant cohort, and that demo shrinks year over year.
  let oldiesAgeMult=1.0;
  if(s.format==='OLDIES'&&year>=2005){
    // After 2005, Oldies audiences age into 65+ territory (listeners are now 55-75)
    // The 35-49 and 50-64 cohorts bleed to Classic Hits; only 65+ stays loyal
    const agePen={'12-17':0.02,'18-24':0.05,'25-34':0.12,'35-49':0.35,'50-64':0.75,'65+':1.20};
    oldiesAgeMult=agePen[coh]!==undefined?(year>=2010?agePen[coh]*Math.max(0.3,1-(year-2010)*0.06):agePen[coh]):1.0;
    oldiesAgeMult=Math.max(0.02,oldiesAgeMult);
  }
  const fmMusPref = fmMusicEraPreferenceMult(s, year, fmp);
  return Math.max(0, aff * q * eff * amP * atl * sp * sat * strm * simBonus * driftMod * eraMult * oldiesAgeMult * fmMusPref);
}
function recalc(stations,G){
  const activeIx=stations.map((s,i)=>s&&!s._bpSlotDeferred?i:-1).filter(i=>i>=0);
  COH.forEach(coh=>{
    const sc=activeIx.map(i=>{
      const s=stations[i];
      const m=STM[s.str]||{b:.7,v:.12,launchB:.20,ramp:8};
      const age=s.launchPeriod>0?(G.turn||0)-s.launchPeriod:999;
      if(s.isPublic){
        const pubAge=s._pubLaunchYear?Math.max(0,G.year-s._pubLaunchYear)*2:age;
        const pubT=Math.min(1,pubAge/20);
        const pubPeak=s.format==='PUBLIC_NEWS'?0.80:0.55;
        return Math.max(0,appl(s,coh,G)*(0.15+pubPeak*pubT));
      }
      const t=Math.min(1,age/m.ramp);
      const effB=m.launchB+(m.b-m.launchB)*t;
      const promoBoost=1+(((s.ops?.promo||0)/50000)*0.08);
      return Math.max(0,appl(s,coh,G)*effB*promoBoost);
    });
    const tot=sc.reduce((a,b)=>a+b,0);
    if(!tot)return;
    let raw=sc.map(v=>v/tot);

    // Competition bleed: dense same-format competition erodes everyone's share
    // e.g. 4 country stations each lose ~10% to each other
    raw=raw.map((r,ri)=>{
      const i=activeIx[ri];
      const s=stations[i];
      const competitors=(FMT_COMPETITION[s.format]||[]);
      const count=activeIx.filter(j=>j!==i&&competitors.includes(stations[j].format)).length;
      const bleed=1-Math.min(0.22,COMPETITION_BLEED*(count/5));
      return r*bleed;
    });
    // Re-normalize after bleed
    const bleedTot=raw.reduce((a,b)=>a+b,0)||1;
    raw=raw.map(v=>v/bleedTot);

    // Cap: no single station >30% of any cohort
    const CAP=0.22;
    for(let iter=0;iter<5;iter++){
      let excess=0,freeSum=0;
      raw=raw.map((r,i)=>{if(r>CAP){excess+=r-CAP;return CAP;}freeSum+=r;return r;});
      if(excess<0.0001)break;
      raw=raw.map(r=>r<CAP?r+excess*(r/Math.max(freeSum,0.0001)):r);
    }

    activeIx.forEach((i,ri)=>{
      const s=stations[i];
      // Identity creates a loyalty floor — high-identity stations bleed share slower
    const identityFloor=(s.isPlayer&&s.identity>20)
      ?(s.rat.cur[coh]?.share||0)*((s.identity/100)*0.35)
      :0;
    const tgt=Math.max(raw[ri], identityFloor),cur=s.mom[coh]?.cur||s.rat.cur[coh]?.share||0;
      const d=tgt-cur,spd=d>0?.35:.60,ns=Math.max(0,cur+d*spd);
      const pop=(POP.cohorts[coh]?.t||0)*effUniverse(s);
      // AQH: share × cohort population × universe × engagement rate
      // Engagement rate = fraction listening in an average quarter-hour (Arbitron methodology)
      // Older demos spend more hours/week listening → higher per-listener AQH weight
      const engage=AQH_ENGAGE[coh]||0.060;
      s.rat.cur[coh]={share:Math.round(ns*10000)/10000,aqh:Math.round(ns*pop*engage)};
      s.mom[coh]={tgt,cur:ns};
    });
  });

  // Overall share: weighted by cohort population × AQH engagement (listening intensity)
  const tp=Object.values(POP.cohorts).reduce((s,c)=>s+c.t,0);
  const engageWeightedPop=COH.reduce((s,c)=>{
    const pop=POP.cohorts[c]?.t||0;
    const engage=AQH_ENGAGE[c]||0.060;
    return s+pop*engage;
  },0);
  stations.forEach(s=>{
    if(!s||s._bpSlotDeferred)return;
    s.rat.aqh=COH.reduce((sum,c)=>sum+(s.rat.cur[c]?.aqh||0),0);
    // Weight overall share by listening intensity, not just raw population
    s.rat.share=COH.reduce((sum,c)=>{
      const pop=POP.cohorts[c]?.t||0;
      const engage=AQH_ENGAGE[c]||0.060;
      return sum+(s.rat.cur[c]?.share||0)*(pop*engage)/Math.max(engageWeightedPop,1);
    },0);
  });

  // Long-tail share smoothing: blend toward the commercial-station mean (1970s-style
  // cliff softening). Top ranks use w≈0.94 (light pull); mid-pack moderate; ranks ~7–12
  // and below get stronger pull via w = 0.94 − p·0.10 (clamped 0.80–0.94) so weak
  // stations don’t collapse near zero. Total commercial share mass is preserved (scale),
  // then cohort cur shares scale proportionally so AQH stays consistent.
  const comm = stations.filter(s => s && !s._bpSlotDeferred && !s.isPublic);
  if (comm.length >= 2) {
    const sumRaw = comm.reduce((a, s) => a + s.rat.share, 0);
    if (sumRaw > 1e-8) {
      const avg = sumRaw / comm.length;
      const rawById = new Map(comm.map(s => [s.id, s.rat.share]));
      const byRank = [...comm].sort((a, b) => b.rat.share - a.rat.share);
      let sumBlend = 0;
      const blendedById = new Map();
      byRank.forEach((s, rank) => {
        const raw = rawById.get(s.id);
        const p = comm.length > 1 ? rank / (comm.length - 1) : 0;
        const w = Math.min(0.94, Math.max(0.80, 0.94 - p * 0.10));
        const blended = w * raw + (1 - w) * avg;
        blendedById.set(s.id, blended);
        sumBlend += blended;
      });
      const scale = sumBlend > 1e-10 ? sumRaw / sumBlend : 1;
      comm.forEach(s => {
        const raw = rawById.get(s.id);
        const finalShare = blendedById.get(s.id) * scale;
        const ratio = raw > 1e-10 ? finalShare / raw : 1;
        COH.forEach(coh => {
          const cur = s.rat.cur[coh];
          if (!cur) return;
          const pop = (POP.cohorts[coh]?.t || 0) * effUniverse(s);
          const engage = AQH_ENGAGE[coh] || 0.060;
          cur.share = Math.round(cur.share * ratio * 10000) / 10000;
          cur.aqh = Math.round(cur.share * pop * engage);
          if (s.mom[coh]) s.mom[coh].cur = cur.share;
        });
        s.rat.aqh = COH.reduce((sum, c) => sum + (s.rat.cur[c]?.aqh || 0), 0);
        s.rat.share = COH.reduce((sum, c) => {
          const pop = POP.cohorts[c]?.t || 0;
          const engage = AQH_ENGAGE[c] || 0.060;
          return sum + (s.rat.cur[c]?.share || 0) * (pop * engage) / Math.max(engageWeightedPop, 1);
        }, 0);
      });
    }
  }

  stations.forEach(s=>{
    if(!s||s._bpSlotDeferred||!s.rat)return;
    s.rat.hist.push({year:G.year,period:G.period,share:s.rat.share});
    if(s.rat.hist.length>24)s.rat.hist.shift();
  });
  stations.forEach(s=>{
    if(!s||s._bpSlotDeferred||!s.rat)return;
    const h=s.rat.hist;if(h.length<2)return;
    const cur=s.rat.share,prev=h[h.length-2]?.share||cur,two=h.length>=3?h[h.length-3]?.share||cur:cur;
    s.cp={dq:cur-prev,d2:cur-two,under:cur-two<-.008,col:cur-two<-.020,sur:cur-two>.010};
  });
}
function seedNewEntry(s,G){
  // Seeds a new mid-game station entry with a realistic initial share.
  // Unlike seedRat (which normalizes across only the passed stations),
  // this computes what share the new station would attract by competing
  // against the full existing market, then scales to launchB.
  //
  // Result: new stations debut small and grow — no more 12-share debuts
  // that collapse next turn when recalc runs the real competition.
  const m=STM[s.str]||{b:.60,v:.12,launchB:.10,ramp:8};
  const allStations=G.stations; // includes s (already pushed)
  COH.forEach(coh=>{
    // Compute each station's raw appeal in this market
    const appeals=allStations.map(st=>Math.max(0,appl(st,coh,G)));
    const tot=appeals.reduce((a,b)=>a+b,0);
    if(!tot){s.rat.cur[coh]={share:0,aqh:0};s.mom[coh]={tgt:0,cur:0};return;}
    // The new station's natural competitive share (what recalc would give it at maturity)
    const idx=allStations.indexOf(s);
    const naturalShare=appeals[idx]/tot;
    // Scale down to launchB fraction of mature — this is the realistic debut
    // Add small random variation; niche/emerging formats debut especially low
    const noise=rnd(-m.v*.2,m.v*.2);
    const entryShare=Math.max(0.001, naturalShare*m.launchB*(1+noise));
    const pop=(POP.cohorts[coh]?.t||0)*effUniverse(s);
    const engage=AQH_ENGAGE[coh]||0.060;
    s.rat.cur[coh]={share:Math.round(entryShare*10000)/10000,aqh:Math.round(entryShare*pop*engage)};
    s.mom[coh]={tgt:entryShare,cur:entryShare};
  });
  // Compute overall share and AQH
  const engWtPop=COH.reduce((sum,c)=>{const pop=POP.cohorts[c]?.t||0;const eng=AQH_ENGAGE[c]||0.060;return sum+pop*eng;},0);
  s.rat.aqh=COH.reduce((sum,c)=>sum+(s.rat.cur[c]?.aqh||0),0);
  s.rat.share=COH.reduce((sum,c)=>{
    const pop=POP.cohorts[c]?.t||0;const eng=AQH_ENGAGE[c]||0.060;
    return sum+(s.rat.cur[c]?.share||0)*(pop*eng)/Math.max(engWtPop,1);
  },0);
}

function seedRat(stations,fmpOrYear){
  // Accept either a year (new) or a raw fmp value (legacy calls) for backward compat
  const year=fmpOrYear>1?fmpOrYear:1970; // if >1 it's a year, otherwise treat as legacy fmp
  const mockG={year,satDrag:0,streamDrag:0};
  const activeIx=stations.map((s,i)=>s&&!s._bpSlotDeferred?i:-1).filter(i=>i>=0);
  COH.forEach(coh=>{
    const sc=activeIx.map(i=>{
      const s=stations[i];
      const m=STM[s.str]||{b:.7,v:.12,launchB:.20,ramp:8};
      // Established stations (launchPeriod=-999) seed at mature b-value, not launchB
      const seedB=s.launchPeriod===-999?m.b:m.launchB;
      return Math.max(0,appl(s,coh,mockG)*(seedB+rnd(-m.v*.3,m.v*.3)));
    });
    const tot=sc.reduce((a,b)=>a+b,0);
    let raw=tot?sc.map(v=>v/tot):sc.map(()=>0);
    const CAP=0.22;
    for(let iter=0;iter<5;iter++){
      let excess=0,freeSum=0;
      raw=raw.map((r,i)=>{if(r>CAP){excess+=r-CAP;return CAP;}freeSum+=r;return r;});
      if(excess<0.0001)break;
      raw=raw.map(r=>r<CAP?r+excess*(r/Math.max(freeSum,0.0001)):r);
    }
    activeIx.forEach((i,ri)=>{
      const s=stations[i];
      const sh=raw[ri],pop=(POP.cohorts[coh]?.t||0)*effUniverse(s);
      const engage=AQH_ENGAGE[coh]||0.060;
      s.rat.cur[coh]={share:Math.round(sh*10000)/10000,aqh:Math.round(sh*pop*engage)};
      s.mom[coh]={tgt:sh,cur:sh};
    });
  });
  const engageWeightedPop=COH.reduce((s,c)=>{
    const pop=POP.cohorts[c]?.t||0;
    const engage=AQH_ENGAGE[c]||0.060;
    return s+pop*engage;
  },0);
  activeIx.forEach(i=>{
    const s=stations[i];
    s.rat.aqh=COH.reduce((sum,c)=>sum+(s.rat.cur[c]?.aqh||0),0);
    s.rat.share=COH.reduce((sum,c)=>{
      const pop=POP.cohorts[c]?.t||0;
      const engage=AQH_ENGAGE[c]||0.060;
      return sum+(s.rat.cur[c]?.share||0)*(pop*engage)/Math.max(engageWeightedPop,1);
    },0);
  });
}

// Simulcast economics: use _simulcastSource + simulcastWith only (no AM/FM “lead” inference).
function simulcastProgrammingSourceStation(s,G){
  if(!s?.simulcastWith)return null;
  const p=(G.stations||[]).find(st=>st.id===s.simulcastWith);
  if(!p)return null;
  if(s._simulcastSource===true)return s;
  if(p._simulcastSource===true)return p;
  return null;
}
function isSimulcastProgrammingReceiver(s,G){
  const src=simulcastProgrammingSourceStation(s,G);
  return !!(src&&src.id!==s.id);
}

// ── REVENUE ENGINE ────────────────────────────────────────────────
function calcRev(s,G){
  if(s._bpSlotDeferred)return;
  // Non-commercial public stations earn no ad revenue — pledge-funded
  if(s.isPublic){s.fin={rev:0,fix:0,tal:0,cost:0,ebitda:0};return;}
  const adx=G.adx,streamDrag=G.streamDrag,year=G.year;
  const playerStations=(G?.ps||G?.stations||[]).filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic);
  // Sellout rate drifts toward market-position-appropriate level each period
  // Only runs during live gameplay (G.stations exists), not during initial seeding
  if(G.stations){
    // sort a copy — never mutate G.stations order mid-calcRev loop
    const allComm=[...G.stations].filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic).sort((a,b)=>b.rat.share-a.rat.share);
    const rank=allComm.findIndex(st=>st.id===s.id)+1;
    const mktSize=allComm.length||1;
    const rankPct=1-(rank-1)/mktSize;
    // News/Talk and Sports command premium sellout — advertisers pay for engaged audiences
    // N/T and Sports command sellout premium — engaged, affluent demo
    // But we cap at 1.12 (not 1.18) to prevent too-wide a gap vs FM music
    const fmtPrem=['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'].includes(s.format)?1.12:1.0;
    // AM signal quality penalty: FM got higher CPMs due to fidelity/reach advantages
    // But Talk/Sports AM was genuinely competitive — smaller penalty than AM music
    const sigMult=s.sig.type==='AM'
      ?(['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'].includes(s.format)?0.88:0.72)
      :1.0;
    const sfBonus=(SF_LEVELS[s.salesForce?.level||0]?.sellBonus||0);
    const sellCap=Math.min(0.88,(fmtPrem>1?0.84:0.80)+sfBonus);
    // Format sellout affinity: youth-skewing and high-demo formats command higher floor rates
    // CHR/Hot AC/Top40 sold out fastest in 1990s; Country had strong regional buyers.
    // Adult Standards/Beautiful Music/MOR had thin ad markets — low ceilings.
    const fmtSellAffinity={'CHR':0.12,'TOP40':0.10,'HOT_AC':0.10,'ADULT_CONTEMP':0.07,
      'URBAN_CONTEMP':0.08,'RHYTHMIC':0.08,'ALT_ROCK':0.06,'CLASSIC_ROCK':0.06,
      'COUNTRY':0.05,'SOUL_RNB':0.07,'GOSPEL':-0.02,
      'BEAUTIFUL_MUSIC':-0.05,'ADULT_STANDARDS':-0.04,'MOR':-0.03}[s.format]||0;
    // Cluster demo breadth bonus: post-1990, agencies pay a premium for
    // one-stop demo coverage across a cluster. A CHR + Country + News/Talk
    // cluster covers 12-24, 25-54, and 55+ — that's the full advertiser story.
    // Scales with how many distinct primary demo bands the cluster covers.
    // Only applies post-1990 (pre-consolidation, this pitch didn't exist).
    // Max +8% sellout when cluster spans all three major bands.
    let clusterDemoBreadthBonus = 0;
    if(year >= 1990 && playerStations.length >= 2){
      // Primary demo band for each format: Y=youth (12-34), M=mid (25-54), O=older (35+)
      const _demoBand = f => {
        const yFmts = ['TOP40','CHR','ALT_ROCK','RHYTHMIC','HOT_AC','URBAN_CONTEMP'];
        const oFmts = ['NEWS_TALK','SPORTS_TALK','BEAUTIFUL_MUSIC','ADULT_STANDARDS','GOSPEL','PODCAST_TALK'];
        if(yFmts.includes(f)) return 'Y';
        if(oFmts.includes(f)) return 'O';
        return 'M'; // Country, AC, Classic Rock, MOR, Soul, Oldies etc.
      };
      const clusterBands = new Set(playerStations.map(st => _demoBand(st.format)));
      const breadth = clusterBands.size; // 1, 2, or 3
      // 1 band = 0 bonus, 2 bands = 4%, 3 bands = 8%
      // Scales in gradually 1990→1996 as agencies formalize cluster buying
      const breadthEra = Math.min(1.0, (year - 1990) / 6);
      clusterDemoBreadthBonus = breadth >= 3 ? 0.08 * breadthEra
        : breadth === 2 ? 0.04 * breadthEra : 0;
    }
    const targetSell=Math.min(sellCap,Math.max(0.16,
      (rankPct*0.50+0.18)*sigMult*fmtPrem*(s.rat.share>0.08?1.08:1.0)+sfBonus*0.45+fmtSellAffinity+clusterDemoBreadthBonus
    ));
    // Faster drift: ad market responds within 2-3 periods of a ratings change
    s.ops.sell=s.ops.sell*0.65+targetSell*0.35;
  }
  const aqh=COH.reduce((sum,c)=>sum+(s.rat.cur[c]?.aqh||0),0);
  if(!aqh){s.fin.rev=0;s.fin.cost=s.fin.fix||0;s.fin.ebitda=-(s.fin.fix||0);s.fin.simulcastProgFee=0;return;}
  const fmd=FM[s.format]||{};
  const podBonus=s.format==='PODCAST_TALK'?1+Math.min((streamDrag*2),.4):1;
  const gcpm=genderCPM(s.format); // gender audience concentration CPM premium
  const wcpm=COH.reduce((sum,c)=>{const w=(s.rat.cur[c]?.aqh||0)/aqh;return sum+w*(CPM[c]||1)*(fmd.cpm||1)*(1+(fmd.ab||0))*podBonus*gcpm;},0);
  const revDrag=s.format==='PODCAST_TALK'?1:Math.max(.7,1-streamDrag*.25); // terrestrial radio retained ~88% of ad revenue vs pre-streaming peak
  // Spot revenue: spots = min/hr commercial load, treated as 30-sec units per hour
  // 18hr broadcast day, 182 days per half-year period
  const spotsPerDay=s.ops.spots*18; // 30-sec units/day
  const season=seasonMult(year,G.period,s.format);
  const ratePerSpot=(aqh/1000)*wcpm*adx*revDrag*season; // CPM × seasonal index
  // Ad market era factor: radio CPM was much lower in early decades.
  // AM ad market matured 1970→1984 (smoothstep 0.28→1.0).
  // FM ad market lagged: advertisers discovered FM later (1972→1988, 0.15→1.0).
  // After these dates both types are fully mature and the factor = 1.0.
  const _ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const cpEraFactor=s.sig.type==='AM'
    ?0.28+_ss(1970,1984,year)*0.72
    :0.15+_ss(1972,1988,year)*0.85;
  const rev=Math.round((spotsPerDay*.65*182*s.ops.sell*.88 + spotsPerDay*.35*182*s.ops.sell*.55)*ratePerSpot*cpEraFactor);
  // ── COSTS ────────────────────────────────────────────────────────
  // On-air talent (annual salary / 2 for half-year period)
  const talCost=Object.values(s.prog).filter(sl=>sl?.talent).reduce((sum,sl)=>sum+Math.round((sl.talent.salary||0)/2),0);
  // Inflation: 3.5%/yr through 1985 (high inflation era), then 2.5%/yr after
  // (automation, digital tools, and consolidation efficiencies slow cost growth)
  // Fixed cost inflation: broadcast operational costs did rise, but automation,
  // consolidation, and digital tools significantly slowed growth after 1990.
  // Inflation curve: 3.5%/yr through 1985, then 1.5%/yr after (automation + digital slowed growth).
  // Differentiated caps by signal type — AM stations cut costs aggressively post-2000
  // (syndication replaced local staff, lean survival mode); FM stations kept investing
  // in operations longer as the format remained viable through 2015.
  // AM cap 2.2x: modest continued rise post-1993, plateaus ~2003 as cost-cutting offsets inflation.
  // FM cap 2.5x: fuller rise through 2010, reflecting FM's longer operational investment cycle.
  const rawInfl=year<=1985
    ?Math.pow(1.035,year-1970)
    :Math.pow(1.035,15)*Math.pow(1.015,year-1985); // slowed to 1.5% after 1985
  const inflCap=s.sig.type==='AM'?2.2:2.5;
  const inflFactor=Math.min(inflCap, rawInfl);
  // staffBase/facBase: annual costs at 1970 base rates (uninflated)
  // Calibrated to AQH-engagement revenue scale: healthy 8-12% share = 30-50% operating margin
  // Original values were 4x too high for the AQH_ENGAGE-weighted revenue model
  // AM values raised 25% — AM stations in 1970-90 were highly staff-intensive:
  // sales teams, traffic dept, news staff, engineering, and admin all on-site.
  // FM unchanged — FM was structurally leaner (automated formats, smaller sales teams early on).
  const staffBase={'AM_50kw':430000,'AM_10kw':256000,'AM_5kw':162000,'AM_1kw':100000,
                   'FM_100kw':240000,'FM_50kw':170000,'FM_25kw':105000,'FM_10kw': 68000,
                   'FM_translator': 0}[`${s.sig.type}_${s.sig.pw}`]||175000;
  const facBase={'AM_50kw':148000,'AM_10kw': 81000,'AM_5kw': 51000,'AM_1kw': 32000,
                 'FM_100kw':155000,'FM_50kw':105000,'FM_25kw': 58000,'FM_10kw': 33000,
                 'FM_translator': 17000}[`${s.sig.type}_${s.sig.pw}`]|| 45000;
  // Simulcast: programming source keeps normal cluster economics; receiver pays incremental
  // facility cost + a partial programming fee tied to the source’s talent load (see below).
  const simPartner=s.simulcastWith?(G.stations||[]).find(st=>st.id===s.simulcastWith):null;
  const playerPaired=!!(s.simulcastWith&&playerStations.some(st=>st.id===s.simulcastWith));
  const progSrcStation=simulcastProgrammingSourceStation(s,G);
  const isProgReceiver=isSimulcastProgrammingReceiver(s,G);
  const legacySimPair=playerPaired&&simPartner&&s._simulcastSource!==true&&simPartner._simulcastSource!==true;
  let efficiencyMult;
  if(isProgReceiver){
    // Receiver: second stick — mostly transmitter/site + lean local ops (~40–48% of standalone fixed footprint)
    efficiencyMult=0.44;
  }else if(legacySimPair){
    // Legacy saves with no explicit source flag: both stations very lean (pre-flag behavior)
    efficiencyMult=0.15;
  }else{
    // Cluster efficiency: AM/FM combos always shared studios, staff and sales teams.
    // Pre-1990: modest sharing discount (physical combo operations, one building, shared admin).
    // 1990-1996: growing consolidation makes cluster ops more systematic.
    // Post-1996 Telecom Act: full cluster efficiency as groups formalize shared services.
    const sortedByRev=[...playerStations].sort((a,b)=>(b.fin?.rev||0)-(a.fin?.rev||0));
    const stationRank=sortedByRev.findIndex(st=>st.id===s.id);
    // Cluster efficiency: even in 1970, two co-owned stations in the same market
    // shared a building, engineering staff, and often sales. The discount was real
    // from day one — it just became more systematic post-1990 and formalized post-1996.
    const clusterEra=year>=1996?1.0:year>=1990?0.70:year>=1980?0.52:0.38;
    const clusterDiscount=stationRank<=0?0:stationRank===1?.38*clusterEra:(.50+Math.min(.10,(stationRank-2)*.05))*clusterEra;
    // Automation discount: scales with fraction of slots running on automation.
    // Fully staffed = 0 discount. Fully automated = 0.35 discount. Partial = proportional.
    // e.g. WBRB with 2 talent + 3 automation: 3/5 = 0.21 discount (saves on ops staff).
    const _progSlots=Object.values(s.prog||{});
    const _totalSlots=_progSlots.length||1;
    const _vacantSlots=_progSlots.filter(sd=>!sd?.talent).length;
    const autoDiscount=Math.round((_vacantSlots/_totalSlots)*35)/100;
    // Format inherent automation discount: some formats were designed for tape automation
    // Beautiful Music, Adult Standards ran 24hr on reel-to-reel with minimal live staff
    // This reflects their structurally lower labor footprint regardless of talent slots
    const fmtAutoDiscount={'BEAUTIFUL_MUSIC':0.22,'ADULT_STANDARDS':0.18,'MOR':0.08}[s.format]||0;
    efficiencyMult=Math.max(0.28,1-clusterDiscount-autoDiscount-fmtAutoDiscount);
  }
  // Era cost: early stations ran lean. 1970=20% of mature, ramps to 100% by 1985.
  // Small FM (25kw/10kw) pre-1980 gets extra pioneer discount.
  const regCost=60000;
  const smallFMDiscount=(s.sig?.type==='FM'&&['25kw','10kw'].includes(s.sig?.pw)&&year<1980)
    ?Math.max(0,(1980-year)/10*0.30):0;
  const baseEra=year<=1985?Math.max(0.20,0.20+(year-1970)/15*0.80):1.0;
  const eraCostMult=Math.max(0.20,baseEra*(1-smallFMDiscount));
  const staffCost=Math.round(staffBase*inflFactor*efficiencyMult*eraCostMult/2);
  const facCost=Math.round(facBase*inflFactor*efficiencyMult*eraCostMult/2);
  const sfCost=Math.round((SF_LEVELS[s.salesForce?.level||0]?.cost||0)/2);
  const fixedCost=staffCost+facCost+regCost+sfCost;
  // ── STREAMING REVENUE ───────────────────────────────────────────
  let streamRev=0,streamUpkeep=0;
  if(s.stream?.active && year>=2005){
    const sd=G.streamDrag; // how mature streaming is (0→.60 by 2020)
    const straf=STRAF[s.format]||.50;
    // Streaming AQH: starts tiny, grows with streamDrag maturity and format affinity
    // By 2020 a CHR with full investment might see streaming = 20-30% of terrestrial AQH
    const streamPenetration=Math.min(.35, sd*straf*0.8);
    const streamAqh=Math.round(aqh*streamPenetration);
    // Streaming CPM scales up with year — targeted digital inventory commands premium
    const cpmScale=Math.min(2.5, 1+(year-2005)/10); // 1.0 in 2005 → 2.5 in 2020
    const swcpm=COH.reduce((sum,c)=>{
      const w=(s.rat.cur[c]?.aqh||0)/Math.max(aqh,1);
      return sum+w*(SCPM[c]||4)*cpmScale;
    },0);
    // Streaming spots: fewer interruptions than terrestrial, but premium CPM
    const sSpots=Math.min(8,s.ops.spots*.4); // ~40% of terrestrial load
    streamRev=Math.round((streamAqh/1000)*swcpm*sSpots*182*.75);
    streamUpkeep=Math.round(STREAM_UPKEEP_BASE/2);
    s.stream.aqh=streamAqh;s.stream.rev=streamRev;s.stream.upkeep=streamUpkeep;
    // Streaming investment also partially offsets terrestrial streamDrag
    // — invested stations hold more of their audience because fans find them online
    const dragOffset=Math.min(sd*.5, sd*straf*.4);
    s.stream.dragOffset=dragOffset;
  } else {
    if(s.stream)s.stream.aqh=0,s.stream.rev=0,s.stream.upkeep=0,s.stream.dragOffset=0;
  }
  // Clear channel bonus: 50kW AM clear-channel stations reach fringe markets at night,
  // expanding their effective audience footprint and commanding a revenue premium.
  // Diminishes post-1995 as FM becomes primary listener destination.
  const ccBonus = (s.clearChannel && s.sig.type==='AM' && !s.fmBooster)
    ? 1 + CLEAR_CHANNEL_REVENUE_BONUS * Math.max(0, 1 - Math.max(0,(G.year-1995)/20))
    : 1;
  // Daytimer (DA) penalty: power drops at sunset, losing evening drive — the highest-CPM daypart.
  // Evening drive CPM ~1.4x daytime. Losing it costs ~15% of total revenue (pre-1985 era).
  // Post FM-migration era, this gap shrinks (AM evening was already weak anyway).
  const daPenalty = (s.sig.pw==='DA' && s.sig.type==='AM' && !s.fmBooster)
    ? Math.max(0.82, 1 - 0.15 * Math.min(1, Math.max(0, 1 - (G.year - 1980) / 20)))
    : 1;
  let totalRev=Math.round((rev+streamRev)*ccBonus*daPenalty);
  // Receiver: incremental simulcast monetization (~35–60% of this signal’s standalone billings;
  // scales with programming source oq — stronger show = more sell-through on the echo signal).
  let simulcastRevMult=1;
  if(isProgReceiver&&progSrcStation){
    simulcastRevMult=0.35+0.25*Math.min(1,(progSrcStation.oq||50)/100);
    totalRev=Math.round(totalRev*simulcastRevMult);
  }
  const salesRate=year<1980?0.18:year<1990?0.17:year<2005?0.16:0.15;
  const adminRate=year<1980?0.12:year<1990?0.11:year<2005?0.10:0.09;
  const salesAdminRate=salesRate+adminRate;
  const salesAdminCost=Math.round(totalRev*salesAdminRate);
  const opsFloor=Math.round((s.sig.type==='AM'?70000:50000)*Math.min(2.4,rawInfl)*Math.max(0.65,eraCostMult));
  let simulcastProgFee=0;
  if(isProgReceiver&&progSrcStation){
    const srcTal=Object.values(progSrcStation.prog||{}).filter(sl=>sl?.talent).reduce((sum,sl)=>sum+Math.round((sl.talent.salary||0)/2),0);
    simulcastProgFee=Math.round(srcTal*0.38);
  }
  s.fin.rev=totalRev;
  s.fin.streamRev=isProgReceiver&&progSrcStation?Math.round(streamRev*ccBonus*daPenalty*simulcastRevMult):streamRev;
  s.fin.terRev=isProgReceiver&&progSrcStation?Math.round(rev*ccBonus*daPenalty*simulcastRevMult):Math.round(rev*ccBonus);
  s.fin.tal=talCost;s.fin.fix=fixedCost;s.fin.opsFloor=opsFloor;s.fin.salesAdminRate=salesAdminRate;s.fin.streamUpkeep=streamUpkeep;
  s.fin.simulcastProgFee=simulcastProgFee;
  s.fin.salesAdmin=salesAdminCost;
  s.fin.cost=fixedCost+talCost+salesAdminCost+opsFloor+(s.ops.promo||0)+(s.ops.progBudget||0)+(s.identityBudget||0)+streamUpkeep+simulcastProgFee;
  s.fin.ebitda=s.fin.rev-s.fin.cost;
}
function seedRev(stations,G){
  stations.forEach(s=>{ if(!s||s._bpSlotDeferred)return; calcRev(s,G); });
  const tot=stations.reduce((sum,s)=>sum+((!s||s._bpSlotDeferred)?0:(s.fin?.rev||0)),0);
  const annualTarget=marketAnnualBilling(G.year,G.marketId||ACTIVE_MARKET);
  const halfTarget=Math.round(annualTarget*0.5*marketHalfSeasonFactor(G.year,G.period||1)*Math.max(0.75,G.adx||1));
  if(tot>0&&halfTarget>0){
    const f=halfTarget/tot;
    stations.forEach(s=>{
      if(!s||s._bpSlotDeferred)return;
      s.fin.rev=Math.round(s.fin.rev*f);
      if(s.fin.terRev!=null)s.fin.terRev=Math.round(s.fin.terRev*f);
      if(s.fin.streamRev!=null)s.fin.streamRev=Math.round(s.fin.streamRev*f);
      if(s.fin.salesAdminRate!=null){
        s.fin.salesAdmin=Math.round(s.fin.rev*s.fin.salesAdminRate);
        s.fin.cost=(s.fin.fix||0)+(s.fin.tal||0)+(s.fin.salesAdmin||0)+(s.fin.opsFloor||0)+(s.ops.promo||0)+(s.ops.progBudget||0)+(s.identityBudget||0)+(s.fin.streamUpkeep||0)+(s.fin.simulcastProgFee||0);
      }
      s.fin.ebitda=s.fin.rev-s.fin.cost;
    });
  }
  // Lessor stations: player receives a fixed fee, bears zero operating costs.
  // The LMA operator absorbs all staffing, talent, and facility costs.
  // Override fin values so the station card and revenue phase show correct numbers.
  stations.filter(s=>s.lmaLessorId).forEach(s=>{
    const fee=Math.round(s.fin.rev*LMA_FEE_RATE/1000)*1000;
    s._lmaGrossRev=s.fin.rev; // preserve for fee calculation reference
    s.fin.rev=fee;            // player only sees the fee
    s.fin.cost=0;             // operator bears all costs
    s.fin.ebitda=fee;         // pure income
  });
}

// ── DECAY ─────────────────────────────────────────────────────────
function decay(s,year,period){
  if(!s||s._bpSlotDeferred)return;
  const D={morningDrive:.035,afternoonDrive:.030,midday:.040,evening:.044,overnight:.050};
  // Programming budget: recurring (progBudget) plus any residual one-shot (progInvestment)
  const totalProgSpend=(s.ops?.progBudget||0)+(s.progInvestment||0);
  if(totalProgSpend>0){
    const boost=(totalProgSpend/10000)*4;
    const slotBoosts={morningDrive:boost*1.4,afternoonDrive:boost*1.1,midday:boost,evening:boost*.8,overnight:boost*.6};
    Object.entries(slotBoosts).forEach(([sl,b])=>{if(s.prog[sl])s.prog[sl].quality=Math.min(100,s.prog[sl].quality+b);});
  }
  const decayMod=totalProgSpend>0?0.60:1.0;
  s.progInvestment=0; // clear one-shot; progBudget persists
  Object.entries(s.prog).forEach(([sl,sd])=>{
    if(!sd)return;const d=(D[sl]||.040)*decayMod;sd.quality=Math.max(10,sd.quality*(1-d));
    if(sd.talent){
      const md=sd.talent.morale<60?d*1.5:d*.5;
      sd.talent.quality=Math.max(15,sd.talent.quality*(1-md));
      sd.talent.cyr=Math.max(0,(sd.talent.cyr||2)-.5);
      if((sd.talent._suspended||0)>0){
        sd.talent._suspended--;
        sd.quality=Math.max(10,Math.round((sd.quality||20)*0.85));
        if(sd.talent._suspended===0){
          const preQ=sd.talent._preSuspendQuality||sd.talent.quality;
          sd.talent.quality=Math.max(sd.talent.quality,Math.round(preQ*0.92));
          sd.talent._preSuspendQuality=null;
          G.news.unshift({v:'LOW',t:`${sd.talent.name} returns from leave at ${s?.callLetters||'the station'}.`,y:G.year,p:G.period});
        }
      }
      sd.talent.periodsAtStation=(sd.talent.periodsAtStation||0)+1;
      if(!sd.talent._hireYear)sd.talent._hireYear=G.year;
      if(!sd.talent._careerStartYear)sd.talent._careerStartYear=sd.talent._hireYear;
      if(sd.talent._careerStartYear>sd.talent._hireYear)sd.talent._careerStartYear=sd.talent._hireYear;
      // Identity bonus: talent at a beloved community station gets intrinsic morale support
      // A DJ who IS the community doesn't drift toward 65 — they drift toward something higher
      const identityMoraleBuff=(s.isPlayer&&(s.identity||0)>25)?Math.round((s.identity/100)*8):0;
      const moraleMeanReversion=65+identityMoraleBuff;
      sd.talent.morale=Math.round(Math.max(20,Math.min(100,sd.talent.morale+(moraleMeanReversion-sd.talent.morale)*.08)));
      // Salary inflation: fires every Fall (period 2)
      // ~3.5%/yr base through 1985, then ~2.5% — tracks broadcast industry pay growth
      // Star talent (Q>75) gets merit bump on top
      if(period===2){
        // Salary growth: COLA + merit + station performance pressure.
        // High-rated stations = talent knows their value = bigger asks.
        // Faster pre-1990 (inflation era), slower post-2000 (consolidation/digital).
        const baseInflation=year<=1980?0.012:year<=1990?0.018:year<=2000?0.015:year<=2010?0.010:0.008;
        const merit=sd.talent.quality>85?0.008:sd.talent.quality>72?0.004:0.001;
        // Performance pressure: strong ratings = talent demands more at renewal
        // Share > 8 = solid performer asking for their cut; > 12 = they KNOW they're valuable
        const stShare=s.rat?.share||0;
        const perfPressure=stShare>0.12?0.008:stShare>0.08?0.004:stShare>0.05?0.002:0;
        // Morale modifier: happy talent accepts less; disgruntled talent pushes harder
        const moraleMod=sd.talent.morale<50?0.004:sd.talent.morale>80?-0.002:0;
        sd.talent.salary=Math.round(sd.talent.salary*(1+baseInflation+merit+perfPressure+moraleMod)/500)*500;
        // Salary floor: 75% of market rate (up from 55%) — long-tenured talent never drifts low
        {const tier=(sd.talent.quality||30)<42?'entry':(sd.talent.quality||30)<68?'mid':'star';
         // Floor = 100% of entry-tier minimum (was 75%) so no one earns poverty wages
         const baseFl=Math.round(salInfl((SAL[sl]?.[tier]?.[0]||5000),G.year)*0.60/500)*500;
         // Tenure premium: each year over 5 adds 2% to floor, up to +40% at 25 years
         const tenureYrs=G.year-(sd.talent._hireYear||G.year);
         const tenurePrem=Math.min(0.10, Math.max(0, tenureYrs-10)*0.01);
         const floor=Math.round(baseFl*(1+tenurePrem)/500)*500;
         if(sd.talent.salary<floor)sd.talent.salary=floor;}
        // Tenure cap: salary can float up to 1.8x market rate for very long-tenured stars
        const slotStarMax=({morningDrive:60000,afternoonDrive:42000,midday:28000,evening:22000,overnight:16000})[sd.talent.slot||sl]||42000;
        const tenureYrsForCap=G.year-(sd.talent._hireYear||G.year);
        const tenureCapMult=1.00+Math.min(0.18, Math.max(0,tenureYrsForCap-12)*0.012);
        const mktCap=Math.round(salInfl(slotStarMax,G.year)*tenureCapMult/500)*500;
        if(sd.talent.salary>mktCap)sd.talent.salary=mktCap;
      }
      // Universal floor (applies every period, not just Fall — catches legacy saves and new hires)
      {const tier2=(sd.talent.quality||30)<42?'entry':(sd.talent.quality||30)<68?'mid':'star';
       const flBase2=Math.round(salInfl((SAL[sl]?.[tier2]?.[0]||5000),G.year)*0.60/500)*500;
       const tenYrs2=G.year-(sd.talent._hireYear||G.year);
       const tenPrem2=Math.min(0.10, Math.max(0, tenYrs2-10)*0.01);
       const hardFloor=Math.round(flBase2*(1+tenPrem2)/500)*500;
       if(sd.talent.salary<hardFloor)sd.talent.salary=hardFloor;}
    }
  });
  s.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w,0));

  // ── COMMUNITY IDENTITY ───────────────────────────────────────────
  // Only player stations build meaningful identity (rivals are background)
  if(s.isPlayer){
    s._formatAge=(s._formatAge||0)+1;
    const fmtPotential=COMMUNITY_IDENTITY[s.format]||0.30;
    // Tenure bonus: formats need time to root. First 2 years slow, then compounds
    const tenureBonus=Math.min(1.5, 0.5 + (s._formatAge/16));
    // Tenure ceiling lift: for high-potential formats, long tenure unlocks higher ceiling.
    // A 30-year Soul or Country station can exceed its "base" ceiling — it's a civic institution.
    // Formats with potential >= 0.80 can climb to 95+ after 30+ years (60+ periods).
    const tenureCeilingLift=fmtPotential>=0.80?Math.min(0.18,(s._formatAge/80)*0.18):
                             fmtPotential>=0.60?Math.min(0.10,(s._formatAge/80)*0.10):0;
    const effectiveCeiling=Math.min(1.0, fmtPotential+tenureCeilingLift);
    const talent_tenure=Object.values(s.prog).reduce((sum,sd)=>{
      if(!sd?.talent)return sum;
      return sum+(sd.talent.periodsAtStation||0)*(SW[Object.keys(s.prog).find(k=>s.prog[k]===sd)]||0.1);
    },0);
    const talentBonus=Math.min(1.4, 1.0 + talent_tenure/40);
    // Localism bonus: having 2 talent slots filled (morning + afternoon) adds a modest
    // identity ceiling lift and growth boost — two live local voices > one.
    // This rewards the 2-host "local radio" model without inflating ratings directly.
    const filledSlots=Object.values(s.prog).filter(sd=>sd?.talent).length;
    const totalSlots=Object.values(s.prog).filter(sd=>sd!==undefined).length;
    const localismCeilingBonus=filledSlots>=2?0.08:0; // +8 pts on ceiling
    const localismGrowthBoost=filledSlots>=2?1.12:1.0; // +12% growth rate
    const effectiveCeiling2=Math.min(1.0, (fmtPotential+tenureCeilingLift+localismCeilingBonus));
    // Community investment spend boosts growth rate
    const investBoost=1.0+((s.identityBudget||0)/30000)*0.5;
    // Natural growth rate: potential × tenure × talent × localism, slows near ceiling
    const ceiling=Math.round(effectiveCeiling2*100);
    const cur=s.identity||0;
    const headroom=Math.max(0,ceiling-cur);
    const growthRate=fmtPotential*tenureBonus*talentBonus*investBoost*localismGrowthBoost;
    // Grow toward ceiling, slower as you approach it
    const gain=Math.min(headroom, growthRate*(1-(cur/Math.max(ceiling,1)))*2.5);
    const newIdentity=Math.min(100,Math.round((cur+gain)*10)/10);
    // Milestone moments
    if(s.isPlayer&&G){
      const milestones=[
        {threshold:25,msg:`📻 ${s.callLetters} is becoming a recognized voice in the community. Listeners are starting to think of it as "their station."`},
        {threshold:50,msg:`🏘 ${s.callLetters} has become embedded in the community — ${Math.round((s._formatAge||0)/2)} years of ${FM[s.format]?.l||s.format} have built something real. Listeners here are loyal in ways ratings don't fully capture.`},
        {threshold:75,msg:`⭐ ${s.callLetters} is a community cornerstone. This station doesn't just serve the market — it belongs to it. Changing format now would feel like a betrayal.`},
      ];
      for(const m of milestones){
        if(cur<m.threshold&&newIdentity>=m.threshold){
          G.news.unshift({v:'HIGH',t:m.msg,y:G.year,p:G.period,iy:true});
          logHistory(s,'IDENTITY',`Identity milestone: ${m.threshold} — ${m.threshold===25?'Recognized local voice':m.threshold===50?'Community institution':m.threshold===75?'Cornerstone station':'Landmark'}`,G);
        }
      }
    }
    s.identity=newIdentity;
    s._identityPeak=Math.max(s._identityPeak||0,s.identity);
  }
}

// ── STATION VIABILITY & MARKET CLEANUP ────────────────────────────
// Models real-world AM station attrition: stations go dark, sell to brokers,
// or reformat to survival niches. Prevents implausible 31-station markets.
function runMarketAttrition(G){
  if(!G||G.year<1990)return[];
  const acts=[];
  // Only run every other period (Fall) to avoid churning
  if(G.period!==2)return[];

  const year = G.year;
  // ─── Dark / brokered AM threshold ────────────────────────────────
  // Real: AM stations at sub-1% share after ~2000 would sell airtime (brokered)
  // or go dark rather than run unprofitable. Even earlier for music AMs.
  const DARK_THRESHOLD_MUSIC_AM = yr => yr>=2000?0.012:yr>=1995?0.008:0.005;
  const DARK_THRESHOLD_TALK_AM  = yr => yr>=2010?0.008:0.004;

  // Formats that are implausible on AM after a certain year.
  // RHYTHMIC: FM-native, never ran credibly on AM — mark implausible from spawn
  // CHR: ran on AM through mid-90s (WQXI etc), gone by 2000
  // ALT_ROCK: brief AM presence early 90s, FM-native by 2000
  // HOT_AC: softer sound, some AM presence through 2008
  // URBAN_CONTEMP: mostly AM-transitional, FM by 2005
  const AM_IMPLAUSIBLE_AFTER = {
    RHYTHMIC:1992, CHR:2000, ALT_ROCK:2002, HOT_AC:2008, URBAN_CONTEMP:2005
  };

  // Survival reformat pool for struggling AMs
  const amSurvivalFormats = (year) => {
    const pool = [];
    if(year>=1992)pool.push('ADULT_STANDARDS');
    if(year>=1988)pool.push('GOSPEL');
    if(year>=1992)pool.push('SPANISH');
    if(year>=1970)pool.push('NEWS_TALK');
    if(year>=1990)pool.push('SPORTS_TALK');
    return pool;
  };

  const allComm = G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic);

  // Cap: Atlanta market should have at most ~22-24 commercial stations post-2000
  // (~26 1990s, ~24 2000s, ~22 2010s — actual market data)
  const MKTCAP = year>=2015?21:year>=2005?23:year>=1995?26:99;
  const overCap = allComm.length - MKTCAP;
  // Floor: never remove stations that would take the market below minimum viable size
  // A market needs at least 8 commercial rivals to feel competitive
  const MKTFLOOR = 8;
  const canRemove = Math.max(0, allComm.length - MKTFLOOR);
  // Sort by share ascending — most vulnerable first
  const byShare = [...allComm].sort((a,b)=>a.rat.share-b.rat.share);

  let removed = 0;
  const reformattedThisPeriod = new Set(); // track formats claimed this period to prevent duplicates
  const removedIds = new Set();            // track removed IDs to skip ghost references

  for(const s of byShare){
    if(removedIds.has(s.id)) continue;    // already removed this period — skip

    const isAMMusic = s.sig.type==='AM'&&!s.fmBooster&&
      ['TOP40','COUNTRY','SOUL_RNB','MOR','ALBUM_ROCK','BEAUTIFUL_MUSIC',
       'CHR','CLASSIC_ROCK','ADULT_CONTEMP','URBAN_CONTEMP','ALT_ROCK',
       'RHYTHMIC','HOT_AC','CLASSIC_HITS','OLDIES'].includes(s.format);
    const isAMTalk = s.sig.type==='AM'&&!s.fmBooster&&
      ['NEWS_TALK','SPORTS_TALK'].includes(s.format);
    const isImplausible = s.sig.type==='AM'&&!s.fmBooster&&
      AM_IMPLAUSIBLE_AFTER[s.format]&&year>AM_IMPLAUSIBLE_AFTER[s.format];
    const shareIsGhost = s.rat.share<0.005; // truly invisible

    // Build survival pool: exclude formats already on AM, and formats
    // already claimed by another station THIS period
    const buildPool = (excludeSelf=true) => amSurvivalFormats(year).filter(f=>
      (!excludeSelf||f!==s.format) &&
      !reformattedThisPeriod.has(f) &&
      !G.stations.some(o=>o.id!==s.id&&!removedIds.has(o.id)&&
        o.format===f&&o.sig.type==='AM'&&!o.fmBooster)
    );

    // 1. Immediately reformat implausible AM formats (Rhythmic on AM after 1992 etc.)
    if(isImplausible&&s.rat.share<0.025){
      const pool = buildPool();
      if(pool.length){
        const newFmt = pool[Math.floor(Math.random()*pool.length)];
        const oldFmt = FM[s.format]?.l||s.format;
        s.format = newFmt;
        s.str = 'emerging';
        s.launchPeriod = G.turn||0;
        Object.keys(s.mom||{}).forEach(c=>s.mom[c]={tgt:0.003,cur:0.003});
        reformattedThisPeriod.add(newFmt);
        acts.push({v:'LOW',t:`📻 ${s.callLetters} reformats from ${oldFmt} → ${FM[newFmt]?.l||newFmt}: AM survival pivot.`});
        continue;
      }
    }

    // 2. Ghost stations & market overcap — remove or reformat
    const tooWeakMusic = isAMMusic&&s.rat.share<DARK_THRESHOLD_MUSIC_AM(year);
    const tooWeakTalk  = isAMTalk&&s.rat.share<DARK_THRESHOLD_TALK_AM(year);

    if(shareIsGhost||(removed<overCap&&canRemove>removed&&(tooWeakMusic||tooWeakTalk))){
      const alreadyNiche = ['GOSPEL','SPANISH','ADULT_STANDARDS'].includes(s.format);
      const pool = buildPool();

      if(!alreadyNiche&&pool.length&&Math.random()<0.65){
        const newFmt = pool[Math.floor(Math.random()*pool.length)];
        const oldFmt = FM[s.format]?.l||s.format;
        s.format = newFmt;
        s.str = 'emerging';
        s.launchPeriod = G.turn||0;
        Object.keys(s.mom||{}).forEach(c=>s.mom[c]={tgt:0.006,cur:0.006});
        reformattedThisPeriod.add(newFmt);
        acts.push({v:'LOW',t:`📻 ${s.callLetters} (${oldFmt}) shifts to ${FM[newFmt]?.l||newFmt}: finding an audience where AM still works.`});
      } else if((shareIsGhost||(removed<overCap&&alreadyNiche))&&canRemove>removed){
        acts.push({v:'LOW',t:`📻 ${s.callLetters} goes dark — ${FM[s.format]?.l||s.format} on AM, no viable audience remaining.`});
        removedIds.add(s.id);
        G.stations.splice(G.stations.indexOf(s),1);
        removed++;
      }
    }
  }
  return acts;
}

// ── COMPETITOR AI ─────────────────────────────────────────────────
function runAI(G){
  const acts=[];
  // Pre-compute player station snapshot once — rivals use this for targeting decisions
  const playerStns=G.ps;
  const playerShares=playerStns.map(s=>({id:s.id,fmt:s.format,share:s.rat.share,
    callLetters:s.callLetters,cp:s.cp,morningTalent:s.prog.morningDrive?.talent}));
  const playerWeak=playerShares.filter(ps=>ps.cp&&ps.cp.col);   // player stations in freefall
  const playerStrong=playerShares.filter(ps=>ps.share>0.08);    // player's dominant stations

  G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer).forEach(s=>{
    const p=s.pers;if(!p)return;
    const pr=s.cp;
    const crisis=pr&&pr.d2<-p.pt;
    const notic=pr&&Math.random()<p.rs&&Math.abs(pr.d2)>p.pt*.5;
    const surging=pr&&pr.sur;

    // ── TALENT CONTRACT RENEWALS ──────────────────────────────
    Object.entries(s.prog).forEach(([sl,sd])=>{
      if(!sd?.talent)return;
      if(sd.talent.cyr<=0){
        if(Math.random()<p.tr){
          sd.talent.salary=Math.round(sd.talent.salary*rnd(1.08,1.22)/500)*500;
          sd.talent.cyr=ri(1,2);
        } else {
          const nm=sd.talent.name;sd.talent=null;sd.quality*=sl==='morningDrive'?.68:.80;
          if(sl==='morningDrive')acts.push({v:'MEDIUM',t:`${nm} leaves ${s.callLetters}`});
          if(Math.random()<p.ag*.7)sd.talent=mkTal(sl,s.format,'entry',G.year);
        }
      }
      if(Math.random()<p.ms)sd.quality=Math.min(100,sd.quality+rnd(1,4));
    });

    // ── TALENT: FILL EMPTY KEY DAYPARTS (aggressive but not suicidal) ─────
    if(!s.isPublic){
      const prioritySlots=['morningDrive','afternoonDrive','midday','evening','overnight'];
      const wt={morningDrive:1.45,afternoonDrive:1.35,midday:1.0,evening:0.9,overnight:0.55};
      const empty=prioritySlots.filter(sl=>!s.prog[sl]?.talent);
      if(empty.length){
        const shareGap=Math.max(0,0.08-(s.rat.share||0));
        const losing=pr&&(pr.col||pr.under);
        const understaffed=empty.length>=3||(empty.includes('morningDrive')&&empty.includes('afternoonDrive'));
        let hireProb=0.10+0.38*p.ag;
        if(understaffed)hireProb+=0.24;
        if(losing)hireProb+=0.16;
        hireProb+=shareGap*2.4;
        if(crisis)hireProb*=0.42;
        if((s.fin?.ebitda||0)<-(s.fin?.rev||1)*0.38)hireProb*=0.4;
        empty.sort((a,b)=>(wt[b]||1)-(wt[a]||1));
        const maxHires=(understaffed&&p.ag>0.48)?2:1;
        let hires=0;
        for(const sl of empty){
          if(hires>=maxHires)break;
          if(Math.random()>Math.min(0.9,hireProb))continue;
          const tier=(sl==='morningDrive'||sl==='afternoonDrive')
            ?((p.ag>0.52||s.rat.share<0.045)?'mid':'entry')
            :(p.ag>0.58?'mid':'entry');
          const tNew=mkTal(sl,s.format,tier,G.year);
          if(!tNew)continue;
          if((s.fin?.ebitda||0)<-70000&&sl!=='morningDrive'&&sl!=='afternoonDrive')continue;
          s.prog[sl].talent=tNew;
          s.prog[sl].quality=Math.min(100,Math.round((s.prog[sl].quality||25)*0.52+tNew.quality*0.48));
          hires++;
          acts.push({v:'LOW',t:`${s.callLetters} fills ${SL[sl]} (${tier})`});
        }
        if(hires)s.oq=Math.round(Object.entries(SW).reduce((sum,[sl2,w])=>sum+effSlotQForOq(s.prog[sl2])*w,0));
      }
    }

    // ── PROGRAMMING INVESTMENT ──────────────────────────────
    {
      const baseInvest=Math.round((s.fin.rev||0)*(p.pi||0.04));
      // Surge: aggressive types reinvest winnings to press their advantage
      const surgeMult=surging&&p.ag>.50?1.4:1.0;
      const pressureMult=crisis?1.8:notic?1.35:1.0;
      const invest=Math.round(baseInvest*Math.max(surgeMult,pressureMult)*rnd(0.8,1.2));
      s.progInvestment=(s.progInvestment||0)+invest;
    }

    // ── PROMO SPEND — also fires when rival is SURGING near a weak player ──
    {
      const basePromo=Math.round((s.fin.rev||0)*(p.pm||0.02));
      const pressureBoost=notic?Math.round(rnd(5000,18000)*p.ag):0;
      // Opportunistic: scrapper/maverick types spend big promo when a nearby
      // compatible player station is collapsing
      let opportunBoost=0;
      if(surging&&p.ag>=0.65&&playerWeak.length){
        const compatWeak=playerWeak.filter(pw=>
          (FADJ[s.format]||[]).includes(pw.fmt) || pw.fmt===s.format
        );
        if(compatWeak.length){
          opportunBoost=Math.round(rnd(8000,25000)*p.ag);
          // Only news-worthy if it's a direct hit on player's big station
          const bigHit=compatWeak.find(pw=>pw.share>0.07);
          if(bigHit&&Math.random()<0.5){
            acts.push({v:'MEDIUM',
              t:`📢 ${s.callLetters} launches aggressive promo targeting ${bigHit.callLetters}'s audience`,
              iy:true});
          }
        }
      }
      s.ops.promo=Math.min(80000,Math.round((basePromo+pressureBoost+opportunBoost)*rnd(0.7,1.3)));
    }

    // ── TALENT: DEFENSIVE UPGRADE (own house in crisis) ──────
    if(crisis&&p.ag>.45){
      const ms=s.prog.morningDrive;
      if(ms?.talent&&ms.talent.quality<65){
        const old=ms.talent.name;
        ms.talent=mkTal('morningDrive',s.format,p.ag>.6?'mid':'entry',G.year);
        ms.quality=Math.min(100,ms.quality+ms.talent.quality*.3);
        acts.push({v:'MEDIUM',t:`${s.callLetters} replaces morning host (was ${old})`});
      }
    }

    // ── TALENT: TARGETED POACHING ─────────────────────────────
    // Priority order:
    //   1. Poach from a WEAK PLAYER station (if rival is surging or aggressive)
    //   2. Poach best talent in market (any station, existing behavior)
    // Only SCRAPPER / MAVERICK / CORP_RADIO types do this with any regularity.
    const canPoach=p.ag>=0.65&&!crisis; // don't poach while in your own crisis
    if(canPoach&&Math.random()<p.ag*0.35){
      // Attempt 1: target a vulnerable player morning show
      const targetPlayerStation=playerWeak.find(pw=>{
        const sameFmt=pw.fmt===s.format;
        const compatFmt=(FADJ[s.format]||[]).includes(pw.fmt);
        return (sameFmt||compatFmt)&&pw.morningTalent&&pw.morningTalent.quality>=55;
      });

      if(targetPlayerStation&&Math.random()<(surging?0.65:0.40)){
        // Find the actual station object — player gets one period to match salary (see resolvePendingRivalPoaches)
        const pStn=playerStns.find(st=>st.id===targetPlayerStation.id);
        const tal=pStn?.prog?.morningDrive?.talent;
        if(pStn&&tal&&!pStn._rivalPoachPending){
          const nm=tal.name;
          const newSal=Math.round(tal.salary*rnd(1.35,1.70)/500)*500;
          if(!s._poachCooldown||s._poachCooldown<=0){
            pStn._rivalPoachPending={
              rivalId:s.id,slot:'morningDrive',offerSalary:newSal,talentId:tal.id,
              announcedY:G.year,announcedP:G.period,matched:false
            };
            s._poachCooldown=4;
            acts.push({v:'HIGH',
              t:`⚡ ${s.callLetters} is courting ${nm} at ${pStn.callLetters} (${f$(newSal)}/yr) — you have one period to match in contract.`,
              iy:true});
          }
        }
      } else {
        // Attempt 2: best available talent anywhere — instant poach vs rivals; deferred vs player
        let best=null,bq=0;
        G.stations.forEach(o=>{
          if(!o||o._bpSlotDeferred||o.id===s.id||o.isPublic)return;
          const mt=o.prog.morningDrive;
          if(mt?.talent&&mt.talent.quality>bq&&mt.talent.quality>=60){
            bq=mt.talent.quality;best={st:o,t:mt.talent};
          }
        });
        if(best&&Math.random()<0.30){
          if(best.st.isPlayer){
            const pStn=best.st,tal=pStn.prog.morningDrive.talent;
            if(tal&&!pStn._rivalPoachPending&&(!s._poachCooldown||s._poachCooldown<=0)){
              const newSal=Math.round(tal.salary*rnd(1.30,1.60)/500)*500;
              pStn._rivalPoachPending={
                rivalId:s.id,slot:'morningDrive',offerSalary:newSal,talentId:tal.id,
                announcedY:G.year,announcedP:G.period,matched:false
              };
              s._poachCooldown=4;
              acts.push({v:'HIGH',t:`⚡ ${s.callLetters} is courting ${tal.name} at ${pStn.callLetters} (${f$(newSal)}/yr).`,iy:true});
            }
          } else {
            const nm=best.t.name;
            best.st.prog.morningDrive.talent=null;best.st.prog.morningDrive.quality*=.72;
            s.prog.morningDrive.talent={...best.t,salary:Math.round(best.t.salary*rnd(1.30,1.60)/500)*500};
            s.prog.morningDrive.quality=Math.min(100,s.prog.morningDrive.quality+bq*.4);
            const iy=G.ps.some(st=>st.callLetters===best.st.callLetters);
            acts.push({v:'HIGH',t:`⚡ ${s.callLetters} poaches ${nm} from ${best.st.callLetters}`,iy});
          }
        }
      }
    }

    // ── FORMAT ENCROACHMENT WARNING ──────────────────────────
    // A surging rival notices when the player dominates a compatible format
    // and the rival's own format is struggling — it becomes a reformat candidate.
    // This feeds into rivalReformat's existing logic via _lowSharePeriods,
    // but we can accelerate it for aggressive types.
    if(surging&&p.ag>=0.70&&!crisis&&Math.random()<0.15){
      const dominatedByPlayer=playerStrong.find(ps=>{
        const rivalCanEnter=(FADJ[s.format]||[]).includes(ps.fmt);
        return rivalCanEnter&&ps.share>0.10;
      });
      if(dominatedByPlayer&&s.rat.share<0.05){
        // Nudge the rival toward considering that format — accelerate pressure counter
        s._lowSharePeriods=(s._lowSharePeriods||0)+1;
        acts.push({v:'LOW',
          t:`📊 ${s.callLetters} eyes ${FM[dominatedByPlayer.fmt]?.l||dominatedByPlayer.fmt} — management reportedly watching ${dominatedByPlayer.callLetters}`});
      }
    }

    // ── POACH COOLDOWN TICK ───────────────────────────────────
    if(s._poachCooldown>0)s._poachCooldown--;

    // ── SELLOUT RATE ADJUSTMENT ───────────────────────────────
    if(pr){
      let d=0;
      if(pr.sur)d=+.025;else if(pr.col)d=-.040;else if(pr.under)d=-.018;
      s.ops.sell=Math.max(.20,Math.min(.96,s.ops.sell+d));
    }
  });
  return acts;
}


// ── EVENTS & RIVAL ENTRY ──────────────────────────────────────────

// ── FORMAT STRATEGY (DRIFT) MODAL ────────────────────────────────
function openDrift(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const dr=getDrift(s);
  if(!dr){alert('No format strategy available for '+FM[s.format]?.l);return;}
  const cfg=dr.cfg;
  const val=dr.val;

  // Upcoming inflections this decade
  const upcoming=cfg.inflections.filter(inf=>
    inf.y>G.year||(inf.y===G.year&&inf.p>=G.period)
  ).slice(0,3);

  const upcomingHtml=upcoming.length?`
    <div class="ms2" style="margin-top:12px">
      <div class="msh">⚡ UPCOMING INFLECTIONS</div>
      ${upcoming.map(inf=>`
        <div class="sr" style="flex-direction:column;align-items:flex-start;gap:4px;padding:8px 0;border-bottom:1px solid var(--adm)">
          <span style="font-family:var(--fd);color:var(--amb)">${inf.name} — ${inf.y} ${inf.p===1?'Spring':'Fall'}</span>
          <span style="font-family:var(--ft);font-size:14px;color:var(--mut)">${inf.desc}</span>
          <span style="font-family:var(--ft);font-size:15px;color:var(--wht)">Your current positioning: <strong>${val<35?'favors '+cfg.poleA.name:val>65?'favors '+cfg.poleB.name:'neutral'}</strong></span>
        </div>`).join('')}
    </div>`:'<div class="ibox" style="margin-top:8px">No major inflections on the horizon this decade.</div>';

  document.getElementById('drift-title').textContent=`${s.callLetters} — ${cfg.label.toUpperCase()}`;
  document.getElementById('driftb').innerHTML=`
    <p class="di">Your positioning within <strong>${FM[s.format]?.l||s.format}</strong> affects which demographics you attract and how exposed you are to format inflection events. Move the slider deliberately — overcorrecting can cost you your core audience.</p>
    <div class="slsec">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-family:var(--fd);font-size:15px;color:var(--mut);text-transform:uppercase">${cfg.poleA.name}</span>
        <span style="font-family:var(--fd);font-size:15px;color:var(--amb);text-transform:uppercase">${cfg.poleB.name}</span>
      </div>
      <input type="range" min="0" max="100" step="5" value="${val}" id="drift-slider"
        style="width:100%;accent-color:var(--amb)" oninput="updDrift('${sid}',this.value)">
      <div style="display:flex;justify-content:space-between;margin-top:6px">
        <span style="font-family:var(--ft);font-size:15px;color:var(--mut)">${cfg.poleA.desc}</span>
        <span style="font-family:var(--ft);font-size:15px;color:var(--mut);text-align:right;max-width:45%">${cfg.poleB.desc}</span>
      </div>
      <div class="sln2" id="drift-note" style="margin-top:10px;font-size:15px"></div>
    </div>
    ${upcomingHtml}
    <button class="cfm" id="drift-btn" onclick="doDrift('${sid}')">COMMIT POSITIONING</button>
    <button class="cnl" onclick="cm('m-drift')">CANCEL</button>`;
  updDrift(sid, val);
  om('m-drift');
}

function updDrift(sid, v){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const dr=getDrift(s);if(!dr)return;
  const val=parseInt(v);
  const cfg=dr.cfg;
  const pos=val<20?cfg.poleA.name+' (strong)':val<40?cfg.poleA.name:val<60?'Neutral / Balanced':val<80?cfg.poleB.name:cfg.poleB.name+' (strong)';
  const posColor=val<40?'var(--grn)':val>60?'var(--amb)':'var(--wht)';
  const note=document.getElementById('drift-note');
  if(note)note.innerHTML=`Current positioning: <strong style="color:${posColor}">${pos}</strong><br>
    <span style="color:var(--mut);font-size:14px">Changes take effect next period as your audience adjusts to the new direction.</span>`;
}

function doDrift(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const slider=document.getElementById('drift-slider');if(!slider)return;
  if(!s.drift)s.drift={};
  const oldVal=s.drift[s.format]||DRIFT[s.format]?.default||50;
  const newVal=parseInt(slider.value);
  s.drift[s.format]=newVal;
  if(!s.driftHistory)s.driftHistory={};
  if(!s.driftHistory[s.format])s.driftHistory[s.format]={commitYear:G.year};
  // Sync to simulcast partner — same station, same strategy
  if(s.simulcastWith){
    const partner=G.stations.find(st=>st.id===s.simulcastWith);
    if(partner){
      if(!partner.drift)partner.drift={};
      partner.drift[s.format]=newVal;
      if(!partner.driftHistory)partner.driftHistory={};
      if(!partner.driftHistory[s.format])partner.driftHistory[s.format]={commitYear:G.year};
    }
  }
  const dr=DRIFT[s.format];
  const dir=newVal>oldVal?'→ '+dr?.poleB.name:'← '+dr?.poleA.name;
  G.news.unshift({v:'LOW',t:`${s.callLetters} repositions: ${dir} (${oldVal}→${newVal})`,y:G.year,p:G.period});
  MP.action('drift', {sid, fmt:s.format, val:newVal});
  cm('m-drift');renderAll();
}

// ── PLEDGE DRIVE EVENTS ──────────────────────────────────────────
function pledgeDriveCheck(G){
  // Pledge drives happen in Spring of years divisible by 2
  if(G.period!==1||G.year%2!==0)return[];
  const acts=[];
  G.stations.filter(s=>s.isPublic).forEach(s=>{
    // Pledge drive: 2-period suppression of appeal via mom nudge downward
    Object.keys(s.mom||{}).forEach(coh=>{
      const m=s.mom[coh];
      if(m)m.tgt=Math.max(0.001,m.tgt*0.75); // 25% temporary dip
    });
    acts.push({v:'LOW',
      t:`📻 ${s.callLetters} pledge drive — listener fatigue creates a 2-period ratings window for commercial stations.`,
      y:G.year,p:G.period});
  });
  return acts;
}
function applyDriftInflections(G){
  // Check each driftable format for historical inflection events this period
  const acts=[];
  G.stations.forEach(s=>{
    const dr=getDrift(s);
    if(!dr)return;
    (dr.cfg.inflections||[]).forEach(inf=>{
      if(inf.y===G.year&&inf.p===G.period){
        // Event fires — compute effect based on current drift
        const effect=inf.effect(s,dr.val);
        if(Math.abs(effect)<0.001)return;
        // Apply as a share modifier by nudging mom targets
        Object.keys(s.mom||{}).forEach(coh=>{
          const m=s.mom[coh];
          if(m)m.tgt=Math.max(0.001,Math.min(0.30,m.tgt+effect));
        });
        const dir=effect>0?'surge':'loss';
        const owner=s.isPlayer?'YOUR':'';
        acts.push({v:effect>0?'MEDIUM':'HIGH',
          t:`📡 ${inf.name}: ${owner?'YOUR ':''}${s.callLetters} (${FM[s.format]?.l}) — ${dir} from drift positioning`,
          iy:s.isPlayer});
      }
    });
  });
  return acts;
}
function chkEv(G){
  const f=[];
  G.evq=G.evq.filter(ev=>{
    if(ev.y===G.year&&ev.p===G.period){applyEv(G,ev);f.push(ev);return false;}return true;
  });
  return f;
}
function applyEv(G,ev){
  if(!ev.e)return;
  const parts=ev.e.split('|');
  parts.forEach(e=>{
    if(e.startsWith('fp+')){/* fmp now driven by smoothstep curve — event logged for news only */}
    else if(e.startsWith('ad+')){G.adx=Math.min(2.5,G.adx+parseFloat(e.slice(3)));}
    else if(e.startsWith('ad-')){G.adx=Math.max(.3,G.adx-parseFloat(e.slice(3)));}
    else if(e==='ntb'||e==='ntb2'||e==='ntb3')G.stations.filter(s=>['NEWS_TALK','SPORTS_TALK'].includes(s.format)).forEach(s=>{s.oq=Math.min(100,s.oq+5);Object.values(s.prog).forEach(sl=>{if(sl)sl.quality=Math.min(100,sl.quality+4);});});
    else if(e==='talkboost')G.stations.filter(s=>['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'].includes(s.format)).forEach(s=>{s.ops.sell=Math.min(.96,s.ops.sell+.06);});
    else if(e==='disco')G.stations.filter(s=>s.format==='SOUL_RNB').forEach(s=>{s.ops.sell=Math.min(.96,s.ops.sell+.04);});
    else if(e==='anti-disco')G.stations.filter(s=>s.format==='SOUL_RNB').forEach(s=>{s.oq=Math.max(10,s.oq-8);});
    else if(e==='sat+')G.satDrag=Math.min(.25,G.satDrag+.04);
    else if(e==='stream+')G.streamDrag=Math.min(.60,G.streamDrag+.06);
    else if(e==='amtalk_warn'||e==='amtalk_warn2'){
      // If player has an AM Talk/Sports station without FM, make it personal
      const amTalkStns=G.ps.filter(s=>['NEWS_TALK','SPORTS_TALK'].includes(s.format)&&s.sig.type==='AM'&&!s.fmBooster&&!s.simulcastWith);
      if(amTalkStns.length){
        const names=amTalkStns.map(s=>s.callLetters).join(', ');
        G.news.unshift({v:'HIGH',t:`📻 ${names}: Your AM Talk ${amTalkStns.length>1?'stations are':'station is'} now facing audience erosion from streaming and podcasts. Add an FM simulcast or translator to stop the bleed.`,y:G.year,p:G.period,iy:true});
      }
    }
    else if(e==='podboost')G.stations.filter(s=>s.format==='PODCAST_TALK').forEach(s=>{s.ops.sell=Math.min(.96,s.ops.sell+.08);});
    else if(e.startsWith('fmt_sunset:')){
      // Sunset: non-player stations in dying format start migrating to successors
      const [,dying,successor]=e.split(':');
      const MOR_SUCCESSORS=['NEWS_TALK','ADULT_CONTEMP','ADULT_STANDARDS','NEWS_TALK']; // NT weighted 2x
      const BEAUTIFUL_SUCCESSORS=['ADULT_CONTEMP','HOT_AC','ADULT_CONTEMP','ADULT_STANDARDS'];
      const successorPool=dying==='MOR'?MOR_SUCCESSORS:dying==='BEAUTIFUL_MUSIC'?BEAUTIFUL_SUCCESSORS:[successor];
      let migrateIdx=0;
      G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic&&s.format===dying).forEach(s=>{
        // 75% migrate on the event — rest stay until rivalReformat catches them
        if(Math.random()<0.75){
          const old=FM[s.format]?.l||s.format;
          const target=successorPool[migrateIdx++%successorPool.length];
          // Only migrate to unlocked formats
          if(!target||!FM[target]||(FM[target].unlock||0)>G.year)return;
          s.format=target;
          if(!s.drift)s.drift={};
          s.drift[target]=DRIFT[target]?.default||40;
          Object.keys(s.mom||{}).forEach(c=>s.mom[c]={tgt:0.01,cur:0.01});
          s.str='emerging';s.launchPeriod=G.turn||0;
          G.news.unshift({v:'LOW',t:`📻 ${s.callLetters} abandons ${old} → ${FM[target]?.l||target} as format fades.`,y:G.year,p:G.period});
        }
      });
      // Player stations get a warning — give format-specific advice
      const paths={MOR:'News/Talk or Adult Contemporary',BEAUTIFUL_MUSIC:'Adult Contemporary',OLDIES:'Classic Hits'};
      const path=paths[dying]||'a contemporary format';
      G.ps.filter(s=>s.format===dying).forEach(s=>{
        G.news.unshift({v:'HIGH',t:`⚠ ${s.callLetters}: ${FM[dying]?.l||dying} is in terminal decline. Consider reformatting to ${path}.`,y:G.year,p:G.period,iy:true});
      });
    }
    else if(e.startsWith('fmt_purge:')){
      // Purge: format is truly dead — all remaining non-player stations forced out
      const dying=e.split(':')[1];
      const successors={BEAUTIFUL_MUSIC:'ADULT_CONTEMP',MOR:'NEWS_TALK',OLDIES:'CLASSIC_HITS'};
      const succ=successors[dying]||'NEWS_TALK';
      G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic&&s.format===dying).forEach(s=>{
        s.format=succ;
        Object.keys(s.mom||{}).forEach(c=>s.mom[c]={tgt:0.005,cur:0.005});
        s.str='emerging';s.launchPeriod=G.turn||0;
      });
      // Player stations locked out of hiring in this format — strong warning
      G.ps.filter(s=>s.format===dying).forEach(s=>{
        G.news.unshift({v:'HIGH',t:`🚨 ${s.callLetters}: ${FM[dying]?.l||dying} is extinct as a commercial format. You must reformat immediately.`,y:G.year,p:G.period,iy:true});
      });
    }
    else if(e==='consolidate'){
      // Telecom Act fires — initialize consolidation system and do first wave
      initConsolidation(G);
      G.news.unshift({v:'HIGH',t:'📡 Telecom Act of 1996: ownership caps removed. Corporate radio begins buying spree.',y:G.year,p:G.period});
    }
    else if(e.startsWith('fcc-')){
      const yr=parseInt(e.slice(4));
      const lim=fccLimits(yr,G.stations.length);
      G.news.unshift({v:'HIGH',t:`📋 FCC: ${lim.label}`,y:G.year,p:G.period});
    }
    else if(e.startsWith('unlock-')){
      const f=e.slice(7);
      if(!G.unlockedFormats.includes(f))G.unlockedFormats.push(f);
    }
    else if(e.startsWith('rival-')){
      // rival-FORMAT-TYPE-POWER-STR
      const[,fmt,type,pw,str]=e.split('-');
      if(!fmt||!FM[fmt])return;
      const freq=nextFreq(type);
      const s=mkStn({type,fmt,pw,str},freq,G.year);
      s.color=CLR[G.stations.length%CLR.length];
      s.entryTurn={year:G.year,period:G.period};
      s.launchPeriod=G.turn||0;
      G.stations.push(s);
      seedNewEntry(s,G);calcRev(s,G);
      G.news.unshift({v:'MEDIUM',t:`📡 New station enters Atlanta: ${s.callLetters} — ${FM[fmt]?.l} (${type} ${freq})`,y:G.year,p:G.period});
    }
  });
}

// ── SCORING ───────────────────────────────────────────────────────
// Decade VP values — earlier decades worth less, finale weighted heaviest
const DECADE_VP={1979:8,1989:10,1999:12,2009:12,2019:14,2020:20};


// Per-player scoreCalc for MP — uses _playerScore[pid] not shared G.score
function playerScoreCalc(pid){
  const ps = G._playerScore?.[pid];
  if(!ps) return scoreCalc(G); // solo fallback
  const shareAvg = ps.shareHistory?.length
    ? ps.shareHistory.reduce((a,b)=>a+b,0)/ps.shareHistory.length : 0;
  // Benchmark: 10% avg share = 100pts. In a 20-station market, consistently holding
  // 10% is genuinely strong — accounts for the fact players have 1-2 stations not 3+
  const shareScore = Math.min(100,Math.round(shareAvg/0.10*100));
  const startCash = G._draftStartCash?.[pid] || G.sc.cash || 500000;
  const cashGrowth = ((ps.cash||0) - startCash)/startCash;
  const cashScore = Math.min(100,Math.max(0,Math.round(50+cashGrowth*30)));
  // Peak revenue benchmark: $500K/period = 100pts for a 1-2 station operation
  // ($250K was calibrated for solo 3-station play — too easy in MP)
  const peakScore = Math.min(100,Math.round(((ps.peakRevenue||0)/500000)*100));
  // Streaming: only player's own stations
  const myStations = G.ps.filter(s=>s._mpOwner===pid);
  let streamScore=0;
  if(G.year>=2009){
    const streamStations=myStations.filter(s=>s.stream?.active).length;
    const total=myStations.length||1;
    const earlyMover=myStations.some(s=>s.stream?.active&&s.stream.launchYear<=2009);
    const streamRevShare=myStations.reduce((s,st)=>s+(st.fin.streamRev||0),0)/
      Math.max(1,myStations.reduce((s,st)=>s+(st.fin.rev||0),0));
    streamScore=Math.min(100,Math.round((streamStations/total)*50+(earlyMover?20:0)+streamRevShare*100*.30));
  }
  const avgIdentity=myStations.length?myStations.reduce((s,st)=>s+(st.identity||0),0)/myStations.length:0;
  const peakIdentity=myStations.reduce((mx,st)=>Math.max(mx,st._identityPeak||0),0);
  const identityScore=Math.min(100,Math.round(avgIdentity*.6+peakIdentity*.4));
  const decade=G.year;
  let total;
  if(decade<=1989)      total=Math.round(shareScore*.50+cashScore*.23+peakScore*.18+identityScore*.09);
  else if(decade<=1999) total=Math.round(shareScore*.46+cashScore*.22+peakScore*.23+identityScore*.09);
  else if(decade<=2009) total=Math.round(shareScore*.42+cashScore*.18+peakScore*.18+streamScore*.14+identityScore*.08);
  else                  total=Math.round(shareScore*.37+cashScore*.13+peakScore*.13+streamScore*.29+identityScore*.08);
  const maxVP=DECADE_VP[decade]||10;
  // Per-player loan penalty: only count this player's loans
  const myLoans=(G._playerLoans?.[pid]||[]).reduce((s,l)=>s+l.owed,0);
  const debtPenalty=Math.min(20,Math.round(myLoans/625000)*3);
  const finalTotal=Math.max(0,total-debtPenalty);
  const finalVP=Math.round((finalTotal/100)*maxVP);
  return{shareScore,cashScore,peakScore,streamScore,identityScore,total:finalTotal,shareAvg,peakRevenue:ps.peakRevenue||0,vp:finalVP,maxVP,debtPenalty};
}
function scoreCalc(G){
  const shareAvg=G.score.shareHistory.length?G.score.shareHistory.reduce((a,b)=>a+b,0)/G.score.shareHistory.length:0;
  const shareScore=Math.min(100,Math.round(shareAvg/0.08*100));
  const cashGrowth=(G.cash-G.sc.cash)/G.sc.cash;
  const cashScore=Math.min(100,Math.max(0,Math.round(50+cashGrowth*30)));
  const peakScore=Math.min(100,Math.round((G.score.peakRevenue/250000)*100));

  // Streaming readiness score (only matters 2009+)
  // Full points: all player stations streaming by 2009, early movers bonus
  let streamScore=0;
  if(G.year>=2009){
    const streamStations=G.ps.filter(s=>s.stream?.active).length;
    const totalStations=G.ps.length;
    const coveragePct=totalStations>0?streamStations/totalStations:0;
    // Early mover bonus: launched before 2010
    const earlyMover=G.ps.some(s=>s.stream?.active&&s.stream.launchYear<=2009);
    // Revenue contribution from streaming
    const streamRevShare=G.ps.reduce((sum,s)=>sum+(s.fin.streamRev||0),0)/
      Math.max(1,G.ps.reduce((sum,s)=>sum+(s.fin.rev||0),0));
    streamScore=Math.min(100,Math.round(
      coveragePct*50 + (earlyMover?20:0) + streamRevShare*100*.30
    ));
  }

  // Community identity score — rewards building deep roots, not just ratings
  const playerStations=G.ps||[];
  const avgIdentity=playerStations.length?
    playerStations.reduce((s,st)=>s+(st.identity||0),0)/playerStations.length:0;
  const peakIdentity=playerStations.reduce((mx,st)=>Math.max(mx,st._identityPeak||0),0);
  const identityScore=Math.min(100,Math.round(avgIdentity*.6+peakIdentity*.4));

  // Weighted total — streaming weight grows in later decades
  const decade=G.year;
  // Identity carries a modest weight — it's a tiebreaker and flavor, not the main game
  let total;
  if(decade<=1989)      total=Math.round(shareScore*.50+cashScore*.23+peakScore*.18+identityScore*.09);
  else if(decade<=1999) total=Math.round(shareScore*.46+cashScore*.22+peakScore*.23+identityScore*.09);
  else if(decade<=2009) total=Math.round(shareScore*.42+cashScore*.18+peakScore*.18+streamScore*.14+identityScore*.08);
  else                  total=Math.round(shareScore*.37+cashScore*.13+peakScore*.13+streamScore*.29+identityScore*.08);

  // Convert to VP for this decade checkpoint
  const maxVP=DECADE_VP[decade]||10;
  const vp=Math.round((total/100)*maxVP);

  // Loan penalty: outstanding loans at checkpoint reduce score and VP
  const outstandingDebt=(G.loans||[]).reduce((s,l)=>s+l.owed,0);
  const debtPenalty=Math.min(20,Math.round(outstandingDebt/625000)*3);
  const finalTotal=Math.max(0,total-debtPenalty);
  const finalVP=Math.round((finalTotal/100)*maxVP);
  return{shareScore,cashScore,peakScore,streamScore,identityScore,total:finalTotal,shareAvg,peakRevenue:G.score.peakRevenue||0,vp:finalVP,maxVP,debtPenalty};
}
function gradeFromScore(t){return t>=85?'A':t>=70?'B':t>=55?'C':t>=40?'D':'F';}

// ── PRESSURE ──────────────────────────────────────────────────────
function checkPressure(G){
  const alerts=[];
  if(G.score.isSandbox)return alerts;
  // Warn player if on a format past its sunset — revenue will keep falling
  const fmtSunsets={BEAUTIFUL_MUSIC:1995,MOR:1998};
  (MP.mode==='live' ? G.ps.filter(s=>s._mpOwner===MP.playerId) : G.ps).forEach(s=>{
    const sunset=fmtSunsets[s.format];
    if(sunset&&G.year>=sunset){
      const yearsOver=G.year-sunset;
      const urgency=yearsOver>=5?'🚨':'⚠';
      alerts.push(`${urgency} ${s.callLetters} (${FM[s.format]?.l}): This format has been commercially extinct since ${sunset}. Audience appeal is near zero — reformat immediately.`);
    }
  });
  const _pressCash = MP.mode==='live' ? (G._playerCash?.[MP.playerId]||G.cash) : G.cash;
  const _pressMyStns = MP.mode==='live' ? G.ps.filter(s=>s._mpOwner===MP.playerId) : G.ps;
  if(_pressCash<0){
    G.debtWarningQ=(G.debtWarningQ||0)+1;
    alerts.push(`⚠ DEBT: Cash negative (${f$(_pressCash)}). Recover within ${Math.max(0,2-G.debtWarningQ)} periods or face forced asset sale.`);
    if(G.debtWarningQ>=2){
      const weakest=[..._pressMyStns].sort((a,b)=>a.fin.ebitda-b.fin.ebitda)[0];
      if(weakest&&_pressMyStns.length>1){
        const price=Math.round(weakest.fin.rev*3);
        G.cash+=price;breakSimulcast(G,weakest.id);
        weakest.isPlayer=false;G.ps=G.stations.filter(s=>s.isPlayer);
        G.news.unshift({v:'HIGH',t:`🏦 FORCED SALE: ${weakest.callLetters} sold for ${f$(price)} to cover debt.`,y:G.year,p:G.period});
        G.debtWarningQ=0;
      }
    }
  }else{G.debtWarningQ=0;}
  return alerts;
}

// ── GENERATE MARKET ───────────────────────────────────────────────
function genMarket(scenId){
  UC=new Set();UB=new Set();amfIdx=0;fmfIdx=0;
  // Resolve scenario first so we can build BP talent at the correct start year
  const sc=scenId?SC.find(s=>s.id===scenId)||pick(SC):pick(SC);
  const bpYear=sc.startYear||1970;
  const stations=BP.map((bp,i)=>{
    const freq=nextFreq(bp.type);
    if(bpYear===1970&&ATLANTA_1970_DEFER_IDX.has(i))
      return{_bpSlotDeferred:true,_bpIdx:i,_deferFreq:freq};
    return mkStn(bp,freq,bpYear);
  });
  stations.forEach((s,i)=>{ if(s&&!s._bpSlotDeferred) s.color=CLR[i%CLR.length]; });
  // BP stations are established — mark them mature so recalc
  // uses their full tier b-value, not launchB (which is for new entrants)
  stations.forEach(s=>{ if(s&&!s._bpSlotDeferred) s.launchPeriod=-999; });

  // Clear channel designation: BP index 4 (dominant 50kW AM MOR — the WSB archetype)
  // is a Class A clear-channel station: unlimited power day/night, no directionality.
  // One other 50kW AM (index 0, the dominant Top40) is also clear channel in this market.
  // The rest (indices 1, 2, 5, 10) are 50kW daytime / reduced-power directional at night.
  [0, 4].forEach(i => { const st=stations[i]; if(st&&!st._bpSlotDeferred) st.clearChannel = true; });

  sc.idx.forEach((i,pi)=>{if(stations[i]&&!stations[i]._bpSlotDeferred){stations[i].isPlayer=true;
    // WSB scenario: dominant heritage station — minimal quality penalty (you inherited a well-run operation)
    // Quality adjustment: WSB starts near-peak; other scenarios tuned by oqBoost
    const oqAdj=sc.oqBoost||0;
    if(sc.id==='wsb'){
      stations[i].oq=Math.max(68,stations[i].oq-ri(2,6));
    } else {
      const base=Math.max(28,stations[i].oq-ri(8,18));
      stations[i].oq=Math.max(15,Math.min(85,base+oqAdj));
    }
    // Propagate oq adjustment to individual daypart quality
    Object.values(stations[i].prog).forEach(sd=>{if(sd)sd.quality=Math.max(12,Math.min(90,(sd.quality||30)+oqAdj*0.6));});
    stations[i].color='#f5a623';}});
  // Validate FCC: stack scenario has 1AM+1FM which is legal; others have 1 station
  // ── PUBLIC RADIO STATIONS (injected 1975+, always present) ──
  // WABE-style public news/talk and WCLK-style public classical
  // These are permanent fixtures — not on the Rival Board, not purchasable
  // Build public stations manually — skips mkStn/mkTal which expects commercial formats
  function mkPub(cl,freq,fmt,pw,reach,brand,oq,launchYear,color){
    const p={};Object.keys(SL).forEach(k=>{p[k]=null;});
    const m={};COH.forEach(c=>{m[c]={tgt:0.01,cur:0.01};});
    return{
      id:Math.random().toString(36).substr(2,8),
      callLetters:cl,freq,brand,format:fmt,oq,color,
      sig:{type:'FM',pw,reach,universe:reach*0.7},
      str:'moderate',launchPeriod:0,
      rat:{cur:{},hist:[],share:0,aqh:0,margin:0.018},
      ops:{spots:0,sell:0,promo:0,progBudget:0},
      stream:{active:false,aqh:0,rev:0,upkeep:0,dragOffset:0,launchYear:0},
      fin:{rev:0,cost:0,ebitda:0},
      cp:null,mom:m,prog:p,pers:PD.PUBLIC,
      isPlayer:false,isPublic:true,
      _pubLaunchYear:launchYear,
      simulcastWith:null,demoLean:0,progInvestment:0,entryTurn:null,_history:[],
      drift:{},flog:[],
    };
  }
  const pubNews=mkPub(gc(),'88.5 FM','PUBLIC_NEWS','50kw',0.92,gb('PUBLIC_NEWS'),72,1975,'#94a3b8');
  const pubClass=mkPub(gc(),'90.1 FM','PUBLIC_CLASSICAL','25kw',0.78,gb('PUBLIC_CLASSICAL'),68,1979,'#7c8fa8');
  stations.push(pubNews,pubClass);
  seedRat(stations,1970);
  // WSB scenario: post-seed correction — heritage 50kw MOR was genuinely dominant,
  // often 18-22% total share. seedRat caps at 22% per cohort, but the weighted
  // overall comes out lower because youth cohorts (MOR FA near-zero) dilute the total.
  // We directly set the player to a historically realistic 19-21% share
  // by redistributing from the market proportionally.
  if(sc.id==='wsb'){
    const wsb=stations.find(s=>s.isPlayer);
    if(wsb){
      const targetShare=rnd(0.18,0.21);
      const currentShare=wsb.rat.share||0.095;
      const boostFactor=targetShare/Math.max(currentShare,0.05);
      // Scale up player's per-cohort shares; scale down others proportionally
      COH.forEach(coh=>{
        const cur=wsb.rat.cur[coh];
        if(!cur)return;
        const oldSh=cur.share;
        const newSh=Math.min(0.38,oldSh*boostFactor); // 0.38 cap per cohort for WSB's core demos
        const delta=newSh-oldSh;
        cur.share=newSh;
        const pop=(POP.cohorts[coh]?.t||0)*effUniverse(wsb);
        cur.aqh=Math.round(newSh*pop*(AQH_ENGAGE[coh]||0.060));
        wsb.mom[coh]={tgt:newSh,cur:newSh};
        // Redistribute delta proportionally from rivals
        const rivals=stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic&&s.rat.cur[coh]);
        const rivTotal=rivals.reduce((a,s)=>a+(s.rat.cur[coh]?.share||0),0);
        if(rivTotal>0.001&&delta>0)rivals.forEach(s=>{
          const s2=s.rat.cur[coh];
          const reduction=(s2.share/rivTotal)*delta;
          s2.share=Math.max(0.001,s2.share-reduction);
          const pop2=(POP.cohorts[coh]?.t||0)*effUniverse(s);
          s2.aqh=Math.round(s2.share*pop2*(AQH_ENGAGE[coh]||0.060));
          s.mom[coh]={tgt:s2.share,cur:s2.share};
        });
      });
      // Recompute weighted overall share for WSB and rivals
      const ewp=COH.reduce((s,c)=>{const pop=POP.cohorts[c]?.t||0;const eng=AQH_ENGAGE[c]||0.060;return s+pop*eng;},0);
      stations.forEach(s=>{
        if(!s||s._bpSlotDeferred)return;
        s.rat.aqh=COH.reduce((sum,c)=>sum+(s.rat.cur[c]?.aqh||0),0);
        s.rat.share=COH.reduce((sum,c)=>{
          const pop=POP.cohorts[c]?.t||0;const eng=AQH_ENGAGE[c]||0.060;
          return sum+(s.rat.cur[c]?.share||0)*(pop*eng)/Math.max(ewp,1);
        },0);
      });
    }
  }
  const startYear=sc.startYear||1970;

  // For non-1970 starts: inject rivals that would have launched between 1970 and startYear.
  // Events with rival- in their effect string add stations; pre-apply them to the market.
  if(startYear>1970){
    const preEvents=EVDATA.filter(ev=>ev.y<startYear&&ev.e&&ev.e.includes('rival-'));
    preEvents.forEach(ev=>{
      ev.e.split('|').filter(p=>p.startsWith('rival-')).forEach(part=>{
        const [,fmt,type,pw,str]=part.split('-');
        if(!fmt||!FM[fmt])return;
        // Don't add if this format is already represented in market
        const already=stations.some(s=>s&&!s._bpSlotDeferred&&s.format===fmt&&!s.isPlayer);
        if(already)return;
        const freq=nextFreq(type);
        const ns=mkStn({type,fmt,pw,str},freq,startYear);
        ns.color=CLR[stations.length%CLR.length];
        ns.launchPeriod=-999; // treat as established
        stations.push(ns);
      });
    });

    // Pre-apply format sunsets/purges
    const sunsetEvs=EVDATA.filter(ev=>ev.y<startYear&&ev.e&&(ev.e.includes('fmt_sunset')||ev.e.includes('fmt_purge')));
    sunsetEvs.forEach(ev=>{
      ev.e.split('|').forEach(part=>{
        if(part.startsWith('fmt_sunset:')){
          const [,deadFmt,pivot]=part.split(':');
          // Distribute dead-format rivals across realistic successors, not just one pivot
          const MOR_SUCCESSORS=['NEWS_TALK','ADULT_CONTEMP','ADULT_STANDARDS','BEAUTIFUL_MUSIC'];
          const BEAUTIFUL_SUCCESSORS=['ADULT_CONTEMP','HOT_AC','ADULT_STANDARDS'];
          const successors=deadFmt==='MOR'?MOR_SUCCESSORS:deadFmt==='BEAUTIFUL_MUSIC'?BEAUTIFUL_SUCCESSORS:[pivot];
          stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&s.format===deadFmt).forEach((s,i)=>{
            // Cycle through successors so rivals spread across formats naturally
            const target=successors[i%successors.length];
            if(target&&FM[target]){
              s.format=target;s.brand=gb(target);
              if(!s.drift)s.drift={};
              s.drift[target]=DRIFT?.[target]?.default||40;
            }
          });
        } else if(part.startsWith('fmt_purge:')){
          const deadFmt=part.split(':')[1];
          // Remove dead-format stations (replace with market-appropriate alternatives)
          stations.forEach(s=>{if(s&&!s._bpSlotDeferred&&!s.isPlayer&&s.format===deadFmt)s.format='NEWS_TALK';});
        }
      });
    });

    // Pre-apply FCC expansion
    const fccEvs=EVDATA.filter(ev=>ev.y<=startYear&&ev.e&&ev.e.startsWith('fcc-'));
    let fccAM=1,fccFM=1;
    fccEvs.forEach(ev=>{
      const yr=parseInt(ev.e.split('-')[1]);
      if(yr<=1992){fccAM=2;fccFM=2;}
      if(yr<=1994){fccAM=3;fccFM=3;}
      if(yr<=1996){fccAM=8;fccFM=8;}
    });

    // Pre-apply adx changes from events before startYear
    let adxMod=1.0;
    EVDATA.filter(ev=>ev.y<startYear&&ev.e&&(ev.e.startsWith('ad+')||ev.e.startsWith('ad-'))).forEach(ev=>{
      const delta=parseFloat(ev.e.replace('ad',''));
      adxMod=Math.max(0.5,Math.min(2.0,adxMod*(1+delta)));
    });

    seedRat(stations, startYear);

    // Scenario-specific share corrections for non-1970 starts
    if(sc.id==='wsb'||sc.id==='fmrev'||sc.id==='acrise'||sc.id==='chrwar'||sc.id==='amtalk'){
      const player=stations.find(s=>s.isPlayer);
      if(player){
        const targets={fmrev:rnd(0.04,0.07),acrise:rnd(0.05,0.09),chrwar:rnd(0.04,0.08),amtalk:rnd(0.025,0.055)};
        const tgt=targets[sc.id];
        if(tgt){
          const cur=player.rat.share||0.03;
          const bf=tgt/Math.max(cur,0.02);
          COH.forEach(coh=>{
            const rc=player.rat.cur[coh];if(!rc)return;
            const ns=Math.min(0.28,rc.share*bf);
            const delta=ns-rc.share;rc.share=ns;
            const pop=(POP.cohorts[coh]?.t||0)*effUniverse(player);
            rc.aqh=Math.round(ns*pop*(AQH_ENGAGE[coh]||0.060));
            player.mom[coh]={tgt:ns,cur:ns};
            const rivals=stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic&&s.rat.cur[coh]);
            const rt=rivals.reduce((a,s)=>a+(s.rat.cur[coh]?.share||0),0);
            if(rt>0.001&&delta>0)rivals.forEach(s=>{
              const sc2=s.rat.cur[coh];
              sc2.share=Math.max(0.001,sc2.share-(sc2.share/rt)*delta);
              const p2=(POP.cohorts[coh]?.t||0)*effUniverse(s);
              sc2.aqh=Math.round(sc2.share*p2*(AQH_ENGAGE[coh]||0.060));
              s.mom[coh]={tgt:sc2.share,cur:sc2.share};
            });
          });
          const ewp=COH.reduce((s,co)=>{const p=POP.cohorts[co]?.t||0;return s+p*(AQH_ENGAGE[co]||0.060);},0);
          stations.forEach(s=>{
            if(!s||s._bpSlotDeferred)return;
            s.rat.aqh=COH.reduce((sum,co)=>sum+(s.rat.cur[co]?.aqh||0),0);
            s.rat.share=COH.reduce((sum,co)=>{const p=POP.cohorts[co]?.t||0;const e=AQH_ENGAGE[co]||0.060;return sum+(s.rat.cur[co]?.share||0)*(p*e)/Math.max(ewp,1);},0);
          });
        }
      }
    }

    const mockG2={adx:adxMod,streamDrag:0,year:startYear};
    seedRev(stations,mockG2);
    const activeMkt2=MARKETS[ACTIVE_MARKET]||MARKETS.atlanta;
    // Filter out events that already happened
    const remainingEvq=EVDATA.filter(ev=>ev.y>startYear||(ev.y===startYear&&ev.p===2));
    return{
      city:activeMkt2.label,marketId:ACTIVE_MARKET,year:startYear,period:1,
      turn:(startYear-1970)*2,
      stations,ps:stations.filter(s=>s&&s.isPlayer),
      sc,cash:sc.cash,
      fmp:fmpForYear(startYear),adx:adxMod*(1.0+activeMkt2.adxBonus),satDrag:0,
      streamDrag:Math.min(.60,EVDATA.filter(ev=>ev.e==='stream+'&&ev.y<startYear).length*0.06),
      fccAM,fccFM,
      unlockedFormats:Object.keys(FM).filter(f=>FM[f].unlock<=startYear),
      news:[{v:'LOW',t:`Campaign begins — Atlanta radio, ${startYear}. ${sc.d.split('.')[0]}.`,y:startYear,p:1}],
      evq:remainingEvq,
      score:{shareHistory:[],peakRevenue:0,decadeScores:{},isSandbox:false},
      rankerHistory:[],
      finHistory:[],
      stationFinHistory:{},
      debtWarningQ:0,
      loans:[],
      _atl1970DeferredQueue:[],
    };
  }

  const mockG={adx:1.0,streamDrag:0,year:1970};
  seedRev(stations,mockG);
  const activeMkt=MARKETS[ACTIVE_MARKET]||MARKETS.atlanta;
  return{
    city:activeMkt.label,marketId:ACTIVE_MARKET,year:1970,period:1,turn:0,
    stations,ps:stations.filter(s=>s&&s.isPlayer),
    sc,cash:sc.cash,
    fmp:fmpForYear(1970),adx:1.0+activeMkt.adxBonus,satDrag:0,streamDrag:0,
    fccAM:1,fccFM:1,
    unlockedFormats:Object.keys(FM).filter(f=>FM[f].unlock<=1970),
    news:[],evq:[...EVDATA],
    score:{shareHistory:[],peakRevenue:0,decadeScores:{},isSandbox:false},
    rankerHistory:[],
    finHistory:[],
    stationFinHistory:{},
    debtWarningQ:0,
    loans:[],
    _atl1970DeferredQueue:ATLANTA_1970_DEFERRED_LAUNCHES.map(({bpIdx,y,p})=>({bpIdx,y,p})),
  };
}

// Scheduled Atlanta 1970 BP slots: same entry economics as event-driven `rival-` (seedNewEntry).
function processAtlanta1970DeferredLaunches(G){
  const q=G._atl1970DeferredQueue;
  if(!q||!q.length)return;
  const remain=[];
  for(const ent of q){
    if(G.year<ent.y||(G.year===ent.y&&G.period<ent.p)){remain.push(ent);continue;}
    const i=ent.bpIdx;
    const ph=G.stations[i];
    if(!ph||!ph._bpSlotDeferred)continue;
    const bp=BP[i];
    const freq=ph._deferFreq;
    const s=mkStn(bp,freq,G.year);
    s.color=CLR[i%CLR.length];
    s.entryTurn={year:G.year,period:G.period};
    s.launchPeriod=G.turn||0;
    G.stations[i]=s;
    seedNewEntry(s,G);
    calcRev(s,G);
    G.news.unshift({v:'MEDIUM',t:`📡 ${s.callLetters} signs on — ${FM[bp.fmt]?.l||bp.fmt} (${bp.type} ${freq}). The dial keeps filling out.`,y:G.year,p:G.period});
  }
  G._atl1970DeferredQueue=remain;
}

// ── STATE ─────────────────────────────────────────────────────────
let G=null;
function showError(msg,detail){
  document.body.innerHTML=`<div style="padding:40px;font-family:monospace;color:#f87171;background:#0a0a0a;min-height:100vh">
    <div style="font-size:20px;margin-bottom:16px;color:#f5a623">⚠ WAVELENGTH — STARTUP ERROR</div>
    <div style="font-size:14px;margin-bottom:12px">${msg}</div>
    <pre style="font-size:15px;color:#9ca3af;white-space:pre-wrap">${detail}</pre>
    <button onclick="localStorage.removeItem('wavelength_autosave');location.reload()" 
      style="margin-top:24px;background:#f5a623;color:#000;border:none;padding:10px 24px;font-family:monospace;font-size:14px;cursor:pointer">
      CLEAR SAVE &amp; RESTART
    </button>
  </div>`;
}

let _pendingScenId=null; // set during scenario selection before genMarket runs

function init(){
  console.log('[WAVELENGTH] init() called');
  try{
    const local=getLocalSave();
    console.log('[WAVELENGTH] localSave:', local ? `found (year=${local?.G?.year}, sc=${local?.G?.sc?.id}, cash=${local?.G?.cash}, sc.cash=${local?.G?.sc?.cash})` : 'none');
    // Validate the save before trusting it — protect against corrupt/partial saves
    const isValidSave = local?.G?.year && local?.G?.sc && local?.G?.stations?.length
      && (local.G.cash > 0 || local.G.cash === 0) // cash=0 is technically valid on a fresh load
      && local.G.sc.cash > 0; // sc must have a starting cash value
    console.log('[WAVELENGTH] isValidSave:', isValidSave);
    if(isValidSave){
      openScenSelect(local); // pass autosave so the screen can offer resume
      return;
    }
    if(local && !isValidSave){
      // There's a save but it's corrupt — log it but still show welcome screen
      console.warn('[WAVELENGTH] Corrupt or incompatible autosave found — showing fresh start screen.');
    }
    openScenSelect(null);
  }catch(err){
    showError('Failed during init: '+err.message, err.stack||'');
  }
}

function openScenSelect(localSave){
  const hasSave=!!(localSave?.G?.year);
  const saveYear=localSave?.G?.year||null;
  const savePeriod=localSave?.G?.period===1?'Spring':'Fall';
  const saveLabel=localSave?.label||'';
  const saveScen=SC.find(s=>s.id===localSave?.G?.sc?.id);

  // Group scenarios by era for display
  const eraGroups=[
    {label:'1970 — THE BEGINNING', ids:['under','cntry','soul','stack','fmpn','wsb']},
    {label:'1978 — FM REVOLUTION', ids:['fmrev','acrise']},
    {label:'1985 — FORMAT WARS',   ids:['chrwar','amtalk']},
  ];
  const diffHints={under:'Survival mode. Thin cash, no morning host.',soul:'Great audience, terrible CPM. Grind for every dollar.',fmpn:'Lean years 1970–72. Survive them and FM makes you wealthy.',cntry:'Profitable now. Erosion will catch up.',stack:'AM/FM combo. High ceiling, high overhead.',wsb:'Dominant now, eroding fast. Every format decision has a cost.',fmrev:'Thin margins until 1980. Album Rock will make you rich if you survive.',acrise:'AC gets crowded fast. Brand loyalty is everything.',chrwar:'Three viable format bets. Only one will dominate.',amtalk:'Revenue cliff is coming. Move fast or move on.'};
  const makeCard=sc=>{
    const diff=sc.diff||(sc.id==='under'||sc.id==='soul'||sc.id==='fmpn'||sc.id==='amtalk'||sc.id==='fmrev'?'HARD':sc.id==='cntry'||sc.id==='stack'||sc.id==='wsb'||sc.id==='acrise'||sc.id==='chrwar'?'MEDIUM':'EASY');
    const diffCls=diff==='HARD'?'hard':diff==='MEDIUM'?'med':'easy';
    const stnInfo=sc.idx.length===2?'AM/FM Combo':'Single Station';
    const cashFmt=`$${(sc.cash/1000).toFixed(0)}K starting cash`;
    const hint=sc.hint||diffHints[sc.id]||'';
    const span=`${sc.startYear||1970}–2020`;
    return `<div class="scn-card" id="scn-${sc.id}" onclick="pickScen('${sc.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div class="scn-diff ${diffCls}">${diff}</div>
        <div style="font-family:var(--ft);font-size:15px;color:var(--mut);letter-spacing:1px;padding-top:2px">${span}</div>
      </div>
      <div class="scn-title">${sc.l.toUpperCase()}</div>
      <div class="scn-sub">${stnInfo} · Atlanta, ${sc.startYear||1970}</div>
      <div class="scn-desc">${sc.d}</div>
      <div class="scn-stat">${cashFmt}</div>
      ${hint?`<div class="scn-stat" style="color:var(--amb);margin-top:5px;font-size:14px;font-style:italic">▶ ${hint}</div>`:''}
    </div>`;
  };
  const cards=eraGroups.map(era=>{
    const eraCards=SC.filter(sc=>era.ids.includes(sc.id)).map(makeCard).join('');
    return `<div style="margin-bottom:24px">
      <div style="font-family:var(--ft);font-size:14px;color:var(--amb);letter-spacing:3px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(245,166,35,.2)">${era.label}</div>
      <div style="display:flex;flex-direction:column;gap:12px">${eraCards}</div>
    </div>`;
  }).join('');

  document.getElementById('scenb').innerHTML=`
    <div style="padding:18px 20px 20px;max-width:760px;margin:0 auto">
    <div class="scn-hero">
      <div class="scn-logo">WAVELENGTH</div>
      <div class="scn-tagline" id="scn-tagline">ATLANTA RADIO · 1970 TO 2020</div>
    </div>
    ${hasSave?`<div style="background:rgba(82,227,110,.08);border:1px solid rgba(82,227,110,.25);padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:15px;color:var(--off)">💾 <strong style="color:var(--grn)">${saveLabel||'Autosave'}</strong> — ${saveScen?.l||''} · ${saveYear} ${savePeriod}</span>
      <button class="cfm" style="padding:6px 18px;font-size:14px" onclick="loadLocalSave();cm('m-scen')">▶ RESUME</button>
    </div>`:''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-family:var(--ft);font-size:15px;color:var(--mut);letter-spacing:2px">SELECT YOUR SCENARIO</div>
      <button onclick="cm('m-scen');mpOpenLobby()" class="abt" style="font-size:15px;letter-spacing:2px;padding:8px 20px">🎙 MULTIPLAYER</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">${cards}</div>
    <button class="cfm" id="scn-start-btn" disabled onclick="confirmScen()" style="width:100%;padding:14px;font-size:14px;letter-spacing:3px">SELECT A SCENARIO TO BEGIN</button>
    </div>`;
  om('m-scen');
}

function pickScen(id){
  _pendingScenId=id;
  document.querySelectorAll('.scn-card').forEach(el=>el.classList.remove('sel'));
  document.getElementById('scn-'+id)?.classList.add('sel');
  const btn=document.getElementById('scn-start-btn');
  const sc=SC.find(s=>s.id===id);
  if(btn&&sc){
    btn.disabled=false;btn.textContent=`BEGIN — ${sc.l.toUpperCase()} →`;
    const tl=document.getElementById('scn-tagline');
    if(tl){
      const yr=sc.startYear||1970;
      const eraLbl=yr===1985?'FORMAT WARS ERA':yr===1978?'FM REVOLUTION ERA':'THE BEGINNING';
      const marketTag=((typeof _selectedMarket!=='undefined'&&_selectedMarket&&MARKETS[_selectedMarket]?.label)||'Atlanta').toUpperCase();
      tl.textContent=`${marketTag} RADIO · ${yr}–2020 · ${eraLbl}`;
    }
  }
}

function confirmScen(){
  if(!_pendingScenId)return;
  cm('m-scen');
  openOnboarding(_pendingScenId);
}

function openOnboarding(scenId){
  const sc=SC.find(s=>s.id===scenId)||SC[0];
  const yr=sc.startYear||1970;
  const span=2020-yr;
  const goalText=`Dominate the Atlanta market over ${span} years — ${yr} to 2020. Score is based on average ratings share, revenue growth, and surviving the industry's upheavals. Decade checkpoints grade your performance.`;

  // Era-specific strategic tips shown as the KEY WATCH section
  const eraTips={
    under:[
      {k:'MORNING DRIVE',v:`Your first hire matters most. A strong morning host can lift ratings 2-3 points on its own.`},
      {k:'AM EROSION',v:`FM penetration rises every period starting in the mid-70s. Have an FM plan before 1978 or you will bleed out slowly.`},
      {k:'CASH',v:`Thin margins early. Keep spot load high, spend carefully on talent. Survive long enough to matter.`},
    ],
    cntry:[
      {k:'FM TRANSITION',v:`Country AM works fine through 1978-80. After that, FM Country pulls your audience. Buy or build an FM before 1982.`},
      {k:'TALENT',v:`Country audiences follow personalities. A loyal morning host is worth every dollar — and their contract is your insurance.`},
      {k:'RIVALS',v:`A second Country station entering the market is an existential threat. Differentiate your brand before they arrive.`},
    ],
    soul:[
      {k:'CPM GAP',v:`Urban formats are undervalued by Madison Avenue. You'll need 50% more audience than a CHR to earn the same revenue. Fight for every advertiser relationship.`},
      {k:'COMMUNITY',v:`Your competitive moat is loyalty. Protect your Loyal listeners — rivals will try to poach them constantly.`},
      {k:'FM',v:`Soul and R&B move to FM by the mid-80s. Urban Contemporary is the evolved format — transition when the time is right.`},
    ],
    stack:[
      {k:'SIMULCAST',v:`Use the AM to fund the FM's growth. Simulcast the same format to build FM cume, then differentiate when you're ready.`},
      {k:'OVERHEAD',v:`Two stations means two upkeep bills. Stay cash-positive or the combo becomes a liability.`},
      {k:'TIMING',v:`The FM is your long-term asset. Don't wait too long to cut the AM loose — erosion compounds.`},
    ],
    fmpn:[
      {k:'LEAN YEARS',v:`Advertisers don't understand FM yet. Revenue will be thin through 1972-74. Cut costs, not quality.`},
      {k:'AUDIENCE FIRST',v:`Build ratings now, monetize later. FM listenership is growing 20% a year — be the station they find.`},
      {k:'FORMAT LOCK',v:`Album Rock works. Resist the urge to chase pop formats — your credibility is the product.`},
    ],
    wsb:[
      {k:'FORMAT CRISIS',v:`MOR's broad appeal is becoming a liability. Every new FM format eats a slice of your audience. Specialize before the erosion compounds.`},
      {k:'NEWS/TALK',v:`WSB's real-world pivot was to News/Talk — it worked. But the window closes once a rival claims the format.`},
      {k:'DOMINANCE',v:`You start at 14% share. That's the ceiling to defend, not a floor to build from. Rivals are targeting you.`},
    ],
    fmrev:[
      {k:'THE MOMENT',v:`FM just crossed AM in total audience. The ad market hasn't caught up yet — but it will. You have 2-3 years to build before CPMs spike.`},
      {k:'ALBUM ROCK',v:`Low spot load is the format's identity. Programmers who pack the clock with ads destroy the brand. Stay under 12 min/hr.`},
      {k:'COMPETITION',v:`Classic Rock and CHR will both emerge by 1980-82. Claim your niche before the format wars begin.`},
    ],
    acrise:[
      {k:'AC WINDOW',v:`Adult Contemporary is underserved in 1978. You have roughly 4 years before it gets crowded. Use them to build unassailable audience loyalty.`},
      {k:'25-49 WOMEN',v:`This is your target demo and it's the most valuable in radio. Every programming decision should serve them.`},
      {k:'BRAND',v:`AC stations win or lose on brand perception. Hire a great morning host and don't change the music clock every 6 months.`},
    ],
    chrwar:[
      {k:'THREE PATHS',v:`CHR peaks around 1988 then fragments. Classic Rock has 15 good years ahead. AC is steady but never dominant. Pick the format that fits your market position.`},
      {k:'RATINGS RACE',v:`You're starting with mediocre ratings. The first 4 periods are critical — hire well, keep spot load tight, and build momentum.`},
      {k:'CONSOLIDATION',v:`Corporate buyers arrive after 1996. A strong ratings position makes you an acquisition target — or gives you the cash to be the buyer.`},
    ],
    amtalk:[
      {k:'THE CLIFF',v:`Your AM music revenue will fall roughly 35-40% between now and 1990. The question is whether you pivot before or after it hurts.`},
      {k:'NEWS/TALK',v:`Rush Limbaugh launches nationally in 1988. The Talk format explodes. Get there early or pay a premium to follow.`},
      {k:'CASH',v:`Thin runway. Every period without a pivot is a period of compounding damage. Move fast.`},
    ],
  };

  const tips=eraTips[sc.id]||eraTips.under;
  const tipsHtml=tips.map(t=>`<div class="ob-row"><span class="ob-key">${t.k}</span><span>${t.v}</span></div>`).join('');

  // Generic mechanics — slightly adjusted by era
  const amMechanicRow=yr<=1978
    ?`<div class="ob-row"><span class="ob-key">AM EROSION</span><span>AM music formats lose audience every period as FM penetration grows. The erosion accelerates through the early 80s. Options: pivot to News/Talk, buy an FM license, or install an FM translator.</span></div>`
    :`<div class="ob-row"><span class="ob-key">AM EROSION</span><span>AM music is already in decline. If you\'re on AM music, the clock is running. News/Talk and Sports are the only AM formats that hold audience long-term.</span></div>`;

  document.getElementById('onboardb').innerHTML=`
    <div style="margin-bottom:20px">
      <div style="font-family:var(--ft);font-size:14px;color:var(--mut);letter-spacing:2px;margin-bottom:4px">YOUR SCENARIO · ATLANTA · ${yr}</div>
      <div style="font-family:var(--fd);font-size:26px;letter-spacing:4px;color:var(--amb)">${sc.l.toUpperCase()}</div>
      <div style="font-size:15px;color:var(--off);margin-top:8px;line-height:1.6">${sc.d}</div>
    </div>
    <div class="ob-sec">
      <div class="ob-hd">THE GOAL</div>
      <div class="ob-row"><span class="ob-key">WIN</span><span>${goalText}</span></div>
    </div>
    <div class="ob-sec">
      <div class="ob-hd">WATCH THIS SCENARIO</div>
      ${tipsHtml}
    </div>
    <div class="ob-sec">
      <div class="ob-hd">EACH PERIOD (SPRING / FALL)</div>
      <div class="ob-row"><span class="ob-key">HIRE</span><span>Morning Drive talent has the biggest ratings impact. Always fill it — a strong host can move the needle 2-3 points on its own.</span></div>
      <div class="ob-row"><span class="ob-key">SPOTS</span><span>Spot load is your ad minutes per hour. More spots = more revenue but hurts TSL. 14 min/hr is standard. Rock formats want fewer; Talk can run more.</span></div>
      <div class="ob-row"><span class="ob-key">ADVANCE</span><span>Hit NEXT PERIOD to run the simulation. Rivals react, the market shifts, and your revenue is collected.</span></div>
    </div>
    <div class="ob-sec">
      <div class="ob-hd">KEY MECHANICS</div>
      ${amMechanicRow}
      <div class="ob-row"><span class="ob-key">SIMULCAST</span><span>Own an AM and FM? Run them as one format to build an FM audience, then cut the AM loose when the time is right.</span></div>
      <div class="ob-row"><span class="ob-key">ACQUIRE</span><span>Buy rival stations to absorb a format and eliminate competition. Expect 20–35% listener churn — keep the format and talent stable to hold them.</span></div>
      <div class="ob-row"><span class="ob-key">CONSOLIDATION</span><span>After 1996, corporate groups start buying everything. Strong ratings make you a target — or give you the cash to be the buyer.</span></div>
    </div>
    <button class="cfm" onclick="cm('m-onboard');startPlay('${sc.id}')" style="width:100%;padding:14px;font-size:14px;letter-spacing:3px">ON AIR — ${yr} →</button>`;
  om('m-onboard');
}

function startPlay(scenId){
  try{
    _pendingScenId=null;
    G=genMarket(scenId);
    renderAll();
  }catch(err){
    showError('Failed during genMarket: '+err.message, err.stack||String(err));
  }
}

function startNewGame(){
  // Legacy path — called from some places, routes to scenario select
  openScenSelect(null);
}
function loadLocalSaveAndClose(el){
  el?.remove();
  loadLocalSave();
}

// ── SIMULCAST HELPERS ─────────────────────────────────────────────
// Model: each station has at most one simulcastWith partner + boolean _simulcastSource.
// Future expansion (translator chains, multi-FM repeaters, clusters) may need a dedicated
// simulcast group / graph instead of a single pair link — not implemented in this build.
function breakSimulcast(G,stnId){
  const s=G.stations.find(st=>st.id===stnId);
  if(!s||!s.simulcastWith)return;
  const partner=G.stations.find(st=>st.id===s.simulcastWith);
  s.simulcastWith=null;
  delete s._simulcastSource;
  if(partner){
    partner.simulcastWith=null;
    delete partner._simulcastSource;
  }
}
function canSimulcast(G,s1,s2){
  // Must be player-owned, same format, neither already paired
  // Same-band simulcasts allowed (FM-FM for coverage, AM-AM to keep license alive)
  return s1.isPlayer&&s2.isPlayer&&s1.id!==s2.id&&
    s1.format===s2.format&&
    !s1.simulcastWith&&!s2.simulcastWith;
}
/** Programming source station for a simulcast receiver (repeater); null if not applicable. */
function simulcastProgrammingSource(s){
  if(!s?.simulcastWith)return null;
  if(s._simulcastSource===true)return null;
  return G.stations.find(st=>st.id===s.simulcastWith)||null;
}
/** Receiver echoes partner's on-air content for this slot (no local talent object on receiver). */
function slotCoveredBySimulcast(s,slot){
  const src=simulcastProgrammingSource(s);
  if(!src)return false;
  return !s.prog[slot]?.talent&&!!src.prog[slot]?.talent;
}
/** Programming-side station for UI: simulcast receiver inherits from the source leg. */
function simulcastOperationalSource(st){
  if(!st)return st;
  const src=simulcastProgrammingSource(st);
  return src||st;
}
function ensureOpsSourceSid(sid){
  const s=G.stations.find(st=>st.id===sid);
  if(!s)return sid;
  return simulcastOperationalSource(s).id;
}
// Determine which station leads a simulcast pair (higher signal power / revenue)
function simLead(a,b){
  // FM (incl. fmBooster) beats AM; among same type, higher power wins; tiebreak by revenue
  const isFA=a.sig.type==='FM'||a.fmBooster, isFB=b.sig.type==='FM'||b.fmBooster;
  if(isFA!==isFB) return isFA?a:b;
  const pwRank={['100kw']:4,['50kw']:3,['25kw']:2,['10kw']:1,['5kw']:1,['1kw']:0,['DA']:2,['translator']:0};
  const pa=pwRank[a.sig.pw]||0, pb=pwRank[b.sig.pw]||0;
  if(pa!==pb) return pa>pb?a:b;
  return (a.fin?.rev||0)>=(b.fin?.rev||0)?a:b;
}
function simulcastPartnerStation(s){
  if(!s?.simulcastWith)return null;
  return G.stations.find(st=>st.id===s.simulcastWith)||null;
}
/** Programming source (lead) and receiver for a simulcast pair. */
function simulcastPairLeadReceiver(a,b){
  if(a._simulcastSource===true&&!b._simulcastSource)return{lead:a,rcv:b};
  if(b._simulcastSource===true&&!a._simulcastSource)return{lead:b,rcv:a};
  const L=simLead(a,b);
  return {lead:L,rcv:L.id===a.id?b:a};
}
/** One row per station or combined simulcast pair, sorted by total share (desc). */
function buildSimulcastCombinedRankRows(allStations){
  const seen=new Set();
  const rows=[];
  const active=allStations.filter(s=>s&&!s._bpSlotDeferred&&s.rat);
  const sorted=[...active].sort((a,b)=>b.rat.share-a.rat.share);
  sorted.forEach(s=>{
    if(seen.has(s.id))return;
    const p=simulcastPartnerStation(s);
    if(p&&allStations.some(st=>st.id===p.id)){
      seen.add(s.id);seen.add(p.id);
      const {lead,rcv}=simulcastPairLeadReceiver(s,p);
      rows.push({pair:true,lead,rcv,share:lead.rat.share+rcv.rat.share,rev:lead.fin.rev+rcv.fin.rev});
    }else{
      seen.add(s.id);
      rows.push({pair:false,st:s,share:s.rat.share,rev:s.fin.rev});
    }
  });
  rows.sort((a,b)=>b.share-a.share);
  return rows;
}
function scrollModalContentToTop(overlayId){
  const ov=document.getElementById(overlayId);
  if(!ov)return;
  const mo=ov.querySelector('.mo');
  if(!mo)return;
  mo.scrollTop=0;
  requestAnimationFrame(()=>{mo.scrollTop=0;});
  setTimeout(()=>{mo.scrollTop=0;},0);
}

// ── STATION RESEARCH CONSULTANT ──────────────────────────────────
const RESEARCH_COST = 40000; // $40K per report — meaningful but not punishing
function openResearch(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  document.getElementById('research-title').textContent=`📊 RESEARCH — ${s.callLetters}`;
  const rb=document.getElementById('researchb');
  rb.innerHTML=`<p class="di">Commission a research report on <strong>${s.callLetters}</strong>. Costs <strong>${f$(RESEARCH_COST)}</strong>. You'll receive an honest assessment of why your ratings are where they are — signal, competition, quality, format health, and actionable recommendations.</p>
    <div class="ibox">Cash on hand: <strong>${f$(G.cash)}</strong>${G.cash<RESEARCH_COST?' <span style="color:var(--red)">— insufficient funds</span>':''}</div>
    <button class="cfm" onclick="doResearch('${s.id}')" ${G.cash<RESEARCH_COST?'disabled':''}>COMMISSION REPORT — ${f$(RESEARCH_COST)}</button>
    <button class="cnl" onclick="cm('m-research')">CANCEL</button>`;
  om('m-research');
}
function doResearch(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  if(G.cash<RESEARCH_COST)return;
  G.cash-=RESEARCH_COST;
  if(MP.mode==='live') MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});
  const report=buildResearchReport(s,G);
  document.getElementById('researchb').innerHTML=report+`<button class="cnl" style="margin-top:12px" onclick="cm('m-research')">CLOSE</button>`;
  renderAll();
}
function buildResearchReport(s,G){
  const fmd=FM[s.format]||{};
  const year=G.year;
  const fmp=G.fmp;

  // ── SIGNAL HEALTH ──
  const isAM=s.sig.type==='AM'&&!s.fmBooster;
  const isFM=s.sig.type==='FM'||s.fmBooster;
  const amMusicFmts=['TOP40','COUNTRY','SOUL_RNB','MOR','ALBUM_ROCK','BEAUTIFUL_MUSIC',
    'CHR','CLASSIC_ROCK','ADULT_CONTEMP','URBAN_CONTEMP','ALT_ROCK','RHYTHMIC','HOT_AC','CLASSIC_HITS',
    'SPANISH','GOSPEL','OLDIES','ADULT_STANDARDS'];
  const isAMMusic=isAM&&amMusicFmts.includes(s.format);
  const amViab=(()=>{
    if(year<=1975)return 1.0;
    if(year<=1978)return 1.0-(year-1975)*0.02;
    if(year<=1985)return 0.94-(year-1978)*0.06;
    if(year<=1993)return 0.52-(year-1985)*0.05;
    return Math.max(0.12,0.12-(year-1993)*0.005);
  })();
  const amPenalty=isAMMusic?Math.max(0.10,(1.0-0.60*fmp)*amViab):1.0;
  const isTalkAM=isAM&&['NEWS_TALK','SPORTS_TALK','GOSPEL','PODCAST_TALK'].includes(s.format);

  // ── COMPETITION ──
  const compFmts=FMT_COMPETITION[s.format]||[];
  const directCompetitors=G.stations.filter(o=>o&&!o._bpSlotDeferred&&o.id!==s.id&&compFmts.includes(o.format));
  const sameFormat=G.stations.filter(o=>o&&!o._bpSlotDeferred&&o.id!==s.id&&o.format===s.format);
  const totalCompCount=directCompetitors.length;
  const competitionBleed=Math.min(0.22,COMPETITION_BLEED*(totalCompCount/5));

  // ── QUALITY ──
  const oq=s.oq||50;
  const qFactor=oq/65;

  // ── SHARE TREND ──
  const hist=s.rat.hist||[];
  const cur=s.rat.share;
  const prev=hist.length>=2?hist[hist.length-2]?.share||cur:cur;
  const two=hist.length>=3?hist[hist.length-3]?.share||cur:cur;
  const trending=cur>prev*1.03?'UP':cur<prev*0.97?'DOWN':'FLAT';
  const trendColor=trending==='UP'?'var(--grn)':trending==='DOWN'?'var(--red)':'var(--mut)';

  // ── SPOT LOAD ──
  const rv=s.ops.spots/(fmd.sp||14);
  const spotIssue=rv>1.15;
  const spotSevere=rv>1.3;

  // ── SATURATION / STREAMING ──
  const satDrag=G.satDrag||0;
  const streamDrag=G.streamDrag||0;

  // ── FORMAT SUNSET ──
  const FORMAT_SUNSET={BEAUTIFUL_MUSIC:{peak:1985,dead:1995},MOR:{peak:1982,dead:1998},FULL_SERVICE:{peak:1960,dead:1975}};
  const fs2=FORMAT_SUNSET[s.format];
  let eraViab=1.0;
  if(fs2){
    if(year>=fs2.dead)eraViab=0.02;
    else if(year>fs2.peak){const t=(year-fs2.peak)/(fs2.dead-fs2.peak);eraViab=Math.max(0.02,1-(3*t*t-2*t*t*t)*0.98);}
  }

  // ── RANK vs COMPETITION ──
  const allByShare=[...G.stations].filter(s=>s&&!s._bpSlotDeferred&&s.rat).sort((a,b)=>b.rat.share-a.rat.share);
  const rank=allByShare.findIndex(st=>st.id===s.id)+1;
  const total=allByShare.length;

  // ── BUILD SECTIONS ──
  function row(label,val,note,color){
    return `<div class="sr"><span class="lb">${label}</span><span class="vl" style="color:${color||'var(--off)'}">${val}</span>${note?`<span style="font-size:15px;color:var(--mut);margin-left:8px">${note}</span>`:''}</div>`;
  }
  function hdr(t){return `<div class="msh" style="margin-top:14px">${t}</div>`;}
  function pill(txt,col){return `<span style="background:${col}22;color:${col};border:1px solid ${col}44;padding:2px 7px;border-radius:4px;font-size:15px;font-family:var(--ft);letter-spacing:.05em">${txt}</span>`;}

  // SIGNAL section
  let sigSection=hdr('SIGNAL');
  if(isFM){
    sigSection+=row('Signal type','FM — full penetration','FM reaches all receivers in your footprint','var(--grn)');
    const pwRanks={'100kw':4,'50kw':3,'25kw':2,'10kw':1,'5kw':1,'1kw':0};
    const pw=s.fmBooster?'translator':s.sig.pw;
    if(pw==='translator')sigSection+=row('Power','FM Translator','Low-power signal. Limited reach compared to full-power FM.','var(--amb)');
    else sigSection+=row('Power',pw.toUpperCase(),'','var(--off)');
  } else if(isTalkAM){
    const amTalkPenalty = (G.year>=2007&&['NEWS_TALK','SPORTS_TALK'].includes(s.format)&&!s.simulcastWith)
      ? Math.round((1-Math.max(0.55, 1.0-_smoothstep(2007,2015,G.year)*0.20-_smoothstep(2015,2022,G.year)*0.20))*100)
      : 0;
    const amTalkColor = amTalkPenalty>=20?'var(--red)':amTalkPenalty>=8?'var(--ylw)':'var(--grn)';
    const amTalkNote = amTalkPenalty>0
      ? `AM signal eroding: -${amTalkPenalty}% audience reach vs FM/digital. FM simulcast eliminates this.`
      : `News, Talk and Sports are the AM-native formats. Music AM erosion doesn't apply.`;
    sigSection+=row('Signal type','AM — Talk/News native', amTalkNote, amTalkColor);
    if(s.clearChannel)sigSection+=row('Clear Channel','Class A — Unlimited','No nighttime directionality. Signal covers the full region at night, expanding your effective audience by ~18%. Revenue premium applies through 1995.','var(--amb)');
    else if(s.sig.pw==='DA')sigSection+=row('Daytimer / DA','50kW day · 1-5kW night','Power drops sharply at sunset to protect clear-channel signals. Evening drive audiences in fringe areas lose your signal. Effective reach ≈ 72% of a full-time 50kW. An FM simulcast or translator eliminates this.','var(--red)');
    else if(s.sig.pw==='50kw')sigSection+=row('50kW Directional','50kW day / reduced night','Power drops and signal rotates at night to protect clear-channel stations. Daytime market coverage only.','var(--mut)');
    sigSection+=row('AM Talk viability',`${Math.round(amViab*100)}%`,year>=1990?'AM talk still strong but FM competitors emerging.':year>=1985?'Some FM competition for News/Talk emerging.':'Full AM advantage for talk formats.','var(--grn)');
    // Even NT AM gets an FMP note — listeners in cars are increasingly on FM, even for talk
    const fmpPct=Math.round(fmp*100);
    if(year>=1995)sigSection+=row('FM penetration',`${fmpPct}%`,`${fmpPct}% of listening is FM-capable. AM talk still reaches this audience, but FM talk signals are starting to compete.`,'var(--amb)');
  } else if(isAMMusic){
    const viabPct=Math.round(amPenalty*100);
    const viabColor=amPenalty>0.7?'var(--grn)':amPenalty>0.4?'var(--amb)':'var(--red)';
    sigSection+=row('Signal type','AM — Music format','AM music stations face audience defection to FM as FM penetration rises.','var(--red)');
    if(s.clearChannel)sigSection+=row('Clear Channel','Class A — Unlimited','No nighttime power reduction. Wider coverage buys time vs non-clear-channel AM music stations — but FM erosion still applies to all AM music formats.','var(--amb)');
    else if(s.sig.pw==='DA')sigSection+=row('Daytimer / DA','50kW day · 1-5kW night','Power drops sharply at sunset. Fringe listeners lose the signal in evening drive — when music radio is most valuable. High incentive to get an FM signal.','var(--red)');
    else if(s.sig.pw==='50kw')sigSection+=row('50kW Directional','50kW day / reduced night','Power drops and signal rotates at night. Same erosion penalties as other AM music.','var(--mut)');
    if(s.fmBooster){
      const _tFracR=Math.min(1,(s.sig.universe||0.32)/Math.max(s._boosterOrigSig?.universe||0.85,0.01));
      const _fringePct=Math.round((1-_tFracR)*100);
      const _tColor=_tFracR>=0.8?'var(--grn)':_tFracR>=0.5?'var(--amb)':'var(--red)';
      sigSection+=row('FM translator coverage',`${Math.round(_tFracR*100)}% of AM footprint`,`${_fringePct}% of your AM audience (the fringe beyond the translator) still can't receive FM and continues eroding. A full FM license eliminates this entirely.`,_tColor);
    } else {
      sigSection+=row('AM music viability',`${viabPct}% of potential`,`FM penetration is ${Math.round(fmp*100)}%. Listeners migrate to FM music. Consider reformatting to AM-native content or acquiring an FM.`,viabColor);
    }
  }

  // QUALITY section
  let qSection=hdr('ON-AIR QUALITY');
  const qColor=oq>=70?'var(--grn)':oq>=50?'var(--amb)':'var(--red)';
  qSection+=row('Overall quality',`${oq}/100`,'','var(--off)');
  const qNotes=[];
  if(oq>=70)qNotes.push('Quality is competitive. Not a primary problem.');
  else if(oq>=50)qNotes.push('Quality is average. Programming investment could help.');
  else qNotes.push('Quality is below market. Programming investment needed urgently.');
  // Compare to direct competitors
  const avgCompQ=directCompetitors.length?Math.round(directCompetitors.reduce((a,c)=>a+(c.oq||50),0)/directCompetitors.length):null;
  if(avgCompQ!==null)qSection+=row('Competitor avg quality',`${avgCompQ}/100`,oq>avgCompQ?'You are above average — quality is not your problem here.':oq<avgCompQ?'Competitors outgun you on quality. Invest in programming or upgrade talent.':'Roughly equal.',oq>=avgCompQ?'var(--grn)':'var(--red)');
  qSection+=`<div style="font-size:14px;color:var(--mut);padding:4px 0">${qNotes.join(' ')}</div>`;

  // COMPETITION section
  let compSection=hdr('COMPETITIVE LANDSCAPE');
  compSection+=row('Market rank',`#${rank} of ${total}`,'All stations combined','var(--off)');
  compSection+=row('Current share',`${(cur*100).toFixed(1)}%`,`Trend: ${pill(trending,trendColor)}`,'var(--off)');
  if(sameFormat.length>0){
    const sfShares=sameFormat.map(o=>`${o.callLetters} ${(o.rat.share*100).toFixed(1)}%`).join(', ');
    compSection+=row('Same format',sameFormat.length===1?`1 competitor: ${sfShares}`:`${sameFormat.length} competitors: ${sfShares}`,'Direct format competition for your core demo.','var(--amb)');
  } else {
    compSection+=row('Same format','No direct competition','You own this format in the market.','var(--grn)');
  }
  if(totalCompCount>0){
    const bleedPct=Math.round(competitionBleed*100);
    compSection+=row('Adjacent competition',`${totalCompCount} stations`,`Compatible formats bleed ~${bleedPct}% from your potential share pool.`,totalCompCount>=3?'var(--red)':'var(--amb)');
  }
  // List top 3 direct competitors by share
  if(directCompetitors.length){
    const topComp=[...directCompetitors].sort((a,b)=>b.rat.share-a.rat.share).slice(0,3);
    topComp.forEach(c=>{
      compSection+=row(`  ${c.callLetters}`,`${(c.rat.share*100).toFixed(1)}% · Q${c.oq||'?'}`,`${FM[c.format]?.l||c.format}`,c.rat.share>cur?'var(--red)':'var(--mut)');
    });
  }

  // SIMULCAST BREAKDOWN (if this station is in a simulcast)
  let simSection='';
  const simPartnerR=s.simulcastWith?G.stations.find(st=>st.id===s.simulcastWith):null;
  if(simPartnerR&&simPartnerR.isPlayer){
    const amStR=s.sig.type==='AM'?s:simPartnerR;
    const fmStR=s.sig.type==='FM'||s.fmBooster?s:simPartnerR;
    const combinedShare=(s.rat.share+simPartnerR.rat.share);
    const amPct=(amStR.rat.share/combinedShare*100).toFixed(0);
    const fmPct=(fmStR.rat.share/combinedShare*100).toFixed(0);
    const amAqh=Object.values(amStR.rat.cur||{}).reduce((sum,c)=>sum+(c?.aqh||0),0);
    const fmAqh=Object.values(fmStR.rat.cur||{}).reduce((sum,c)=>sum+(c?.aqh||0),0);
    simSection=hdr('SIMULCAST BREAKDOWN');
    simSection+=row('Combined share',`${(combinedShare*100).toFixed(1)}%`,'Both signals combined','var(--grn)');
    simSection+=row(`${amStR.freq} AM`,`${(amStR.rat.share*100).toFixed(1)}% · ${amPct}% of combined`,`AQH: ${amAqh.toLocaleString()} · Rev: ${f$(amStR.fin.rev)}/period · Cost: ${f$(amStR.fin.cost)}/period`,amStR.rat.share>fmStR.rat.share?'var(--amb)':'var(--mut)');
    simSection+=row(`${fmStR.freq} FM`,`${(fmStR.rat.share*100).toFixed(1)}% · ${fmPct}% of combined`,`AQH: ${fmAqh.toLocaleString()} · Rev: ${f$(fmStR.fin.rev)}/period · Cost: ${f$(fmStR.fin.cost)}/period`,fmStR.rat.share>amStR.rat.share?'var(--amb)':'var(--mut)');
    // Recommendation: if FM is growing and AM is small, suggest migration
    const amTiny=amStR.rat.share<0.02;
    const fmDominant=fmStR.rat.share>amStR.rat.share*2;
    const year2=G.year;
    if(amTiny&&year2>=1985){
      simSection+=`<div style="font-size:14px;color:var(--amb);padding:6px 0">The AM signal contributes only ${amPct}% of your combined audience. Consider whether the AM operating costs justify maintaining the simulcast — you could sell or flip the AM and consolidate on FM.</div>`;
    } else if(fmDominant){
      simSection+=`<div style="font-size:14px;color:var(--mut);padding:6px 0">FM is carrying ${fmPct}% of your audience. The AM simulcast extends your reach to older listeners and in-home/car AM receivers, but your audience gravity has shifted to FM.</div>`;
    } else {
      simSection+=`<div style="font-size:14px;color:var(--mut);padding:6px 0">Your AM and FM are both contributing meaningfully. The simulcast is working — AM brings legacy listeners, FM brings car and younger audiences.</div>`;
    }
  }

  // SPOT LOAD
  let opsSection=hdr('OPERATIONS');
  const spotPct=Math.round(rv*100);
  const spotColor=rv<=1?'var(--grn)':rv<=1.15?'var(--amb)':'var(--red)';
  opsSection+=row('Spot load',`${spotPct}% of format norm`,rv<=1?'Healthy. Not driving listeners away.':rv<=1.15?'Slightly heavy. Minor listener penalty.':rv<=1.3?'Heavy. Noticeably hurting ratings.':'Overloaded. Major ratings drag — cut spots.',spotColor);
  // Community identity row
  const idScore=Math.round(s.identity||0);
  const idLabel=idScore>=70?'Cornerstone':idScore>=45?'Embedded':idScore>=25?'Recognized':idScore>=10?'Emerging':'Unknown';
  const idColor=idScore>=70?'var(--grn)':idScore>=45?'var(--amb)':idScore>=25?'var(--off)':'var(--mut)';
  const fmtYrs=Math.round((s._formatAge||0)/2);
  opsSection+=`<div class="sr" style="cursor:pointer" onclick="openIdent('${s.id}')">
    <span class="lb">Community Identity <span style="color:var(--mut);font-size:14px">(click to manage)</span></span>
    <span class="vl" style="color:${idColor}">${idScore}/100 — ${idLabel}${fmtYrs>=2?' · '+fmtYrs+'yr':''}</span>
  </div>`;
  opsSection+=row('Marketing spend',`${f$(s.ops?.promo||0)}/period`,s.ops?.promo>=10000?'Active campaign running.':'Light or no marketing.','var(--off)');

  // FORMAT SUNSET
  let fmtSection='';
  if(fs2){
    const deadColor=eraViab<0.5?'var(--red)':'var(--amb)';
    fmtSection=hdr('FORMAT HEALTH');
    fmtSection+=row('Era viability',`${Math.round(eraViab*100)}%`,`${FM[s.format]?.l||s.format} peaked ${fs2.peak} and is fading. Transition before ${fs2.dead}.`,deadColor);
  }

  // ── RECOMMENDATIONS ──
  const recs=[];

  // AM Music → reformat pressure
  if(isAMMusic&&amPenalty<0.5){
    recs.push({sev:'HIGH',txt:`Your AM music signal has lost ${Math.round((1-amPenalty)*100)}% of its potential reach to FM. This is structural — you can't market your way out of it. The options are: acquire an FM license, convert to an AM-native format (News/Talk, Sports Talk), or sell and redeploy the capital.`});
  } else if(isAMMusic&&amPenalty<0.75){
    recs.push({sev:'MED',txt:`AM music is viable now but the window is closing. FM penetration will continue rising. Plan your transition: FM acquisition, simulcast on FM, or format change to AM-native content within 1-2 periods.`});
  }

  // AM Talk signal issue in late era
  if(isTalkAM&&year>=1995&&sameFormat.length>0){
    const fmTalkComp=sameFormat.filter(o=>o.sig.type==='FM'||o.fmBooster);
    if(fmTalkComp.length>0){
      recs.push({sev:'MED',txt:`You have ${fmTalkComp.length} FM News/Talk competitor${fmTalkComp.length>1?'s':''}. FM talk is increasingly preferred in cars. Your content quality (Q${oq}) is your main defense — keep it above 70 and consider an FM simulcast or translator to protect your younger demographics.`});
    }
  }

  // Quality gap
  if(avgCompQ!==null&&oq<avgCompQ-10){
    recs.push({sev:'HIGH',txt:`Your programming quality (Q${oq}) is ${avgCompQ-oq} points below your competitive average. Invest in programming (coaching, production) and upgrade underperforming talent slots. Target Q${Math.min(100,avgCompQ+5)}+ to be competitive.`});
  } else if(avgCompQ!==null&&oq<avgCompQ){
    recs.push({sev:'LOW',txt:`Your quality is slightly below your competitive set. A programming investment push would help hold your core audience.`});
  }

  // Spot load
  if(spotSevere){
    recs.push({sev:'HIGH',txt:`Your spot load is ${spotPct}% of format norm — you're running too many ads. Listeners are tuning out between breaks. Reduce spot count to protect ratings; the revenue loss will be smaller than the ratings damage.`});
  } else if(spotIssue){
    recs.push({sev:'MED',txt:`Spot load is slightly elevated. Watch this — more is not always more in radio. If ratings slip further, spots should be the first dial you turn down.`});
  }

  // Format sunset
  if(fs2&&eraViab<0.6){
    recs.push({sev:'HIGH',txt:`${FM[s.format]?.l||s.format} is a fading format. You are operating at ${Math.round(eraViab*100)}% of peak viability. Begin transition planning now — reformat to a compatible growth format before the audience dries up entirely.`});
  }

  // Competition saturation
  if(sameFormat.length>=2){
    recs.push({sev:'MED',txt:`${sameFormat.length} other stations are competing for the same format audience. In a saturated format, differentiation matters: demo targeting, talent quality, and spot load management are the levers that separate #1 from #3 in the same format.`});
  }

  // Healthy station
  if(recs.length===0){
    recs.push({sev:'OK',txt:`No critical issues detected. Your ratings position reflects the competitive market. Continue monitoring trend direction — a flat or slowly declining share in a healthy station often responds to incremental quality investment.`});
  }

  const recColors={HIGH:'var(--red)',MED:'var(--amb)',LOW:'var(--off)',OK:'var(--grn)'};
  const recHTML=recs.map(r=>`<div style="margin:8px 0;padding:8px 10px;background:${recColors[r.sev]}18;border-left:3px solid ${recColors[r.sev]};font-size:14px;line-height:1.5;color:var(--off)">${pill(r.sev,recColors[r.sev])} ${r.txt}</div>`).join('');

  return `
    <div class="ms2">
      <div class="msh" style="display:flex;justify-content:space-between;align-items:center">
        <span>STATION OVERVIEW</span>
        <span style="font-size:15px;color:var(--mut)">${G.city} · ${G.year}</span>
      </div>
      ${row('Format',FM[s.format]?.l||s.format,'','var(--off)')}
      ${row('Signal',`${s.sig.type} · ${s.sig.pw}`,'','var(--off)')}
      ${row('Share',`${(cur*100).toFixed(1)}%`,`Trend: ${pill(trending,trendColor)}`,'var(--off)')}
      ${sigSection}
      ${qSection}
      ${compSection}
      ${simSection}
      ${opsSection}
      ${fmtSection}
    </div>
    <div class="ms2" style="margin-top:12px">
      ${hdr('RECOMMENDATIONS')}
      ${recHTML}
    </div>`;
}


// ── BRAND NAMING ──────────────────────────────────────────────────
let _brandSid=null;
function pickBrand(sid,b){
  _brandSid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  s.brand=b;
  // Update preview
  const prev=document.getElementById('brand-preview');
  if(prev)prev.textContent='"'+b+'"';
  // Update custom input
  const inp=document.getElementById('brand-custom');
  if(inp)inp.value=b;
  // Re-highlight pills
  document.querySelectorAll('.bp').forEach(el=>{
    el.classList.toggle('bpsel', el.textContent===b);
  });
  renderAll();
}
function updBrand(sid,v){
  _brandSid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  s.brand=v||s.brand;
  const prev=document.getElementById('brand-preview');
  if(prev)prev.textContent='"'+(v||s.brand)+'"';
  // Deselect all pills when typing custom
  document.querySelectorAll('.bp').forEach(el=>el.classList.remove('bpsel'));
  renderAll();
}
// ── ADVANCE TURN ──────────────────────────────────────────────────

// ── TALENT EVENTS ─────────────────────────────────────────────────
/** Resolve deferred AI→player poaches (one period to match salary in contract screen). */
function resolvePendingRivalPoaches(G){
  G.ps.forEach(pStn=>{
    const pend=pStn._rivalPoachPending;
    if(!pend)return;
    const afterAnnounce=(G.year>pend.announcedY||(G.year===pend.announcedY&&G.period>pend.announcedP));
    if(!afterAnnounce)return;
    const slot=pend.slot||'morningDrive';
    const sd=pStn.prog[slot];
    const t=sd?.talent;
    const rival=G.stations.find(st=>st.id===pend.rivalId);
    if(!t||t.id!==pend.talentId){
      delete pStn._rivalPoachPending;
      return;
    }
    const nm=t.name;
    sd.talent=null;
    sd.quality=Math.round((sd.quality||30)*0.70);
    if(rival&&rival.prog[slot]){
      rival.prog[slot].talent={...t,salary:pend.offerSalary,cyr:ri(1,2),morale:Math.min(100,(t.morale||65)+5)};
      rival.prog[slot].quality=Math.min(100,Math.round((rival.prog[slot].quality||30)+t.quality*0.45));
    }
    rival&&(rival._poachCooldown=4);
    G.news.unshift({v:'HIGH',t:`🎙 POACHED: ${nm} leaves ${pStn.callLetters} for ${rival?rival.callLetters:'a rival'} — you didn't match their offer in time.`,y:G.year,p:G.period,iy:true});
    delete pStn._rivalPoachPending;
  });
}

function talentEvents(G){
  const acts=[];
  resolvePendingRivalPoaches(G);
  G.ps.filter(s=>!s.isPublic).forEach(s=>{
    Object.entries(s.prog).forEach(([slot,sd])=>{
      if(!sd?.talent)return;
      const t=sd.talent;
      // Tenure: single increment per period in decay() — do not mutate here (avoids double-count with talentEvents+decay).
      const age=(t.periodsAtStation||0)+1; // projected end-of-period tenure for event odds (decay runs later)
      if(!t._hireYear)t._hireYear=G.year;
      if(!t._careerStartYear)t._careerStartYear=t._hireYear;

      // GRACEFUL NON-RENEWAL: player chose not to renew
      if(t._letExpire&&(t.cyr||0)<=0){
        const name=t.name;
        sd.talent=null;
        G.news.unshift({v:'MEDIUM',t:`${name} departs ${s.callLetters} ${SL[slot]} — contract not renewed.`,y:G.year,p:G.period,iy:true});
        return;
      }

      // CONTRACT EXPIRY WARNING: give player one period heads-up
      if((t.cyr||0)<=0.5&&(t.cyr||0)>0&&!t._letExpire&&!t._warnedExpiry){
        t._warnedExpiry=true;
        G.news.unshift({v:'MEDIUM',t:`📋 ${t.name}'s contract at ${s.callLetters} expires next period — click their name to negotiate.`,y:G.year,p:G.period,iy:true});
      }
      // Reset warning flag when renewed
      if((t.cyr||0)>1)t._warnedExpiry=false;

      // MANDATORY RETIREMENT: 35-year career cap (calendar years in radio)
      const careerStartYear=Math.min(t._careerStartYear||t._hireYear||G.year,t._hireYear||G.year);
      t._careerStartYear=careerStartYear;
      const careerYears = G.year - careerStartYear;
      if(careerYears >= 35){
        const name=t.name;
        sd.talent=null;
        G.news.unshift({v:'HIGH',t:`🎙 ${name} retires after ${careerYears} years in radio — a true legend of ${s.callLetters} ${SL[slot]}.`,y:G.year,p:G.period,iy:true});
        return;
      }
      // RETIREMENT WARNING: one year heads-up at 34 years
      if(careerYears===34 && !t._retireWarned){
        t._retireWarned=true;
        G.news.unshift({v:'MEDIUM',t:`📋 ${t.name} reaches 35 years in radio next year — they'll be retiring from ${s.callLetters}. Start scouting.`,y:G.year,p:G.period,iy:true});
      }
      // Late-career retirement (calendar years in radio) — reachable during normal play, not save-migration only
      if(careerYears>=26&&careerYears<35&&Math.random()<0.02+Math.max(0,(careerYears-26))*0.018){
        const name=t.name;
        sd.talent=null;
        G.news.unshift({v:'MEDIUM',t:`🎙 ${name} retires from ${s.callLetters} ${SL[slot]} after ${careerYears} years in radio.`,y:G.year,p:G.period,iy:true});
        return;
      }
      // GRACEFUL VOLUNTARY RETIREMENT: quality talent, long tenure, probabilistic
      const retireChance=careerYears>22?0.10:careerYears>18?0.05:age>16?0.04:age>12?0.02:0;
      if(t.quality>70&&Math.random()<retireChance){
        const name=t.name;
        sd.talent=null;
        G.news.unshift({v:'MEDIUM',t:`${name} retires from ${s.callLetters} ${SL[slot]} after a legendary run.`,y:G.year,p:G.period,iy:true});
        return;
      }

      // BURNOUT: low morale — sudden quit.
      const burnoutChance=t.morale<35?0.15:t.morale<50?0.07:0;
      if(Math.random()<burnoutChance){
        const name=t.name;
        sd.talent=null;
        G.news.unshift({v:'HIGH',t:`⚠ ${name} quits ${s.callLetters} ${SL[slot]} — morale collapse. Find a replacement fast.`,y:G.year,p:G.period,iy:true});
        return;
      }

      // POACHING: rival AI stations try to steal star talent (morning drive only) — defer loss; player can match in contract modal
      if(slot==='morningDrive'&&t.quality>72&&Math.random()<0.06){
        const rivals=G.stations.filter(st=>st&&!st._bpSlotDeferred&&!st.isPlayer&&st.rat?.share>0.05);
        if(rivals.length&&!s._rivalPoachPending){
          const rival=pick(rivals);
          const name=t.name;
          const poachResist=(t.morale/100)*0.5+Math.min(1,(t.cyr||0)/2)*0.5;
          if(Math.random()<poachResist){
            G.news.unshift({v:'MEDIUM',t:`🎙 ${rival.callLetters} approached ${name} — they stayed loyal to ${s.callLetters}. Consider a renewal.`,y:G.year,p:G.period});
          } else {
            const newSal=Math.round(t.salary*rnd(1.22,1.48)/500)*500;
            s._rivalPoachPending={rivalId:rival.id,slot:'morningDrive',offerSalary:newSal,talentId:t.id,announcedY:G.year,announcedP:G.period,matched:false};
            rival._poachCooldown=4;
            G.news.unshift({v:'HIGH',t:`⚡ ${rival.callLetters} is courting ${name} with ${f$(newSal)}/yr — open their contract to match (≥${f$(Math.round(newSal*0.95/500)*500)}/yr) or they may leave next period.`,y:G.year,p:G.period,iy:true});
          }
        }
      }
    });
  });
}

// ── RIVAL REFORMAT ────────────────────────────────────────────────
function rivalReformat(G){
  // Non-commercial public stations are immune to all of this
  const commercialRivals=G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic);
  // Formats unavailable after their sunset year
  // Formats unavailable after their sunset — can't reformat INTO a dead format
  const formatSunset={BEAUTIFUL_MUSIC:1995,MOR:1998,FULL_SERVICE:1975};
  const eligibleFormats=Object.keys(FM).filter(f=>
    !FM[f]?.public && f!=='FULL_SERVICE' &&
    (G.unlockedFormats?.includes(f)||FM[f].unlock<=G.year) &&
    (!formatSunset[f]||G.year<formatSunset[f])
  );

  // Force MOR and BEAUTIFUL_MUSIC rivals into permanent struggle post-sunset trigger year
  // so rivalReformat picks them up quickly even if they somehow still have share
  const FORMAT_FORCE_EXIT={MOR:1983,BEAUTIFUL_MUSIC:1985,FULL_SERVICE:1975};
  commercialRivals.forEach(s=>{
    const exitYear=FORMAT_FORCE_EXIT[s.format];
    if(exitYear&&G.year>=exitYear+2){
      // Been in a dead format 2+ years past trigger — override share check
      s._lowSharePeriods=(s._lowSharePeriods||0)+2; // fast-track to reformat stage
    }
  });

  commercialRivals.forEach(s=>{
    if(!s._lowSharePeriods)s._lowSharePeriods=0;
    const isStruggling=s.rat.share<0.03;
    const isMarginal=s.rat.share>=0.03&&s.rat.share<0.06;

    if(!isStruggling){s._lowSharePeriods=Math.max(0,(s._lowSharePeriods||0)-1);return;}
    s._lowSharePeriods++;

    const p=s._lowSharePeriods;
    // Reality timeline: ~2 yrs (4 periods) of patience, then escalating moves
    // Stage 1 (periods 3-5): Cost cuts — fire expensive talent, reduce spots
    if(p>=3&&p<=5&&Math.random()<0.50){
      let fired=false;
      ['morningDrive','afternoonDrive'].forEach(sl=>{
        if(fired)return;
        const sd=s.prog?.[sl];
        if(sd?.talent&&(sd.talent.salary||0)>60000){
          G.news.unshift({v:'LOW',t:`💸 ${s.callLetters} cuts costs — ${sd.talent.name} let go.`,y:G.year,p:G.period});
          sd.talent=null;fired=true;
        }
      });
      // Also reduce spot load toward format norm to improve TSL
      if(s.ops&&s.ops.spots>FM[s.format]?.sp){
        s.ops.spots=FM[s.format]?.sp||14;
      }
      return;
    }

    // Stage 2 (periods 5-8): Format drift shift — move slider toward safer pole
    if(p>=5&&p<=8&&Math.random()<0.40){
      const dr=s.drift?.[s.format];
      if(dr!==undefined&&DRIFT[s.format]){
        const cfg=DRIFT[s.format];
        // Retreat toward the conservative/safer pole (lower value)
        const newDrift=Math.max(5,dr-20);
        if(!s.drift)s.drift={};
        s.drift[s.format]=newDrift;
        G.news.unshift({v:'LOW',t:`📊 ${s.callLetters} repositions toward ${cfg.poleA.name} — management shakeup.`,y:G.year,p:G.period});
        return;
      }
    }

    // Stage 3 (periods 6+): Reformat — only if consistently bad
    if(p>=6&&Math.random()<0.20){
      const candidates=eligibleFormats.filter(f=>
        f!==s.format&&(FM[f]?.unlock||1900)<=G.year
      );
      if(!candidates.length)return;
      // Weighted format selection: favor growing formats, penalize oversaturated ones
      const mktComm=G.stations.filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic);
      const sorted=[...mktComm].sort((a,b)=>b.rat.share-a.rat.share);
      const fmtCounts={};mktComm.forEach(st=>{fmtCounts[st.format]=(fmtCounts[st.format]||0)+1;});
      const fmtShares={};mktComm.forEach(st=>{fmtShares[st.format]=(fmtShares[st.format]||0)+st.rat.share;});
      // Score each candidate format
      const scored=candidates.map(f=>{
        let score=1.0;
        const share=fmtShares[f]||0;
        const count=fmtCounts[f]||0;
        // Formats with good share but not too crowded are best targets
        if(share>0.08)score*=1.8;
        else if(share>0.05)score*=1.3;
        if(count>=3)score*=0.4; // oversaturated
        else if(count===0)score*=0.6; // unproven in this market
        // Corporate rivals strongly prefer proven formats
        if(s.pers===PD.CORP_RADIO||s.pers?.ms>=0.85){
          if(['CHR','COUNTRY','ADULT_CONTEMP','NEWS_TALK'].includes(f))score*=1.5;
        }
        // Bonus for formats completely absent from market — realistic gap-filling
        if((fmtCounts[f]||0)===0&&FM[f]?.unlock<=G.year){
          if(['NEWS_TALK','SPORTS_TALK','COUNTRY','CLASSIC_ROCK'].includes(f))score*=2.5;
        }
        // Maverick/Scrapper more willing to bet on emerging formats
        if(s.pers?.ag>=0.70&&count===0)score*=1.4;
        return {f, score};
      }).sort((a,b)=>b.score-a.score);
      // Weighted random pick — top 3 candidates get most weight
      const pool=scored.slice(0,Math.min(4,scored.length));
      const totalW=pool.reduce((s,x)=>s+x.score,0);
      let r=Math.random()*totalW, newFmt=pool[0].f;
      for(const {f,score} of pool){r-=score;if(r<=0){newFmt=f;break;}}
      const oldFmt=FM[s.format]?.l||s.format;
      s.format=newFmt;
      s._lowSharePeriods=0;
      if(!s.drift)s.drift={};
      s.drift[newFmt]=DRIFT[newFmt]?.default||40;
      Object.keys(s.mom||{}).forEach(c=>s.mom[c]={tgt:0.01,cur:0.01});
      s.str='emerging'; // fresh start
      s.launchPeriod=G.turn||0;
      G.news.unshift({v:'MEDIUM',t:`📻 ${s.callLetters} abandons ${oldFmt} → relaunches as ${FM[newFmt]?.l||newFmt}.`,y:G.year,p:G.period});
    }
  });
}

// ── CONSOLIDATION SYSTEM ──────────────────────────────────────────
// Post-1996 Telecom Act: corporate radio groups acquire independents
// Three fictional consolidators modeled on Clear Channel, Cumulus, Citadel
const CORPS=[
  {id:'clearwave', name:'ClearWave Media',    color:'#dc2626', stations:[], budget:50000000, aggression:0.85},
  {id:'cumulus2',  name:'Cumulus Broadcasting',color:'#7c3aed', stations:[], budget:30000000, aggression:0.65},
  {id:'landmark',  name:'Landmark Radio Group',color:'#0369a1', stations:[], budget:5000000, aggression:0.50},
];

function initConsolidation(G){
  if(G.corps)return; // already initialized
  G.corps=CORPS.map(c=>({...c,stations:[]}));
}

function rehydrateCorps(G){
  // After save/load, corps.stations[] may be empty even though stations have corpOwner set.
  // Walk stations and re-link them into the correct corp's stations array.
  if(!G.corps)return;
  G.corps.forEach(c=>{ c.stations=[]; });
  G.stations.forEach(s=>{
    if(s.corpOwner&&!s.isPlayer){
      const corp=G.corps.find(c=>c.id===s.corpOwner);
      if(corp&&!corp.stations.includes(s.id)) corp.stations.push(s.id);
    }
  });
}

function runConsolidation(G){
  if(G.year<1996)return[];
  // Always re-sync corps on each call — handles save/load where G.corps may be null
  // even though the 1996 consolidate event already fired.
  if(!G.corps) G.corps=CORPS.map(c=>({...c,stations:[]}));
  // Re-link stations into corp arrays (clears stale data, rebuilds from source of truth)
  G.corps.forEach(c=>{ c.stations=[]; });
  G.stations.forEach(s=>{
    if(s.corpOwner&&!s.isPlayer){
      const corp=G.corps.find(c=>c.id===s.corpOwner);
      if(corp&&!corp.stations.includes(s.id)) corp.stations.push(s.id);
    }
  });
  // Restore corp budgets if they've been zeroed (can happen on reload)
  G.corps.forEach(c=>{
    if(!c.budget||c.budget<500000) c.budget=CORPS.find(t=>t.id===c.id)?.budget||5000000;
  });
  const acts=[];

  // Each corporate group attempts 1-2 acquisitions per year (Fall period)
  if(G.period!==2)return[];

  G.corps.forEach(corp=>{
    if(corp.budget<=0)return;
    const acqCount=corp.aggression>0.75?Math.random()<0.7?2:1:Math.random()<0.4?1:0;

    for(let i=0;i<acqCount;i++){
      // Target: independent stations (not player, not public, not already corporate)
      // Also filter by FCC cap — corp cannot exceed market-size limit
      const corpTargetsAM=G.stations.filter(s=>
        !s.isPlayer&&!s.isPublic&&!s.corpOwner&&s.rat.share>0.02&&
        (s.sig.type==='AM'||s.fmBooster)&&fccCanAcquire(corp.id,'AM',G)
      );
      const corpTargetsFM=G.stations.filter(s=>
        !s.isPlayer&&!s.isPublic&&!s.corpOwner&&s.rat.share>0.02&&
        s.sig.type==='FM'&&!s.fmBooster&&fccCanAcquire(corp.id,'FM',G)
      );
      const targets=[...corpTargetsAM,...corpTargetsFM];
      if(!targets.length)break;

      // Corporate buyers prefer: FM stations, higher share, formats with scale
      // They'll pay a premium — 1.5-2.5x "market value"
      const scored=targets.map(s=>{
        let score=s.rat.share*100;
        if(s.sig.type==='FM')score*=1.4;
        if(['NEWS_TALK','SPORTS_TALK','CHR','COUNTRY','ADULT_CONTEMP'].includes(s.format))score*=1.2;
        // Prefer stations in formats they don't already own in this market
        const ownedFormats=corp.stations.map(id=>G.stations.find(st=>st.id===id)?.format).filter(Boolean);
        if(!ownedFormats.includes(s.format))score*=1.3;
        return {s, score};
      }).sort((a,b)=>b.score-a.score);

      const target=scored[0]?.s;
      if(!target)break;

      // Price: based on revenue multiple (radio stations trade at 8-12x cash flow)
      const annualRev=target.fin.rev*2;
      const multiple=8+Math.random()*4;
      const price=Math.round(annualRev*multiple/100000)*100000;

      if(price>corp.budget*0.4)break; // won't spend more than 40% budget on one deal

      // Execute acquisition
      target.corpOwner=corp.id;
      target.corpName=corp.name;
      target.corpColor=corp.color;
      corp.stations.push(target.id);
      corp.budget-=price;

      // Corporate ownership effects:
      // + Better cost efficiency (centralized sales, voicetracking)
      // - Quality drops over time (generic programming, lost local feel)
      target.pers={...PD.CORP_RADIO};
      target._corpAcqYear=G.year;
      target._qualityDecayRate=0.8; // quality decays 0.8 pts/period under corporate

      const shortName=corp.name.split(' ')[0];
      acts.push({v:'HIGH',
        t:`🏢 ${shortName} acquires ${target.callLetters} (${FM[target.format]?.l}) for ~${f$(price)} — consolidation accelerates.`,
        iy:false});
    }
  });
  return acts;
}

// Corporate station quality decay — voicetracking, cost-cutting kills local feel
function corporateDecay(G){
  if(!G.corps)return;
  G.stations.filter(s=>s.corpOwner&&!s.isPlayer).forEach(s=>{
    const rate=s._qualityDecayRate||0.5;
    // Quality declines slowly — listeners eventually notice the generic voicetracked feel.
    // Floor: 22 (not 35) — corporate radio genuinely hollows out quality.
    // Cluster penalty: corps owning 3+ stations get faster decay (economies of scale = less local)
    const corp=G.corps?.find(c=>c.id===s.corpOwner);
    const clusterSize=corp?corp.stations.length:1;
    const clusterPenalty=clusterSize>=4?1.5:clusterSize>=3?1.25:1.0;
    if(s.oq>22)s.oq=Math.max(22,s.oq-rate*clusterPenalty);
    // BUT: corporate stations have better cost efficiency — handled in calcRev
  });
}

// Get acquisition price for a station (player buying from corp costs more)
function acqPrice(s,G){
  const annualRev=(s.fin?.rev||50000)*2;
  const base=Math.max(625000,annualRev*10);
  const corpPremium=s.corpOwner?1.6:1.0; // corps don't sell cheap
  const sharePrem=1+s.rat.share*4;
  return Math.round(base*corpPremium*sharePrem/100000)*100000;
}

// ── LOCAL MARKETING AGREEMENT (LMA) SYSTEM ──────────────────────
// Historical context: LMAs were the primary way to operate beyond FCC limits
// before 1992 deregulation opened up multi-station ownership.
// Peak era: 1978-1996. Still used post-1996 but as pre-sale transitions.
//
// LESSOR (you own, they operate): Collect ~65% of station revenue as a fee.
//   You keep the license. The station's P&L is theirs. No upkeep on your end.
//   Useful when: at ownership cap, station underperforming, need steady cash.
//
// LESSEE (you operate, they own): Pay ~65% of revenue as fee to licensor.
//   Station appears on your management panel. You set format, hire talent, etc.
//   Does NOT count against ownership limits until 1999 FCC rule change.
//   Useful when: at ownership cap but want to run another signal.
//
// Corp AI: Corps can propose LMAs to players as lessees of corp-owned stations.

const LMA_FEE_RATE = 0.65; // lessor receives 65% of station revenue as fixed fee

function lmaFeeForStation(s) {
  // Use pre-override gross revenue if available (seedRev stores it in _lmaGrossRev)
  // so the fee is based on what the station actually earns, not the already-overridden value
  const base = s._lmaGrossRev || s.fin?.rev || 0;
  return Math.round(base * LMA_FEE_RATE / 1000) * 1000;
}

function lmaCountsAgainstLimit(year) {
  // Pre-1999: LMAs don't count toward FCC limits
  // 1999+: LMAs >15% of broadcast day count (we simplify: all LMAs count post-1999)
  return year >= 1999;
}

function playerCanEnterLMA(role, G) {
  // role: 'lessee' = player wants to operate another station
  // role: 'lessor' = player wants to lease out one of their own
  if (role === 'lessor') {
    // Must own at least 2 stations to lease one out (keep at least 1)
    const myStns = G.ps.filter(s => !s.lmaLessorId); // non-leased-out owned stations
    return myStns.length >= 2;
  }
  if (role === 'lessee') {
    // Pre-1999: can always take on an LMA (bypasses ownership limit)
    // 1999+: counts toward limit
    if (lmaCountsAgainstLimit(G.year)) {
      return fccCanAcquire('player','AM',G) || fccCanAcquire('player','FM',G);
    }
    return true; // pre-1999: no limit on LMAs
  }
  return false;
}

function openLMA() {
  rLMA();
  om('m-lma');
}

function rLMA() {
  const el = document.getElementById('lmab');
  if (!el) return;
  const year = G.year;
  const isPreDeregulation = year < 1992;
  const countsAgainstLimit = lmaCountsAgainstLimit(year);

  // Current active LMAs
  const activeLesseeStns = G.stations.filter(s => s.lmaLesseeId === 'player'); // player is lessee
  const activeLessorStns = G.ps.filter(s => s.lmaLessorId); // player is lessor (leased out)

  // Available to lease AS LESSEE: independent non-player stations willing to LMA
  // Eligibility: AM stations with weak performance, OR corp stations offering leases
  const lesseeTargets = G.stations.filter(s => {
    if (s.isPlayer || s.isPublic || s.lmaLesseeId) return false;
    if (s.lmaLessorId) return false; // already in an LMA
    // Weak independents are willing; corps offer strategic leases
    const isWeak = s.rat.share < 0.04 && !s.corpOwner;
    const isCorpOffering = s.corpOwner && s._corpLMAOffer;
    return isWeak || isCorpOffering;
  });

  // Available to lease AS LESSOR: player's own stations they can lease out
  const lessorTargets = myPS().filter(s => !s.lmaLessorId && !s.lmaLesseeId);
  const canLessor = lessorTargets.length >= 2; // must keep at least 1

  const feeNote = countsAgainstLimit
    ? `<div style="background:rgba(240,88,88,.10);border:1px solid rgba(240,88,88,.3);padding:8px 12px;font-family:var(--ft);font-size:14px;color:var(--red);margin-bottom:12px">⚠ Since 1999, LMAs count toward FCC ownership limits. Operating a leased station uses one of your license slots.</div>`
    : `<div style="background:rgba(90,180,255,.08);border:1px solid rgba(90,180,255,.25);padding:8px 12px;font-family:var(--ft);font-size:14px;color:var(--blu);margin-bottom:12px">📋 Pre-1999: LMAs do not count toward FCC ownership limits. This is the primary way to operate beyond your cap.</div>`;

  // Active LMAs section
  let activeHTML = '';
  if (activeLesseeStns.length || activeLessorStns.length) {
    const lesseeRows = activeLesseeStns.map(s => {
      const fee = lmaFeeForStation(s);
      return `<div class="lma-row active-lma">
        <div>
          <div class="lma-badge lessee">YOU OPERATE</div>
          <div class="lma-call" style="color:${s.color||'var(--wht)'}">${s.callLetters}</div>
          <div class="lma-meta">${s.freq} · ${FM[s.format]?.l||s.format} · Share: ${pct(s.rat.share)}</div>
          <div class="lma-terms">Fee to licensor: ${f$(fee)}/period · You keep the rest</div>
          <div class="lma-meta" style="margin-top:4px;color:var(--mut)">Licensor: ${s.lmaLicensorName||'Independent Owner'}</div>
        </div>
        <button class="abt" style="font-size:15px;color:var(--red);border-color:var(--red)" onclick="terminateLMA('${s.id}','lessee')">END LMA</button>
      </div>`;
    }).join('');

    const lessorRows = activeLessorStns.map(s => {
      const fee = lmaFeeForStation(s);
      return `<div class="lma-row active-lma">
        <div>
          <div class="lma-badge lessor">YOU LICENSE OUT</div>
          <div class="lma-call" style="color:var(--wht)">${s.callLetters}</div>
          <div class="lma-meta">${s.freq} · ${FM[s.format]?.l||s.format} · Share: ${pct(s.rat.share)}</div>
          <div class="lma-terms" style="color:var(--grn)">You receive: ${f$(fee)}/period guaranteed income</div>
          <div class="lma-meta" style="margin-top:4px;color:var(--mut)">Operator: ${s.lmaOperatorName||'Third Party'} · You retain the license</div>
        </div>
        <button class="abt" style="font-size:15px;color:var(--red);border-color:var(--red)" onclick="terminateLMA('${s.id}','lessor')">RECLAIM</button>
      </div>`;
    }).join('');

    activeHTML = `<div class="ms2" style="margin-bottom:14px">
      <div class="msh" style="color:var(--grn)">ACTIVE LMAs</div>
      ${lesseeRows}${lessorRows}
    </div>`;
  }

  // Lessee options: stations you can take over
  let lesseeHTML = '';
  if (lesseeTargets.length) {
    const rows = lesseeTargets.map(s => {
      const fee = lmaFeeForStation(s);
      const netEst = Math.round((s.fin?.rev||0) * (1 - LMA_FEE_RATE));
      const canAfford = G.cash >= fee; // need first period's fee upfront
      const sigType = s.sig.type==='FM'||s.fmBooster ? 'FM' : 'AM';
      const limitOk = !countsAgainstLimit || fccCanAcquire('player', sigType, G);
      const ok = canAfford && limitOk;
      const corpTag = s.corpOwner ? `<span style="font-size:15px;color:${s.corpColor||'#9ca3af'};margin-left:6px">${s.corpName}</span>` : '';
      return `<div class="lma-row${ok?'':' nope'}" style="opacity:${ok?1:.4}">
        <div>
          <div class="lma-call" style="color:${s.color||'var(--wht)'}">${s.callLetters}${corpTag}</div>
          <div class="lma-meta">${s.freq} · ${s.sig.pw} · ${FM[s.format]?.l||s.format} · Quality: ${Math.round(s.oq)}</div>
          <div class="lma-meta">Share: ${pct(s.rat.share)} · Revenue: ${f$(s.fin?.rev||0)}/period</div>
          <div class="lma-terms">Fee: ${f$(fee)}/period → Est. net to you: ${f$(netEst)}/period</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <span style="font-family:var(--ft);font-size:15px;color:var(--mut)">First fee upfront</span>
          <span style="font-family:var(--fd);font-size:15px;color:${ok?'var(--amb)':'var(--red)'}">${f$(fee)}</span>
          ${ok ? `<button class="abt" style="font-size:15px" onclick="doLMALessee('${s.id}')">TAKE OVER →</button>` : `<span style="font-size:15px;color:var(--red)">${!limitOk?'FCC LIMIT':'NO FUNDS'}</span>`}
        </div>
      </div>`;
    }).join('');
    lesseeHTML = `<div class="ms2" style="margin-bottom:14px">
      <div class="msh">STATIONS AVAILABLE TO OPERATE (YOU AS LESSEE)</div>
      <p class="di" style="font-size:14px">You program, hire talent, and keep revenue minus the fee. The licensor keeps the license.</p>
      ${rows}
    </div>`;
  } else {
    lesseeHTML = `<div class="ms2" style="margin-bottom:14px">
      <div class="msh">STATIONS AVAILABLE TO OPERATE</div>
      <p class="di" style="font-size:15px;color:var(--mut)">No stations currently available for LMA. Weak independent AM stations and corporate offerings appear here when available.</p>
    </div>`;
  }

  // Lessor options: your stations you can lease out
  let lessorHTML = '';
  if (canLessor) {
    const rows = lessorTargets.map(s => {
      const fee = lmaFeeForStation(s);
      return `<div class="lma-row">
        <div>
          <div class="lma-call">${s.callLetters}</div>
          <div class="lma-meta">${s.freq} · ${FM[s.format]?.l||s.format} · Share: ${pct(s.rat.share)}</div>
          <div class="lma-meta">Current rev: ${f$(s.fin?.rev||0)}/period</div>
          <div class="lma-terms" style="color:var(--grn)">You'd receive: ${f$(fee)}/period — guaranteed, no upkeep</div>
        </div>
        <button class="abt" style="font-size:15px;background:rgba(82,227,110,.12);border-color:var(--grn);color:var(--grn)" onclick="doLMALessor('${s.id}')">LEASE OUT →</button>
      </div>`;
    }).join('');
    lessorHTML = `<div class="ms2">
      <div class="msh">YOUR STATIONS AVAILABLE TO LEASE OUT (YOU AS LESSOR)</div>
      <p class="di" style="font-size:14px">Lease a station you own to an operator. You collect ${Math.round(LMA_FEE_RATE*100)}% of revenue as a fixed fee. No upkeep costs. You keep the license and call letters. Useful when at your ownership cap.</p>
      ${rows}
    </div>`;
  } else {
    lessorHTML = `<div class="ms2">
      <div class="msh">LEASE OUT ONE OF YOUR STATIONS</div>
      <p class="di" style="font-size:15px;color:var(--mut)">You need at least 2 stations to lease one out — you must retain at least 1 licensed station.</p>
    </div>`;
  }

  const histNote = isPreDeregulation
    ? `<p class="di" style="font-size:15px;margin-bottom:14px">LMAs are the primary tool for operating beyond the FCC's one-AM-one-FM-per-market rule. They're legally a <em>time brokerage</em> — you buy airtime blocks and sell the ads yourself. Peak era: 1978–1992.</p>`
    : year < 1999
    ? `<p class="di" style="font-size:15px;margin-bottom:14px">Post-1992 deregulation means you can own multiple stations outright — but LMAs remain useful as pre-sale transitions and for operating signals where your FCC limit is tight.</p>`
    : `<p class="di" style="font-size:15px;margin-bottom:14px">Since 1999, the FCC counts LMAs of more than 15% of broadcast time toward your ownership limits. LMAs are now mainly used to bridge sales and as corporate efficiency tools.</p>`;

  el.innerHTML = histNote + feeNote + activeHTML + lesseeHTML + lessorHTML +
    `<button class="cnl" onclick="cm('m-lma')">CLOSE</button>`;
}

function doLMALessee(sid) {
  const s = G.stations.find(st => st.id === sid);
  if (!s || s.isPlayer || s.lmaLesseeId) return;
  const fee = lmaFeeForStation(s);
  if (G.cash < fee) { alert('Need ' + f$(fee) + ' for first period fee.'); return; }
  G.cash -= fee;
  if (MP.mode==='live') { if(!G._playerCash) G._playerCash={}; G._playerCash[MP.playerId]=G.cash; MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash}); }

  // Mark the station as LMA-operated by player
  s.lmaLesseeId = 'player';
  s._mpOwner = MP.mode==='live' ? MP.playerId : 0;
  s.isPlayer = true; // appears in player panel
  s._lmaStation = true; // distinguishes from owned stations
  s.lmaLicensorName = s.corpOwner ? s.corpName : 'Independent';
  s._lmaFeeRate = LMA_FEE_RATE;
  G.ps = G.stations.filter(st => st.isPlayer);

  G.news.unshift({v:'HIGH', t:`📝 LMA signed: ${s.callLetters} — you now program and operate this station. Fee: ${f$(fee)}/period to licensor.`, y:G.year, p:G.period, iy:true});
  MP.action('lma_lessee', {sid});
  cm('m-lma'); renderAll();
}

function doLMALessor(sid) {
  const s = G.stations.find(st => st.id === sid);
  if (!s || !s.isPlayer) return;
  const myNonLeased = G.ps.filter(st => !st.lmaLessorId && !st._lmaStation);
  if (myNonLeased.length < 2) { alert('You must keep at least 1 station for yourself.'); return; }
  const fee = lmaFeeForStation(s);

  s.lmaLessorId = 'ai_operator'; // an AI entity operates it
  s._lmaStation = false;
  s._lmaStartPeriod = (G.turn||0); // track when LMA began for duration
  s._lmaDuration = 4;              // default: 4 periods (2 years), renewable
  s.lmaOperatorName = pick(['Broadcast Partners','Regional Radio Inc.','Metro Media Group','Sun Belt Broadcasting','Heritage Radio']);

  // AI operator picks a format — they won't duplicate the lessor's existing formats
  // (real LMA agreements routinely include non-compete clauses on format)
  const _myFormats = G.ps.filter(st=>st.id!==s.id).map(st=>st.format);
  const _availFmts = G.unlockedFormats.filter(f=>
    !_myFormats.includes(f) && f!==s.format &&
    (FM[f]?.ri||1)<=G.year && !['FULL_SERVICE','PUBLIC_RADIO'].includes(f)
  );
  // Prefer formats with decent CPM that suit the signal type
  const _amFriendly=['NEWS_TALK','SPORTS_TALK','COUNTRY','GOSPEL','ADULT_STANDARDS','OLDIES','CLASSIC_HITS'];
  const _fmtPool = s.sig.type==='AM'
    ? _availFmts.filter(f=>_amFriendly.includes(f)).concat(_availFmts.filter(f=>!_amFriendly.includes(f)))
    : _availFmts;
  const _chosenFmt = _fmtPool.length ? _fmtPool[Math.floor(Math.random()*Math.min(3,_fmtPool.length))] : s.format;
  const _prevFmt = s.format;
  s.format = _chosenFmt;
  s.brand = gb(_chosenFmt, s.freq, G?.city);
  s._formatAge = 0;
  // Give AI operator a fresh identity start
  s.identity = 0; s._identityPeak = 0;

  G.news.unshift({v:'MEDIUM', t:`📝 LMA signed: ${s.callLetters} leased to ${s.lmaOperatorName}. They'll program it as ${FM[_chosenFmt]?.l||_chosenFmt}${_prevFmt!==_chosenFmt?' (reformatted from '+FM[_prevFmt]?.l+')':''}. You receive ${f$(fee)}/period. Station stays under your license.`, y:G.year, p:G.period, iy:true});
  logHistory(s,'FORMAT',`LMA: leased to ${s.lmaOperatorName} — reformatted to ${FM[_chosenFmt]?.l||_chosenFmt}`,G);
  MP.action('lma_lessor', {sid});
  cm('m-lma'); renderAll();
}

function terminateLMA(sid, role) {
  const s = G.stations.find(st => st.id === sid);
  if (!s) return;
  if (role === 'lessee') {
    // End your operation of a station you don't own
    s.lmaLesseeId = null;
    s._lmaStation = false;
    s.isPlayer = false;
    s._mpOwner = undefined;
    G.ps = G.stations.filter(st => st.isPlayer);
    G.news.unshift({v:'MEDIUM', t:`📝 LMA terminated: ${s.callLetters} returned to licensor.`, y:G.year, p:G.period, iy:true});
  } else {
    // Reclaim a station you leased out
    s.lmaLessorId = null;
    s.lmaOperatorName = null;
    G.news.unshift({v:'MEDIUM', t:`📝 LMA ended: ${s.callLetters} reclaimed from ${s.lmaOperatorName||'operator'}.`, y:G.year, p:G.period, iy:true});
  }
  MP.action('lma_terminate', {sid, role});
  cm('m-lma'); renderAll();
}

// LMA fee processing — called during revenue phase each period
function processLMAFees(G) {
  // Player as lessee: deduct fee from player cash
  G.stations.filter(s => s.lmaLesseeId === 'player' && s._lmaStation).forEach(s => {
    const fee = lmaFeeForStation(s);
    G.cash = (G.cash || 0) - fee;
    if (MP.mode==='live') { if(!G._playerCash) G._playerCash={}; G._playerCash[MP.playerId]=G.cash; }
    s._lmaFeePaid = fee;
  });

  // Player as lessor: add fee to player cash; check for expiration
  G.ps.filter(s => s.lmaLessorId).forEach(s => {
    const fee = lmaFeeForStation(s);
    G.cash = (G.cash || 0) + fee;
    if (MP.mode==='live') { if(!G._playerCash) G._playerCash={}; G._playerCash[MP.playerId]=G.cash; }
    s._lmaFeeReceived = fee;
    // Duration check: queue a renewal notice when the LMA term expires
    const periodsHeld = (G.turn||0) - (s._lmaStartPeriod||0);
    const duration = s._lmaDuration || 4;
    if(periodsHeld >= duration && !s._lmaRenewalPending){
      s._lmaRenewalPending = true;
      MILESTONE_Q.push({
        type:'info',
        title:'LMA EXPIRING',
        body:`<strong>${s.callLetters}</strong> — your LMA with ${s.lmaOperatorName||'the operator'} has run its term. You can renew for another 2 years or reclaim the station. You're currently collecting ${f$(fee)}/period in license fees.`,
        owner: s._mpOwner
      });
    }
  });
}

// Corp AI LMA offers — corps occasionally offer to lease a weak station to the player
function runCorpLMAOffers(G) {
  if (!G.corps || G.year < 1984) return;
  G.corps.forEach(corp => {
    if (!corp.stations.length) return;
    // Find a weak corp-owned station they'd rather have someone else operate
    const weakStns = corp.stations
      .map(id => G.stations.find(s => s.id === id))
      .filter(s => s && !s.isPlayer && !s.lmaLesseeId && s.rat.share < 0.025);
    weakStns.forEach(s => {
      if (!s._corpLMAOffer && Math.random() < 0.3) {
        s._corpLMAOffer = true; // flags it as available in LMA modal
        G.news.unshift({v:'MEDIUM',
          t:`📋 ${corp.name} is looking for an operator for ${s.callLetters} (${FM[s.format]?.l}) — check LMA deals.`,
          y:G.year, p:G.period, iy:true});
      }
    });
  });
}

window._mpApply_lma_lessee = function({sid}) {
  const s = G.stations.find(st=>st.id===sid); if(!s) return;
  s.lmaLesseeId='player'; s._lmaStation=true; s.isPlayer=true;
  G.ps=G.stations.filter(st=>st.isPlayer); renderAll();
};
window._mpApply_lma_lessor = function({sid}) { renderAll(); };
window._mpApply_lma_terminate = function({sid,role}) {
  const s=G.stations.find(st=>st.id===sid); if(!s) return;
  if(role==='lessee'){s.lmaLesseeId=null;s._lmaStation=false;s.isPlayer=false;s._mpOwner=undefined;}
  else{s.lmaLessorId=null;}
  G.ps=G.stations.filter(st=>st.isPlayer); renderAll();
};

// ── RANK MILESTONES ───────────────────────────────────────────────
const MILESTONE_Q=[];
function checkRankMilestones(G){
  // In MP, host runs this for ALL player stations and tags milestones with _mpOwner.
  // _prevRank is updated for every station regardless of owner.
  // MILESTONE_Q only receives milestones belonging to the local player.
  const allComm=[...G.stations].filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic).sort((a,b)=>b.rat.share-a.rat.share);
  G.ps.forEach(s=>{
    const prev=s._prevRank||null;
    const cur=allComm.findIndex(st=>st.id===s.id)+1;
    if(!cur)return;
    // Always update _prevRank so the next period has a valid baseline
    if(prev===null){s._prevRank=cur;return;}
    const gained=cur<prev,lost=cur>prev;
    const sh=pct(s.rat.share);
    const isMyStation = MP.mode!=='live' || s._mpOwner===MP.playerId;
    let m=null;
    if(cur===1&&prev>1)
      m={type:'gain',title:'NUMBER ONE',body:'<strong>'+s.callLetters+'</strong> is now the #1 station in the market — '+sh+' total share.',owner:s._mpOwner};
    else if(cur>1&&prev===1)
      m={type:'loss',title:'LOST #1',body:'<strong>'+s.callLetters+'</strong> has fallen from the top spot. Now #'+cur+' at '+sh+'.',owner:s._mpOwner};
    else if(gained&&cur<=5&&prev>5)
      m={type:'gain',title:'TOP 5',body:'<strong>'+s.callLetters+'</strong> breaks into the top 5 — now ranked #'+cur+' with '+sh+'.',owner:s._mpOwner};
    else if(lost&&cur>5&&prev<=5)
      m={type:'loss',title:'OUT OF TOP 5',body:'<strong>'+s.callLetters+'</strong> slips out of the top 5, now ranked #'+cur+'.',owner:s._mpOwner};
    else if(gained&&cur<=10&&prev>10)
      m={type:'gain',title:'TOP 10',body:'<strong>'+s.callLetters+'</strong> is now a top-10 station at rank #'+cur+'.',owner:s._mpOwner};
    else if(lost&&cur>10&&prev<=10)
      m={type:'loss',title:'OUT OF TOP 10',body:'<strong>'+s.callLetters+'</strong> has dropped out of the top 10, now ranked #'+cur+'.',owner:s._mpOwner};
    if(m&&isMyStation) MILESTONE_Q.push(m);
    s._prevRank=cur;
  });
}
function flushMilestones(){
  if(!MILESTONE_Q.length)return;
  const m=MILESTONE_Q.shift();
  const isGain=m.type==='gain';
  const col=isGain?'var(--grn)':'var(--red)';
  const bg=isGain?'rgba(82,227,110,.10)':'rgba(240,88,88,.10)';
  const icon=isGain?'📈':'📉';
  document.getElementById('milestoneb').innerHTML=
    '<div class="mh" style="background:'+bg+';border-bottom:1px solid '+col+'">'+
    '<span style="color:'+col+';letter-spacing:2px">'+icon+' '+m.title+'</span></div>'+
    '<div style="padding:20px 16px">'+
    '<p class="di">'+m.body+'</p>'+
    '<p style="font-size:15px;color:var(--mut);margin:10px 0">'+G.year+' · Period '+G.period+'</p>'+
    '<button class="cfm" onclick="cm(\'m-milestone\');setTimeout(flushMilestones,300)">'+(MILESTONE_Q.length?'NEXT →':'CLOSE')+'</button>'+
    '</div>';
  om('m-milestone');
}

// ── SALES FORCE ───────────────────────────────────────────────────
function openSales(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const cur=s.salesForce?.level||0;
  const allComm=[...G.stations].filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic).sort((a,b)=>b.rat.share-a.rat.share);
  const rank=allComm.findIndex(st=>st.id===s.id)+1;
  const rows=SF_LEVELS.map(sf=>{
    const isCur=sf.id===cur;
    const estRevGain=sf.id>cur?Math.round(s.fin.rev*(sf.sellBonus-(SF_LEVELS[cur].sellBonus||0))*0.6):0;
    const netPeriod=Math.round(estRevGain-(sf.cost-(SF_LEVELS[cur].cost||0))/2);
    const nc=netPeriod>0?'var(--grn)':netPeriod<0?'var(--red)':'var(--mut)';
    const oc=isCur?'':'onclick="doSales(\''+sid+'\','+sf.id+')"';
    const ch=sf.cost>0?'<span class="sf-cost">'+f$(sf.cost/2)+'/period</span>':'<span class="sf-cost" style="color:var(--mut)">free</span>';
    const gh=sf.id>cur?'<div class="sf-gain">Est. lift: <strong style="color:var(--grn)">+'+f$(estRevGain)+'</strong> · Net: <strong style="color:'+nc+'">'+(netPeriod>=0?'+':'')+f$(netPeriod)+'</strong>/period</div>':'';
    return '<div class="sf-row'+(isCur?' sf-cur':'')+'" '+oc+'>'+'<div class="sf-top"><span class="sf-l">'+sf.l+'</span>'+(isCur?'<span class="sf-badge">CURRENT</span>':'')+ch+'</div>'+'<div class="sf-desc">'+sf.desc+'</div>'+gh+'</div>';
  }).join('');
  // Cluster demo breadth note for the sales modal
  const _sDemoBand = f => {
    const yFmts=['TOP40','CHR','ALT_ROCK','RHYTHMIC','HOT_AC','URBAN_CONTEMP'];
    const oFmts=['NEWS_TALK','SPORTS_TALK','BEAUTIFUL_MUSIC','ADULT_STANDARDS','GOSPEL','PODCAST_TALK'];
    return yFmts.includes(f)?'Youth (12–34)':oFmts.includes(f)?'Older (35+)':'Mid (25–54)';
  };
  const _clusterStns = myPS();
  const _bandMap = {};
  _clusterStns.forEach(st => { const b=_sDemoBand(st.format); if(!_bandMap[b])_bandMap[b]=[]; _bandMap[b].push(st.callLetters); });
  const _bandCount = Object.keys(_bandMap).length;
  const _breadthEra = G.year >= 1996 ? 1.0 : G.year >= 1990 ? Math.min(1,(G.year-1990)/6) : 0;
  const _breadthBonus = _bandCount>=3?0.08:_bandCount===2?0.04:0;
  const _breadthActive = _breadthBonus > 0 && _breadthEra > 0 && G.year >= 1990;
  const _breadthNote = _breadthActive
    ? `<div class="ibox" style="border-color:var(--grn);margin-bottom:8px"><strong style="color:var(--grn)">◆ CLUSTER DEMO COVERAGE: +${Math.round(_breadthBonus*_breadthEra*100)}% SELLOUT BONUS</strong><br><span style="font-size:14px;color:var(--off)">Your cluster spans ${_bandCount} demo bands — ${Object.entries(_bandMap).map(([b,cs])=>cs.join('/')+' covers '+b).join(', ')}. Agencies pay a premium for one-stop demographic reach.</span></div>`
    : _bandCount < 2 && G.year >= 1990
      ? `<div class="ibox" style="font-size:14px;color:var(--mut)">Add stations covering different age demos to unlock cluster sellout bonuses — agencies pay a premium when you can reach Youth, Mid, and Older demos across one buy.</div>`
      : '';
  document.getElementById('salesb').innerHTML=
    '<p class="di"><strong>'+s.callLetters+'</strong> · Rank #'+rank+' of '+allComm.length+' · '+Math.round(s.ops.sell*100)+'% sellout</p>'+
    _breadthNote+
    '<div class="ms2"><div class="msh">SALES TEAM</div>'+rows+'</div>'+
    '<div class="ibox" style="font-size:15px">Changes take effect next period.</div>'+
    '<button class="cnl" onclick="cm(\'m-sales\')">CLOSE</button>';
  om('m-sales');
}
function doSales(sid,level){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const prev=s.salesForce?.level||0;
  s.salesForce={level,periodsHeld:0};
  const sf=SF_LEVELS[level];
  G.news.unshift({v:'LOW',t:'Sales team at '+s.callLetters+' updated to: '+sf.l+'. Sellout ceiling '+(level>prev?'raised':'lowered')+' next period.',y:G.year,p:G.period});
  MP.action('sales',{sid,level});
  cm('m-sales');renderAll();
}

function advTurn(){
  if(!G)return;
  const btn=document.getElementById('abtn');
  btn.disabled=true;btn.textContent='⟳ PROCESSING...';
  setTimeout(()=>{
    try{
      processAtlanta1970DeferredLaunches(G);
      const ev=[...chkEv(G),...applyDriftInflections(G),...pledgeDriveCheck(G),...runConsolidation(G),...runMarketAttrition(G)];
    corporateDecay(G);
    runCorpLMAOffers(G);
    talentEvents(G);
    const troubleActs=triggerTalentTrouble(G);
    troubleActs.forEach(a=>G.news.unshift({...a,y:G.year,p:G.period}));
    rivalReformat(G);
    recalc(G.stations,G);
    // Snapshot ranks BEFORE checkRankMilestones updates _prevRank,
    // so the MP broadcast block can build per-player milestones accurately.
    const _rankSnap={};
    if(MP.mode==='live'){
      const _allComm2=[...G.stations].filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic).sort((a,b)=>b.rat.share-a.rat.share);
      G.ps.forEach(s=>{ _rankSnap[s.id]={prev:s._prevRank||null, cur:_allComm2.findIndex(st=>st.id===s.id)+1}; });
    }
    checkRankMilestones(G);
    const acts=runAI(G);
    seedRev(G.stations,G);
    processLMAFees(G);
    // MP: credit each player's cash independently from their own stations
    if (MP.mode === 'live') {
      if (!G._playerCash) G._playerCash = {};
      const allOwners = [...new Set(G.ps.map(s => s._mpOwner).filter(id => id !== undefined))];
      allOwners.forEach(pid => {
        const pProfit = G.ps.filter(s => s._mpOwner === pid).reduce((s,st) => s + st.fin.ebitda, 0);
        G._playerCash[pid] = (G._playerCash[pid] || 0) + pProfit;
      });
      G.cash = G._playerCash[MP.playerId] || 0;
    }
    const profit = myPS().reduce((s,st) => s + st.fin.ebitda, 0);
    if (MP.mode !== 'live') G.cash += profit;
    // Score tracking
    // UNDERDOG VP: apply once at game start (first period only)
    if(MP.mode==='live'&&G._underdogVP&&!G._underdogVPApplied){
      const myUnderdogBonus=G._underdogVP[MP.playerId]||0;
      if(myUnderdogBonus>0){
        G.score.vp=(G.score.vp||0)+myUnderdogBonus;
        G.news.unshift({v:'HIGH',t:`🏆 Underdog bonus: +${myUnderdogBonus} VP for taking on a difficult starting position.`,y:G.year,p:G.period,iy:true});
        G._underdogVPApplied=true;
      }
    }
    if(!G.score.isSandbox){
      const bestShare=Math.max(0,...myPS().map(s=>s.rat.share));
      G.score.shareHistory.push(bestShare);
      const totalRev=myPS().reduce((s,st)=>s+st.fin.rev,0);
      if(totalRev>G.score.peakRevenue)G.score.peakRevenue=totalRev;
    }
    // MP: track score per player so end-game comparison works (host tracks ALL players)
    if(MP.mode==='live'){
      if(!G._playerScore)G._playerScore={};
      const _allOwners=[...new Set(G.ps.map(s=>s._mpOwner).filter(id=>id!==undefined))];
      _allOwners.forEach(pid=>{
        if(!G._playerScore[pid])G._playerScore[pid]={shareHistory:[],peakRevenue:0,cash:0};
        const _ps=G._playerScore[pid];
        const _pStns=G.ps.filter(s=>s._mpOwner===pid);
        const _pBestShare=Math.max(0,..._pStns.map(s=>s.rat.share));
        _ps.shareHistory.push(_pBestShare);
        const _pRev=_pStns.reduce((s,st)=>s+st.fin.rev,0);
        if(_pRev>_ps.peakRevenue)_ps.peakRevenue=_pRev;
        _ps.cash=G._playerCash[pid]||0;
      });
    }
    // Ranker snapshot
    const snap={year:G.year,period:G.period,label:`${G.year} ${PERIODS[G.period-1]}`,shares:{}};
    G.stations.forEach(s=>{ if(!s||s._bpSlotDeferred||!s.id)return; snap.shares[s.id]=s.rat.share; });
    G.rankerHistory.push(snap);
    acts.forEach(a=>G.news.unshift({...a,y:G.year,p:G.period}));
    ev.forEach(e=>G.news.unshift({v:'HIGH',t:`📡 ${e.t}: ${e.d}`,y:e.y,p:e.p}));
    // Seasonal market note — brief context at the top of the feed each period
    const nextPeriodName=G.period===2?'FALL':'SPRING'; // period hasn't advanced yet
    const nextIsElection=G.period===2&&G.year%2===0;
    const seasonNote=G.period===2
      ?`📈 Fall ad market: peak season. Revenue runs ~12% above annual average.${nextIsElection?' Political buys boosting News/Talk and Sports.':''}`
      :`📉 Spring ad market: lean season. Revenue runs ~12% below annual average. Plan cash flow accordingly.`;
    G.news.unshift({v:'LOW',t:seasonNote,y:G.year,p:G.period});
    if(G.news.length>50)G.news=G.news.slice(0,50);
    applyLoanInterest();
    // Ad market recovery: recessions cause permanent hits in the current model,
    // but real markets recover. Drift adx back toward baseline at 2.5%/period.
    // This means a -0.10 shock fully recovers in ~4 periods (2 years) — realistic.
    // Baseline is 1.0 + Atlanta bonus (0.02). Never recovers past 1.15 (secular ceiling).
    const adxBaseline=(MARKETS[G.marketId||'atlanta']?.adxBonus||0)+1.0;
    G.adx=Math.min(1.15, G.adx+(adxBaseline-G.adx)*0.025);
    G.ps.forEach(s=>{
      // Spot load above format norm hurts talent morale
      const fmtNorm=FM[s.format]?.sp||14;
      if(s.ops.spots>fmtNorm*1.15){
        const overload=(s.ops.spots/fmtNorm)-1.15;
        Object.values(s.prog).forEach(sd=>{
          if(sd?.talent)sd.talent.morale=Math.max(20,sd.talent.morale-Math.round(overload*10));
        });
      }
    });
    G.stations.forEach(s=>decay(s,G.year,G.period));
    updateSuperstars(G);
    const alerts=checkPressure(G);
    // Advance clock before showSum so wasYear/wasPeriod are available to pass in
    const wasYear=G.year,wasPeriod=G.period;
    recordCompanyFinHistory(G, wasYear, wasPeriod, profit);
    recordStationFinHistory(G, wasYear, wasPeriod);
    showSum(profit,ev,acts,alerts,wasYear,wasPeriod);
    if(G.period===1){G.period=2;}else{G.period=1;G.year++;}
    G.turn=(G.turn||0)+1;
    // BP-slot entrants scheduled for the new calendar period appear as soon as the clock advances
    // (start-of-turn processing still runs for launches tied to the period being simulated).
    processAtlanta1970DeferredLaunches(G);
    // Keep G.fmp in sync with smoothstep curve (used by UI display and legacy references)
    G.fmp=fmpForYear(G.year);
    // Decade grade at end of fall of decade-end year
    const startYr=G.sc.startYear||1970;
    const decadeEnd=[1979,1989,1999,2009,2019,2020].filter(y=>y>startYr);
    if(decadeEnd.includes(wasYear)&&wasPeriod===2){
      const sc=scoreCalc(G);
      G.score.decadeScores[wasYear]=sc;
      // MP: store per-player decade score for ALL players (host is authoritative)
      if(MP.mode==='live'){
        if(!G._playerScore)G._playerScore={};
        const _dcOwners=[...new Set(G.ps.map(s=>s._mpOwner).filter(id=>id!==undefined))];
        _dcOwners.forEach(pid=>{
          if(!G._playerScore[pid])G._playerScore[pid]={shareHistory:[],peakRevenue:0,cash:0};
          if(!G._playerScore[pid].decadeScores)G._playerScore[pid].decadeScores={};
          const _pidSc=playerScoreCalc(pid);
          G._playerScore[pid].decadeScores[wasYear]=_pidSc;
          G._playerScore[pid].totalVP=Object.values(G._playerScore[pid].decadeScores).reduce((s,d)=>s+(d.vp||0),0);
        });
      }
      if(wasYear===2020){G.score.isSandbox=true;}
      // In MP each client shows their own score, not the host's shared scoreCalc
      const _gradeScForDisplay = (MP.mode==='live') ? playerScoreCalc(MP.playerId) : sc;
      setTimeout(()=>showGrade(wasYear,_gradeScForDisplay),1400);
    }
    autoSave();
    renderAll();
    // MP: if host, broadcast new state to all clients
    if (MP.mode === 'live' && MP.isHost) {
      const _dcYear = decadeEnd.includes(wasYear) && wasPeriod===2 ? wasYear : null;
      // Build per-player milestones from the pre-checkRankMilestones snapshot
      const _allMs = [];
      G.ps.forEach(s=>{
        const snap=_rankSnap[s.id]; if(!snap||snap.prev===null||!snap.cur) return;
        const prev=snap.prev, cur=snap.cur;
        const gained=cur<prev, lost=cur>prev;
        const sh=pct(s.rat.share);
        const owner=MP.players?.find(p=>p.playerId===s._mpOwner)?.name||'';
        const pfx=owner?`${owner}'s `:'';
        const op=simulcastOperationalSource(s);
        let m=null;
        if(cur===1&&prev>1) m={type:'gain',title:'NUMBER ONE',body:`<strong>${s.callLetters}</strong> (${pfx}${FM[op.format]?.l||op.format}) is now #1 in the market — ${sh} share.`,owner:s._mpOwner};
        else if(cur>1&&prev===1) m={type:'loss',title:'LOST #1',body:`<strong>${s.callLetters}</strong> (${pfx}${FM[op.format]?.l||op.format}) has fallen from #1. Now #${cur} at ${sh}.`,owner:s._mpOwner};
        else if(gained&&cur<=5&&prev>5) m={type:'gain',title:'TOP 5',body:`<strong>${s.callLetters}</strong> (${pfx}${FM[op.format]?.l||op.format}) breaks into the top 5 — ranked #${cur} with ${sh}.`,owner:s._mpOwner};
        else if(lost&&cur>5&&prev<=5) m={type:'loss',title:'OUT OF TOP 5',body:`<strong>${s.callLetters}</strong> (${pfx}${FM[op.format]?.l||op.format}) slips out of the top 5.`,owner:s._mpOwner};
        else if(gained&&cur<=10&&prev>10) m={type:'gain',title:'TOP 10',body:`<strong>${s.callLetters}</strong> (${pfx}${FM[op.format]?.l||op.format}) enters the top 10 at #${cur}.`,owner:s._mpOwner};
        else if(lost&&cur>10&&prev<=10) m={type:'loss',title:'OUT OF TOP 10',body:`<strong>${s.callLetters}</strong> (${pfx}${FM[op.format]?.l||op.format}) has dropped out of the top 10.`,owner:s._mpOwner};
        if(m) _allMs.push(m);
      });
      mpBroadcastState(_dcYear, { profit, ev, acts, alerts, wasYear, wasPeriod, milestones:_allMs });
      MP.renderStatus();
    } else {
      btn.disabled=false;btn.textContent='▶ NEXT PERIOD';
    }
    if(MILESTONE_Q.length)setTimeout(flushMilestones,900);
    }catch(err){
      console.error('advTurn error:',err);
      btn.disabled=false;btn.textContent='▶ NEXT PERIOD';
    }
  },450);
}

// ── MP END-GAME COMPARISON ───────────────────────────────────────
function mpEndGameHTML(){
  if(MP.mode!=='live'||!G._playerScore)return '';
  const allPids=[...new Set(G.ps.map(s=>s._mpOwner).filter(id=>id!==undefined))];
  if(allPids.length<2)return '';

  // Build result rows per player
  const rows=allPids.map(pid=>{
    const pName=MP.players.find(p=>p.playerId===pid)?.name||`Player ${pid+1}`;
    const pColor=['#f5a623','#60a5fa','#34d399','#f87171'][pid%4];
    const ps=G._playerScore[pid]||{};
    const totalVP=ps.totalVP||Object.values(ps.decadeScores||{}).reduce((s,d)=>s+(d.vp||0),0)||0;
    const latestSc=Object.values(ps.decadeScores||{}).slice(-1)[0]||{};
    const cash=G._playerCash?.[pid]||0;
    const isMe=pid===MP.playerId;
    return {pid,pName,pColor,totalVP,score:latestSc.total||0,cash,isMe};
  }).sort((a,b)=>b.totalVP-a.totalVP||(b.score-a.score)||(b.cash-a.cash));

  const winner=rows[0];
  const iWon=winner.pid===MP.playerId;

  const rowsHTML=rows.map((r,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--brdr)">
      <div style="font-size:20px;font-family:var(--fd);color:${i===0?'var(--amb)':'var(--mut)'};width:24px">${i===0?'🏆':`#${i+1}`}</div>
      <div style="flex:1">
        <div style="color:${r.pColor};font-family:var(--ft);font-size:14px;letter-spacing:.08em">${r.pName.toUpperCase()}${r.isMe?' <span style="color:var(--mut)">(YOU)</span>':''}</div>
        <div style="color:var(--mut);font-size:14px;margin-top:2px">${r.score}/100 · ${f$(r.cash)} cash</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-family:var(--fd);color:${i===0?'var(--amb)':'var(--off)'}">${r.totalVP}</div>
        <div style="font-size:15px;color:var(--mut);font-family:var(--ft)">VP</div>
      </div>
    </div>`).join('');

  return `<div class="ms2" style="border:2px solid ${iWon?'var(--grn)':'var(--red)'};margin-top:12px">
    <div class="msh" style="color:${iWon?'var(--grn)':'var(--red)'}">
      ${iWon?'🏆 VICTORY — YOU WIN!':'DEFEAT — BETTER LUCK NEXT TIME'}
    </div>
    <div style="color:var(--mut);font-size:15px;margin-bottom:8px">
      ${iWon?`Congratulations — you outplayed ${winner.pid!==MP.playerId?rows.find(r=>r.pid!==MP.playerId)?.pName:'your opponent'} over 50 years of Atlanta radio.`
            :`${winner.pName} dominated the Atlanta market. Strong performance, but they edged you out.`}
    </div>
    ${rowsHTML}
    <div style="font-size:15px;color:var(--mut);margin-top:8px;font-family:var(--ft)">TIEBREAKER: VP → SCORE → CASH ON HAND</div>
  </div>`;
}

// ── DECADE GRADE ─────────────────────────────────────────────────
function showGrade(decadeYear,sc){
  const grade=gradeFromScore(sc.total);
  const isFinal=decadeYear===2020;
  const startYr=G.sc.startYear||1970;
  const title=pick(GRADE_TITLES[grade]||GRADE_TITLES.C);
  document.getElementById('gradet').textContent=isFinal?`FINAL SCORE — ${startYr}–2020`:`${DECADE_NAMES[decadeYear]||decadeYear} — REPORT CARD`;
  document.getElementById('gradeb').innerHTML=`
    <div class="grade-hero">
      <div class="grade-letter ${grade}">${grade}</div>
      <div class="grade-title">${title.toUpperCase()}</div>
      <div class="grade-sub">${DECADE_NAMES[decadeYear]||decadeYear} complete. Score: ${sc.total}/100</div>
    </div>
    <div class="score-bars">
      <div class="score-bar-row"><span class="score-bar-lbl">MARKET SHARE</span><div class="score-bar-bg"><div class="score-bar-fill" style="width:${sc.shareScore}%"></div></div><span class="score-bar-val">${sc.shareScore}</span></div>
      <div class="score-bar-row"><span class="score-bar-lbl">CASH GROWTH</span><div class="score-bar-bg"><div class="score-bar-fill" style="width:${sc.cashScore}%"></div></div><span class="score-bar-val">${sc.cashScore}</span></div>
      <div class="score-bar-row"><span class="score-bar-lbl">PEAK REVENUE</span><div class="score-bar-bg"><div class="score-bar-fill" style="width:${sc.peakScore}%"></div></div><span class="score-bar-val">${sc.peakScore}</span></div>
      ${sc.streamScore>0?`<div class="score-bar-row"><span class="score-bar-lbl">STREAMING</span><div class="score-bar-bg"><div class="score-bar-fill stream" style="width:${sc.streamScore}%"></div></div><span class="score-bar-val">${sc.streamScore}</span></div>`:''}
      ${sc.identityScore>0?`<div class="score-bar-row"><span class="score-bar-lbl">COMMUNITY</span><div class="score-bar-bg"><div class="score-bar-fill" style="width:${sc.identityScore}%;background:var(--grn)"></div></div><span class="score-bar-val">${sc.identityScore}</span></div>`:''}
    </div>
    <div class="ms2"><div class="msh">BREAKDOWN</div>
      <div class="sr"><span class="lb">Avg Best Station Share</span><span class="vl amb">${pct(sc.shareAvg)}</span></div>
      <div class="sr"><span class="lb">Peak Period Revenue</span><span class="vl amb">${f$(sc.peakRevenue||G.score.peakRevenue)}</span></div>
      <div class="sr"><span class="lb">Cash on Hand</span><span class="vl ${(MP.mode==='live'?G._playerCash?.[MP.playerId]:G.cash)||G.cash >= G.sc.cash?'pos':'neg'}">${f$((MP.mode==='live'&&G._playerCash?.[MP.playerId])||G.cash)}</span></div>
      ${sc.debtPenalty>0?`<div class="sr"><span class="lb" style="color:var(--red)">Outstanding Loan Penalty</span><span class="vl neg">−${sc.debtPenalty} pts</span></div>`:''}
      ${sc.streamScore>0?`<div class="sr"><span class="lb">Streaming Score</span><span class="vl ${sc.streamScore>=60?'pos':'neg'}">${sc.streamScore}/100</span></div>`:''}
    </div>
    <div class="ms2" style="border:2px solid var(--amb);margin-top:12px">
      <div class="msh" style="color:var(--amb)">VICTORY POINTS — ${DECADE_NAMES[decadeYear]||decadeYear}</div>
      <div class="sr"><span class="lb" style="font-size:16px">Points This Decade</span><span class="vl amb" style="font-size:22px;font-family:var(--fd)">${sc.vp} / ${sc.maxVP} VP</span></div>
      <div class="sr"><span class="lb">Cumulative Total</span><span class="vl" style="font-size:16px">${(MP.mode==='live'?Object.values(G._playerScore?.[MP.playerId]?.decadeScores||{}).reduce((s,d)=>s+(d.vp||0),0):Object.values(G.score.decadeScores).reduce((s,d)=>s+(d.vp||0),0))} VP</span></div>
    </div>
    ${isFinal?`<div class="sandbox-cta"><strong>SANDBOX MODE UNLOCKED.</strong> Score locked: ${startYr}–2020 campaign complete. Keep playing into the 2020s and beyond.</div>`:`<div class="sandbox-cta"><strong>KEEP GOING.</strong> Score builds through ${decadeYear+1}. Each decade gets its own grade.</div>`}
    ${isFinal&&MP.mode==='live'?mpEndGameHTML():''}
    <button class="cfm" onclick="cm('m-grade')">${isFinal?'CONTINUE INTO SANDBOX →':'CONTINUE TO '+(decadeYear+1)+' →'}</button>
    ${isFinal?`<button class="cnl" style="width:100%;margin-top:8px" onclick="cm('m-grade');openScenSelect(null)">🎮 PLAY AGAIN — NEW SCENARIO</button>`:''}`;
  om('m-grade');
}

// ── RANKER ────────────────────────────────────────────────────────
function openRanker(){
  const h=G.rankerHistory;
  if(!h.length){document.getElementById('rkwrap').innerHTML='<p class="di" style="padding:20px">No history yet. Advance at least one period.</p>';return;}
  const rowObjs=buildSimulcastCombinedRankRows(G.stations);
  // Column headers — show last 20 periods max
  const cols=h; // full history — wrapper scrolls horizontally
  const thd=cols.map((c,i)=>`<th style="min-width:54px;text-align:center${i===cols.length-1?';color:var(--amb)':''}"><span style="font-size:15px">${c.year}</span><br><span style="font-size:15px;color:var(--mut)">${c.label.split(' ')[1]||''}</span></th>`).join('');
  const rows=rowObjs.map(row=>{
    const s=row.pair?row.lead:row.st;
    const isP=row.pair?(mpIsMe(row.lead)||mpIsMe(row.rcv)):mpIsMe(s);
    const entry=row.pair?row.lead.entryTurn:s.entryTurn;
    const cells=cols.map(c=>{
      if(entry){
        const entryIdx=h.findIndex(hh=>hh.year===entry.year&&hh.period===entry.period);
        const colIdx=h.indexOf(c);
        if(colIdx<entryIdx)return '<td class="stc" style="position:static"></td>';
      }
      const v=row.pair?(c.shares[row.lead.id]||0)+(c.shares[row.rcv.id]||0):(c.shares[s.id]||0);
      if(!v)return '<td>—</td>';
      const pv=(v*100).toFixed(1);
      const cls=v>=.08?'rcv hi':v>=.02?'rcv':v<.005?'rcv lo':'rcv';
      return `<td><span class="${cls}">${pv}</span></td>`;
    }).join('');
    const pubBadge=s.isPublic?'<span style="font-size:13px;background:#1e3a5f;color:#7dd3fc;padding:1px 5px;border-radius:2px;margin-left:4px;font-family:var(--ft)">NPR</span>':'';
    const corpBadge=s.corpOwner&&!s.isPlayer?`<span style="font-size:13px;background:${s.corpColor||'#374151'};color:#fff;padding:1px 5px;border-radius:2px;font-family:var(--ft)">${(s.corpName||'CORP').split(' ')[0]}</span>`:'';
    const intelAttr=!s.isPublic?` onclick="showCompIntel('${s.id}')" style="cursor:pointer" title="${isP?'Open station intel':'View competitor intel'}"`:'';
    const simB=row.pair?'<span style="color:var(--blu);font-size:14px"> ◈</span>':(s.simulcastWith?'<span style="color:var(--blu);font-size:14px"> ◈</span>':'');
    const op=simulcastOperationalSource(s);
    const fmtLbl=FM[op.format]?.l||op.format;
    const callLine=row.pair?`${callDisplay(row.lead)} + ${callDisplay(row.rcv)}`:callDisplay(s);
    const freqLine=row.pair?`${row.lead.freq} + ${row.rcv.freq}`:s.freq;
    const lineColor=row.pair?row.lead.color:s.color;
    const oneLine=`<span style="display:inline-flex;align-items:center;flex-wrap:nowrap;white-space:nowrap;gap:6px;min-width:0"><span class="rc" style="color:${lineColor};font-family:var(--fd);flex-shrink:0">${callLine}</span>${simB}${pubBadge}${corpBadge}<span style="color:var(--mut);flex-shrink:0">·</span><span style="color:var(--off);flex-shrink:0">${fmtLbl}</span><span style="color:var(--mut);flex-shrink:0">·</span><span style="color:var(--wht);flex-shrink:0">${freqLine}</span></span>`;
    const rkCls=`${isP?'rky':s.isPlayer?'rkp2':s.isPublic?'rkp':''}`;
    return `<tr class="${rkCls}">
      <td class="stc"${intelAttr}><div style="overflow:hidden;text-overflow:ellipsis;max-width:min(480px,55vw)">${oneLine}</div></td>
      ${cells}
    </tr>`;
  }).join('');
  const wrap=document.getElementById('rkwrap');
  wrap.innerHTML=`<table class="rkt"><thead><tr><th class="sth">STATION · FORMAT · FREQ</th>${thd}</tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--bdr)">
      <div style="font-family:var(--ft);font-size:14px;color:var(--mut);letter-spacing:2px;margin-bottom:10px">MARKET TALENT <span style="font-size:12px;color:var(--mut);font-weight:400">(quality · all stations)</span></div>
      <div style="max-height:min(38vh,320px);overflow-y:auto;padding-right:4px">${htmlMarketTalentRankerList()}</div>
    </div>`;
  // Legend: color key
  const legEl=document.getElementById('rk-legend');
  if(legEl) legEl.innerHTML=`
    <span><span class="dot" style="background:var(--amb)"></span> Your stations</span>
    <span><span class="dot" style="background:#9ca3af"></span> Competitors</span>
    <span><span class="dot" style="background:#7dd3fc"></span> Public radio</span>
    <span style="margin-left:8px;padding-left:8px;border-left:1px solid var(--bdr)">Share numbers: 
      <span style="color:var(--amb);font-weight:bold">bold amber</span> = 8%+ share &nbsp;·&nbsp;
      <span style="color:var(--wht)">white</span> = 2–8% &nbsp;·&nbsp;
      <span style="color:rgba(136,136,136,.5)">faded</span> = under 0.5%
    </span>`;
  // Scroll to most recent (rightmost) column
  setTimeout(()=>{wrap.scrollLeft=wrap.scrollWidth;},60);
}

// ── COMPETITOR INTEL ──────────────────────────────────────────────
function showCompIntel(sid){
  const s=G.stations.find(st=>st.id===sid);
  if(!s)return;
  const op=simulcastOperationalSource(s);
  const fmd=FM[op.format]||{};
  const pr=s.cp;
  const isOwn=s.isPlayer&&mpIsMe(s);

  // Revenue: fuzzy for competitors; exact books for your own station
  const estRev=isOwn?(s.fin?.rev||0):(s.fin?.rev||0)*(0.85+Math.random()*0.30);
  const trend=!pr?'—':pr.col?'⬇⬇ COLLAPSING':pr.under?'⬇ DECLINING':pr.sur?'⬆ SURGING':'→ STABLE';
  const trendColor=!pr?'var(--mut)':pr.col?'var(--red)':pr.under?'var(--amb)':pr.sur?'var(--grn)':'var(--off)';

  // Format strategy: show drift direction if driftable, else "holding position"
  const dr=getDrift(op);
  let strategyLine='';
  if(dr&&dr.cfg){
    const val=dr.val||0;
    const poleAName=dr.cfg.poleA?.name||'Conservative';
    const poleBName=dr.cfg.poleB?.name||'Aggressive';
    const abs=Math.abs(val);
    if(abs<15){
      strategyLine=`<span style="color:var(--off)">Holding center — no strong lean</span>`;
    } else {
      const pole=val>50?poleBName:poleAName;
      const strength=abs>=75?'strongly leaning':abs>=50?'leaning':'slightly leaning';
      strategyLine=`<span style="color:var(--amb)">${strength} toward <strong>${pole}</strong></span>`;
    }
  } else {
    strategyLine=`<span style="color:var(--mut)">Standard format — no strategic positioning</span>`;
  }

  // Top demographic
  const topCoh=COH.reduce((best,c)=>{
    const sh=s.rat.cur[c]?.share||0;
    return sh>(s.rat.cur[best]?.share||0)?c:best;
  },COH[0]);
  const cohLabels={'12-17':'Teens (12–17)','18-24':'Young Adults (18–24)','25-34':'Adults 25–34','35-49':'Adults 35–49','50-64':'Adults 50–64','65+':'Seniors 65+'};

  // Competition: who's competing for same listeners
  const competitors=(FMT_COMPETITION[op.format]||[]);
  const sameFormat=G.stations.filter(o=>o.id!==sid&&competitors.includes(o.format));
  const compText=sameFormat.length
    ?sameFormat.map(o=>`<span style="color:${o.isPlayer?'var(--amb)':'var(--mut)'}">${o.callLetters}</span>`).join(', ')
    :'None in direct competition';

  // Quality indicators — fuzzy/rounded
  const qLevel=op.oq>=80?'Excellent':op.oq>=65?'Good':op.oq>=45?'Average':op.oq>=30?'Below Average':'Weak';
  const qColor=op.oq>=80?'var(--grn)':op.oq>=65?'var(--grn)':op.oq>=45?'var(--amb)':'var(--red)';

  const corpLine=s.corpOwner
    ?`<div class="sr"><span class="lb">Ownership</span><span class="vl" style="color:${s.corpColor||'#9ca3af'}">${s.corpName||'Corporate'}</span></div>`
    :`<div class="sr"><span class="lb">Ownership</span><span class="vl" style="color:var(--mut)">Independent</span></div>`;

  document.getElementById('ci-title').textContent=`${s.callLetters} — ${isOwn?'STATION INTEL':'COMPETITOR INTEL'}`;
  document.getElementById('ci-body').innerHTML=`
    <div class="ibox" style="margin-bottom:14px">
      ${isOwn
        ?`<strong style="color:var(--grn)">Your station</strong> — Revenue and share below are from your books and ratings (no masking).`
        :`<strong style="color:var(--amb)">⚠ Trade Publication Estimates</strong> — Revenue figures are approximate. Share data is from Arbitron ratings.`}
    </div>
    <div class="ms2">
      <div class="msh">STATION PROFILE</div>
      <div class="sr"><span class="lb">Format</span><span class="vl">${fmd.l||op.format}</span></div>
      <div class="sr"><span class="lb">Signal</span><span class="vl">${s.sig.type} ${s.sig.pw} · ${s.sig.freq}</span></div>
      ${corpLine}
      <div class="sr"><span class="lb">On-Air Quality</span><span class="vl" style="color:${qColor}">${qLevel}</span></div>
    </div>
    <div class="ms2" style="margin-top:12px">
      <div class="msh">RATINGS & REVENUE</div>
      <div class="sr"><span class="lb">Overall Share</span><span class="vl amb">${pct(s.rat.share)}</span></div>
      <div class="sr"><span class="lb">AQH Listeners</span><span class="vl">${s.rat.aqh.toLocaleString()}</span></div>
      <div class="sr"><span class="lb">Trend</span><span class="vl" style="color:${trendColor}">${trend}</span></div>
      <div class="sr"><span class="lb">${isOwn?'Revenue / Period':'Est. Revenue / Period'}</span><span class="vl">${f$(isOwn?Math.round((s.fin?.rev||0)/50000)*50000:Math.round(estRev/50000)*50000)}</span></div>
      <div class="sr"><span class="lb">Core Demographic</span><span class="vl">${cohLabels[topCoh]||topCoh}</span></div>
    </div>
    <div class="ms2" style="margin-top:12px">
      <div class="msh">FORMAT STRATEGY</div>
      <div class="sr"><span class="lb">Positioning</span><span class="vl">${strategyLine}</span></div>
      <div class="sr"><span class="lb">Direct Competition</span><span class="vl" style="font-size:14px">${compText}</span></div>
    </div>
    <div class="ms2" style="margin-top:12px">
      <div class="msh">COMPETITIVE POSTURE</div>
      <div class="sr"><span class="lb">Management Style</span><span class="vl">${s.pers?.l||'Unknown'}</span></div>
      <div class="sr"><span class="lb">Programming Investment</span><span class="vl" style="color:${(s.pers?.pi||0)>=0.07?'var(--grn)':(s.pers?.pi||0)>=0.04?'var(--amb)':'var(--mut)'}">
        ${(s.pers?.pi||0)>=0.07?'Heavy investor':((s.pers?.pi||0)>=0.04?'Moderate investment':'Minimal — coasting')}</span></div>
      <div class="sr"><span class="lb">Marketing Activity</span><span class="vl">${s.ops?.promo>20000?'Active campaigns':s.ops?.promo>5000?'Occasional':'Passive'}</span></div>
      <div class="sr"><span class="lb">Talent Retention</span><span class="vl">${(s.pers?.tr||0)>=0.75?'Locks in talent':((s.pers?.tr||0)>=0.55?'Standard contracts':'High turnover')}</span></div>
    </div>
    <div class="ms2" style="margin-top:12px">
      <div class="msh">ON-AIR TALENT ROSTER</div>
      ${htmlOnAirTalentRoster(s)}
    </div>
    ${(s._history||[]).length?`
    <div class="ms2" style="margin-top:12px">
      <div class="msh">STATION HISTORY <span style="color:var(--mut);font-size:13px;font-weight:400">(public record — format changes & milestones only)</span></div>
      ${renderHistoryRows(s._history||[], !isOwn)}
    </div>`:''}
  `;
  om('m-ci');
}

// ════════════════════════════════════════════════════════════════
// DECISIONS
// ════════════════════════════════════════════════════════════════
// 1. HIRE TALENT
/** Rivals with on-air talent in `slot` eligible for poach from hire modal (same rules as contract POACH section). */
function hireModalRivalPoachCandidates(sid, slot){
  const s=G.stations.find(st=>st.id===sid);
  if(!s)return[];
  const incumbent=s.prog[slot]?.talent;
  return G.stations.filter(st=>st&&!st._bpSlotDeferred&&!st.isPlayer&&!st.isPublic&&st.rat?.share>0.01&&st.id!==sid)
    .map(st=>({st, sd:st.prog[slot]}))
    .filter(({sd:rsd})=>rsd?.talent)
    .filter(({sd:rsd})=>{
      if(!incumbent)return true;
      return rsd.talent.quality>incumbent.quality*0.75;
    })
    .sort((a,b)=>b.sd.talent.quality-a.sd.talent.quality)
    .slice(0,5);
}
let HS={sid:null,slot:null,pool:[],sel:null,poachRivalId:null};
function openHire(sid){sid=ensureOpsSourceSid(sid);const s=G.stations.find(st=>st.id===sid);if(!s)return;HS={sid,slot:null,pool:[],sel:null,poachRivalId:null};rHire(s);om('m-tal');scrollModalContentToTop('m-tal');}
function rHire(s){
  const slots=['morningDrive','afternoonDrive','midday','evening','overnight'];
  const _simSrc=simulcastProgrammingSource(s);
  const sbtns=slots.map(sl=>{
    const sd=s.prog[sl];
    let tn=sd?.talent?.name;
    if(!tn&&_simSrc?.prog[sl]?.talent?.name){
      tn=`◈ ${_simSrc.prog[sl].talent.name} (${_simSrc.callLetters})`;
    }else if(!tn){
      tn=vacantLabel(s.format,sl);
    }
    const slotQ=Math.round(sd?.quality||0);
    const talQ=sd?.talent?.quality?Math.round(sd.talent.quality):null;
    const slotQlbl=`<span style="color:${slotQ>=70?'var(--grn)':slotQ>=45?'var(--amb)':'var(--red)'}"> ${slotQ}</span>`;
    const talQlbl=talQ!==null?`<span style="color:var(--mut);font-size:14px"> · quality ${talQ}</span>`:'';
    return `<button class="ssb${HS.slot===sl?' sel':''}" onclick="pickSlot('${s.id}','${sl}')"><span><strong>${SL[sl]}</strong><span style="font-size:14px;color:var(--mut);margin-left:6px">SLOT${slotQlbl}${talQlbl}</span></span><span class="cur">${tn}</span></button>`;
  }).join('');
  let ph='<p class="di" style="margin-top:12px">Select a daypart to see available talent.</p>';
  if(HS.slot){
    const s2=G.stations.find(st=>st.id===HS.sid);
    const cur=s2.prog[HS.slot]?.talent;
    const slotQcur=Math.round(s2.prog[HS.slot]?.quality||0);
    const poachList=hireModalRivalPoachCandidates(HS.sid,HS.slot);
    const freeRows=HS.pool.map((t,i)=>{const fit=Math.round((t.formatFit[s2.format]||.3)*100);const fl=fit>=75?'GREAT FIT':fit>=55?'DECENT FIT':'POOR FIT';const fc=fit>=75?'good':fit>=55?'warn':'poor';const q=Math.round(t.quality);const curSlotQ=Math.round(s2.prog[HS.slot]?.quality||0);const boost=Math.round((q/100)*fit*.35*35);const newSlotQ=Math.min(100,curSlotQ+boost);return `<div class="to${HS.sel===i&&!HS.poachRivalId?' sel':''}" onclick="pickTal(${i})"><div><div class="ton">${t.name}</div>${hireTalentCareerLine(t,G.year)}<div class="tos">${SL[t.slot]}</div><div class="tost"><div><span class="tosl">TALENT RATING</span><span class="tosv ${qc(q)}">${q}/100</span></div><div><span class="tosl">SLOT BOOST</span><span class="tosv ${qc(newSlotQ)}">→ ${newSlotQ}</span></div><div><span class="tosl">FORMAT FIT</span><span class="tosv ${fc}">${fl}</span></div></div></div><div><span class="tocl">ANNUAL SAL</span><span class="toc">${f$(t.salary)}</span></div></div>`;}).join('');
    const rivalRows=poachList.map(({st,sd:rsd})=>{
      const rt=rsd.talent;
      const fit=Math.round((rt.formatFit[s2.format]||.3)*100);
      const fc=fit>=75?'good':fit>=55?'warn':'poor';
      const q=Math.round(rt.quality);
      const dispOffer=Math.round(rt.salary*rnd(1.10,1.30)/500)*500;
      const minSign=Math.round(rt.salary*1.25/500)*500;
      const oldTal=s2.prog[HS.slot]?.talent;
      const buyout=oldTal&&(oldTal.cyr||0)>0.1?Math.round(oldTal.salary*(oldTal.cyr||0)*0.60/500)*500:0;
      const minCash=minSign+buyout;
      const canAfford=G.cash>=minCash;
      const sel=HS.poachRivalId===st.id;
      return `<div class="to${sel?' sel':''}" onclick="pickHirePoach('${st.id}')"><div><div class="ton">${rt.name} <span style="font-size:13px;color:var(--amb);font-family:var(--ft);letter-spacing:.06em">RIVAL</span></div><div class="tos" style="color:var(--mut)">${st.callLetters} · ${SL[HS.slot]}</div><div class="tost"><div><span class="tosl">TALENT Q</span><span class="tosv ${qc(q)}">${q}/100</span></div><div><span class="tosl">FIT</span><span class="tosv ${fc}">${fit}%</span></div><div><span class="tosl">AT RIVAL</span><span class="tosv">${f$(rt.salary)}/yr</span></div></div><div style="font-size:13px;color:var(--mut);margin-top:4px">Est. offer ~${f$(dispOffer)}/yr · need ≥${f$(minCash)} cash${buyout?` (incl. buyout ${f$(buyout)})`:''}</div></div><div><span class="tocl">ACTION</span><span class="toc" style="font-size:14px;color:${canAfford?'var(--mut)':'var(--red)'}">${canAfford?'Select, then HIRE':'Short on cash'}</span></div></div>`;
    }).join('');
    const curBox=cur?`<div class="ibox">Current: <strong>${cur.name}</strong> — quality ${Math.round(cur.quality)}, slot quality ${slotQcur}, ${f$(cur.salary)}/yr.</div>`:'';
    const freeSection=HS.pool.length
      ?`<div class="msh" style="margin-top:16px;margin-bottom:8px;font-size:13px;letter-spacing:.12em;color:var(--mut)">FREE AGENTS</div>
    <p class="di">Four market candidates. <strong>Talent Rating</strong> is how good they are — higher talent boosts slot quality on hire. <strong>Format Fit</strong> scales the boost.</p>
    <div class="tg">${freeRows}</div>`
      :'';
    const rivalSection=poachList.length
      ?`<div class="msh" style="margin-top:${HS.pool.length?20:16}px;margin-bottom:8px;font-size:13px;letter-spacing:.12em;color:var(--amb)">RIVAL TALENT</div>
    <p class="di">Poach from another station in <strong>${SL[HS.slot]}</strong> — same signing rules as the contract screen (salary premium + buyout if replacing someone).</p>
    <div class="tg">${rivalRows}</div>`
      :'';
    const emptyNote=!HS.pool.length&&!poachList.length?'<p class="di" style="color:var(--mut)">No free agents or poachable rivals for this slot right now.</p>':'';
    ph=`${curBox}${freeSection}${rivalSection}${emptyNote}`;
  }
  const fmtHireNote=TALK_FMTS.includes(s.format)?'Local hosts beat syndication for building loyal listeners — especially morning drive.':'Morning Drive has the biggest ratings impact. Automation is cheap but bleeds share over time.';
  const hireReady=HS.poachRivalId||HS.sel!==null;
  const hireLabel=HS.poachRivalId?'HIRE (POACH)':'HIRE TALENT';
  document.getElementById('talb').innerHTML=`<p class="di">${fmtHireNote} Salary grows ~1–2% per year.</p><div class="ssl">${sbtns}</div><div id="tp">${ph}</div><button class="cfm" onclick="doHire()" ${!hireReady?'disabled':''}>${hireLabel}</button><button class="cnl" onclick="cm('m-tal')">CANCEL</button>`;
  scrollModalContentToTop('m-tal');
}
function pickSlot(sid,sl){const s=G.stations.find(st=>st.id===sid);HS.slot=sl;HS.sel=null;HS.poachRivalId=null;HS.pool=mkPool(sl,s.format,G.year);rHire(s);}
function pickTal(i){HS.sel=i;HS.poachRivalId=null;rHire(G.stations.find(st=>st.id===HS.sid));}
function pickHirePoach(rivalId){HS.poachRivalId=rivalId;HS.sel=null;rHire(G.stations.find(st=>st.id===HS.sid));}
function doHire(){
  if(!HS.slot)return;
  if(HS.poachRivalId){
    doPoach(HS.sid,HS.slot,HS.poachRivalId);
    return;
  }
  if(HS.sel===null)return;
  const s=G.stations.find(st=>st.id===HS.sid),t=HS.pool[HS.sel],sl=HS.slot;
  t.periodsAtStation=0;
  t._hireYear=G.year;
  if(!t._careerStartYear)t._careerStartYear=Math.max(1970,G.year-ri(0,18));
  s.prog[sl].talent=t;
  const fit=t.formatFit[s.format]||.3;
  s.prog[sl].quality=Math.min(100,Math.round(s.prog[sl].quality+(t.quality/100)*fit*35));
  s.oq=Math.round(Object.entries(SW).reduce((sum,[sl2,w])=>sum+effSlotQForOq(s.prog[sl2])*w,0));
  G.news.unshift({v:'LOW',t:`You hire ${t.name} for ${s.callLetters} ${SL[sl]}`,y:G.year,p:G.period});
  logHistory(s,'TALENT',`Hired ${t.name} — ${SL[sl]} (Q:${t.quality})`,G);
  MP.action('hire', {sid:s.id, slot:sl, talent:t});
  cm('m-tal');renderAll();
}

// 2. SPOT LOAD — scaffold once, update display only
let SS={sid:null,val:14};
function openSpots(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  SS={sid,val:s.ops.spots};
  const norm=FM[s.format]?.sp||14;
  document.getElementById('spb').innerHTML=`
    <p class="di">More spots = more revenue now, but too many drives listeners away. Format norm is <strong>${norm} min/hr</strong>.</p>
    <div class="slsec">
      <div class="sll"><span>COMMERCIAL MINUTES / HOUR</span><strong id="sp-val">${s.ops.spots} min/hr</strong></div>
      <input type="range" min="6" max="22" value="${s.ops.spots}" oninput="updSpots('${s.id}',this.value)">
      <div class="sln2" id="sp-note"></div>
    </div>
    <div class="ibox"><strong>Current:</strong> ${s.ops.spots} min/hr · ${Math.round(s.ops.sell*100)}% sellout = ${f$(s.fin.rev)}/period</div>
    <button class="cfm" onclick="doSpots()">SET SPOT LOAD</button>
    <button class="cnl" onclick="cm('m-sp')">CANCEL</button>`;
  updSpots(sid, s.ops.spots);
  om('m-sp');
}
function updSpots(sid,v){
  sid=ensureOpsSourceSid(sid);
  SS.val=parseInt(v);SS.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const norm=FM[s.format]?.sp||14,ratio=SS.val/norm;
  const plbl=ratio<=.85?'+5% TSL':ratio<=1?'Normal':ratio<=1.15?'−3% TSL':ratio<=1.3?'−7% TSL':ratio<=1.5?'−13% TSL':'−20% TSL';
  const pc=ratio<=.85?'var(--grn)':ratio<=1?'var(--wht)':ratio<=1.15?'var(--amb)':'var(--red)';
  const estD=Math.round((SS.val/Math.max(s.ops.spots,1)-1)*s.fin.rev);
  const vEl=document.getElementById('sp-val'),nEl=document.getElementById('sp-note');
  if(vEl)vEl.textContent=`${SS.val} min/hr`;
  if(nEl)nEl.innerHTML=`TSL impact: <strong style="color:${pc}">${plbl}</strong> &nbsp;·&nbsp; Est. revenue change: <strong style="color:${estD>=0?'var(--grn)':'var(--red)'}">${estD>=0?'+':''}${f$(estD)}/period</strong>`;
}
function doSpots(){const sid=ensureOpsSourceSid(SS.sid);SS.sid=sid;const s=G.stations.find(st=>st.id===sid);if(!s)return;s.ops.spots=SS.val;G.news.unshift({v:'LOW',t:`${s.callLetters} spot load set to ${SS.val} min/hr — revenue impact next period.`,y:G.year,p:G.period});MP.action('spots',{sid,spots:SS.val});cm('m-sp');renderAll();}

// 3. PROMOTION — scaffold once, update display only
let PS={sid:null,val:0};
function openPromo(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  PS={sid,val:s.ops.promo||0};
  const simNote=s.simulcastWith?`<div class="ibox">📡 Simulcast tip: Promote the <strong>FM</strong> to migrate listeners from AM. FM promotion builds the digital audience; AM promotion only sustains the legacy signal.</div>`:'';
  document.getElementById('prb').innerHTML=`
    <p class="di">Marketing campaigns — billboards, contests, van tours, giveaways. Audience-facing promotion builds ratings and share over time. Higher budgets produce bigger share boosts each period.</p>
    ${simNote}
    <div class="slsec">
      <div class="sll"><span>MARKETING BUDGET / PERIOD</span><strong id="pr-val">${f$(PS.val)}</strong></div>
      <input type="range" min="0" max="50000" step="1000" value="${PS.val}" oninput="updPromo('${s.id}',this.value)">
      <div class="sln2" id="pr-note"></div>
    </div>
    <div class="ibox">Current: <strong>${f$(s.ops.promo||0)}/period</strong> · Station share: <strong>${pct(s.rat.share)}</strong></div>
    <button class="cfm" onclick="doPromo()">SET BUDGET</button>
    <button class="cnl" onclick="cm('m-pr2')">CANCEL</button>`;
  updPromo(sid, PS.val);
  om('m-pr2');
}
function updPromo(sid,v){
  sid=ensureOpsSourceSid(sid);
  PS.val=parseInt(v);PS.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  // Promotion boosts ratings share — small stations get bigger lift (harder to ignore a newcomer)
  const baseShare=s.rat.share||0.01;
  const estShareBoost=Math.min(0.03,(PS.val/50000)*0.04*(1/Math.max(baseShare*10,1)));
  const estRevGain=Math.round(estShareBoost*s.fin.rev/Math.max(baseShare,0.001));
  const net=estRevGain-PS.val;
  const tier=PS.val>=30000?'Major campaign — billboards + contests + van tour':PS.val>=15000?'Active campaign — radio ads + events':PS.val>=5000?'Light promotion — social + local ads':'Minimal presence';
  const vEl=document.getElementById('pr-val'),nEl=document.getElementById('pr-note');
  if(vEl)vEl.textContent=f$(PS.val);
  if(nEl)nEl.innerHTML=`<strong>${tier}</strong><br>Est. share lift: <strong style="color:var(--grn)">+${(estShareBoost*100).toFixed(2)}%</strong> · Est. revenue gain: <strong style="color:${net>=0?'var(--grn)':'var(--amb)'}">~${f$(Math.abs(net))} ${net>=0?'net gain':'net cost'}/period</strong>`;
}
function doPromo(){
  const sid=ensureOpsSourceSid(PS.sid);PS.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  s.ops.promo=PS.val;
  // Revenue impact applies next period when ratings engine runs — not immediately
  G.news.unshift({v:'LOW',t:`${s.callLetters} marketing budget set to ${f$(PS.val)}/period — takes effect next period.`,y:G.year,p:G.period});
  MP.action('promo',{sid:PS.sid,promo:PS.val});
  cm('m-pr2');renderAll();
}

// 3a. FIRE TALENT
// Talent shuffle state
let SHUFFLE={sid:null,fromSlot:null};

function openFire(sid){
  sid=ensureOpsSourceSid(sid);
  SHUFFLE={sid,fromSlot:null};
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  document.getElementById('fire-title').textContent='MANAGE TALENT';
  const filled=Object.entries(s.prog).filter(([sl,sd])=>sd?.talent);
  if(!filled.length){
    const noTalentMsg=TALK_FMTS.includes(s.format)
      ?'All dayparts are running syndicated or paid programming — no local talent on staff to release.'
      :'All dayparts are running on automation — no on-air talent on staff to release.';
    document.getElementById('fireb').innerHTML=`<p class="di">${noTalentMsg}</p><button class="cnl" onclick="cm('m-fire')">CLOSE</button>`;
    om('m-fire');return;
  }
  // Station's overall quality for context
  const stationOQ=s.oq||50;
  const rows=filled.map(([sl,sd])=>{
    const t=sd.talent;
    const cyr=t.cyr||0;
    const buyout=cyr>0.1?Math.round(t.salary*cyr*0.60/500)*500:0;
    const canAfford=G.cash>=buyout;
    const buyoutLabel=buyout>0
      ?`<span style="color:${canAfford?'var(--amb)':'var(--red)'};font-size:15px">${cyr.toFixed(1)}yr left · buyout ${f$(buyout)}</span>`
      :`<span style="color:var(--mut);font-size:15px">expired · free to release</span>`;

    // Daypart contribution: slot quality × slot weight = share of station's total OQ
    // Express as % of station performance this host is responsible for
    const slotQ=Math.round(sd.quality||0);
    const slotW=SW[sl]||0;
    const contribution=stationOQ>0?Math.round((slotQ*slotW/stationOQ)*100):0;
    // Trend: compare talent quality to slot quality — gap shows if host is lifting or dragging
    const talQ=Math.round(t.quality);
    const gap=talQ-slotQ; // positive = talent better than current slot output (growing), negative = declining
    const trendLabel=gap>8?'↑ growing':gap<-8?'↓ fading':'→ steady';
    const trendCol=gap>8?'var(--grn)':gap<-8?'var(--red)':'var(--mut)';
    const perfCol=contribution>=25?'var(--grn)':contribution>=12?'var(--amb)':'var(--red)';

    return `
    <div style="background:var(--crd);border:1px solid var(--bdh);border-radius:6px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
        <div>
          <div style="font-family:var(--fd);font-size:15px;letter-spacing:1px;color:var(--wht)">${SL[sl]} &nbsp;<span style="color:var(--mut);font-weight:normal;font-size:15px">· ${t.name}</span></div>
          <div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap">
            <div style="font-size:15px"><span style="color:var(--mut)">TALENT</span> <span class="${qc(talQ)}" style="font-family:var(--fd)">${talQ}/100</span></div>
            <div style="font-size:15px"><span style="color:var(--mut)">SLOT OUTPUT</span> <span class="${qc(slotQ)}" style="font-family:var(--fd)">${slotQ}/100</span></div>
            <div style="font-size:15px"><span style="color:var(--mut)">SHARE CONTRIBUTION</span> <span style="font-family:var(--fd);color:${perfCol}">~${contribution}%</span></div>
            <div style="font-size:15px"><span style="color:${trendCol}">${trendLabel}</span></div>
          </div>
          <div style="margin-top:5px;font-size:15px;color:var(--mut)">${f$(t.salary)}/yr &nbsp;·&nbsp; ${buyoutLabel}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <button class="abt" style="padding:6px 10px;font-size:15px" onclick="openShuffle('${sid}','${sl}')">MOVE</button>
          <button class="abt d" style="padding:6px 10px;font-size:15px;${!canAfford&&buyout>0?'opacity:.4;pointer-events:none':''}" onclick="doFire('${sid}','${sl}')">FIRE${buyout>0?' ('+f$(buyout)+')':''}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('fireb').innerHTML=`
    <p class="di">Move talent to a different daypart, or release them to save payroll. <strong>Moving is free</strong> — the receiving slot gets a brief adjustment period.</p>
    <div class="ms2"><div class="msh">CURRENT ON-AIR STAFF</div>${rows}</div>
    <div class="ibox"><strong>Note:</strong> Morning drive has the biggest quality impact. ${TALK_FMTS.includes(s.format)?'Syndicated content is cheaper but rarely builds a loyal local audience.':'Automation is cheap but a silent station bleeds share.'}</div>
    <button class="cnl" onclick="cm('m-fire')">DONE</button>`;
  om('m-fire');
}

function openShuffle(sid,fromSlot){
  sid=ensureOpsSourceSid(sid);
  SHUFFLE={sid,fromSlot};
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const talent=s.prog[fromSlot]?.talent;if(!talent)return;
  document.getElementById('fire-title').textContent='MOVE / SWAP TALENT';
  const slots=['morningDrive','afternoonDrive','midday','evening','overnight'];
  const slotWeight={morningDrive:1.0,afternoonDrive:0.75,midday:0.55,evening:0.35,overnight:0.20};
  const destRows=slots.filter(sl=>sl!==fromSlot).map(sl=>{
    const sd=s.prog[sl];
    const occ=sd?.talent;
    const slotQ=Math.round(sd?.quality||0);
    const toW=slotWeight[sl]||0.5, fromW=slotWeight[fromSlot]||0.5;
    const dirNote=toW>fromW
      ?'<span style="color:var(--grn);font-size:14px">\u2191 PRIME SLOT</span>'
      :'<span style="color:var(--mut);font-size:14px">\u2193 OFF-PEAK</span>';
    const isSwap=!!occ;
    const actionLabel=isSwap?'SWAP':'MOVE HERE';
    const actionColor=isSwap?'var(--amb)':'var(--grn)';
    const occNote=isSwap
      ?`<span style="color:var(--amb);font-size:15px">${occ.name} \u00b7 quality ${Math.round(occ.quality)}</span>`
      :'<span style="color:var(--mut);font-size:15px">vacant \u2014 automation</span>';
    return `<div class="sr" style="padding:10px 14px"><span class="lb"><strong>${SL[sl]}</strong> ${dirNote}<br><span style="font-weight:normal;font-size:15px">${occNote}</span></span><span style="display:flex;gap:8px;align-items:center"><span style="font-size:15px;color:var(--mut)">slot ${slotQ}</span><button class="abt" style="padding:6px 14px;font-size:15px;color:${actionColor};border-color:${actionColor}" onclick="doShuffle('${sid}','${fromSlot}','${sl}')">${actionLabel}</button></span></div>`;
  }).join('');
  document.getElementById('fireb').innerHTML=`
    <div class="ibox">Repositioning <strong>${talent.name}</strong> (quality ${Math.round(talent.quality)}) from <strong>${SL[fromSlot]}</strong>.<br><span style="color:var(--amb)">SWAP</span> trades both hosts. <span style="color:var(--grn)">MOVE</span> sends them to a vacant slot. Both carry a small adjustment dip.</div>
    <div class="ms2"><div class="msh">CHOOSE DESTINATION</div>${destRows}</div>
    <button class="cnl" onclick="openFire('${sid}')">&#8592; BACK</button>`;
}

/** Quick entry to daypart move/swap (same station) — uses openShuffle / doShuffle. */
function openSwapSignal(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const filled=Object.entries(s.prog).filter(([sl,sd])=>sd?.talent);
  if(filled.length!==1){openFire(sid);return;}
  om('m-fire');
  openShuffle(sid,filled[0][0]);
}

function doShuffle(sid,fromSlot,toSlot){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const fromSd=s.prog[fromSlot],toSd=s.prog[toSlot];
  if(!fromSd?.talent)return;
  const talA=fromSd.talent, talB=toSd?.talent||null;
  const isSwap=!!talB;
  const adjDip=isSwap?0.05:0.08; // swaps are smoother — both know the station
  const fit=t=>t.formatFit[s.format]||0.3;
  const boost=t=>Math.round((t.quality/100)*fit(t)*0.35*18);
  // Move A into destination
  toSd.talent=talA;
  toSd.quality=Math.min(100,Math.max(10,Math.round((toSd.quality||30)*(1-adjDip)))+boost(talA));
  if(isSwap){
    // Move B back into source
    fromSd.talent=talB;
    fromSd.quality=Math.min(100,Math.max(10,Math.round((fromSd.quality||30)*(1-adjDip)))+boost(talB));
    G.news.unshift({v:'LOW',t:`${talA.name} \u2194 ${talB.name} swap at ${s.callLetters}`,y:G.year,p:G.period});
  } else {
    // Source goes to automation
    fromSd.talent=null;
    const pen={morningDrive:.20,afternoonDrive:.14,midday:.09,evening:.06,overnight:.03}[fromSlot]||.09;
    fromSd.quality=Math.max(10,Math.round(fromSd.quality*(1-pen)));
    G.news.unshift({v:'LOW',t:`${talA.name} moves to ${s.callLetters} ${SL[toSlot]}`,y:G.year,p:G.period});
  }
  s.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w,0));
  MP.action('shuffle',{sid,fromSlot,toSlot});
  openFire(sid);renderAll();
}

// Cross-station talent transfer (player-owned stations only; separate from within-station shuffle)
let XFER = { fromSid: null, fromSlot: null, toSid: null };
function xferOwnedStations() {
  return MP.mode === 'live' ? G.ps.filter(s => s._mpOwner === MP.playerId) : G.ps;
}
function xferStnsWithLocalTalent() {
  return xferOwnedStations().filter(s => Object.values(s.prog).some(sd => sd?.talent));
}
function openXfer(sid) {
  sid = ensureOpsSourceSid(sid);
  const mine = xferOwnedStations();
  if (mine.length < 2) {
    showToast('Need at least two owned stations to move talent between them.', 'warn');
    return;
  }
  const withTal = xferStnsWithLocalTalent();
  if (!withTal.length) {
    showToast('No station has local on-air talent to move (simulcast receivers mirror the programming source).', 'warn');
    return;
  }
  XFER = { fromSid: null, fromSlot: null, toSid: null };
  document.getElementById('fire-title').textContent = 'MOVE BETWEEN STATIONS';
  xferRenderPickSource();
  om('m-fire');
}
function xferRenderPickSource() {
  const withTal = xferStnsWithLocalTalent();
  const rows = withTal.map(st => `<div class="sr" style="padding:10px 14px"><span class="lb"><strong>${callDisplay(st)}</strong><br><span style="color:var(--mut);font-size:15px">${FM[st.format]?.l || st.format}</span></span><button class="abt" onclick="xferPickSource('${st.id}')">SELECT</button></div>`).join('');
  document.getElementById('fireb').innerHTML = `
    <p class="di">Move a host from one station you own to another. <strong>Destination must be a vacant daypart</strong> — use Manage Talent on the other station first if that slot is filled.</p>
    <div class="ms2"><div class="msh">SOURCE STATION</div>${rows}</div>
    <button class="cnl" onclick="cm('m-fire')">CLOSE</button>`;
}
function xferPickSource(fromSid) {
  const s = G.stations.find(st => st.id === fromSid);
  if (!s || !mpIsMe(s)) { showToast('Not your station.', 'warn'); return; }
  const filled = Object.entries(s.prog).filter(([sl, sd]) => sd?.talent);
  if (!filled.length) { xferRenderPickSource(); return; }
  document.getElementById('fire-title').textContent = 'MOVE BETWEEN STATIONS';
  XFER.fromSid = fromSid; XFER.fromSlot = null; XFER.toSid = null;
  const rows = filled.map(([sl, sd]) => {
    const t = sd.talent;
    return `<div class="sr" style="padding:10px 14px"><span class="lb"><strong>${SL[sl]}</strong> &nbsp; ${t.name}<br><span style="color:var(--mut);font-size:15px">talent ${Math.round(t.quality)}</span></span><button class="abt" onclick="xferPickSlot('${sl}')">SELECT</button></div>`;
  }).join('');
  document.getElementById('fireb').innerHTML = `
    <p class="di">Choose which daypart to move <strong>from ${callDisplay(s)}</strong>.</p>
    <div class="ms2"><div class="msh">SOURCE DAYPART</div>${rows}</div>
    <button class="cnl" onclick="xferRenderPickSource()">← BACK</button>`;
}
function xferPickSlot(fromSlot) {
  const { fromSid } = XFER;
  const s = G.stations.find(st => st.id === fromSid);
  if (!s || !s.prog[fromSlot]?.talent) return;
  if (!mpIsMe(s)) return;
  XFER.fromSlot = fromSlot;
  xferRenderDestPick();
}
function xferRenderDestPick() {
  const { fromSid, fromSlot } = XFER;
  const src = G.stations.find(st => st.id === fromSid);
  if (!src || !fromSlot || !src.prog[fromSlot]?.talent) return;
  const tal = src.prog[fromSlot].talent;
  const dests = xferOwnedStations().filter(st => st.id !== fromSid);
  const rows = dests.map(st => `<div class="sr" style="padding:10px 14px"><span class="lb"><strong>${callDisplay(st)}</strong><br><span style="color:var(--mut);font-size:15px">${FM[st.format]?.l || st.format}</span></span><button class="abt" onclick="xferPickDest('${st.id}')">SELECT</button></div>`).join('');
  document.getElementById('fireb').innerHTML = `
    <p class="di">Moving <strong>${tal.name}</strong> from <strong>${callDisplay(src)} ${SL[fromSlot]}</strong>. Pick the destination station.</p>
    <div class="ms2"><div class="msh">DESTINATION STATION</div>${rows}</div>
    <button class="cnl" onclick="xferPickSource('${fromSid}')">← BACK</button>`;
}
function xferPickDest(toSid) {
  const st = G.stations.find(s => s.id === toSid);
  if (!st || !mpIsMe(st)) return;
  if (toSid === XFER.fromSid) return;
  XFER.toSid = toSid;
  xferRenderDestSlots();
}
function xferRenderDestSlots() {
  const { fromSid, fromSlot, toSid } = XFER;
  const dst = G.stations.find(st => st.id === toSid);
  const src = G.stations.find(st => st.id === fromSid);
  const tal = src?.prog[fromSlot]?.talent;
  if (!dst || !tal) return;
  const slots = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];
  const destRows = slots.map(sl => {
    const sd = dst.prog[sl];
    const occ = sd?.talent;
    const slotQ = Math.round(sd?.quality || 0);
    if (occ) {
      return `<div class="sr" style="padding:10px 14px;opacity:.55"><span class="lb"><strong>${SL[sl]}</strong><br><span style="color:var(--red);font-size:15px">occupied by ${occ.name} — open Manage Talent on ${callDisplay(dst)} to clear this slot first</span></span><span style="font-size:15px;color:var(--mut)">Q ${slotQ}</span></div>`;
    }
    return `<div class="sr" style="padding:10px 14px"><span class="lb"><strong>${SL[sl]}</strong><br><span style="color:var(--mut);font-size:15px">vacant · slot Q ${slotQ}</span></span><button class="abt" style="border-color:var(--grn);color:var(--grn)" onclick="doCrossStationXfer('${sl}')">MOVE HERE</button></div>`;
  }).join('');
  document.getElementById('fireb').innerHTML = `
    <p class="di">Place <strong>${tal.name}</strong> on <strong>${callDisplay(dst)}</strong>. Only vacant dayparts can receive a transfer.</p>
    <div class="ms2"><div class="msh">DESTINATION DAYPART</div>${destRows}</div>
    <button class="cnl" onclick="xferRenderDestPick()">← BACK</button>`;
}
function doCrossStationXfer(toSlot) {
  const { fromSid, fromSlot, toSid } = XFER;
  const src = G.stations.find(st => st.id === fromSid);
  const dst = G.stations.find(st => st.id === toSid);
  if (!src || !dst || !fromSlot || fromSid === toSid) return;
  if (!mpIsMe(src) || !mpIsMe(dst)) { showToast('Cross-station moves only between stations you own.', 'warn'); return; }
  if (!src.prog[fromSlot]?.talent || dst.prog[toSlot]?.talent) {
    showToast('That move is no longer valid — check dayparts again.', 'warn');
    xferRenderDestSlots();
    return;
  }
  if (!applyTalentCrossStationXferFull(fromSid, fromSlot, toSid, toSlot)) return;
  MP.action('talent_xfer', { fromSid, fromSlot, toSid, toSlot });
  cm('m-fire');
  renderAll();
}
function doFire(sid,slot){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const sd=s.prog[slot];if(!sd?.talent)return;
  const t=sd.talent;
  const name=t.name, sal=t.salary, cyr=t.cyr||0;

  // BUYOUT: if contract has time remaining, player owes a portion of remaining salary.
  // Industry standard: ~50-75% of remaining guaranteed money.
  // cyr is in years; salary is annual. Buyout = cyr * salary * 0.60 (rounded to $500)
  const buyoutRate=0.60;
  const buyout=cyr>0.1?Math.round(sal*cyr*buyoutRate/500)*500:0;

  if(buyout>0&&G.cash<buyout){
    // Can't afford it — block and inform
    showToast(`Can't fire ${name} — buyout is ${f$(buyout)} and you only have ${f$(G.cash)}.`,'warn');
    return;
  }

  if(buyout>0){ G.cash-=buyout; if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}}
  sd.talent=null;

  // Quality hit: losing morning drive hurts most
  const penalty={morningDrive:.28,afternoonDrive:.18,midday:.12,evening:.08,overnight:.04}[slot]||.12;
  sd.quality=Math.max(10,Math.round(sd.quality*(1-penalty)));
  s.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w,0));

  const buyoutMsg=buyout>0?` Buyout paid: ${f$(buyout)}.`:'';
  const sev=buyout>0?'MEDIUM':'LOW';
  G.news.unshift({v:sev,t:`You fire ${name} from ${s.callLetters} ${SL[slot]}.${buyoutMsg} Saving ${f$(sal/2)}/period going forward.`,y:G.year,p:G.period});
  logHistory(s,'TALENT',`Released ${name} — ${SL[slot]}${buyout>0?' (buyout: '+f$(buyout)+')':''}`,G);
  MP.action('fire', {sid, slot});
  openFire(sid);
  renderAll();
}

// 3b. PROGRAMMING INVESTMENT — scaffold once, update display only
let PI={sid:null,val:0};
function openProg(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  PI={sid,val:s.ops?.progBudget||0};
  const drows=Object.entries(SL).map(([k,lbl])=>{
    const q=Math.round(s.prog[k]?.quality||0),c=qc(q);
    const w=SW[k]||0;
    return `<div class="sr"><span class="lb">${lbl} <span style="color:var(--mut);font-size:15px">(×${(w*100).toFixed(0)}% weight)</span></span><span class="vl" style="color:${c==='good'?'var(--grn)':c==='warn'?'var(--amb)':'var(--red)'}">${q}/100</span></div>`;
  }).join('');
  document.getElementById('pgb').innerHTML=`
    <p class="di">Set a recurring programming budget — coaching, production, content development. Charged every period automatically, like your marketing budget. Reduces quality decay and boosts daypart quality each period.</p>
    <div class="ms2"><div class="msh">CURRENT DAYPART QUALITY</div>${drows}</div>
    <div class="slsec">
      <div class="sll"><span>PROGRAMMING BUDGET / PERIOD</span><strong id="pg-val">${f$(PI.val)}</strong></div>
      <input type="range" min="0" max="60000" step="2000" value="${PI.val}" oninput="updProg('${s.id}',this.value)">
      <div class="sln2" id="pg-note"></div>
    </div>
    <div class="ibox">Current: <strong>${f$(s.ops?.progBudget||0)}/period</strong> · Station quality: <strong>${s.oq}/100</strong> · Cash on hand: <strong>${f$(G.cash)}</strong></div>
    <button class="cfm" onclick="doProg()">SET BUDGET</button>
    <button class="cnl" onclick="cm('m-pg')">CANCEL</button>`;
  updProg(sid, PI.val);
  om('m-pg');
}
function updProg(sid,v){
  sid=ensureOpsSourceSid(sid);
  PI.val=parseInt(v);PI.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const boost=Math.round((PI.val/10000)*4);
  const vEl=document.getElementById('pg-val'),nEl=document.getElementById('pg-note');
  if(vEl)vEl.textContent=f$(PI.val);
  if(nEl){
    if(PI.val===0){nEl.textContent='Set to $0 to disable. Quality will decay at normal rate.';}
    else{nEl.innerHTML=`Est. quality boost: <strong style="color:var(--grn)">+${boost} pts/period</strong> across all dayparts &nbsp;·&nbsp; decay reduced <strong style="color:var(--blu)">40%</strong><br><span style="color:var(--mut)">Charged automatically each period — cancel anytime by setting to $0</span>`;}
  }
}
function doProg(){
  const sid=ensureOpsSourceSid(PI.sid);PI.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  if(!s.ops)s.ops={spots:14,sell:0.65,promo:0,progBudget:0};
  s.ops.progBudget=PI.val;
  MP.action('prog',{sid,progBudget:PI.val});
  G.news.unshift({v:'LOW',t:`${s.callLetters} programming budget set to ${f$(PI.val)}/period${PI.val===0?' — discontinued.':'.'}`,y:G.year,p:G.period});
  cm('m-pg');renderAll();
}
// 3b2. COMMUNITY INVESTMENT
let CI={sid:null,val:0};
function openIdent(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  CI={sid,val:s.identityBudget||0};
  const identity=Math.round(s.identity||0);
  const potential=Math.round((COMMUNITY_IDENTITY[s.format]||0.3)*100);
  const yrs=Math.round((s._formatAge||0)/2);
  const fmtName=FM[s.format]?.l||s.format;
  // Identity label
  const idLabel=identity>=70?'CORNERSTONE':identity>=45?'EMBEDDED':identity>=25?'RECOGNIZED':identity>=10?'EMERGING':'UNKNOWN';
  const idColor=identity>=70?'var(--grn)':identity>=45?'var(--amb)':identity>=25?'var(--off)':'var(--mut)';
  // Format-appropriate description of what investment means
  const fmtDesc={
    SOUL_RNB:'Remote broadcasts from community events, neighborhood sponsorships, supporting local artists.',
    GOSPEL:'Church partnerships, charity drives, funeral home sponsorships, community prayer segments.',
    COUNTRY:'County fair remotes, local rodeo coverage, high school sports, farm report sponsorships.',
    NEWS_TALK:'Editorial board endorsements, town halls, community call-in events, local issue coverage.',
    SPORTS_TALK:'Local team coverage, athlete interviews, youth sports sponsorships, pre/postgame remotes.',
    ADULT_STANDARDS:'Senior center partnerships, hospital sponsorships, nostalgic community events.',
    URBAN_CONTEMP:'Block party remotes, youth programs, local artist showcases, community event coverage.',
    ALBUM_ROCK:'Concert sponsorships, local band showcases, college partnerships.',
    CLASSIC_ROCK:'Reunion concert sponsorships, veteran events, classic car show remotes.',
  }[s.format]||'Remotes, sponsorships, local event coverage, public service programming.';
  document.getElementById('identb').innerHTML=`
    <p class="di">Community Identity represents how deeply <strong>${s.callLetters}</strong> is woven into the fabric of the market — beyond ratings, beyond revenue. It's what makes listeners feel <em>betrayed</em> when you change format.</p>
    <div class="ms2">
      <div class="msh">CURRENT STANDING</div>
      <div class="sr"><span class="lb">Identity Score</span><span class="vl" style="color:${idColor};font-family:var(--fd);font-size:18px">${identity}/100 — ${idLabel}</span></div>
      <div class="sr"><span class="lb">Format Potential</span><span class="vl">${fmtName} ceiling: ${potential}/100</span></div>
      <div class="sr"><span class="lb">Years in Format</span><span class="vl">${yrs} year${yrs!==1?'s':''} — ${yrs>=10?'Deep roots':'Still building'}</span></div>
      <div class="sr"><span class="lb">Peak Ever</span><span class="vl">${Math.round(s._identityPeak||identity)}/100</span></div>
    </div>
    <div style="font-size:14px;color:var(--mut);margin:10px 0 6px 0;padding:10px;background:rgba(255,255,255,.04);border-radius:4px;border-left:3px solid var(--amb)"><em>What your investment looks like on the air:</em><br>${fmtDesc}</div>
    <div class="slsec">
      <div class="sll"><span>COMMUNITY INVESTMENT / PERIOD</span><strong id="ci-val">${f$(CI.val)}</strong></div>
      <input type="range" min="0" max="40000" step="1000" value="${CI.val}" oninput="updIdent('${s.id}',this.value)">
      <div class="sln2" id="ci-note"></div>
    </div>
    <div class="ibox">Identity builds slowly and burns fast. A station that's been the community's voice for 15 years is worth protecting — even when the ratings math says otherwise.</div>
    <button class="cfm" onclick="doIdent()">SET INVESTMENT</button>
    <button class="cnl" onclick="cm('m-ident')">CANCEL</button>`;
  updIdent(sid, CI.val);
  om('m-ident');
}
function updIdent(sid,v){
  sid=ensureOpsSourceSid(sid);
  CI.val=parseInt(v);CI.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const vEl=document.getElementById('ci-val'),nEl=document.getElementById('ci-note');
  if(vEl)vEl.textContent=f$(CI.val);
  if(nEl){
    if(CI.val===0){nEl.textContent='No investment — identity grows only through time and tenure.';}
    else{
      const boost=Math.round((CI.val/10000)*1.2*10)/10;
      nEl.innerHTML=`Accelerates identity growth by ~<strong style="color:var(--grn)">+${boost}× rate</strong> &nbsp;·&nbsp; charged each period<br><span style="color:var(--mut)">Identity can't be bought outright — it grows through consistency, not spending</span>`;
    }
  }
}
function doIdent(){
  const sid=ensureOpsSourceSid(CI.sid);CI.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  s.identityBudget=CI.val;
  G.news.unshift({v:'LOW',t:`${s.callLetters} community investment set to ${f$(CI.val)}/period${CI.val===0?' — discontinued.':'.'}`,y:G.year,p:G.period});
  MP.action('ident', {sid, budget:CI.val});
  cm('m-ident');renderAll();
}

// 3c. DEMO LEAN TARGETING
let DL={sid:null,val:0};
function openLean(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  DL={sid,val:s.demoLean||0};
  const fmt=FM[s.format]||{};
  // Show what the current affinity profile looks like across demos
  const tp=Object.values(POP.cohorts).reduce((s,c)=>s+c.t,0);
  const _hasLean=(s.demoLean||0)!==0;
  const drows=COH.map(coh=>{
    const neutral=FA[s.format]?.[coh]||.1;
    const adj=neutral*leanMult(coh,s.demoLean||0);
    const delta=adj-neutral;
    const cpm=CPM[coh]||1;
    // Only show indicator when there's an active lean — otherwise everything is neutral
    let indicator='';
    if(_hasLean){
      if(delta>0.005) indicator=`<span style="color:var(--grn);font-size:13px" title="Above format average — your targeting favors this demo"> ▲ FAVORED</span>`;
      else if(delta<-0.005) indicator=`<span style="color:var(--red);font-size:13px" title="Below format average — your targeting deprioritizes this demo"> ▼ REDUCED</span>`;
      else indicator=`<span style="color:var(--mut);font-size:13px"> —</span>`;
    }
    return `<div class="sr"><span class="lb">${coh}${indicator} <span style="color:var(--mut);font-size:15px">CPM ×${cpm.toFixed(2)}</span></span><span class="vl" style="font-size:14px">${(adj*100).toFixed(0)}% affinity</span></div>`;
  }).join('');
  document.getElementById('leanb').innerHTML=`
    <p class="di">Shift your programming to skew younger or older within the <strong>${fmt.l||s.format}</strong> format. This affects who tunes in and your effective CPM — younger demos are cheaper to reach but cheaper to sell.</p>
    <div class="ms2"><div class="msh">CURRENT AFFINITY PROFILE${_hasLean?' <span style="font-size:13px;color:var(--mut);font-weight:400;letter-spacing:1px">— ▲/▼ shows effect of your targeting vs. format neutral</span>':''}</div>${drows}</div>
    <div class="slsec">
      <div class="sll"><span>DEMO TARGETING</span><strong id="lean-val">${leanLabel(s.demoLean||0)}</strong></div>
      <input type="range" min="-100" max="100" step="5" value="${Math.round((s.demoLean||0)*100)}" oninput="updLean('${s.id}',this.value)">
      <div style="display:flex;justify-content:space-between;font-family:var(--ft);font-size:14px;color:var(--mut);margin-top:4px"><span>◀ 12–24</span><span>25–54</span><span>50+ ▶</span></div>
      <div class="sln2" id="lean-note"></div>
    </div>
    <div class="ibox"><strong>Note:</strong> Changes take effect next period as your programming gradually shifts. Revenue impact depends on the CPM of the demos you gain vs. lose.</div>
    <button class="cfm" onclick="doLean()">APPLY TARGETING</button>
    <button class="cnl" onclick="cm('m-lean')">CANCEL</button>`;
  updLean(sid, Math.round((s.demoLean||0)*100));
  om('m-lean');
}
function updLean(sid,v){
  sid=ensureOpsSourceSid(sid);
  DL.val=parseInt(v)/100;DL.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const vEl=document.getElementById('lean-val'),nEl=document.getElementById('lean-note');
  if(vEl)vEl.textContent=leanLabel(DL.val);
  if(nEl){
    if(DL.val===0){nEl.textContent='Neutral — no targeting adjustment.';}
    else{
      // Compute rough CPM shift
      const tp=Object.values(POP.cohorts).reduce((s,c)=>s+c.t,0);
      const newWcpm=COH.reduce((sum,coh)=>{
        const adj=(FA[s.format]?.[coh]||.1)*leanMult(coh,DL.val);
        const pop=POP.cohorts[coh]?.t||0;
        return sum+(adj*pop/tp)*(CPM[coh]||1);
      },0);
      const oldWcpm=COH.reduce((sum,coh)=>{
        const adj=(FA[s.format]?.[coh]||.1)*leanMult(coh,s.demoLean||0);
        const pop=POP.cohorts[coh]?.t||0;
        return sum+(adj*pop/tp)*(CPM[coh]||1);
      },0);
      const cpmDelta=((newWcpm-oldWcpm)/Math.max(oldWcpm,.01)*100).toFixed(1);
      const dir=DL.val<0?'younger demos':'older demos';
      const cpmColor=parseFloat(cpmDelta)>=0?'var(--grn)':'var(--red)';
      nEl.innerHTML=`Skewing to <strong>${dir}</strong> &nbsp;·&nbsp; CPM change: <strong style="color:${cpmColor}">${parseFloat(cpmDelta)>=0?'+':''}${cpmDelta}%</strong>`;
    }
  }
}
function doLean(){
  const sid=ensureOpsSourceSid(DL.sid);DL.sid=sid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  s.demoLean=DL.val;
  // Sync to simulcast partner — they share the same audience strategy
  if(s.simulcastWith){
    const partner=G.stations.find(st=>st.id===s.simulcastWith);
    if(partner)partner.demoLean=DL.val;
  }
  G.news.unshift({v:'LOW',t:`${s.callLetters} demo targeting: ${leanLabel(DL.val)}`,y:G.year,p:G.period});
  MP.action('lean',{sid,val:DL.val});
  cm('m-lean');renderAll();
}

// 3d-pre. STREAMING INVESTMENT
function openStream(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const avail=G.year>=2005;
  const cost=STREAM_COST_BASE;
  const upkeep=Math.round(STREAM_UPKEEP_BASE/2);
  const straf=STRAF[s.format]||.50;
  const sd=G.streamDrag;
  const estPct=Math.round(Math.min(35,sd*straf*80));
  const estAqh=Math.round(s.rat.aqh*(sd*straf*0.8));
  const cpmScale=Math.min(2.5,1+(G.year-2005)/10);
  const swcpm=COH.reduce((sum,c)=>{
    const w=(s.rat.cur[c]?.aqh||0)/Math.max(s.rat.aqh,1);
    return sum+w*(SCPM[c]||4)*cpmScale;
  },0);
  const sSpots=Math.min(8,s.ops.spots*.4);
  const estStreamRev=Math.round((estAqh/1000)*swcpm*sSpots*182*.75);
  const dragOff=Math.min(sd*.5,sd*straf*.4);
  const offsetPct=Math.round(dragOff/Math.max(sd,.01)*100);

  if(!avail){
    document.getElementById('streamb').innerHTML=`
      <p class="di">Streaming investment becomes available in 2005 when the online audio market matures enough to monetize.</p>
      <div class="ibox">Come back after 2005 to launch <strong>${s.callLetters}</strong> online.</div>
      <button class="cnl" onclick="cm('m-stream')">CLOSE</button>`;
    om('m-stream');return;
  }

  if(s.stream?.active){
    // Already streaming — show status
    document.getElementById('streamb').innerHTML=`
      <p class="di"><strong>${s.callLetters}</strong> is live online. Streaming audience grows automatically as the digital market matures.</p>
      <div class="ms2">
        <div class="msh">STREAMING PERFORMANCE — ${G.year}</div>
        <div class="sr"><span class="lb">Streaming AQH</span><span class="vl pos">${(s.stream.aqh||0).toLocaleString()}</span></div>
        <div class="sr"><span class="lb">Streaming Revenue / Period</span><span class="vl pos">${f$(s.stream.rev||0)}</span></div>
        <div class="sr"><span class="lb">Infrastructure Upkeep / Period</span><span class="vl neg">−${f$(upkeep)}</span></div>
        <div class="sr"><span class="lb">Digital CPM (${G.year})</span><span class="vl">${f$(swcpm.toFixed(2))} per 1,000</span></div>
        <div class="sr"><span class="lb">Terrestrial drag offset</span><span class="vl amb">${offsetPct}% of drag neutralized</span></div>
        <div class="sr"><span class="lb">Format streaming affinity</span><span class="vl">${Math.round(straf*100)}%</span></div>
      </div>
      <div class="ibox">Streaming audience grows automatically each period as <strong>streamDrag</strong> rises. No further action needed — your investment compounds over time.</div>
      <button class="cnl" onclick="cm('m-stream')">CLOSE</button>`;
    om('m-stream');return;
  }

  // Not yet streaming — show investment offer
  document.getElementById('streamb').innerHTML=`
    <p class="di">Launch <strong>${s.callLetters}</strong> online. One-time infrastructure investment — then your stream grows automatically as the market matures.</p>
    <div class="ms2">
      <div class="msh">INVESTMENT DETAILS</div>
      <div class="sr"><span class="lb">One-time setup cost</span><span class="vl amb">${f$(cost)}</span></div>
      <div class="sr"><span class="lb">Ongoing upkeep / period</span><span class="vl neg">−${f$(upkeep)}</span></div>
      <div class="sr"><span class="lb">Cash on hand</span><span class="vl ${G.cash>=cost?'pos':'neg'}">${f$(G.cash)}</span></div>
    </div>
    <div class="ms2">
      <div class="msh">PROJECTED PERFORMANCE — ${G.year}</div>
      <div class="sr"><span class="lb">Est. streaming AQH now</span><span class="vl">${estAqh.toLocaleString()} (${estPct}% of terrestrial)</span></div>
      <div class="sr"><span class="lb">Est. streaming revenue / period</span><span class="vl pos">+${f$(estStreamRev)}</span></div>
      <div class="sr"><span class="lb">Terrestrial drag offset</span><span class="vl amb">${offsetPct}% of streaming drag neutralized</span></div>
      <div class="sr"><span class="lb">Format streaming affinity</span><span class="vl">${FM[s.format]?.l} — ${Math.round(straf*100)}%${straf>=.80?' 🔥':straf>=.60?' ✓':' (modest)'}</span></div>
    </div>
    ${G.year<2010?`<div class="wbox"><strong>Early mover:</strong> Streaming audiences are small in ${G.year} but growing fast. Investing now locks in first-mover advantage as the market matures — you'll have an established audience when CPMs get good.</div>`:''}
    ${G.year>=2015?`<div class="bbox"><strong>Late investment:</strong> Streaming is mature. Revenue potential is strong immediately, but competitors may already be established online.</div>`:''}
    ${G.cash<cost?`<div class="wbox"><strong>Insufficient funds.</strong> You need ${f$(cost-G.cash)} more to launch streaming for this station.</div>`:''}
    <button class="cfm" onclick="doStream('${sid}')" ${G.cash<cost?'disabled':''}>LAUNCH STREAMING — ${f$(cost)}</button>
    <button class="cnl" onclick="cm('m-stream')">NOT NOW</button>`;
  om('m-stream');
}
function doStream(sid){
  sid=ensureOpsSourceSid(sid);
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const cost=STREAM_COST_BASE;
  if(G.cash<cost){alert('Insufficient funds.');return;}
  G.cash-=cost;
  if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}
  s.stream.active=true;s.stream.launchYear=G.year;
  calcRev(s,G);
  G.news.unshift({v:'MEDIUM',t:`📶 ${s.callLetters} launches online streaming — ${FM[s.format]?.l} now on digital.`,y:G.year,p:G.period});
  MP.action('stream', {sid});
  cm('m-stream');renderAll();
}

// 3d. RENAME STATION
// Call letters: W or K prefix + 2-3 letters suffix = 3 or 4 total (standard US broadcast)
// AM/FM pairs share the same base call letters — display adds -AM/-FM suffix
// "taken" check ignores the partner simulcast station so WRGS-AM can share with WRGS-FM
function callDisplay(s){
  // If this station has a simulcast partner, show -AM or -FM suffix
  const partner=G.stations.find(st=>st.simulcastWith===s.id||s.simulcastWith===st.id);
  if(partner&&partner.callLetters===s.callLetters)
    return s.callLetters+(s.sig.type==='AM'?'-AM':'-FM');
  return s.callLetters;
}
function openRename(sid){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const cur=s.callLetters;
  const prefix=cur[0]==='W'||cur[0]==='K'?cur[0]:'W';
  const suffix=cur.slice(1);
  const partner=G.stations.find(st=>st.id!==s.id&&(st.simulcastWith===s.id||s.simulcastWith===st.id));
  const partnerNote=partner?`<div class="ibox">This station is simulcast with <strong>${partner.callLetters}</strong>. If you give both stations the same call letters, they'll display as <strong>${cur}-AM</strong> / <strong>${cur}-FM</strong> automatically.</div>`:'';

  document.getElementById('renameb').innerHTML=`
    <p class="di">Rename <strong>${callDisplay(s)}</strong> — ${s.freq} · ${FM[s.format]?.l||s.format}.</p>
    ${partnerNote}
    <div class="slsec">
      <div class="sll"><span>NEW CALL LETTERS</span><strong id="rn-preview">${callDisplay(s)}</strong></div>
      <div style="display:flex;align-items:center;gap:0;margin-top:10px">
        <select id="rn-prefix" onchange="updRename()"
          style="background:var(--crd);border:1px solid var(--bdh);border-right:none;color:var(--amb);font-family:var(--fd);font-size:28px;letter-spacing:4px;padding:12px 10px;outline:none;cursor:pointer">
          <option value="W" ${prefix==='W'?'selected':''}>W</option>
          <option value="K" ${prefix==='K'?'selected':''}>K</option>
        </select>
        <input type="text" id="rn-suffix" maxlength="3" value="${suffix}"
          placeholder="RGS"
          style="width:100%;background:var(--crd);border:1px solid var(--bdh);color:var(--wht);font-family:var(--fd);font-size:28px;letter-spacing:6px;padding:12px 16px;outline:none;text-transform:uppercase"
          oninput="updRename()" onkeydown="if(event.key==='Enter')doRename('${sid}')">
      </div>
      <div class="sln2" id="rn-note" style="margin-top:8px">2–3 letters after W or K (e.g. WRGS, WLW, KABC).</div>
    </div>
    <div style="margin-top:18px;border-top:1px solid var(--bdr);padding-top:16px">
      <div class="sll" style="margin-bottom:8px"><span>BRAND / POSITIONING</span><strong id="brand-preview" style="color:var(--amb)">"${s.brand}"</strong></div>
      <div style="font-size:15px;color:var(--mut);margin-bottom:10px">Format suggestions — or type your own:</div>
      <div id="brand-pills" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${getBrandSuggestions(s).map(b=>'<span class="bp'+(s.brand===b?' bpsel':'')+'" onclick="pickBrand(\''+s.id+'\',\''+b.replace(/'/g,"\\'")+'\')" >'+b+'</span>').join('')}</div>
      <input type="text" id="brand-custom" value="${s.brand}"
        placeholder="e.g. Freedom 920 or Lite 99.7"
        style="width:100%;box-sizing:border-box;background:var(--crd);border:1px solid var(--bdh);color:var(--wht);font-family:var(--ft);font-size:15px;padding:10px 12px;outline:none"
        oninput="updBrand('${s.id}',this.value)">
      <div style="font-size:15px;color:var(--mut);margin-top:6px">Brand appears on station card. Used for logo generation.</div>
    </div>
    <button class="cfm" id="rn-btn" onclick="doRename('${sid}')" disabled>RENAME STATION</button>
    <button class="cnl" onclick="cm('m-rename')">CANCEL</button>`;
  _renameSid=sid;
  om('m-rename');
  setTimeout(()=>{updRename();const el=document.getElementById('rn-suffix');if(el){el.focus();el.select();}},120);
}
let _renameSid=null; // module-level — set when modal opens, read by updRename
function updRename(){
  const pfxEl=document.getElementById('rn-prefix');
  const sfxEl=document.getElementById('rn-suffix');
  if(!pfxEl||!sfxEl)return;
  const sfx=sfxEl.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
  sfxEl.value=sfx;
  const val=(pfxEl.value||'W')+sfx;
  const preview=document.getElementById('rn-preview');
  const note=document.getElementById('rn-note');
  const btn=document.getElementById('rn-btn');
  // Use the module-level sid set when the modal opened — no fragile DOM parsing
  const sid=_renameSid;
  const s=sid?G.stations.find(st=>st.id===sid):null;
  const partnerId=s?.simulcastWith;
  // Allow same call letters on your own stations if they are AM/FM pair candidates
  // (e.g. WCIV on both AM and FM — displayed as WCIV-AM / WCIV-FM)
  const myStationIds=new Set((MP.mode==='live'?G.ps.filter(st=>st._mpOwner===MP.playerId):G.ps).map(st=>st.id));
  const taken=G.stations.some(st=>{
    if(st.callLetters!==val) return false;
    if(st.id===sid||st.id===partnerId) return false;
    // Allow if it's your own station with a different signal type (AM/FM pairing)
    const stIsAM=st.sig.type==='AM'&&!st.fmBooster;
    const sIsAM2=s?(s.sig.type==='AM'&&!s.fmBooster):false;
    if(myStationIds.has(st.id)&&stIsAM!==sIsAM2) return false;
    return true;
  });
  const valid=sfx.length>=2;
  // Display with -AM/-FM suffix hint if simulcast partner exists
  const partnerHasSame=s&&partnerId&&G.stations.find(st=>st.id===partnerId)?.callLetters===val;
  const dispVal=s?.simulcastWith&&!partnerHasSame?val:(s?.simulcastWith?val+(s.sig.type==='AM'?'-AM':'-FM'):val);
  if(preview)preview.textContent=valid?dispVal:'—';
  if(note){
    if(!sfx)note.textContent='Enter 2–3 letters after the prefix.';
    else if(sfx.length<2)note.textContent='Need at least 2 letters (e.g. WLW, KABC).';
    else if(taken)note.innerHTML=`<span style="color:var(--red)">${val} is already in use.</span>`;
    else note.innerHTML=`<span style="color:var(--grn)">✓ ${val} is available.</span>`;
  }
  if(btn)btn.disabled=!(valid&&!taken);
}
function doRename(sid){
  sid=sid||_renameSid;
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const pfxEl=document.getElementById('rn-prefix');
  const sfxEl=document.getElementById('rn-suffix');
  if(!pfxEl||!sfxEl)return;
  const sfx=sfxEl.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
  const val=(pfxEl.value||'W')+sfx;
  if(sfx.length<2)return;
  const partnerId=s.simulcastWith;
  const myIds=new Set((MP.mode==='live'?G.ps.filter(st=>st._mpOwner===MP.playerId):G.ps).map(st=>st.id));
  const sIsAMr=s.sig.type==='AM'&&!s.fmBooster;
  const nameTaken=G.stations.some(st=>{
    if(st.callLetters!==val) return false;
    if(st.id===sid||st.id===partnerId) return false;
    // Allow same call letters across your own AM+FM pair (displayed as WCIV-AM / WCIV-FM)
    const stIsAMr=st.sig.type==='AM'&&!st.fmBooster;
    if(myIds.has(st.id)&&stIsAMr!==sIsAMr) return false;
    return true;
  });
  if(nameTaken) return;
  const old=callDisplay(s);
  s.callLetters=val;
  // Brand may have been updated live via updBrand — already stored in s.brand
  G.news.unshift({v:'LOW',t:`${old} officially renamed ${callDisplay(s)} (${s.freq}) — brand: "${s.brand}"`,y:G.year,p:G.period});
  MP.action('rename', {sid:s.id, callLetters:s.callLetters, brand:s.brand});
  cm('m-rename');renderAll();
}

// 3e. FM MIGRATION — end simulcast; FM becomes flagship (format / brand / talent / identity)
function openMigrate(sid){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  // Find the paired FM station
  const fm=s.simulcastWith?G.stations.find(st=>st.id===s.simulcastWith):null;
  const am=s.sig.type==='AM'?s:(fm?.sig.type==='AM'?fm:null);
  const fmStn=s.sig.type==='FM'?s:(fm?.sig.type==='FM'?fm:null);
  if(!am||!fmStn){
    document.getElementById('migrateb').innerHTML=`<p class="di">This action requires an active AM/FM simulcast pair. Use <strong>Simulcast this station</strong> first to bridge the signals, then move the full programming franchise to FM.</p><button class="cnl" onclick="cm('m-migrate')">CLOSE</button>`;
    om('m-migrate');return;
  }
  const fmCallEsc=callDisplay(fmStn);
  // How many listeners would follow? Depends on FM penetration and year.
  // Higher fmp = more car/home radios have FM = more follow
  const followRate=Math.min(.85,Math.max(.20,G.fmp*1.1));
  const amAqh=am.rat.aqh,fmAqh=fmStn.rat.aqh;
  const estimatedFollow=Math.round(amAqh*followRate);
  const estimatedLost=amAqh-estimatedFollow;
  const fmpPct=Math.round(G.fmp*100);
  document.getElementById('migrateb').innerHTML=`
    <p class="di">End the simulcast bridge and make <strong>${fmCallEsc}</strong> your <strong>flagship</strong>: the full format, brand, on-air staff, strategy, and community identity move to the FM signal. The AM facility becomes an empty shell — reformat or sell it separately.</p>
    <div class="ms2">
      <div class="msh">AUDIENCE TRANSFER ESTIMATE — ${G.year}</div>
      <div class="sr"><span class="lb">AM current AQH</span><span class="vl">${amAqh.toLocaleString()}</span></div>
      <div class="sr"><span class="lb">FM current AQH</span><span class="vl">${fmAqh.toLocaleString()}</span></div>
      <div class="sr"><span class="lb">FM penetration (${G.year})</span><span class="vl amb">${fmpPct}%</span></div>
      <div class="sr"><span class="lb">Est. listeners who follow to FM</span><span class="vl pos">~${estimatedFollow.toLocaleString()}</span></div>
      <div class="sr"><span class="lb">Est. listeners lost in transition</span><span class="vl neg">~${estimatedLost.toLocaleString()}</span></div>
      <div class="sr"><span class="lb">AM station after migration</span><span class="vl" style="color:var(--off)">Available to reformat</span></div>
    </div>
    ${G.fmp<.65?`<div class="wbox"><strong>WARNING:</strong> FM penetration is only ${fmpPct}% in ${G.year}. A large chunk of your AM audience doesn't own FM radios yet — they won't follow. Consider waiting until FM penetration is higher (post-1977).</div>`:''}
    ${G.fmp>=.75?`<div class="bbox"><strong>GOOD TIMING:</strong> FM penetration is ${fmpPct}%. Most listeners have FM receivers. This is a solid window to make the move.</div>`:''}
    <div class="ms2">
      <div class="msh">MOVES TO ${fmCallEsc.toUpperCase()} (NEW FLAGSHIP)</div>
      <div class="sr"><span class="lb">Format &amp; Brand</span><span class="vl pos">✓ ${FM[am.format]?.l||am.format} — "${am.brand}" (from ${am.callLetters})</span></div>
      <div class="sr"><span class="lb">All Talent</span><span class="vl pos">✓ ${Object.values(am.prog).filter(sd=>sd?.talent).map(sd=>sd.talent.name).join(', ')||'None hired'}</span></div>
      <div class="sr"><span class="lb">Format Strategy</span><span class="vl pos">✓ Drift positioning preserved</span></div>
      <div class="sr"><span class="lb">Demo Target</span><span class="vl pos">✓ Audience lean preserved</span></div>
      <div class="sr"><span class="lb">Programming Quality</span><span class="vl pos">✓ ${am.oq}/100 moves to FM</span></div>
      <div class="sr"><span class="lb">AM after migration</span><span class="vl" style="color:var(--off)">Available to reformat or sell</span></div>
    </div>
    <button class="cfm" onclick="doMigrate('${am.id}','${fmStn.id}')">COMMIT — MOVE FORMAT TO ${fmCallEsc}</button>
    <button class="cnl" onclick="cm('m-migrate')">NOT YET</button>`;
  om('m-migrate');
}
/** End AM/FM simulcast; FM becomes programming flagship (shared by doMigrate + MP). */
function applyFmSimulcastMigration(amId, fmId) {
  const am = G.stations.find(st => st.id === amId), fm = G.stations.find(st => st.id === fmId);
  if (!am || !fm) return false;
  if (am.sig.type !== 'AM' || am.fmBooster) return false;
  if (fm.sig.type !== 'FM' || fm.fmBooster) return false;
  const daySlots = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];
  const oldFormat = am.format;
  const followRate = Math.min(.85, Math.max(.20, G.fmp * 1.1));

  // ── 1. TRANSFER AUDIENCE MOMENTUM ────────────────────────────────
  Object.keys(am.rat.cur).forEach(coh => {
    const amSh = am.rat.cur[coh]?.share || 0;
    const fmCur = fm.mom[coh]?.cur || 0;
    const transferred = amSh * followRate;
    const newVal = Math.min(.90, Math.max(fmCur, transferred));
    if (fm.mom[coh]) fm.mom[coh].cur = newVal, fm.mom[coh].tgt = Math.max(fm.mom[coh].tgt || 0, newVal);
    else fm.mom[coh] = { cur: newVal, tgt: newVal };
  });

  // ── 2. FLAGSHIP PROGRAMMING ON FM (always from former source leg) ─
  fm.format = am.format;
  fm.brand = am.brand;
  fm.flog = [...(am.flog || [])];

  // ── 3. MOVE ALL TALENT ───────────────────────────────────────────
  Object.entries(am.prog).forEach(([slot, sd]) => {
    if (!sd) return;
    if (sd.talent) {
      if (!fm.prog[slot]) fm.prog[slot] = { quality: sd.quality, talent: null };
      fm.prog[slot].talent = sd.talent;
      fm.prog[slot].quality = Math.max(fm.prog[slot].quality || 0, sd.quality);
      sd.talent = null;
    } else if (fm.prog[slot]) {
      fm.prog[slot].quality = Math.max(fm.prog[slot].quality || 0, sd.quality);
    }
  });

  // ── 4–5. DRIFT + DEMO ────────────────────────────────────────────
  if (am.drift) {
    if (!fm.drift) fm.drift = {};
    Object.entries(am.drift).forEach(([fmt, val]) => { fm.drift[fmt] = val; });
  }
  if (am.driftHistory) fm.driftHistory = am.driftHistory;
  fm.demoLean = am.demoLean || 0;

  // ── 6–7. PROG INVESTMENT + OQ (prelim) ────────────────────────────
  fm.progInvestment = (fm.progInvestment || 0) + (am.progInvestment || 0);
  am.progInvestment = 0;
  fm.oq = Math.max(fm.oq || 0, am.oq || 0);

  // ── 8–9. STRATEGIC TYPE + COMMUNITY IDENTITY ──────────────────────
  if (am.str && am.str !== 'emerging') fm.str = am.str;
  fm.identity = Math.max(fm.identity || 0, am.identity || 0);
  fm._identityPeak = Math.max(fm._identityPeak || 0, am._identityPeak || 0);
  fm._formatAge = Math.max(fm._formatAge || 0, am._formatAge || 0);
  if ((am.identityBudget || 0) > (fm.identityBudget || 0)) fm.identityBudget = am.identityBudget;

  // ── 10. END SIMULCAST; AM NO LONGER PROGRAMMING SOURCE ─────────────
  breakSimulcast(G, am.id);
  am.demoLean = 0;
  am.identity = 0;
  am._identityPeak = 0;
  am._formatAge = 0;
  am.identityBudget = 0;
  am.drift = {};
  delete am.driftHistory;
  daySlots.forEach(sl => { am.prog[sl] = { quality: 20, talent: null }; });
  am.oq = Math.round(Object.entries(SW).reduce((sum, [sl, w]) => sum + effSlotQForOq(am.prog[sl]) * w, 0));
  fm.oq = Math.round(Object.entries(SW).reduce((sum, [sl, w]) => sum + effSlotQForOq(fm.prog[sl]) * w, 0));

  const fmCall = fm.callLetters, amCall = am.callLetters;
  G.news.unshift({
    v: 'HIGH',
    t: `📻 ${fmCall} is now the flagship — ${FM[oldFormat]?.l || oldFormat}, brand, talent, and identity live on FM. ${amCall} is off the simulcast (automation shell only) — reformat or sell.`,
    y: G.year, p: G.period, iy: true
  });
  calcRev(fm, G);
  calcRev(am, G);
  return true;
}
function doMigrate(amId, fmId) {
  if (!applyFmSimulcastMigration(amId, fmId)) return;
  MP.action('migrate', { amId, fmId });
  cm('m-migrate');
  renderAll();
}

// 3b. FM BOOSTER
function openFmBooster(sid){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  if(s.sig.type!=='AM'){
    alert('FM Booster only applies to AM stations.');return;
  }
  if(G.year<2009){
    alert('FM translators for AM stations were not permitted by the FCC until 2009. To get FM presence before then, you need to acquire a full FM license or set up an AM/FM simulcast.');return;
  }
  if(s.fmBooster){
    document.getElementById('boostb').innerHTML=`
      <div class="ibox" style="border-color:var(--grn);color:var(--grn)">
        <strong>✓ FM TRANSLATOR ACTIVE</strong><br>
        ${s.callLetters} is broadcasting on ${s.freq} — a low-power FM translator covering the city core.
        ${(()=>{
          const _tFrac=Math.min(1,(s.sig.universe||0.32)/Math.max(s._boosterOrigSig?.universe||0.85,0.01));
          const _fringe=Math.round((1-_tFrac)*100);
          const _covered=Math.round(_tFrac*100);
          if(_tFrac>=0.95) return `Translator covers your full AM footprint — full erosion immunity.`;
          return `Translator covers ~${_covered}% of your AM footprint. The remaining ${_fringe}% (fringe listeners beyond the FM signal) still can&apos;t receive FM and continue to erode. A full FM license eliminates this.`;
        })()}
        Current share: ${(s.rat.share*100).toFixed(1)}%.
      </div>
      <button class="cnl" onclick="cm('m-boost')">CLOSE</button>`;
    om('m-boost');return;
  }
  const cost=getBoosterCost(G.year);
  const canAfford=G.cash>=cost;
  const isMusFmt=!['NEWS_TALK','SPORTS_TALK','PODCAST_TALK','GOSPEL','SPANISH'].includes(s.format);
  const erosionRisk=(isMusFmt&&s.sig.type==='AM')||(['NEWS_TALK','SPORTS_TALK'].includes(s.format)&&s.sig.type==='AM'&&!s.fmBooster&&!s.simulcastWith&&(G?.year||0)>=2007);
  document.getElementById('boostb').innerHTML=`
    <p class="di">An FM translator rebroadcasts your AM signal on a low-power FM frequency. Made available to AM stations by the FCC's AM Revitalization proceeding starting 2009 — typically by placing the AM on an HD Radio subchannel and qualifying a translator for that feed. It covers the city core (~99 watts) and picks up FM-only listeners in that footprint. <strong>It does not stop AM erosion entirely</strong> — listeners in your AM fringe beyond the translator's reach still can't receive the FM signal and keep drifting away. The bigger your AM signal, the more fringe audience remains exposed. A full FM license is the only complete solution. The translator also partially shields Talk and Sports from streaming-era AM signal quality penalties.</p>
    <div class="ms2">
      <div class="msh">TRANSLATOR DETAILS — ${G.year}</div>
      <div class="sr"><span class="lb">Station</span><span class="vl">${s.callLetters} · ${FM[s.format]?.l||s.format}</span></div>
      <div class="sr"><span class="lb">Current Signal</span><span class="vl">AM ${s.sig.pw} · ${s.freq}</span></div>
      <div class="sr"><span class="lb">After Translator</span><span class="vl" style="color:var(--grn)">FM Translator · city core coverage</span></div>
      <div class="sr"><span class="lb">Metro Coverage</span><span class="vl" style="color:var(--grn)">Full AM coverage + FM city core pickup</span></div>
      <div class="sr"><span class="lb">AM Erosion</span><span class="vl pos">✓ Stops immediately</span></div>
      <div class="sr"><span class="lb">FM Audience Pickup</span><span class="vl">Grows with FM penetration — gradual</span></div>
      <div class="sr"><span class="lb">Current AM Share</span><span class="vl">${(s.rat.share*100).toFixed(1)}%</span></div>
      <div class="sr"><span class="lb">Cost</span><span class="vl ${canAfford?'pos':'neg'}">${f$(cost)}</span></div>
      <div class="sr"><span class="lb">Cash After</span><span class="vl ${canAfford?'':'neg'}">${f$(G.cash-cost)}</span></div>
    </div>
    ${erosionRisk?`<div class="ibox" style="border-color:var(--amb)"><strong>⚠ EROSION RISK:</strong> ${FM[s.format]?.l||s.format} on AM loses audience every period as FM penetration grows. A translator stops that immediately.</div>`:''}
    ${!canAfford?`<div class="wbox"><strong>INSUFFICIENT FUNDS.</strong> You need ${f$(cost-G.cash)} more. Consider a loan.</div>`:''}
    <button class="cfm" onclick="doFmBooster('${sid}')" ${!canAfford?'disabled':''}>INSTALL TRANSLATOR — ${f$(cost)}</button>
    <button class="cnl" onclick="cm('m-boost')">NOT NOW</button>`;
  om('m-boost');
}

function doFmBooster(sid){
  const s=G.stations.find(st=>st.id===sid);if(!s||s.sig.type!=='AM'||s.fmBooster)return;
  if(G.year<2009){alert('FM translators for AM stations were not permitted until 2009.');return;}
  const cost=getBoosterCost(G.year);
  if(G.cash<cost){alert('Not enough cash.');return;}
  G.cash-=cost;
  if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}
  s.fmBooster=true;

  // FM Translator is ADDITIVE to the AM signal — not a replacement.
  // The station continues broadcasting on AM at full power.
  // The translator rebroadcasts on a low-power FM frequency, adding:
  //   - Access to FM-only listeners (car radios, portables that skip AM)
  //   - Immunity to AM erosion (classified as FM for erosion purposes)
  // Signal parameters: preserve the original AM reach/universe entirely.
  // Mark type FM for erosion immunity; pw='translator' for cost lookup.
  // A small fmBonus in the ratings engine handles the FM listener pickup.
  s._boosterOrigSig={type:s.sig.type,pw:s.sig.pw,reach:s.sig.reach,universe:s.sig.universe};
  s.sig.type='FM';         // FM classification — stops AM erosion
  s.sig.pw='translator';   // cost tier only — no signal downgrade
  // Keep original reach and universe — AM tower still broadcasts at full power
  // (reach and universe are unchanged; the translator adds FM pickup via fmBooster flag)

  // Assign an FM translator frequency
  const oldFreq=s.freq;
  const fmFreqs=['92.3 FM','93.7 FM','96.9 FM','98.3 FM','101.1 FM','105.3 FM','106.7 FM'];
  const usedFm=G.stations.map(st=>st.freq||st._deferFreq).filter(Boolean);
  const newFm=fmFreqs.find(f=>!usedFm.includes(f))||'107.9 FM';
  s.freq=newFm;
  s._boosterOrigFreq=oldFreq;

  G.news.unshift({
    v:'HIGH',
    t:`📡 ${s.callLetters} FM translator on ${newFm}. City core listeners shift to FM — AM erosion continues for fringe listeners beyond the translator footprint. A full FM license is the only path to complete immunity.`,
    y:G.year,p:G.period,iy:true
  });
  MP.action('fmbooster',{sid});
  cm('m-boost');calcRev(s,G);renderAll();
}

// 4. FORMAT CHANGE
let FS={sid:null,chosen:null};
function openFmt(sid){sid=ensureOpsSourceSid(sid);const s=G.stations.find(st=>st.id===sid);if(!s)return;FS={sid,chosen:null};rFmt(s);om('m-fm');}
function rFmt(s){
  const occ=G.stations.filter(st=>st&&!st._bpSlotDeferred&&st.id!==s.id).map(st=>st.format);
  const isAM=s.sig.type==='AM';
  const allFmts=Object.keys(FM).filter(f=>f!==s.format);
  const opts=allFmts.map(f=>{
    const meta=FM[f]||{};
    const unlocked=G.unlockedFormats.includes(f);
    const fmr=meta.fm&&isAM,cnt=occ.filter(o=>o===f).length,adj=FADJ[s.format]?.includes(f);
    let badge,bc,cls='fmo';
    if(!unlocked){badge=`UNLOCKS ${meta.unlock}`;bc='lock';cls+=' locked';}
    else if(fmr&&isAM){badge='AM — low youth reach';bc='risk';}
    else if(cnt>=2){badge='CROWDED';bc='risk';}
    else if(cnt===1){badge='CONTESTED';bc='risk';}
    else{badge='OPEN';bc='ok';}
    const pen=adj?'2-PERIOD RECOVERY':'3-PERIOD RECOVERY';
    const clickable=unlocked;
    return `<div class="${cls}${FS.chosen===f?' sel':''}" onclick="${clickable?('pickFmt(\''+f+'\')'):''}"><div><div class="fmn">${(meta.l||f).toUpperCase()}</div><div class="fmd">${meta.d||''}</div><div class="fmp2">${unlocked?`Penalty: ${pen} · CPM ×${(meta.cpm||1).toFixed(2)}`:''}</div></div><div><div class="fmbdg ${bc}">${badge}</div></div></div>`;
  }).join('');
  const adj2=FS.chosen&&FADJ[s.format]?.includes(FS.chosen);
  const ratingWarn=FS.chosen?`<div class="wbox"><strong>RATINGS WARNING:</strong> Flipping to ${FM[FS.chosen]?.l||FS.chosen} will crater ratings for ${adj2?'2':'3'} periods.</div>`:'';
  // Identity betrayal warning — the higher the identity, the more dramatic
  const identity=s.identity||0;
  // Exemption: if the format is already live on a simulcast partner, the brand's
  // "spirit" isn't dying — it's just moving transmitters. No betrayal.
  const _simBuddy = s.simulcastWith ? G.stations.find(st=>st.id===s.simulcastWith) : null;
  const _formatSurvivesOnPartner = _simBuddy && _simBuddy.format===s.format;
  let identityWarn='';
  if(FS.chosen&&identity>=20&&!_formatSurvivesOnPartner){
    const fmtName=FM[s.format]?.l||s.format;
    const yrs=Math.round((s._formatAge||0)/2);
    const peak=Math.round(s._identityPeak||identity);
    const loss=Math.round(identity*0.75); // they'll lose 75% of identity on flip
    if(identity>=60){
      identityWarn=`<div class="wbox" style="border-color:var(--red);background:rgba(220,38,38,.08)">
        <strong style="color:var(--red)">⚠ COMMUNITY BETRAYAL WARNING</strong><br>
        <span style="font-size:15px">${s.callLetters} has been <em>${fmtName}</em> for ${yrs} year${yrs!==1?'s':''} — Community Identity: <strong>${Math.round(identity)}/100</strong>. This station isn't just a business anymore. It belongs to its audience.<br><br>
        Flipping format will permanently destroy <strong>${loss} identity points</strong>. Listeners who stayed through the lean years will feel genuinely betrayed. Some will never come back — not because of ratings math, but because you broke a promise.</span>
      </div>`;
    } else if(identity>=35){
      identityWarn=`<div class="wbox" style="border-color:var(--amb)">
        <strong>COMMUNITY TIE WARNING</strong><br>
        <span style="font-size:15px">${s.callLetters} has built real community roots over ${yrs} year${yrs!==1?'s':''} (Identity: ${Math.round(identity)}/100). A format flip will set that back significantly. Consider whether the ratings upside is worth it.</span>
      </div>`;
    } else {
      identityWarn=`<div style="font-size:14px;color:var(--mut);margin-bottom:10px">Community Identity: ${Math.round(identity)}/100 — ${yrs} year${yrs!==1?'s':''} invested. Some roots will be lost.</div>`;
    }
  }
  // If format survives on partner, show a reassuring note rather than a warning
  if(FS.chosen&&identity>=20&&_formatSurvivesOnPartner){
    const fmtName=FM[s.format]?.l||s.format;
    identityWarn=`<div class="ibox" style="border-color:var(--grn)">
      <strong style="color:var(--grn)">✓ FORMAT LIVES ON</strong><br>
      <span style="font-size:15px">${_simBuddy.callLetters} is already carrying ${fmtName} — the brand and its ${Math.round(identity)}/100 community identity stay there. Flipping this transmitter to a new format carries <strong>no betrayal penalty</strong>. The audience hasn't been abandoned; they have a home.</span>
    </div>`;
  }
  const _simPartnerFmt = s.simulcastWith ? G.stations.find(st=>st.id===s.simulcastWith) : null;
  const simWarning = _simPartnerFmt
    ? `<div class="bbox" style="border-color:var(--amb);margin-bottom:10px">
        <strong>⚠ This station is simulcasting with ${_simPartnerFmt.callLetters}.</strong><br>
        Choose below whether to reformat both stations together (keeps the simulcast) or just this one (breaks the pair, leaving ${_simPartnerFmt.callLetters} on ${FM[_simPartnerFmt.format]?.l||_simPartnerFmt.format}).
      </div>`
    : '';
  const confirmBtns = _simPartnerFmt
    ? `<button class="cfm" onclick="doFmt(true)" ${!FS.chosen?'disabled':''}>REFORMAT BOTH + KEEP SIMULCAST</button>
       <button class="cfm" onclick="doFmt(false)" style="background:rgba(245,166,35,.15);margin-top:6px" ${!FS.chosen?'disabled':''}>REFORMAT THIS STATION ONLY (breaks simulcast)</button>`
    : `<button class="cfm" onclick="doFmt()" ${!FS.chosen?'disabled':''}>CONFIRM FORMAT CHANGE</button>`;
  document.getElementById('fmb').innerHTML=`<p class="di">Currently: <strong>${FM[s.format]?.l||s.format}</strong> on ${s.callLetters}.</p>${simWarning}<div class="fmg">${opts}</div>${identityWarn}${ratingWarn}${confirmBtns}<button class="cnl" onclick="cm('m-fm')">CANCEL</button>`;
}
function pickFmt(f){FS.chosen=f;rFmt(G.stations.find(st=>st.id===FS.sid));}
function doFmt(keepSim){
  if(!FS.chosen)return;
  const s=G.stations.find(st=>st.id===FS.sid);
  const old=s.format,nf=FS.chosen,adj=FADJ[old]?.includes(nf),pen=adj?.30:.55;
  const _simPartnerId = s.simulcastWith;
  const _simPartner = _simPartnerId ? G.stations.find(st=>st.id===_simPartnerId) : null;
  // If keepSim=true: reformat partner first (no breakage), then reformat this station.
  // If keepSim=false or no simulcast: break link, reformat only this station.
  if(_simPartner && keepSim){
    // Apply format to partner silently (no quality penalty — same programming change)
    _simPartner.format = nf;
    _simPartner.brand  = gb(nf, _simPartner.freq, G?.city);
    _simPartner._formatAge = 0;
    _simPartner.ops.sell = ['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'].includes(nf)?0.60:0.55;
    Object.values(_simPartner.prog).forEach(sd=>{if(sd)sd.quality=Math.round(sd.quality*(1-pen));});
    _simPartner.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(_simPartner.prog[sl])*w,0));
    COH.forEach(c=>{if(_simPartner.mom[c])_simPartner.mom[c].cur*=(1-pen);});
    // Apply identity penalty to simulcast partner — same betrayal, same penalty
    if((_simPartner.identity||0)>0){
      const _partnerCeiling=Math.round((COMMUNITY_IDENTITY[nf]||0.3)*100);
      _simPartner.identity=Math.min(Math.round(_simPartner.identity*0.25),_partnerCeiling);
      _simPartner._identityPeak=_simPartner.identity;
    }
    _simPartner._formatAge=0;
    // Do NOT break simulcast — partner stays linked
    G.news.unshift({v:'LOW',t:`${_simPartner.callLetters} (simulcast partner) also reformatted to ${FM[nf]?.l||nf}.`,y:G.year,p:G.period});
  } else {
    // When breaking simulcast to reformat this station only:
    // if the partner keeps the original format, identity stays with them — this station is now blank.
    const _bsPartner = _simPartner; // already found above
    const _partnerKeepsFormat = _bsPartner && _bsPartner.format === s.format;
    if(_partnerKeepsFormat){
      // Ensure partner has full identity (max of both) before we zero this station
      _bsPartner.identity = Math.max(_bsPartner.identity||0, s.identity||0);
      _bsPartner._identityPeak = Math.max(_bsPartner._identityPeak||0, s._identityPeak||0);
      _bsPartner._formatAge = Math.max(_bsPartner._formatAge||0, s._formatAge||0);
      if((_bsPartner.identityBudget||0)<(s.identityBudget||0)) _bsPartner.identityBudget=s.identityBudget||0;
      // Zero this station — it's giving up the format, not the partner
      s.identity=0; s._identityPeak=0; s._formatAge=0; s.identityBudget=0;
    }
    breakSimulcast(G,s.id);
  }
  const preFlipIdentity=s.identity||0;
  const preFlipFmt=FM[old]?.l||old;
  s.format=nf;s.brand=gb(nf,s.freq,G?.city);
  // Reset format age — community roots tied to the OLD format
  s._formatAge=0;
  // Reset sellout rate — new format starts with a fresh advertiser relationship.
  // A News/Talk station that flips to Album Rock can't keep its talk-format sell premium.
  const _talkFmts=['NEWS_TALK','SPORTS_TALK','PODCAST_TALK'];
  s.ops.sell=_talkFmts.includes(nf)?0.60:0.55;
  // Identity hit: high-identity stations take a major, permanent hit on betrayal
  // 75% loss — some residual goodwill remains (the building, the callsign, the memory)
  if(preFlipIdentity>0){
    s.identity=Math.round(preFlipIdentity*0.25);
    // New format ceiling may be lower — don't let residual exceed new potential
    const newCeiling=Math.round((COMMUNITY_IDENTITY[nf]||0.3)*100);
    s.identity=Math.min(s.identity,newCeiling);
  }
  Object.values(s.prog).forEach(sd=>{if(sd)sd.quality=Math.round(sd.quality*(1-pen));});
  s.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w,0));
  COH.forEach(c=>{if(s.mom[c])s.mom[c].cur*=(1-pen);});
  if(!adj)Object.entries(s.prog).forEach(([sl,sd])=>{if(sd?.talent&&Math.random()<.25){sd.talent=null;sd.quality*=.60;}});
  s.flog.push({from:old,to:nf});
  // Drama: name the community loss if it was meaningful
  const betrayalNote=preFlipIdentity>=40?` Community identity drops from ${Math.round(preFlipIdentity)} → ${Math.round(s.identity)}.`:'';
  G.news.unshift({v:'HIGH',t:`You flip ${s.callLetters}: ${preFlipFmt} → ${FM[nf]?.l||nf} — "${s.brand}".${betrayalNote}`,y:G.year,p:G.period});
  logHistory(s,'FORMAT',`Reformatted: ${preFlipFmt} → ${FM[nf]?.l||nf}${preFlipIdentity>30?' (identity was '+Math.round(preFlipIdentity)+')':''}`,G);
  calcRev(s,G);cm('m-fm');
  MP.action('fmt', {sid:s.id, format:nf});
  renderAll();
}

// 5. ACQUIRE
const ACP={dominant:2800000,strong:1800000,moderate:950000,emerging:550000,niche:350000,weak:200000};
let AS={chosen:null};
function openAcq(){AS={chosen:null};rAcq();om('m-ac');}
function rAcq(){
  const lim=fccLimits(G.year,G.stations.length);
  const myOwned=fccOwned('player',G);
  const canAcqAM=fccCanAcquire('player','AM',G);
  const canAcqFM=fccCanAcquire('player','FM',G);
  const limDesc=lim.mode==='pre96'?`${lim.am} AM + ${lim.fm} FM`:`${lim.total} total · max ${lim.perService}/service · ${G.stations.length} signals in market`;
  const avail=G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic);
  if(!avail.length){document.getElementById('acb').innerHTML='<p class="di">No stations available for acquisition.</p>';return;}
  if(!canAcqAM&&!canAcqFM){document.getElementById('acb').innerHTML=`<p class="di">You have reached the FCC ownership limit — <strong>${limDesc}</strong>.</p>`;return;}
  const opts=avail.map(s=>{
    const price=s.isPublic
      ? Math.round((s.oq*2000+62500)/12500)*12500
      : (acqPrice(s,G)||ACP[s.str]||50000);
    const can=G.cash>=price;
    const sigType=s.sig.type==='AM'||s.fmBooster?'AM':'FM';
    const typeOk=fccCanAcquire('player',sigType,G);
    const blocked=!typeOk;
    const isSel=AS.chosen===s.id;
    return `<div class="aco ${(can&&typeOk)?'':'nope'}" style="${isSel?'border-color:var(--grn);background:rgba(82,227,110,.06)':''}">
      <div style="flex:1"><div class="acn" style="color:${s.color}">${callDisplay(s)}</div>
      <div class="aci">${s.freq} · ${s.sig.pw} · ${FM[s.format]?.l||s.format} · ${s.sig.type} · Quality: ${s.oq}${s.isPublic?'  <span style="color:#7dd3fc;font-size:14px">PUBLIC — converts to commercial on acquisition</span>':''}</div>
      <div class="aci" style="margin-top:2px">Share: ${pct(s.rat.share)} · Rev: ${f$(s.fin.rev)}/period${s.isPublic?' · <span style="color:#7dd3fc">Non-commercial</span>':''}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;margin-left:8px">
        <span style="font-family:var(--fd);font-size:15px;color:${(can&&typeOk)?'var(--amb)':'var(--red)'}">${f$(price)}</span>
        ${(can&&typeOk)?`<button class="abt" style="white-space:nowrap;background:${isSel?'var(--grn)':'transparent'};color:${isSel?'#000':'var(--wht)'};border:1px solid ${isSel?'var(--grn)':'var(--off)'};font-size:15px" onclick="${isSel?'doAcq()':'pickAcq(\''+s.id+'\')'}">
          ${isSel?'✓ CONFIRM':'SELECT'}</button>`:`<span style="font-size:15px;color:var(--red)">${blocked?'FCC LIMIT':'NO FUNDS'}</span>`}
      </div></div>`;
  }).join('');
  const ownDesc=lim.mode==='pre96'?`${myOwned.am}/${lim.am} AM, ${myOwned.fm}/${lim.fm} FM`:`${myOwned.total}/${lim.total} total (${myOwned.am} AM, ${myOwned.fm} FM)`;
  document.getElementById('acb').innerHTML=`<p class="di">FCC limit: <strong>${limDesc}</strong>. You own: <strong>${ownDesc}</strong>. Cash: <strong style="color:var(--amb)">${f$(G.cash)}</strong>. Expect 20–35% listener churn after acquisition.</p><div class="acg">${opts}</div><button class="cnl" onclick="cm('m-ac')">CLOSE</button>`;
}
function pickAcq(id){AS.chosen=id;rAcq();}
function doAcq(){
  if(!AS.chosen)return;
  const s=G.stations.find(st=>st.id===AS.chosen);
  if(!s)return;
  const price=s.isPublic
    ? Math.round((s.oq*2000+62500)/12500)*12500
    : acqPrice(s,G);
  if(G.cash<price)return;
  G.cash-=price;
  if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}
  // Release from corporate owner if applicable
  if(s.corpOwner&&G.corps){
    const corp=G.corps.find(c=>c.id===s.corpOwner);
    if(corp){corp.stations=corp.stations.filter(id=>id!==s.id);corp.budget+=price*0.5;}
  }
  const wasCorpOwned=s.corpOwner?`(from ${s.corpName})`:'';
  s.corpOwner=null;s.corpName=null;s.corpColor=null;
  s.isPlayer=true;s.color=['#f5a623','#60a5fa','#34d399','#f87171'][MP.playerId%4];s._mpOwner=MP.playerId;
  MP.action('acq',{sid:s.id, playerId:MP.playerId, color:s.color});
  G.ps=G.stations.filter(st=>st.isPlayer);
  // ── ACQUISITION TALENT NORMALIZATION ──────────────────────────
  // Rival talent accumulates inflated salaries from years of AI decay() loops.
  // A quality-35 host on a star contract is an artifact of simulation drift, not reality.
  // On acquisition, reset salaries to what each host's quality actually warrants.
  // High-quality talent (Q65+) keeps their salary — they earned it and may walk if cut.
  // This mirrors real acquisitions: new ownership renegotiates or talent departs.
  (function normAcqTalent(){
    const isTalk=TALK_FMTS.includes(s.format);
    const talkDisc=isTalk?0.88:1.0;
    // Quality-to-salary-tier thresholds
    // Entry: Q<42, Mid: Q<68, Star: Q>=68
    // Use global SAL table midpoints for quality-appropriate salary floors/caps
    const salMid=(slot,tier)=>{const r=SAL[slot]?.[tier];return r?Math.round((r[0]+r[1])/2):20000;};
    Object.entries(s.prog).forEach(([sl,sd])=>{
      if(!sd?.talent)return;
      const q=sd.talent.quality||30;
      const tier=q<42?'entry':q<68?'mid':'star';
      const fair=Math.round(salInfl(salMid(sl,tier),G.year)*talkDisc/500)*500;
      // Normalize: bring salary to within ±40% of fair market rate for this quality tier
      if(sd.talent.salary>fair*1.4) sd.talent.salary=fair;
      if(sd.talent.salary<fair*0.6) sd.talent.salary=fair;
      // Extend contract — new ownership means fresh 2-period deal
      sd.talent.cyr=2;
      sd.talent.morale=Math.max(sd.talent.morale||55, 55); // fresh start, morale floors at 55
    });
  })();

  // ── ACQUISITION CHURN ──────────────────────────────────────────
  // Listeners don't know you bought the station. But they will notice:
  // ownership changes → staff turnover, subtle shifts in feel.
  // Apply a momentum dip: targets drop 20-35% immediately, recover naturally.
  // If you change format, churn is severe (handled separately in doFmt).
  // The "loyal audience" has to be earned, not purchased.
  const churnFrac = 0.22; // ownership change causes ~22% listener churn
  Object.keys(s.mom||{}).forEach(coh=>{
    const m=s.mom[coh];
    if(m){
      m.tgt=Math.max(0.002, m.tgt*(1-churnFrac));
      m.cur=Math.max(0.002, m.cur*(1-churnFrac*0.5)); // cur dips less than target — lag
    }
  });
  // Store acquisition year for UI display
  s._acqYear=G.year;

  const churnPct=Math.round(churnFrac*100);
  G.news.unshift({v:'HIGH',
    t:`You acquire ${s.callLetters} (${FM[s.format]?.l||s.format}) ${wasCorpOwned||''} for ${f$(price)}. Expect ~${churnPct}% listener churn as the station transitions — keep format and talent stable to minimize losses.`,
    y:G.year,p:G.period,iy:true});
  cm('m-ac');renderAll();
}

// 6. SIMULCAST
let SimS={a:null,b:null};
function openSim(sid){
  SimS={a:sid,b:null};rSim();om('m-sim');
}
function rSim(){
  const s=G.stations.find(st=>st.id===SimS.a);
  if(!s){document.getElementById('simb').innerHTML='<p class="di">Error.</p>';return;}
  // If already in simulcast, offer to break it
  if(s.simulcastWith){
    const partner=G.stations.find(st=>st.id===s.simulcastWith);
    let _progSrc=s, _rcv=partner;
    if(partner){
      if(s._simulcastSource && !partner._simulcastSource){ _progSrc=s; _rcv=partner; }
      else if(!s._simulcastSource && partner._simulcastSource){ _progSrc=partner; _rcv=s; }
      else { const L=simLead(s,partner); _progSrc=L; _rcv=L.id===s.id?partner:s; }
    }
    const _talentSlots=_progSrc?Object.values(_progSrc.prog).filter(sd=>sd?.talent).map(sd=>sd.talent.name):[];
    const _simulcastFmt=_progSrc?FM[_progSrc.format]?.l||_progSrc.format:FM[s.format]?.l||s.format;
    document.getElementById('simb').innerHTML=`
      <p class="di"><strong>${s.callLetters}</strong> is currently simulcasting with <strong>${partner?callDisplay(partner):'unknown'}</strong> on <em>${_simulcastFmt}</em>.</p>
      <div class="bbox"><strong>Simulcast benefits:</strong> Shared talent pool, shared brand. AM↔FM pairs: AM gets +15% audience reach bonus. Both stations counted as one format for upkeep.</div>
      <div class="wbox"><strong>If you break this simulcast:</strong><br>
        <strong>${_progSrc.callLetters}</strong> (programming source) keeps the format, talent${_talentSlots.length?' ('+_talentSlots.join(', ')+'​)':''}, brand identity, and drift positioning.<br>
        <strong>${_rcv?_rcv.callLetters:'—'}</strong> (receiver) loses simulcast echo — reformat it next turn.</div>
      <button class="cfm" onclick="doBreakSim('${s.id}')" style="background:var(--red);color:var(--wht)">BREAK SIMULCAST</button>
      <button class="cnl" onclick="cm('m-sim')">CANCEL</button>`;
    return;
  }
  // Only own stations, not already paired
  const myStations = MP.mode==='live' ? G.ps.filter(st=>st._mpOwner===MP.playerId) : G.ps;
  const partners=myStations.filter(p=>p.id!==s.id&&!p.simulcastWith);
  if(!partners.length){
    document.getElementById('simb').innerHTML=`<p class="di">No eligible partner stations. You need at least two stations you own that are not already simulcast pairs.</p><button class="cnl" onclick="cm('m-sim')">CLOSE</button>`;
    return;
  }
  // Source = station this modal was opened from (s). Target = selected partner.
  const opts=partners.map(p=>{
    const sameFmt=p.format===s.format;
    const fmtNote=sameFmt
      ?`<span style="color:var(--mut);font-size:14px">${FM[p.format]?.l||p.format} — formats match ✓</span>`
      :`<span style="color:var(--amb);font-size:14px">⚡ <strong>${callDisplay(p)}</strong> will adopt <strong>${s.callLetters}</strong>'s <em>${FM[s.format]?.l||s.format}</em> (repeater)</span>`;
    const talentNote=`<span style="color:var(--mut);font-size:14px">Partner drops separate local staffing; ${s.callLetters} keeps the on-air roster.</span>`;
    return `<div class="aco${SimS.b===p.id?' sel':''}" onclick="pickSim('${p.id}')">
      <div>
        <div class="acn" style="color:${p.color||'var(--amb)'}">${callDisplay(p)}</div>
        <div class="aci">${p.freq} · ${p.fmBooster?'FM BOOSTER':p.sig.type}</div>
        ${fmtNote}<br>${talentNote}
      </div>
    </div>`;
  }).join('');
  const partnerPreview = SimS.b ? (()=>{
    const partner=G.stations.find(st=>st.id===SimS.b);
    if(!partner) return '';
    return `<div class="ibox" style="margin-top:8px"><strong>Programming source:</strong> ${callDisplay(s)} — keeps all on-air talent.<br><strong>Simulcast receiver:</strong> ${callDisplay(partner)} — carries ${s.callLetters}'s programming on-air; local sales, budgets, demo target, and format strategy stay under your control (no separate local daypart hosts).</div>`;
  })() : '';
  // Pre-compute format direction for the currently selected partner (if any)
  const _previewPartner = SimS.b ? G.stations.find(st=>st.id===SimS.b) : null;
  let fmtDirectionNote = '';
  if(_previewPartner){
    const fmtMatch = s.format===_previewPartner.format;
    fmtDirectionNote = fmtMatch
      ? `<div class="ibox" style="margin-top:6px;border-color:var(--grn)">✓ Both stations already play <strong>${FM[s.format]?.l||s.format}</strong> — no format change needed.</div>`
      : `<div class="ibox" style="margin-top:6px;border-color:var(--amb)">⚡ <strong>${callDisplay(_previewPartner)}</strong> will reformat to <strong>${FM[s.format]?.l||s.format}</strong> and carry ${s.callLetters}'s programming (repeater).</div>`;
  } else {
    fmtDirectionNote = `<span style="color:var(--mut);font-size:15px"><strong>${s.callLetters}</strong> is the <strong>programming source</strong>. Choose a partner below — it becomes the <strong>receiver / repeater</strong>, adopting this station's format and identity. Local talent on the partner no longer applies.</span>`;
  }
  document.getElementById('simb').innerHTML=`
    <p class="di"><strong>Simulcast this station:</strong> <strong>${callDisplay(s)}</strong> (${FM[s.format]?.l||s.format} · ${s.fmBooster?'FM BOOSTER':s.sig.type}) → select a partner to receive this signal.</p>
    <div class="bbox"><strong>How it works:</strong> The station you opened stays the programming source. The partner you pick becomes the simulcast receiver — it takes this format/brand and echoes the source's on-air programming; your local management (sales, budgets, demo target, format strategy) stays on the receiver. AM↔FM pairs still get +15% AM reach bonus where applicable.<br><br>${fmtDirectionNote}</div>
    <div class="acg">${opts}</div>
    ${partnerPreview}
    <button class="cfm" onclick="doSim()" ${!SimS.b?'disabled':''}>SIMULCAST THIS STATION</button>
    <button class="cnl" onclick="cm('m-sim')">CANCEL</button>`;
}
function pickSim(id){SimS.b=id;rSim();}
/** sourceId = station whose modal was opened; targetId = selected partner (repeater). */
function applySimulcastPair(sourceId,targetId,opts){
  const suppressNews=opts&&opts.suppressNews;
  const src=G.stations.find(st=>st.id===sourceId), dst=G.stations.find(st=>st.id===targetId);
  if(!src||!dst)return false;
  if(dst.format!==src.format){
    dst.format=src.format;
    dst.brand=src.brand;
    if(!suppressNews) G.news.unshift({v:'LOW',t:`${dst.callLetters} (${dst.sig.type}) reformatted to ${FM[src.format]?.l||src.format} to simulcast ${src.callLetters}'s programming.`,y:G.year,p:G.period});
  }
  src.simulcastWith=dst.id;
  dst.simulcastWith=src.id;
  src._simulcastSource=true;
  dst._simulcastSource=false;
  const slots=['morningDrive','afternoonDrive','midday','evening','overnight'];
  slots.forEach(sl=>{
    const ssd=src.prog[sl];
    if(!ssd){
      dst.prog[sl]={quality:20,talent:null};
      return;
    }
    dst.prog[sl]={quality:ssd.quality,talent:null};
  });
  src.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(src.prog[sl])*w,0));
  dst.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(dst.prog[sl])*w,0));
  // On-air brand matches programming source; receiver keeps local management (drift, demo lean, sales, ops budgets,
  // marketing, salesForce, identity scores, _history, etc.) — do not assign or clear those here.
  dst.brand=src.brand;
  return true;
}
function doSim(){
  if(!SimS.a||!SimS.b)return;
  if(!applySimulcastPair(SimS.a,SimS.b,{}))return;
  const src=G.stations.find(st=>st.id===SimS.a), dst=G.stations.find(st=>st.id===SimS.b);
  logSimulcastPairHistory(src,dst,G);
  const slots=['morningDrive','afternoonDrive','midday','evening','overnight'];
  const talentNote=slots.some(sl=>src.prog[sl]?.talent)?` On-air talent remains on ${src.callLetters}.`:'';
  G.news.unshift({v:'MEDIUM',t:`${dst.callLetters} now simulcasts ${src.callLetters} (${FM[src.format]?.l||src.format}).${talentNote}`,y:G.year,p:G.period});
  MP.action('sim', {sid:SimS.a, partnerId:SimS.b});
  cm('m-sim');renderAll();
}
function doBreakSim(id){
  const s=G.stations.find(st=>st.id===id); if(!s||!s.simulcastWith) return;
  const partner=G.stations.find(st=>st.id===s.simulcastWith); if(!partner) { breakSimulcast(G,id); cm('m-sim'); renderAll(); return; }

  // Programming source (keeps talent) = station marked when simulcast was created; else FM lead heuristic.
  let lead, junior;
  if(s._simulcastSource && !partner._simulcastSource){ lead=s; junior=partner; }
  else if(!s._simulcastSource && partner._simulcastSource){ lead=partner; junior=s; }
  else { lead=simLead(s,partner); junior=lead.id===s.id?partner:s; }

  // ── TALENT: junior loses all talent (it lives on the lead card) ──
  const slots=['morningDrive','afternoonDrive','midday','evening','overnight'];
  slots.forEach(sl=>{
    if(junior.prog[sl]?.talent) junior.prog[sl].talent=null;
  });
  junior.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(junior.prog[sl])*w,0));

  // ── DRIFT / FORMAT STRATEGY: stays with lead only ────────────────
  if(junior.drift && lead.format && junior.drift[lead.format]!==undefined){
    delete junior.drift[lead.format];
  }
  if(junior.driftHistory && lead.format){
    delete junior.driftHistory[lead.format];
  }

  // ── IDENTITY: junior resets (community roots stay with lead brand) ─
  junior.identity=0; junior._identityPeak=0; junior._formatAge=0; junior.identityBudget=0;

  breakSimulcast(G,id);
  G.news.unshift({v:'LOW',t:`Simulcast broken. ${lead.callLetters} keeps the format, talent, and brand. ${junior.callLetters} is now unformatted.`,y:G.year,p:G.period});
  cm('m-sim');renderAll();
  MP.action('breaksim', {sid:id});
}

// 7. SELL STATION
function openSell(sid){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const _myOwnedStns = MP.mode==='live' ? G.ps.filter(s=>s._mpOwner===MP.playerId) : G.ps;
  if(_myOwnedStns.length<=1){document.getElementById('sellb').innerHTML='<p class="di">You cannot sell your only station.</p><button class="cnl" onclick="cm(\'m-sell\')">CLOSE</button>';om('m-sell');return;}
  // Valuation: market-aware (FM premium, market rank, quality)
  const annualRev=s.fin.rev*2;
  const signalMult=(s.sig.type==='FM'&&!s.fmBooster)?1.35:s.fmBooster?1.10:1.0;
  const allCommS=[...G.stations].filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic).sort((a,b)=>b.rat.share-a.rat.share);
  const sRank=allCommS.findIndex(st=>st.id===s.id)+1;
  const rankMult=sRank===1?1.30:sRank<=3?1.15:sRank<=5?1.05:1.0;
  const qMult=s.oq>=75?1.10:s.oq>=55?1.0:0.90;
  const price=Math.round(Math.max(annualRev*3, annualRev*3*signalMult*rankMult*qMult)/50000)*50000;
  const multipleDisplay=(price/Math.max(annualRev,1)).toFixed(1);
  document.getElementById('sellb').innerHTML=`
    <p class="di">Sell <strong>${s.callLetters}</strong> — ${FM[s.format]?.l||s.format}.</p>
    <div class="ms2"><div class="msh">VALUATION</div>
      <div class="sr"><span class="lb">Annual Revenue</span><span class="vl">${f$(annualRev)}</span></div>
      <div class="sr"><span class="lb">Signal</span><span class="vl">${s.sig.type==='FM'&&!s.fmBooster?'FM — premium license':s.fmBooster?'FM Translator':'AM'}</span></div>
      <div class="sr"><span class="lb">Market Rank</span><span class="vl">#${sRank} of ${allCommS.length}</span></div>
      <div class="sr"><span class="lb">Revenue Multiple</span><span class="vl">${multipleDisplay}× annual</span></div>
      <div class="sr"><span class="lb">Asking Price</span><span class="vl amb">${f$(price)}</span></div>
      <div class="sr"><span class="lb">Your Cash After Sale</span><span class="vl pos">${f$(G.cash+price)}</span></div>
    </div>
    ${s.simulcastWith?'<div class="wbox"><strong>Note:</strong> This station is in a simulcast. Selling will break the pair.</div>':''}
    <button class="cfm" onclick="doSell('${s.id}','${price}')">CONFIRM SALE</button>
    <button class="cnl" onclick="cm('m-sell')">CANCEL</button>`;
  om('m-sell');
}
function doSell(sid,price){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  G.cash+=parseInt(price);
  breakSimulcast(G,sid);
  if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}
  s.isPlayer=false;s.color=s.color||'#6b7280';
  G.ps=G.stations.filter(st=>st.isPlayer);
  // Post-1996: sold stations become acquisition targets for corp buyers
  if(G.year>=1996&&G.corps&&Math.random()<0.5){
    const eager=G.corps.filter(c=>c.budget>parseInt(price)).sort((a,b)=>b.aggression-a.aggression)[0];
    if(eager){
      s.corpOwner=eager.id;s.corpName=eager.name;s.corpColor=eager.color;
      eager.stations.push(s.id);eager.budget-=parseInt(price);
      s.pers={...PD.CORP_RADIO};
      G.news.unshift({v:'MEDIUM',t:`${eager.name.split(' ')[0]} immediately snaps up ${s.callLetters} — the consolidation machine never sleeps.`,y:G.year,p:G.period});
    }
  }
  G.news.unshift({v:'MEDIUM',t:`You sell ${s.callLetters} (${FM[s.format]?.l}) for ${f$(price)}`,y:G.year,p:G.period});
  MP.action('sell', {sid});
  cm('m-sell');renderAll();
}

// ── SAVE / LOAD ────────────────────────────────────────────────────
const SAVE_KEY='wavelength_autosave';
const SAVE_VERSION=1;

function saveGame(label){
  const payload={v:SAVE_VERSION,saved:new Date().toISOString(),label:label||'Manual Save',G};
  // localStorage autosave
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(payload));}catch(e){}
  return payload;
}

function autoSave(){
  try{
    const payload={v:SAVE_VERSION,saved:new Date().toISOString(),label:'Autosave',G};
    localStorage.setItem(SAVE_KEY,JSON.stringify(payload));
  }catch(e){}
}

function exportSave(){
  const _saveStns = MP.mode==='live' ? G.ps.filter(s=>s._mpOwner===MP.playerId) : G.ps;
  const payload=saveGame(`${G.year} ${G.period===1?'Spring':'Fall'} — ${_saveStns.map(s=>s.callLetters).join(', ')}`);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  const d=new Date();
  a.download=`wavelength-${G.year}-${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
  a.click();URL.revokeObjectURL(url);
  G.news.unshift({v:'LOW',t:`💾 Game saved: ${payload.label}`,y:G.year,p:G.period});
  openSaveLoad();
}

function importSave(file){
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const payload=JSON.parse(e.target.result);
      if(!payload.G||!payload.G.year){throw new Error('Invalid save file');}
      if(!G)G={};
      Object.assign(G,payload.G);
      migrateSave(G); // handles all field migrations and public station injection
      G.news.unshift({v:'HIGH',t:`📂 Save loaded: ${payload.label||'Unknown'} (${payload.saved?.slice(0,10)||'?'})`,y:G.year,p:G.period});
      cm('m-save');renderAll();
    }catch(err){
      alert('Could not load save file: '+err.message);
    }
  };
  reader.readAsText(file);
}

function getLocalSave(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    return raw?JSON.parse(raw):null;
  }catch(e){return null;}
}

function openSaveLoad(){
  const local=getLocalSave();
  const localInfo=local
    ?`<div class="bbox">
        <strong>AUTOSAVE FOUND</strong><br>
        ${local.label} · ${local.saved?.slice(0,10)||'?'} · ${local.G?.year||'?'} ${local.G?.period===1?'Spring':'Fall'}<br>
        <button class="abt g" style="margin-top:8px;width:100%" onclick="loadLocalSave()">▶ RESUME THIS GAME</button>
      </div>`
    :'<div class="ibox" style="color:var(--mut)">No autosave found in this browser.</div>';

  document.getElementById('saveb').innerHTML=`
    <p class="di">Save your game to a file or resume from a previous session.</p>
    ${localInfo}
    <div class="ms2">
      <div class="msh">CURRENT GAME — ${G.year} ${G.period===1?'Spring':'Fall'}</div>
      <div class="sr"><span class="lb">Stations</span><span class="vl">${(MP.mode==='live'?G.ps.filter(s=>s._mpOwner===MP.playerId):G.ps).map(s=>s.callLetters).join(', ')}</span></div>
      <div class="sr"><span class="lb">Cash</span><span class="vl ${G.cash>=0?'pos':'neg'}">${f$(G.cash)}</span></div>
      <div class="sr"><span class="lb">Total Listeners</span><span class="vl">${(MP.mode==='live'?G.ps.filter(s=>s._mpOwner===MP.playerId):G.ps).reduce((s,st)=>s+(st.rat?.aqh||0),0).toLocaleString()} AQH</span></div>
    </div>
    <button class="cfm" onclick="exportSave()">💾 DOWNLOAD SAVE FILE</button>
    <button class="abt" style="width:100%;margin-top:8px" onclick="cm('m-save');openScenSelect(null)">🎮 NEW GAME</button>
    <div style="margin-top:12px">
      <label class="cfm" style="display:block;text-align:center;cursor:pointer">
        📂 LOAD SAVE FILE
        <input type="file" accept=".json" style="display:none" onchange="importSave(this.files[0])">
      </label>
    </div>
    <button class="cnl" style="margin-top:8px" onclick="cm('m-save')">CLOSE</button>`;
  om('m-save');
}

function migrateSave(G){
  // Fix missing fields added in recent updates
  G.loans=G.loans||[];
  if(G.corps)rehydrateCorps(G); // re-link corp ownership after save/load
  G.corps=G.corps||null;
  G.rankerHistory=G.rankerHistory||[];
  G.finHistory=G.finHistory||[];
  G.stationFinHistory=G.stationFinHistory||{};
  if(!G.score)G.score={isSandbox:false,shareHistory:[],peakRevenue:0,decadeScores:{}};
  G._atl1970DeferredQueue=G._atl1970DeferredQueue||[];
  // Ensure fin.fix exists on all stations (added for cost breakdown display)
  (G.stations||[]).forEach(s=>{
    if(s._bpSlotDeferred)return;
    // Ensure fmBooster field exists
    if(s.fmBooster===undefined)s.fmBooster=false;
  // Translator signal restoration: old saves had universe/reach replaced with translator's weak values.
  // Restore original AM signal parameters — the translator is additive, not a replacement.
  if(s.fmBooster && s._boosterOrigSig && s.sig.universe < 0.50){
    s.sig.reach = s._boosterOrigSig.reach;
    s.sig.universe = s._boosterOrigSig.universe;
  }
  // Salary renormalization: two-way correction so existing talent reflects current scale.
  // Old saves may have talent at legacy low rates OR at old-inflation highs.
  // Bring all talent within a reasonable band around the current market rate
  // for their quality tier at the current year.
  if(s.prog){Object.entries(s.prog).forEach(([sl,sd])=>{
    if(!sd?.talent?.salary||!SAL[sl])return;
    const q=sd.talent.quality||30;
    const tier=q<42?'entry':q<68?'mid':'star';
    const r=SAL[sl][tier];
    const yr=G.year||1970;
    const p1=Math.min(25,yr-1970),p2=Math.max(0,Math.min(15,yr-1995)),p3=Math.max(0,yr-2010);
    const infl=1+p1*.040+p2*.018+p3*.008;
    const isTalk=TALK_FMTS&&TALK_FMTS.includes(s.format)?0.88:1.0;
    const lo=Math.round(r[0]*infl*isTalk/500)*500;
    const hi=Math.round(r[1]*infl*isTalk/500)*500;
    const mid=Math.round((lo+hi)/2/500)*500;
    // If salary is below entry-tier min or above 130% of mid, snap to mid
    if(sd.talent.salary<lo||sd.talent.salary>hi*1.3){
      sd.talent.salary=mid;
    }
  });}
    // Ensure translator signal fields exist on boosted stations
    if(s.fmBooster&&s.sig.type!=='FM'){s.sig.type='FM';s.sig.pw='translator';s.sig.reach=0.55;s.sig.universe=0.32;}
  });

  // Remove any corrupted/empty station entries (keep BP-slot placeholders without id/calls yet)
  G.stations=G.stations.filter(s=>s&&(s._bpSlotDeferred||(s.id&&s.callLetters)));
  // Deduplicate by id (can happen from LMA bugs or double-inserts)
  const _seenIds=new Set();
  G.stations=G.stations.filter(s=>{
    if(s._bpSlotDeferred)return true;
    if(_seenIds.has(s.id))return false;
    _seenIds.add(s.id);
    return true;
  });
  // Fix duplicate call letters — append suffix to later duplicates
  const _seenCalls={};
  G.stations.forEach(s=>{
    if(s._bpSlotDeferred)return;
    if(_seenCalls[s.callLetters]){
      const suffix=s.sig?.type==='FM'?'-FM':'-AM';
      s.callLetters=s.callLetters+suffix;
    } else { _seenCalls[s.callLetters]=true; }
  });

  G.stations.forEach(s=>{
    if(s._bpSlotDeferred)return;
    // Stream object
    if(!s.stream)s.stream={active:false,aqh:0,rev:0,upkeep:0,dragOffset:0,launchYear:0};
    // Fin object
    if(!s.fin)s.fin={rev:0,fix:0,tal:0,cost:0,ebitda:0};
    // Rat object
    if(!s.rat)s.rat={share:0.01,aqh:100,cur:{},prev:{}};
    // Mom object
    if(!s.mom){s.mom={};COH.forEach(c=>{s.mom[c]={tgt:0.01,cur:0.01};});}
    // Ops object
    if(!s.ops)s.ops={spots:14,sell:0.65,promo:0,progBudget:0};
      if(s.ops&&s.ops.progBudget===undefined)s.ops.progBudget=0;
    // Prog object
    if(!s.prog){s.prog={};Object.keys(SL).forEach(k=>{s.prog[k]=null;});}
    // Drift default
    if(!s.drift)s.drift={};
    if(s.drift[s.format]===undefined&&DRIFT[s.format])s.drift[s.format]=DRIFT[s.format].default;
    // Community identity fields (added recent version)
    if(s.identity===undefined)s.identity=0;
    if(s.identityBudget===undefined)s.identityBudget=0;
    if(s._formatAge===undefined)s._formatAge=0;
    if(s._identityPeak===undefined)s._identityPeak=0;
    // periodsAtStation on prog slots
    if(s.prog){Object.values(s.prog).forEach(sd=>{
          if(sd&&sd.talent){
            // Normalize tenure storage onto the talent object.
            if(sd.talent.periodsAtStation===undefined)sd.talent.periodsAtStation=sd.periodsAtStation||0;
            if(sd.periodsAtStation!==undefined&&sd.periodsAtStation>sd.talent.periodsAtStation)sd.talent.periodsAtStation=sd.periodsAtStation;
            sd.periodsAtStation=sd.talent.periodsAtStation;
            const yearsAtStation=Math.round((sd.talent.periodsAtStation||0)/2);
            // _hireYear = when they joined this station.
            if(!sd.talent._hireYear){
              sd.talent._hireYear=Math.max(1970,(G?.year||1970)-yearsAtStation);
            }
            // _careerStartYear = when they entered radio overall.
            if(!sd.talent._careerStartYear){
              sd.talent._careerStartYear=sd.talent._hireYear;
            }
            // Career can never be shorter than station tenure.
            if(sd.talent._careerStartYear>sd.talent._hireYear){
              sd.talent._careerStartYear=sd.talent._hireYear;
            }
          }
        });}
    // Ensure color: in MP use per-player color based on _mpOwner, solo always amber
    if(s.isPlayer){
      if(s._mpOwner!==undefined && s._mpOwner!==null){
        // Restore per-player color (player 0=amber, 1=blue, 2=green, 3=red)
        const mpColors=['#f5a623','#60a5fa','#34d399','#f87171'];
        s.color = mpColors[s._mpOwner % 4] || '#f5a623';
      } else {
        s.color='#f5a623'; // solo mode
      }
    } else if(!s.color) s.color=CLR[Math.floor(Math.random()*CLR.length)];
    // Ensure sig object
    if(!s.sig)s.sig={type:'AM',reach:0.5,power:'10kw'};
    // Public station flag
    if(!s.isPublic)s.isPublic=false;
  });

  // Inject public stations if missing (added in new version)
  const hasPubNews=G.stations.some(s=>s.isPublic&&s.format==='PUBLIC_NEWS');
  const hasPubClass=G.stations.some(s=>s.isPublic&&s.format==='PUBLIC_CLASSICAL');
  if(!hasPubNews&&G.year>=1975){
    const pubNews={
      id:'pub_news_'+Date.now(),callLetters:'W'+['PBR','PNT','PBC','NPR','PUB'][Math.floor(Math.random()*5)],color:'#94a3b8',isPublic:true,isPlayer:false,
      brand:'Public Radio',oq:72,_pubLaunchYear:1975,
      format:'PUBLIC_NEWS',
      sig:{type:'FM',reach:0.92,power:'50kw'},str:'moderate',
      freq:'88.5 FM',launchPeriod:0,
      ops:{spots:0,sell:0,promo:0,progBudget:0},fin:{rev:0,fix:0,tal:0,cost:0,ebitda:0},
      rat:{share:0.04,aqh:4000,cur:{},prev:{}},
      mom:{},prog:{},drift:{},stream:{active:false,aqh:0,rev:0,upkeep:0,dragOffset:0,launchYear:0},
      pers:{l:'Public Station',rs:.20,ag:.00,ms:.20,tr:.20,pt:.002,ic:.05}
    };
    COH.forEach(c=>{pubNews.mom[c]={tgt:0.02,cur:0.02};});
    Object.keys(SL).forEach(k=>{pubNews.prog[k]=null;});
    G.stations.push(pubNews);
  }
  if(!hasPubClass&&G.year>=1979){
    const pubClass={
      id:'pub_class_'+Date.now(),callLetters:'W'+['PCL','PCS','CLS','JZC','PBS'][Math.floor(Math.random()*5)],color:'#7c8fa8',isPublic:true,isPlayer:false,
      brand:'Public Classical',oq:68,_pubLaunchYear:1979,
      format:'PUBLIC_CLASSICAL',
      sig:{type:'FM',reach:0.78,power:'25kw'},str:'niche',
      freq:'90.1 FM',launchPeriod:0,
      ops:{spots:0,sell:0,promo:0,progBudget:0},fin:{rev:0,fix:0,tal:0,cost:0,ebitda:0},
      rat:{share:0.02,aqh:2000,cur:{},prev:{}},
      mom:{},prog:{},drift:{},stream:{active:false,aqh:0,rev:0,upkeep:0,dragOffset:0,launchYear:0},
      pers:{l:'Public Station',rs:.20,ag:.00,ms:.20,tr:.20,pt:.002,ic:.05}
    };
    COH.forEach(c=>{pubClass.mom[c]={tgt:0.01,cur:0.01};});
    Object.keys(SL).forEach(k=>{pubClass.prog[k]=null;});
    G.stations.push(pubClass);
  }

  // Rebuild ps
  G.ps=G.stations.filter(s=>s.isPlayer);
  if(G.pendingDecisionEvent && !TROUBLE_SCENARIOS.find(sc=>sc.id===G.pendingDecisionEvent.scenarioId))
    G.pendingDecisionEvent=null;
  return G;
}

function loadLocalSave(){
  const local=getLocalSave();
  if(!local?.G)return;
  if(!G)G={};
  Object.assign(G,local.G);
  migrateSave(G);
  G.news.unshift({v:'HIGH',t:`📂 Autosave resumed: ${local.label}`,y:G.year,p:G.period});
  cm('m-save');renderAll();
}

// ── LOAN SYSTEM ──────────────────────────────────────────────────
// Tiers: Operating loan ($250K), Expansion loan ($750K), Major deal ($2M)
// Interest accrues each period. Penalty for non-repayment at decade end.
const LOAN_TIERS=[
  {id:'op',    label:'Operating Loan',   amount:300000,   rate:.065, periods:6,  desc:'Short-term cash relief. 6.5% interest, due within 3 years.'},
  {id:'exp',   label:'Expansion Loan',   amount:900000,  rate:.075, periods:12, desc:'Fund a new station acquisition or major upgrade. 7.5% interest, 6-year term.'},
  {id:'major', label:'Major Deal Loan',  amount:2500000,  rate:.085, periods:20, desc:'Finance a cluster acquisition. 8.5% interest, 10-year term.'},
];



// ── STATION HISTORY MODAL ────────────────────────────────────────────────
const HIST_ICONS={'FORMAT':'📻','TALENT':'🎙','IDENTITY':'🏘','RATINGS':'📊','LAUNCH':'📡','NOTE':'📝'};

function renderHistoryRows(hist, fuzzy){
  if(!hist||!hist.length) return '<div class="sr"><span style="color:var(--mut)">No recorded history yet.</span></div>';
  return hist.map(e=>{
    const icon=HIST_ICONS[e.type]||'📝';
    const yr=e.y?`<span style="color:var(--mut);font-size:13px;margin-left:auto">${e.y}</span>`:'';
    // Fuzzy mode (competitor intel): hide talent names, show format/ratings only
    if(fuzzy&&e.type==='TALENT') return '';
    const label=e.type==='FORMAT'?'var(--amb)':e.type==='IDENTITY'?'var(--grn)':e.type==='RATINGS'?'var(--yel)':'var(--off)';
    return `<div class="sr" style="gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="font-size:18px;line-height:1">${icon}</span>
      <span style="font-family:var(--ft);font-size:14px;color:${label};flex:1">${e.msg}</span>
      ${yr}
    </div>`;
  }).filter(Boolean).join('');
}

function openHistory(sid){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const op=simulcastOperationalSource(s);
  const hist=s._history||[];
  document.getElementById('hist-title').textContent=`${s.callLetters} — STATION HISTORY`;
  const fmtAge=op._formatAge?Math.round(op._formatAge/2)+' yrs on current format':'';
  const idLine=op.identity?`Identity: ${Math.round(op.identity)}/100`:'';
  document.getElementById('histb').innerHTML=`
    <div class="ms2" style="margin-bottom:4px">
      <div class="msh">${FM[op.format]?.l||op.format}${fmtAge?' · '+fmtAge:''}${idLine?' · '+idLine:''}</div>
      ${renderHistoryRows(hist,false)}
    </div>
    <button class="cnl" onclick="cm('m-hist')">CLOSE</button>`;
  om('m-hist');
}

// ── STATION HISTORY LOG ───────────────────────────────────────────────────
// Records key station moments: launches, reformats, talent hires/fires,
// ratings milestones, identity milestones. Shown on station card + intel.
function logHistory(s, type, msg, G){
  if(!s) return;
  if(!s._history) s._history=[];
  s._history.unshift({type, msg, y:G?.year||0, p:G?.period||0});
  // Cap at 40 entries to avoid save bloat
  if(s._history.length>40) s._history=s._history.slice(0,40);
}
/** Append simulcast history to both stations (never replaces _history). */
function logSimulcastPairHistory(src,dst,Gref){
  if(!src||!dst||!Gref)return;
  logHistory(src,'SIMULCAST',`Simulcast partner: ${dst.callLetters} carries this station's programming.`,Gref);
  logHistory(dst,'SIMULCAST',`Simulcast: programming supplied by ${src.callLetters} (${FM[src.format]?.l||src.format}).`,Gref);
}
function updRepay(loanId, maxOwed, rawVal){
  const amt=Math.min(parseInt(rawVal)||0, maxOwed);
  const remaining=Math.max(0, maxOwed-amt);
  const valEl=document.getElementById('rpay-val-'+loanId);
  const noteEl=document.getElementById('rpay-note-'+loanId);
  const btnEl=document.getElementById('rpay-btn-'+loanId);
  if(valEl) valEl.textContent=f$(amt);
  if(noteEl){
    if(remaining===0) noteEl.innerHTML='<span style="color:var(--grn)">✓ Full repayment — loan cleared</span>';
    else noteEl.innerHTML=`Remaining after payment: <strong style="color:var(--amb)">${f$(remaining)}</strong>`;
  }
  if(btnEl) btnEl.textContent=`PAY ${f$(amt)}`;
}

function doRepayPartial(loanId){
  if(!G.loans)return;
  const loan=G.loans.find(l=>(l.id+'')===(loanId+''));
  if(!loan)return;
  // Read current slider value
  const sliders=document.querySelectorAll(`input[oninput*="updRepay('${loanId}'"]`);
  let amt=loan.owed;
  if(sliders.length) amt=Math.min(parseInt(sliders[0].value)||loan.owed, loan.owed);
  if(amt<10000){showToast('Minimum payment is $10,000','warn');return;}
  if(G.cash<amt){showToast(`Need ${f$(amt-G.cash)} more to make this payment.`,'warn');return;}
  G.cash-=amt;
  const fullRepay=(amt>=loan.owed);
  if(fullRepay){
    G.loans=G.loans.filter(l=>(l.id+'')!==(loanId+''));
    if(G._playerLoans?.[MP.playerId]) G._playerLoans[MP.playerId]=G._playerLoans[MP.playerId].filter(l=>(l.id+'')!==(loanId+''));
    G.news.unshift({v:'LOW',t:`💳 ${loan.label} fully repaid.`,y:G.year,p:G.period});
    MP.action('repay',{loanKey:loanId});
  } else {
    loan.owed=loan.owed-amt;
    if(G._playerLoans?.[MP.playerId]){
      const mp=G._playerLoans[MP.playerId].find(l=>(l.id+'')===(loanId+''));
      if(mp) mp.owed=loan.owed;
    }
    G.news.unshift({v:'LOW',t:`💳 ${loan.label}: ${f$(amt)} payment made. ${f$(loan.owed)} remaining.`,y:G.year,p:G.period});
    MP.action('repay_partial',{loanKey:loanId,amt,remaining:loan.owed});
  }
  if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}
  openLoan();renderAll();
}

function openLoan(){
  const activeLoans=G.loans||[];
  const totalOwed=activeLoans.reduce((s,l)=>s+l.owed,0);
  const loanRows=activeLoans.length?activeLoans.map(l=>`
    <div style="padding:10px 0;border-bottom:1px solid var(--bdh)">
      <div class="sr">
        <span class="lb">${l.label} <span style="color:var(--mut);font-size:14px">(${G.year-l.takenYear} yrs old)</span></span>
        <span class="vl neg">${f$(l.owed)} owed</span>
      </div>
      <div class="slsec" style="margin-top:8px">
        <div class="sll" style="margin-bottom:4px"><span style="color:var(--mut);font-size:14px">PAYMENT AMOUNT</span><strong id="rpay-val-${l.id}">${f$(l.owed)}</strong></div>
        <input type="range" min="10000" max="${l.owed}" step="10000" value="${l.owed}"
               oninput="updRepay('${l.id}',${l.owed},this.value)">
        <div style="display:flex;justify-content:space-between;font-family:var(--ft);font-size:13px;color:var(--mut);margin-top:3px"><span>$10K</span><span>Full: ${f$(l.owed)}</span></div>
        <div class="sln2" id="rpay-note-${l.id}">Remaining after payment: <strong>${f$(0)}</strong></div>
      </div>
      <button class="abt g" id="rpay-btn-${l.id}" style="width:100%;margin-top:6px;font-size:15px" onclick="doRepayPartial('${l.id}')">PAY ${f$(l.owed)}</button>
    </div>`).join(''):'<div class="sr"><span class="lb" style="color:var(--mut)">No active loans.</span></div>';

  const availTiers=LOAN_TIERS.filter(t=>{
    // Can't take same tier twice simultaneously
    const hasThis=activeLoans.some(l=>l.tierId===t.id);
    // Major deal only available post-1990 (complexity/regulatory)
    if(t.id==='major'&&G.year<1990)return false;
    return !hasThis;
  });

  const tierRows=availTiers.map(t=>`
    <div class="sr" style="flex-direction:column;align-items:flex-start;gap:6px;padding:12px 0;border-bottom:1px solid var(--bdh)">
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <strong style="color:var(--wht);font-family:var(--fd)">${t.label}</strong>
        <span style="color:var(--grn);font-family:var(--fd);font-size:18px">${f$(t.amount)}</span>
      </div>
      <div style="font-family:var(--ft);font-size:15px;color:var(--mut)">${t.desc}</div>
      <div style="font-family:var(--ft);font-size:15px;color:var(--off)">
        Total repayment: ${f$(Math.round(t.amount*(1+t.rate*t.periods/2)))} · 
        ~${f$(Math.round(t.amount*(1+t.rate*t.periods/2)/t.periods))}/period
      </div>
      <button class="abt b" style="width:100%;margin-top:4px" onclick="doLoan('${t.id}')">TAKE ${t.label.toUpperCase()}</button>
    </div>`).join('');

  document.getElementById('loanb').innerHTML=`
    <p class="di">Financing lets you invest ahead of revenue — acquire stations, weather a downturn, fund streaming. Interest accrues each period. Outstanding loans at decade end reduce your score.</p>
    ${activeLoans.length?`<div class="ms2"><div class="msh">ACTIVE LOANS — ${f$(totalOwed)} TOTAL OWED</div>${loanRows}</div>`:''}
    ${availTiers.length?`<div class="ms2"><div class="msh">AVAILABLE FINANCING</div>${tierRows}</div>`:'<div class="ibox">No additional financing available — repay existing loans first.</div>'}
    <div class="ibox">Cash on hand: <strong>${f$(G.cash)}</strong> · Interest charges appear in your period costs.</div>
    <button class="cnl" onclick="cm('m-loan')">CLOSE</button>`;
  om('m-loan');
}

function doLoan(tierId){
  const tier=LOAN_TIERS.find(t=>t.id===tierId);if(!tier)return;
  if(!G.loans)G.loans=[];
  const loanKey=tierId+G.year;
  if(G.loans.some(l=>l.tierId===tierId)){alert('Already have this loan type. Repay first.');return;}
  G.cash+=tier.amount;
  const totalOwed=Math.round(tier.amount*(1+tier.rate*tier.periods/2));
  if(!G._playerLoans)G._playerLoans={};
  if(!G._playerLoans[MP.playerId])G._playerLoans[MP.playerId]=[];
  G._playerLoans[MP.playerId].push({tierId,id:loanKey,label:tier.label,amount:tier.amount,owed:totalOwed,
    rate:tier.rate,periods:tier.periods,takenYear:G.year,interestPerPeriod:Math.round(tier.amount*tier.rate/2)});
  // Keep G.loans in sync as this player's loans (used by solo mode and display)
  G.loans=G._playerLoans[MP.playerId];
  G.news.unshift({v:'MEDIUM',t:`💳 ${tier.label}: ${f$(tier.amount)} received. Repay ${f$(totalOwed)} over ${tier.periods/2} years.`,y:G.year,p:G.period});
  // Broadcast to host so _playerLoans[guestPid] is recorded server-side
  MP.action('loan',{tierId,amount:tier.amount,owed:totalOwed,label:tier.label,
    rate:tier.rate,periods:tier.periods,takenYear:G.year,
    interestPerPeriod:Math.round(tier.amount*tier.rate/2)});
  openLoan(); // re-render modal
  renderAll();
}

function doRepay(loanKey){
  if(!G.loans)return;
  const loan=G.loans.find(l=>(l.id+'')===(loanKey+''));
  if(!loan)return;
  if(G.cash<loan.owed){alert(`Need ${f$(loan.owed-G.cash)} more to repay this loan.`);return;}
  G.cash-=loan.owed;
  G.loans=G.loans.filter(l=>(l.id+'')!==(loanKey+''));
  if(G._playerLoans?.[MP.playerId]) G._playerLoans[MP.playerId]=G._playerLoans[MP.playerId].filter(l=>(l.id+'')!==(loanKey+''));
  G.news.unshift({v:'LOW',t:`💳 ${loan.label} fully repaid.`,y:G.year,p:G.period});
  MP.action('repay',{loanKey});
  openLoan();
  renderAll();
}

// Apply loan interest to costs each period (called in advTurn)
function applyLoanInterest(){
  // In MP, restore this player's loan array from _playerLoans before processing
  if(MP.mode==='live' && G._playerLoans){
    G.loans = G._playerLoans[MP.playerId] || [];
  }
  if(!G.loans||!G.loans.length)return;
  G.loans.forEach(l=>{
    // Interest already baked into total owed — just track it for display
    // Penalty: loans older than their term at decade end cost VP
    l.periodsHeld=(l.periodsHeld||0)+1;
  });
  // Score penalty for loans outstanding at decade checkpoints is handled in scoreCalc
}

// 7. SELL STATION
function om(id){
  if(id==='m-rk')openRanker();
  document.getElementById(id).classList.add('on');
}
function cm(id){document.getElementById(id).classList.remove('on');}
document.querySelectorAll('.ov').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('on');}));

// ── COMPANY FINANCIALS (rollup matches period summary / myPS) ─────
function companyFinanceRollup(){
  const ps=myPS();
  const revenue=ps.reduce((s,st)=>s+st.fin.rev,0);
  const cost=ps.reduce((s,st)=>s+st.fin.cost,0);
  const ebitda=ps.reduce((s,st)=>s+st.fin.ebitda,0);
  const margin=revenue>0?Math.round((ebitda/revenue)*100):0;
  const talentCost=ps.reduce((sum,s)=>sum+Object.values(s.prog).filter(sl=>sl?.talent).reduce((a,sl)=>a+Math.round((sl.talent.salary||0)/2),0),0);
  const fixedCost=ps.reduce((s,st)=>s+(st.fin.fix||0),0);
  const cash=MP.mode==='live'?(G._playerCash?.[MP.playerId]??G.cash):G.cash;
  const shareSum=ps.reduce((s,st)=>s+st.rat.share,0);
  const avgSellout=ps.length?Math.round((ps.reduce((s,st)=>s+(st.ops?.sell||0),0)/ps.length)*1000)/1000:0;
  return {revenue,cost,ebitda,margin,talentCost,fixedCost,cash,shareSum,avgSellout};
}
function recordCompanyFinHistory(G, wasYear, wasPeriod, profit){
  if(!G)return;
  G.finHistory=G.finHistory||[];
  const ps=myPS();
  const revenue=ps.reduce((s,st)=>s+st.fin.rev,0);
  const cost=ps.reduce((s,st)=>s+st.fin.cost,0);
  const margin=revenue>0?Math.round((profit/revenue)*100):0;
  const talentCost=ps.reduce((sum,s)=>sum+Object.values(s.prog).filter(sl=>sl?.talent).reduce((a,sl)=>a+Math.round((sl.talent.salary||0)/2),0),0);
  const fixedCost=ps.reduce((s,st)=>s+(st.fin.fix||0),0);
  const cash=MP.mode==='live'?(G._playerCash?.[MP.playerId]??G.cash):G.cash;
  const shareSum=ps.reduce((s,st)=>s+st.rat.share,0);
  const avgSellout=ps.length?Math.round((ps.reduce((s,st)=>s+(st.ops?.sell||0),0)/ps.length)*1000)/1000:0;
  G.finHistory.push({year:wasYear,period:wasPeriod,revenue,cost,ebitda:profit,margin,cash,talentCost,fixedCost,shareSum,avgSellout});
  if(G.finHistory.length>120)G.finHistory=G.finHistory.slice(-120);
}
function recordStationFinHistory(G, wasYear, wasPeriod){
  if(!G)return;
  G.stationFinHistory=G.stationFinHistory||{};
  myPS().forEach(st=>{
    if(!G.stationFinHistory[st.id])G.stationFinHistory[st.id]=[];
    const rev=st.fin.rev||0,stcost=st.fin.cost||0,ebit=st.fin.ebitda||0;
    const margin=rev>0?Math.round((ebit/rev)*100):0;
    G.stationFinHistory[st.id].push({year:wasYear,period:wasPeriod,revenue:rev,cost:stcost,ebitda:ebit,margin});
    if(G.stationFinHistory[st.id].length>120)G.stationFinHistory[st.id]=G.stationFinHistory[st.id].slice(-120);
  });
}
function openFinancials(){
  if(!G)return;
  const r=companyFinanceRollup();
  const perName=PERIODS[(G.period||1)-1]||'';
  const hist=[...(G.finHistory||[])].reverse();
  const histRows=hist.map(h=>{
    const pnm=PERIODS[(h.period||1)-1]||'';
    return `<tr>
      <td style="padding:4px 8px;font-family:var(--fd)">${h.year}</td>
      <td style="padding:4px 8px;color:var(--mut)">${pnm}</td>
      <td style="padding:4px 8px;text-align:right">${f$(h.revenue)}</td>
      <td style="padding:4px 8px;text-align:right">${f$(h.cost)}</td>
      <td style="padding:4px 8px;text-align:right;color:${h.ebitda>=0?'var(--grn)':'var(--red)'}">${h.ebitda>=0?'+':''}${f$(h.ebitda)}</td>
      <td style="padding:4px 8px;text-align:right">${h.margin}%</td>
      <td style="padding:4px 8px;text-align:right">${f$(h.cash)}</td>
    </tr>`;
  }).join('');
  const stHistBlocks=myPS().map(st=>{
    const sh=[...(G.stationFinHistory?.[st.id]||[])].reverse();
    if(!sh.length)return '';
    const rows=sh.map(h=>{
      const pnm=PERIODS[(h.period||1)-1]||'';
      return `<tr>
        <td style="padding:4px 8px;font-family:var(--fd)">${h.year}</td>
        <td style="padding:4px 8px;color:var(--mut)">${pnm}</td>
        <td style="padding:4px 8px;text-align:right">${f$(h.revenue)}</td>
        <td style="padding:4px 8px;text-align:right">${f$(h.cost)}</td>
        <td style="padding:4px 8px;text-align:right;color:${h.ebitda>=0?'var(--grn)':'var(--red)'}">${h.ebitda>=0?'+':''}${f$(h.ebitda)}</td>
        <td style="padding:4px 8px;text-align:right">${h.margin}%</td>
      </tr>`;
    }).join('');
    return `<div class="ms2" style="margin-top:14px"><div class="msh">${st.callLetters}</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="color:var(--mut);text-align:left;font-family:var(--ft);letter-spacing:1px">
          <th style="padding:6px 8px;border-bottom:1px solid var(--bdr)">Year</th>
          <th style="padding:6px 8px;border-bottom:1px solid var(--bdr)">Period</th>
          <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Revenue</th>
          <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Costs</th>
          <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">EBITDA</th>
          <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Margin</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }).join('');
  document.getElementById('finb').innerHTML=`
    <div style="padding:16px 20px 20px;font-family:var(--ft);font-size:15px;max-height:min(72vh,640px);overflow-y:auto">
      <p class="di" style="margin-top:0">Company-wide totals from your owned stations (same basis as the period-end summary).</p>
      <div class="ms2"><div class="msh">${G.year} ${perName} — SNAPSHOT</div>
        <div class="sr"><span class="lb">Total revenue</span><span class="vl">${f$(r.revenue)}</span></div>
        <div class="sr"><span class="lb">Total expenses</span><span class="vl">${f$(r.cost)}</span></div>
        <div class="sr"><span class="lb">EBITDA</span><span class="vl ${r.ebitda>=0?'pos':'neg'}">${r.ebitda>=0?'+':''}${f$(r.ebitda)}</span></div>
        <div class="sr"><span class="lb">EBITDA margin</span><span class="vl">${r.margin}%</span></div>
        <div class="sr"><span class="lb">Total talent cost</span><span class="vl">${f$(r.talentCost)}</span></div>
        <div class="sr"><span class="lb">Total fixed cost</span><span class="vl">${f$(r.fixedCost)}</span></div>
        <div class="sr"><span class="lb">Cash on hand</span><span class="vl amb">${f$(r.cash)}</span></div>
        <div class="sr"><span class="lb">Owned share (sum)</span><span class="vl">${pct(r.shareSum)}</span></div>
        <div class="sr"><span class="lb">Avg sellout</span><span class="vl">${Math.round(r.avgSellout*100)}%</span></div>
      </div>
      <div class="ms2" style="margin-top:14px"><div class="msh">HISTORY (newest first)</div>
        ${hist.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr style="color:var(--mut);text-align:left;font-family:var(--ft);letter-spacing:1px">
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr)">Year</th>
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr)">Period</th>
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Revenue</th>
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Costs</th>
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">EBITDA</th>
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Margin</th>
            <th style="padding:6px 8px;border-bottom:1px solid var(--bdr);text-align:right">Cash</th>
          </tr></thead>
          <tbody>${histRows}</tbody>
        </table></div>`:'<p class="enote">No closed periods recorded yet. Advance a period to build history.</p>'}
      </div>
      ${stHistBlocks?`<div class="ms2" style="margin-top:16px"><div class="msh">BY STATION (newest first)</div></div>${stHistBlocks}`:''}
    </div>`;
  om('m-fin');
}

// ── PERIOD SUMMARY ────────────────────────────────────────────────
function showSum(profit,events,acts,alerts,displayYear,displayPeriod){
  const ps=myPS(),tRev=ps.reduce((s,st)=>s+st.fin.rev,0),tCost=ps.reduce((s,st)=>s+st.fin.cost,0);
  const vis=acts.filter(a=>['HIGH','MEDIUM'].includes(a.v));
  const margin=tRev>0?Math.round((profit/tRev)*100):0;
  const marginColor=margin>=35?'var(--grn)':margin>=15?'var(--amb)':'var(--red)';
  // Use passed year/period so the title reflects the period that just ran, not the next one
  const yr=displayYear||G.year, per=displayPeriod||G.period;
  const periodName=per===2?'FALL':'SPRING';
  const isElYr=yr%2===0&&per===2;
  document.getElementById('sumt').textContent=`${yr} ${periodName} — PERIOD END`;
  document.getElementById('sumb').innerHTML=`
    <div class="ms2"><div class="msh">YOUR RESULTS</div>
      <div class="sr"><span class="lb">Revenue</span><span class="vl">${f$(tRev)}/period</span></div>
      <div class="sr"><span class="lb">Operating Costs</span><span class="vl">${f$(tCost)}/period</span></div>
      <div class="sr"><span class="lb">Net EBITDA</span><span class="vl ${profit>=0?'pos':'neg'}">${profit>=0?'+':''}${f$(profit)}</span></div>
      <div class="sr"><span class="lb">Margin</span><span class="vl" style="color:${marginColor}">${margin}%</span></div>
      <div class="sr"><span class="lb">Cash on Hand</span><span class="vl amb">${f$(G.cash)}</span></div>
      ${(G.loans&&G.loans.length)?`<div class="sr"><span class="lb" style="color:var(--red)">Outstanding Loans</span><span class="vl neg">${f$(G.loans.reduce((s,l)=>s+l.owed,0))} owed — click &#36; to manage</span></div>`:''}
      <div class="sr"><span class="lb" style="color:var(--mut)">Ad Market</span><span class="vl" style="color:${per===2?'var(--grn)':'var(--amb)'}">${per===2?'FALL — peak season (+12%)':'SPRING — lean season (−12%)'}${isElYr?' 🗳 +4% political for Talk/Sports':''}</span></div>
    </div>
    ${ps.map(s=>{
      const op=simulcastOperationalSource(s);
      const pr=s.cp;
      const trd=!pr?'':'  '+( pr.col?'<span style="color:var(--red)">⬇⬇ collapsing</span>':pr.under?'<span style="color:var(--red)">⬇ declining</span>':pr.sur?'<span style="color:var(--grn)">⬆ surging</span>':'<span style="color:var(--mut)">→ stable</span>');
      const stnMargin=s.fin.rev>0?Math.round((s.fin.ebitda/s.fin.rev)*100):0;
      const mc=stnMargin>=35?'pos':stnMargin>=10?'amb':'neg';
      const talCost=Object.values(s.prog).filter(sl=>sl?.talent).reduce((sum,sl)=>sum+Math.round((sl.talent.salary||0)/2),0);
      const simSrc=s.simulcastWith&&s._simulcastSource===false?G.stations.find(st=>st.id===s.simulcastWith):null;
      const localMD=s.prog.morningDrive?.talent;
      const simMD=!localMD&&simSrc?simSrc.prog?.morningDrive?.talent:null;
      const hostStr=localMD?localMD.name:(simMD?`${simMD.name} (${simSrc.callLetters})`:'');
      const vacant=Object.keys(SL).filter(k=>{
        if(simSrc?.prog?.[k]?.talent)return false;
        return !s.prog[k]?.talent;
      }).map(k=>SL[k]);
      const simulcastLine=simSrc?`<div class="sr"><span class="lb" style="color:var(--mut)">Programming</span><span class="vl" style="font-size:14px;color:var(--off)">Supplied by <strong>${simSrc.callLetters}</strong> (simulcast)</span></div>`:'';
      const simFeeLine=(s.fin?.simulcastProgFee>0)?`<div class="sr"><span class="lb" style="color:var(--mut)">Simulcast program fee</span><span class="vl" style="font-size:14px;color:var(--off)">${f$(s.fin.simulcastProgFee)}/period <span style="color:var(--mut)">(in costs above)</span></span></div>`:'';
      return `<div class="ms2"><div class="msh">${s.callLetters} — ${FM[op.format]?.l||op.format}${s.simulcastWith?' ◈':''}</div>
        <div class="sr"><span class="lb">Share</span><span class="vl">${pct(s.rat.share)}${trd}</span></div>
        <div class="sr"><span class="lb">Revenue / Costs</span><span class="vl">${f$(s.fin.rev)} / ${f$(s.fin.cost)}</span></div>
        <div class="sr"><span class="lb">EBITDA</span><span class="vl ${mc}">${s.fin.ebitda>=0?'+':''}${f$(s.fin.ebitda)} (${stnMargin}%)</span></div>
        <div class="sr"><span class="lb">Fixed / Talent</span><span class="vl" style="font-size:14px;color:var(--mut)">${f$(s.fin.fix||0)} / ${f$(talCost)}</span></div>
        ${simulcastLine}
        ${simFeeLine}
        <div class="sr"><span class="lb">Quality</span><span class="vl">${op.oq}/100${hostStr?' · '+hostStr:''}</span></div>
        ${vacant.length?`<div class="sr"><span class="lb" style="color:var(--red)">⚠ Vacant</span><span class="vl" style="color:var(--red);font-size:14px">${vacant.join(', ')}</span></div>`:''}
      </div>`;
    }).join('')}
    ${events.length?`<div class="ms2"><div class="msh">MARKET EVENTS</div>${events.map(ev=>`<div class="sr"><span class="lb" style="color:var(--amb)">📡 ${ev.t}</span><span class="vl" style="color:var(--off);font-size:15px;font-family:var(--fm)">${ev.d}</span></div>`).join('')}</div>`:''}
    ${vis.length?`<div class="ms2"><div class="msh">COMPETITOR MOVES</div>${vis.map(a=>`<div class="sr"><span class="vl" style="color:${a.v==='HIGH'?'var(--amb)':'var(--off)'};font-size:15px;font-family:var(--fm)">${a.t}</span></div>`).join('')}</div>`:''}
    ${alerts.length?`<div class="ms2"><div class="msh" style="color:var(--red)">⚠ ALERTS</div>${alerts.map(a=>`<div class="sr"><span class="vl" style="color:var(--red);font-size:15px">${a}</span></div>`).join('')}</div>`:''}`;
  // Decade-end notice so player doesn't dismiss before grade shows
  const _dEndYrs=[1979,1989,1999,2009,2019,2020].filter(y=>y>(G.sc?.startYear||1970));
  if(_dEndYrs.includes(displayYear)&&displayPeriod===2){
    document.getElementById('sumb').innerHTML+=
      '<div style="margin-top:12px;padding:10px;border:2px solid var(--amb);border-radius:4px;text-align:center">'+
      '<div style="font-family:var(--fd);color:var(--amb);font-size:14px">📊 DECADE REPORT CARD INCOMING</div>'+
      '<div style="font-family:var(--ft);color:var(--mut);font-size:15px;margin-top:4px">Your '+displayYear+' decade score will appear after you close this summary</div></div>';
  }
  om('m-sum');
}

// ════════════════════════════════════════════════════════════════
// TALENT CONTRACT MANAGEMENT
// ════════════════════════════════════════════════════════════════
function openContract(sid, slot){
  const s=G.stations.find(st=>st.id===sid);
  if(!s)return;
  const sd=s.prog[slot];
  if(!sd?.talent){
    if(s.simulcastWith&&s._simulcastSource===false){
      const src=G.stations.find(st=>st.id===s.simulcastWith);
      if(src){
        showToast(`Programming for ${SL[slot]} is carried from ${src.callLetters} (simulcast). Open a contract on ${src.callLetters} to manage that talent.`,'info');
        return;
      }
    }
    openHire(sid);return;
  }
  const t=sd.talent;
  const cyr=Math.round((t.cyr||0)*10)/10;
  const mor=t.morale||65;
  const morLabel=mor>=75?'Excellent':mor>=60?'Good':mor>=45?'Fair':mor>=30?'Strained':'Critical';
  const morCol=mor>=70?'var(--grn)':mor>=45?'var(--amb)':'var(--red)';
  const age=t.periodsAtStation||0;
  const ageYrs=Math.round(age/2*10)/10;

  // Contract extension: raise demand scales with station share AND talent quality.
  // A #1 morning host on a 12-share station knows exactly what they're worth.
  const stShare=s.rat?.share||0;
  const perfMult=stShare>0.12?1.30:stShare>0.08?1.18:stShare>0.05?1.10:1.00;
  const qualMult=t.quality>82?1.15:t.quality>70?1.07:1.00;
  const demandBase=perfMult*qualMult; // e.g. 12-share + Q85 = 1.30×1.15 = 1.495 demand pressure
  // morale safety valve: unhappy talent demands more; happy talent asks less
  const moraleFactor=mor<50?1.08:mor>80?0.95:1.0;
  const demand=demandBase*moraleFactor;
  // 1yr deal: bigger immediate raise (talent prefers flexibility on hot stations)
  const ext1Lo=Math.max(1.06, Math.min(1.45, demand*rnd(0.92,1.00)));
  const ext1Hi=Math.max(1.10, Math.min(1.55, demand*rnd(1.00,1.10)));
  let ext1Cost=Math.round(t.salary*rnd(ext1Lo,ext1Hi)/500)*500;
  // 2yr deal: slightly lower per-year ask for security, but still share-aware
  const ext2Lo=Math.max(1.04, Math.min(1.30, demand*rnd(0.80,0.88)));
  const ext2Hi=Math.max(1.07, Math.min(1.40, demand*rnd(0.88,0.96)));
  let ext2Cost=Math.round(t.salary*rnd(ext2Lo,ext2Hi)/500)*500; // per year, 2yr deal
  // 3yr deal: biggest discount per year — talent trades flexibility for long-term security
  // Only available if morale is decent (they won't sign a long deal unhappy)
  const ext3Lo=Math.max(1.03, Math.min(1.22, demand*rnd(0.70,0.78)));
  const ext3Hi=Math.max(1.05, Math.min(1.28, demand*rnd(0.78,0.86)));
  let ext3Cost=mor>=55?Math.round(t.salary*rnd(ext3Lo,ext3Hi)/500)*500:null; // null = unavailable
  let ext1Annual=ext1Cost;
  let ext2Annual=ext2Cost;
  let ext3Annual=ext3Cost;
  // Counter-poach: extension asks can fall below the rival floor — ensure at least one option meets retention minimum.
  const rpp=s._rivalPoachPending;
  if(rpp&&rpp.slot===slot&&rpp.talentId===t.id){
    const requiredMin=Math.round((rpp.offerSalary*0.95)/500)*500;
    if(ext1Cost<requiredMin)ext1Cost=requiredMin;
    if(ext2Cost<requiredMin)ext2Cost=requiredMin;
    if(ext3Cost!=null&&ext3Cost<requiredMin)ext3Cost=requiredMin;
    ext1Annual=ext1Cost;
    ext2Annual=ext2Cost;
    if(ext3Cost!=null)ext3Annual=ext3Cost;
  }

  // Bonus cost: one-time payment, boosts morale by 15-25 pts
  const bonusCost=Math.round(t.salary*rnd(0.08,0.15)/500)*500;

  // Poach: find a rival's talent in same slot with higher quality
  const poachCandidates=G.stations.filter(st=>st&&!st._bpSlotDeferred&&!st.isPlayer&&!st.isPublic&&st.rat?.share>0.01)
    .map(st=>({st, sd:st.prog[slot]}))
    .filter(({sd:rsd})=>rsd?.talent&&rsd.talent.quality>t.quality*0.75)
    .sort((a,b)=>b.sd.talent.quality-a.sd.talent.quality)
    .slice(0,3);

  // Morale factors explanation
  const morFactors=[];
  if(t.morale<50)morFactors.push('low morale drains quality faster');
  if(t.morale<35)morFactors.push('⚠ burnout risk — may quit without warning');
  const spotLoad=s.ops.spots;
  const fmtNorm=FM[s.format]?.sp||14;
  if(spotLoad>fmtNorm*1.2)morFactors.push('heavy spot load is wearing on staff');

  const poachRows=poachCandidates.length?poachCandidates.map(({st,sd:rsd})=>{
    const rt=rsd.talent;
    const fit=Math.round((rt.formatFit[s.format]||.3)*100);
    const fc=fit>=75?'good':fit>=55?'warn':'poor';
    const poachCost=Math.round(rt.salary*rnd(1.10,1.30)/500)*500; // premium to steal
    const canAfford=G.cash>=poachCost;
    return `<div class="to" style="margin-bottom:6px">
      <div>
        <div class="ton">${rt.name} <span style="color:var(--mut);font-size:15px">from ${st.callLetters}</span></div>
        <div class="tost">
          <div><span class="tosl">TALENT</span><span class="tosv ${qc(Math.round(rt.quality))}">${Math.round(rt.quality)}/100</span></div>
          <div><span class="tosl">FIT</span><span class="tosv ${fc}">${fit}%</span></div>
          <div><span class="tosl">MORALE</span><span class="tosv">${rt.morale}</span></div>
        </div>
      </div>
      <div>
        <span class="tocl">ANNUAL OFFER</span>
        <span class="toc" style="color:${canAfford?'var(--amb)':'var(--red)'}">${f$(poachCost)}</span>
        <button class="abt b" style="margin-top:6px;font-size:15px;padding:5px 10px;${canAfford?'':'opacity:.4;pointer-events:none'}" onclick="doPoach('${sid}','${slot}','${st.id}')">MAKE OFFER</button>
      </div>
    </div>`;
  }).join(''):`<p style="color:var(--mut);font-size:15px;font-style:italic">No viable poach targets in this daypart right now.</p>`;

  const contractStatus=cyr<=0
    ?`<span style="color:var(--red);font-family:var(--ft);font-size:15px">⚠ CONTRACT EXPIRED — negotiate now or risk losing them</span>`
    :cyr<=0.5
    ?`<span style="color:var(--amb);font-family:var(--ft);font-size:15px">⚠ Contract expires next period — extend now to lock in this talent</span>`
    :`<span style="color:var(--mut);font-family:var(--ft);font-size:15px">${Math.ceil(cyr*2)} period${Math.ceil(cyr*2)!==1?'s':''} remaining (~${Math.ceil(cyr)} yr)</span>`;

  const poach1yrMatchLabel=rpp&&rpp.slot===slot&&rpp.talentId===t.id
    ?`<div style="font-size:13px;color:var(--grn);font-family:var(--ft);margin-top:2px">MATCH OFFER</div>`
    :'';

  document.getElementById('contractb').innerHTML=`
    <div class="msh" style="margin-bottom:12px">📋 TALENT CONTRACT — ${s.callLetters} ${SL[slot]}</div>
    ${(()=>{const rp=s._rivalPoachPending;if(!rp||rp.slot!==slot||rp.talentId!==t.id)return'';const riv=G.stations.find(st=>st.id===rp.rivalId);const minM=Math.round(rp.offerSalary*0.95/500)*500;return`<div class="ibox" style="border-color:var(--amb);margin-bottom:12px"><strong style="color:var(--amb)">⚡ RIVAL OFFER / COUNTER-POACH</strong><br><span style="font-size:14px;color:var(--off)"><strong>${riv?riv.callLetters:'Rival'}</strong> offered <strong>${f$(rp.offerSalary)}</strong>/yr. Sign at <strong>≥${f$(minM)}</strong>/yr to retain ${t.name} next period.</span></div>`;})()}
    ${(()=>{const sh=s.rat?.share||0;const q=t.quality||50;if(sh>0.12&&q>75)return`<div style="background:rgba(245,166,35,.10);border:1px solid var(--amb);border-radius:4px;padding:8px 12px;margin-bottom:12px;font-size:14px;color:var(--amb)">📈 Strong station + top talent — expect a premium ask. They know their worth.</div>`;if(sh>0.08&&q>65)return`<div style="background:rgba(245,166,35,.07);border:1px solid rgba(245,166,35,.3);border-radius:4px;padding:8px 12px;margin-bottom:12px;font-size:14px;color:var(--off)">📊 Solid ratings give this talent negotiating leverage.</div>`;if(t.morale<50)return`<div style="background:rgba(220,50,50,.10);border:1px solid var(--red);border-radius:4px;padding:8px 12px;margin-bottom:12px;font-size:14px;color:var(--red)">⚠ Low morale — they're unhappy and may ask for extra just to stay.</div>`;return''})()}

    <div class="ms2" style="margin-bottom:16px">
      <div class="sr"><span class="lb">Talent</span><span class="vl"><strong>${t.name}</strong></span></div>
      <div class="sr"><span class="lb">Rating</span><span class="vl ${qc(Math.round(t.quality))}">${Math.round(t.quality)}/100</span></div>
      <div class="sr"><span class="lb">Morale</span><span class="vl" style="color:${morCol}">${morLabel} (${mor}) ${morFactors.length?'· '+morFactors[0]:''}</span></div>
      <div class="sr"><span class="lb">Tenure</span><span class="vl">${age} periods (${ageYrs} yrs at station)</span></div>
      ${(()=>{const stationJoin=t._hireYear||G.year;const careerStart=Math.min(t._careerStartYear||stationJoin,stationJoin);const carYrs=Math.max(ageYrs,G.year-careerStart);const retIn=35-carYrs;return carYrs>=0?`<div class="sr"><span class="lb">Career</span><span class="vl" style="color:${retIn<=1?'var(--red)':retIn<=3?'var(--amb)':'var(--mut)'}">${carYrs} yrs in radio${retIn<=3?` · <strong>retires in ${retIn} yr${retIn!==1?'s':''}</strong>`:''}</span></div>`:''})()}
      <div class="sr"><span class="lb">Current salary</span><span class="vl">${f$(t.salary)}/yr · ${f$(t.salary/2)}/period</span></div>
      <div class="sr"><span class="lb">Contract</span><span class="vl">${contractStatus}</span></div>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      <div class="msh">EXTEND CONTRACT</div>
      <div style="display:flex;gap:8px">
        <div class="to" style="flex:1;cursor:default">
          <div><div class="ton">1-Year</div>${poach1yrMatchLabel}
          <div class="tost"><div><span class="tosl">SALARY</span><span class="tosv ${qc(70)}">${f$(ext1Annual)}/yr</span></div><div><span class="tosl">RAISE</span><span class="tosv warn">${Math.round((ext1Annual/t.salary-1)*100)}%</span></div></div>
          <div style="font-size:14px;color:var(--mut);margin-top:3px">Flexibility. Higher ask.</div></div>
          <button class="cfm" style="font-size:15px;padding:8px;margin-top:6px" onclick="doExtend('${sid}','${slot}',1,${ext1Cost})" ${G.cash<ext1Cost/2?'disabled':''}>SIGN 1 YR</button>
        </div>
        <div class="to" style="flex:1;cursor:default">
          <div><div class="ton">2-Year</div>
          <div class="tost"><div><span class="tosl">SALARY</span><span class="tosv ${qc(70)}">${f$(ext2Annual)}/yr</span></div><div><span class="tosl">RAISE</span><span class="tosv warn">${Math.round((ext2Annual/t.salary-1)*100)}%</span></div></div>
          <div style="font-size:14px;color:var(--mut);margin-top:3px">Balance. Moderate discount.</div></div>
          <button class="cfm" style="font-size:15px;padding:8px;margin-top:6px" onclick="doExtend('${sid}','${slot}',2,${ext2Cost})" ${G.cash<ext2Cost/2?'disabled':''}>SIGN 2 YR</button>
        </div>
        <div class="to" style="flex:1;cursor:default;${ext3Cost?'':'opacity:.45;pointer-events:none'}">
          <div><div class="ton">3-Year</div>
          <div class="tost"><div><span class="tosl">SALARY</span><span class="tosv ${qc(70)}">${ext3Cost?f$(ext3Annual)+'/yr':'N/A'}</span></div><div><span class="tosl">RAISE</span><span class="tosv good">${ext3Cost?Math.round((ext3Annual/t.salary-1)*100)+'%':'—'}</span></div></div>
          <div style="font-size:14px;color:var(--mut);margin-top:3px">${ext3Cost?'Biggest discount. Morale required.':'Morale too low to sign long-term.'}</div></div>
          <button class="cfm" style="font-size:15px;padding:8px;margin-top:6px" onclick="doExtend('${sid}','${slot}',3,${ext3Cost||0})" ${(!ext3Cost||G.cash<(ext3Cost||0)/2)?'disabled':''}>SIGN 3 YR</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:4px">
        <div class="to" style="flex:1;cursor:default;border-color:var(--grn)">
          <div><div class="ton" style="color:var(--grn)">Morale Bonus</div>
          <div style="font-size:14px;color:var(--mut);margin-top:4px">One-time cash bonus — boosts morale +15 to +20 pts. No contract change.</div></div>
          <div style="margin-top:8px">
            <span style="font-family:var(--fd);color:var(--amb)">${f$(bonusCost)}</span>
            <button class="abt g" style="margin-left:8px;font-size:15px" onclick="doBonus('${sid}','${slot}',${bonusCost})" ${G.cash<bonusCost?'disabled':''}>PAY BONUS</button>
          </div>
        </div>
        <div class="to" style="flex:1;cursor:default;border-color:var(--red)">
          <div><div class="ton" style="color:var(--red)">Let Contract Expire</div>
          <div style="font-size:14px;color:var(--mut);margin-top:4px">Don't renew. ${t.name} leaves when contract ends. Slot goes to ${vacantLabel(s.format,slot).toLowerCase()}.</div></div>
          <button class="abt d" style="margin-top:8px;font-size:15px" onclick="doLetExpire('${sid}','${slot}')">LET EXPIRE</button>
        </div>
        ${(()=>{const cyr2=t.cyr||0;const buyout2=cyr2>0.1?Math.round(t.salary*cyr2*0.60/500)*500:0;const canAfford2=G.cash>=buyout2;
        if(buyout2<=0)return'';
        return`<div class="to" style="flex:1;cursor:default;border-color:var(--red);opacity:${canAfford2?1:.5}">
          <div><div class="ton" style="color:var(--red)">Fire Now</div>
          <div style="font-size:14px;color:var(--mut);margin-top:4px">Immediate termination. Buyout owed: <strong style="color:${canAfford2?'var(--amb)':'var(--red)'}">${f$(buyout2)}</strong> (${cyr2.toFixed(1)} yrs × 60%).</div></div>
          <button class="abt d" style="margin-top:8px;font-size:15px" onclick="doFire('${sid}','${slot}');cm('m-contract')" ${canAfford2?'':'disabled'}>FIRE (${f$(buyout2)})</button>
        </div>`;})()}
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div class="msh" style="margin-bottom:8px">POACH A RIVAL</div>
      ${poachRows}
    </div>

    <button class="cnl" onclick="cm('m-contract')">CLOSE</button>`;
  om('m-contract');
}

function doExtend(sid, slot, years, newSalary){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const t=s.prog[slot]?.talent;if(!t)return;
  const rp=s._rivalPoachPending;
  if(rp&&rp.slot===slot&&t.id===rp.talentId){
    const minSal=Math.round((rp.offerSalary||0)*0.95/500)*500;
    if(newSalary>=minSal){
      delete s._rivalPoachPending;
      G.news.unshift({v:'LOW',t:`📋 ${t.name} stays — your contract fends off the rival bid.`,y:G.year,p:G.period});
    }
  }
  t.salary=newSalary;
  t.cyr=years*2; // cyr counts in half-years (periods)
  t.morale=Math.min(100,t.morale+10); // relief at being signed
  G.news.unshift({v:'LOW',t:`📋 ${t.name} signs ${years}-year extension at ${s.callLetters} — ${f$(newSalary)}/yr.`,y:G.year,p:G.period});
  MP.action('extend',{sid,slot,years,newSalary});
  cm('m-contract');renderAll();
}

function doBonus(sid, slot, amount){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const t=s.prog[slot]?.talent;if(!t)return;
  if(G.cash<amount)return;
  G.cash-=amount;
  if(MP.mode==='live'){if(!G._playerCash)G._playerCash={};G._playerCash[MP.playerId]=G.cash;MP.emit('player_cash_update',{playerId:MP.playerId,cash:G.cash});}
  const boost=Math.round(rnd(15,20));
  t.morale=Math.min(100,t.morale+boost);
  G.news.unshift({v:'LOW',t:`💰 ${t.name} receives ${f$(amount)} bonus at ${s.callLetters} — morale up ${boost} pts.`,y:G.year,p:G.period});
  MP.action('bonus',{sid,slot,amount,boost});
  cm('m-contract');renderAll();
}

function doLetExpire(sid, slot){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const t=s.prog[slot]?.talent;if(!t)return;
  t._letExpire=true; // flag — talentEvents will handle the exit gracefully
  t.morale=Math.max(20,t.morale-15); // they know
  G.news.unshift({v:'LOW',t:`${t.name}'s contract at ${s.callLetters} will not be renewed.`,y:G.year,p:G.period});
  MP.action('letexpire',{sid,slot});
  cm('m-contract');renderAll();
}

function doPoach(sid, slot, rivalId){
  const s=G.stations.find(st=>st.id===sid);if(!s)return;
  const rival=G.stations.find(st=>st.id===rivalId);if(!rival)return;
  const rsd=rival.prog[slot];if(!rsd?.talent)return;
  const t=rsd.talent;
  const offer=Math.round(t.salary*rnd(1.25,1.55)/500)*500;

  // If slot is occupied, calculate buyout for the current talent before evicting them
  const oldTal=s.prog[slot]?.talent;
  const buyout=oldTal&&(oldTal.cyr||0)>0.1?Math.round(oldTal.salary*(oldTal.cyr||0)*0.60/500)*500:0;
  const totalCost=offer+buyout;

  if(G.cash<totalCost){
    showToast(`Need ${f$(totalCost)} — ${f$(offer)} signing + ${buyout>0?f$(buyout)+' buyout for '+oldTal.name:''}. Only ${f$(G.cash)} available.`,'warn');
    return;
  }
  G.cash-=totalCost; // signing bonus + any buyout

  const name=t.name;
  // Move talent — fire from rival, hire to player
  rival.prog[slot].talent=null;
  rival.prog[slot].quality=Math.max(10,Math.round(rival.prog[slot].quality*0.75));
  rival.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(rival.prog[sl])*w,0));
  if(oldTal){
    const buyoutNote=buyout>0?` Buyout paid: ${f$(buyout)}.`:'';
    G.news.unshift({v:'LOW',t:`${oldTal.name} released from ${s.callLetters} to make room for ${name}.${buyoutNote}`,y:G.year,p:G.period});
  }
  t.salary=offer;
  t.cyr=2; // 1-year deal
  t.morale=Math.min(100,t.morale+8);
  t.periodsAtStation=0;
  t._hireYear=G.year;
  if(!t._careerStartYear)t._careerStartYear=t._hireYear||G.year;
  if(t._careerStartYear>t._hireYear)t._careerStartYear=t._hireYear;
  t._letExpire=false;
  s.prog[slot].talent=t;
  const fit=t.formatFit[s.format]||.3;
  s.prog[slot].quality=Math.min(100,Math.round(s.prog[slot].quality+(t.quality/100)*fit*35));
  s.oq=Math.round(Object.entries(SW).reduce((sum,[sl,w])=>sum+effSlotQForOq(s.prog[sl])*w,0));
  G.news.unshift({v:'HIGH',t:`🎙 SIGNED: ${name} joins ${s.callLetters} from ${rival.callLetters} — ${f$(offer)}/yr.`,y:G.year,p:G.period,iy:true});
  MP.action('poach', {sid, slot, rivalId, talentId:t.id||t.name});
  cm('m-contract');cm('m-tal');renderAll();
}

// ════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════
function renderAll(){
  // Guard: if G hasn't been initialized yet, don't render garbage
  if(!G || !G.sc || !G.stations){
    // Show the welcome/scenario screen instead of an empty state
    if(document.getElementById('m-scen') && !document.getElementById('m-scen').classList.contains('on')){
      openScenSelect(getLocalSave());
    }
    return;
  }
  rHdr();rTick();rScore();rStns();rMkt();rIntel();rNews();
  maybeShowPendingTroubleModal();
}

function maybeShowPendingTroubleModal(){
  if(!G?.pendingDecisionEvent)return;
  if(MP.mode==='live'&&G.pendingDecisionEvent.ownerId!==MP.playerId)return;
  const m=document.getElementById('m-talent-trouble');
  if(!m||m.classList.contains('on'))return;
  if(document.getElementById('m-sum')?.classList.contains('on'))return;
  setTimeout(()=>{
    if(!G.pendingDecisionEvent)return;
    if(document.getElementById('m-sum')?.classList.contains('on'))return;
    if(document.getElementById('m-talent-trouble')?.classList.contains('on'))return;
    showTalentTroubleModal();
  },500);
}

function rHdr(){
  document.getElementById('hy').textContent=G.year;
  const seasonStr=G.period===2?'FALL':'SPRING';
  const isElYr=G.year%2===0&&G.period===2;
  document.getElementById('hp').textContent=seasonStr;
  document.getElementById('hsc').textContent=MP.mode==='live'?'MULTIPLAYER':G.sc.l.toUpperCase();
  document.getElementById('hcash').textContent=Math.round(G.cash).toLocaleString();
  const cd=document.getElementById('cash');
  cd.className=G.cash<0?'broke':G.cash<200000?'low':'';cd.id='cash';
  const startYrP=G.sc?.startYear||1970;
  const totalT=(2020-startYrP)*2,elapsed=(G.year-startYrP)*2+(G.period-1);
  document.getElementById('progfill').style.width=Math.min(100,Math.round((elapsed/Math.max(totalT,1))*100))+'%';
  const isSandbox=G.score.isSandbox||G.year>2020;
  document.getElementById('hmode').textContent=isSandbox?'SANDBOX':'CAMPAIGN';
  document.getElementById('hmode').style.color=isSandbox?'var(--blu)':'var(--amb)';
  document.getElementById('proglbl').textContent=isSandbox?`SANDBOX — ${G.year}`:`${G.year} · ${startYrP}→2020`;
  const ab=document.getElementById('alertbar');
  // Detect broken/uninitialized state: stations exist but no revenue has ever run
  const _isBlankState = G.cash===0 && G.turn===0 && G.ps.every(s=>!s.fin?.rev);
  if(_isBlankState){
    ab.className='on';
    ab.style.background='rgba(245,166,35,.12)';
    ab.style.borderColor='var(--amb)';
    ab.style.color='var(--amb)';
    ab.innerHTML=`⚠ Game state appears incomplete. <a href="#" onclick="openScenSelect(getLocalSave());return false;" style="color:var(--amb);font-weight:bold">← Back to scenario select</a> &nbsp;|&nbsp; <a href="#" onclick="localStorage.removeItem('wavelength_autosave');location.reload();return false;" style="color:var(--red)">🗑 Clear save &amp; restart</a>`;
    return;
  }
  const expiring=myPS().flatMap(s=>Object.entries(s.prog)
    .filter(([,sd])=>sd?.talent&&(sd.talent.cyr||0)<=0)
    .map(([sl,sd])=>`${s.callLetters} ${SL[sl]} (${sd.talent.name})`));
  const _myDisplayCash = MP.mode==='live' ? (G._playerCash?.[MP.playerId]||G.cash) : G.cash;
  if(_myDisplayCash<0&&!G.score.isSandbox){
    ab.className='on';
    ab.textContent=`⚠ NEGATIVE CASH — ${f$(_myDisplayCash)} — Recover within 2 periods or face forced sale.`;
  } else if(expiring.length){
    ab.className='on';
    ab.style.background='rgba(245,166,35,.15)';
    ab.style.borderColor='var(--amb)';
    ab.style.color='var(--amb)';
    ab.textContent=`📋 CONTRACT EXPIRING: ${expiring.join(' · ')} — click their name to negotiate.`;
  } else {
    ab.className='';
    ab.style.background='';ab.style.borderColor='';ab.style.color='';
  }
  // FCC ownership label
  const lim=fccLimits(G.year,G.stations.length);
  const myOwn=fccOwned('player',G);
  const ownLblText=lim.mode==='pre96'
    ?`${myOwn.am}/${lim.am} AM · ${myOwn.fm}/${lim.fm} FM`
    :`${myOwn.total}/${lim.total} stations (FCC limit)`;
  document.getElementById('ownlbl').textContent=ownLblText;
}

function rScore(){
  const sc = MP.mode==='live' ? playerScoreCalc(MP.playerId) : scoreCalc(G);
  const grade=gradeFromScore(sc.total);
  const isSandbox=G.score.isSandbox;
  // Use per-player decade scores in MP
  const _myPScore = MP.mode==='live' ? G._playerScore?.[MP.playerId] : null;
  const _dcSource = _myPScore?.decadeScores || G.score.decadeScores;
  const decadeKeys=Object.keys(_dcSource).map(Number).sort();
  const prevDecades=decadeKeys.map(y=>`<div class="sbr"><span class="sbl">${DECADE_NAMES[y]||y}</span><span class="sbv amb">${_dcSource[y].total}/100 · ${_dcSource[y].vp||0}VP</span></div>`).join('');
  const totalVP=decadeKeys.reduce((s,y)=>s+(_dcSource[y].vp||0),0);
  // Market rank for MY primary station only
  const sorted=[...G.stations].filter(s=>s&&!s._bpSlotDeferred&&s.rat).sort((a,b)=>b.rat.share-a.rat.share);
  const myStns = myPS();
  const primaryRank=myStns.length ? sorted.findIndex(s=>s.id===myStns[0].id)+1 : sorted.findIndex(s=>s.isPlayer)+1;
  const rankLabel=primaryRank<=0?'—':`#${primaryRank} of ${sorted.length}`;
  const rankColor=primaryRank<=1?'var(--grn)':primaryRank<=3?'var(--amb)':'var(--off)';
  const totalRev=myPS().reduce((s,st)=>s+st.fin.rev,0);
  const gradeColor=grade==='A'?'var(--grn)':grade==='B'?'#8aef8a':grade==='C'?'var(--amb)':grade==='F'?'var(--red)':'#e89020';
  const myShareTotal=myPS().reduce((s,st)=>s+(st.rat.share||0),0);
  const scorebarEl=document.getElementById('scorebar');
  if(scorebarEl)scorebarEl.innerHTML=
    `<div class="sbi"><span class="sbi-lbl">RANK</span><span class="sbi-val amb">${rankLabel}</span></div>`+
    `<div class="sbi"><span class="sbi-lbl">SHARE</span><span class="sbi-val">${pct(myShareTotal)}</span></div>`+
    `<div class="sbi"><span class="sbi-lbl">CASH</span><span class="sbi-val grn">${f$(G.cash)}</span></div>`+
    `<div class="sbi"><span class="sbi-lbl">SCORE</span><span class="sbi-val" style="color:${gradeColor}">${isSandbox&&G.score.decadeScores[2020]?G.score.decadeScores[2020].total:sc.total}<span style="font-size:13px"> ${grade}</span></span></div>`+
    (totalVP>0?`<div class="sbi"><span class="sbi-lbl">VP</span><span class="sbi-val amb">${totalVP}</span></div>`:'')+
    (isSandbox?'<div style="font-family:var(--ft);font-size:11px;color:var(--mut);letter-spacing:1px;align-self:center">SANDBOX</div>':'');
  const scoreboxEl=document.getElementById('scorebox');
  if(scoreboxEl)scoreboxEl.innerHTML=`
    <div class="sbh">SCORE</div>
    ${isSandbox?'<div class="sandbox-badge">SANDBOX — SCORE LOCKED</div>':''}
    <div class="sbr"><span class="sbl">Market Rank</span><span class="sbv" style="color:${rankColor}">${rankLabel}</span></div>
    <div class="sbr"><span class="sbl">Share</span><span class="sbv">${sc.shareScore}/100</span></div>
    <div class="sbr"><span class="sbl">Cash Growth</span><span class="sbv">${sc.cashScore}/100</span></div>
    <div class="sbr"><span class="sbl">Peak Revenue</span><span class="sbv">${sc.peakScore}/100</span></div>
    ${totalVP>0?`<div class="sbr"><span class="sbl">VP Banked</span><span class="sbv amb">${totalVP} VP</span></div>`:''}
    ${prevDecades}
    <div class="sbtotal"><span class="sbtl">TOTAL</span><span class="sbtv">${isSandbox&&G.score.decadeScores[2020]?G.score.decadeScores[2020].total:sc.total}/100 <span style="font-size:18px;color:${gradeColor}">${grade}</span></span></div>`;
}

function rTick(){
  const srt=[...G.stations].filter(s=>s&&!s._bpSlotDeferred&&s.rat).sort((a,b)=>b.rat.share-a.rat.share);
  // Find player rank(s) in market
  const playerRanks=myPS().map(s=>{
    const rank=srt.findIndex(st=>st.id===s.id)+1;
    return `#${rank} ${s.callLetters} ${pct(s.rat.share)}`;
  });
  const items=[
    ...srt.slice(0,3).map((s,i)=>{const op=simulcastOperationalSource(s);return `#${i+1} ${s.callLetters} ${FM[op.format]?.l||op.format} ${pct(s.rat.share)}`;}),
    playerRanks.length?`YOU: ${playerRanks.join(' · ')} · Cash: ${f$(G.cash)}`:`Cash: ${f$(G.cash)}`,
    (()=>{
      const sm=seasonMult(G.year,G.period,'NEWS_TALK'); // representative
      const baseSm=G.period===2?SEASONAL.fall:SEASONAL.spring;
      const elNote=G.year%2===0&&G.period===2?' 🗳 ELECTION':'';
      return `AD IDX ${(G.adx*100).toFixed(0)}% · ${G.period===2?'FALL':'SPRING'} AD MKT ${baseSm>=1?'+':''}${Math.round((baseSm-1)*100)}%${elNote} · FM ${pct(G.fmp)} · STREAM ${(G.streamDrag*100).toFixed(0)}%`;
    })(),
    ...G.news.slice(0,4).map(n=>n.t),
  ];
  document.getElementById('ti').innerHTML=[...items,...items].map(t=>{
    const display=t.length>120?t.slice(0,117)+'\u2026':t;
    return `<span class="tk ${t.includes('\u26a1')?'alr':t.includes('\U0001f4e1')?'hi':t.startsWith('YOU:')?'you':''}">\u00a0\u00b7\u00a0 ${display} \u00a0</span>`;
  }).join('');
}

function mpIsMe(s){
  if(MP.mode!=='live') return s.isPlayer;
  return s.isPlayer && s._mpOwner===MP.playerId;
}
function mpStationColor(s){
  // In MP each player has their own color; solo always orange
  return s.color||'#f5a623';
}
function rStns(){
  const c=document.getElementById('stns');c.innerHTML='';
  // In multiplayer, only render stations owned by this player
  const myStations = MP.mode==='live'
    ? G.ps.filter(s => s._mpOwner === MP.playerId)
    : G.ps;
  const freqLineHtml=st=>{
    if(!st)return '';
    return st.fmBooster?st.freq+' · <span style="color:var(--grn);font-family:var(--ft);font-size:14px">FM TRANSLATOR</span>'+(st._boosterOrigFreq?' · <span style="color:var(--mut)">+'+st._boosterOrigFreq+'</span>':''): st.sig.pw==='DA'?st.freq+' · AM · <span style="color:var(--red);font-family:var(--ft);font-size:14px" title="Daytimer: 50kW day, 1-5kW night">DAYTIMER</span>': st.freq+' · '+st.sig.type+' · '+st.sig.pw.toUpperCase();
  };
  myStations.forEach(s=>{
    const partner=s.simulcastWith?G.stations.find(st=>st.id===s.simulcastWith):null;
    const isPlayerPair=partner&&myStations.some(st=>st.id===partner.id);
    if(isPlayerPair&&partner&&s._simulcastSource===false&&s.simulcastWith)return;
    const junior=isPlayerPair&&s._simulcastSource===true?partner:null;
    const op=simulcastOperationalSource(s);
    const pr=s.cp;
    const trd=!pr?'':pr.col?'<span style="color:var(--red)">⬇⬇</span>':pr.under?'<span style="color:var(--red)">⬇</span>':pr.sur?'<span style="color:var(--grn)">⬆</span>':'<span style="color:var(--mut)">→</span>';
    const revUi=junior?s.fin.rev+junior.fin.rev:s.fin.rev;
    const costUi=junior?s.fin.cost+junior.fin.cost:s.fin.cost;
    const stnEbitda=revUi-costUi;
    const shareUi=junior?s.rat.share+junior.rat.share:s.rat.share;
    const div=document.createElement('div');
    div.className=`sc ${stnEbitda>=0?'profit':'loss'}`;
    const _simSrc=simulcastProgrammingSource(s);
    const slrows=Object.entries(SL).map(([k,lbl])=>{
      const sd=s.prog[k],tn=sd?.talent?.name,q=Math.round(sd?.quality||0),c2=qc(q);
      const vlbl=vacantLabel(op.format,k);
      const srcTal=!tn&&_simSrc?_simSrc.prog[k]?.talent:null;
      if(!tn&&srcTal){
        const sn=_simSrc.callLetters;
        return `<div class="slr"><span class="sln">${lbl}</span><span class="slt" style="color:var(--off)" title="Simulcast — on-air from ${sn}">◈ ${srcTal.name} <span style="color:var(--mut);font-size:13px">(${sn})</span></span><span class="slsal">${f$(srcTal.salary/2)}/p · src</span><span class="slq" style="color:${c2==='good'?'var(--grn)':c2==='warn'?'var(--amb)':'var(--red)'}" title="Programming Quality (0-100)">Q ${q}</span></div>`;
      }
      if(!tn) return `<div class="slr"><span class="sln">${lbl}</span><span class="slt vac">${vlbl}</span><span class="slsal"></span><span class="slq" style="color:${c2==='good'?'var(--grn)':c2==='warn'?'var(--amb)':'var(--red)'}" title="Programming Quality (0-100)">Q ${q}</span></div>`;
      const t=sd.talent;
      const cyr=t.cyr||0;
      const cyrCls=cyr<=0?'cyr-exp':cyr<=0.5?'cyr-warn':'cyr-ok';
      const cyrLbl=cyr<=0?'EXP':cyr<=0.5?'EXP⬆':'';
      const cyrTitle=cyr<=0?'Contract expired — click name to negotiate now':cyr<=0.5?'Contract expires next period — click name to extend':'ready';
      const mor=t.morale||65;
      const morCol=mor>=70?'var(--grn)':mor>=45?'var(--amb)':'var(--red)';
      return `<div class="slr">
        <span class="sln">${lbl}</span>
        <span class="slt clickable" onclick="openContract('${s.id}','${k}')">${tn}</span>
        ${cyrLbl?`<span class="${cyrCls}" title="${cyrTitle}">${cyrLbl}</span>`:''}
        <svg class="mor-bar" viewBox="0 0 28 4"><rect width="28" height="4" fill="rgba(255,255,255,.1)" rx="2"/><rect width="${Math.round(mor*.28)}" height="4" fill="${morCol}" rx="2"/></svg>
        <span class="slsal">${f$(t.salary/2)}/p</span>
        <span class="slq" style="color:${c2==='good'?'var(--grn)':c2==='warn'?'var(--amb)':'var(--red)'}">${q}</span>
      </div>`;
    }).join('');
    const qc2=qc(op.oq);
    div.innerHTML=`
      <div class="sctop"><div>
        <div class="sccall">${junior?callDisplay(s)+' + '+callDisplay(junior):callDisplay(s)}</div>
        <div class="scfreq">${junior?`<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;line-height:1.25"><span>${freqLineHtml(s)}</span><span>${freqLineHtml(junior)}</span></div>`:freqLineHtml(s)}</div>
        <div class="scbrand">"${op.brand}" · ${FM[op.format]?.l||op.format} <span style="color:var(--mut);font-size:15px;font-style:normal">· ${genderLabel(op.format)}</span></div>
        ${junior?(()=>{const bL=s.sig.type,bJ=junior.sig.type;const lbl=bL===bJ?(bL+'/'+bL+' SIMULCAST'):'AM/FM SIMULCAST';return '<div class="sim-tag" style="color:var(--grn)">◈ '+lbl+' · '+callDisplay(s)+' + '+callDisplay(junior)+'</div>';})():partner&&!isPlayerPair?'<div class="sim-tag">◈ SIMULCAST WITH '+callDisplay(partner)+'</div>':''}
        ${s._lmaStation?'<div class="sim-tag" style="color:var(--blu);border-color:rgba(90,180,255,.4)">📝 LMA — LEASED OPERATION · fee: '+f$(lmaFeeForStation(s))+'/period</div>':''}
        ${s.lmaLessorId?'<div class="sim-tag" style="color:var(--grn);border-color:rgba(82,227,110,.4)">📝 LMA — LEASED OUT · receiving: '+f$(lmaFeeForStation(s))+'/period</div>':''}
      </div><div><div class="scshv">${pct(shareUi)}</div><div class="scshl">SHARE ${trd}</div></div></div>
      <div class="qr"><span class="ql">QUALITY</span><div class="qb"><div class="qf ${qc2}" style="width:${op.oq}%"></div></div><span class="qn">${op.oq}</span></div>
      <div class="fg">
        <div><span class="fl">${s.lmaLessorId?'LICENSE FEE INCOME':'REVENUE/PERIOD'} ${s.lmaLessorId?'':('<span style="font-size:15px;color:'+( G.period===2?'var(--grn)':'var(--amb)')+'">'+(G.period===2?'▲ FALL':'▼ SPRING')+'</span>')}</span><span class="fv">${f$(revUi)}</span></div>
        <div><span class="fl">${s.lmaLessorId?'OPERATOR COSTS':''}${!s.lmaLessorId?'COSTS/PERIOD':''}</span><span class="fv ${s.lmaLessorId?'pos':''}">${s.lmaLessorId?'BORNE BY OPERATOR':f$(costUi)}</span></div>
        <div><span class="fl">EBITDA</span><span class="fv ${stnEbitda>=0?'pos':'neg'}">${stnEbitda>=0?'+':''}${f$(stnEbitda)}</span></div>
        <div><span class="fl">SELLOUT</span><span class="fv ${op.ops.sell>.75?'pos':op.ops.sell>.55?'amb':'neg'}">${Math.round(op.ops.sell*100)}%</span></div>
      </div>
      <div class="slots">${slrows}</div>
            ${(()=>{
        // Management routes through programming source (op) — junior is not rendered as its own card.
        const sfLvl=op.salesForce?.level||0;
        const sfLblText=sfLvl===0?'NONE':SF_LEVELS[sfLvl].l.split(' ').pop().toUpperCase();
        const sfActive=sfLvl>0;
        const simBtn=junior
          ?'<button class="abt" style="border-color:rgba(255,255,255,.15)" onclick="openSim(\''+s.id+'\')">◈ BREAK SIMULCAST</button>'
          :'<button class="abt b" onclick="openSim(\''+s.id+'\')">◈ SIMULCAST THIS STATION</button>';
        const driftBtn=DRIFT[op.format]?'<button class="abt" style="background:rgba(245,166,35,.12);border:1px solid var(--amb);color:var(--amb)" onclick="openDrift(\''+op.id+'\')">🎚 STRATEGY</button>':'';
        const streamBtn='<button class="abt '+(op.stream?.active?'g active':G.year>=2005?'b':'')+'" onclick="openStream(\''+op.id+'\')" '+(G.year<2005?'style="opacity:.30;cursor:default"':'')+'>'+(op.stream?.active?'📶 STREAMING ✓':'📶 ADD STREAMING')+'</button>';
        const fmBtn=st=>{
          if(!st)return '';
          if(st.simulcastWith&&!st.fmBooster){
            const partner=st.simulcastWith?G.stations.find(x=>x.id===st.simulcastWith):null;
            const fmLeg=partner&&(partner.sig.type==='FM'&&!partner.fmBooster)?partner:(st.sig.type==='FM'&&!st.fmBooster?st:null);
            const fmLbl=fmLeg?callDisplay(fmLeg):'FM';
            return '<button class="abt g" onclick="openMigrate(\''+st.id+'\')">📡 MOVE FORMAT TO '+fmLbl+'</button>';
          }
          if(st.fmBooster)return '<button class="abt g active" onclick="openFmBooster(\''+st.id+'\')">📡 TRANSLATOR '+callDisplay(st)+' ✓</button>';
          if(st.sig.type==='AM'&&G.year>=2009)return '<button class="abt b" onclick="openFmBooster(\''+st.id+'\')">📡 FM TRANSLATOR '+callDisplay(st)+'</button>';
          if(st.sig.type==='AM')return '<button class="abt" style="opacity:.28;cursor:default;font-size:14px" title="AM FM translators unlock in 2009 (FCC AM Revitalization). Use Simulcast or a full FM license before then.">📡 FM TRANSLATOR</button>';
          return '<button class="abt" style="opacity:.25;cursor:default;font-size:14px">📡 FM TRANSLATOR</button>';
        };
        const legLbl=st=>junior?`${st.callLetters}-${st.sig.type}`:callDisplay(st);
        const histArr=junior
          ?['<button class="abt" onclick="openHistory(\''+s.id+'\')">📋 HISTORY '+legLbl(s)+'</button>','<button class="abt" onclick="openHistory(\''+junior.id+'\')">📋 HISTORY '+legLbl(junior)+'</button>']
          :['<button class="abt" onclick="openHistory(\''+s.id+'\')">📋 HISTORY '+legLbl(s)+'</button>'];
        const renArr=junior
          ?['<button class="abt" onclick="openRename(\''+s.id+'\')">✏ RENAME '+legLbl(s)+'</button>','<button class="abt" onclick="openRename(\''+junior.id+'\')">✏ RENAME '+legLbl(junior)+'</button>']
          :['<button class="abt" onclick="openRename(\''+s.id+'\')">✏ RENAME '+legLbl(s)+'</button>'];
        const sellArr=junior
          ?['<button class="abt g" onclick="openSell(\''+s.id+'\')">💰 SELL '+legLbl(s)+'</button>','<button class="abt g" onclick="openSell(\''+junior.id+'\')">💰 SELL '+legLbl(junior)+'</button>']
          :['<button class="abt g" onclick="openSell(\''+s.id+'\')">💰 SELL '+legLbl(s)+'</button>'];
        const idAct=(op.identityBudget||0)>0||(op.identity||0)>=30?'g active':'';
        const idLbl=(op.identity||0)>=1?' · '+Math.round(op.identity):'';
        const idStar=(op.identityBudget||0)>0?' ★':'';
        const progAct=(op.ops?.progBudget||0)>0?'g active':'g';
        const progLbl=(op.ops?.progBudget||0)>0?' · '+f$(op.ops.progBudget)+'/p':'';
        const scActEmpty='<div class="sc-act-empty" aria-hidden="true"></div>';
        const pack2=btns=>{
          const a=btns.filter(x=>x&&String(x).trim()!=='');
          if(!a.length)return '';
          const cells=[];
          for(let i=0;i<a.length;i+=2){
            cells.push(a[i]);
            cells.push(i+1<a.length?a[i+1]:scActEmpty);
          }
          return '<div class="sc-act">'+cells.join('')+'</div>';
        };
        const sec=(title,first,inner)=>'<div class="sc-card-sec'+(first?' sc-card-sec--first':'')+'"><div class="sc-card-sec-h">'+title+'</div>'+inner+'</div>';
        const progBtns=['<button class="abt d" onclick="openFmt(\''+op.id+'\')">⚡ FORMAT</button>'];
        if(driftBtn)progBtns.push(driftBtn);
        progBtns.push(
          '<button class="abt b" onclick="openLean(\''+op.id+'\')">🎯 DEMO TARGET</button>',
          '<button class="abt '+progAct+'" onclick="openProg(\''+op.id+'\')">📈 PROG'+progLbl+'</button>',
          streamBtn,
          simBtn,
        );
        const salesLbl=sfActive?'💼 '+sfLblText+' · '+Math.round(op.ops.sell*100)+'%':'💼 SALES';
        const swapBtn='<button class="abt" onclick="openSwapSignal(\''+op.id+'\')">⇄ SWAP SIGNAL</button>';
        const fmUniq=[];
        const _m1=fmBtn(s),_m2=junior?fmBtn(junior):'';
        if(_m1)fmUniq.push(_m1);
        if(_m2&&_m2!==_m1)fmUniq.push(_m2);
        const adminBtns=[...histArr,...renArr,swapBtn,...fmUniq,...sellArr];
        return '<div class="sc-card-actions">'+
          sec('TALENT',true,pack2(['<button class="abt" onclick="openHire(\''+op.id+'\')">🎙 HIRE TALENT</button>','<button class="abt d" onclick="openFire(\''+op.id+'\')">↕ MANAGE TALENT</button>','<button class="abt" onclick="openXfer(\''+op.id+'\')">⇄ OTHER STATION</button>']))+
          sec('PROGRAMMING',false,pack2(progBtns))+
          sec('MARKETING',false,pack2(['<button class="abt" onclick="openPromo(\''+op.id+'\')">📣 MARKETING</button>','<button class="abt '+idAct+'" onclick="openIdent(\''+op.id+'\')">🏘 IDENTITY'+idLbl+idStar+'</button>','<button class="abt" onclick="openResearch(\''+op.id+'\')">📊 RESEARCH</button>']))+
          sec('SALES',false,pack2(['<button class="abt '+(sfActive?'g':'')+'" onclick="openSales(\''+op.id+'\')">'+salesLbl+'</button>','<button class="abt" onclick="openSpots(\''+op.id+'\')">📻 SPOT LOAD</button>']))+
          sec('ADMINISTRATION',false,pack2(adminBtns))+
          '</div>';
      })()}`;
    c.appendChild(div);
  });
  // Acquire button at bottom if under FCC limit
  if(fccCanAcquire('player','AM',G)||fccCanAcquire('player','FM',G)){
    const div=document.createElement('div');
    div.style.cssText='margin-top:8px';
    const minAcqPrice=Math.min(...G.stations.filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic).map(s=>acqPrice(s,G)||9999999),9999999);
    const canAffordAcq=G.cash>=Math.min(minAcqPrice,200000);
    div.innerHTML=`<button class="abt g" style="width:100%;padding:14px;font-size:15px;${canAffordAcq?'':' opacity:.45'}" onclick="openAcq()">🏢 ACQUIRE A STATION${canAffordAcq?'':'  — insufficient funds'}</button>`;
    c.appendChild(div);
  }
  // LMA button — always available (useful even when at ownership cap)
  if(G.year>=1978){
    const hasLMATargets=G.stations.some(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&!s.isPublic&&!s.lmaLesseeId&&s.rat?.share<0.04)
      ||G.stations.some(s=>s.corpOwner&&s._corpLMAOffer&&!s.lmaLesseeId);
    const hasActiveLMAs=G.ps.some(s=>s._lmaStation)||G.ps.some(s=>s.lmaLessorId);
    const lmaDiv=document.createElement('div');
    lmaDiv.style.cssText='margin-top:6px';
    lmaDiv.innerHTML=`<button class="abt" style="width:100%;padding:12px;font-size:14px;background:rgba(90,180,255,.10);border:1px solid rgba(90,180,255,.35);color:var(--blu)" onclick="openLMA()">📝 LOCAL MARKETING AGREEMENTS${hasActiveLMAs?' ●':hasLMATargets?' — deals available':''}</button>`;
    c.appendChild(lmaDiv);
  }
}

function rMkt(){
  // Update city name (supports multi-market future)
  const cityEl=document.getElementById('mkt-city');
  if(cityEl)cityEl.textContent=(G.city||'Atlanta').toUpperCase();
  const hcityEl=document.getElementById('hcity');if(hcityEl)hcityEl.textContent=(G.city||'Atlanta').toUpperCase();
  const sb=document.getElementById('scen-banner');
  if(sb&&MP.mode!=='live'){
    if(!sb.dataset.id||sb.dataset.id!==G.sc.id){
      sb.dataset.id=G.sc.id;
      const _collapsed=sb.dataset.collapsed==='1'?true:(G.turn||0)>6&&sb.dataset.collapsed!=='0';
      sb.dataset.collapsed=_collapsed?'1':'0';
      sb.innerHTML=`<div class="scen-banner-name" style="cursor:pointer" onclick="
        const el=this.parentElement;
        el.dataset.collapsed=el.dataset.collapsed==='1'?'0':'1';
        el.dataset.id='';
        renderAll();
      ">${G.sc.l.toUpperCase()} <span style="color:var(--mut);font-size:11px">${_collapsed?'▼ SHOW':'▲ HIDE'}</span></div>`+
        (!_collapsed?`<div class="scen-banner-desc">${G.sc.d}</div>`:'');
    }
  }
  const sw=document.getElementById('scenwrap');
  if(sw&&MP.mode!=='live'){if(!sw.dataset.id||sw.dataset.id!==G.sc.id){sw.dataset.id=G.sc.id;sw.innerHTML='';}}
  const rankRows=buildSimulcastCombinedRankRows(G.stations);
  document.getElementById('mtb').innerHTML=rankRows.map((row,i)=>{
    const s=row.pair?row.lead:row.st;
    const op=simulcastOperationalSource(s);
    const share=row.share,rev=row.rev;
    const pr=s.cp,tr=!pr?'—':pr.col?'⬇⬇':pr.under?'⬇':pr.sur?'⬆':'→';
    const tc=!pr?'tfl':pr.col||pr.under?'tdn':pr.sur?'tup':'tfl';
    const band=s.fmBooster?'FM+':(s.sig.type==='FM'?'FM':'AM');
    const simMark='<span style="color:var(--blu);font-size:13px">◈</span>';
    const calls=row.pair
      ?`${callDisplay(simulcastOperationalSource(row.lead))} + ${simMark}`
      :s.simulcastWith
        ?`${callDisplay(simulcastOperationalSource(s))} + ${simMark}`
        :callDisplay(s);
    const _me=row.pair?(mpIsMe(row.lead)||mpIsMe(row.rcv)):mpIsMe(s);
    const _anyP=s.isPlayer;
    const clickAttr=!s.isPublic?` onclick="showCompIntel('${s.id}')" style="cursor:pointer" title="${_me?'Open station intel':_anyP?'View opponent intel':'View competitor intel'}"`:'';
    const badges=_me?'<span class="yp">YOU</span>':_anyP?`<span class="yp" style="background:${s.color||'#60a5fa'};color:#000">OPP</span>`:'';
    const stationCell=`<div class="mt-station-inner"><span class="clg" style="color:${mpStationColor(s)}">${calls}</span><span class="mt-stn-meta" title="Band">${band}</span>${badges?`<span style="display:inline-flex;align-items:center;flex-shrink:0">${badges}</span>`:''}</div>`;
    return `<tr class="${_me?'you':''}"${clickAttr}><td><span class="rn">${i+1}</span></td><td class="mt-station">${stationCell}</td><td><span class="fmtag">${FM[op.format]?.l||op.format}</span></td><td><span class="shn" style="color:${_me?'var(--amb)':_anyP?s.color:'var(--wht)'}">${pct(share)}</span></td><td class="mt-trend"><span class="${tc}" style="font-size:15px">${tr}</span></td><td><span class="rvn">${f$(rev)}</span></td></tr>`;
  }).join('');
  // In MP, show the current player's lead station; in solo, G.ps[0]
  const _myStns = MP.mode==='live' ? G.ps.filter(s=>s._mpOwner===MP.playerId) : G.ps;
  const ps = _myStns[0] || G.ps[0];
  if(!ps)return;
  // Pick the lead station (highest share among this player's stations)
  const _leadStn = _myStns.reduce((best,s)=>(!best||s.rat.share>best.rat.share)?s:best, null) || ps;
  document.getElementById('dmb').innerHTML=COH.map(coh=>{
    const by=[...G.stations].filter(s=>s&&!s._bpSlotDeferred&&s.rat).sort((a,b)=>(b.rat.cur[coh]?.share||0)-(a.rat.cur[coh]?.share||0));
    const mx2=by[0]?.rat.cur[coh]?.share||1;
    const bars=by.slice(0,8).map(s=>{const sh=s.rat.cur[coh]?.share||0,w=Math.round((sh/mx2)*100);const op=simulcastOperationalSource(s);const _isMe=mpIsMe(s),_isAnyP=s.isPlayer;return `<div class="cb" data-tip="${callDisplay(s)} · ${FM[op.format]?.l||op.format} · ${pct(sh)}" style="background:${s.color};width:${w}%;opacity:${_isAnyP?(_isMe?1:.65):.38};${_isMe?'outline:2px solid rgba(255,255,255,.4)':_isAnyP?'outline:1px dashed rgba(255,255,255,.2)':''}" title=""></div>`;}).join('');
    return `<div class="cr"><span class="crl">${coh}</span><div class="cbs">${bars}</div><span class="cp">${pct(_leadStn.rat.cur[coh]?.share||0)}</span></div>`;
  }).join('');
}

function rIntel(){
  // MP: show opponent stations at top of intel panel
  let mpOpponentHTML = '';
  if(MP.mode==='live'){
    const opponents=G.ps.filter(s=>s._mpOwner!==MP.playerId);
    if(opponents.length){
      const oppByPlayer=[...new Set(opponents.map(s=>s._mpOwner))];
      mpOpponentHTML=oppByPlayer.map(pid=>{
        const pStns=opponents.filter(s=>s._mpOwner===pid);
        const pName=MP.players.find(p=>p.playerId===pid)?.name||`Player ${pid+1}`;
        const pColor=['#f5a623','#60a5fa','#34d399','#f87171'][pid%4];
        const pCash=G._playerCash?.[pid]??0;
        const pVP=G._playerScore?.[pid]?.totalVP??0;
        const pRows=pStns.sort((a,b)=>b.rat.share-a.rat.share).map(s=>{
          const op=simulcastOperationalSource(s);
          const pr=s.cp,tr=!pr?'→':pr.col?'⬇⬇':pr.under?'⬇':pr.sur?'⬆':'→';
          const tc=!pr?'tfl':pr.col||pr.under?'tdn':pr.sur?'tup':'tfl';
          return `<div class="ir clickable" style="border-left:2px solid ${pColor};padding-left:6px" onclick="showCompIntel('${s.id}')" title="View intel on ${s.callLetters}">
            <span class="ic" style="color:${pColor}">${s.callLetters}</span>
            <div class="iff"><span class="ifmt">${FM[op.format]?.l||op.format}</span><span class="iper">${s.freq}</span></div>
            <span class="ish">${pct(s.rat.share)}</span>
            <span class="itr ${tc}">${tr}</span>
            <span class="ish" style="color:var(--mut);font-size:14px">${f$(s.fin.rev)}</span>
            <span style="color:var(--mut);font-size:15px;margin-left:2px;flex-shrink:0">🔍</span>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:6px">
          <div style="font-size:15px;font-family:var(--ft);color:var(--mut);letter-spacing:.08em;padding:4px 0 2px">⚔ OPPONENT — <span style="color:${pColor}">${pName.toUpperCase()}</span></div>
          <div style="font-size:14px;color:var(--mut);padding:2px 0 4px;font-family:var(--ft)">Cash: <span style="color:${pColor}">${f$(pCash)}</span>${pVP?` · VP: <span style="color:var(--amb)">${pVP}</span>`:''}</div>
          ${pRows}
          <div style="height:1px;background:var(--brdr);margin:6px 0"></div>
        </div>`;
      }).join('');
    }
  }
  document.getElementById('intel').innerHTML=mpOpponentHTML+[...G.stations].filter(s=>s&&!s._bpSlotDeferred&&!s.isPlayer&&s.rat).sort((a,b)=>b.rat.share-a.rat.share).map(s=>{
    const pubTag=s.isPublic?`<span style="font-size:15px;background:#1e3a5f;color:#7dd3fc;padding:1px 4px;border-radius:2px;font-family:var(--ft)"> PUBLIC</span>`:'';
    const corpTag=s.corpOwner&&!s.isPlayer?`<span style="font-size:15px;background:${s.corpColor||'#374151'};color:#fff;padding:1px 4px;border-radius:2px;font-family:var(--ft)"> ${(s.corpName||'CORP').split(' ')[0].toUpperCase()}</span>`:'';

    const pr=s.cp,tr=!pr?'—':pr.col?'⬇⬇':pr.under?'⬇':pr.sur?'⬆':'→';
    const tc=!pr?'tfl':pr.col||pr.under?'tdn':pr.sur?'tup':'tfl';
    const sc2=pr?.sur?'var(--grn)':pr?.col?'var(--red)':'var(--wht)';
    const clickable=!s.isPublic;
    return `<div class="ir${clickable?' clickable':''}" ${clickable?`onclick="showCompIntel('${s.id}')" title="Click for competitor intel"`:''}>` +
      `<span class="ic" style="color:${s.color}">${callDisplay(s)}${pubTag}${corpTag}</span>` +
      `<div class="iff"><span class="ifmt">${FM[s.format]?.l||s.format} · ${s.freq}</span>` +
      `<span class="iper" style="color:${s.corpOwner?s.corpColor||'#9ca3af':'inherit'}">${s.corpOwner?(s.corpName||'Corporate'):s.pers?.l||''}</span></div>` +
      `<span class="ish" style="color:${sc2}">${pct(s.rat.share)}</span>` +
      `<span class="itr ${tc}">${tr}</span>` +
      `<span class="ish" style="color:var(--mut);font-size:14px">${f$(s.fin.rev)}</span>` +
      `${clickable?'<span style="color:var(--mut);font-size:15px;margin-left:2px;flex-shrink:0">🔍</span>':''}</div>`;
  }).join('');
}

let _newsExpanded=false;
function rNews(){
  const nl=document.getElementById('news');
  if(!G.news.length){nl.innerHTML='<p class="enote">No news yet. Advance a period.</p>';return;}
  const limit=_newsExpanded?50:14;
  const _nitems=G.news.slice(0,limit).map(n=>`<div class="ni ${n.iy?'you':''}">`+
    `<div class="nm">${n.y} ${PERIODS[(n.p||1)-1]} · ${n.v||'LOW'}</div>`+
    `<div class="nt ${n.v==='HIGH'?'hi':''}">${n.t}</div></div>`).join('');
  const moreBtn=G.news.length>14?`<div style="text-align:center;padding:6px 0"><button class="abt" style="font-size:15px;padding:4px 14px" onclick="_newsExpanded=!_newsExpanded;rNews()">${_newsExpanded?'\u25b2 Show less':'\u25bc Show '+(G.news.length-14)+' more'}</button></div>`:'';
  nl.innerHTML=_nitems+moreBtn;
  const el=document.getElementById('evts');
  const up=G.evq.filter(ev=>(ev.y===G.year&&ev.p>G.period)||ev.y===G.year+1||ev.y===G.year+2).slice(0,4);
  el.innerHTML=up.length?up.map(ev=>`<div class="ev"><div class="evt">${ev.y} ${PERIODS[ev.p-1]} · ${ev.t}</div><div class="evd">${ev.d}</div></div>`).join(''):'<p class="enote">No upcoming events on the horizon.</p>';
}

init();
// Wire NEXT PERIOD button via addEventListener (more reliable than onclick attribute)
(function() {
  function wireNextBtn() {
    const btn = document.getElementById('abtn');
    if (!btn) { setTimeout(wireNextBtn, 100); return; }
    btn.addEventListener('click', function(e) {
      console.log('[BTN] abtn clicked, mode=', MP.mode, 'isHost=', MP.isHost);
      mpHandleNextPeriod();
    });
    console.log('[BTN] abtn wired via addEventListener');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireNextBtn);
  } else {
    wireNextBtn();
  }
})();
