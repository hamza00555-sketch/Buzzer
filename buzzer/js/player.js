// منطق اللاعب: انضمام بالكود، إدخال حسب وضع اللعب، الصوت/الاهتزاز، الترتيب والنقاط.
import { supabase } from './supabase.js';
import {
  $, escapeHtml, remainingSeconds,
  playBuzz, playArm, playCorrect, playWrong, vibrate, unlockAudio, store,
} from './common.js';
import { MODES } from './modes.js';

let room = null, me = null, channel = null, timer = null;
let buzzedRound = -1;          // آخر جولة ضغطت فيها (buzz)
let answeredRound = -1;        // آخر جولة جاوبت فيها (mcq/closest)

const el = {
  join: $('#join'), game: $('#game'),
  nameInput: $('#nameInput'), codeInput: $('#codeInput'), joinBtn: $('#joinBtn'), joinError: $('#joinError'),
  meName: $('#meName'), roomCode: $('#roomCode'), myScore: $('#myScore'),
  stateLabel: $('#stateLabel'), timerLabel: $('#timerLabel'),
  question: $('#question'), playArea: $('#playArea'), leaveBtn: $('#leaveBtn'),
};

// ============ انضمام / استئناف ============
async function join() {
  const name = el.nameInput.value.trim();
  const code = el.codeInput.value.trim().toUpperCase();
  el.joinError.hidden = true;
  if (!name) return showError('اكتب اسمك');
  if (code.length < 4) return showError('اكتب كود الغرفة (4 حروف)');
  el.joinBtn.disabled = true;
  const { data: rm, error } = await supabase.from('rooms').select('*').eq('code', code).single();
  if (error || !rm) { el.joinBtn.disabled = false; return showError('لم يتم العثور على غرفة بهذا الكود'); }
  const { data: pl, error: e2 } = await supabase.from('players')
    .insert({ room_id: rm.id, name, score: 0 }).select().single();
  if (e2) { el.joinBtn.disabled = false; return showError('تعذّر الدخول: ' + e2.message); }
  room = rm; me = pl;
  store.name = name; store.code = code; store.playerId = me.id; store.roomId = room.id;
  el.joinBtn.disabled = false;
  enterGame();
}

async function resume() {
  const pid = store.playerId, rid = store.roomId;
  if (!pid || !rid) return;
  const [{ data: rm }, { data: pl }] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', rid).single(),
    supabase.from('players').select('*').eq('id', pid).single(),
  ]);
  if (!rm || !pl) { store.clearPlayer(); return; }
  room = rm; me = pl;
  enterGame();
}

function enterGame() {
  el.join.hidden = true;
  el.game.hidden = false;
  el.meName.textContent = me.name;
  el.roomCode.textContent = room.code;
  renderScore();
  subscribe();
  render(false);
  startTimer();
}

// ============ الاشتراك اللحظي ============
function subscribe() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel('room-' + room.id);
  channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
    ({ new: n }) => onRoomUpdate(n));
  channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${me.id}` },
    ({ new: n }) => { me = n; renderScore(); });
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'buzzes', filter: `room_id=eq.${room.id}` },
    ({ new: n }) => { if (room.mode === 'buzz' && n.round === room.round) refreshMyRank(); });
  channel.subscribe();
}

function onRoomUpdate(n) {
  const newRound = n.round !== room.round;
  const becameLive = n.phase === 'live' && (room.phase !== 'live' || newRound);
  const becameReveal = n.phase === 'reveal' && room.phase !== 'reveal';
  room = n;
  if (newRound) { buzzedRound = -1; answeredRound = -1; }
  if (becameLive) { unlockAudio(); playArm(); vibrate(150); }
  render(becameLive);
  if (room.phase === 'live') startTimer(); else stopTimer();
  if (becameReveal) revealFeedback();
}

// ============ الإدخال حسب الوضع ============
async function buzz() {
  if (room.mode !== 'buzz' || room.phase !== 'live' || buzzedRound === room.round) return;
  unlockAudio(); playBuzz(); vibrate([40, 30, 70]);
  buzzedRound = room.round;
  const btn = $('#buzzBtn'); if (btn) { btn.classList.add('buzzed'); btn.disabled = true; }
  const { error } = await supabase.from('buzzes')
    .insert({ room_id: room.id, round: room.round, player_id: me.id });
  if (error && error.code !== '23505') { buzzedRound = -1; if (btn) { btn.classList.remove('buzzed'); btn.disabled = false; } return; }
  refreshMyRank();
}

async function refreshMyRank() {
  const { data } = await supabase.from('buzzes').select('player_id, created_at')
    .eq('room_id', room.id).eq('round', room.round).order('created_at');
  if (!data) return;
  const idx = data.findIndex((b) => b.player_id === me.id);
  const rank = $('#rank');
  if (!rank) return;
  if (idx === -1) { if (room.phase === 'live') rank.textContent = ''; return; }
  buzzedRound = room.round;
  const btn = $('#buzzBtn'); if (btn) { btn.classList.add('buzzed'); btn.disabled = true; }
  rank.innerHTML = idx === 0 ? '🥇 أنت الأول!' : `أنت رقم <strong>#${idx + 1}</strong>`;
}

async function pickMcq(i) {
  if (room.phase !== 'live' || answeredRound === room.round) return;
  answeredRound = room.round;
  unlockAudio(); vibrate(40);
  document.querySelectorAll('.opt-btn').forEach((b, idx) => {
    b.disabled = true; if (idx === i) b.classList.add('picked');
  });
  $('#playMsg').textContent = 'تم تسجيل اختيارك ✓';
  const { error } = await supabase.from('answers')
    .insert({ room_id: room.id, round: room.round, player_id: me.id, value: String(i) });
  if (error && error.code !== '23505') { answeredRound = -1; $('#playMsg').textContent = 'تعذّر، حاول تاني'; }
}

async function submitClosest() {
  const inp = $('#closestInput'); if (!inp) return;
  const num = Number(inp.value);
  if (!Number.isFinite(num) || room.phase !== 'live' || answeredRound === room.round) return;
  answeredRound = room.round;
  unlockAudio(); vibrate(40);
  inp.disabled = true; $('#closestSubmit').disabled = true;
  $('#playMsg').textContent = `خمّنت: ${num} ✓`;
  const { error } = await supabase.from('answers')
    .insert({ room_id: room.id, round: room.round, player_id: me.id, value: String(num) });
  if (error && error.code !== '23505') { answeredRound = -1; inp.disabled = false; $('#closestSubmit').disabled = false; }
}

// ============ العرض ============
function render() {
  const m = MODES[room.mode] || MODES.buzz;
  const q = (room.question || '').trim();
  el.question.textContent = room.phase === 'lobby' ? 'استنى المضيف يبدأ الجولة…' : (q || m.name);
  el.question.classList.toggle('muted', room.phase === 'lobby');
  el.stateLabel.dataset.state = room.phase;
  el.stateLabel.textContent = { lobby: 'في الانتظار', live: 'الجولة شغّالة', reveal: 'النتيجة' }[room.phase] || room.phase;

  if (room.phase === 'lobby') { el.playArea.innerHTML = '<p class="hint">جهّز نفسك… 🔔</p>'; return; }
  if (room.mode === 'buzz') return renderBuzz();
  if (room.mode === 'mcq') return renderMcq();
  if (room.mode === 'feud') return renderFeud();
  if (room.mode === 'closest') return renderClosest();
}

function renderBuzz() {
  const armed = room.phase === 'live';
  const already = buzzedRound === room.round;
  el.playArea.innerHTML = `
    <div class="buzz-stage">
      <button id="buzzBtn" class="buzz-btn" data-armed="${armed && !already}" ${armed && !already ? '' : 'disabled'}>اضغط!</button>
      <div class="rank-line" id="rank"></div>
    </div>`;
  $('#buzzBtn').addEventListener('click', buzz);
  if (already) { $('#buzzBtn').classList.add('buzzed'); refreshMyRank(); }
}

function renderMcq() {
  const opts = room.payload?.options || [];
  const correct = room.payload?.correct;
  const reveal = room.phase === 'reveal';
  const already = answeredRound === room.round;
  el.playArea.innerHTML = `
    <div class="opt-grid play">${opts.map((o, i) => `
      <button class="opt-btn ${reveal && i === correct ? 'correct' : ''}" data-i="${i}" ${reveal || already ? 'disabled' : ''}>
        <b>${'ABCD'[i] || i + 1}</b> ${escapeHtml(o)}
      </button>`).join('')}</div>
    <p class="play-msg" id="playMsg">${reveal ? '' : (already ? 'تم تسجيل اختيارك ✓' : 'اختر إجابتك')}</p>`;
  if (!reveal && !already) {
    document.querySelectorAll('.opt-btn').forEach((b) => b.addEventListener('click', () => pickMcq(Number(b.dataset.i))));
  }
}

function renderFeud() {
  // وضع شفهي: اللاعب يجاوب بصوته، والمضيف يكشف الإجابات. لا إدخال هنا.
  const total = room.payload?.total || 0;
  const revealed = room.payload?.revealed || [];
  const revMap = new Map(revealed.map((r) => [r.idx ?? -1, r]));
  const slots = [];
  for (let i = 0; i < total; i++) {
    const r = revMap.get(i);
    const mine = r && r.by === me.id;
    slots.push(r
      ? `<li class="feud-slot done${mine ? ' mine' : ''}"><span>${escapeHtml(r.text)}</span><b>+${r.points}${mine ? ' (أنت 🎉)' : ''}</b></li>`
      : `<li class="feud-slot"><span>؟ ؟ ؟</span></li>`);
  }
  el.playArea.innerHTML = `
    <ul class="feud-board">${slots.join('')}</ul>
    <p class="hint">${room.phase === 'live' ? '🎙️ جاوب بصوتك! المضيف يكشف الإجابات على الشاشة.' : 'انتهت الجولة.'}</p>`;
}

function renderClosest() {
  const reveal = room.phase === 'reveal';
  const already = answeredRound === room.round;
  const unit = room.payload?.unit || '';
  if (reveal) {
    const target = room.payload?.target;
    const mine = (room.payload?.results || []).find((r) => r.player_id === me.id);
    el.playArea.innerHTML = `<p class="big-count">الرقم الصحيح: ${target} ${escapeHtml(unit)}</p>
      <p class="play-msg">${mine ? `خمّنت ${mine.value} (فرق ${mine.diff})${mine.points ? ` · +${mine.points} 🎉` : ''}` : 'ما خمّنت هالجولة'}</p>`;
    return;
  }
  el.playArea.innerHTML = `
    <div class="row mt">
      <input id="closestInput" type="number" placeholder="رقمك…" ${already ? 'disabled' : ''} />
      <button id="closestSubmit" class="btn" style="width:auto" ${already ? 'disabled' : ''}>أرسل</button>
    </div>
    <p class="play-msg" id="playMsg">${already ? 'تم تسجيل تخمينك ✓' : `اكتب أقرب رقم ${escapeHtml(unit)}`}</p>`;
  if (!already) {
    $('#closestSubmit').addEventListener('click', submitClosest);
    $('#closestInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitClosest(); });
  }
}

function revealFeedback() {
  if (room.mode === 'mcq') {
    const correct = room.payload?.correct;
    const mineBtn = document.querySelector('.opt-btn.picked');
    const myIdx = mineBtn ? Number(mineBtn.dataset.i) : null;
    if (myIdx === correct) { playCorrect(); vibrate([60, 40, 80]); }
    else if (myIdx != null) { playWrong(); }
  }
}

function renderScore() { el.myScore.textContent = me?.score || 0; }

// ============ المؤقّت ============
function startTimer() {
  stopTimer();
  const dur = room.payload?.duration || 0;
  if (room.phase !== 'live' || !dur) { el.timerLabel.textContent = ''; return; }
  const tick = () => {
    const left = remainingSeconds(room.round_started_at, dur);
    el.timerLabel.textContent = `⏱ ${left}`;
    if (left <= 0) stopTimer();
  };
  tick();
  timer = setInterval(tick, 500);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } el.timerLabel.textContent = ''; }

// ============ أدوات ============
function showError(msg) { el.joinError.textContent = msg; el.joinError.hidden = false; }
function leave() { store.clearPlayer(); if (channel) supabase.removeChannel(channel); location.reload(); }

function wire() {
  el.joinBtn.addEventListener('click', join);
  el.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.codeInput.focus(); });
  el.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  el.codeInput.addEventListener('input', () => {
    el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  el.leaveBtn.addEventListener('click', leave);
}

async function init() {
  wire();
  el.nameInput.value = store.name;
  el.codeInput.value = store.code;
  await resume();
}
init();
