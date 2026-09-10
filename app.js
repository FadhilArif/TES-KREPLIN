(() => {
  'use strict';

  const CONFIG = Object.freeze({
    COLUMNS: 50,
    QUESTIONS_PER_COLUMN: 26,
    DIGITS_PER_COLUMN: 27,
    SECONDS_PER_COLUMN: 15,
    STORAGE_KEY: 'kraepelin_active_test_v2',
    STORAGE_VERSION: 2
  });

  const state = {
    columns: [],
    answers: [],
    columnIndex: 0,
    questionIndex: 0,
    columnStartedAt: 0,
    testStartedAt: 0,
    timerId: null,
    finished: false,
    restored: false
  };

  const $ = (id) => document.getElementById(id);
  const views = {
    landing: $('landingView'),
    instruction: $('instructionView'),
    test: $('testView'),
    result: $('resultView')
  };

  function showView(view) {
    Object.values(views).forEach((v) => v.classList.remove('active'));
    view.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function secureRandomInt(max) {
    if (window.crypto?.getRandomValues) {
      const limit = Math.floor(0x100000000 / max) * max;
      const buffer = new Uint32Array(1);
      do window.crypto.getRandomValues(buffer); while (buffer[0] >= limit);
      return buffer[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function randomDigit() {
    // Kraepelin uses single digits. 0–9 are allowed and every new test gets a new sequence.
    return secureRandomInt(10);
  }

  function createRandomColumn() {
    return Array.from({ length: CONFIG.DIGITS_PER_COLUMN }, randomDigit);
  }

  function buildTest() {
    state.columns = Array.from({ length: CONFIG.COLUMNS }, createRandomColumn);
    state.answers = Array.from({ length: CONFIG.COLUMNS }, () =>
      Array(CONFIG.QUESTIONS_PER_COLUMN).fill(null)
    );
    state.columnIndex = 0;
    state.questionIndex = 0;
    state.testStartedAt = Date.now();
    state.columnStartedAt = Date.now();
    state.finished = false;
    state.restored = false;
    persistTest();
  }

  // The app stores only an active test. Once the result screen is reached,
  // the active session is deleted so refreshing the result page cannot restore it.
  function persistTest() {
    if (state.finished || !state.columns.length) return;
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
        version: CONFIG.STORAGE_VERSION,
        columns: state.columns,
        answers: state.answers,
        columnIndex: state.columnIndex,
        questionIndex: state.questionIndex,
        columnStartedAt: state.columnStartedAt,
        testStartedAt: state.testStartedAt
      }));
    } catch (error) {
      // Private browsing/storage-disabled environments may throw. The test still runs.
      console.warn('Kraepelin: active test could not be persisted.', error);
    }
  }

  function clearPersistedTest() {
    try { localStorage.removeItem(CONFIG.STORAGE_KEY); } catch (_) {}
  }

  function readPersistedTest() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (
        saved?.version !== CONFIG.STORAGE_VERSION ||
        !Array.isArray(saved.columns) ||
        !Array.isArray(saved.answers) ||
        saved.columns.length !== CONFIG.COLUMNS ||
        saved.answers.length !== CONFIG.COLUMNS
      ) {
        clearPersistedTest();
        return null;
      }
      return saved;
    } catch (_) {
      clearPersistedTest();
      return null;
    }
  }

  function restoreTest(saved) {
    state.columns = saved.columns;
    state.answers = saved.answers;
    state.columnIndex = Math.max(0, Math.min(CONFIG.COLUMNS - 1, Number(saved.columnIndex) || 0));
    state.questionIndex = Math.max(0, Math.min(CONFIG.QUESTIONS_PER_COLUMN - 1, Number(saved.questionIndex) || 0));
    state.columnStartedAt = Number(saved.columnStartedAt) || Date.now();
    state.testStartedAt = Number(saved.testStartedAt) || Date.now();
    state.finished = false;
    state.restored = true;

    // If the browser was closed/refreshed for longer than the remaining column time,
    // catch up all elapsed 15-second intervals before showing the current question.
    catchUpElapsedColumns();
    persistTest();
    showView(views.test);
    renderQuestion();
    startTimer();
    showToast('Tes dilanjutkan. Progress kamu aman setelah refresh.', 'success');
  }

  function catchUpElapsedColumns() {
    let elapsed = Math.max(0, (Date.now() - state.columnStartedAt) / 1000);
    if (elapsed < CONFIG.SECONDS_PER_COLUMN) return;

    const columnsToAdvance = Math.floor(elapsed / CONFIG.SECONDS_PER_COLUMN);
    const remainingMs = (elapsed % CONFIG.SECONDS_PER_COLUMN) * 1000;
    const oldColumn = state.columnIndex;
    const newColumn = oldColumn + columnsToAdvance;

    if (newColumn >= CONFIG.COLUMNS) {
      state.columnIndex = CONFIG.COLUMNS - 1;
      state.questionIndex = CONFIG.QUESTIONS_PER_COLUMN - 1;
      state.columnStartedAt = Date.now() - Math.min(remainingMs, CONFIG.SECONDS_PER_COLUMN * 1000);
      finishTest();
      return;
    }

    state.columnIndex = newColumn;
    state.questionIndex = 0;
    state.columnStartedAt = Date.now() - remainingMs;
  }

  function getPair(columnIndex = state.columnIndex, questionIndex = state.questionIndex) {
    const digits = state.columns[columnIndex];
    const bottomIndex = CONFIG.DIGITS_PER_COLUMN - 1 - questionIndex;
    const topIndex = bottomIndex - 1;
    return { top: digits[topIndex], bottom: digits[bottomIndex] };
  }

  function correctAnswerFor(columnIndex, questionIndex) {
    const { top, bottom } = getPair(columnIndex, questionIndex);
    return (top + bottom) % 10;
  }

  function correctAnswer() {
    return correctAnswerFor(state.columnIndex, state.questionIndex);
  }

  function renderQuestion() {
    if (state.finished) return;
    const { top, bottom } = getPair();
    $('topNumber').textContent = top;
    $('bottomNumber').textContent = bottom;
    $('columnCounter').textContent = `${state.columnIndex + 1}/${CONFIG.COLUMNS}`;
    $('questionCounter').textContent = `${state.questionIndex + 1}/${CONFIG.QUESTIONS_PER_COLUMN}`;
    updateProgress();
    updateTimerText();
  }

  function updateProgress() {
    const completedColumns = state.columnIndex;
    const questionProgress = state.questionIndex / CONFIG.QUESTIONS_PER_COLUMN;
    const total = CONFIG.COLUMNS * CONFIG.QUESTIONS_PER_COLUMN;
    const completed = completedColumns * CONFIG.QUESTIONS_PER_COLUMN + questionProgress * CONFIG.QUESTIONS_PER_COLUMN;
    const percent = Math.min(100, Math.max(0, (completed / total) * 100));
    $('progressBar').style.width = `${percent.toFixed(2)}%`;
  }

  function updateTimerText() {
    const elapsed = Math.max(0, (Date.now() - state.columnStartedAt) / 1000);
    const remaining = Math.max(0, CONFIG.SECONDS_PER_COLUMN - elapsed);
    $('timeCounter').textContent = `${Math.ceil(remaining)}s`;
  }

  function pulseButton(digit) {
    const button = document.querySelector(`.digit-btn[data-digit="${digit}"]`);
    if (!button) return;
    button.classList.remove('active-pulse');
    void button.offsetWidth;
    button.classList.add('active-pulse');
    setTimeout(() => button.classList.remove('active-pulse'), 130);
  }

  function registerAnswer(value) {
    if (state.finished || !views.test.classList.contains('active')) return;
    if (state.answers[state.columnIndex][state.questionIndex] !== null) return;

    const numericValue = Number(value);
    state.answers[state.columnIndex][state.questionIndex] = numericValue;
    pulseButton(numericValue);
    persistTest();

    if (state.questionIndex < CONFIG.QUESTIONS_PER_COLUMN - 1) {
      state.questionIndex += 1;
      renderQuestion();
      persistTest();
    } else {
      nextColumn('completed');
    }
  }

  function nextColumn(reason = 'timer') {
    if (state.columnIndex >= CONFIG.COLUMNS - 1) {
      finishTest();
      return;
    }
    state.columnIndex += 1;
    state.questionIndex = 0;
    state.columnStartedAt = Date.now();
    renderQuestion();
    persistTest();

    if (reason === 'timer') {
      showToast('Waktu habis — pindah ke kolom berikutnya.', 'info', 1200);
    }
  }

  function tick() {
    if (state.finished || !views.test.classList.contains('active')) return;

    const elapsed = Math.max(0, (Date.now() - state.columnStartedAt) / 1000);
    const remaining = Math.max(0, CONFIG.SECONDS_PER_COLUMN - elapsed);
    $('timeCounter').textContent = `${Math.ceil(remaining)}s`;

    // Progress includes the current column's time, so it feels like the real timed test.
    const timeFraction = Math.min(1, elapsed / CONFIG.SECONDS_PER_COLUMN);
    const questionFraction = state.questionIndex / CONFIG.QUESTIONS_PER_COLUMN;
    const completed = state.columnIndex + Math.min(0.999, (questionFraction + timeFraction / CONFIG.QUESTIONS_PER_COLUMN));
    $('progressBar').style.width = `${Math.min(100, (completed / CONFIG.COLUMNS) * 100).toFixed(2)}%`;

    if (elapsed >= CONFIG.SECONDS_PER_COLUMN) {
      nextColumn('timer');
    }
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = setInterval(tick, 50);
    tick();
  }

  function startTest() {
    clearPersistedTest();
    buildTest();
    showView(views.test);
    renderQuestion();
    startTimer();
  }

  function level(score) {
    if (score >= 90) return 'Sangat baik';
    if (score >= 80) return 'Baik';
    if (score >= 65) return 'Cukup';
    if (score >= 50) return 'Perlu latihan';
    return 'Perlu ditingkatkan';
  }

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  function standardDeviation(values, mean) {
    if (!values.length) return 0;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  function calculateResults() {
    const counts = state.answers.map((col) => col.filter((v) => v !== null).length);
    let answered = 0;
    let correct = 0;

    state.answers.forEach((col, c) => {
      col.forEach((answer, q) => {
        if (answer === null) return;
        answered += 1;
        if (answer === correctAnswerFor(c, q)) correct += 1;
      });
    });

    const wrong = answered - correct;
    const totalItems = CONFIG.COLUMNS * CONFIG.QUESTIONS_PER_COLUMN;
    const avg = counts.reduce((sum, value) => sum + value, 0) / CONFIG.COLUMNS;

    // IMPORTANT: these are transparent PRACTICE metrics, not official psychological norms.
    // Speed: productivity against the 1,300 available items.
    const speed = Math.round(clamp((answered / totalItems) * 100));

    // Accuracy: correct responses among answered items.
    const accuracy = answered ? Math.round(clamp((correct / answered) * 100)) : 0;

    // Consistency: penalize fluctuation in work volume using coefficient of variation.
    // This rewards a stable work rhythm without pretending to be an official norm table.
    const sd = standardDeviation(counts, avg);
    const cv = avg ? sd / avg : 1;
    const consistency = Math.round(clamp(100 - cv * 100));

    // Endurance: compare early, middle and late productivity. Large late declines are penalized.
    const first = counts.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const middle = counts.slice(20, 30).reduce((a, b) => a + b, 0) / 10;
    const last = counts.slice(40, 50).reduce((a, b) => a + b, 0) / 10;
    const baseline = Math.max(1, (first + middle) / 2);
    const lateDecline = Math.max(0, (baseline - last) / baseline);
    const endurance = Math.round(clamp(100 - lateDecline * 100));

    return {
      counts,
      answered,
      correct,
      wrong,
      avg,
      speed,
      accuracy,
      consistency,
      endurance,
      totalItems
    };
  }

  function finishTest() {
    if (state.finished) return;
    state.finished = true;
    clearInterval(state.timerId);
    state.timerId = null;
    clearPersistedTest();

    $('progressBar').style.width = '100%';
    const result = calculateResults();
    state.lastResult = result;
    renderResults(result);
    showView(views.result);
    requestAnimationFrame(() => drawChart(result.counts));
  }

  function renderResults(r) {
    const scores = [
      ['speedScore', r.speed, 'speedLevel'],
      ['accuracyScore', r.accuracy, 'accuracyLevel'],
      ['consistencyScore', r.consistency, 'consistencyLevel'],
      ['enduranceScore', r.endurance, 'enduranceLevel']
    ];

    scores.forEach(([scoreId, score, levelId]) => {
      $(scoreId).textContent = `${score}%`;
      $(levelId).textContent = level(score);
      const card = $(scoreId).closest('.score-card');
      card.style.setProperty('--score', `${score}%`);
    });

    $('answeredSummary').textContent = `${r.answered} / ${r.totalItems}`;
    $('correctSummary').textContent = r.correct;
    $('wrongSummary').textContent = r.wrong;
    $('avgSummary').textContent = r.avg.toFixed(1);
  }

  function drawChart(counts) {
    const canvas = $('performanceChart');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(300, Math.floor(rect.width || 900));
    const cssHeight = 300;
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = { l: 38, r: 16, t: 24, b: 40 };
    const w = cssWidth - pad.l - pad.r;
    const h = cssHeight - pad.t - pad.b;
    const max = CONFIG.QUESTIONS_PER_COLUMN;

    ctx.strokeStyle = '#e5ebf2';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#7a899c';
    ctx.font = '11px Inter, system-ui, sans-serif';

    for (let i = 0; i <= 5; i++) {
      const y = pad.t + h - (h * i / 5);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(max * i / 5)), 8, y + 4);
    }

    const points = counts.map((value, i) => ({
      x: pad.l + (i / (counts.length - 1)) * w,
      y: pad.t + h - (value / max) * h
    }));

    // Area fill makes the trend easier to read on a phone.
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.t + h);
    ctx.lineTo(points[0].x, pad.t + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(12, 105, 240, 0.08)';
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#0c69f0';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = '#0c69f0';
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#7a899c';
    ctx.font = '10px Inter, system-ui, sans-serif';
    [0, 9, 19, 29, 39, 49].forEach((idx) => {
      const x = pad.l + (idx / (counts.length - 1)) * w;
      const label = String(idx + 1);
      ctx.fillText(label, x - 4, cssHeight - 13);
    });
  }

  function drawSimplePdfChart(canvas, counts) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const p = { l: 40, r: 18, t: 18, b: 30 };
    const w = canvas.width - p.l - p.r;
    const h = canvas.height - p.t - p.b;
    const max = CONFIG.QUESTIONS_PER_COLUMN;

    ctx.strokeStyle = '#dfe6ee';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 5; i++) {
      const y = p.t + h - (h * i / 5);
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(p.l + w, y);
      ctx.stroke();
    }

    ctx.beginPath();
    counts.forEach((value, i) => {
      const x = p.l + (i / (counts.length - 1)) * w;
      const y = p.t + h - (value / max) * h;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = '#0c69f0';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  function downloadPdf() {
    const result = state.lastResult || calculateResults();
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      alert('Library PDF belum tersedia. Pastikan perangkat terhubung ke internet lalu coba lagi.');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const now = new Date();
    const dateText = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'short' }).format(now);

    doc.setTextColor(20, 34, 56);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Hasil Latihan Tes Kraepelin', 20, 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(95, 108, 125);
    doc.text('50 kolom • 26 soal/kolom • 15 detik/kolom', 20, 32);
    doc.text(dateText, 20, 38);

    const cards = [
      ['Kecepatan', result.speed],
      ['Ketelitian', result.accuracy],
      ['Konsistensi', result.consistency],
      ['Ketahanan', result.endurance]
    ];

    cards.forEach((card, i) => {
      const x = 20 + (i % 2) * 85;
      const y = 50 + Math.floor(i / 2) * 36;
      doc.setFillColor(245, 248, 252);
      doc.roundedRect(x, y, 78, 28, 4, 4, 'F');
      doc.setTextColor(80, 94, 112);
      doc.setFontSize(9);
      doc.text(card[0], x + 6, y + 9);
      doc.setTextColor(20, 34, 56);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(`${card[1]}%`, x + 6, y + 21);
      doc.setFont('helvetica', 'normal');
    });

    doc.setTextColor(20, 34, 56);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Ringkasan', 20, 131);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total dijawab   : ${result.answered}/${result.totalItems}`, 20, 139);
    doc.text(`Total benar     : ${result.correct}`, 20, 146);
    doc.text(`Total salah     : ${result.wrong}`, 20, 153);
    doc.text(`Rata-rata/kolom : ${result.avg.toFixed(1)} soal`, 20, 160);

    const chart = document.createElement('canvas');
    chart.width = 900;
    chart.height = 280;
    drawSimplePdfChart(chart, result.counts);
    doc.addImage(chart.toDataURL('image/png'), 'PNG', 20, 169, 170, 53);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 112, 128);
    const disclaimer = 'Catatan: skor pada aplikasi ini adalah skor latihan internal untuk membantu evaluasi kecepatan, ketelitian, konsistensi, dan ketahanan. Ini bukan norma resmi kelulusan psikotes dan bukan diagnosis psikologis.';
    const lines = doc.splitTextToSize(disclaimer, 170);
    doc.text(lines, 20, 232);

    doc.setTextColor(20, 34, 56);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Interpretasi latihan', 20, 250);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Kecepatan: ${level(result.speed)} • Ketelitian: ${level(result.accuracy)}`, 20, 257);
    doc.text(`Konsistensi: ${level(result.consistency)} • Ketahanan: ${level(result.endurance)}`, 20, 264);

    doc.save(`hasil-kraepelin-${now.toISOString().slice(0, 10)}.pdf`);
  }

  function showToast(message, type = 'info', duration = 2200) {
    const existing = document.querySelector('.toast');
    existing?.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  function initialize() {
    const saved = readPersistedTest();
    if (saved) {
      // The active test is intentionally restored automatically after a refresh.
      restoreTest(saved);
      return;
    }
    showView(views.landing);
  }

  $('startIntroBtn').addEventListener('click', () => showView(views.instruction));
  $('startTestBtn').addEventListener('click', startTest);
  $('downloadPdfBtn').addEventListener('click', downloadPdf);
  $('finishBtn').addEventListener('click', () => {
    clearPersistedTest();
    location.reload();
  });

  document.querySelectorAll('.digit-btn').forEach((button) => {
    button.addEventListener('click', () => registerAnswer(button.dataset.digit));
  });

  window.addEventListener('keydown', (event) => {
    if (!views.test.classList.contains('active')) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      registerAnswer(event.key);
    }
  });

  // Save immediately before page navigation/refresh. The timer is based on wall-clock
  // timestamps, so a refresh does not reset the current 15-second interval.
  window.addEventListener('beforeunload', () => {
    if (!state.finished && views.test.classList.contains('active')) persistTest();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !state.finished && views.test.classList.contains('active')) {
      persistTest();
    }
  });

  window.addEventListener('resize', () => {
    if (views.result.classList.contains('active') && state.lastResult) {
      drawChart(state.lastResult.counts);
    }
  });

  initialize();
})();
