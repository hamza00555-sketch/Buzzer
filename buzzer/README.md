# 🔔 الباصرة (Quiz Buzzer)

تطبيق **باصرة مسابقات لحظي**: المضيف ينشئ غرفة بكود، واللاعبون يدخلون من موبايلاتهم بنفس الكود،
وأول ما يضغطوا يظهر **ترتيب الضغط (1، 2، 3...)** بعدالة محسومة من ساعة السيرفر.

> توثيق شامل في [`DOCUMENTATION.md`](./DOCUMENTATION.md).

## التشغيل محلياً
```bash
# من جذر المستودع
python3 -m http.server 8000
# ثم افتح:
#   المضيف:  http://localhost:8000/buzzer/host.html
#   اللاعب:  http://localhost:8000/buzzer/player.html
```
> المتصفح يحتاج إنترنت لتحميل مكتبة Supabase من `esm.sh` وللاتصال بقاعدة البيانات.

## التقنية
- HTML/CSS/JavaScript عادي (ES Modules) — **بدون build step**.
- Backend: **Supabase** (Postgres + Realtime).
- عربي RTL.

## الإعداد
الاتصال بـ Supabase في [`js/config.js`](./js/config.js). لإعادة بناء قاعدة البيانات من الصفر
شغّل [`schema.sql`](./schema.sql) في Supabase SQL Editor.

## البنية
```
buzzer/
├── index.html        # اختيار الدور (مضيف / لاعب)
├── host.html         # شاشة المضيف
├── player.html       # شاشة اللاعب
├── schema.sql        # مخطط قاعدة البيانات
├── css/styles.css    # التصميم
└── js/
    ├── config.js     # إعدادات Supabase
    ├── supabase.js   # تهيئة العميل
    ├── common.js     # أدوات مشتركة (الكود، الصوت، الاهتزاز، التخزين)
    ├── host.js       # منطق المضيف
    └── player.js     # منطق اللاعب
```

## النشر
static خالص — انشره على Vercel (مربوط بـ GitHub) أو أي استضافة static.
الإنتاج يخدم من فرع `claude/buzzer-app-rebuild-sd6daq` (راجع `vercel.json` في جذر المستودع).
