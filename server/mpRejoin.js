'use strict';

function selectRejoinPlayer(players, { name, claimedId } = {}) {
  if (!Array.isArray(players)) return null;

  if (claimedId != null) {
    const exact = players.find((p) => p.playerId === claimedId && p.name === name);
    if (exact) return exact;
  }

  return players.find((p) => p.name === name && !p.connected) || null;
}

module.exports = { selectRejoinPlayer };
