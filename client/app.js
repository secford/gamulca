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

const BOT_NAMES = [
    'Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis', 'Barbara', 'Ken',
    'Guido', 'Yukihiro', 'Brendan', 'Katherine', 'Edsger', 'Radia', 'James',
    'Anita', 'Tim', 'Sophie', 'Donald', 'Frances'
];

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
    theme: 'neon',
    bots: 3
};

let joined = false;
let myId = null;
let myName = '';
let hostId = null;
let isSpectator = false;
let myAlive = true;

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
let botTimers = [];

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
    hostTag.style.display = joined ? 'inline-flex' : 'none';
    setSettingsLocked(gameInProgress);

    if (!joined) {
        startBtn.style.display = 'none';
        hostNote.textContent = 'Войдите, чтобы играть';
        return;
    }

    startBtn.style.display = 'inline-flex';
    startBtn.disabled = gameInProgress || active.length < MIN_PLAYERS || questionsDB.length === 0;

    if (gameInProgress) {
        hostNote.textContent = 'Игра идёт…';
    } else if (questionsDB.length === 0) {
        hostNote.textContent = 'Загрузка вопросов…';
    } else if (active.length < MIN_PLAYERS) {
        hostNote.textContent = 'Добавьте хотя бы одного бота';
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
        if (p.isBot) tags.push('<span class="tag tag-small tag-bot">БОТ</span>');
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

function clearBotTimers() {
    botTimers.forEach(timer => clearTimeout(timer));
    botTimers = [];
}

function clearAllTimers() {
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
    if (nextRoundTimer) { clearTimeout(nextRoundTimer); nextRoundTimer = null; }
    if (startDelayTimer) { clearTimeout(startDelayTimer); startDelayTimer = null; }
    clearBotTimers();
}

function createLobbyPlayers() {
    const me = {
        id: 'me',
        name: myName,
        score: 0,
        streak: 0,
        alive: true,
        answered: false,
        roundPoints: 0,
        roundAnswer: null,
        roundCorrect: false,
        spectator: false,
        isBot: false,
        skill: 1
    };
    players = [me];
    addBots(settings.bots);
}

function addBots(count) {
    const used = new Set(players.map(p => p.name.toLowerCase()));
    const pool = shuffle(BOT_NAMES.slice());
    const total = Math.max(1, Math.min(11, Number(count) || 1));

    for (let i = 0; i < total; i++) {
        const base = pool[i % pool.length];
        let name = base;
        let suffix = 2;
        while (used.has(name.toLowerCase())) {
            name = `${base} ${suffix}`;
            suffix += 1;
        }
        used.add(name.toLowerCase());

        players.push({
            id: `bot-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            score: 0,
            streak: 0,
            alive: true,
            answered: false,
            roundPoints: 0,
            roundAnswer: null,
            roundCorrect: false,
            spectator: false,
            isBot: true,
            skill: 0.4 + Math.random() * 0.5
        });
    }
}

function rebuildBots() {
    const me = players.find(p => p.id === myId);
    players = me ? [me] : [];
    addBots(settings.bots);
}

function joinGame() {
    if (joined) return;
    const name = sanitizeName(playerNameInput.value);
    if (!name) return showError('Введите имя');

    myName = name;
    myId = 'me';
    hostId = 'me';
    joined = true;
    storageSet('cg_name', myName);

    joinBtn.disabled = true;
    playerNameInput.disabled = true;
    showError('');

    createLobbyPlayers();
    handlePlayers(players);
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
    if (!joined) return showError('Введите имя');
    if (gameInProgress) return;
    if (questionsDB.length === 0) return showError('Вопросы ещё загружаются…');

    const active = getActivePlayers();
    if (active.length < MIN_PLAYERS) return showError(`Нужно минимум ${MIN_PLAYERS} игрока`);

    resetPlayersForNewGame();
    currentMode = MODES[settings.mode] || MODES.classic;
    gameMode = currentMode.id;
    gameStarted = true;
    gameInProgress = true;
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

    questionNumEl.textContent = currentIndex + 1;
    totalQuestionsEl.textContent = questionsQueue.length;
    catPill.textContent = CAT_LABELS[currentQuestion.cat] || 'РАЗНОЕ';
    diffPill.textContent = DIFF_LABELS[currentQuestion.diff] || 'СРЕДНИЙ';
    modePill.textContent = MODE_LABELS[currentMode.id] || 'КЛАССИКА';

    if (currentMode.survival) {
        alivePill.style.display = 'inline-flex';
        alivePill.textContent = `ЖИВЫХ: ${getAlivePlayers().length}`;
    } else {
        alivePill.style.display = 'none';
    }

    codeBlock.textContent = currentQuestion.code;
    answerBtns.forEach((btn, idx) => {
        const textEl = document.getElementById('option' + idx);
        const hasOption = idx < currentQuestion.options.length;
        btn.style.display = hasOption ? '' : 'none';
        btn.disabled = !hasOption;
        if (textEl) textEl.textContent = hasOption ? currentQuestion.options[idx] : '';
    });

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
    scheduleBots(seconds);

    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = setTimeout(endRound, seconds * 1000);
}

function botCorrectChance(bot) {
    let chance = bot.skill;
    if (currentQuestion.diff === 'easy') chance += 0.12;
    else if (currentQuestion.diff === 'hard') chance -= 0.15;
    if (currentMode.id === 'blitz') chance -= 0.05;
    if (currentMode.id === 'survival') chance -= 0.03;
    return Math.max(0.15, Math.min(0.95, chance));
}

function scheduleBots(seconds) {
    clearBotTimers();
    const aliveBots = getActivePlayers().filter(p => p.isBot && p.alive);

    aliveBots.forEach(bot => {
        const timeLimitMs = seconds * 1000;
        const maxDelay = Math.max(1500, timeLimitMs - 700);
        const factor = 1.15 - bot.skill * 0.5;
        const delay = Math.min(maxDelay, Math.max(900, 900 + Math.random() * Math.max(0, maxDelay - 900) * factor));

        const timer = setTimeout(() => {
            if (!roundActive || !gameStarted || bot.answered || !bot.alive || !currentQuestion) return;

            let index;
            if (Math.random() < botCorrectChance(bot)) {
                index = currentQuestion.correct;
            } else {
                const wrong = [];
                for (let i = 0; i < currentQuestion.options.length; i++) {
                    if (i !== currentQuestion.correct) wrong.push(i);
                }
                index = wrong[Math.floor(Math.random() * wrong.length)];
            }

            submitAnswer(bot, index);
        }, delay);

        botTimers.push(timer);
    });
}

function submitAnswer(player, index) {
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
    }

    handlePlayers(players);
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
    questionsPlayed += 1;
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
    clearBotTimers();

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

    if (roundRevealTimer) clearTimeout(roundRevealTimer);
    roundRevealTimer = setTimeout(() => {
        roundRevealTimer = null;
        if (gameInProgress) showScreen('roundEnd');
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
    if (!gameStarted) return;

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
    setSettingsLocked(false);
    answerToast.style.display = 'none';
}

function backToLobby() {
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
    showScreen('lobby');
    handlePlayers(players);
    setSettingsLocked(false);
}

function rematch() {
    if (gameInProgress) return;
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
            settings.categories = allowedCats.slice();
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

joinBtn.addEventListener('click', joinGame);

playerNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinBtn.click();
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', backToLobby);
rematchBtn.addEventListener('click', rematch);

document.querySelectorAll('.seg').forEach(group => {
    group.addEventListener('click', e => {
        const target = e.target.closest('.seg-item');
        if (!target || target.disabled) return;
        if (gameInProgress) return showError('Настройки недоступны во время игры');

        const key = group.getAttribute('data-setting');
        const raw = target.getAttribute('data-value');
        let value = raw;

        if (key === 'roundTime' || key === 'bots') {
            value = Number(raw);
        }
        if (key === 'mode' && !MODES[value]) return;
        if (key === 'difficulty' && !ALLOWED_DIFFS.includes(value)) return;
        if (key === 'theme' && !ALLOWED_THEMES.includes(value)) return;
        if (key === 'bots') value = Math.max(1, Math.min(11, value));

        group.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
        target.classList.add('active');

        if (key === 'bots') {
            settings.bots = value;
            if (joined) {
                rebuildBots();
                handlePlayers(players);
            }
        } else {
            settings[key] = value;
            if (key === 'theme') {
                document.documentElement.dataset.theme = value;
                storageSet('cg_theme', value);
            }
            if (key === 'mode') {
                gameMode = value;
                modeDesc.textContent = MODE_DESC[value] || '';
            }
        }

        showError('');
    });
});

document.querySelectorAll('.checks input').forEach(cb => {
    cb.addEventListener('change', () => {
        if (gameInProgress) {
            cb.checked = !cb.checked;
            return showError('Настройки недоступны во время игры');
        }

        const cats = [];
        document.querySelectorAll('.checks input:checked').forEach(c => cats.push(c.getAttribute('data-cat')));
        if (cats.length === 0) {
            cb.checked = true;
            return showError('Выберите хотя бы одну категорию');
        }
        settings.categories = cats;
        showError('');
    });
});

answerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled || answeredThisRound) return;
        if (!gameInProgress || !roundActive || !myAlive || isSpectator) return;
        const me = getMe();
        if (!me || me.answered) return;
        submitAnswer(me, Number(btn.getAttribute('data-index')));
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

serverAddr.textContent = 'GitHub Pages • без сервера';
playerNameInput.value = storageGet('cg_name') || '';

const savedTheme = storageGet('cg_theme');
if (ALLOWED_THEMES.includes(savedTheme)) {
    settings.theme = savedTheme;
}

applySettings(settings);
showScreen('lobby');
renderPlayers([]);
updateHostUI([]);
loadQuestions();
