// دوال مشتركة: توليد الكود، الأصوات (WebAudio)، الاهتزاز، helpers، التخزين المحلي.

// حروف/أرقام واضحة بدون الملتبس (لا 0/O ولا 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(len = 4) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

// helpers مختصرة للـ DOM
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ===== الصوت (WebAudio) =====
let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}

// لازم تتنادى داخل تفاعل مستخدم (ضغطة) عشان المتصفح يسمح بالصوت.
export function unlockAudio() {
  const c = ctx();
  if (c && c.state === 'suspended') c.resume();
}

function tone(freq, dur, type = 'sine', gain = 0.2, when = 0) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// صوت الباصرة عند الضغط (نغمة هابطة قوية).
export function playBuzz() {
  tone(880, 0.12, 'square', 0.25, 0);
  tone(440, 0.20, 'square', 0.22, 0.07);
}

// نغمة تنبيه لما الباصرة تجهز (نغمتان صاعدتان).
export function playArm() {
  tone(523.25, 0.12, 'sine', 0.22, 0);
  tone(783.99, 0.20, 'sine', 0.22, 0.12);
}

// اهتزاز الموبايل لو مدعوم.
export function vibrate(pattern = 60) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) { /* تجاهل */ }
  }
}

// ===== التخزين المحلي =====
const LS = window.localStorage;
const k = (name) => `buzzer.${name}`;
export const store = {
  get name() { return LS.getItem(k('name')) || ''; },
  set name(v) { LS.setItem(k('name'), v || ''); },
  get code() { return LS.getItem(k('code')) || ''; },
  set code(v) { LS.setItem(k('code'), v || ''); },
  get playerId() { return LS.getItem(k('playerId')) || ''; },
  set playerId(v) { LS.setItem(k('playerId'), v || ''); },
  get roomId() { return LS.getItem(k('roomId')) || ''; },
  set roomId(v) { LS.setItem(k('roomId'), v || ''); },
  clearPlayer() { LS.removeItem(k('playerId')); LS.removeItem(k('roomId')); },
};

// نص فرق التوقيت بالملي ثانية بالنسبة لأول ضغطة.
export function formatDelta(ms) {
  if (ms == null) return '';
  if (ms <= 0) return 'الأول';
  if (ms < 1000) return `+${Math.round(ms)} مل.ث`;
  return `+${(ms / 1000).toFixed(2)} ث`;
}

// قراءة باراميتر من الرابط (?code=ABCD)
export function urlParam(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

// تطبيع النص العربي للمقارنة (Family Feud): إزالة التشكيل وتوحيد الحروف.
export function normalizeAr(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // تشكيل + تطويل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[^ء-يa-z0-9 ]/g, '') // رموز
    .replace(/\s+/g, ' ')
    .trim();
}

// الوقت المتبقّي (ثوانٍ) لجولة بدأت في startedAt ومدتها duration (ثانية).
export function remainingSeconds(startedAt, duration) {
  if (!startedAt || !duration) return 0;
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(duration - elapsed));
}

// أصوات إضافية للأوضاع الجديدة.
export function playTick() {
  tone(660, 0.05, 'sine', 0.12, 0);
}
export function playCorrect() {
  tone(659.25, 0.12, 'sine', 0.22, 0);
  tone(987.77, 0.18, 'sine', 0.22, 0.12);
}
export function playWrong() {
  tone(220, 0.22, 'sawtooth', 0.18, 0);
}
