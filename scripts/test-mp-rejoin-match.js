#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { selectRejoinPlayer } = require('../server/mpRejoin');

function player(overrides) {
  return {
    socketId: null,
    name: 'Station',
    playerId: 0,
    ready: false,
    connected: false,
    accountId: null,
    ...overrides,
  };
}

const restoredPlayers = [
  player({ name: 'HostCo', playerId: 0, connected: false }),
  player({ name: 'Victim FM', playerId: 1, connected: false, accountId: null }),
];

assert.strictEqual(
  selectRejoinPlayer(restoredPlayers, { name: 'Attacker FM', claimedId: 1 }),
  null,
  'playerId alone must not claim an unbound restored slot with a different name',
);

assert.strictEqual(
  selectRejoinPlayer(restoredPlayers, { name: 'Victim FM', claimedId: 1 }),
  restoredPlayers[1],
  'matching playerId and company name should rejoin the intended slot',
);

assert.strictEqual(
  selectRejoinPlayer(restoredPlayers, { name: 'Victim FM', claimedId: null }),
  restoredPlayers[1],
  'fresh-browser rejoin should still work by company name on a disconnected slot',
);

assert.strictEqual(
  selectRejoinPlayer(restoredPlayers, { name: 'Victim FM', claimedId: 3 }),
  restoredPlayers[1],
  'wrong stored playerId should fall back to the disconnected company-name match',
);

const connectedPlayers = [
  player({ name: 'HostCo', playerId: 0, connected: true }),
  player({ name: 'Victim FM', playerId: 1, connected: true }),
];

assert.strictEqual(
  selectRejoinPlayer(connectedPlayers, { name: 'Victim FM', claimedId: null }),
  null,
  'name-only rejoin must not take over a connected slot',
);

console.log('ok - multiplayer rejoin slot matching checks passed (5 cases).');
