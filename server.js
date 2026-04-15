// ═══════════════════════════════════════════════════════════════════
// AIRWAVE EMPIRE — multiplayer game server
// Node.js + Socket.io
//
// Architecture: host-authoritative
//   - Host client runs advTurn() locally and broadcasts resulting G
//   - All player actions relay through server for ordering + broadcast
//   - Server enforces: action ordering, period commit gating, room state
//
// Persistence:
//   - Generated asset TTL GC: npm run gc:generated-assets (pins paths from saves/, data/cloud_saves/, multiplayer/saves/)
//   - G is saved to ./saves/<roomId>.json after every state_update
//   - Players can rejoin by room code at any time while server is running
//   - Saves survive server restarts — rooms are restored from disk on boot
//
// Run: node server.js
// Requires: npm install express socket.io dotenv
//
// Spectator TV (read-only rankings, same room code): open /spectate.html?room=CODE
// Uses socket event spectate_room — updates on each host state_broadcast (every period).
// Image API: SHORTAPI_KEY (ShortAPI z-image, default) and/or GROK_API_KEY for /api/generate-logo, /api/generate-remote-van (Grok edit + logo reference), and AI portraits.
// Station jingles: POST /api/generate-station-jingle — same SHORTAPI_KEY; model suno/suno-v5.5/generate (override SHORTAPI_SUNO_MODEL).
// IMAGE_GEN_PROVIDER=shortapi | grok | auto — auto prefers SHORTAPI_KEY when set.
// Trade ratings digest: POST /api/ratings-digest — SHORTAPI_KEY, OPENROUTER_API_KEY, and/or OPENAI_API_KEY; see RATINGS_DIGEST_PROVIDER in .env.example.
// Stock pool (random assignment before Grok): generated-portraits/library/{male|female}/{era}/
// Grok output (organized by hire-era bucket + gender): generated-portraits/grok/{male|female|unknown}/{era}/
// See GET /api/portrait-library/status (includes both library + grok counts). PORTRAIT_LIBRARY_FIRST=0 prefers Grok when both exist.
// ═══════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
// Local: copy .env.example → .env (gitignored). Deploys that rsync/git-clean the app dir often
// wipe `.env`; set secrets on the host (systemd Environment=, Docker -e, PaaS) or put them in a
// file outside the deploy tree and set WL_ENV_FILE=/path/to/secrets.env — loaded second with override.
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (process.env.WL_ENV_FILE && fs.existsSync(process.env.WL_ENV_FILE)) {
  require('dotenv').config({ path: process.env.WL_ENV_FILE, override: true });
}

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const { Server } = require('socket.io');
const { randomBytes } = require('crypto');
const { getSharedCorsOptions, allowedOriginsList } = require('./server/corsConfig');
const { posthog } = require('./server/posthog');

const app        = express();
const corsOpts   = getSharedCorsOptions();
app.use(cors(corsOpts));

// Stripe webhook must see raw body (register before express.json)
const { stripeWebhookHandler, mountStripeBilling } = require('./server/stripeBilling');
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Default 32mb — Express default (~100kb) rejects large cloud saves. Override with JSON_BODY_LIMIT; nginx needs client_max_body_size to match.
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '32mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));

const { mountLogoRoutes } = require('./server/logoRoutes');
const { mountRemoteVanRoutes } = require('./server/remoteVanRoutes');
const { mountPortraitRoutes } = require('./server/portraitRoutes');
const { isWeakDraftStation } = require('./server/draftFairness');

mountLogoRoutes(app);
mountRemoteVanRoutes(app);
mountPortraitRoutes(app);
mountStripeBilling(app);

const { mountCloudSaves } = require('./server/cloudSaves');
mountCloudSaves(app);

const { mountFeedback } = require('./server/feedbackRoutes');
mountFeedback(app);

const { mountAnalytics } = require('./server/analyticsRoutes');
mountAnalytics(app);

const { mountRatingsDigestRoutes } = require('./server/ratingsDigestRoutes');
mountRatingsDigestRoutes(app);

const { mountJingleRoutes } = require('./server/jingleRoutes');
mountJingleRoutes(app);

const httpServer = http.createServer(app);
const io         = new Server(httpServer, {
  cors: corsOpts,
  maxHttpBufferSize: 10e6,   // 10MB — G state + history can grow
});

const { attachSocketAuth } = require('./server/mpAuth');
attachSocketAuth(io);

const PORT     = process.env.PORT || 3000;
const SAVE_DIR = path.join(__dirname, 'saves');

// Ensure saves directory exists
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);

// ── PERSISTENCE ────────────────────────────────────────────────────

function roomSavePath(roomId) {
  return path.join(SAVE_DIR, `${roomId}.json`);
}

function persistRoom(room) {
  try {
    const data = {
      id:          room.id,
      phase:       room.phase,
      scenarioId:  room.scenarioId,
      players:     room.players.map(p => ({
        // Save name + playerId but NOT socketId — that changes on reconnect
        name:     p.name,
        playerId: p.playerId,
        accountId: p.accountId || undefined, // Clerk user id when using accounts
        // Store the most recent socket id so we can match on rejoin by name+playerId
        lastSocketId: p.socketId,
      })),
      G:           room.G,
      savedAt:     new Date().toISOString(),
    };
    fs.writeFileSync(roomSavePath(room.id), JSON.stringify(data), 'utf8');
  } catch(e) {
    console.error(`[SAVE] Failed to persist room ${room.id}:`, e.message);
  }
}

/** Host snapshots can omit cosmetic fields (e.g. guest generated a logo). Fill gaps from prior room.G. */
function mergeMpStationLogosFromPrior(intoG, priorG) {
  if (!intoG?.stations || !priorG?.stations) return;
  const priorById = Object.fromEntries(priorG.stations.filter(Boolean).map(s => [s.id, s]));
  for (const s of intoG.stations) {
    if (!s) continue;
    const p = priorById[s.id];
    if (!p?.cosmeticLogoUrl || s.cosmeticLogoUrl) continue;
    s.cosmeticLogoUrl = p.cosmeticLogoUrl;
    if (p.cosmeticLogoV != null) s.cosmeticLogoV = p.cosmeticLogoV;
    if (p.cosmeticLogoTone) s.cosmeticLogoTone = p.cosmeticLogoTone;
    if (p.cosmeticRemoteVanUrl && !s.cosmeticRemoteVanUrl) {
      s.cosmeticRemoteVanUrl = p.cosmeticRemoteVanUrl;
      if (p.cosmeticRemoteVanV != null) s.cosmeticRemoteVanV = p.cosmeticRemoteVanV;
    }
    if (p.remoteVanMarketingLift != null && s.remoteVanMarketingLift == null) {
      const lift = Number(p.remoteVanMarketingLift);
      if (Number.isFinite(lift)) s.remoteVanMarketingLift = lift;
    }
    if (p.remoteVanPurchasedYear != null && s.remoteVanPurchasedYear == null) {
      const py = Number(p.remoteVanPurchasedYear);
      if (Number.isFinite(py)) s.remoteVanPurchasedYear = py;
    }
    if (p.cosmeticJingleUrl && !s.cosmeticJingleUrl) {
      s.cosmeticJingleUrl = p.cosmeticJingleUrl;
      if (p.cosmeticJingleV != null) s.cosmeticJingleV = p.cosmeticJingleV;
    }
    if (p.jingleMarketingLift != null && s.jingleMarketingLift == null) {
      const jl = Number(p.jingleMarketingLift);
      if (Number.isFinite(jl)) s.jingleMarketingLift = jl;
    }
    if (p.jingleCommissionedYear != null && s.jingleCommissionedYear == null) {
      const jy = Number(p.jingleCommissionedYear);
      if (Number.isFinite(jy)) s.jingleCommissionedYear = jy;
    }
    if (p.jingleVariantIndex != null && s.jingleVariantIndex == null) {
      const ji = Number(p.jingleVariantIndex);
      if (Number.isFinite(ji)) s.jingleVariantIndex = ji;
    }
    if (typeof p.jingleTagline === 'string' && p.jingleTagline && !s.jingleTagline) {
      s.jingleTagline = p.jingleTagline.slice(0, 60);
    }
    if (p.cosmeticLogoBackupUrl && !s.cosmeticLogoBackupUrl && isSafeGeneratedCosmeticUrl(p.cosmeticLogoBackupUrl)) {
      s.cosmeticLogoBackupUrl = p.cosmeticLogoBackupUrl;
      if (p.cosmeticLogoBackupV != null) s.cosmeticLogoBackupV = p.cosmeticLogoBackupV;
      if (typeof p.cosmeticLogoBackupTone === 'string' && p.cosmeticLogoBackupTone.length <= 400) {
        if (p.cosmeticLogoBackupTone) s.cosmeticLogoBackupTone = p.cosmeticLogoBackupTone;
      }
    }
  }
}

function isSafeGeneratedCosmeticUrl(u) {
  return (
    typeof u === 'string' &&
    (u.startsWith('/generated-logos/') ||
      u.startsWith('/generated-remote-vans/') ||
      u.startsWith('/generated-jingles/')) &&
    !u.includes('..') &&
    u.length < 500
  );
}

function loadPersistedRooms() {
  if (!fs.existsSync(SAVE_DIR)) return;
  const files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.json'));
  let loaded = 0;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, file), 'utf8'));
      if (!data.id || !data.G) continue;
      // Restore room — all players start disconnected; they rejoin by code
      rooms[data.id] = {
        id:         data.id,
        hostId:     null,   // will be assigned when first player rejoins
        phase:      data.phase || 'playing',
        scenarioId: data.scenarioId,
        players:    data.players.map(p => ({
          socketId:  null,   // unknown until they reconnect
          name:      p.name,
          playerId:  p.playerId,
          ready:     false,
          connected: false,
          lastSocketId: p.lastSocketId,
          accountId:    p.accountId || null,
        })),
        G:          data.G,
        commitLog:  {},
        actionQueue: [],
        seq:        0,
        hostPlayerId: 0,  // playerId 0 is always host — reassigned correctly on rejoin
        _restored:  true,
      };
      loaded++;
      console.log(`[RESTORE] Room ${data.id} — ${data.players.length} players, year ${data.G?.year}`);
    } catch(e) {
      console.error(`[RESTORE] Failed to load ${file}:`, e.message);
    }
  }
  if (loaded) console.log(`[RESTORE] ${loaded} room(s) restored from disk`);
}

// ── ROOM HELPERS ───────────────────────────────────────────────────

const rooms = {};

function makeRoomId() {
  // 6-char alphanumeric, unambiguous characters only (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let id = '';
  const bytes = randomBytes(6);
  for (const b of bytes) id += chars[b % chars.length];
  return id.slice(0, 6);
}

function makeRoom(hostSocketId, hostName) {
  let id = makeRoomId();
  // Avoid collision with restored rooms
  while (rooms[id]) id = makeRoomId();
  rooms[id] = {
    id,
    hostId:     hostSocketId,
    phase:      'lobby',
    scenarioId: null,
    players: [{
      socketId:  hostSocketId,
      name:      hostName || 'Host',
      playerId:  0,
      ready:     false,
      connected: true,
      accountId: null,
    }],
    G:          null,
    commitLog:  {},
    actionQueue: [],
    seq:        0,
    hostPlayerId: 0,  // playerId 0 is always the permanent host
    draft: null,  // {order:[], pickIdx:0, picks:{socketId: [stationIdx,...]}, phase:'draft'|'done'}
  };
  return rooms[id];
}

function getRoom(roomId) {
  return rooms[roomId?.toUpperCase()] || null;
}

function getRoomBySocket(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.socketId === socketId));
}

function broadcastRoomState(room) {
  io.to(room.id).emit('room_state', {
    roomId:    room.id,
    phase:     room.phase,
    players:   room.players.map(p => ({
      socketId:  p.socketId,
      name:      p.name,
      playerId:  p.playerId,
      ready:     p.ready,
      connected: p.connected,
    })),
    hostId:    room.hostId,
    commitLog: room.commitLog,
  });
}

// Check if all connected players have committed; if so, signal host
function checkAllCommitted(room) {
  const connected = room.players.filter(p => p.connected);
  // Require all players to be connected before allowing a period advance.
  // If only 1 player is connected (other hasn't rejoined yet), wait.
  // This prevents the host from accidentally advancing while the guest is still loading.
  const expectedPlayers = room.players.length;
  if (!connected.length) return;
  if (connected.length < Math.min(2, expectedPlayers)) {
    console.log(`[CHECK] only ${connected.length}/${expectedPlayers} players connected — waiting for full roster before advancing`);
    return;
  }
  console.log(`[CHECK] room ${room.id} phase=${room.phase} commitLog=${JSON.stringify(room.commitLog)} connected=${connected.map(p=>p.name+'='+p.socketId)}`);
  const allCommitted = connected.every(p => {
    if (room.G && room.G._mpBankrupt && room.G._mpBankrupt[p.playerId]) return true;
    return room.commitLog[p.socketId];
  });
  if (allCommitted) {
    const hostSock = io.sockets.sockets.get(room.hostId);
    if (hostSock) {
      hostSock.emit('run_advturn', { roomId: room.id });
      console.log(`[TURN] ${room.id} — all committed, signaling host`);
    } else {
      console.log(`[TURN] ${room.id} — all committed but host socket NOT FOUND (hostId=${room.hostId})`);
    }
  } else {
    const waiting = connected.filter(p => !room.commitLog[p.socketId]).map(p=>p.name);
    console.log(`[CHECK] still waiting on: ${waiting.join(', ')}`);
  }
}

// ── SOCKET HANDLERS ───────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}${socket.data.spectator ? ' (spectator)' : ''}`);

  if (socket.data.spectator) {
    socket.use((packet, next) => {
      const ev = packet[0];
      if (ev !== 'spectate_room') return next(new Error('spectator_readonly'));
      next();
    });
  }

  // ── CREATE ROOM ───────────────────────────────────────────────
  socket.on('create_room', ({ name }) => {
    const room = makeRoom(socket.id, name || 'Host');
    if (room.players[0]) room.players[0].accountId = socket.data.clerkUserId || null;
    socket.join(room.id);
    socket.emit('room_created', { roomId: room.id, playerId: 0, socketId: socket.id });
    broadcastRoomState(room);
    console.log(`[ROOM] Created ${room.id} by ${socket.id}`);
    const hostAccountId = room.players[0]?.accountId;
    posthog.capture({
      distinctId: hostAccountId || socket.id,
      event: 'room created',
      properties: { room_id: room.id },
    });
  });

  // ── JOIN ROOM ─────────────────────────────────────────────────
  // ── SPECTATE (read-only TV board — not a player, no commit slot) ──
  socket.on('spectate_room', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit('spectate_error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    socket.join(room.id);
    socket.emit('spectate_ok', {
      roomId: room.id,
      phase: room.phase,
      G: room.G,
      players: room.players.map(p => ({
        name: p.name,
        playerId: p.playerId,
        connected: p.connected,
      })),
    });
    console.log(`[SPEC] ${socket.id} spectating ${room.id} (phase=${room.phase})`);
  });

  socket.on('join_room', ({ roomId, name }) => {
    const room = getRoom(roomId);
    if (!room) { socket.emit('join_error', 'Room not found.'); return; }
    if (room.phase !== 'lobby') { socket.emit('join_error', 'Game already in progress. Use REJOIN if you were in this game.'); return; }
    if (room.players.length >= 4) { socket.emit('join_error', 'Room is full (max 4 players).'); return; }

    const playerId = room.players.length;
    room.players.push({
      socketId: socket.id,
      name: name || `Player ${playerId+1}`,
      playerId,
      ready: false,
      connected: true,
      accountId: socket.data.clerkUserId || null,
    });
    socket.join(roomId);
    socket.emit('room_joined', { roomId, playerId, socketId: socket.id });
    broadcastRoomState(room);
    console.log(`[ROOM] ${socket.id} joined ${room.id} as player ${playerId}`);
    const joinAccountId = socket.data.clerkUserId || null;
    posthog.capture({
      distinctId: joinAccountId || socket.id,
      event: 'room joined',
      properties: { room_id: room.id, player_count: room.players.length },
    });
  });

  // ── REJOIN ROOM (mid-game reconnect) ──────────────────────────
  // Player provides their room code + name. Server matches them to their
  // existing player slot by name (or the only disconnected slot if unambiguous).
  socket.on('rejoin_room', ({ roomId, name, playerId: claimedId }) => {
    const room = getRoom(roomId);
    if (!room) { socket.emit('join_error', 'Room not found. The server may have restarted.'); return; }
    if (room.phase === 'lobby') { socket.emit('join_error', 'Game hasn\'t started yet — use JOIN instead.'); return; }

    // Match player slot. Priority order:
    // 1. playerId claim + name matches (most reliable, prevents slot theft)
    // 2. playerId claim alone (same browser, name might have changed)
    // 3. Name match on a disconnected slot (playerId not stored / wrong browser)
    // 4. Name match on a connected slot — could be a duplicate rejoin, reject it
    let player = null;
    if (claimedId != null) {
      // Try exact match: claimed playerId AND name
      player = room.players.find(p => p.playerId === claimedId && p.name === name);
      // Fallback: claimed playerId regardless of name (same browser, different name entry)
      if (!player) player = room.players.find(p => p.playerId === claimedId && !p.connected);
    }
    // Fallback: match by name on a disconnected slot (fresh browser, no stored playerId)
    if (!player) player = room.players.find(p => p.name === name && !p.connected);

    if (!player) {
      // Check if already connected under that name (duplicate tab / already rejoined)
      const alreadyIn = room.players.find(p => p.name === name && p.connected);
      if (alreadyIn) {
        socket.emit('join_error', `"${name}" is already connected to this game. Are you in another tab?`);
      } else {
        socket.emit('join_error', `Could not match you to a player slot. Re-enter the company name you used originally.`);
      }
      return;
    }

    const uid = socket.data.clerkUserId || null;
    if (player.accountId && uid && player.accountId !== uid) {
      socket.emit('join_error', 'This player slot is linked to a different account. Sign in with the correct account.');
      return;
    }
    if (uid && !player.accountId) {
      player.accountId = uid;
    }

    // Update socket id — this is their new connection
    const oldSocketId = player.socketId;
    player.socketId   = socket.id;
    player.connected  = true;
    socket.join(room.id);

    // Update commitLog key
    if (oldSocketId && room.commitLog[oldSocketId] !== undefined) {
      room.commitLog[socket.id] = room.commitLog[oldSocketId];
      delete room.commitLog[oldSocketId];
    } else {
      room.commitLog[socket.id] = false; // needs to commit this period
    }

    // Track the original host playerId (set on first assignment, never changes)
    if (room.hostPlayerId === undefined) room.hostPlayerId = 0; // playerId 0 is always the original host

    // Assign host strictly by original host playerId.
    // Do NOT give host to the first person who reconnects.
    const isOriginalHost = (player.playerId === room.hostPlayerId);
    const wasHost = isOriginalHost;
    if (wasHost) {
      room.hostId = socket.id;
      io.to(room.id).emit('host_migrated', { newHostId: socket.id, playerId: player.playerId });
    }

    socket.emit('room_rejoined', {
      roomId:   room.id,
      playerId: player.playerId,
      socketId: socket.id,
      isHost:   wasHost,
      G:        room.G,               // full current state
      players:  room.players,
      commitLog: room.commitLog,
    });

    broadcastRoomState(room);
    io.to(room.id).emit('player_reconnected', { playerId: player.playerId, name: player.name });
    console.log(`[REJOIN] ${socket.id} rejoined ${room.id} as player ${player.playerId} (${player.name})`);
    posthog.capture({
      distinctId: player.accountId || socket.id,
      event: 'room rejoined',
      properties: {
        room_id: room.id,
        player_id: player.playerId,
        is_host: wasHost,
        game_year: room.G?.year,
      },
    });

    // Re-check commits in case everyone was waiting on this player
    checkAllCommitted(room);
  });

  // ── PLAYER READY ──────────────────────────────────────────────
  socket.on('player_ready', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const p = room.players.find(p => p.socketId === socket.id);
    if (p) { p.ready = true; broadcastRoomState(room); }
  });

  // ── START GAME (host only) ────────────────────────────────────
  socket.on('start_game', ({ roomId, scenarioId, G: initialG }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('start_error', 'Need at least 2 players to start.'); return; }

    room.phase      = 'playing';
    room.scenarioId = scenarioId;
    room.G          = initialG;
    room.commitLog  = {};
    room.players.forEach(p => { room.commitLog[p.socketId] = false; });

    persistRoom(room);

    io.to(roomId).emit('game_started', { G: room.G, players: room.players, scenarioId });
    broadcastRoomState(room);
    console.log(`[GAME] ${roomId} started — ${room.players.length} players, scenario: ${scenarioId}`);
    const hostPlayer = room.players.find(p => p.socketId === socket.id);
    posthog.capture({
      distinctId: hostPlayer?.accountId || socket.id,
      event: 'game started',
      properties: {
        room_id: roomId,
        scenario_id: scenarioId,
        player_count: room.players.length,
      },
    });
  });

  socket.on('player_cash_update', ({ roomId, playerId, cash }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (!room.G) return;
    if (!room.G._playerCash) room.G._playerCash = {};
    room.G._playerCash[playerId] = cash;
    // Mirror to every client so MP wallets stay aligned (guests don't apply host's full G each action).
    io.to(roomId).emit('player_cash_mirrored', { playerId, cash });
  });

  // ── PLAYER ACTION ─────────────────────────────────────────────
  socket.on('player_action', ({ roomId, action, payload, G: hostG }) => {
    const room = getRoom(roomId);
    if (!room || room.phase !== 'playing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const seq = ++room.seq;
    const envelope = { playerId: player.playerId, socketId: socket.id, action, payload, seq };
    room.actionQueue.push(envelope);
    io.to(roomId).emit('action_broadcast', envelope);

    // If the host includes their current G snapshot, update room.G so rejoiners
    // get the latest state including mid-period changes (ops, salesForce, etc.)
    if (hostG && room.hostId === socket.id) {
      mergeMpStationLogosFromPrior(hostG, room.G);
      room.G = hostG;
      persistRoom(room);
    }
  });

  // ── STATION LOGO + REMOTE VAN (cosmetic) — persist to room so saves / rejoin keep art ──
  socket.on('mp_station_logo', (payload) => {
    const {
      roomId,
      stationId,
      cosmeticLogoUrl,
      cosmeticLogoV,
      cosmeticLogoTone,
      clearCosmeticLogo,
      cosmeticRemoteVanUrl,
      cosmeticRemoteVanV,
      clearCosmeticRemoteVan,
      remoteVanMarketingLift: payloadRemoteVanLift,
      remoteVanPurchasedYear: payloadRemoteVanYear,
      cosmeticJingleUrl,
      cosmeticJingleV,
      clearCosmeticJingle,
      jingleMarketingLift: payloadJingleLift,
      jingleCommissionedYear: payloadJingleYear,
      jingleVariantIndex: payloadJingleVariant,
      jingleTagline: payloadJingleTagline,
      cosmeticLogoBackupUrl: payloadLogoBackupUrl,
      cosmeticLogoBackupV: payloadLogoBackupV,
      cosmeticLogoBackupTone: payloadLogoBackupTone,
    } = payload || {};
    const room = getRoom(roomId);
    if (!room || room.phase !== 'playing' || !room.G?.stations) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const st = room.G.stations.find(s => s && s.id === stationId);
    if (!st || !st.isPlayer || st._mpOwner !== player.playerId) return;

    if (clearCosmeticJingle === true) {
      delete st.cosmeticJingleUrl;
      delete st.cosmeticJingleV;
      delete st.jingleMarketingLift;
      delete st.jingleCommissionedYear;
      delete st.jingleVariantIndex;
      delete st.jingleTagline;
      persistRoom(room);
      io.to(roomId).emit('mp_station_logo_sync', {
        stationId,
        clearCosmeticJingle: true,
      });
      return;
    }

    if (clearCosmeticRemoteVan === true) {
      delete st.cosmeticRemoteVanUrl;
      delete st.cosmeticRemoteVanV;
      delete st.remoteVanMarketingLift;
      delete st.remoteVanPurchasedYear;
      persistRoom(room);
      io.to(roomId).emit('mp_station_logo_sync', {
        stationId,
        clearCosmeticRemoteVan: true,
      });
      return;
    }

    if (clearCosmeticLogo === true) {
      delete st.cosmeticLogoUrl;
      delete st.cosmeticLogoV;
      delete st.cosmeticLogoTone;
      delete st.cosmeticRemoteVanUrl;
      delete st.cosmeticRemoteVanV;
      delete st.remoteVanMarketingLift;
      delete st.remoteVanPurchasedYear;
      delete st.cosmeticLogoBackupUrl;
      delete st.cosmeticLogoBackupV;
      delete st.cosmeticLogoBackupTone;
      if (payloadLogoBackupUrl && isSafeGeneratedCosmeticUrl(payloadLogoBackupUrl)) {
        st.cosmeticLogoBackupUrl = payloadLogoBackupUrl;
        if (payloadLogoBackupV != null) {
          const bv = Number(payloadLogoBackupV);
          if (Number.isFinite(bv)) st.cosmeticLogoBackupV = bv;
        }
        if (typeof payloadLogoBackupTone === 'string' && payloadLogoBackupTone.length <= 400) {
          if (payloadLogoBackupTone) st.cosmeticLogoBackupTone = payloadLogoBackupTone;
        }
      }
      persistRoom(room);
      io.to(roomId).emit('mp_station_logo_sync', {
        stationId,
        clearCosmeticLogo: true,
        cosmeticLogoBackupUrl: st.cosmeticLogoBackupUrl,
        cosmeticLogoBackupV: st.cosmeticLogoBackupV,
        cosmeticLogoBackupTone: st.cosmeticLogoBackupTone || '',
      });
      return;
    }

    let changed = false;
    if (cosmeticLogoUrl && isSafeGeneratedCosmeticUrl(cosmeticLogoUrl)) {
      st.cosmeticLogoUrl = cosmeticLogoUrl;
      if (cosmeticLogoV != null) {
        const v = Number(cosmeticLogoV);
        if (Number.isFinite(v)) st.cosmeticLogoV = v;
      }
      if (typeof cosmeticLogoTone === 'string' && cosmeticLogoTone.length <= 400) {
        if (cosmeticLogoTone) st.cosmeticLogoTone = cosmeticLogoTone;
        else delete st.cosmeticLogoTone;
      }
      delete st.cosmeticLogoBackupUrl;
      delete st.cosmeticLogoBackupV;
      delete st.cosmeticLogoBackupTone;
      changed = true;
    }
    if (cosmeticRemoteVanUrl && isSafeGeneratedCosmeticUrl(cosmeticRemoteVanUrl)) {
      st.cosmeticRemoteVanUrl = cosmeticRemoteVanUrl;
      if (cosmeticRemoteVanV != null) {
        const vv = Number(cosmeticRemoteVanV);
        if (Number.isFinite(vv)) st.cosmeticRemoteVanV = vv;
      }
      if (payloadRemoteVanLift != null) {
        const lift = Number(payloadRemoteVanLift);
        if (Number.isFinite(lift) && lift >= 0 && lift <= 0.15) st.remoteVanMarketingLift = lift;
      }
      if (payloadRemoteVanYear != null) {
        const py = Number(payloadRemoteVanYear);
        if (Number.isFinite(py) && py >= 1930 && py <= 2100) st.remoteVanPurchasedYear = py;
      }
      changed = true;
    }
    if (cosmeticJingleUrl && isSafeGeneratedCosmeticUrl(cosmeticJingleUrl)) {
      st.cosmeticJingleUrl = cosmeticJingleUrl;
      if (cosmeticJingleV != null) {
        const jv = Number(cosmeticJingleV);
        if (Number.isFinite(jv)) st.cosmeticJingleV = jv;
      }
      if (payloadJingleLift != null) {
        const jl = Number(payloadJingleLift);
        if (Number.isFinite(jl) && jl >= 0 && jl <= 0.15) st.jingleMarketingLift = jl;
      }
      if (payloadJingleYear != null) {
        const jy = Number(payloadJingleYear);
        if (Number.isFinite(jy) && jy >= 1930 && jy <= 2100) st.jingleCommissionedYear = jy;
      }
      if (payloadJingleVariant != null) {
        const vi = Number(payloadJingleVariant);
        if (Number.isFinite(vi) && vi >= 0 && vi <= 3) st.jingleVariantIndex = vi;
      }
      if (typeof payloadJingleTagline === 'string' && payloadJingleTagline.length <= 60) {
        if (payloadJingleTagline) st.jingleTagline = payloadJingleTagline;
        else delete st.jingleTagline;
      }
      changed = true;
    }
    if (!changed) return;

    persistRoom(room);
    io.to(roomId).emit('mp_station_logo_sync', {
      stationId,
      cosmeticLogoUrl: st.cosmeticLogoUrl,
      cosmeticLogoV: st.cosmeticLogoV,
      cosmeticLogoTone: st.cosmeticLogoTone || '',
      cosmeticRemoteVanUrl: st.cosmeticRemoteVanUrl,
      cosmeticRemoteVanV: st.cosmeticRemoteVanV,
      remoteVanMarketingLift: st.remoteVanMarketingLift,
      remoteVanPurchasedYear: st.remoteVanPurchasedYear,
      cosmeticJingleUrl: st.cosmeticJingleUrl,
      cosmeticJingleV: st.cosmeticJingleV,
      jingleMarketingLift: st.jingleMarketingLift,
      jingleCommissionedYear: st.jingleCommissionedYear,
      jingleVariantIndex: st.jingleVariantIndex,
      jingleTagline: st.jingleTagline || '',
    });
  });

  // ── COMMIT PERIOD ─────────────────────────────────────────────
  socket.on('commit_period', ({ roomId }) => {
    const room = getRoom(roomId);
    console.log(`[COMMIT] ${socket.id} roomId=${roomId} found=${!!room} phase=${room?.phase}`);
    if (!room || room.phase !== 'playing') return;

    room.commitLog[socket.id] = true;
    const player = room.players.find(p => p.socketId === socket.id);
    io.to(roomId).emit('player_committed', {
      socketId:  socket.id,
      playerId:  player?.playerId,
      commitLog: room.commitLog,
    });
    checkAllCommitted(room);
  });

  // ── STATE UPDATE (host broadcasts result of advTurn) ──────────
  socket.on('state_update', ({ roomId, G, decadeYear, sumData }, ack) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, reason: 'not_host' });
      return;
    }

    mergeMpStationLogosFromPrior(G, room.G);
    room.G = G;
    room.commitLog  = {};
    room.players.forEach(p => { room.commitLog[p.socketId] = false; });
    room.actionQueue = [];
    room.seq = 0;

    // Persist to disk every period
    persistRoom(room);

    io.to(roomId).emit('state_broadcast', { G: room.G, decadeYear: decadeYear || null, sumData: sumData || null });
    console.log(`[STATE] ${roomId} — year ${G?.year} ${G?.period===2?'FALL':'SPRING'} saved`);
    const stateHostPlayer = room.players.find(p => p.socketId === socket.id);
    posthog.capture({
      distinctId: stateHostPlayer?.accountId || socket.id,
      event: 'game period advanced',
      properties: {
        room_id: roomId,
        year: G?.year,
        period: G?.period === 2 ? 'fall' : 'spring',
        player_count: room.players.length,
      },
    });
    if (typeof ack === 'function') ack({ ok: true });
  });

  // ── CHAT ──────────────────────────────────────────────────────
  socket.on('chat', ({ roomId, text }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    io.to(roomId).emit('chat_message', {
      from:     player?.name || 'Unknown',
      playerId: player?.playerId,
      text:     text?.slice(0, 200),
      ts:       Date.now(),
    });
  });


  // ── START DRAFT ───────────────────────────────────────────────
  socket.on('start_draft', ({ roomId, era, G: initialG }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('start_error', 'Need at least 2 players.'); return; }

    room.phase = 'draft';
    room.era = era;
    room.G = initialG;

    // Build snake draft order: [0,1,2,1,0] for 3 players, etc.
    const n = room.players.length;
    const fwd = room.players.map(p => p.socketId);
    const rev = [...fwd].reverse();
    // Each player picks once forward + once reverse (for their optional 2nd station)
    const order = [...fwd, ...rev];
    room.draft = { order, pickIdx: 0, picks: {}, phase: 'first' };
    room.players.forEach(p => { room.draft.picks[p.socketId] = []; });

    persistRoom(room);

    io.to(roomId).emit('draft_started', {
      G: room.G,
      players: room.players,
      draft: room.draft,
      era,
    });
    console.log(`[DRAFT] ${roomId} started — ${n} players, era ${era}`);
    const draftHostPlayer = room.players.find(p => p.socketId === socket.id);
    posthog.capture({
      distinctId: draftHostPlayer?.accountId || socket.id,
      event: 'draft started',
      properties: { room_id: roomId, era, player_count: n },
    });
  });

  // ── DRAFT PICK ─────────────────────────────────────────────────
  socket.on('draft_pick', ({ roomId, stationId }) => {
    const room = getRoom(roomId);
    if (!room || room.phase !== 'draft' || !room.draft) return;

    const draft = room.draft;
    const currentPicker = draft.order[draft.pickIdx];
    if (currentPicker !== socket.id) {
      socket.emit('draft_error', 'Not your pick.');
      return;
    }

    // Validate station isn't already picked
    const alreadyPicked = Object.values(draft.picks).flat();
    if (alreadyPicked.includes(stationId)) {
      socket.emit('draft_error', 'Station already picked.');
      return;
    }

    // Enforce 1 AM + 1 FM per player
    if (room.G) {
      const station = room.G.stations.find(st => st.id === stationId);
      if (station) {
        const myPicks = (draft.picks[socket.id] || []).map(id => room.G.stations.find(st=>st.id===id)).filter(Boolean);
        const myAM = myPicks.filter(st => st.sig?.type === 'AM').length;
        const myFM = myPicks.filter(st => st.sig?.type === 'FM').length;
        const sigType = station.sig?.type === 'FM' ? 'FM' : 'AM';
        if ((sigType === 'AM' && myAM >= 1) || (sigType === 'FM' && myFM >= 1)) {
          socket.emit('draft_error', `You already have an ${sigType} station. Pick the other signal type.`);
          return;
        }
        // First pick must be a viable anchor (★ EASY or ★★ MED — not ★★★ HARD only)
        if (myPicks.length === 0 && isWeakDraftStation(station)) {
          socket.emit(
            'draft_error',
            'Your first pick must be ★ EASY or ★★ MED. ★★★ HARD stations are for a second gamble — not as your only starter.'
          );
          return;
        }
      }
    }

    draft.picks[socket.id].push(stationId);
    draft.pickIdx++;

    const player = room.players.find(p => p.socketId === socket.id);
    io.to(roomId).emit('draft_pick_made', {
      socketId:   socket.id,
      playerId:   player?.playerId,
      playerName: player?.name,
      stationId,
      draft:      room.draft,
    });

    // Check if draft is complete
    const totalPicks = Object.values(draft.picks).reduce((s,a) => s+a.length, 0);
    const maxPicks = draft.order.length; // each player gets up to 2 picks
    if (draft.pickIdx >= draft.order.length) {
      draft.phase = 'done';
    }

    persistRoom(room);
    console.log(`[DRAFT] ${roomId} pick: ${player?.name} → ${stationId} (${draft.pickIdx}/${draft.order.length})`);
    posthog.capture({
      distinctId: player?.accountId || socket.id,
      event: 'draft pick made',
      properties: {
        room_id: roomId,
        station_id: stationId,
        pick_number: draft.pickIdx,
      },
    });
  });

  // ── DRAFT PASS (skip 2nd station) ──────────────────────────────
  socket.on('draft_pass', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || room.phase !== 'draft' || !room.draft) return;
    const draft = room.draft;
    const currentPicker = draft.order[draft.pickIdx];
    if (currentPicker !== socket.id) return;

    draft.pickIdx++;
    const player = room.players.find(p => p.socketId === socket.id);
    io.to(roomId).emit('draft_pick_made', {
      socketId: socket.id, playerId: player?.playerId,
      playerName: player?.name, stationId: null, // null = passed
      draft: room.draft,
    });
    if (draft.pickIdx >= draft.order.length) draft.phase = 'done';
    persistRoom(room);
  });

  // ── DRAFT COMPLETE (host finalizes and starts game) ────────────
  socket.on('draft_complete', ({ roomId, G: finalG }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.phase = 'playing';
    room.G = finalG;
    room.commitLog = {};
    room.players.forEach(p => { room.commitLog[p.socketId] = false; });
    room.actionQueue = [];
    room.draft.phase = 'done';

    persistRoom(room);

    io.to(roomId).emit('game_started', {
      G: room.G,
      players: room.players,
      era: room.era,
    });
    broadcastRoomState(room);
    console.log(`[GAME] ${roomId} draft complete — game starting`);
    const draftCompleteHost = room.players.find(p => p.socketId === socket.id);
    posthog.capture({
      distinctId: draftCompleteHost?.accountId || socket.id,
      event: 'draft completed',
      properties: { room_id: roomId, era: room.era, player_count: room.players.length },
    });
  });

  // ── DISCONNECT ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.connected = false;
    // Auto-commit so others aren't blocked waiting on a ghost
    if (room.commitLog[socket.id] === false) {
      room.commitLog[socket.id] = true;
    }

    broadcastRoomState(room);
    io.to(room.id).emit('player_disconnected', { playerId: player.playerId, name: player.name });

    // Don't delete the room — they may rejoin. Clean up only if ALL players
    // have been gone for a while (handled by the stale-room sweep below).

    // If host disconnected, promote next connected player temporarily
    if (room.hostId === socket.id) {
      const next = room.players.find(p => p.connected);
      if (next) {
        room.hostId = next.socketId;
        io.to(room.id).emit('host_migrated', { newHostId: next.socketId, playerId: next.playerId });
        console.log(`[HOST] ${room.id} temporarily migrated to ${next.name}`);
      } else {
        room.hostId = null; // nobody connected — will be assigned on first rejoin
      }
    }

    // Re-check commits: disconnected player was auto-committed above
    if (room.phase === 'playing') checkAllCommitted(room);
  });
});

// ── STALE ROOM CLEANUP ────────────────────────────────────────────
// Rooms where nobody has been connected for 2+ hours get removed from
// memory (saves stay on disk indefinitely for manual recovery).
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, room] of Object.entries(rooms)) {
    const anyConnected = room.players.some(p => p.connected);
    if (!anyConnected) {
      if (!room._lastEmptyAt) {
        room._lastEmptyAt = Date.now();
      } else if (room._lastEmptyAt < cutoff) {
        delete rooms[id];
        console.log(`[CLEANUP] Room ${id} expired from memory (save retained on disk)`);
      }
    } else {
      room._lastEmptyAt = null;
    }
  }
}, 15 * 60 * 1000); // check every 15 minutes

// ── STATIC FILES ──────────────────────────────────────────────────
// Vite output (npm run build) bundles Clerk + src/main.js — required for Clerk on :3000.
// Without dist/, the browser loads raw /src/main.js and cannot resolve @clerk/clerk-js imports.
const DIST_DIR = path.join(__dirname, 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const HAS_DIST = fs.existsSync(DIST_INDEX);

if (HAS_DIST) {
  app.use(
    express.static(DIST_DIR, {
      setHeaders(res, filePath) {
        if (typeof filePath === 'string' && filePath.endsWith('play.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
          res.setHeader('Pragma', 'no-cache');
        }
      },
    }),
  );
}
app.use(express.static(path.join(__dirname)));

if (HAS_DIST) {
  app.get(['/landing', '/landing/'], (req, res) => {
    res.redirect(302, '/');
  });
}

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  if (HAS_DIST) {
    return res.sendFile(DIST_INDEX);
  }
  const indexPath = path.join(__dirname, 'index.html');
  const playPath = path.join(__dirname, 'play.html');
  const legacyPath = fs.existsSync(playPath) ? playPath : path.join(__dirname, 'wavelength-ui.html');
  res.sendFile(fs.existsSync(indexPath) ? indexPath : legacyPath);
});

// ── SAVE MANAGEMENT ROUTES ──────────────────────────────────────
app.get('/admin/saves', (req, res) => {
  try {
    const files = fs.existsSync(SAVE_DIR) ? fs.readdirSync(SAVE_DIR).filter(f=>f.endsWith('.json')) : [];
    const saves = files.map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
        return { id: d.id, year: d.G?.year, period: d.G?.period === 1 ? 'Spring' : 'Fall', players: (d.players||[]).map(p=>p.name).join(', '), file: f };
      } catch(e) { return { file: f, error: true }; }
    });
    res.json(saves);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/admin/saves/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const file = path.join(SAVE_DIR, roomId + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  delete rooms[roomId];
  console.log(`[ADMIN] Deleted room ${roomId}`);
  res.json({ ok: true });
});

app.delete('/admin/saves', (req, res) => {
  try {
    const files = fs.existsSync(SAVE_DIR) ? fs.readdirSync(SAVE_DIR).filter(f=>f.endsWith('.json')) : [];
    files.forEach(f => fs.unlinkSync(path.join(SAVE_DIR, f)));
    Object.keys(rooms).forEach(k => delete rooms[k]);
    console.log(`[ADMIN] Deleted ${files.length} saves`);
    res.json({ deleted: files.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BOOT ──────────────────────────────────────────────────────────
loadPersistedRooms();

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
  posthog.captureException(err, req.auth?.userId || req.ip || 'unknown');
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('SIGTERM', () => posthog.shutdown());
process.on('SIGINT', () => posthog.shutdown());

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use (EADDRINUSE).`);
    console.error('  Usually another node server.js is still running, or a second terminal started the same app.');
    console.error(`  Stop it:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN   then   kill <PID>`);
    console.error(`  Or use another port:  PORT=3001 npm run dev\n`);
  } else {
    console.error('[SERVER]', err);
  }
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`\n🎙 AIRWAVE EMPIRE SERVER`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   CORS allowed origins (${allowedOriginsList().length}): ${allowedOriginsList().join(', ')}`);
  if (HAS_DIST) {
    console.log(`   Client: Vite build (dist/) — Clerk + bundled JS`);
  } else {
    console.log(`   Client: source HTML/JS only — Clerk needs \`npm run build\` or open Vite at http://localhost:5173 (\`npm run client:dev\`)`);
  }
  console.log(`   Saves: ${SAVE_DIR}`);
  console.log(`   JSON body limit: ${JSON_BODY_LIMIT} (JSON_BODY_LIMIT env; nginx: client_max_body_size)`);
  if (process.env.CLERK_SECRET_KEY) {
    console.log(`   Auth: Clerk JWT required for multiplayer sockets`);
    console.log(`   Cloud saves: /api/saves/cloud enabled`);
  } else {
    console.log(`   Auth: off — set CLERK_SECRET_KEY for multiplayer + cloud saves`);
    console.log(`   Cloud saves: disabled until CLERK_SECRET_KEY is set (same key as Clerk Dashboard → API keys)`);
  }
  if (process.env.STRIPE_SECRET_KEY) {
    console.log(`   Stripe: billing API enabled`);
  } else {
    console.log(`   Stripe: off — set STRIPE_SECRET_KEY for Checkout`);
  }
  console.log(`   Share your local IP for LAN play\n`);
});
