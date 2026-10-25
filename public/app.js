(() => {
  const socket = io();
  const $ = selector => document.querySelector(selector);
  let mode = 'create';
  let state = null;
  let myId = '';
  let isHost = false;
  let muted = false;
  let audio = null;
  let lastPhase = '';
  let storedSeat = JSON.parse(sessionStorage.getItem('drop-zone-seat') || 'null');

  function safe(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }
  function playTone(win = false) {
    if (muted) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio = audio || new Context();
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime;
      (win ? [523, 659, 784] : [392]).forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.001, now + index * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.09 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + 0.16);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(now + index * 0.09); oscillator.stop(now + index * 0.09 + 0.17);
      });
    } catch { /* Audio is an enhancement; gameplay stays silent if unavailable. */ }
  }
  function copyText(text) {
    if (!navigator.clipboard?.writeText) return showToast(text);
    navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast(text));
  }
  function setMode(nextMode) {
    mode = nextMode;
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
    $('#join-code-wrap').classList.toggle('hidden', mode !== 'join');
    $('#entry-submit').innerHTML = mode === 'create' ? 'Create a room <span>↗</span>' : 'Join the game <span>↗</span>';
    $('#entry-hint').textContent = mode === 'create' ? 'You’ll get a private room code to share.' : 'Enter the code your friend sent you.';
  }
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  $('#room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
  $('#entry-submit').addEventListener('click', () => {
    const name = $('#display-name').value.trim();
    if (!name) return showToast('Add your name first.');
    localStorage.setItem('drop-zone-name', name);
    if (mode === 'create') socket.emit('room:create', { name });
    else {
      const code = $('#room-code').value.trim().toUpperCase();
      if (code.length !== 4) return showToast('Enter the four-letter room code.');
      socket.emit('room:join', { code, name });
    }
  });
  $('#sound-toggle').addEventListener('click', () => {
    muted = !muted;
    $('#sound-toggle').textContent = muted ? '×' : '♫';
    $('#sound-toggle').setAttribute('aria-label', muted ? 'Turn sounds on' : 'Mute sounds');
    if (!muted) playTone();
  });

  socket.on('room:joined', payload => {
    myId = payload.playerId;
    isHost = payload.isHost;
    storedSeat = { code: payload.code, token: payload.token };
    sessionStorage.setItem('drop-zone-seat', JSON.stringify(storedSeat));
    $('#home').classList.add('hidden');
    $('#game').classList.remove('hidden');
  });
  socket.on('match:state', nextState => {
    if (lastPhase && lastPhase !== nextState.phase && nextState.phase === 'finished') playTone(true);
    lastPhase = nextState.phase;
    state = nextState;
    isHost = state.hostId === myId;
    render();
  });
  socket.on('notice', payload => showToast(payload.message));
  socket.on('connect', () => {
    if (!storedSeat) return;
    const name = localStorage.getItem('drop-zone-name') || 'Player';
    socket.emit('room:join', { code: storedSeat.code, token: storedSeat.token, name });
  });

  const roomFromUrl = new URLSearchParams(location.search).get('room');
  if (roomFromUrl) {
    setMode('join');
    $('#room-code').value = roomFromUrl.toUpperCase().slice(0, 4);
  }
  const rememberedName = localStorage.getItem('drop-zone-name');
  if (rememberedName) $('#display-name').value = rememberedName;

  function render() {
    if (!state) return;
    const game = $('#game');
    const ownSeat = state.players.find(player => player.id === myId);
    const currentPlayer = state.players.find(player => player.id === state.currentPlayerId);
    const winner = state.players.find(player => player.id === state.winnerId);
    let html = `<div class="game-heading"><div><p class="kicker">ROOM ${safe(state.code)}</p><h1>${state.phase === 'finished' ? 'That’s a match.' : 'The board is yours.'}</h1></div><button class="share-button" data-share>Invite a friend <span>↗</span></button></div>`;
    if (state.phase === 'lobby') {
      const inviteUrl = `${location.origin}/?room=${state.code}`;
      html += `<div class="lobby-layout"><div class="lobby-main"><div class="room-code"><span>SHARE THIS CODE</span><strong>${safe(state.code)}</strong><button data-copy="${safe(state.code)}">COPY</button></div><div class="player-slots">${[0,1].map(index => { const player = state.players[index]; return player ? `<div class="player-slot"><span class="piece mark-${index}">${player.mark}</span><div><strong>${safe(player.name)}${player.id === state.hostId ? '<small>HOST</small>' : ''}</strong><span>${player.connected ? 'Connected and ready' : 'Reconnecting…'}</span></div>${player.id === myId ? '<b>YOU</b>' : ''}</div>` : '<div class="player-slot waiting-slot"><span class="waiting-mark">+</span><div><strong>Waiting for player 2</strong><span>Send your code or invite link</span></div></div>'; }).join('')}</div><div class="lobby-bottom">${isHost ? `<button class="action-button" data-start ${state.players.length < 2 ? 'disabled' : ''}>Start match <span>↗</span></button>` : '<p class="waiting-copy">Waiting for the host to start…</p>'}<button class="copy-link" data-copy="${safe(inviteUrl)}">Copy invite link</button></div></div><aside class="how-card"><span class="how-number">01 — 03</span><h2>Take turns.</h2><p>Choose a column. Your piece drops into the lowest open space.</p><span class="how-number">02 — 03</span><h2>Make a line.</h2><p>Connect four of your pieces in a row: across, up and down, or diagonally.</p><span class="how-number">03 — 03</span><h2>Claim the board.</h2><p>First to four wins. A full board with no four-in-a-row is a draw.</p></aside></div>`;
    } else {
      let status;
      if (state.phase === 'finished') status = winner ? (winner.id === myId ? 'You connected four. You win!' : `${winner.name} connected four.`) : 'The board filled up. It’s a draw!';
      else status = currentPlayer?.id === myId ? 'Your turn — pick a column.' : `${currentPlayer?.name || 'Your opponent'} is choosing…`;
      html += `<div class="play-layout"><section class="board-area"><div class="turn-banner ${state.phase === 'finished' ? 'finished' : ''}"><span class="turn-symbol">${state.phase === 'finished' ? (winner ? winner.mark : '＝') : currentPlayer?.mark || '•'}</span><div><small>${state.phase === 'finished' ? 'MATCH RESULT' : 'NOW PLAYING'}</small><strong>${safe(status)}</strong></div><span class="move-count">${state.moves}<small> / 42</small></span></div><div class="drop-controls" style="--cols:7">${Array.from({ length: 7 }, (_, col) => { const full = state.board[0][col] !== null; const disabled = state.phase !== 'playing' || state.currentPlayerId !== myId || full; return `<button class="drop-button" data-column="${col}" aria-label="Drop a piece in column ${col + 1}" ${disabled ? 'disabled' : ''}>↓</button>`; }).join('')}</div><div class="board" role="grid" aria-label="Connect Four board" style="--cols:7">${state.board.flatMap((row, rowIndex) => row.map((cell, colIndex) => { const winning = state.winningCells.some(([r,c]) => r === rowIndex && c === colIndex); const last = state.lastMove?.row === rowIndex && state.lastMove?.column === colIndex; const player = state.players.find(entry => entry.id === cell); const canPlay = state.phase === 'playing' && state.currentPlayerId === myId && state.board[0][colIndex] === null; return `<div role="gridcell" aria-label="Row ${rowIndex + 1}, column ${colIndex + 1}${player ? `, ${safe(player.name)}'s piece` : ', empty'}" class="cell ${player ? `occupied mark-${state.players.indexOf(player)}` : ''} ${winning ? 'winning' : ''} ${last ? 'last-drop' : ''} ${canPlay ? 'playable' : ''}">${player ? `<span>${player.mark}</span>` : ''}</div>`; })).join('')}</div><p class="board-hint">${state.phase === 'playing' ? 'Choose any arrow above the board to drop your piece.' : 'A fresh board is ready when both players want a rematch.'}</p></section><aside class="match-sidebar"><div class="versus"><span class="piece mark-0">${state.players[0]?.mark || '●'}</span><div><strong>${safe(state.players[0]?.name || 'Player 1')}</strong><small>${state.players[0]?.id === myId ? 'YOU' : state.players[0]?.connected ? 'CONNECTED' : 'RECONNECTING'}</small></div><b>VS</b><div><strong>${safe(state.players[1]?.name || 'Player 2')}</strong><small>${state.players[1]?.id === myId ? 'YOU' : state.players[1]?.connected ? 'CONNECTED' : 'RECONNECTING'}</small></div><span class="piece mark-1">${state.players[1]?.mark || '◆'}</span></div><div class="rule-reminder"><span class="how-number">THE RULE</span><p>Get <b>four of your pieces</b> touching in one straight line. Diagonals count.</p></div>${state.phase === 'finished' ? `<button class="action-button rematch-button" data-rematch>Play again <span>↻</span></button>` : ''}<button class="copy-link" data-copy="${safe(`${location.origin}/?room=${state.code}`)}">Copy room link</button><button class="copy-link" data-copy="${safe(state.code)}">Copy room code</button></aside></div>`;
    }
    game.innerHTML = html;
    document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => socket.emit('match:start')));
    document.querySelectorAll('[data-column]').forEach(button => button.addEventListener('click', () => { playTone(); socket.emit('match:drop', { column: Number(button.dataset.column) }); }));
    document.querySelectorAll('[data-rematch]').forEach(button => button.addEventListener('click', () => socket.emit('match:rematch')));
    document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copyText(button.dataset.copy)));
    document.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', () => {
      const url = `${location.origin}/?room=${state.code}`;
      if (navigator.share) navigator.share({ title: 'Play DROP ZONE with me', text: `Join my Connect Four room: ${state.code}`, url }).catch(() => {});
      else copyText(url);
    }));
  }
})();
