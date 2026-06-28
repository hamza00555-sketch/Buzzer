// شاشة العرض (للجمهور / التلفزيون): تعرض اللي يصير في اللعبة لحظياً — للقراءة فقط.
import { supabase } from './supabase.js';
import { $, escapeHtml, formatDelta, urlParam } from './common.js';
import { MODES } from './modes.js';

let room = null, channel = null, timer = null;
const players = new Map();
let buzzes = [], answers = [];

const el = {
  join: $('#join'), stage: $('#stage'),
  codeInput: $('#codeInput'), joinBtn: $('#joinBtn'), joinError: $('#joinError'),
  bigCode: $('#bigCode'), playerCount: $('#playerCount'),
  phaseLabel: $('#phaseLabel'), timerLabel: $('#timerLabel'),
  title: $('#title'), body: $('#body'), board: $('#board'), confetti: $('#confetti'),
};

// ============ الدخول للعرض ============
async function open(code) {
  code = (code || '').trim().toUpperCase();
  if (code.length < 4) return showError('اكتب كود الغرفة');
  const { data, error } = await supabase.from('rooms').select('*').eq('code', code).single();
  if (error || !data) return showError('لم يتم العثور على غرفة بهذا الكود');
  room = data;
  el.join.hidden = true; el.stage.hidden = false;
  el.bigCode.textContent = room.code;
  await loadPlayers();
  await refreshRound();
  subscribe();
  render();
  startTimer();
}

async function loadPlayers() {
  const { data } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at');
  players.clear();
  (data || []).forEach((p) => players.set(p.id, p));
  renderBoard();
}

async function refreshRound() {
  if (room.mode === 'buzz') {
    const { data } = await supabase.from('buzzes').select('*').eq('room_id', room.id).eq('round', room.round).order('created_at');
    buzzes = data || []; answers = [];
  } else {
    const { data } = await supabase.from('answers').select('*').eq('room_id', room.id).eq('round', room.round).order('created_at');
    answers = data || []; buzzes = [];
  }
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('display-' + room.id);
  channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
    ({ new: n }) => onRoom(n));
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
    ({ eventType, new: nw, old: o }) => { if (eventType === 'DELETE') players.delete(o.id); else players.set(nw.id, nw); renderBoard(); });
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'buzzes', filter: `room_id=eq.${room.id}` },
    ({ new: n }) => { if (n.round === room.round) { buzzes.push(n); buzzes.sort((a, c) => new Date(a.created_at) - new Date(c.created_at)); render(); } });
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `room_id=eq.${room.id}` },
    ({ new: n }) => { if (n.round === room.round) { answers.push(n); render(); } });
  channel.subscribe();
}

function onRoom(n) {
  const newRound = n.round !== room.round;
  const becameReveal = n.phase === 'reveal' && room.phase !== 'reveal';
  room = n;
  if (newRound) { buzzes = []; answers = []; }
  render();
  if (room.phase === 'live') startTimer(); else stopTimer();
  if (becameReveal) celebrate();
}

// ============ العرض ============
function render() {
  const m = MODES[room.mode] || MODES.buzz;
  el.phaseLabel.textContent = { lobby: 'بانتظار البدء', live: 'الجولة شغّالة', reveal: 'النتيجة' }[room.phase] || room.phase;
  el.phaseLabel.dataset.phase = room.phase;

  if (room.phase === 'lobby') {
    el.title.textContent = '🔔 ادخلوا من جوالاتكم';
    el.body.innerHTML = `<p class="d-hint">افتحوا صفحة اللاعب واكتبوا الكود</p>
      <p class="d-code-hint">${escapeHtml(room.code)}</p>`;
    return;
  }
  el.title.innerHTML = `<span class="d-mode">${m.emoji} ${m.name}</span><br>${escapeHtml(room.question || '')}`;
  if (room.mode === 'buzz') return renderBuzz();
  if (room.mode === 'mcq') return renderMcq();
  if (room.mode === 'feud') return renderFeud();
  if (room.mode === 'closest') return renderClosest();
}

function renderBuzz() {
  if (!buzzes.length) { el.body.innerHTML = '<p class="d-hint">مين يضغط أول؟ ⚡</p>'; return; }
  const t0 = new Date(buzzes[0].created_at).getTime();
  const medals = ['🥇', '🥈', '🥉'];
  el.body.innerHTML = '<ol class="d-list">' + buzzes.slice(0, 6).map((b, i) => `
    <li class="${i === 0 ? 'first' : ''}">
      <span class="d-rank">${medals[i] || '#' + (i + 1)}</span>
      <span class="d-name">${escapeHtml(players.get(b.player_id)?.name || 'لاعب')}</span>
      <span class="d-delta">${formatDelta(i === 0 ? 0 : new Date(b.created_at).getTime() - t0)}</span>
    </li>`).join('') + '</ol>';
}

function renderMcq() {
  const opts = room.payload?.options || [];
  const reveal = room.phase === 'reveal';
  const dist = room.payload?.dist || [];
  const correct = room.payload?.correct;
  const max = Math.max(1, ...dist);
  const answered = new Set(answers.map((a) => a.player_id)).size;
  el.body.innerHTML = `
    ${reveal ? '' : `<p class="d-count">${answered} / ${players.size} جاوبوا</p>`}
    <div class="d-opts">${opts.map((o, i) => `
      <div class="d-opt c${i} ${reveal && i === correct ? 'correct' : reveal ? 'dim' : ''}">
        <span class="d-opt-label">${'ABCD'[i] || i + 1}</span>
        <span class="d-opt-text">${escapeHtml(o)} ${reveal && i === correct ? '✓' : ''}</span>
        ${reveal ? `<span class="d-opt-bar" style="width:${(dist[i] || 0) / max * 100}%"></span><b>${dist[i] || 0}</b>` : ''}
      </div>`).join('')}</div>`;
}

function renderFeud() {
  const total = room.payload?.total || 0;
  const revealed = room.payload?.revealed || [];
  const revMap = new Map(revealed.map((r) => [r.idx ?? -1, r]));
  const slots = [];
  for (let i = 0; i < total; i++) {
    const r = revMap.get(i);
    slots.push(r
      ? `<li class="d-feud done"><span class="n">${i + 1}</span><span class="t">${escapeHtml(r.text)}</span><span class="p">+${r.points}</span></li>`
      : `<li class="d-feud"><span class="n">${i + 1}</span><span class="t">؟ ؟ ؟</span></li>`);
  }
  el.body.innerHTML = `<ul class="d-feud-board">${slots.join('')}</ul>`;
}

function renderClosest() {
  if (room.phase === 'live') {
    const answered = new Set(answers.map((a) => a.player_id)).size;
    el.body.innerHTML = `<p class="d-count">${answered} / ${players.size} خمّنوا 🔢</p>`;
    return;
  }
  const target = room.payload?.target;
  const unit = room.payload?.unit || '';
  const results = room.payload?.results || [];
  const medals = ['🥇', '🥈', '🥉'];
  el.body.innerHTML = `<p class="d-target">الرقم الصحيح: <b>${target}</b> ${escapeHtml(unit)}</p>
    <ol class="d-list">${results.slice(0, 6).map((r, i) => `
      <li class="${i === 0 ? 'first' : ''}">
        <span class="d-rank">${medals[i] || '#' + (i + 1)}</span>
        <span class="d-name">${escapeHtml(players.get(r.player_id)?.name || 'لاعب')}</span>
        <span class="d-delta">${r.value} (فرق ${r.diff})${r.points ? ` · +${r.points}` : ''}</span>
      </li>`).join('')}</ol>`;
}

function renderBoard() {
  el.playerCount.textContent = players.size;
  const list = [...players.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
  const medals = ['🥇', '🥈', '🥉'];
  el.board.innerHTML = '<h3>الصدارة</h3>' + (list.length
    ? '<ul>' + list.map((p, i) => `<li><span>${medals[i] || (i + 1)}</span><span class="bn">${escapeHtml(p.name)}</span><b>${p.score || 0}</b></li>`).join('') + '</ul>'
    : '<p class="d-hint">لسه محدش دخل</p>');
}

// ============ المؤقّت + احتفال ============
function startTimer() {
  stopTimer();
  const dur = room.payload?.duration || 0;
  if (room.phase !== 'live' || !dur) { el.timerLabel.textContent = ''; return; }
  const tick = () => {
    const left = Math.max(0, Math.ceil(dur - (Date.now() - new Date(room.round_started_at).getTime()) / 1000));
    el.timerLabel.textContent = `⏱ ${left}`;
    el.timerLabel.classList.toggle('urgent', left <= 5 && left > 0);
    if (left <= 0) stopTimer();
  };
  tick(); timer = setInterval(tick, 500);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } el.timerLabel.textContent = ''; el.timerLabel.classList.remove('urgent'); }

function celebrate() {
  const c = el.confetti;
  c.innerHTML = '';
  const colors = ['#5b61c9', '#13a89e', '#ef6f6c', '#e9a23b', '#8a6fc4'];
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('span');
    s.className = 'confetti-bit';
    s.style.left = (i / 60 * 100) + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = (i % 10) * 0.08 + 's';
    c.appendChild(s);
  }
  setTimeout(() => { c.innerHTML = ''; }, 2600);
}

function showError(msg) { el.joinError.textContent = msg; el.joinError.hidden = false; }

function init() {
  el.joinBtn.addEventListener('click', () => open(el.codeInput.value));
  el.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(el.codeInput.value); });
  el.codeInput.addEventListener('input', () => { el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const pre = urlParam('code');
  if (pre) { el.codeInput.value = pre.toUpperCase(); open(pre); }
}
init();
