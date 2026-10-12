// Almacenamiento en un fichero JSON con escritura atómica.
// Suficiente para un negocio o una agencia con decenas de bots; sin dependencias nativas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'db.json');

let state = { bots: {}, bookings: {} };
let writeTimer = null;

export function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state.bots ||= {};
    state.bookings ||= {};
  }
}

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 50);
}

export function flush() {
  clearTimeout(writeTimer);
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

export function newId(prefix, bytes = 6) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`;
}

// ---------- Bots ----------
export function listBots() {
  return Object.values(state.bots).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBot(id) {
  return state.bots[id] || null;
}

export function saveBot(bot) {
  bot.updatedAt = new Date().toISOString();
  state.bots[bot.id] = bot;
  persist();
  return bot;
}

export function deleteBot(id) {
  delete state.bots[id];
  for (const [bid, b] of Object.entries(state.bookings)) if (b.botId === id) delete state.bookings[bid];
  persist();
}

// ---------- Reservas ----------
export function listBookings(botId) {
  return Object.values(state.bookings)
    .filter((b) => b.botId === botId)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function getBooking(id) {
  return state.bookings[id] || null;
}

export function saveBooking(booking) {
  state.bookings[booking.id] = booking;
  persist();
  return booking;
}
