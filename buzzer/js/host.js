// منطق المضيف: إنشاء غرفة، اختيار وضع اللعب، تأليف السؤال، بدء الجولة/كشف النتيجة، النقاط.
import { supabase } from './supabase.js';
import { $, $$, escapeHtml, formatDelta, generateRoomCode, normalizeAr, store } from './common.js';
import { MODES, MODE_LIST, mcqPoints, CLOSEST_POINTS } from './modes.js';

let room = null;             // صف الغرفة الحالي
const players = new Map();   // id -> player
let buzzes = [];             // ضغطات الجولة الحالية (buzz)
let answers = [];            // إجابات الجولة الحالية (mcq/feud/closest)
let channel = null;
let timer = null;            // مؤقّت الكشف التلقائي
let authorMode = 'buzz';     // الوضع المختار في نموذج التأليف
let pendingFeud = null;      // فهرس إجابة feud بانتظار اختيار اللاعب الذي قالها
const scored = new Set();    // الجولات اللي اتحسبت نقاطها (منع التكرار)

const el = {
  setup: $('#setup'), dashboard: $('#dashboard'),
  createBtn: $('#createBtn'), resumeBox: $('#resumeBox'), resumeBtn: $('#resumeBtn'), newRoomBtn: $('#newRoomBtn'),
  code: $('#roomCode'), copyBtn: $('#copyBtn'), displayLink: $('#displayLink'),
  modePicker: $('#modePicker'),
  forms: $('#forms'),
  startBtn: $('#startBtn'), revealBtn: $('#revealBtn'), nextBtn: $('#nextBtn'),
  phaseLabel: $('#phaseLabel'), roundLabel: $('#roundLabel'), timerLabel: $('#timerLabel'),
  live: $('#live'), liveTitle: $('#liveTitle'), liveBody: $('#liveBody'),
  playerList: $('#playerList'), playerCount: $('#playerCount'), resetScoresBtn: $('#resetScoresBtn'),
};

// ============ إنشاء/استئناف الغرفة ============
async function createRoom() {
  el.createBtn.disabled = true;
  let created = null, lastErr = null;
  for (let i = 0; i < 8; i++) {
    const code = generateRoomCode(4);
    const { data, error } = await supabase.from('rooms')
      .insert({ code, mode: 'buzz', phase: 'lobby', round: 0, question: '', payload: {} })
      .select().single();
    if (!error) { created = data; break; }
    lastErr = error;
    if (error.code !== '23505') break;
  }
  el.createBtn.disabled = false;
  if (!created) { alert('تعذّر إنشاء الغرفة: ' + (lastErr?.message || 'خطأ')); return; }
  room = created;
  store.roomId = room.id; store.code = room.code;
  await enterDashboard();
}

async function resumeRoom() {
  const id = store.roomId;
  if (!id) return;
  const { data, error } = await supabase.from('rooms').select('*').eq('id', id).single();
  if (error || !data) { store.clearPlayer(); alert('الغرفة المحفوظة لم تعد موجودة.'); return; }
  room = data;
  await enterDashboard();
}

async function enterDashboard() {
  el.setup.hidden = true;
  el.dashboard.hidden = false;
  el.code.textContent = room.code;
  el.displayLink.href = `./display.html?code=${room.code}`;
  renderModePicker();
  selectMode(room.mode || 'buzz');
  updatePhase();
  await loadPlayers();
  await refreshRound();
  subscribe();
}

// ============ تحميل واشتراك لحظي ============
async function loadPlayers() {
  const { data } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at');
  players.clear();
  (data || []).forEach((p) => players.set(p.id, p));
  renderPlayers();
}

async function refreshRound() {
  if (room.mode === 'buzz') {
    const { data } = await supabase.from('buzzes').select('*')
      .eq('room_id', room.id).eq('round', room.round).order('created_at');
    buzzes = data || []; answers = [];
  } else {
    const { data } = await supabase.from('answers').select('*')
      .eq('room_id', room.id).eq('round', room.round).order('created_at');
    answers = data || []; buzzes = [];
  }
  renderLive();
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('host-' + room.id);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
    (p) => { handlePlayerChange(p); });
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'buzzes', filter: `room_id=eq.${room.id}` },
    (p) => onBuzz(p.new));
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `room_id=eq.${room.id}` },
    (p) => onAnswer(p.new));
  channel.subscribe();
}

function handlePlayerChange({ eventType, new: n, old: o }) {
  if (eventType === 'DELETE') players.delete(o.id); else players.set(n.id, n);
  renderPlayers();
}

async function onBuzz(b) {
  if (b.round !== room.round || room.mode !== 'buzz') return;
  if (!buzzes.find((x) => x.id === b.id)) buzzes.push(b);
  buzzes.sort((a, c) => new Date(a.created_at) - new Date(c.created_at));
  renderLive();
  // قفل فوري بعد أول ضغطة
  if (room.phase === 'live' && room.payload?.lockout && buzzes.length === 1) {
    await reveal();
  }
}

async function onAnswer(a) {
  if (a.round !== room.round) return;
  if (!answers.find((x) => x.id === a.id)) answers.push(a);
  renderLive();
}

// ============ نموذج اختيار الوضع ============
function renderModePicker() {
  el.modePicker.innerHTML = MODE_LIST.map((m) => `
    <button class="mode-chip" data-mode="${m.key}" title="${escapeHtml(m.desc)}">
      <span class="me">${m.emoji}</span><span>${m.name}</span>
    </button>`).join('');
}

function selectMode(mode) {
  authorMode = mode;
  $$('.mode-chip', el.modePicker).forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $$('.mode-form', el.forms).forEach((f) => { f.hidden = f.dataset.mode !== mode; });
}

// ============ بدء الجولة ============
function readDuration(mode) {
  const v = Number($(`#dur_${mode}`)?.value);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : MODES[mode].defaultDuration;
}

async function startRound() {
  const mode = authorMode;
  let question = '', payload = {}, secret = {};

  if (mode === 'buzz') {
    question = $('#q_buzz').value.trim();
    payload = { lockout: $('#buzz_lockout').checked, duration: 0 };
  } else if (mode === 'mcq') {
    question = $('#q_mcq').value.trim();
    const options = $$('.mcq-opt').map((i) => i.value.trim()).filter((x) => x !== '');
    const correct = Number($('input[name="mcq_correct"]:checked')?.value);
    if (options.length < 2) return alert('اكتب خيارين على الأقل.');
    if (!Number.isInteger(correct) || correct >= options.length) return alert('اختر الإجابة الصحيحة.');
    payload = { options, duration: readDuration('mcq') };
    secret = { correct };
  } else if (mode === 'feud') {
    question = $('#q_feud').value.trim();
    const rows = $$('.feud-row').map((r) => ({
      text: r.querySelector('.feud-text').value.trim(),
      points: Number(r.querySelector('.feud-points').value) || 10,
    })).filter((a) => a.text !== '');
    if (!rows.length) return alert('أضف إجابة واحدة على الأقل.');
    // وضع شفهي يقوده المضيف: بدون مؤقّت. الإجابات تبقى سرّاً (محلياً) حتى يكشفها المضيف.
    payload = { duration: 0, total: rows.length, revealed: [] };
    secret = { accepted: rows };
  } else if (mode === 'closest') {
    question = $('#q_closest').value.trim();
    const target = Number($('#closest_target').value);
    if (!Number.isFinite(target)) return alert('اكتب الرقم الصحيح (الهدف).');
    payload = { duration: readDuration('closest'), unit: $('#closest_unit').value.trim() };
    secret = { target };
  }
  if (!question) return alert('اكتب نص السؤال.');

  const round = room.round + 1;
  const { data, error } = await supabase.from('rooms').update({
    mode, phase: 'live', round, question, payload, round_started_at: new Date().toISOString(),
  }).eq('id', room.id).select().single();
  if (error) return alert(error.message);

  room = data;
  buzzes = []; answers = []; pendingFeud = null;
  saveSecret(round, secret);
  selectMode(mode);
  updatePhase();
  renderLive();
  startTimer();
}

// ============ كشف النتيجة + الحساب ============
async function reveal() {
  stopTimer();
  if (room.phase !== 'live') return;
  const round = room.round;
  let payload = { ...(room.payload || {}) };

  if (!scored.has(round)) {
    scored.add(round);
    if (room.mode === 'mcq') payload = await scoreMcq(payload);
    else if (room.mode === 'closest') payload = await scoreClosest(payload);
    else if (room.mode === 'feud') payload = await scoreFeudRemaining(payload);
    // buzz: النقاط يدوية عبر أزرار +/-
  }

  const { data, error } = await supabase.from('rooms')
    .update({ phase: 'reveal', payload }).eq('id', room.id).select().single();
  if (error) return alert(error.message);
  room = data;
  updatePhase();
  renderLive();
}

async function scoreMcq(payload) {
  const secret = loadSecret(room.round);
  const startMs = new Date(room.round_started_at).getTime();
  const durMs = (payload.duration || 0) * 1000;
  const dist = new Array((payload.options || []).length).fill(0);
  // إجابة واحدة لكل لاعب (الأولى)
  const seen = new Set();
  const ordered = [...answers].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const a of ordered) {
    if (seen.has(a.player_id)) continue;
    seen.add(a.player_id);
    const idx = Number(a.value);
    if (idx >= 0 && idx < dist.length) dist[idx]++;
    const correct = idx === secret?.correct;
    const pts = mcqPoints(correct, new Date(a.created_at).getTime() - startMs, durMs);
    await supabase.from('answers').update({ is_correct: correct, points: pts }).eq('id', a.id);
    if (pts) await addScore(a.player_id, pts);
  }
  return { ...payload, correct: secret?.correct, dist };
}

async function scoreClosest(payload) {
  const secret = loadSecret(room.round);
  const target = secret?.target ?? 0;
  const seen = new Set();
  const valid = [];
  for (const a of [...answers].sort((x, y) => new Date(x.created_at) - new Date(y.created_at))) {
    if (seen.has(a.player_id)) continue;
    seen.add(a.player_id);
    const num = Number(a.value);
    if (Number.isFinite(num)) valid.push({ ...a, num, diff: Math.abs(num - target) });
  }
  valid.sort((a, b) => a.diff - b.diff || new Date(a.created_at) - new Date(b.created_at));
  const results = [];
  for (let i = 0; i < valid.length; i++) {
    const pts = CLOSEST_POINTS[i] || 0;
    await supabase.from('answers').update({ points: pts, is_correct: i === 0 }).eq('id', valid[i].id);
    if (pts) await addScore(valid[i].player_id, pts);
    results.push({ player_id: valid[i].player_id, value: valid[i].num, diff: valid[i].diff, points: pts });
  }
  return { ...payload, target, results };
}

async function scoreFeudRemaining(payload) {
  // كشف الإجابات اللي ما حدش ذكرها (بدون نقاط) عند إنهاء الجولة
  const secret = loadSecret(room.round);
  const revealedIdx = new Set((payload.revealed || []).map((r) => r.idx));
  const missed = (secret?.accepted || [])
    .map((a, idx) => ({ idx, text: a.text, points: a.points, by: null }))
    .filter((a) => !revealedIdx.has(a.idx));
  return { ...payload, revealed: [...(payload.revealed || []), ...missed] };
}

// المضيف يضغط على الإجابة عند ذكرها شفهياً → تظهر على شاشات الجميع وتُحتسب نقاطها للاعب.
async function revealFeud(idx, playerId) {
  const secret = loadSecret(room.round);
  const ans = secret?.accepted?.[idx];
  if (!ans) { pendingFeud = null; renderLive(); return; }
  const revealed = room.payload?.revealed || [];
  if (revealed.some((r) => r.idx === idx)) { pendingFeud = null; renderLive(); return; }
  const entry = { idx, text: ans.text, points: ans.points, by: playerId || null };
  const { data, error } = await supabase.from('rooms')
    .update({ payload: { ...room.payload, revealed: [...revealed, entry] } })
    .eq('id', room.id).select().single();
  if (error) { alert(error.message); return; }
  room = data;
  if (playerId) await addScore(playerId, ans.points);
  pendingFeud = null;
  renderLive();
}

async function addScore(playerId, delta) {
  const p = players.get(playerId);
  const base = p ? (p.score || 0) : 0;
  const newScore = base + delta;
  if (p) { p.score = newScore; renderPlayers(); }
  await supabase.from('players').update({ score: newScore }).eq('id', playerId);
}

async function nextRound() {
  // العودة لشاشة التأليف (الوضع الحالي محفوظ)
  const { data } = await supabase.from('rooms').update({ phase: 'lobby' }).eq('id', room.id).select().single();
  if (data) room = data;
  buzzes = []; answers = []; pendingFeud = null;
  updatePhase();
  renderLive();
}

// ============ النقاط اليدوية ============
async function changeScore(playerId, delta) {
  await addScore(playerId, delta);
}

async function resetScores() {
  if (!confirm('تصفير كل النقاط؟')) return;
  for (const p of players.values()) { p.score = 0; }
  renderPlayers();
  await supabase.from('players').update({ score: 0 }).eq('room_id', room.id);
}

// ============ المؤقّت ============
function startTimer() {
  stopTimer();
  const dur = room.payload?.duration || 0;
  if (!dur) return;
  timer = setInterval(() => {
    const left = remaining();
    el.timerLabel.textContent = left > 0 ? `⏱ ${left}` : '⏱ 0';
    if (left <= 0) { stopTimer(); reveal(); }
  }, 250);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } el.timerLabel.textContent = ''; }
function remaining() {
  const dur = room.payload?.duration || 0;
  if (!dur || !room.round_started_at) return 0;
  return Math.max(0, Math.ceil(dur - (Date.now() - new Date(room.round_started_at).getTime()) / 1000));
}

// ============ العرض ============
function updatePhase() {
  const map = { lobby: 'جاهز', live: 'الجولة شغّالة', reveal: 'عرض النتيجة' };
  el.phaseLabel.textContent = map[room.phase] || room.phase;
  el.phaseLabel.dataset.phase = room.phase;
  el.roundLabel.textContent = room.round;
  const live = room.phase === 'live';
  el.startBtn.hidden = live;
  el.revealBtn.hidden = !live;
  el.nextBtn.hidden = room.phase !== 'reveal';
  el.modePicker.classList.toggle('disabled', live);
  el.forms.classList.toggle('disabled', live);
}

function renderLive() {
  const m = MODES[room.mode];
  if (room.phase === 'lobby') {
    el.live.hidden = true;
    return;
  }
  el.live.hidden = false;
  el.liveTitle.textContent = `${m.emoji} ${m.name} — ${escapeHtml(room.question || '')}`;

  if (room.mode === 'buzz') return renderBuzzLive();
  if (room.mode === 'mcq') return renderMcqLive();
  if (room.mode === 'feud') return renderFeudLive();
  if (room.mode === 'closest') return renderClosestLive();
}

function renderBuzzLive() {
  if (!buzzes.length) { el.liveBody.innerHTML = '<p class="hint">لسه محدش ضغط…</p>'; return; }
  const t0 = new Date(buzzes[0].created_at).getTime();
  const medals = ['🥇', '🥈', '🥉'];
  el.liveBody.innerHTML = '<ul class="list">' + buzzes.map((b, i) => {
    const name = players.get(b.player_id)?.name || 'لاعب';
    const d = new Date(b.created_at).getTime() - t0;
    return `<li class="buzz-row${i === 0 ? ' first' : ''}">
      <span class="rank">${medals[i] || '#' + (i + 1)}</span>
      <span class="who">${escapeHtml(name)}</span>
      <span class="delta">${formatDelta(i === 0 ? 0 : d)}</span>
      ${room.phase === 'reveal' ? `<button class="mini plus" data-id="${b.player_id}" data-d="1">+1</button>` : ''}
    </li>`;
  }).join('') + '</ul>';
}

function renderMcqLive() {
  const opts = room.payload?.options || [];
  const answered = new Set(answers.map((a) => a.player_id)).size;
  if (room.phase === 'live') {
    el.liveBody.innerHTML = `<p class="big-count">${answered} / ${players.size} جاوبوا</p>
      <div class="opt-grid">${opts.map((o, i) => `<div class="opt">${'ABCD'[i] || i + 1}. ${escapeHtml(o)}</div>`).join('')}</div>`;
    return;
  }
  const dist = room.payload?.dist || [];
  const correct = room.payload?.correct;
  const max = Math.max(1, ...dist);
  el.liveBody.innerHTML = `<div class="opt-grid">${opts.map((o, i) => `
    <div class="opt ${i === correct ? 'correct' : ''}">
      <span>${'ABCD'[i] || i + 1}. ${escapeHtml(o)} ${i === correct ? '✓' : ''}</span>
      <span class="bar" style="--w:${(dist[i] || 0) / max * 100}%"></span>
      <small>${dist[i] || 0}</small>
    </div>`).join('')}</div>`;
}

function renderFeudLive() {
  const accepted = loadSecret(room.round)?.accepted || [];
  const revealed = room.payload?.revealed || [];
  const revMap = new Map(revealed.map((r) => [r.idx, r]));
  const playerList = [...players.values()];

  const rows = accepted.map((a, i) => {
    const r = revMap.get(i);
    if (r) {
      const who = r.by ? (players.get(r.by)?.name || 'لاعب') : 'لم تُذكر';
      return `<li class="feud-slot done"><span>${escapeHtml(a.text)}</span><b>+${a.points} · ${escapeHtml(who)}</b></li>`;
    }
    if (room.phase === 'reveal') {
      return `<li class="feud-slot"><span>${escapeHtml(a.text)}</span><b>+${a.points}</b></li>`;
    }
    if (pendingFeud === i) {
      const chips = playerList.length
        ? playerList.map((p) => `<button class="chip-btn" data-feud-assign="${i}" data-player="${p.id}">${escapeHtml(p.name)}</button>`).join('')
        : '<span class="hint">لا يوجد لاعبون بعد</span>';
      return `<li class="feud-slot picking">
        <div class="fp-q">«${escapeHtml(a.text)}» — مين قالها؟</div>
        <div class="fp-players">${chips}
          <button class="chip-btn neutral" data-feud-assign="${i}" data-player="">🚫 بدون أحد</button>
          <button class="chip-btn cancel" data-feud-cancel>إلغاء</button>
        </div></li>`;
    }
    return `<li class="feud-slot pick" data-feud-pick="${i}"><span>${escapeHtml(a.text)}</span><b>+${a.points} · اضغط عند ذكرها ▸</b></li>`;
  }).join('');

  const hint = room.phase === 'reveal'
    ? `انتهت الجولة — ${revealed.filter((r) => r.by).length}/${accepted.length} نُسبت للاعبين.`
    : `🔒 الإجابات ظاهرة لك فقط. اضغط الإجابة عند ذكرها شفهياً. (${revealed.length}/${accepted.length})`;
  el.liveBody.innerHTML = `<p class="hint">${hint}</p><ul class="feud-board host">${rows}</ul>`;
}

function renderClosestLive() {
  if (room.phase === 'live') {
    const answered = new Set(answers.map((a) => a.player_id)).size;
    el.liveBody.innerHTML = `<p class="big-count">${answered} / ${players.size} خمّنوا</p>`;
    return;
  }
  const target = room.payload?.target;
  const unit = room.payload?.unit || '';
  const results = room.payload?.results || [];
  const medals = ['🥇', '🥈', '🥉'];
  el.liveBody.innerHTML = `<p class="big-count">الرقم الصحيح: ${target} ${escapeHtml(unit)}</p>
    <ul class="list">${results.slice(0, 8).map((r, i) => `
      <li class="buzz-row${i === 0 ? ' first' : ''}">
        <span class="rank">${medals[i] || '#' + (i + 1)}</span>
        <span class="who">${escapeHtml(players.get(r.player_id)?.name || 'لاعب')}</span>
        <span class="delta">خمّن ${r.value} (فرق ${r.diff})${r.points ? ` · +${r.points}` : ''}</span>
      </li>`).join('')}</ul>`;
}

function renderPlayers() {
  const list = [...players.values()].sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at));
  el.playerCount.textContent = list.length;
  el.playerList.innerHTML = list.length ? list.map((p) => `
    <li class="player-row">
      <span class="pname">${escapeHtml(p.name)}</span>
      <span class="pscore">${p.score || 0}</span>
      <span class="pbtns">
        <button class="mini minus" data-id="${p.id}" data-d="-1">−</button>
        <button class="mini plus"  data-id="${p.id}" data-d="1">+</button>
      </span>
    </li>`).join('') : '<li class="muted">لسه محدش دخل…</li>';
}

// ============ أسرار الجولة (محلياً، عشان ما تتسرّبش للاعبين) ============
function secretKey(round) { return `buzzer.secret.${room.id}.${round}`; }
function saveSecret(round, secret) { try { localStorage.setItem(secretKey(round), JSON.stringify(secret)); } catch (_) {} }
function loadSecret(round) { try { return JSON.parse(localStorage.getItem(secretKey(round)) || '{}'); } catch (_) { return {}; } }

// ============ أدوات ============
async function copyCode() {
  try { await navigator.clipboard.writeText(room.code); flash(el.copyBtn, 'تم النسخ ✓'); }
  catch (_) { flash(el.copyBtn, room.code); }
}
function flash(btn, text) {
  const old = btn.textContent; btn.textContent = text; btn.classList.add('flash');
  setTimeout(() => { btn.textContent = old; btn.classList.remove('flash'); }, 1100);
}

// ============ ربط الأحداث ============
function wire() {
  el.createBtn.addEventListener('click', createRoom);
  el.resumeBtn?.addEventListener('click', resumeRoom);
  el.newRoomBtn?.addEventListener('click', () => { store.clearPlayer(); createRoom(); });
  el.copyBtn.addEventListener('click', copyCode);
  el.modePicker.addEventListener('click', (e) => {
    const b = e.target.closest('.mode-chip');
    if (b && room.phase !== 'live') selectMode(b.dataset.mode);
  });
  el.startBtn.addEventListener('click', startRound);
  el.revealBtn.addEventListener('click', reveal);
  el.nextBtn.addEventListener('click', nextRound);
  el.resetScoresBtn.addEventListener('click', resetScores);
  // أزرار النقاط (لوحة النقاط + زر +1 بجانب أول ضاغط)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.mini');
    if (!b || !b.dataset.id) return;
    changeScore(b.dataset.id, Number(b.dataset.d));
  });
  // إضافة صف إجابة في Family Feud
  $('#feud_add')?.addEventListener('click', addFeudRow);
  // كشف إجابات Family Feud وإسنادها للاعب
  el.liveBody.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-feud-pick]');
    if (pick) { pendingFeud = Number(pick.dataset.feudPick); renderLive(); return; }
    const assign = e.target.closest('[data-feud-assign]');
    if (assign) { revealFeud(Number(assign.dataset.feudAssign), assign.dataset.player || null); return; }
    if (e.target.closest('[data-feud-cancel]')) { pendingFeud = null; renderLive(); return; }
  });
}

function addFeudRow() {
  const wrap = $('#feud_rows');
  const div = document.createElement('div');
  div.className = 'feud-row';
  div.innerHTML = `<input class="feud-text" type="text" placeholder="إجابة مقبولة" />
    <input class="feud-points" type="number" value="10" min="1" />`;
  wrap.appendChild(div);
}

function init() {
  wire();
  if (store.roomId) el.resumeBox.hidden = false;
}
init();
