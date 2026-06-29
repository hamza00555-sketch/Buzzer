// جولات جاهزة — كل جولة سلسلة أسئلة بأنواع مختلفة، يمشي عليها المضيف سؤالاً سؤالاً.
// كل عنصر = { mode, q, ... } بنفس حقول وضعه (mcq: options+correct · feud: answers · closest: target+unit).
export const PACKS = [
  {
    id: 'mixed',
    name: 'جولة منوّعة',
    desc: 'كل الأنواع مع بعض',
    items: [
      { mode: 'buzz', q: 'ما هي عاصمة اليابان؟' },
      { mode: 'mcq', q: 'ما أكبر محيط في العالم؟', options: ['الأطلسي', 'الهندي', 'الهادئ', 'المتجمد'], correct: 2 },
      { mode: 'feud', q: 'اذكر شيئًا يوجد في كل بيت', answers: [
        { text: 'باب', points: 30 }, { text: 'ثلاجة', points: 25 }, { text: 'تلفزيون', points: 20 }, { text: 'سرير', points: 15 }, { text: 'مطبخ', points: 10 } ] },
      { mode: 'closest', q: 'كم عدد دول العالم المعترف بها؟', target: 195, unit: 'دولة' },
      { mode: 'mcq', q: 'كم عدد ألوان قوس قزح؟', options: ['5', '6', '7', '8'], correct: 2 },
      { mode: 'buzz', q: 'من رسم لوحة الموناليزا؟' },
      { mode: 'closest', q: 'كم يبلغ ارتفاع برج خليفة؟', target: 828, unit: 'متر' },
      { mode: 'feud', q: 'اذكر وسيلة مواصلات', answers: [
        { text: 'سيارة', points: 30 }, { text: 'طائرة', points: 25 }, { text: 'قطار', points: 20 }, { text: 'باص', points: 15 }, { text: 'دراجة', points: 10 } ] },
    ],
  },
  {
    id: 'fast',
    name: 'جولة سريعة',
    desc: '5 أسئلة خفيفة',
    items: [
      { mode: 'buzz', q: 'ما أكبر كوكب في المجموعة الشمسية؟' },
      { mode: 'mcq', q: 'ما هو أسرع حيوان بري؟', options: ['الأسد', 'الفهد', 'الحصان', 'الغزال'], correct: 1 },
      { mode: 'buzz', q: 'ما هو أطول نهر في العالم؟' },
      { mode: 'mcq', q: 'في أي سنة هبط الإنسان على القمر؟', options: ['1959', '1969', '1979', '1989'], correct: 1 },
      { mode: 'closest', q: 'كم عدد حروف اللغة العربية؟', target: 28, unit: 'حرف' },
    ],
  },
  {
    id: 'wedding',
    name: 'جولة الفرح',
    desc: 'بنكهة الأعراس',
    items: [
      { mode: 'feud', q: 'اذكر شيئًا يُهدى في الأعراس', answers: [
        { text: 'ذهب', points: 30 }, { text: 'عطر', points: 25 }, { text: 'ورد', points: 20 }, { text: 'مال', points: 15 }, { text: 'ساعة', points: 10 } ] },
      { mode: 'closest', q: 'كم عدد المدعوين الليلة (تخمين)؟', target: 250, unit: 'مدعو' },
      { mode: 'mcq', q: 'ما اللون الأشهر لفستان العروس؟', options: ['الأحمر', 'الأبيض', 'الأزرق', 'الذهبي'], correct: 1 },
      { mode: 'buzz', q: 'مَن أسرع: العريس أم إخوانه في الوصول للكوشة؟' },
      { mode: 'feud', q: 'اذكر شيئًا تراه في كل عرس', answers: [
        { text: 'كوشة', points: 30 }, { text: 'كيك', points: 25 }, { text: 'تصوير', points: 20 }, { text: 'ضيوف', points: 15 }, { text: 'زفّة', points: 10 } ] },
      { mode: 'closest', q: 'كم دقيقة تأخّر العريس (تخمين)؟', target: 30, unit: 'دقيقة' },
    ],
  },
];
