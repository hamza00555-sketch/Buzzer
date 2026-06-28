// تعريفات أوضاع اللعب — مرجع مشترك للمضيف واللاعب وشاشة العرض.

export const MODES = {
  buzz: {
    key: 'buzz',
    name: 'الباصرة',
    emoji: '⚡',
    desc: 'أول من يضغط يجاوب، والمضيف يعطي النقطة.',
    defaultDuration: 0,      // بدون مؤقّت افتراضياً
  },
  mcq: {
    key: 'mcq',
    name: 'اختيار من متعدد',
    emoji: '🎯',
    desc: 'سؤال + خيارات، الكل يجاوب خلال مؤقّت، نقاط للصح + بونص سرعة.',
    defaultDuration: 20,
  },
  feud: {
    key: 'feud',
    name: 'اعرف الإجابات',
    emoji: '👨‍👩‍👧',
    desc: 'إجابات مخفية متعددة، اللاعبون يخمّنون وكل إجابة صح تنكشف وتعطي نقاط.',
    defaultDuration: 60,
  },
  closest: {
    key: 'closest',
    name: 'أقرب رقم',
    emoji: '🔢',
    desc: 'سؤال رقمي، الأقرب للرقم الصحيح يكسب.',
    defaultDuration: 30,
  },
};

export const MODE_LIST = Object.values(MODES);

// نقاط بونص السرعة في اختيار من متعدد: من 1000 (فوري) إلى 500 (آخر لحظة).
export function mcqPoints(correct, elapsedMs, durationMs) {
  if (!correct) return 0;
  if (!durationMs) return 1000;
  const frac = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return Math.round(500 + 500 * (1 - frac));
}

// نقاط أقرب رقم حسب الترتيب (الأقرب أولاً).
export const CLOSEST_POINTS = [10, 6, 3];

// التحقق هل لاعب أرسل إجابة في هذه الجولة (لأوضاع الإجابة الواحدة).
export function hasAnswered(answers, playerId, round) {
  return answers.some((a) => a.player_id === playerId && a.round === round);
}
