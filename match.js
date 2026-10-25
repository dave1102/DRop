const crypto = require('crypto');
const ROWS = 6;
const COLS = 7;

function createMatch(hostId, hostName, code) {
  return {
    code,
    hostId,
    phase: 'lobby',
    players: [{ id: hostId, name: hostName, token: crypto.randomBytes(18).toString('hex'), connected: true, mark: '●' }],
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    currentPlayerId: null,
    winnerId: null,
    winningCells: [],
    lastMove: null,
    moves: 0,
    lastActivity: Date.now()
  };
}

function findBySocket(matches, socketId) {
  for (const match of matches.values()) if (match.players.some(player => player.id === socketId)) return match;
  return null;
}

function snapshot(match) {
  return {
    code: match.code,
    phase: match.phase,
    hostId: match.hostId,
    players: match.players.map(({ id, name, connected, mark }) => ({ id, name, connected, mark })),
    board: match.board,
    currentPlayerId: match.currentPlayerId,
    winnerId: match.winnerId,
    winningCells: match.winningCells,
    lastMove: match.lastMove,
    moves: match.moves
  };
}

function startMatch(match) {
  if (match.phase !== 'lobby') return { error: 'This match is already in progress.' };
  if (match.players.length !== 2) return { error: 'Invite one more player before starting.' };
  match.phase = 'playing';
  match.currentPlayerId = match.hostId;
  return {};
}

function scanWin(board, row, col, playerId) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const cells = [[row, col]];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === playerId) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

function dropPiece(match, playerId, column) {
  if (match.phase !== 'playing') return { error: 'The match is not accepting moves right now.' };
  if (match.currentPlayerId !== playerId) return { error: 'Wait for your turn.' };
  if (!Number.isInteger(column) || column < 0 || column >= COLS) return { error: 'Choose a column on the board.' };
  let row = ROWS - 1;
  while (row >= 0 && match.board[row][column] !== null) row--;
  if (row < 0) return { error: 'That column is full. Pick another one.' };

  match.board[row][column] = playerId;
  match.moves++;
  match.lastMove = { row, column, playerId };
  const winningCells = scanWin(match.board, row, column, playerId);
  if (winningCells.length) {
    match.phase = 'finished';
    match.winnerId = playerId;
    match.winningCells = winningCells;
  } else if (match.moves === ROWS * COLS) {
    match.phase = 'finished';
    match.winnerId = null;
  } else {
    match.currentPlayerId = match.players.find(player => player.id !== playerId).id;
  }
  return {};
}

function rematch(match) {
  match.phase = 'lobby';
  match.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  match.currentPlayerId = null;
  match.winnerId = null;
  match.winningCells = [];
  match.lastMove = null;
  match.moves = 0;
}

function removeMatch(matches, code) {
  const match = matches.get(code);
  if (!match) return;
  match.players.forEach(player => { if (player.id) match.io?.in(player.id).socketsLeave(code); });
  matches.delete(code);
}

module.exports = { createMatch, findBySocket, snapshot, startMatch, dropPiece, rematch, removeMatch };
