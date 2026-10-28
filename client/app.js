const CAT_LABELS = {
    langs: 'ЯЗЫКИ',
    linux: 'LINUX/CLI',
    git: 'GIT',
    db: 'SQL/БД',
    docker: 'DOCKER/K8S',
    algo: 'АЛГОРИТМЫ',
    web: 'WEB/HTTP'
};
const DIFF_LABELS = { easy: 'ЛЁГКИЙ', medium: 'СРЕДНИЙ', hard: 'СЛОЖНЫЙ' };
const MODE_LABELS = { classic: 'КЛАССИКА', blitz: 'БЛИЦ', survival: 'ВЫЖИВАНИЕ' };
const MODE_DESC = {
    classic: '15 вопросов • база + бонус за скорость',
    blitz: '10 вопросов • 10 секунд • x1.5 очков',
    survival: '30 вопросов • ошибка = выбывание'
};

const MODES = {
    classic: { id: 'classic', label: 'КЛАССИКА', questions: 15, maxTime: 30, multiplier: 1, survival: false },
    blitz: { id: 'blitz', label: 'БЛИЦ', questions: 10, maxTime: 10, multiplier: 1.5, survival: false },
    survival: { id: 'survival', label: 'ВЫЖИВАНИЕ', questions: 30, maxTime: 30, multiplier: 1, survival: true }
};

const ALLOWED_DIFFS = ['easy', 'medium', 'hard'];
const ALLOWED_THEMES = ['neon', 'cyber', 'matrix', 'vapor'];
const DIFF_POINTS = { easy: 7, medium: 10, hard: 15 };
const MIN_PLAYERS = 2;
const ROUND_REVEAL_MS = 2500;
const START_DELAY_MS = 900;

const ROOM_PREFIX = 'codeguess-v2-';
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_TIMEOUT_MS = 12000;

const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const roundEndScreen = document.getElementById('roundEndScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomJoinRow = document.getElementById('roomJoinRow');
const roomPanel = document.getElementById('roomPanel');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const connectionBanner = document.getElementById('connectionBanner');
const joinError = document.getElementById('joinError');
const startBtn = document.getElementById('startBtn');
const playersList = document.getElementById('playersList');
const playersCount = document.getElementById('playersCount');
const gamePlayersList = document.getElementById('gamePlayersList');
const restartBtn = document.getElementById('restartBtn');
const rematchBtn = document.getElementById('rematchBtn');
const hostNote = document.getElementById('hostNote');
const hostTag = document.getElementById('hostTag');
const modeDesc = document.getElementById('modeDesc');
const serverAddr = document.getElementById('serverAddr');
const gameStatusBanner = document.getElementById('gameStatusBanner');
const answerToast = document.getElementById('answerToast');

const questionNumEl = document.getElementById('questionNum');
const totalQuestionsEl = document.getElementById('totalQuestions');
const catPill = document.getElementById('catPill');
const diffPill = document.getElementById('diffPill');
const modePill = document.getElementById('modePill');
const alivePill = document.getElementById('alivePill');
const timerEl = document.getElementById('timer');
const timerProg = document.getElementById('timerProg');
const codeBlock = document.getElementById('codeBlock');
const correctAnswerText = document.getElementById('correctAnswerText');
const roundResultText = document.getElementById('roundResultText');
const roundBreakdown = document.getElementById('roundBreakdown');
const explainBox = document.getElementById('explainBox');
const explainText = document.getElementById('explainText');
const finalLeaderboard = document.getElementById('finalLeaderboard');
const gameOverSub = document.getElementById('gameOverSub');

const answerBtns = Array.from(document.querySelectorAll('.answer-btn'));

let questionsDB = [];
let allowedCats = [];

let players = [];
let settings = {
    mode: 'classic',
    difficulty: 'medium',
    roundTime: 15,
    categories: ['langs', 'linux', 'git', 'db', 'docker', 'algo', 'web'],
    theme: 'neon'
};

let joined = false;
let joining = false;
let isHost = false;
let myId = null;
let myName = '';
let hostId = null;
let isSpectator = false;
let myAlive = true;

let peer = null;
let connections = [];
let hostConn = null;
let roomCode = '';
let clockOffset = 0;
let joinTimeout = null;
let gamePhase = 'lobby';
let lastQuestionKey = '';
let guestSelectedIndex = null;

let gameInProgress = false;
let gameStarted = false;
let revealRound = false;
let answeredThisRound = false;
let gameMode = 'classic';

let currentMode = MODES.classic;
let currentQuestion = null;
let currentIndex = 0;
let questionsPlayed = 0;
let questionsQueue = [];
let roundActive = false;
let roundDeadline = 0;
let timerMax = 15;
let timerInt = null;

let questionTimer = null;
let nextRoundTimer = null;
let startDelayTimer = null;
let roundRevealTimer = null;
let toastTimer = null;
let errorTimer = null;

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {}
}

function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function sanitizeName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function questionsWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'вопрос';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вопроса';
    return 'вопросов';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getMe() {
    return players.find(p => p.id === myId) || null;
}

function getPlayer(id) {
    return players.find(p => p.id === id) || null;
}

function getActivePlayers() {
    return players.filter(p => !p.spectator);
}

function getAlivePlayers() {
    return getActivePlayers().filter(p => p.alive);
}

function showScreen(name) {
    const screens = {
        lobby: lobbyScreen,
        game: gameScreen,
        roundEnd: roundEndScreen,
        gameOver: gameOverScreen
    };
    Object.entries(screens).forEach(([key, el]) => {
        el.style.display = key === name ? 'flex' : 'none';
    });
    if (name !== 'roundEnd') {
        if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }
    }
}

function showError(message) {
    joinError.textContent = message || '';
    if (errorTimer) clearTimeout(errorTimer);
    if (message) {
        errorTimer = setTimeout(() => { joinError.textContent = ''; }, 5000);
    }
}

function setSettingsLocked(locked) {
    document.querySelectorAll('.seg-item, .checks input').forEach(el => {
        el.disabled = locked;
    });
    document.querySelectorAll('.check').forEach(el => {
        el.classList.toggle('locked', locked);
    });
}

function applySettings(next) {
    if (!next) return;
    settings = { ...settings, ...next };
    if (Array.isArray(next.categories)) settings.categories = next.categories.slice();

    const theme = ALLOWED_THEMES.includes(settings.theme) ? settings.theme : 'neon';
    settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    gameMode = settings.mode || gameMode;
    currentMode = MODES[gameMode] || currentMode;

    document.querySelectorAll('.seg').forEach(group => {
        const key = group.getAttribute('data-setting');
        const value = String(settings[key] !== undefined ? settings[key] : '');
        group.querySelectorAll('.seg-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-value') === value);
        });
    });

    const cats = Array.isArray(settings.categories) ? settings.categories : [];
    document.querySelectorAll('.checks input').forEach(cb => {
        cb.checked = cats.includes(cb.getAttribute('data-cat'));
    });

    modeDesc.textContent = MODE_DESC[settings.mode] || '';
}

function setStatusBanner(text) {
    if (text) {
        gameStatusBanner.textContent = text;
        gameStatusBanner.style.display = 'block';
    } else {
        gameStatusBanner.style.display = 'none';
    }
}

function updateHostUI(list) {
    const active = list.filter(p => !p.spectator);
    hostTag.textContent = isHost ? 'ХОСТ' : 'ГОСТЬ';
    hostTag.style.display = joined ? 'inline-flex' : 'none';
    setSettingsLocked(gameInProgress || (joined && !isHost));

    if (!joined) {
        startBtn.style.display = 'none';
        hostNote.textContent = 'Создайте комнату или войдите по коду';
        return;
    }

    if (!isHost) {
        startBtn.style.display = 'none';
        hostNote.textContent = gameInProgress ? 'Игра идёт…' : 'Ждём, пока хост начнёт игру';
        return;
    }

    startBtn.style.display = 'inline-flex';
    startBtn.disabled = gameInProgress || active.length < MIN_PLAYERS || questionsDB.length === 0;

    if (gameInProgress) {
        hostNote.textContent = 'Игра идёт…';
    } else if (questionsDB.length === 0) {
        hostNote.textContent = 'Загрузка вопросов…';
    } else if (active.length < MIN_PLAYERS) {
        hostNote.textContent = 'Позовите друга по ссылке';
    } else {
        hostNote.textContent = 'Вы — хост: можно начинать';
    }
}

function updateLiveState(list) {
    const me = list.find(p => p.id === myId);
    if (me) {
        myAlive = me.alive;
        isSpectator = me.spectator;
    }
    if (!gameInProgress) return;

    if (isSpectator) {
        setStatusBanner('Режим наблюдателя — ответы недоступны');
        answerBtns.forEach(b => { b.disabled = true; });
    } else if (!myAlive) {
        setStatusBanner('Вы выбыли — наблюдаете за игрой');
        answerBtns.forEach(b => { b.disabled = true; });
    }
}

function renderPlayers(list) {
    const active = list.filter(p => !p.spectator);
    playersCount.textContent = active.length;
    playersList.innerHTML = '';

    if (!joined || list.length === 0) {
        playersList.innerHTML = '<p class="hint">Ждём игроков…</p>';
        return;
    }

    list.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        if (p.id === myId) item.classList.add('me');
        if (p.spectator) item.classList.add('spectator');

        const initial = escapeHtml((p.name.trim().charAt(0) || '?').toUpperCase());
        const tags = [];
        if (p.id === hostId) tags.push('<span class="tag tag-host">ХОСТ</span>');
        if (p.id === myId) tags.push('<span class="tag tag-small">ВЫ</span>');

        item.innerHTML = `
            <div class="avatar">${initial}</div>
            <div class="name">${escapeHtml(p.name)}</div>
            ${tags.join('')}
        `;
        playersList.appendChild(item);
    });
}

function renderBoard(list) {
    gamePlayersList.innerHTML = '';
    const sorted = list
        .filter(p => !p.spectator)
        .sort((a, b) => {
            if (gameMode === 'survival' && a.alive !== b.alive) return a.alive ? -1 : 1;
            return b.score - a.score;
        });

    sorted.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'board-row';
        if (p.id === myId) row.classList.add('me');
        if (!p.alive && gameMode === 'survival') row.classList.add('dead');

        const initial = escapeHtml((p.name.trim().charAt(0) || '?').toUpperCase());
        const flags = [];
        if (p.streak > 1) flags.push(`<span class="board-streak">🔥 ${p.streak}</span>`);
        if (!p.alive && gameMode === 'survival') flags.push('<span class="tag tag-small tag-dead">ВЫБЫЛ</span>');
        else if (p.answered && gameInProgress && !revealRound) flags.push('<span class="board-ready">✓</span>');

        let delta = '';
        if (revealRound) {
            delta = p.roundPoints > 0
                ? `<span class="board-delta plus">+${p.roundPoints}</span>`
                : '<span class="board-delta">—</span>';
        }

        row.innerHTML = `
            <div class="board-rank">${idx + 1}</div>
            <div class="avatar">${initial}</div>
            <div class="board-name">${escapeHtml(p.name)} ${flags.join(' ')}</div>
            ${delta}
            <div class="board-score">${p.score}</div>
        `;
        gamePlayersList.appendChild(row);
    });
}

function renderBreakdown(list) {
    roundBreakdown.innerHTML = '';
    const sorted = [...list]
        .filter(p => !p.spectator)
        .sort((a, b) => {
            if (gameMode === 'survival' && a.alive !== b.alive) return a.alive ? -1 : 1;
            return b.score - a.score;
        });

    sorted.forEach(p => {
        const row = document.createElement('div');
        row.className = 'breakdown-row';
        if (p.id === myId) row.classList.add('me');
        if (!p.alive && gameMode === 'survival') row.classList.add('dead');

        const deltaClass = p.roundPoints > 0 ? 'plus' : 'zero';
        const deltaText = p.roundPoints > 0 ? `+${p.roundPoints}` : '—';
        row.innerHTML = `
            <span class="breakdown-name">${escapeHtml(p.name)}</span>
            <span class="breakdown-delta ${deltaClass}">${deltaText}</span>
            <span class="breakdown-score">${p.score}</span>
        `;
        roundBreakdown.appendChild(row);
    });
}

function renderPodium(list, winnerId) {
    finalLeaderboard.innerHTML = '';
    list.slice(0, 3).forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'podium-row';
        if (p.id === winnerId) row.classList.add('winner');
        if (idx === 0) row.classList.add('gold');
        else if (idx === 1) row.classList.add('silver');
        else if (idx === 2) row.classList.add('bronze');

        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        const badge = p.id === winnerId ? '<span class="tag tag-host">ПОБЕДИТЕЛЬ</span>' : '';
        row.innerHTML = `
            <div class="podium-medal">${medal}</div>
            <div class="podium-name">${escapeHtml(p.name)}</div>
            ${badge}
            <div class="podium-score">${p.score}</div>
        `;
        finalLeaderboard.appendChild(row);
    });
}

function handlePlayers(list) {
    const arr = Array.isArray(list) ? list : [];
    const me = arr.find(p => p.id === myId);
    if (me) {
        myAlive = me.alive;
        isSpectator = me.spectator;
    }
    renderPlayers(arr);
    renderBoard(arr);
    updateHostUI(arr);
    updateLiveState(arr);
}

function showToast(text, type) {
    answerToast.textContent = text;
    answerToast.className = `answer-toast ${type || ''}`;
    answerToast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { answerToast.style.display = 'none'; }, 2000);
}

function startTimer(seconds) {
    stopTimer();
    timerMax = Math.max(1, seconds);
    const circ = 151;
    timerProg.style.strokeDasharray = circ;

    const tick = () => {
        const left = Math.max(0, (roundDeadline - Date.now()) / 1000);
        timerEl.textContent = Math.ceil(left);
        timerProg.style.strokeDashoffset = circ - (left / timerMax) * circ;
        if (left <= 0) stopTimer();
    };

    tick();
    timerInt = setInterval(tick, 100);
}

function stopTimer() {
    if (timerInt) {
        clearInterval(timerInt);
        timerInt = null;
    }
}

function resetAnswerButtons() {
    answerBtns.forEach(b => {
        b.disabled = false;
        b.classList.remove('selected', 'correct', 'incorrect');
    });
}

function clearAllTimers() {
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
    if (nextRoundTimer) { clearTimeout(nextRoundTimer); nextRoundTimer = null; }
    if (startDelayTimer) { clearTimeout(startDelayTimer); startDelayTimer = null; }
}

function makePlayer(id, name) {
    return {
        id,
        name,
        score: 0,
        streak: 0,
        alive: true,
        answered: false,
        roundPoints: 0,
        roundAnswer: null,
        roundCorrect: false,
        spectator: false
    };
}

function randomId(prefix) {
    return prefix + Math.random().toString(36).slice(2, 10);
}

function generateRoomCode() {
    const bytes = new Uint32Array(ROOM_CODE_LENGTH);
    if (window.crypto && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    }
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        const value = bytes[i] || Math.floor(Math.random() * 0xffffffff);
        code += ROOM_CODE_CHARS[value % ROOM_CODE_CHARS.length];
    }
    return code;
}

function normalizeRoomCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

function uniqueName(base) {
    const used = new Set(players.map(p => p.name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    let suffix = 2;
    while (used.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
    return `${base} ${suffix}`.slice(0, 16);
}

function setConnectionBanner(text) {
    if (text) {
        connectionBanner.textContent = text;
        connectionBanner.style.display = 'block';
    } else {
        connectionBanner.style.display = 'none';
    }
}

function setStatus(text) {
    serverAddr.textContent = text;
}

function updateUrlRoom(code) {
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    try {
        history.replaceState(null, '', url.toString());
    } catch {}
}

function updateRoomUI() {
    const inRoom = joined;
    roomPanel.style.display = inRoom ? 'flex' : 'none';
    roomJoinRow.style.display = inRoom ? 'none' : 'flex';
    createRoomBtn.style.display = inRoom ? 'none' : 'inline-flex';
    playerNameInput.disabled = inRoom || joining;
    roomCodeInput.disabled = inRoom || joining;
    joinRoomBtn.disabled = inRoom || joining;
    createRoomBtn.disabled = inRoom || joining;
    roomCodeDisplay.textContent = roomCode || '------';
    setStatus(inRoom ? (isHost ? 'Хост комнаты' : 'Гость комнаты') : 'Не в комнате');
}

function peerErrorMessage(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') return 'Комната не найдена или хост уже вышел';
    if (type === 'unavailable-id') return 'Код комнаты занят, попробуйте снова';
    if (type === 'network' || type === 'server-error') return 'Нет связи с сервером комнат. Проверьте интернет.';
    if (type === 'browser-incompatible') return 'Браузер не поддерживает WebRTC';
    if (type === 'webrtc') return 'Не удалось установить P2P-соединение';
    return 'Ошибка соединения. Попробуйте ещё раз.';
}

function sendTo(playerId, message) {
    const conn = connections.find(c => c.peer === playerId);
    if (conn && conn.open) {
        try {
            conn.send(message);
        } catch {}
    }
}

function serializePlayers() {
    return players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        streak: p.streak,
        alive: p.alive,
        answered: p.answered,
        roundPoints: p.roundPoints,
        roundAnswer: revealRound ? p.roundAnswer : null,
        roundCorrect: revealRound ? p.roundCorrect : false,
        spectator: p.spectator
    }));
}

function buildSnapshot() {
    return {
        t: 'state',
        phase: gamePhase,
        code: roomCode,
        hostId,
        settings: {
            mode: settings.mode,
            difficulty: settings.difficulty,
            roundTime: settings.roundTime,
            categories: settings.categories.slice(),
            theme: settings.theme
        },
        players: serializePlayers(),
        game: {
            mode: currentMode.id,
            questionNum: currentIndex + 1,
            total: questionsQueue.length,
            played: questionsPlayed,
            question: currentQuestion ? {
                cat: currentQuestion.cat,
                diff: currentQuestion.diff,
                code: currentQuestion.code,
                options: currentQuestion.options.slice(),
                timeLimit: currentQuestion.timeLimit
            } : null,
            reveal: revealRound,
            correctIndex: revealRound && currentQuestion ? currentQuestion.correct : null,
            explain: revealRound && currentQuestion ? currentQuestion.explain : '',
            endsAt: roundActive ? roundDeadline : null,
            serverNow: Date.now()
        }
    };
}

function broadcastState() {
    if (!isHost) return;
    const snapshot = buildSnapshot();
    connections.forEach(conn => {
        if (conn.open) {
            try {
                conn.send(snapshot);
            } catch {}
        }
    });
}

function setupHostConnection(conn) {
    connections.push(conn);
    conn.on('data', data => handleHostMessage(conn, data));
    const drop = () => removeGuest(conn.peer);
    conn.on('close', drop);
    conn.on('error', drop);
}

function handleHostMessage(conn, data) {
    if (!data || typeof data !== 'object') return;

    if (data.t === 'join') {
        if (players.some(p => p.id === conn.peer)) return;
        const name = uniqueName(sanitizeName(data.name) || 'Игрок');
        const spectator = gamePhase !== 'lobby';
        players.push({ ...makePlayer(conn.peer, name), spectator });
        try {
            conn.send({ t: 'welcome', id: conn.peer, code: roomCode });
        } catch {}
        handlePlayers(players);
        broadcastState();
        return;
    }

    if (data.t === 'answer') {
        const player = getPlayer(conn.peer);
        if (player) submitAnswer(player, Number(data.index), true);
        return;
    }

    if (data.t === 'leave') {
        removeGuest(conn.peer);
    }
}

function removeGuest(id) {
    const index = players.findIndex(p => p.id === id);
    if (index >= 0) {
        players.splice(index, 1);
        connections = connections.filter(c => c.peer !== id);
        if (roundActive) checkRoundEnd();
        handlePlayers(players);
        broadcastState();
    } else {
        connections = connections.filter(c => c.peer !== id);
    }
}

function startHostPeer(attempt) {
    if (attempt >= 3) {
        joining = false;
        updateRoomUI();
        setStatus('Не в комнате');
        return showError('Не удалось создать комнату. Попробуйте ещё раз.');
    }

    const code = generateRoomCode();
    const candidate = new Peer(ROOM_PREFIX + code, { debug: 0 });
    let opened = false;
    let retried = false;

    candidate.on('open', () => {
        if (opened) {
            setConnectionBanner('');
            return;
        }
        opened = true;
        peer = candidate;
        isHost = true;
        joined = true;
        joining = false;
        roomCode = code;
        myId = randomId('host-');
        hostId = myId;
        players = [makePlayer(myId, myName)];

        peer.on('disconnected', () => {
            setConnectionBanner('Связь с сервером комнат потеряна, переподключаемся…');
            try {
                peer.reconnect();
            } catch {}
        });
        peer.on('close', () => setConnectionBanner('Комната закрыта'));
        peer.on('error', err => {
            if (err && err.type !== 'peer-unavailable') setConnectionBanner(peerErrorMessage(err));
        });

        updateRoomUI();
        handlePlayers(players);
        broadcastState();
        setConnectionBanner('');
        showError('');
    });

    candidate.on('connection', setupHostConnection);

    candidate.on('error', err => {
        if (!opened && !retried && (err.type === 'unavailable-id' || err.type === 'network')) {
            retried = true;
            try {
                candidate.destroy();
            } catch {}
            setTimeout(() => startHostPeer(attempt + 1), 600);
            return;
        }

        if (!opened) {
            joining = false;
            updateRoomUI();
            setStatus('Не в комнате');
            showError(peerErrorMessage(err));
            try {
                candidate.destroy();
            } catch {}
        }
    });
}

function createRoom() {
    if (joined || joining) return;
    const name = sanitizeName(playerNameInput.value);
    if (!name) return showError('Введите имя');
    if (typeof Peer === 'undefined') return showError('Не удалось загрузить PeerJS');

    myName = name;
    storageSet('cg_name', myName);
    joining = true;
    showError('');
    updateRoomUI();
    setStatus('Создаём комнату…');

    try {
        startHostPeer(0);
    } catch {
        joining = false;
        updateRoomUI();
        showError('Не удалось создать комнату. Попробуйте ещё раз.');
    }
}

function joinRoom() {
    if (joined || joining) return;
    const name = sanitizeName(playerNameInput.value);
    if (!name) return showError('Введите имя');
    const code = normalizeRoomCode(roomCodeInput.value);
    if (code.length !== ROOM_CODE_LENGTH) return showError('Введите код из 6 символов');
    if (typeof Peer === 'undefined') return showError('Не удалось загрузить PeerJS');

    myName = name;
    storageSet('cg_name', myName);
    joining = true;
    showError('');
    updateRoomUI();
    setStatus('Подключаемся…');

    let connected = false;

    if (joinTimeout) clearTimeout(joinTimeout);
    joinTimeout = setTimeout(() => {
        joinTimeout = null;
        if (connected) return;
        showError('Не удалось подключиться к комнате. Проверьте код и попробуйте снова.');
        cleanupConnection();
        updateRoomUI();
        setStatus('Не в комнате');
    }, JOIN_TIMEOUT_MS);

    try {
        peer = new Peer({ debug: 0 });
    } catch {
        if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
        joining = false;
        updateRoomUI();
        return showError('Браузер не поддерживает WebRTC');
    }

    peer.on('open', id => {
        myId = id;
        hostConn = peer.connect(ROOM_PREFIX + code, { reliable: true });

        hostConn.on('open', () => {
            connected = true;
            if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
            try {
                hostConn.send({ t: 'join', name });
            } catch {}
            setStatus('Подключено');
        });

        hostConn.on('data', handleGuestMessage);
        hostConn.on('close', handleHostLost);
        hostConn.on('error', handleHostLost);
    });

    peer.on('error', err => {
        if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
        if (!connected) {
            cleanupConnection();
            updateRoomUI();
            setStatus('Не в комнате');
            showError(peerErrorMessage(err));
        } else {
            setConnectionBanner(peerErrorMessage(err));
        }
    });
}

function handleGuestMessage(data) {
    if (!data || typeof data !== 'object') return;

    if (data.t === 'state') {
        if (!joined) {
            joined = true;
            joining = false;
            isHost = false;
            roomCode = data.code || roomCode;
            updateUrlRoom(roomCode);
            updateRoomUI();
            setConnectionBanner('');
        }
        applySnapshot(data);
        return;
    }

    if (data.t === 'welcome') {
        if (!joined) {
            joined = true;
            joining = false;
            isHost = false;
        }
        roomCode = data.code || roomCode;
        updateUrlRoom(roomCode);
        updateRoomUI();
        return;
    }

    if (data.t === 'toast') {
        showToast(data.text, data.kind);
        return;
    }

    if (data.t === 'error') {
        showError(data.text);
        return;
    }

    if (data.t === 'roomClosed') {
        setConnectionBanner('Хост закрыл комнату');
        setTimeout(() => {
            cleanupConnection();
            resetClient();
        }, 1200);
    }
}

function guestAnswer(index) {
    if (!hostConn || !hostConn.open || !roundActive || answeredThisRound) return;
    if (!Number.isInteger(index)) return;
    answeredThisRound = true;
    guestSelectedIndex = index;
    answerBtns.forEach(b => { b.disabled = true; });
    const btn = answerBtns[index];
    if (btn) btn.classList.add('selected');
    try {
        hostConn.send({ t: 'answer', index });
    } catch {}
}

function cleanupConnection() {
    if (joinTimeout) { clearTimeout(joinTimeout); joinTimeout = null; }
    if (hostConn) {
        try { hostConn.removeAllListeners(); } catch {}
        try { hostConn.close(); } catch {}
        hostConn = null;
    }
    connections.forEach(conn => {
        try { conn.removeAllListeners(); } catch {}
        try { conn.close(); } catch {}
    });
    connections = [];
    if (peer) {
        try { peer.removeAllListeners(); } catch {}
        try { peer.destroy(); } catch {}
        peer = null;
    }
    joining = false;
}

function resetClient() {
    joined = false;
    joining = false;
    isHost = false;
    myId = null;
    hostId = null;
    roomCode = '';
    players = [];
    gamePhase = 'lobby';
    gameStarted = false;
    gameInProgress = false;
    roundActive = false;
    revealRound = false;
    currentQuestion = null;
    currentIndex = 0;
    questionsPlayed = 0;
    questionsQueue = [];
    answeredThisRound = false;
    guestSelectedIndex = null;
    lastQuestionKey = '';
    myAlive = true;
    isSpectator = false;
    clearAllTimers();
    stopTimer();
    if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }
    answerToast.style.display = 'none';
    explainBox.style.display = 'none';
    setStatusBanner('');
    setConnectionBanner('');
    rematchBtn.style.display = 'none';
    restartBtn.textContent = 'В ЛОББИ';
    updateUrlRoom('');
    updateRoomUI();
    showScreen('lobby');
    handlePlayers(players);
    setSettingsLocked(false);
    renderPlayers([]);
}

function leaveRoom() {
    if (!joined && !joining) return;
    if (isHost) {
        connections.forEach(conn => {
            if (conn.open) {
                try { conn.send({ t: 'roomClosed' }); } catch {}
            }
        });
    } else if (hostConn && hostConn.open) {
        try { hostConn.send({ t: 'leave' }); } catch {}
    }
    cleanupConnection();
    resetClient();
}

function handleHostLost() {
    if (!joined || isHost) return;
    if (!hostConn && !peer) return;
    setConnectionBanner('Соединение с хостом потеряно');
    cleanupConnection();
    setTimeout(() => {
        resetClient();
    }, 1500);
}

function copyRoomLink() {
    if (!roomCode) return;
    const url = new URL(location.href);
    url.searchParams.set('room', roomCode);
    const text = url.toString();

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showToast('Ссылка скопирована', 'ok'))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
        document.execCommand('copy');
        showToast('Ссылка скопирована', 'ok');
    } catch {
        showError('Не удалось скопировать ссылку');
    }
    area.remove();
}

function renderQuestionCommon(question, num, total) {
    questionNumEl.textContent = num;
    totalQuestionsEl.textContent = total;
    catPill.textContent = CAT_LABELS[question.cat] || 'РАЗНОЕ';
    diffPill.textContent = DIFF_LABELS[question.diff] || 'СРЕДНИЙ';
    modePill.textContent = MODE_LABELS[currentMode.id] || 'КЛАССИКА';
    alivePill.style.display = currentMode.survival ? 'inline-flex' : 'none';
    alivePill.textContent = `ЖИВЫХ: ${getAlivePlayers().length}`;
    codeBlock.textContent = question.code;
    answerBtns.forEach((btn, idx) => {
        const textEl = document.getElementById('option' + idx);
        const hasOption = idx < question.options.length;
        btn.style.display = hasOption ? '' : 'none';
        btn.disabled = !hasOption;
        if (textEl) textEl.textContent = hasOption ? question.options[idx] : '';
    });
}

function applySnapshot(message) {
    const game = message.game || {};

    players = Array.isArray(message.players) ? message.players : [];
    hostId = message.hostId;
    roomCode = message.code || roomCode;
    settings = { ...settings, ...(message.settings || {}) };
    if (Array.isArray(message.settings && message.settings.categories)) {
        settings.categories = message.settings.categories.slice();
    }
    applySettings(settings);

    gameMode = game.mode || settings.mode || 'classic';
    currentMode = MODES[gameMode] || MODES.classic;
    gamePhase = message.phase || 'lobby';

    const me = getMe();
    myAlive = me ? me.alive : true;
    isSpectator = me ? me.spectator : false;

    if (typeof game.serverNow === 'number') {
        clockOffset = game.serverNow - Date.now();
    }

    if (gamePhase === 'lobby') {
        gameStarted = false;
        gameInProgress = false;
        roundActive = false;
        revealRound = false;
        answeredThisRound = false;
        guestSelectedIndex = null;
        lastQuestionKey = '';
        currentQuestion = null;
        stopTimer();
        showScreen('lobby');
        handlePlayers(players);
        updateRoomUI();
        setSettingsLocked(!isHost);
        return;
    }

    if (gamePhase === 'game' || gamePhase === 'reveal') {
        gameStarted = true;
        gameInProgress = true;
        revealRound = gamePhase === 'reveal' || !!game.reveal;
        roundActive = !revealRound && !!game.question;
        currentIndex = Math.max(0, (game.questionNum || 1) - 1);

        if (!game.question) {
            currentQuestion = null;
            guestSelectedIndex = null;
            lastQuestionKey = '';
            answeredThisRound = false;
            stopTimer();
            resetAnswerButtons();
            codeBlock.textContent = '';
            answerBtns.forEach((btn, idx) => {
                btn.style.display = '';
                btn.disabled = true;
                const textEl = document.getElementById('option' + idx);
                if (textEl) textEl.textContent = '';
            });
            showScreen('game');
            setStatusBanner('Игра начинается…');
            timerEl.textContent = '—';
            timerProg.style.strokeDashoffset = 151;
            handlePlayers(players);
            return;
        }

        currentQuestion = {
            cat: game.question.cat,
            diff: game.question.diff,
            code: game.question.code,
            options: game.question.options.slice(),
            timeLimit: game.question.timeLimit || settings.roundTime,
            correct: typeof game.correctIndex === 'number' ? game.correctIndex : undefined,
            explain: game.explain || ''
        };

        renderGuestQuestion(game);
        showScreen('game');
        handlePlayers(players);
        return;
    }

    if (gamePhase === 'roundEnd') {
        gameStarted = true;
        gameInProgress = true;
        revealRound = true;
        roundActive = false;
        stopTimer();
        if (game.question) {
            currentQuestion = {
                cat: game.question.cat,
                diff: game.question.diff,
                code: game.question.code,
                options: game.question.options.slice(),
                timeLimit: game.question.timeLimit || settings.roundTime,
                correct: typeof game.correctIndex === 'number' ? game.correctIndex : undefined,
                explain: game.explain || ''
            };
        }
        renderGuestRoundEnd(game);
        handlePlayers(players);
        return;
    }

    if (gamePhase === 'gameOver') {
        gameStarted = false;
        gameInProgress = false;
        roundActive = false;
        revealRound = false;
        guestSelectedIndex = null;
        lastQuestionKey = '';
        answeredThisRound = false;
        stopTimer();
        clearAllTimers();
        renderGuestGameOver(game);
        handlePlayers(players);
    }
}

function renderGuestQuestion(game) {
    const question = game.question;
    const key = `${game.questionNum}:${question.code}`;
    if (key !== lastQuestionKey) {
        lastQuestionKey = key;
        guestSelectedIndex = null;
        answeredThisRound = false;
    }

    const me = getMe();
    answeredThisRound = !!(me && me.answered) || guestSelectedIndex !== null;

    resetAnswerButtons();
    renderQuestionCommon(currentQuestion, game.questionNum, game.total || 0);

    answerBtns.forEach((btn, idx) => {
        btn.classList.remove('selected', 'correct', 'incorrect');

        if (game.reveal) {
            btn.disabled = true;
            if (idx === game.correctIndex) btn.classList.add('correct');
            else if (idx === (me ? me.roundAnswer : null) || idx === guestSelectedIndex) btn.classList.add('incorrect');
            return;
        }

        if (me && me.answered) {
            btn.disabled = true;
            if (idx === guestSelectedIndex) btn.classList.add('selected');
            return;
        }

        btn.disabled = isSpectator || !myAlive;
    });

    if (game.reveal) {
        stopTimer();
        timerEl.textContent = '0';
        timerProg.style.strokeDashoffset = 151;
        setStatusBanner(myAlive ? '' : 'Вы выбыли — наблюдаете за игрой');
    } else if (game.endsAt) {
        roundDeadline = game.endsAt - clockOffset;
        startTimer(question.timeLimit || settings.roundTime);
        if (isSpectator) setStatusBanner('Режим наблюдателя — ответы недоступны');
        else if (!myAlive) setStatusBanner('Вы выбыли — наблюдаете за игрой');
        else setStatusBanner('');
    } else {
        stopTimer();
    }
}

function renderGuestRoundEnd(game) {
    const me = getMe();
    const correctIndex = typeof game.correctIndex === 'number' ? game.correctIndex : 0;
    const correctText = currentQuestion && currentQuestion.options[correctIndex]
        ? currentQuestion.options[correctIndex]
        : '';
    correctAnswerText.textContent = correctText;

    let resultText = 'Время вышло';
    let resultClass = 'neutral';
    if (currentMode.survival && me && !me.alive) {
        resultText = 'Вы выбыли';
        resultClass = 'bad';
    } else if (me && me.roundPoints > 0) {
        resultText = `Верно! +${me.roundPoints} очков`;
        resultClass = 'good';
    } else if (me && me.answered) {
        resultText = 'Неверно';
        resultClass = 'bad';
    }

    roundResultText.textContent = resultText;
    roundResultText.className = `round-result ${resultClass}`;
    renderBreakdown(players);

    const explain = game.explain || (currentQuestion && currentQuestion.explain) || '';
    explainText.textContent = explain;
    explainBox.style.display = explain ? 'block' : 'none';
    setStatusBanner('');
    showScreen('roundEnd');
}

function renderGuestGameOver(game) {
    const mode = currentMode;
    const alive = getAlivePlayers().slice().sort((a, b) => b.score - a.score);
    const ranked = getActivePlayers().slice().sort((a, b) => {
        if (mode.survival && a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.score - a.score;
    });
    const winner = mode.survival ? (alive[0] || ranked[0] || null) : (ranked[0] || null);
    const total = game.played || game.total || questionsQueue.length;
    const modeLabel = MODE_LABELS[mode.id] || 'КЛАССИКА';

    gameOverSub.textContent = winner
        ? `${modeLabel} • ${total} ${questionsWord(total)} • Победитель: ${winner.name}`
        : `${modeLabel} • результатов нет`;

    renderPodium(ranked, winner ? winner.id : null);
    rematchBtn.style.display = 'none';
    restartBtn.textContent = 'ВЫЙТИ ИЗ КОМНАТЫ';
    setStatusBanner('');
    showScreen('gameOver');
}

function resetPlayersForNewGame() {
    players.forEach(p => {
        p.score = 0;
        p.streak = 0;
        p.alive = true;
        p.answered = false;
        p.roundPoints = 0;
        p.roundAnswer = null;
        p.roundCorrect = false;
        p.spectator = false;
    });
    myAlive = true;
    answeredThisRound = false;
}

function difficultyMatches(diff, setting) {
    if (setting === 'easy') return diff === 'easy';
    if (setting === 'hard') return diff === 'hard' || diff === 'medium';
    return diff === 'easy' || diff === 'medium';
}

function buildQueue() {
    const cats = Array.isArray(settings.categories) && settings.categories.length
        ? settings.categories
        : allowedCats;
    let pool = questionsDB.filter(q => cats.includes(q.cat));
    if (!pool.length) pool = questionsDB.slice();

    let filtered = pool.filter(q => difficultyMatches(q.diff, settings.difficulty));
    if (filtered.length < 3) filtered = pool;
    if (!filtered.length) filtered = questionsDB.slice();

    const limit = Math.min(currentMode.questions, filtered.length);
    questionsQueue = shuffle(filtered.slice())
        .slice(0, limit)
        .map(q => {
            const options = shuffle(q.options.slice());
            return {
                cat: q.cat,
                diff: q.diff,
                code: q.code,
                options,
                correct: options.indexOf(q.answer),
                explain: q.explain
            };
        });
}

function getRoundSeconds() {
    const base = Number(settings.roundTime) || 15;
    return Math.max(5, Math.min(base, currentMode.maxTime));
}

function startGame() {
    if (!isHost) return;
    if (!joined) return showError('Создайте комнату');
    if (gameInProgress) return;
    if (questionsDB.length === 0) return showError('Вопросы ещё загружаются…');

    const active = getActivePlayers();
    if (active.length < MIN_PLAYERS) return showError(`Нужно минимум ${MIN_PLAYERS} игрока`);

    resetPlayersForNewGame();
    currentMode = MODES[settings.mode] || MODES.classic;
    gameMode = currentMode.id;
    gamePhase = 'game';
    gameStarted = true;
    gameInProgress = true;
    roundActive = false;
    revealRound = false;
    answeredThisRound = false;
    currentIndex = 0;
    questionsPlayed = 0;
    currentQuestion = null;
    buildQueue();

    if (!questionsQueue.length) {
        gameStarted = false;
        gameInProgress = false;
        return showError('Нет вопросов для выбранных настроек');
    }

    showScreen('game');
    setStatusBanner('Игра начинается…');
    setSettingsLocked(true);
    startBtn.disabled = true;
    questionNumEl.textContent = '1';
    totalQuestionsEl.textContent = questionsQueue.length;
    codeBlock.textContent = '';
    timerEl.textContent = '—';
    timerProg.style.strokeDashoffset = 151;
    answerBtns.forEach((btn, idx) => {
        btn.style.display = '';
        btn.disabled = true;
        btn.classList.remove('selected', 'correct', 'incorrect');
        const textEl = document.getElementById('option' + idx);
        if (textEl) textEl.textContent = '';
    });
    handlePlayers(players);
    broadcastState();

    if (startDelayTimer) clearTimeout(startDelayTimer);
    startDelayTimer = setTimeout(() => {
        startDelayTimer = null;
        startRound();
    }, START_DELAY_MS);
}

function startRound() {
    if (!gameStarted) return;
    if (currentIndex >= questionsQueue.length) return endGame();

    roundActive = true;
    gamePhase = 'game';
    players.forEach(p => {
        p.answered = false;
        p.roundPoints = 0;
        p.roundAnswer = null;
        p.roundCorrect = false;
    });

    currentQuestion = questionsQueue[currentIndex];
    const seconds = getRoundSeconds();
    currentQuestion.timeLimit = seconds;
    roundDeadline = Date.now() + seconds * 1000;
    revealRound = false;
    answeredThisRound = false;

    showScreen('game');
    resetAnswerButtons();
    answerToast.style.display = 'none';
    explainBox.style.display = 'none';
    renderQuestionCommon(currentQuestion, currentIndex + 1, questionsQueue.length);

    const me = getMe();
    myAlive = me ? me.alive : true;
    if (!myAlive) {
        setStatusBanner('Вы выбыли — наблюдаете за игрой');
        answerBtns.forEach(b => { b.disabled = true; });
    } else {
        setStatusBanner('');
    }

    timerMax = seconds;
    timerEl.textContent = seconds;
    startTimer(seconds);
    setSettingsLocked(true);
    handlePlayers(players);
    broadcastState();

    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = setTimeout(endRound, seconds * 1000);
}

function submitAnswer(player, index, fromNetwork) {
    if (!isHost) return;
    if (!roundActive || !player || player.spectator || !player.alive || player.answered || !currentQuestion) return;

    const optionCount = currentQuestion.options.length;
    if (!Number.isInteger(index) || index < 0 || index >= optionCount) return;

    player.answered = true;
    player.roundAnswer = index;
    player.roundCorrect = index === currentQuestion.correct;

    let points = 0;
    if (player.roundCorrect) {
        const base = DIFF_POINTS[currentQuestion.diff] || 10;
        const timeLeft = Math.max(0, roundDeadline - Date.now());
        const ratio = currentQuestion.timeLimit > 0 ? timeLeft / (currentQuestion.timeLimit * 1000) : 0;
        const speedBonus = Math.round(5 * ratio);
        const streakBonus = Math.min(player.streak, 3) * 2;
        points = Math.round((base + speedBonus + streakBonus) * currentMode.multiplier);
    }
    player.roundPoints = points;

    if (player.id === myId) {
        answeredThisRound = true;
        answerBtns.forEach(b => { b.disabled = true; });
        const btn = answerBtns[index];
        if (btn) btn.classList.add('selected');

        if (player.roundCorrect) {
            const streak = player.streak + 1 > 1 ? ` · серия ×${player.streak + 1}` : '';
            showToast(`+${points}${streak}`, 'ok');
        } else {
            const dead = currentMode.survival ? ' — вы выбыли' : '';
            showToast(`Неверно${dead}`, 'bad');
        }
    } else if (fromNetwork) {
        if (player.roundCorrect) {
            const streak = player.streak + 1 > 1 ? ` · серия ×${player.streak + 1}` : '';
            sendTo(player.id, { t: 'toast', kind: 'ok', text: `+${points}${streak}` });
        } else {
            const dead = currentMode.survival ? ' — вы выбыли' : '';
            sendTo(player.id, { t: 'toast', kind: 'bad', text: `Неверно${dead}` });
        }
    }

    handlePlayers(players);
    broadcastState();
    checkRoundEnd();
}

function checkRoundEnd() {
    if (!roundActive) return;
    const contenders = getActivePlayers().filter(p => p.alive);
    if (currentMode.survival && contenders.length <= 1) return endRound();
    if (contenders.length > 0 && contenders.every(p => p.answered)) endRound();
}

function endRound() {
    if (!roundActive || !currentQuestion) return;
    roundActive = false;
    gamePhase = 'reveal';
    questionsPlayed += 1;
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }

    const aliveBefore = new Set(getAlivePlayers().map(p => p.id));

    getActivePlayers().forEach(p => {
        if (!p.answered) {
            p.roundCorrect = false;
            p.roundPoints = 0;
            p.roundAnswer = null;
        }
        if (p.roundCorrect) {
            p.streak += 1;
            p.score += p.roundPoints;
        } else {
            p.streak = 0;
            p.roundPoints = 0;
            if (currentMode.survival) p.alive = false;
        }
    });

    const eliminated = currentMode.survival
        ? [...aliveBefore].filter(id => {
            const p = getPlayer(id);
            return p && !p.alive;
        })
        : [];

    stopTimer();
    timerEl.textContent = '0';
    timerProg.style.strokeDashoffset = 151;
    revealRound = true;
    answeredThisRound = true;

    answerBtns.forEach((b, idx) => {
        b.disabled = true;
        if (idx === currentQuestion.correct) b.classList.add('correct');
        else if (b.classList.contains('selected')) b.classList.add('incorrect');
    });

    correctAnswerText.textContent = currentQuestion.options[currentQuestion.correct];
    gameMode = currentMode.id;

    const me = getMe();
    let resultText = 'Время вышло';
    let resultClass = 'neutral';

    if (currentMode.survival && me && !me.alive) {
        resultText = 'Вы выбыли';
        resultClass = 'bad';
    } else if (me && me.roundPoints > 0) {
        resultText = `Верно! +${me.roundPoints} очков`;
        resultClass = 'good';
    } else if (me && me.answered) {
        resultText = 'Неверно';
        resultClass = 'bad';
    }

    roundResultText.textContent = resultText;
    roundResultText.className = `round-result ${resultClass}`;
    renderBreakdown(players);

    explainText.textContent = currentQuestion.explain || '';
    explainBox.style.display = currentQuestion.explain ? 'block' : 'none';

    handlePlayers(players);
    broadcastState();

    if (roundRevealTimer) clearTimeout(roundRevealTimer);
    roundRevealTimer = setTimeout(() => {
        roundRevealTimer = null;
        if (gameInProgress) {
            gamePhase = 'roundEnd';
            showScreen('roundEnd');
            broadcastState();
        }
    }, 800);

    if (nextRoundTimer) clearTimeout(nextRoundTimer);
    nextRoundTimer = setTimeout(() => {
        nextRoundTimer = null;
        if (!gameStarted) return;
        if (currentMode.survival && getAlivePlayers().length <= 1) return endGame();
        currentIndex += 1;
        startRound();
    }, ROUND_REVEAL_MS);
}

function endGame() {
    if (!isHost || !gameStarted) return;

    gamePhase = 'gameOver';
    gameStarted = false;
    gameInProgress = false;
    roundActive = false;
    clearAllTimers();
    if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }
    stopTimer();

    const mode = currentMode;
    const alive = getAlivePlayers().slice().sort((a, b) => b.score - a.score);
    const ranked = getActivePlayers().slice().sort((a, b) => {
        if (mode.survival && a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.score - a.score;
    });
    const winner = mode.survival ? (alive[0] || ranked[0] || null) : (ranked[0] || null);
    const winnerId = winner ? winner.id : null;
    const totalQuestions = questionsPlayed || questionsQueue.length;
    const modeLabel = MODE_LABELS[mode.id] || 'КЛАССИКА';

    gameOverSub.textContent = winner
        ? `${modeLabel} • ${totalQuestions} ${questionsWord(totalQuestions)} • Победитель: ${winner.name}`
        : `${modeLabel} • результатов нет`;

    renderPodium(ranked, winnerId);
    showScreen('gameOver');
    handlePlayers(players);
    rematchBtn.style.display = 'inline-flex';
    restartBtn.textContent = 'В ЛОББИ';
    setSettingsLocked(false);
    answerToast.style.display = 'none';
    broadcastState();
}

function backToLobby() {
    if (!isHost) return;
    gamePhase = 'lobby';
    gameStarted = false;
    gameInProgress = false;
    roundActive = false;
    clearAllTimers();
    stopTimer();
    if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }

    currentQuestion = null;
    currentIndex = 0;
    questionsPlayed = 0;
    questionsQueue = [];
    revealRound = false;
    answeredThisRound = false;
    myAlive = true;

    answerToast.style.display = 'none';
    explainBox.style.display = 'none';
    setStatusBanner('');

    players.forEach(p => {
        p.score = 0;
        p.streak = 0;
        p.alive = true;
        p.answered = false;
        p.roundPoints = 0;
        p.roundAnswer = null;
        p.roundCorrect = false;
        p.spectator = false;
    });

    rematchBtn.style.display = 'none';
    restartBtn.textContent = 'В ЛОББИ';
    showScreen('lobby');
    handlePlayers(players);
    setSettingsLocked(false);
    broadcastState();
}

function rematch() {
    if (!isHost || gameInProgress) return;
    backToLobby();
    setTimeout(() => {
        if (!gameInProgress) startGame();
    }, 700);
}

function loadQuestions() {
    fetch('./data/questions.json', { cache: 'no-store' })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(raw => {
            if (!Array.isArray(raw) || raw.length === 0) throw new Error('Пустой список вопросов');

            questionsDB = raw.map((q, index) => {
                const valid = q
                    && typeof q.code === 'string'
                    && Array.isArray(q.options)
                    && q.options.length >= 2
                    && q.options.length <= 4
                    && new Set(q.options).size === q.options.length
                    && typeof q.answer === 'string'
                    && q.options.includes(q.answer)
                    && typeof q.explain === 'string'
                    && q.explain.trim().length > 0;

                if (!valid) throw new Error(`Некорректный вопрос #${index + 1}`);

                return {
                    cat: String(q.cat || 'langs'),
                    diff: ALLOWED_DIFFS.includes(q.diff) ? q.diff : 'medium',
                    code: q.code,
                    options: q.options.slice(),
                    answer: q.answer,
                    explain: q.explain.trim()
                };
            });

            allowedCats = [...new Set(questionsDB.map(q => q.cat))];
            if (!joined || isHost) settings.categories = allowedCats.slice();
            applySettings(settings);
            handlePlayers(players);
            showError('');
        })
        .catch(err => {
            console.error('Не удалось загрузить вопросы:', err);
            showError('Не удалось загрузить вопросы. Откройте игру через HTTP-сервер.');
            startBtn.disabled = true;
        });
}

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
copyLinkBtn.addEventListener('click', copyRoomLink);
leaveRoomBtn.addEventListener('click', leaveRoom);

playerNameInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (roomCodeInput.value.trim()) joinRoom();
    else createRoom();
});

roomCodeInput.addEventListener('input', () => {
    roomCodeInput.value = normalizeRoomCode(roomCodeInput.value);
});

roomCodeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom();
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
    if (!isHost && joined) leaveRoom();
    else backToLobby();
});
rematchBtn.addEventListener('click', rematch);

document.querySelectorAll('.seg').forEach(group => {
    group.addEventListener('click', e => {
        const target = e.target.closest('.seg-item');
        if (!target || target.disabled) return;
        if (gameInProgress) return showError('Настройки недоступны во время игры');
        if (joined && !isHost) return showError('Настройки меняет хост');

        const key = group.getAttribute('data-setting');
        const raw = target.getAttribute('data-value');
        let value = raw;

        if (key === 'roundTime') value = Number(raw);
        if (key === 'mode' && !MODES[value]) return;
        if (key === 'difficulty' && !ALLOWED_DIFFS.includes(value)) return;
        if (key === 'theme' && !ALLOWED_THEMES.includes(value)) return;

        group.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
        target.classList.add('active');

        settings[key] = value;
        if (key === 'theme') {
            document.documentElement.dataset.theme = value;
            storageSet('cg_theme', value);
        }
        if (key === 'mode') {
            gameMode = value;
            currentMode = MODES[value] || currentMode;
            modeDesc.textContent = MODE_DESC[value] || '';
        }

        if (isHost) broadcastState();
        showError('');
    });
});

document.querySelectorAll('.checks input').forEach(cb => {
    cb.addEventListener('change', () => {
        if (gameInProgress) {
            cb.checked = !cb.checked;
            return showError('Настройки недоступны во время игры');
        }
        if (joined && !isHost) {
            cb.checked = !cb.checked;
            return showError('Настройки меняет хост');
        }

        const cats = [];
        document.querySelectorAll('.checks input:checked').forEach(c => cats.push(c.getAttribute('data-cat')));
        if (cats.length === 0) {
            cb.checked = true;
            return showError('Выберите хотя бы одну категорию');
        }
        settings.categories = cats;
        if (isHost) broadcastState();
        showError('');
    });
});

answerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled || answeredThisRound) return;
        if (!gameInProgress || !roundActive || !myAlive || isSpectator) return;
        const index = Number(btn.getAttribute('data-index'));
        if (isHost) {
            const me = getMe();
            if (!me || me.answered) return;
            submitAnswer(me, index);
        } else {
            guestAnswer(index);
        }
    });
});

document.addEventListener('keydown', e => {
    if (gameScreen.style.display === 'none') return;
    if (e.target && e.target.matches('input, textarea')) return;
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
    const idx = map[e.key.toLowerCase()];
    if (idx === undefined) return;
    const btn = answerBtns[idx];
    if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
    }
});

playerNameInput.value = storageGet('cg_name') || '';

const savedTheme = storageGet('cg_theme');
if (ALLOWED_THEMES.includes(savedTheme)) {
    settings.theme = savedTheme;
}

const initialRoom = normalizeRoomCode(new URLSearchParams(location.search).get('room') || '');
if (initialRoom) roomCodeInput.value = initialRoom;

applySettings(settings);
updateRoomUI();
showScreen('lobby');
renderPlayers([]);
updateHostUI([]);
loadQuestions();

if (initialRoom) {
    if (playerNameInput.value) {
        setTimeout(() => joinRoom(), 300);
    } else {
        showError(`Введите имя, чтобы войти в комнату ${initialRoom}`);
        playerNameInput.focus();
    }
}

window.addEventListener('beforeunload', () => {
    if (!isHost) return;
    connections.forEach(conn => {
        if (conn.open) {
            try { conn.send({ t: 'roomClosed' }); } catch {}
        }
    });
});
