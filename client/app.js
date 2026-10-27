const socket = io();

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

const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const roundEndScreen = document.getElementById('roundEndScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const playerNameInput = document.getElementById('playerName');
const joinBtn = document.getElementById('joinBtn');
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
const connectionBanner = document.getElementById('connectionBanner');
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

let myId = null;
let myName = '';
let hostId = null;
let isHost = false;
let isSpectator = false;
let myAlive = true;
let joined = false;
let gameInProgress = false;
let revealRound = false;
let answeredThisRound = false;
let currentSettings = null;
let gameMode = 'classic';
let clockOffset = 0;
let roundDeadline = 0;
let timerMax = 15;
let timerInt = null;
let roundRevealTimer = null;
let toastTimer = null;
let errorTimer = null;

serverAddr.textContent = window.location.host || 'localhost:8080';
playerNameInput.value = localStorage.getItem('cg_name') || '';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
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

function applySettings(settings) {
    if (!settings) return;
    currentSettings = { ...settings };
    const theme = settings.theme || 'neon';
    document.documentElement.dataset.theme = theme;
    gameMode = settings.mode || gameMode;

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

function updateHostUI(players) {
    isHost = Boolean(joined && myId && hostId === myId);
    hostTag.style.display = isHost ? 'inline-flex' : 'none';

    const active = players.filter(p => !p.spectator);
    const host = players.find(p => p.id === hostId);

    setSettingsLocked(!isHost || gameInProgress || !joined);

    if (!joined) {
        startBtn.style.display = 'none';
        hostNote.textContent = 'Войдите, чтобы играть';
        return;
    }

    if (isHost) {
        startBtn.style.display = 'inline-flex';
        startBtn.disabled = gameInProgress || active.length < 2;
        hostNote.textContent = gameInProgress
            ? 'Игра уже началась'
            : active.length < 2
                ? 'Нужно минимум 2 игрока'
                : 'Вы хост — можно начинать';
    } else {
        startBtn.style.display = 'none';
        hostNote.textContent = isSpectator
            ? 'Игра идёт — вы наблюдаете'
            : `Игру запускает хост: ${host ? host.name : '—'}`;
    }
}

function updateLiveState(players) {
    const me = players.find(p => p.id === myId);
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

function renderPlayers(players) {
    const active = players.filter(p => !p.spectator);
    playersCount.textContent = active.length;
    playersList.innerHTML = '';

    if (players.length === 0) {
        playersList.innerHTML = '<p class="hint">Ждём игроков…</p>';
        return;
    }

    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        if (p.id === myId) item.classList.add('me');
        if (p.spectator) item.classList.add('spectator');

        const initial = escapeHtml((p.name.trim().charAt(0) || '?').toUpperCase());
        const tags = [];
        if (p.id === hostId) tags.push('<span class="tag tag-host">ХОСТ</span>');
        if (p.spectator) tags.push('<span class="tag tag-small">НАБЛЮДАЕТ</span>');
        if (p.id === myId) tags.push('<span class="tag tag-small">ВЫ</span>');

        item.innerHTML = `
            <div class="avatar">${initial}</div>
            <div class="name">${escapeHtml(p.name)}</div>
            ${tags.join('')}
        `;
        playersList.appendChild(item);
    });
}

function renderBoard(players) {
    gamePlayersList.innerHTML = '';
    const sorted = players
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

function handlePlayers(players) {
    const list = Array.isArray(players) ? players : [];
    const me = list.find(p => p.id === myId);
    if (me) {
        myAlive = me.alive;
        isSpectator = me.spectator;
    }
    renderPlayers(list);
    renderBoard(list);
    updateHostUI(list);
    updateLiveState(list);
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
        const now = Date.now() - clockOffset;
        const left = Math.max(0, (roundDeadline - now) / 1000);
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

joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) return showError('Введите имя');
    myName = name;
    localStorage.setItem('cg_name', name);
    socket.timeout(5000).emit('join', name, (err, res) => {
        if (err) return showError('Сервер не отвечает');
        if (!res || !res.ok) return showError((res && res.error) || 'Не удалось войти');
        joined = true;
        joinBtn.disabled = true;
        playerNameInput.disabled = true;
        showError('');
    });
});

playerNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinBtn.click();
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    socket.emit('startGame');
});

restartBtn.addEventListener('click', () => {
    socket.emit('backToLobby');
});

rematchBtn.addEventListener('click', () => {
    socket.emit('rematch');
});

document.querySelectorAll('.seg').forEach(group => {
    group.addEventListener('click', e => {
        const target = e.target.closest('.seg-item');
        if (!target || target.disabled) return;
        if (!isHost || gameInProgress) {
            return showError('Настройки меняет только хост');
        }
        group.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        const setting = group.getAttribute('data-setting');
        const value = target.getAttribute('data-value');
        socket.emit('updateSettings', { [setting]: value });
    });
});

document.querySelectorAll('.checks input').forEach(cb => {
    cb.addEventListener('change', () => {
        if (!isHost || gameInProgress) {
            cb.checked = !cb.checked;
            return showError('Настройки меняет только хост');
        }
        const cats = [];
        document.querySelectorAll('.checks input:checked').forEach(c => cats.push(c.getAttribute('data-cat')));
        if (cats.length === 0) {
            cb.checked = true;
            return showError('Выберите хотя бы одну категорию');
        }
        socket.emit('updateSettings', { categories: cats });
    });
});

answerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled || answeredThisRound) return;
        if (!gameInProgress || isSpectator || !myAlive) return;
        answeredThisRound = true;
        socket.emit('answer', Number(btn.getAttribute('data-index')));
        answerBtns.forEach(b => { b.disabled = true; });
        btn.classList.add('selected');
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

socket.on('connect', () => {
    connectionBanner.style.display = 'none';
    if (joined && myName) {
        socket.timeout(5000).emit('join', myName, (err, res) => {
            if (err || !res || !res.ok) {
                joined = false;
                joinBtn.disabled = false;
                playerNameInput.disabled = false;
                showError((res && res.error) || 'Не удалось переподключиться');
            }
        });
    }
});

socket.on('disconnect', () => {
    connectionBanner.style.display = 'block';
    stopTimer();
});

socket.on('joined', data => {
    myId = data.id;
    hostId = data.hostId;
    isSpectator = Boolean(data.spectator);
    myAlive = !isSpectator;
    joined = true;
    joinBtn.disabled = true;
    playerNameInput.disabled = true;
    showError('');
    applySettings(data.settings);
    handlePlayers(data.players || []);
    if (isSpectator) hostNote.textContent = 'Игра идёт — вы наблюдаете';
});

socket.on('playersUpdate', data => {
    const payload = Array.isArray(data) ? { players: data } : (data || {});
    if (payload.hostId !== undefined) hostId = payload.hostId;
    if (payload.settings) applySettings(payload.settings);
    handlePlayers(payload.players || []);
});

socket.on('settingsUpdated', settings => {
    applySettings(settings);
    showError('');
});

socket.on('gameStarting', data => {
    gameInProgress = true;
    gameMode = data.mode || gameMode;
    revealRound = false;
    startBtn.disabled = true;
    hostNote.textContent = 'Игра начинается…';
    setSettingsLocked(true);
});

socket.on('newQuestion', data => {
    gameInProgress = true;
    revealRound = false;
    answeredThisRound = false;
    gameMode = data.mode || gameMode;
    if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }

    showScreen('game');
    resetAnswerButtons();
    answerToast.style.display = 'none';
    explainBox.style.display = 'none';

    questionNumEl.textContent = data.questionNum;
    totalQuestionsEl.textContent = data.totalQuestions;
    catPill.textContent = CAT_LABELS[data.category] || 'РАЗНОЕ';
    diffPill.textContent = DIFF_LABELS[data.difficulty] || 'СРЕДНИЙ';
    modePill.textContent = MODE_LABELS[data.mode] || 'КЛАССИКА';

    if (data.mode === 'survival' && data.aliveCount !== null && data.aliveCount !== undefined) {
        alivePill.style.display = 'inline-flex';
        alivePill.textContent = `ЖИВЫХ: ${data.aliveCount}`;
    } else {
        alivePill.style.display = 'none';
    }

    codeBlock.textContent = data.code;
    answerBtns.forEach((btn, idx) => {
        const textEl = document.getElementById('option' + idx);
        const hasOption = idx < data.options.length;
        btn.style.display = hasOption ? '' : 'none';
        if (textEl) textEl.textContent = hasOption ? data.options[idx] : '';
    });

    setStatusBanner('');
    if (isSpectator) {
        setStatusBanner('Режим наблюдателя — ответы недоступны');
        answerBtns.forEach(b => { b.disabled = true; });
    } else if (!myAlive) {
        setStatusBanner('Вы выбыли — наблюдаете за игрой');
        answerBtns.forEach(b => { b.disabled = true; });
    }

    timerMax = data.timeLeft;
    clockOffset = Date.now() - Number(data.serverNow || Date.now());
    roundDeadline = Number(data.endsAt || (Date.now() + data.timeLeft * 1000));
    timerEl.textContent = data.timeLeft;
    startTimer(data.timeLeft);
    setSettingsLocked(true);
});

socket.on('answerResult', data => {
    if (data.correct) {
        const streak = data.streak > 1 ? ` · серия ×${data.streak}` : '';
        showToast(`+${data.points}${streak}`, 'ok');
    } else {
        const dead = data.alive === false ? ' — вы выбыли' : '';
        showToast(`Неверно${dead}`, 'bad');
    }
});

socket.on('roundEnd', data => {
    stopTimer();
    revealRound = true;
    answeredThisRound = true;

    answerBtns.forEach((b, idx) => {
        b.disabled = true;
        if (idx === data.correctAnswer) b.classList.add('correct');
        else if (b.classList.contains('selected')) b.classList.add('incorrect');
    });

    correctAnswerText.textContent = data.correctOption;
    gameMode = data.mode || gameMode;

    const me = (data.players || []).find(p => p.id === myId);
    let resultText = 'Время вышло';
    let resultClass = 'neutral';

    if (isSpectator) {
        resultText = 'Режим наблюдателя';
    } else if (data.mode === 'survival' && (data.eliminated || []).includes(myId)) {
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

    renderBreakdown(data.players || []);

    explainText.textContent = data.explain || '';
    explainBox.style.display = data.explain ? 'block' : 'none';

    if (roundRevealTimer) clearTimeout(roundRevealTimer);
    roundRevealTimer = setTimeout(() => {
        roundRevealTimer = null;
        if (gameInProgress) showScreen('roundEnd');
    }, 800);
});

socket.on('gameOver', data => {
    gameInProgress = false;
    revealRound = false;
    stopTimer();
    answerToast.style.display = 'none';
    if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }

    gameMode = data.mode || gameMode;
    showScreen('gameOver');

    const players = data.players || [];
    const sorted = [...players]
        .filter(p => !p.spectator)
        .sort((a, b) => {
            if (gameMode === 'survival' && a.alive !== b.alive) return a.alive ? -1 : 1;
            return b.score - a.score;
        });
    const winner = sorted.find(p => p.id === data.winnerId) || sorted[0];
    const modeLabel = MODE_LABELS[data.mode] || 'КЛАССИКА';
    gameOverSub.textContent = winner
        ? `${modeLabel} • ${data.totalQuestions} вопросов • Победитель: ${winner.name}`
        : `${modeLabel} • результатов нет`;

    renderPodium(sorted, data.winnerId);
    handlePlayers(players);
    rematchBtn.style.display = isHost ? 'inline-flex' : 'none';
    setSettingsLocked(false);
});

socket.on('backToLobby', data => {
    gameInProgress = false;
    revealRound = false;
    answeredThisRound = false;
    myAlive = true;
    stopTimer();
    answerToast.style.display = 'none';
    if (roundRevealTimer) { clearTimeout(roundRevealTimer); roundRevealTimer = null; }

    const payload = data || {};
    if (payload.hostId !== undefined) hostId = payload.hostId;
    if (payload.settings) applySettings(payload.settings);
    isSpectator = false;
    showScreen('lobby');
    handlePlayers(payload.players || []);
    setStatusBanner('');
    rematchBtn.style.display = 'none';
    if (isHost) startBtn.disabled = (payload.players || []).filter(p => !p.spectator).length < 2;
});

socket.on('gameError', message => {
    showError(message);
    if (isHost && !gameInProgress) startBtn.disabled = false;
});

function renderBreakdown(players) {
    roundBreakdown.innerHTML = '';
    const sorted = [...players]
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

function renderPodium(players, winnerId) {
    finalLeaderboard.innerHTML = '';
    players.slice(0, 3).forEach((p, idx) => {
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
