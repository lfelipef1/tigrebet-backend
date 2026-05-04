const GAMES = ['tiger', 'crash', 'mines', 'plinko', 'slots', 'wingo', 'scratch', 'double'];

// In-memory cache, refreshed every 10 seconds
let cache = {};
let lastFetch = 0;
const TTL = 10_000;

async function getAll() {
  const now = Date.now();
  if (now - lastFetch < TTL && Object.keys(cache).length > 0) return cache;
  try {
    const { GameSettings } = require('../models');
    const rows = await GameSettings.findAll();
    if (rows.length === 0) {
      // First boot: seed defaults
      await GameSettings.bulkCreate(
        GAMES.map(g => ({ game: g, rtp: 95, isOpen: true })),
        { ignoreDuplicates: true }
      );
      GAMES.forEach(g => { cache[g] = { rtp: 95, isOpen: true }; });
    } else {
      rows.forEach(r => { cache[r.game] = { rtp: r.rtp, isOpen: r.isOpen }; });
    }
    lastFetch = now;
  } catch (e) {
    // If DB not ready, return safe defaults
    if (Object.keys(cache).length === 0)
      GAMES.forEach(g => { cache[g] = { rtp: 95, isOpen: true }; });
  }
  return cache;
}

async function get(game) {
  const all = await getAll();
  return all[game] || { rtp: 95, isOpen: true };
}

function invalidate() {
  lastFetch = 0;
}

module.exports = { getAll, get, invalidate, GAMES };
