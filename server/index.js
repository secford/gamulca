const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.static(path.join(__dirname, '../static')));
app.use(express.static(path.join(__dirname, '../client')));

app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

const rawQuestions = require('./questions.json');

const questionsDB = rawQuestions.map((q, index) => {
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
  if (!valid) {
    throw new Error(`Некорректный вопрос #${index + 1} в questions.json`);
  }
  return {
    cat: String(q.cat || 'langs'),
    diff: ['easy', 'medium', 'hard'].includes(q.diff) ? q.diff : 'medium',
    code: q.code,
    options: q.options.slice(),
    answer: q.answer,
    explain: q.explain.trim()
  };
});

const ALLOWED_CATS = [...new Set(questionsDB.map(q => q.cat))];
const ALLOWED_DIFFS = ['easy', 'medium', 'hard'];
const ALLOWED_THEMES = ['neon', 'cyber', 'matrix', 'vapor'];
const DIFF_POINTS = { easy: 7, medium: 10, hard: 15 };
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const ROUND_REVEAL_MS = 2500;
const START_DELAY_MS = 900;

const MODES = {
  classic: { id: 'classic', label: 'КЛАССИКА', questions: 15, maxTime: 30, multiplier: 1, survival: false },
  blitz: { id: 'blitz', label: 'БЛИЦ', questions: 10, maxTime: 10, multiplier: 1.5, survival: false },
  survival: { id: 'survival', label: 'ВЫЖИВАНИЕ', questions: 30, maxTime: 30, multiplier: 1, survival: true }
};

let players = {};
let hostId = null;
let gameStarted = false;
let roundActive = false;
let questionsQueue = [];
let currentQuestion = null;
let currentIndex = 0;
let currentMode = MODES.classic;

let questionTimer = null;
let nextRoundTimer = null;
let startDelayTimer = null;

let roundDeadline = 0;

let gameSettings = {
  mode: 'classic',
  difficulty: 'medium',
  roundTime: 15,
  categories: ALLOWED_CATS.slice(),
  theme: 'neon'
};

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

function activePlayers() {
  return Object.values(players).filter(p => !p.spectator);
}

function alivePlayers() {
  return activePlayers().filter(p => p.alive);
}

function publicPlayers() {
  return Object.values(players).map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    streak: p.streak,
    alive: p.alive,
    answered: p.answered,
    spectator: p.spectator,
    roundPoints: roundActive ? 0 : p.roundPoints,
    roundAnswer: roundActive ? null : p.roundAnswer
  }));
}

function playersPayload() {
  return {
    players: publicPlayers(),
    hostId,
    settings: { ...gameSettings, categories: gameSettings.categories.slice() }
  };
}

function ensureHost() {
  if (hostId && players[hostId] && !players[hostId].spectator) return;
  const next = activePlayers()[0];
  hostId = next ? next.id : null;
}

function clearGameTimers() {
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
  if (nextRoundTimer) { clearTimeout(nextRoundTimer); nextRoundTimer = null; }
  if (startDelayTimer) { clearTimeout(startDelayTimer); startDelayTimer = null; }
}

function resetGameState() {
  gameStarted = false;
  roundActive = false;
  clearGameTimers();
  currentQuestion = null;
  currentIndex = 0;
  questionsQueue = [];
}

function resetRoundFields() {
  Object.values(players).forEach(p => {
    p.answered = false;
    p.roundPoints = 0;
    p.roundAnswer = null;
    p.roundCorrect = false;
  });
}

function getRoundSeconds() {
  const base = gameSettings.roundTime;
  return Math.max(5, Math.min(base, currentMode.maxTime));
}

function difficultyMatches(diff, setting) {
  if (setting === 'easy') return diff === 'easy';
  if (setting === 'hard') return diff === 'hard' || diff === 'medium';
  return diff === 'easy' || diff === 'medium';
}

function buildQueue() {
  const cats = gameSettings.categories;
  let pool = questionsDB.filter(q => cats.includes(q.cat));
  let filtered = pool.filter(q => difficultyMatches(q.diff, gameSettings.difficulty));

  if (filtered.length < 3) filtered = pool;
  if (filtered.length === 0) filtered = questionsDB;

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

function startRound() {
  if (!gameStarted) return;
  if (currentIndex >= questionsQueue.length) return endGame();

  roundActive = true;
  activePlayers().forEach(p => {
    p.answered = false;
    p.roundPoints = 0;
    p.roundAnswer = null;
    p.roundCorrect = false;
  });

  currentQuestion = questionsQueue[currentIndex];
  const seconds = getRoundSeconds();
  currentQuestion.timeLimit = seconds;
  roundDeadline = Date.now() + seconds * 1000;

  io.emit('newQuestion', {
    code: currentQuestion.code,
    options: currentQuestion.options,
    timeLeft: seconds,
    endsAt: roundDeadline,
    serverNow: Date.now(),
    questionNum: currentIndex + 1,
    totalQuestions: questionsQueue.length,
    mode: currentMode.id,
    difficulty: currentQuestion.diff,
    category: currentQuestion.cat,
    aliveCount: currentMode.survival ? alivePlayers().length : null
  });
  io.emit('playersUpdate', playersPayload());

  if (questionTimer) clearTimeout(questionTimer);
  questionTimer = setTimeout(endRound, seconds * 1000);
}

function checkRoundEnd() {
  if (!roundActive) return;
  const contenders = activePlayers().filter(p => p.alive);
  if (currentMode.survival && contenders.length <= 1) return endRound();
  if (contenders.length > 0 && contenders.every(p => p.answered)) endRound();
}

function endRound() {
  if (!roundActive || !currentQuestion) return;
  roundActive = false;
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }

  const aliveBefore = new Set(alivePlayers().map(p => p.id));

  activePlayers().forEach(p => {
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
    ? [...aliveBefore].filter(id => players[id] && !players[id].alive)
    : [];

  io.emit('roundEnd', {
    correctAnswer: currentQuestion.correct,
    correctOption: currentQuestion.options[currentQuestion.correct],
    explain: currentQuestion.explain,
    players: publicPlayers(),
    mode: currentMode.id,
    eliminated,
    aliveCount: currentMode.survival ? alivePlayers().length : null,
    questionNum: currentIndex + 1,
    totalQuestions: questionsQueue.length
  });
  io.emit('playersUpdate', playersPayload());

  if (nextRoundTimer) clearTimeout(nextRoundTimer);
  nextRoundTimer = setTimeout(() => {
    if (!gameStarted) return;
    if (currentMode.survival && alivePlayers().length <= 1) return endGame();
    currentIndex += 1;
    startRound();
  }, ROUND_REVEAL_MS);
}

function endGame() {
  const mode = currentMode;
  const alive = alivePlayers();
  const ranked = activePlayers().sort((a, b) => {
    if (mode.survival && a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.score - a.score;
  });
  const winner = mode.survival ? (alive[0] || ranked[0] || null) : (ranked[0] || null);
  const winnerId = winner ? winner.id : null;
  const totalQuestions = questionsQueue.length;

  resetGameState();

  Object.values(players).forEach(p => {
    p.spectator = false;
    p.answered = false;
    p.roundPoints = 0;
    p.roundAnswer = null;
    p.roundCorrect = false;
  });

  io.emit('gameOver', {
    players: publicPlayers(),
    mode: mode.id,
    winnerId,
    totalQuestions
  });
  io.emit('playersUpdate', playersPayload());
}

function doStartGame() {
  if (gameStarted) return false;
  if (activePlayers().length < MIN_PLAYERS) return false;

  Object.values(players).forEach(p => {
    p.spectator = false;
    p.score = 0;
    p.streak = 0;
    p.alive = true;
    p.answered = false;
    p.roundPoints = 0;
    p.roundAnswer = null;
    p.roundCorrect = false;
  });

  currentMode = MODES[gameSettings.mode] || MODES.classic;
  gameStarted = true;
  currentIndex = 0;
  buildQueue();

  if (!questionsQueue.length) {
    gameStarted = false;
    return false;
  }

  io.emit('playersUpdate', playersPayload());
  io.emit('gameStarting', {
    mode: currentMode.id,
    modeLabel: currentMode.label,
    totalQuestions: questionsQueue.length
  });

  if (startDelayTimer) clearTimeout(startDelayTimer);
  startDelayTimer = setTimeout(() => {
    startDelayTimer = null;
    startRound();
  }, START_DELAY_MS);
  return true;
}

io.on('connection', (socket) => {
  socket.on('join', (name, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const clean = sanitizeName(name);

    if (!clean) return reply({ ok: false, error: 'Введите имя' });

    if (players[socket.id]) {
      return reply({ ok: true, spectator: players[socket.id].spectator });
    }

    const activeCount = activePlayers().length;
    if (!gameStarted && activeCount >= MAX_PLAYERS) {
      return reply({ ok: false, error: `Максимум ${MAX_PLAYERS} игроков` });
    }

    const spectator = gameStarted;
    players[socket.id] = {
      id: socket.id,
      name: clean,
      score: 0,
      streak: 0,
      alive: !spectator,
      answered: false,
      roundPoints: 0,
      roundAnswer: null,
      roundCorrect: false,
      spectator
    };

    ensureHost();

    socket.emit('joined', {
      id: socket.id,
      spectator,
      hostId,
      settings: { ...gameSettings, categories: gameSettings.categories.slice() },
      players: publicPlayers()
    });
    io.emit('playersUpdate', playersPayload());

    reply({ ok: true, spectator, hostId });
  });

  socket.on('updateSettings', (raw) => {
    if (socket.id !== hostId || gameStarted || !raw || typeof raw !== 'object') return;
    let changed = false;

    if (MODES[raw.mode]) {
      gameSettings.mode = raw.mode;
      changed = true;
    }
    if (ALLOWED_DIFFS.includes(raw.difficulty)) {
      gameSettings.difficulty = raw.difficulty;
      changed = true;
    }
    if (raw.roundTime !== undefined) {
      const time = parseInt(raw.roundTime, 10);
      if (Number.isFinite(time) && time >= 5 && time <= 60) {
        gameSettings.roundTime = time;
        changed = true;
      }
    }
    if (Array.isArray(raw.categories)) {
      const cats = [...new Set(raw.categories.filter(c => ALLOWED_CATS.includes(c)))];
      if (cats.length > 0) {
        gameSettings.categories = cats;
        changed = true;
      }
    }
    if (ALLOWED_THEMES.includes(raw.theme)) {
      gameSettings.theme = raw.theme;
      changed = true;
    }

    if (changed) io.emit('settingsUpdated', { ...gameSettings, categories: gameSettings.categories.slice() });
  });

  socket.on('startGame', () => {
    if (socket.id !== hostId) return socket.emit('gameError', 'Игру запускает хост');
    if (gameStarted) return;
    if (activePlayers().length < MIN_PLAYERS) {
      return socket.emit('gameError', `Нужно минимум ${MIN_PLAYERS} игрока`);
    }
    doStartGame();
  });

  socket.on('answer', (optionIndex) => {
    const player = players[socket.id];
    if (!roundActive || !player || player.spectator || !player.alive || player.answered || !currentQuestion) return;

    const index = Number(optionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= currentQuestion.options.length) return;

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

    socket.emit('answerResult', {
      correct: player.roundCorrect,
      points,
      streak: player.roundCorrect ? player.streak + 1 : 0,
      alive: player.roundCorrect ? player.alive : (currentMode.survival ? false : true)
    });

    io.emit('playersUpdate', playersPayload());
    checkRoundEnd();
  });

  socket.on('backToLobby', () => {
    if (gameStarted) return;
    resetRoundFields();
    Object.values(players).forEach(p => { p.spectator = false; p.alive = true; });
    ensureHost();
    io.emit('backToLobby', playersPayload());
  });

  socket.on('rematch', () => {
    if (socket.id !== hostId || gameStarted) return;
    resetRoundFields();
    Object.values(players).forEach(p => { p.spectator = false; p.alive = true; });
    ensureHost();
    io.emit('backToLobby', playersPayload());

    if (startDelayTimer) clearTimeout(startDelayTimer);
    startDelayTimer = setTimeout(() => {
      startDelayTimer = null;
      if (!gameStarted && !doStartGame()) {
        socket.emit('gameError', `Нужно минимум ${MIN_PLAYERS} игрока`);
      }
    }, 700);
  });

  socket.on('disconnect', () => {
    const wasHost = hostId === socket.id;
    delete players[socket.id];
    if (wasHost) hostId = null;
    ensureHost();

    if (gameStarted && activePlayers().length === 0) {
      resetGameState();
      Object.values(players).forEach(p => {
        p.spectator = false;
        p.alive = true;
      });
      ensureHost();
    } else if (gameStarted && currentMode.survival && activePlayers().length <= 1) {
      endGame();
    }

    io.emit('playersUpdate', playersPayload());
  });
});

server.listen(PORT, HOST, () => {
  console.log(`CodeGuess запущен: http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') console.log('Сервер слушает все интерфейсы (0.0.0.0)');
});

function shutdown() {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
