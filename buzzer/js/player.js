// منطق اللاعب: انضمام بالكود، زرار الباصرة، الصوت/الاهتزاز، الترتيب والنقاط.
import { supabase } from './supabase.js';
import { $, escapeHtml, playBuzz, playArm, vibrate, unlockAudio, store } from './common.js';

let room = null;
let me = null;
let channel = null;
let buzzedRound = -1; // آخر جولة ضغطت فيها

const el = {
  join: $('#join'),
  game: $('#game'),
  nameInput: $('#nameInput'),
  codeInput: $('#codeInput'),
  joinBtn: $('#joinBtn'),
  joinError: $('#joinError'),
  meName: $('#meName'),
  roomCode: $('#roomCode'),
  myScore: $('#myScore'),
  stateLabel: $('#stateLabel'),
  question: $('#question'),
  buzzBtn: $('#buzzBtn'),
  rank: $('#rank'),
  leaveBtn: $('#leaveBtn'),
};

// ---------- الانضمام / الاستئناف ----------
async function join() {
  const name = el.nameInput.value.trim();
  const code = el.codeInput.value.trim().toUpperCase();
  el.joinError.hidden = true;
  if (!name) return showError('اكتب اسمك');
  if (code.length < 4) return showError('اكتب كود الغرفة (4 حروف)');
  el.joinBtn.disabled = true;

  const { data: rm, error } = await supabase.from('rooms').select('*').eq('code', code).single();
  if (error || !rm) { el.joinBtn.disabled = false; return showError('لم يتم العثور على غرفة بهذا الكود'); }

  const { data: pl, error: e2 } = await supabase
    .from('players').insert({ room_id: rm.id, name, score: 0 }).select().single();
  if (e2) { el.joinBtn.disabled = false; return showError('تعذّر الدخول: ' + e2.message); }

  room = rm; me = pl;
  store.name = name; store.code = code; store.playerId = me.id; store.roomId = room.id;
  el.joinBtn.disabled = false;
  enterGame();
}

async function resume() {
  const pid = store.playerId, rid = store.roomId;
  if (!pid || !rid) return false;
  const [{ data: rm }, { data: pl }] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', rid).single(),
    supabase.from('players').select('*').eq('id', pid).single(),
  ]);
  if (!rm || !pl) { store.clearPlayer(); return false; }
  room = rm; me = pl;
  enterGame();
  return true;
}

function enterGame() {
  el.join.hidden = true;
  el.game.hidden = false;
  el.meName.textContent = me.name;
  el.roomCode.textContent = room.code;
  renderScore();
  renderQuestion();
  applyState(/* announce */ false);
  subscribe();
  refreshMyRank();
}

// ---------- الاشتراك اللحظي ----------
function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('room-' + room.id);
  channel.on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
    ({ new: n }) => onRoomUpdate(n));
  channel.on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${me.id}` },
    ({ new: n }) => { me = n; renderScore(); });
  channel.on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'buzzes', filter: `room_id=eq.${room.id}` },
    ({ new: n }) => { if (n.round === room.round) refreshMyRank(); });
  channel.subscribe();
}

function onRoomUpdate(n) {
  const wasArmed = room.state === 'armed';
  const prevRound = room.round;
  room = n;
  renderQuestion();
  const newlyArmed = room.state === 'armed' && (!wasArmed || room.round !== prevRound);
  applyState(newlyArmed);
}

// ---------- الضغط ----------
async function buzz() {
  if (!room || !me || room.state !== 'armed') return;
  if (buzzedRound === room.round) return;

  unlockAudio();
  playBuzz();
  vibrate([40, 30, 70]);
  buzzedRound = room.round;
  setBuzzed(true);
  el.rank.textContent = 'جارٍ التسجيل…';

  const { error } = await supabase
    .from('buzzes').insert({ room_id: room.id, round: room.round, player_id: me.id });

  if (error && error.code !== '23505') {
    // فشل حقيقي (مش تكرار) — اسمح بإعادة المحاولة
    buzzedRound = -1;
    setBuzzed(false);
    el.rank.textContent = 'تعذّر التسجيل، اضغط تاني';
    return;
  }
  refreshMyRank();
}

async function refreshMyRank() {
  if (!room || !me) return;
  const { data } = await supabase
    .from('buzzes')
    .select('player_id, created_at')
    .eq('room_id', room.id)
    .eq('round', room.round)
    .order('created_at', { ascending: true });
  if (!data) return;
  const idx = data.findIndex((b) => b.player_id === me.id);
  if (idx === -1) {
    if (room.state === 'armed') el.rank.textContent = '';
    return;
  }
  buzzedRound = room.round;
  setBuzzed(true);
  el.rank.innerHTML = idx === 0
    ? '🥇 أنت الأول!'
    : `أنت رقم <strong>#${idx + 1}</strong>`;
}

// ---------- العرض ----------
function applyState(newlyArmed) {
  const map = { lobby: 'استنى لحد ما الباصرة تجهز…', armed: 'اضغط دلوقتي!', locked: 'اتقفلت الباصرة' };
  el.stateLabel.textContent = map[room.state] || room.state;
  el.stateLabel.dataset.state = room.state;

  if (room.state === 'armed') {
    const already = buzzedRound === room.round;
    el.buzzBtn.disabled = already;
    el.buzzBtn.dataset.armed = String(!already);
    setBuzzed(already);
    if (newlyArmed) {
      buzzedRound = -1;
      el.buzzBtn.disabled = false;
      el.buzzBtn.dataset.armed = 'true';
      setBuzzed(false);
      el.rank.textContent = '';
      unlockAudio();
      playArm();
      vibrate(150);
    }
  } else {
    el.buzzBtn.disabled = true;
    el.buzzBtn.dataset.armed = 'false';
  }
}

function setBuzzed(on) {
  el.buzzBtn.classList.toggle('buzzed', on);
}

function renderScore() {
  el.myScore.textContent = me?.score || 0;
}

function renderQuestion() {
  const q = (room.question || '').trim();
  el.question.textContent = q || 'مفيش سؤال معروض حالياً';
  el.question.classList.toggle('muted', !q);
}

function showError(msg) {
  el.joinError.textContent = msg;
  el.joinError.hidden = false;
}

function leave() {
  store.clearPlayer();
  if (channel) supabase.removeChannel(channel);
  location.reload();
}

// ---------- ربط الأحداث ----------
function wire() {
  el.joinBtn.addEventListener('click', join);
  el.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  el.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.codeInput.focus(); });
  el.codeInput.addEventListener('input', () => {
    el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  el.buzzBtn.addEventListener('click', buzz);
  el.leaveBtn.addEventListener('click', leave);
}

async function init() {
  wire();
  el.nameInput.value = store.name;
  el.codeInput.value = store.code;
  await resume(); // استئناف تلقائي لو فيه جلسة محفوظة
}

init();
