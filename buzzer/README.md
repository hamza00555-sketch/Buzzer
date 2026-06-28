# 🔔 الباصرة (Quiz Buzzer + أوضاع لعب)

تطبيق **مسابقات لحظي** للأعراس بثلاثة أدوار (**لاعب / مضيف / شاشة عرض**) وأربعة أوضاع لعب:
**⚡ الباصرة** (أول من يضغط، بعدالة من ساعة السيرفر) · **🎯 اختيار من متعدد** · **👨‍👩‍👧 اعرف الإجابات (Family Feud)** · **🔢 أقرب رقم**.

> توثيق شامل في [`DOCUMENTATION.md`](./DOCUMENTATION.md).

## التشغيل محلياً
```bash
# من جذر المستودع
python3 -m http.server 8000
# ثم افتح:
#   المضيف:  http://localhost:8000/buzzer/host.html
#   اللاعب:  http://localhost:8000/buzzer/player.html
#   العرض:   http://localhost:8000/buzzer/display.html
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
├── index.html        # اختيار الدور (لاعب / مضيف / عرض)
├── host.html         # شاشة المضيف
├── player.html       # شاشة اللاعب
├── display.html      # شاشة العرض (التلفزيون)
├── schema.sql        # مخطط قاعدة البيانات
├── css/styles.css    # التصميم
└── js/
    ├── config.js     # إعدادات Supabase
    ├── supabase.js   # تهيئة العميل
    ├── common.js     # أدوات مشتركة (الكود، الصوت، الاهتزاز، المؤقّت، التطبيع، التخزين)
    ├── modes.js      # تعريفات أوضاع اللعب + دوال الحساب
    ├── host.js       # منطق المضيف
    ├── player.js     # منطق اللاعب
    └── display.js    # منطق شاشة العرض
```

## النشر
static خالص — انشره على Vercel (مربوط بـ GitHub) أو أي استضافة static.
الإنتاج يخدم من فرع `claude/buzzer-app-rebuild-sd6daq` (راجع `vercel.json` في جذر المستودع).
