// منطق المضيف: إنشاء غرفة، تجهيز/قفل، ترتيب الضغط، النقاط، الأسئلة.
import { supabase } from './supabase.js';
import { $, escapeHtml, formatDelta, generateRoomCode, store } from './common.js';

let room = null;             // صف الغرفة الحالي
const players = new Map();   // id -> player
let buzzes = [];             // ضغطات الجولة الحالية (مرتبة)
let channel = null;

const el = {
  setup: $('#setup'),
  dashboard: $('#dashboard'),
  createBtn: $('#createBtn'),
  resumeBox: $('#resumeBox'),
  resumeBtn: $('#resumeBtn'),
  newRoomBtn: $('#newRoomBtn'),
  code: $('#roomCode'),
  copyBtn: $('#copyBtn'),
  question: $('#questionInput'),
  showQuestionBtn: $('#showQuestionBtn'),
  armBtn: $('#armBtn'),
  lockBtn: $('#lockBtn'),
  stateLabel: $('#stateLabel'),
  roundLabel: $('#roundLabel'),
  buzzList: $('#buzzList'),
  buzzEmpty: $('#buzzEmpty'),
  playerList: $('#playerList'),
  playerCount: $('#playerCount'),
};

// ---------- إنشاء/استئناف الغرفة ----------
async function createRoom() {
  el.createBtn.disabled = true;
  let created = null, lastErr = null;
  for (let i = 0; i < 8; i++) {
    const code = generateRoomCode(4);
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code, state: 'lobby', round: 0, question: '' })
      .select()
      .single();
    if (!error) { created = data; break; }
    lastErr = error;
    if (error.code !== '23505') break; // 23505 = تعارض كود فريد، جرّب تاني
  }
  el.createBtn.disabled = false;
  if (!created) { alert('تعذّر إنشاء الغرفة: ' + (lastErr?.message || 'خطأ غير معروف')); return; }
  room = created;
  store.roomId = room.id;
  store.code = room.code;
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
  el.question.value = room.question || '';
  updateStatus();
  await loadPlayers();
  await refreshBuzzes();
  subscribe();
}

// ---------- التحميل والاشتراك اللحظي ----------
async function loadPlayers() {
  const { data } = await supabase
    .from('players').select('*').eq('room_id', room.id).order('joined_at', { ascending: true });
  players.clear();
  (data || []).forEach((p) => players.set(p.id, p));
  renderPlayers();
}

async function refreshBuzzes() {
  const { data } = await supabase
    .from('buzzes')
    .select('id, player_id, created_at, round')
    .eq('room_id', room.id)
    .eq('round', room.round)
    .order('created_at', { ascending: true });
  buzzes = data || [];
  renderBuzzes();
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('host-' + room.id);
  channel.on('postgres_changes',
    { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
    (payload) => handlePlayerChange(payload));
  channel.on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'buzzes', filter: `room_id=eq.${room.id}` },
    (payload) => { if (payload.new.round === room.round) refreshBuzzes(); });
  channel.subscribe();
}

function handlePlayerChange({ eventType, new: n, old: o }) {
  if (eventType === 'DELETE') players.delete(o.id);
  else players.set(n.id, n);
  renderPlayers();
}

// ---------- أفعال المضيف ----------
async function showQuestion() {
  const q = el.question.value.trim();
  const { data, error } = await supabase
    .from('rooms').update({ question: q }).eq('id', room.id).select().single();
  if (error) { alert(error.message); return; }
  room = data;
  flash(el.showQuestionBtn, 'تم العرض ✓');
}

async function arm() {
  const q = el.question.value.trim();
  const { data, error } = await supabase
    .from('rooms')
    .update({ state: 'armed', round: room.round + 1, question: q })
    .eq('id', room.id).select().single();
  if (error) { alert(error.message); return; }
  room = data;
  buzzes = [];
  renderBuzzes();
  updateStatus();
}

async function lock() {
  const { data, error } = await supabase
    .from('rooms').update({ state: 'locked' }).eq('id', room.id).select().single();
  if (error) { alert(error.message); return; }
  room = data;
  updateStatus();
}

async function changeScore(playerId, delta) {
  const p = players.get(playerId);
  if (!p) return;
  const newScore = (p.score || 0) + delta;
  p.score = newScore; // متفائل
  renderPlayers();
  const { error } = await supabase.from('players').update({ score: newScore }).eq('id', playerId);
  if (error) { alert(error.message); await loadPlayers(); }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(room.code);
    flash(el.copyBtn, 'تم النسخ ✓');
  } catch (_) {
    flash(el.copyBtn, room.code);
  }
}

// ---------- العرض ----------
function updateStatus() {
  const map = { lobby: 'في اللوبي', armed: 'الباصرة جاهزة', locked: 'مقفولة' };
  el.stateLabel.textContent = map[room.state] || room.state;
  el.stateLabel.dataset.state = room.state;
  el.roundLabel.textContent = room.round;
  el.lockBtn.disabled = room.state !== 'armed';
  el.armBtn.textContent = room.round === 0 ? 'جهّز الباصرة' : 'جهّز الباصرة (جولة جديدة)';
}

function renderBuzzes() {
  if (!buzzes.length) {
    el.buzzList.innerHTML = '';
    el.buzzEmpty.hidden = false;
    return;
  }
  el.buzzEmpty.hidden = true;
  const t0 = new Date(buzzes[0].created_at).getTime();
  const medals = ['🥇', '🥈', '🥉'];
  el.buzzList.innerHTML = buzzes.map((b, i) => {
    const name = players.get(b.player_id)?.name || 'لاعب';
    const delta = new Date(b.created_at).getTime() - t0;
    const rankBadge = medals[i] || `#${i + 1}`;
    return `<li class="buzz-row${i === 0 ? ' first' : ''}">
      <span class="rank">${rankBadge}</span>
      <span class="who">${escapeHtml(name)}</span>
      <span class="delta">${formatDelta(i === 0 ? 0 : delta)}</span>
    </li>`;
  }).join('');
}

function renderPlayers() {
  const list = Array.from(players.values()).sort(
    (a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at)
  );
  el.playerCount.textContent = list.length;
  if (!list.length) {
    el.playerList.innerHTML = '<li class="muted">لسه محدش دخل…</li>';
    return;
  }
  el.playerList.innerHTML = list.map((p) => `
    <li class="player-row">
      <span class="pname">${escapeHtml(p.name)}</span>
      <span class="pscore">${p.score || 0}</span>
      <span class="pbtns">
        <button class="mini minus" data-id="${p.id}" data-d="-1">−</button>
        <button class="mini plus"  data-id="${p.id}" data-d="1">+</button>
      </span>
    </li>`).join('');
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  btn.classList.add('flash');
  setTimeout(() => { btn.textContent = old; btn.classList.remove('flash'); }, 1100);
}

// ---------- ربط الأحداث ----------
function wire() {
  el.createBtn.addEventListener('click', createRoom);
  el.resumeBtn?.addEventListener('click', resumeRoom);
  el.newRoomBtn?.addEventListener('click', () => { store.clearPlayer(); createRoom(); });
  el.copyBtn.addEventListener('click', copyCode);
  el.showQuestionBtn.addEventListener('click', showQuestion);
  el.armBtn.addEventListener('click', arm);
  el.lockBtn.addEventListener('click', lock);
  el.playerList.addEventListener('click', (e) => {
    const btn = e.target.closest('button.mini');
    if (!btn) return;
    changeScore(btn.dataset.id, Number(btn.dataset.d));
  });
}

function init() {
  wire();
  if (store.roomId) el.resumeBox.hidden = false; // عرض زر الاستئناف لو فيه غرفة محفوظة
}

init();
