require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { cleanName, validName } = require('./text');
const { createMatch, findBySocket, snapshot, startMatch, dropPiece, rematch, removeMatch } = require('./match');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 32_000, connectionStateRecovery: { maxDisconnectionDuration: 120_000 } });
const matches = new Map();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: matches.size }));

const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeCode() { return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(''); }
function emitMatch(match) { match.lastActivity = Date.now(); io.to(match.code).emit('match:state', snapshot(match)); }
function roomFor(socket) { return findBySocket(matches, socket.id); }
function tell(socket, message) { socket.emit('notice', { message }); }

io.on('connection', socket => {
  const recent = [];
  socket.use((packet, next) => {
    const now = Date.now();
    while (recent.length && now - recent[0] > 10_000) recent.shift();
    recent.push(now);
    if (recent.length > 12) return next(new Error('Please slow down.'));
    next();
  });

  socket.on('room:create', ({ name } = {}) => {
    const clean = cleanName(name);
    if (!validName(clean)) return tell(socket, 'Choose a name between 1 and 18 characters.');
    let code;
    do { code = makeCode(); } while (matches.has(code));
    const match = createMatch(socket.id, clean, code);
    match.io = io;
    matches.set(code, match);
    socket.join(code);
    socket.emit('room:joined', { code, playerId: socket.id, token: match.players[0].token, isHost: true });
    emitMatch(match);
  });

  socket.on('room:join', ({ code: rawCode, name, token } = {}) => {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const match = matches.get(code);
    if (!match) return tell(socket, 'Room not found. Check the code and try again.');
    const clean = cleanName(name);
    if (!validName(clean)) return tell(socket, 'Choose a name between 1 and 18 characters.');

    const returning = match.players.find(player => player.token && player.token === token);
    if (returning) {
      const oldId = returning.id;
      returning.id = socket.id;
      returning.name = clean;
      returning.connected = true;
      if (match.hostId === oldId) match.hostId = socket.id;
      if (match.currentPlayerId === oldId) match.currentPlayerId = socket.id;
      if (match.winnerId === oldId) match.winnerId = socket.id;
      match.board = match.board.map(row => row.map(cell => cell === oldId ? socket.id : cell));
      if (match.lastMove?.playerId === oldId) match.lastMove.playerId = socket.id;
      socket.join(code);
      socket.emit('room:joined', { code, playerId: socket.id, token: returning.token, isHost: match.hostId === socket.id });
      emitMatch(match);
      return;
    }

    if (match.phase !== 'lobby') return tell(socket, 'This match has already started. Ask the host for a new room.');
    if (match.players.length >= 2) return tell(socket, 'This room already has two players.');
    if (match.players.some(player => player.name.toLowerCase() === clean.toLowerCase())) return tell(socket, 'That name is already taken in this room.');
    const player = { id: socket.id, name: clean, token: require('crypto').randomBytes(18).toString('hex'), connected: true, mark: '◆' };
    match.players.push(player);
    socket.join(code);
    socket.emit('room:joined', { code, playerId: socket.id, token: player.token, isHost: false });
    emitMatch(match);
  });

  socket.on('match:start', () => {
    const match = roomFor(socket);
    if (!match || match.hostId !== socket.id) return;
    const result = startMatch(match);
    if (result.error) return tell(socket, result.error);
    emitMatch(match);
  });

  socket.on('match:drop', ({ column } = {}) => {
    const match = roomFor(socket);
    if (!match) return;
    const result = dropPiece(match, socket.id, column);
    if (result.error) return tell(socket, result.error);
    emitMatch(match);
  });

  socket.on('match:rematch', () => {
    const match = roomFor(socket);
    if (!match || match.phase !== 'finished') return;
    rematch(match);
    emitMatch(match);
  });

  socket.on('disconnect', () => {
    const match = roomFor(socket);
    if (!match) return;
    const player = match.players.find(entry => entry.id === socket.id);
    if (player) player.connected = false;
    if (match.hostId === socket.id) {
      const successor = match.players.find(entry => entry.connected);
      if (successor) match.hostId = successor.id;
    }
    emitMatch(match);
  });
});

const idleTimer = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, match] of matches) if (match.lastActivity < cutoff) removeMatch(matches, code);
}, 60_000);
idleTimer.unref?.();

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`DROP ZONE listening on ${port}`));
