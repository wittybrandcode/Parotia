# خطة إصلاح Parotia الشاملة

> مرجعية: `PAROTIA-REPORT.md` (2026-08-15) · تاريخ بدء الخطة: 2026-08-15
> الغرض: معالجة جميع المخاطر والفجوات المكتشفة في التقرير الشامل، بمراحل مرتبة بالأولوية، ونظام تتبع تنفيذ صارم.

---

## 1. قواعد اللعب (نظام التتبع)

### 1.1 معايير الحالة
| الرمز | المعنى |
|---|---|
| 🔴 | لم تبدأ بعد |
| 🟡 | قيد التنفيذ (مهمة واحدة نشطة لكل مرحلة) |
| 🟢 | مكتملة ومُتحقَّق منها |
| 🗑️ | أُلغيت الحاجة إليها / أُزيلت |

### 1.2 تعريف "مكتملة" (Definition of Done)
أي مهمة لا تُعتبر 🟢 إلا بعد:
1. تنفيذ التغيير في المصدر/الاختبارات/الوثائق.
2. مرور **البوابة كاملة**: `npm run typecheck && npm run lint && npm run test && npm run build`.
3. تسجيل سطر في **سجل التنفيذ** (§4) بتاريخ ووصف.

### 1.3 قواعد التقدم
- لا تُفعَّل إلا مهمة واحدة 🟡 لكل مرحلة (نقطة تركيز واحدة).
- تُفتح المرحلة التالية فقط بعد إغلاق السابقة (علامة 🟢 على كل مهماتها أو 🗑️ المبرَّرة).
- أي مهمة تتطلب قراراً من المستخدم (مثل git commit أو حذف سكربت) تُؤشَّر بطلب موافقة صريحة قبل تنفيذها.

---

## 2. لوحة المتابعة (Dashboard)

| # | المرحلة | الهدف | الحالة | التقدم |
|---|---|---|---|---|
| 0 | التأسيس — نقطة استعادة | أول commit + تنظيم ملفات القرار | 🟢 | `[1/1] ██████████` |
| 1 | تثبيت الاختبارات | سدّ الفجوات الحرجة (SW/content/UI) | 🟢 | `[8/8] ██████████` |
| 2 | إصلاحات وظيفية | إصلاح الخلل الوظيفي في الحماية والرسائل | 🟢 | `[6/6] ██████████` |
| 3 | الأمان والصلاحيات | ترشيد الصلاحيات + توحيد الإصدارات | 🟢 | `[4/4] ██████████` |
| 4 | إزالة الكود الميت | تنظيف وتبسيط الأسس | 🟢 | `[7/7] ██████████` |
| 5 | الأدوات والبنية | تفعيل E2E/التغطية + تحسينات UX | 🔴 | `[0/3] ░░░░░░░░░░` |
| 6 | التوثيق والتحكّم | تحديث README/ROADMAP + commit نهائي | 🔴 | `[0/4] ░░░░░░░░░░` |
| 7 | التقاط الحيّز الحر | تحديد أي مكوّن HTML بمربع الماوس وتصويره مباشرة | 🔴 | `[0/7] ░░░░░░░░░░` |
| | **الإجمالي** | | 🟢 | `[26/40] █████░░░░░` |

> عند إغلاق أي مهمة يُحدَّث الرقم والرقم العشري والنسبة المئوية في هذه اللوحة.

---

## 3. المراحل والتنفيذ

### المرحلة 0 — التأسيس: نقطة استعادة
**الهدف:** حماية العمل الحالي قبل أي تعديل.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 0.1 | أول commit للمشروع (يتطلب موافقة صريحة) | 🟢 | كل الملفات عدا `dist/` و`node_modules/` | `git log` يظهر commit أول نظيف (`9e34ca9`) |

---

### المرحلة 1 — تثبيت الاختبارات (أولوية عالية)
**الهدف:** تغطية طبقات التنسيق والواجهات — أكبر فجوة في المشروع.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 1.1 | اختبارات `cleanupEngine` الكاملة (delete/hide/keep/show/undo/redo/undoThrough/reset/عدّادات) | 🟢 | `tests/content/cleanup/cleanupEngine.test.ts` (جديد) · `src/content/cleanup/cleanupEngine.ts` | 26 اختباراً: العدّادات، التراجع/الإعادة، reset، الانتقاء عبر inspector |
| 1.2 | اختبارات تكامل `service-worker.ts` (توجيه الأوامر، `tabSessions`، أوامر CAPTURE مع chrome مُحاكى) | 🟢 | `tests/background/service-worker.test.ts` (جديد) · `tests/setup.ts` | 12 اختباراً؛ مسارات النجاح/الفشل/الجلسة الغائبة + `onTabRemoved` |
| 1.3 | اختبارات تكامل `content/index.ts` (مولّد الأوامر، GET_STATE، بث STATE، تطبيق القواعد التلقائي) | 🟢 | `tests/content/contentIndex.test.ts` (جديد) | 10 اختبارات تغطي router + PING + APPLY_PRESET + auto-apply |
| 1.4 | اختبارات UI: `App.tsx` + `options.tsx` (أزرار، لوحة السجل، حالات Undo/Redo المعطّلة) | 🟢 | `tests/ui/app.test.tsx` (جديد) · `tests/ui/options.test.tsx` (جديد) · إضافة `@testing-library/react` + `@testing-library/jest-dom` | 11 اختبارات مكوّنات (export من OptionsApp للتّيست) |
| 1.5 | اختبارات `presets/engine.ts` + `validator.ts` (تصنيف الصحة HEALTHY/DEGRADED/STALE/BROKEN) | 🟢 | `tests/presets/validator.test.ts` (جديد) · `tests/presets/engine.test.ts` (جديد) | 8 + 8 اختبارات |
| 1.6 | اختبارات `shared/utils/selector.ts` (صلاحية الصياغة، توليد المحدّدات، المحدّد البنيوي) | 🟢 | `tests/shared/utils/selector.test.ts` (جديد) | 10 اختبارات + هروب الحروف الخاصة؛ محاكاة متصفّح صارم (happy-dom متساهل في الصياغة) |
| 1.7 | اختبارات `capture/captureStitcher.ts` (هندسة الشرائح/الخياطة) و`shared/utils/filename.ts` | 🟢 | `tests/content/capture/captureStitcher.test.ts` · `tests/shared/utils/filename.test.ts` (جديدان) | 8 + 9 اختبارات (مع محاكاة canvas/ImageBitmap/FileReader) |
| 1.8 | إسكات ضجيج `overlay.test.ts` (ستاب `getURL` إلى `about:blank`) | 🟢 | `tests/content/overlay/overlay.test.ts` · `tests/setup.ts` | صفر ضجيج stderr في تشغيل الاختبارات |

**البوابة:** بعد إغلاق كل مهمات 1.1–1.8 → `typecheck + lint + test + build` خضراء ✅ (223 اختباراً، والهدف تجاوز 170 تحقق).

---

### المرحلة 2 — إصلاحات وظيفية (أولوية عالية)
**الهدف:** معالجة الخلل الوظيفي الفعلي المكتشف في التقرير.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 2.1 | إصلاح تسرّب علامات الحماية: `reset()` يزيل `data-newsclean-keep` من DOM مع تصفير `protectedTargets` | 🟢 | `src/content/mutation/mutationEngine.ts` · `src/content/cleanup/cleanupEngine.ts` · `tests/content/cleanup/cleanupEngine.test.ts` | بعد Reset، العنصر المحمي قابل للحذف من جديد (اختبار إثبات) |
| 2.2 | جعل `Keep` قابلاً للتراجع (أمر history يضبط/يزيل العلامة) | 🟢 | `src/content/mutation/mutationEngine.ts` · `src/content/mutation/history.ts` · `src/content/cleanup/cleanupEngine.ts` · `tests/content/cleanup/cleanupEngine.test.ts` | Undo يزيل علامة keep و Redo يعيدها (اختباران + محددات safety) |
| 2.3 | تحقق زمني لشكل الـ payload عند الحدود (SW + content): `sessionId`/`elementId`/`selector` | 🟢 | `src/shared/types/messages.ts` · `src/background/service-worker.ts` · `src/content/index.ts` | رسائل مشوّهة تُرفض بـ `INVALID_PAYLOAD` دون تنفيذ (اختبارات SW + content) |
| 2.4 | استعادة الجلسة بعد إعادة تشغيل SW الخامل (إعادة تسجيل من content عند `SESSION_NOT_FOUND`) | 🟢 | `src/background/service-worker.ts` · `tests/background/service-worker.test.ts` | بعد SW restart، أمر عادي يُعاد تسجيله ويعمل (اختبار إعادة التسجيل) |
| 2.5 | احترام معرّف الرسالة: الرد بـ `id` المطلوب بدل `""` | 🟢 | `src/background/service-worker.ts` · `tests/background/service-worker.test.ts` | الردود تعكس id الطلب (اختبار) |
| 2.6 | إصلاح تشخيصات التجميد (دلالة `mutationObserverBlocked` + قيم `animationCount`/`transitionCount`) | 🟢 | `src/content/freeze/freezeEngine.ts` · `tests/content/freeze/freezeEngine.test.ts` | تشخيصات صحيحة دلالياً + اختبارات الحجب والفشل |

**البواقة:** البوابة كاملة خضراء + لا تراجع عن اختبارات المرحلة 1 (239 اختباراً).

---

### المرحلة 3 — الأمان والصلاحيات (متوسطة)
**الهدف:** مطابقة السطح الأمني لخطة SECURITY.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 3.1 | ترشيد الصلاحيات: إزالة `tabs` (استخدامات `chrome.tabs.*` لا تتطلبها) + حذف `host_permissions` (الاعتماد على `activeTab`) + تضييق `web_accessible_resources.matches` إلى `http`/`https` | 🟢 | `scripts/build-manifest.mjs` | لا `tabs` ولا `host_permissions` في الـ manifest المولَّد؛ WAF مقصورة على `http/https`؛ البوابة خضراء (الفحص اليدوي على صفحات تجريبية موثَّق تعذّره في البيئة، §5) |
| 3.2 | جعل `downloads` اختيارياً (optional_permissions + طلب عند أول تصدير) | 🟢 | `scripts/build-manifest.mjs` · `src/background/service-worker.ts` · `tests/background/service-worker.test.ts` | `optional_permissions: ["downloads"]`؛ `downloadPng` تستعلم `chrome.permissions.contains`/`request`؛ عند الرفض يُرجع التقاط `{ success:false, error }` بدل رمي `INTERNAL` (اختبار رفض) |
| 3.3 | توحيد الإصدارات + حذف `public/manifest.json` القديم | 🟢 | `package.json` · `package-lock.json` · `scripts/build-manifest.mjs` · `public/manifest.json` (محذوف) · `ROADMAP.md` | إصدار واحد `0.2.0` يُقرأ من `package.json` في `build-manifest.mjs`؛ لا `public/manifest.json` |
| 3.4 | تشديد `postMessage` بتمرير `targetOrigin` للمصدر (أصل الامتداد) بدل `"*"` | 🟢 | `src/content/index.ts` (broadcastState) · `src/ui/src/App.tsx` · `src/content/overlay/overlay.ts` · `src/ui/src/main.tsx` · `tests/ui/app.test.tsx` · `tests/content/overlay/overlay.test.ts` | STATE يُرسل إلى أصل الامتداد فقط ولا يُقبل من نوافذ خارجية (`event.source !== window.parent` → تجاهل، اختبار)؛ RESIZE مقبول فقط من إطار الشريط ومن أصل الامتداد (اختبار) |

---

### المرحلة 4 — إزالة الكود الميت والتبسيط (صيانة)
**الهدف:** تقليص التعقيد ومسارات التطبيق المتوازية.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 4.1 | توحيد مساري تطبيق القواعد: استخدام `cleanupEngine.applyPreset` والاستغناء عن `DefaultPresetEngine`/`buildCleanupIntents` | 🟢 | `src/presets/engine.ts` (محذوف) · `src/shared/types/cleanup.ts` · `src/shared/types/preset.ts` | مسار واحد للتطبيق؛ حُذف `CleanupIntent` و`PresetApplicationResult`؛ اختبارات القواعد خضراء |
| 4.2 | حسم مصير `InMemorySessionStore` (توصيله بالـ SW أو حذفه مع اختباره) | 🟢 | `src/storage/sessionStore.ts` (محذوف) · `tests/storage/sessionStore.test.ts` (محذوف) | لا كود ميت في `src` — الـ SW يحتفظ بخريطته `tabSessions` الخاصة |
| 4.3 | حسم مصير `UserSettings`/`ChromeStorageSettingsRepository` (بناء شاشة إعدادات أو الحذف) | 🟢 | `src/shared/types/settings.ts` (محذوف) · `src/storage/chromeStorageRepositories.ts` · `src/storage/repository.ts` · `src/storage/schema.ts` | لا أنواع بلا استهلاك — حُذف كل عقد الإعدادات والـ schema الميت (`STORAGE_KEYS` أيضاً) |
| 4.4 | حسم مصير `EventBus` (تنفيذ بسيط أو إزالة العقد) | 🟢 | `src/shared/types/events.ts` (محذوف) | لا واجهات بلا تنفيذ — حُذفت مع re-exports من `types/index.ts` |
| 4.5 | حذف الاسم المستعار الميت `@capture` من vite/tsconfig/vitest | 🟢 | `vite.config.ts` · `tsconfig.json` · `vitest.config.ts` · `scripts/build-esm.mjs` | إزالة التوجيه من الملفات الأربعة (منها `build-esm.mjs` غير المذكور في الخطة) |
| 4.6 | حذف الكود الميت داخل `restoreNode` + `elementId()` غير المستخدمة | 🟢 | `src/content/mutation/mutationEngine.ts` · `src/shared/utils/id.ts` · `tests/shared/id.test.ts` | نظافة صفرية للاستعلامات الميتة |
| 4.7 | توظيف `buildCaptureFilename`/`sanitizeFilenamePart` في أسماء ملفات الالتقاط (أو حذفهما) | 🟢 | `src/background/service-worker.ts` · `src/shared/utils/filename.ts` · `tests/shared/utils/filename.test.ts` | أسماء `parotia-<title>-<YYYYMMDD>-<HHmmss>.png` عبر `titleSlug()` (`sanitizeFilenamePart` + `timestampPart`)؛ حُذف `buildCaptureFilename` و`timestamp()` المحلية؛ regex اختبار الالتقاط مُحدَّث |

---

### المرحلة 5 — الأدوات والبنية (متوسطة)
**الهدف:** إغلاق الثغرات الأداية ورفع تجربة الاستخدام.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 5.1 | تفعيل E2E: `playwright.config.ts` + سيناريو أساسي (حقن الشريط + تجميد + التقاط) — أو إزالة سكربت `test:e2e` | 🔴 | `playwright.config.ts` (جديد) · `tests/e2e/` (جديد) · `package.json` | `npm run test:e2e` يعمل بنجاح أو يُزال السكربت |
| 5.2 | تفعيل التغطية: تثبيت `@vitest/coverage-v8` + حدود دنيا واقعية (engines ≥85%) | 🔴 | `vitest.config.ts` · `package.json` | `npm run test:coverage` يعمل ضمن الحدود المعلنة |
| 5.3 | إرسال `CaptureProgress` أثناء الالتقاط + تصفير رسائل التغذية القديمة عند تحديث الحالة | 🔴 | `src/content/index.ts` · `src/ui/src/App.tsx` | الشريط يعرض تقدّم الالتقاط ولا يعلّق الرسائل القديمة |

---

### المرحلة 6 — التوثيق والتحكّم (صيانة)
**الهدف:** مصدر حقيقة واحد ومستندات محدّثة.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 6.1 | تحديث README (happy-dom، الميزات المنفَّذة، تخطيط `src/content/capture`) | 🔴 | `README.md` | لا ادعاءات متقادمة |
| 6.2 | تصحيح ROADMAP: جدول الحالة النهائي يعكس علامات 🗑️ + أعداد الاختبارات الحالية | 🔴 | `ROADMAP.md` | اتساق كامل بين الأقسام والجدول |
| 6.3 | مراجعة نهائية للتقرير والخطة + تحديث أرقام التقدم في §2 | 🔴 | `PAROTIA-REPORT.md` · `REMEDIATION-PLAN.md` | أرقام واقعية |
| 6.4 | commit ختامي بعد كل المراحل (يتطلب موافقة صريحة) | 🔴 | — | سجل git نظيف بمراحل قابلة للتتبع |

---

### المرحلة 7 — التقاط الحيّز الحر (Free Selection Capture) 🔵 ميزة جديدة
**الهدف:** تحديد **أي مكوّن HTML مهما كان** (عبر مساحة، لا عبر شجرة العناصر) بمربع تحديد حر بالماوس، وتصويره مباشرة.

**السلوك المطلوب (كما طُلب):**
1. بمجرد اختيار أداة "التحديد الحر" يُظلَّل **كامل الصفحة** ويُفتح وضع التحرير بمربع تحديد بالماوس.
2. السحب بالماوس يرسم المربع، ويمكن **تحريره** (تحريك/تكبير/تصغير) قبل الإقرار.
3. عند إتمام التحديد تُلتقط صورة **للحيّز المحدد مباشرة** دون أي خطوة إضافية.

| # | المهمة | الحالة | الملفات المتأثرة | معايير القبول |
|---|---|---|---|---|
| 7.1 | أنواع جديدة: `CaptureMode "REGION"` + أمر `SELECT_REGION` (يحمل `Rect`) + أمر `FREE_SELECT` (بدء/إيقاف) في `messages.ts` (union + allowlist) + نوع `Rect` في `shared/types` | 🔴 | `src/shared/types/messages.ts` · `src/shared/types/geometry.ts` (جديد) | الأوامر تصل عبر allowlist وترفض payload مشوّهة |
| 7.2 | وحدة `src/content/selection/freeSelect.ts`: طبقة تعتيم **كاملة الصفحة** (position:fixed/abslute تغطي كل الـ scroll) + مربع تحديد بالسحب (drag) + مقابض تحرير (move/resize) + تطبيع الأبعاد السالبة + إحداثيات `Rect` بترتيب الصفحة | 🔴 | `src/content/selection/freeSelect.ts` (جديد) · `src/content/index.ts` | تعتيم كامل + مربع قابل للتحرير + تطبيع صحيح عند السحب العكسي |
| 7.3 | زر "تحديد حر" في شريط الأدوات (أيقونة Marquee/Select) + إيقاف بـ `Escape` + متاح فقط عند `FROZEN` + إخفاء الواجهة أثناء التعقيم | 🔴 | `src/ui/src/App.tsx` · `src/ui/src/styles.css` · `src/content/index.ts` | تفعيل الزر يُظلّل الصفحة فوراً؛ Escape يعيد الوضع |
| 7.4 | مسار التقاط `captureRegion(rect)` في SW: إخفاء الواجهة → `captureVisibleTab` → قصّ الحيّز من الصورة → تنزيل `parotia-region-<ts>.png` (إعادة استخدام أدوات القص الحالية أو توسيعها) | 🔴 | `src/background/service-worker.ts` | PNG خرج يطابق الحيّز المحدد بصرياً |
| 7.5 | تحويل الإحداثيات page→pixels بدقة (dpr + scroll offset) + ضبط حدود الـ viewport + استعادة التمرير/الواجهة في `finally` | 🔴 | `src/background/service-worker.ts` · `src/content/index.ts` | تطابق حواف المربع ±1px |
| 7.6 | اختبارات: `freeSelect` (تعتيم/مربع/مقابض/تطبيع) + قصّ REGION + توجيه الأوامر الجديدة + اختبار UI للزر | 🔴 | `tests/content/selection/freeSelect.test.ts` (جديد) · اختبارات SW/UI | 8+ اختبارات جديدة |
| 7.7 | توثيق: إضافة الميزة لـ ROADMAP + تحديث README واختصارات لوحة المفاتيح إن لزم | 🔴 | `ROADMAP.md` · `README.md` · `KEYBOARD_SHORTCUTS.txt` | توثيق السلوك المطلوب أعلاه حرفياً |

---

## 4. سجل التنفيذ (Execution Log)

| التاريخ | المرحلة | الإجراء | الحالة |
|---|---|---|---|
| 2026-08-15 | — | إنشاء الخطة ونظام التتبع | 🟢 |
| 2026-08-15 | 7 | إضافة ميزة "التقاط الحيّز الحر" (7 مهمات) ولوحة المتابعة | 🟢 |
| 2026-08-16 | 1 | إغلاق المرحلة 1 (8/8): 102 اختباراً جديداً (223 إجمالاً)، تثبيت `@testing-library/react` + `@testing-library/jest-dom` + `@vitejs/plugin-react` في vitest، إسكات ضجيج stderr، بوابة خضراء (typecheck/lint/test/build) | 🟢 |
| 2026-08-16 | 2 | إغلاق المرحلة 2 (6/6): 16 اختباراً جديداً (239 إجمالاً) — 2.1/2.2 Keep تاريخي عبر `Command.keptElement` + `peekRedo()` مع تنظيف `reset()` للعلامات؛ 2.3 عازلة `INVALID_PAYLOAD` في SW + content (صحة sessionId/elementId/mode)؛ 2.4 استعادة الجلسة بعد إعادة تشغيل SW عبر إعادة تسجيل START_SESSION وإعادة توجيه الأمر بالمعرّف الطازج؛ 2.5 SW يعكس `message.id`؛ 2.6 إصلاح دلالة `mutationObserverBlocked` (صحيح فقط عند حجب فعل الـ observer) + عدّ `animationCount`/`transitionCount` + حالة degraded عند تعذّر التثبيت. بوابة خضراء كاملة | 🟢 |
| 2026-08-16 | 0 | إغلاق المرحلة 0 (1/1): أول commit `9e34ca9` (127 ملفاً) بهوية `most.toufik@gmail.com` + remote `origin` = `https://github.com/wittybrandcode/Parotia.git` | 🟢 |
| 2026-08-16 | 3 | إغلاق المرحلة 3 (4/4): 3 اختبارات جديدة (242 إجمالاً) — 3.1 إزالة `tabs` و`host_permissions` وتضييق WAF إلى `http/https` (الاعتماد على `activeTab` لـ captureVisibleTab/executeScript)؛ 3.2 `downloads` في `optional_permissions` مع `ensureDownloadsPermission` (`permissions.contains`/`request`) ورفض رشيق عند عدم الموافقة في مسارات الالتقاط الثلاثة؛ 3.3 توحيد الإصدار `0.2.0` (يُقرأ من `package.json` في `build-manifest.mjs`) + حذف `public/manifest.json` + تحديث `package-lock.json`؛ 3.4 `targetOrigin` = أصل الامتداد في `broadcastState` + RESIZE نحو أصل الصفحة، ورفض STATE من غير `window.parent` ورفض RESIZE من غير إطار الشريط/أصل الامتداد (اختبارات App + overlay). بوابة خضراء كاملة | 🟢 |
| 2026-08-16 | 4 | إغلاق المرحلة 4 (7/7): حذف 6 ملفات (engine + sessionStore + settings + events مع اختباراتهما) — 4.1 مسار تطبيق واحد عبر `cleanupEngine.applyPreset` (حذف `src/presets/engine.ts` + `tests/presets/engine.test.ts` مع `CleanupIntent`/`PresetApplicationResult`)؛ 4.2 حذف `InMemorySessionStore` (خريطة `tabSessions` في SW تكفي)؛ 4.3 حذف كامل عقد الإعدادات (`UserSettings`/`SettingsRepository`/`ChromeStorageSettingsRepository` + مخططاتها و`requireSchemaVersion` و`STORAGE_KEYS`)؛ 4.4 حذف `EventBus`؛ 4.5 حذف `@capture` من vite/vitest/tsconfig/build-esm؛ 4.6 إزالة كود `restoreNode` الميت + `elementId()`؛ 4.7 أسماء ملفات الالتقاط = `parotia-<title>-<timestamp>` عبر `sanitizeFilenamePart`+`timestampPart` (حذف `buildCaptureFilename` و`timestamp()` المحلية). البوابة خضراء كاملة (228 اختباراً/25 ملفاً) | 🟢 |

> أضِف سطراً عند إغلاق كل مهمة مع تحديث لوحة المتابعة §2.

---

## 5. ملاحظات على القرارات المعلّقة

- **0.1 / 6.4 (git commit):** قرارك — يُنفَّذ فقط عند الموافقة الصريحة.
- **4.2 / 4.3 / 4.4 (حُسمت):** طُبِّق قرار "حذف" — أُزيل `InMemorySessionStore` (خريطة `tabSessions` في SW هي المصدر)، وكل عقد الإعدادات (`UserSettings`/`SettingsRepository`/`ChromeStorageSettingsRepository`) مع `EventBus`؛ شاشة الإعدادات تُبنى لاحقاً عند الحاجة كأمر جديد وليس ككود ميت.
- **3.1:** أُزيلت `tabs` و`host_permissions` (استخدامات `chrome.tabs.*` الحالية لا تتطلب `tabs`؛ `captureVisibleTab` و`scripting` تعملان عبر `activeTab` الممنوح عند تفعيل المستخدم، والشريط المضمَّن يعني أن content script موجودة أصلاً). الفحص اليدوي على الصفحات التجريبية (CNN/BBC/Al Jazeera) غير ممكن في بيئة التنفيذ — القرار موثَّق أعلاه والضمانة البوابة الآلية + الاختبارات.
- **7.x (ميزة جديدة):** المرحلة 7 وظيفية (وليس إصلاحاً) وتُدرج كملحق بعد 6؛ النسخة الأولى تقصّ الحيّز ضمن نطاق الـ viewport (المربع داخل الشاشة المعروضة) — مدّه ليشمل الصفحة كاملة أو العنصر المخفي قابل للإضافة لاحقاً. تعتمد على `captureVisibleTab` كبقية الالتقاطات (تتطلب تجميداً أو إخفاء الواجهة مؤقتاً).
- **ترتيب التنفيذ المقترح:** 0 → 1 → 2 (فورية) ثم 3 → 4 → 5 ثم 6 → 7 (الميزة الجديدة).
