# تقرير Parotia الشامل — تحليل ذرّي للمشروع

> إعداد: تحليل آلي شامل (فحص المصدر والبنية والاختبارات والتوثيق) · التاريخ: 2026-08-15
> النطاق: البنية المعمارية، الميزات، تدفق البيانات، التخزين، الاختبارات والجودة، الأمان، البناء والتوزيع، التوثيق، المخاطر والتوصيات.

---

## 1. الملخّص التنفيذي

**Parotia** امتداد كروم (MV3) لتحرير صفحات الأخبار و"التقاطها": تجميد الصفحة، انتقاء العناصر، تنظيفها (حذف/إخفاء/حماية/حذف المماثل)، ثم تصدير **صورة PNG** نظيفة جاهزة للبث — للمقال كاملاً أو لعنصر محدد.

- **الحجم:** ~25 ملف مصدر / ~5,300 سطر في `src`، ومجلد `tests` بـ **17 ملف اختبار / 121 اختباراً** (جميعها خضراء).
- **البوابة:** `typecheck` (TS صارم جداً) + `lint` (صفر تحذيرات) + `test` + `build` — كلها تعمل بنجاح.
- **الميزات المنفَّذة (8):** التجميد، الانتقاء، الحذف/الإخفاء/الحماية، حذف المماثل، السجل (Undo/Redo/History)، قواعد المواقع (Presets)، التقاط الصفحة الكاملة، التقاط عنصر محدد، اختصارات لوحة المفاتيح.
- **الميزات المُزالة عمداً (3):** وضع القراءة، Smart Cleanup، تصدير HTML — لأن فكرة المنتج هي "التنظيف + صورة PNG" وليست القراءة/الاستخراج النصي.
- **أقوى نقاط الجودة:** حدود معمارية واضحة (Content Script هو المالك الوحيد للـ DOM، والـ Service Worker لا يلمسه أبداً)، TS صارم، لا أثر لأكواد خطرة (`eval`/`document.write`)، اختبارات ممتازة على مستوى المحرّكات.
- **أخطر الفجوات:** الملفان الأكبر والأهم (`content/index.ts` و`service-worker.ts`) **بدون اختبارات**، وكل الواجهات (toolbar/options) **بدون أي اختبار**، ولا توجد طبقة E2E مفعّلة، وبعض الأكواد ميتة أو متضاربة الإصدارات، والمستودع **بلا أي commit حتى الآن**.

---

## 2. نظرة عامة على المشروع

| البند | القيمة |
|---|---|
| الاسم / الحزمة | `parotia` — "Parotia — clean the stage. keep the story." |
| النوع | امتداد Chrome Manifest V3 |
| اللغة/الأدوات | TypeScript (strict) · esbuild (content/SW) · Vite (UI) · Vitest + happy-dom · ESLint 9 |
| الاعتماديات الجاهزة | react 18 · react-dom · lucide-react · zod |
| أدوات التطوير | esbuild · vite · vitest · happy-dom · sharp · typescript · typescript-eslint · @types/chrome · @playwright/test |
| البوابة (Quality Gate) | `typecheck && lint (--max-warnings 0) && test && build` |
| حالة git | **لا يوجد أي commit** — كل الملفات untracked على فرع `master` |

---

## 3. البنية المعمارية

### 3.1 الحدود والمسؤوليات (ثلاث سياقات)

```
┌──────────────┐   sendMessage   ┌──────────────────┐  tabs.sendMessage  ┌──────────────────────┐
│  UI iframe   │ ───────────────▶ │ Service Worker   │ ─────────────────▶ │   Content Script     │
│ (React tool) │ ◀─────────────── │ (منسّق/بلا DOM)   │ ◀───────────────── │ (مالك DOM الوحيد)     │
└──────────────┘                 └──────────────────┘                    └──────────┬───────────┘
       ▲                                                                             │ STATE
       └────────────────────────── postMessage (STATE / RESIZE) ◀───────────────────┘
```

- **Service Worker** — `src/background/service-worker.ts` (507 سطراً): يملك دورة حياة الامتداد، تتبّع `tabSessions` (Map داخل الذاكرة)، التوجيه، وميزة الالتقاط كاملة. **لا يلمس DOM أبداً** (تعليق توثيقي صريح + قيود MV3).
- **Content Script** — `src/content/index.ts` (646 سطراً): كل أوامر الجلسة، بث الحالة، والتفويض للمحرّكات. كل تغيير DOM يمر حصراً عبر **Mutation Engine** لضمان صحة Undo/Redo.
- **UI** — `src/ui/src/` (App.tsx شريط الأدوات، options.tsx صفحة الخيارات): iframe معزول داخل **Shadow Root** في الصفحة، فيُعزل CSS/JS كلياً، ويتزامن الارتفاع عبر `postMessage`.
- **الحقن عند الطلب:** لا توجد `content_scripts` ثابتة في المانيفست؛ الـ SW يفحص التبويب بـ `PING` ويحقن `content/index.js` عند الحاجة فقط.

### 3.2 تدفق الرسائل

- `BackgroundCommand` — اتحاد تمييزي من **34 أمراً** في `src/shared/types/messages.ts` مع قائمة `BACKGROUND_COMMAND_TYPES` كـ **allowlist** تشغيلية عند كل حدود.
- المسار: UI → `chrome.runtime.sendMessage` → SW (تحقق allowlist + ملكية الجلسة/التبويب) → `chrome.tabs.sendMessage` → content → استجابة صعوداً.
- حالة الشريط تُبث **دون SW**: `broadcastState()` → `postMessage` → `App.tsx`.
- ملاحظة: `isBackgroundCommand` يتحقق من **نوع الرسالة فقط** (وليس شكل الـ payload) — تحقّق زمني للشكل غير منفّذ (انظر §7.5).

### 3.3 التخزين

| المفتاح | المكان | الغرض |
|---|---|---|
| `newsclean.presets` | `chrome.storage.local` | قواعد المواقع (Site Presets) — zod يتحقق قبل الكتابة |
| `newsclean.settings` | `chrome.storage.local` | الإعدادات (النوع معرّف لكن **غير مستخدم**) |
| `newsclean.schemaVersion` | `chrome.storage.local` | ترقية المخططات |
| `capture:<sessionId>` / `elementcapture:<sessionId>` | `chrome.storage.local` | **تخزين مؤقت** لصور PNG الضخمة (data URL) لنقلها من content إلى SW، ثم تُحذف |

- الجلسات **لا تُحفظ** أبداً (تنتهي بإغلاق التبويب أو التنقل).
- `chrome.storage.sync/.session` **غير مستخدمين** — متوافق مع وثيقة الأمان (تفضيل local للبيانات المستخرجة من المقالات).
- **سبب تخزين الصور في storage:** `blob:` غير متاح في SW لـ MV3، و`chrome.downloads` غير متاح في content scripts — فالـ content يخيط الصورة إلى data URL ثم يمررها عبر storage (مُبرَّر بإذن `unlimitedStorage`).

---

## 4. جرد الميزات (Feature Inventory)

### 4.1 مجمّعة وفعّالة

| الميزة | الملف | الآلية المختصرة |
|---|---|---|
| **التجميد (Freeze)** | `content/freeze/freezeEngine.ts` | `window.stop()` + إيقاف الأنيميشن/الانتقالات/الفيديو + مراقب استقرار (MutationObserver + نافذة 500ms) |
| **الانتقاء (Pick)** | `content/inspector/inspector.ts` (451 سطراً) | مخطط/محدّد عناصر مع إطار تحديد وشريط عناصر (حذف/إخفاء/حماية/حذف مماثل/كاميرا) + مولّد selector فريد |
| **الحذف/الإخفاء/الحماية** | `content/cleanup/cleanupEngine.ts` + `content/mutation/mutationEngine.ts` | كل عملية Undoable عبر `HistoryEngine` |
| **حذف المماثل** | `content/matching/matchEngine.ts` | توقيع بنيوي (tag + classes + data-*) → حذف دفعة واحدة قابلة للتراجع |
| **السجل + Undo/Redo** | `content/mutation/history.ts` + `content/index.ts` | مكدّسا undo/redo (سقف 100) + `log()` + `undoTo()` + أزرار الشريط مربوطة بـ `canUndo/canRedo` مع تلميحات بالإجراء |
| **قواعد المواقع (Presets)** | `presets/` + `cleanupEngine.applyPreset` | 3 قواعد مدمجة (CNN/BBC/Al Jazeera) + حفظ/تطبيق + opt-in فقط (`enabled`) + صفحة خيارات |
| **تقاط الصفحة الكاملة** | `content/capture/` + `service-worker.ts` | شريحة-بشريحة عبر viewport مع مهلة 450ms لكل لقطة + Canvas Stitcher + إزالة تكرار الهيدر الثابت |
| **تقاط عنصر محدد** | `content/capture/elementCapture.ts` | عزل العنصر + تكبير التبويب ×2 للجودة + قص الأفقي + إجبار الصور على الظهور |
| **اختصارات لوحة المفاتيح** | `content/keyboard/shortcuts.ts` | `Shift+Alt+F/P`، `Escape`، `Delete/Backspace` مع حماية حقول الإدخال ومنع Ctrl/Cmd |

### 4.2 أُزيلت عمداً (قرارات المنتج)

| الميزة | السبب |
|---|---|
| **وضع القراءة (Reading Mode)** | الإضافة بُنيت للتنظيف والالتقاط لا للقراءة |
| **Smart Cleanup** | لا يعمل بموثوقية على الصفحات الحيّة؛ ممكن إعادة بناؤه لاحقاً بالذكاء الاصطناعي |
| **تصدير HTML (HTML Export)** | الفكرة هي الحصول على صورة PNG نظيفة لا صفحة HTML |

---

## 5. حالة الجودة

### 5.1 الاختبارات (17 ملفاً / 121 اختباراً — خضراء)

| المنطقة | الملفات | الحالة |
|---|---|---|
| نواة الـ DOM (mutation/history/match/freeze) | 4 ملفات / 35 اختباراً | ✅ ممتازة |
| الالتقاط (sliceMath/fixedHeaders/elementCapture) | 3 ملفات / 24 اختباراً | ✅ ممتازة |
| القواعد (matcher/presetStore/cleanupPreset) | 3 ملفات / 25 اختباراً | ✅ ممتازة |
| الواجهة/التحكم (inspector/shortcuts/overlay) | 3 ملفات / 22 اختباراً | ✅ جيدة |
| أخرى (id/session/score/sessionStore) | 4 ملفات / 15 اختباراً | ✅ جيدة |

- بيئة الاختبار: **happy-dom** (وليس jsdom كما يزعم README) + `tests/setup.ts` بستاب بسيط لـ `chrome.*`.
- ضجيج `stderr` معروف وغير مؤذٍ: happy-dom لا يدعم مخطط `chrome-extension://` عند تحميل iframe الشريط في `overlay.test.ts` (الاختبار يمر).

### 5.2 فجوات التغطية (الأهم)

| الوحدة | الحجم | الخطر |
|---|---|---|
| `src/content/index.ts` | 646 سطراً | **أكبر وحدة بلا اختبارات** — توجيه الأوامر والالتقاط كله |
| `src/background/service-worker.ts` | 507 أسطراً | **بلا أي اختبار** — التنسيق والتفويض |
| `src/ui/src/App.tsx` + `options.tsx` | ~530 سطراً | **صفر اختبارات UI** |
| `presets/engine.ts` + `validator.ts` | ~190 سطراً | بلا اختبار — رغم أنها من السطوح الأمنية في خطة TESTING |
| `shared/utils/selector.ts` | ~100 سطر | بلا اختبار — سطح أمني (توليد/تحقق selectors) |
| `capture/captureStitcher.ts` | ~96 سطراً | بلا اختبار — هندسة خياطة القطع |
| `cleanupEngine` (غير `applyPreset`) | — | عدّادات undo/redo/undoThrough غير مختبَرة مباشرة |

- **E2E غير مفعّل:** `test:e2e` يستدعي Playwright لكن لا يوجد `playwright.config.*` ولا مجلد `tests/e2e/`.
- **`test:coverage` سيفشل:** لا يوجد مزوّد تغطية مثبَّت (`@vitest/coverage-*`).

### 5.3 جودة الكود

- **TS صارم:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitReturns` + `verbatimModuleSyntax`… (بوابة ممتازة).
- **ESLint:** zero-warning مفروض في السكربت؛ قواعد no-unused-vars / consistent-type-imports / no-explicit-any.
- **النظافة:** لا `console.log` ولا TODO/FIXME في `src`؛ 5 استدعاءات console تشخيصية فقط.

---

## 6. الأمان والصلاحيات

### 6.1 المانيفست المولَّد (`scripts/build-manifest.mjs` → `dist/manifest.json`)

- **Permissions:** `activeTab` · `scripting` · `storage` · `tabs` · `unlimitedStorage` · `downloads`
- **Host permissions:** `<all_urls>`
- `content_scripts: []` (حقن برمجي فقط) · `web_accessible_resources: ["ui/*"]` · لا CSP صريحة (الافتراضي MV3).

### 6.2 ممارسات سليمة

- لا `eval` / `new Function` / `document.write` في `src` على الإطلاق.
- `innerHTML` محصور في `inspector.ts` بقيم SVG ثابتة (لا بيانات من الصفحة).
- إخفاء واجهة الإضافة (toolbar/overlays) أثناء الالتقاط حتى لا تدخل في الصورة.
- تحقق allowlist + ملكية الجلسة/التبويب عند كل حدود.

### 6.3 انحرافات عن خطة الأمان (SECURITY doc)

- الوثيقة توصي بتجنّب `<all_urls>` وإبقاء `downloads` اختيارياً — والمنفَّذ يستخدم الاثنين (مع `tabs` الذي **يبدو غير ضروري** لأن الكود لا يحتاجه صراحةً).
- **لا يوجد تحقق زمني لشكل الـ payload** (`sessionId`/`elementId`/`selector`) — الوثيقة تطلب التحقق عند كل حدود.
- `broadcastState` يستخدم `postMessage(…, "*")` (الواجهة تتحقق من المصدر لكن أي نافذة تستطيع تزوير السلسلة).

---

## 7. المخاطر والفجوات (منظمة بالأولوية)

### أولوية عالية
1. **فجوة اختبارية حرجة:** التنسيق الكامل (`content/index.ts` + `service-worker.ts`) والواجهات كلها بلا اختبارات — أكبر خطر على الاستقرار المستقبلي.
2. **تسرّب علامات الحماية بعد Reset:** `data-newsclean-keep` لا تُزال عند إعادة الضبط رغم تصفير `protectedTargets` — العناصر المحمية تبقى محمية للأبد حتى بعد Reset. **(المرشّح الأرجح لخلل وظيفي)**
3. **تحقق زمني ناقص للرسائل:** شكل الـ payload غير مُتحقق منه عند الحدود (أمنياً ومنظّماً).

### أولوية متوسطة
4. **فقدان الجلسة بعد قتل SW الخامل:** `tabSessions` داخل ذاكرة SW فقط؛ بعد إعادة تشغيله تبقى كل الأوامر تفشل بـ `SESSION_NOT_FOUND` حتى `START_SESSION` التالي (لا إعادة تسجيل من content ولا `onStartup`).
5. **انحراف الإصدارات:** `package.json` = 0.1.0 مقابل `0.2.0` في المانيفست المولَّد، و`public/manifest.json` قديم وغير مستخدم (يضلّل).
6. **سطوح أمنية غير مختبَرة** (`selector.ts` + `validator.ts`) رغم أن خطة TESTING تخصصها لاختبارات أمنية/fuzz.
7. **أدوات معطّلة جزئياً:** `test:e2e` و`test:coverage` لن يعملا كما هما.

### أولوية منخفضة
8. **كود ميت/غشائي:** `InMemorySessionStore` (غير مربوط)، `DefaultPresetEngine` (مسار موازٍ غير مستخدم — يوجد مساران لتطبيق القواعد)، `ChromeStorageSettingsRepository`/`UserSettings` (معرّفان وغير مستخدمين)، `EventBus` (واجهة بلا تنفيذ)، `CaptureProgress`/`CaptureDiagnostics` (لا تُرسل)، `elementId()`/`buildCaptureFilename` (غير مستخدمين)، الاسم المستعار `@capture` يشير إلى مجلد غير موجود، استعلام `existing` ميت داخل `restoreNode`.
9. **تفاصيل التجميد:** استراتيجية `HARD_FREEZE` غير منفّذة، تشخيص `mutationObserverBlocked` ذو دلالة معكوسة، وحالة `DEGRADED/FAILED` غير ممسوكة.
10. **ملاحظات صغيرة:** الرد دائماً `id: ""` (المعرّف الزمني للرسائل زخرفي)؛ مفاتيح capture اليُتم في storage إذا مات SW بين التخزين والحذف؛ `Keep` غير قابل للتراجع (لا يُدفع للـ history)؛ `HIDE` في القواعد تُطبق كأوامر منفصلة بينما `DELETE` دفعة واحدة (تفاوت في وحدات التراجع)؛ `shared/utils/selector.ts` يستخدم `document` فيخالف ادعاء "shared بلا DOM".
11. **التوثيق:** README متقادم (jsdom ↔ happy-dom، "لم تُنفَّذ القواعد/الالتقاط" رغم تنفيذها، `src/capture` غير موجود)؛ جدول ROADMAP النهائي يعرض 8/8 🟢 بما يتعارض مع علامات 🗑️، وعدد الاختبارات القديم (146/21) متقادم (الحالي 121/17).
12. **git:** لا يوجد أي commit بعد — المخاطرة بفقدان العمل.

---

## 8. البناء والتوزيع

- `npm run build` = content → background → ui → icons → manifest (بالترتيب).
- content/SW: esbuild بصيغة **IIFE** (متوافق مع SW بلا `"type":"module"`) مستهدف `chrome120`، بدون minify وبدون source maps (مقصود أمنياً).
- UI: Vite متعدد الصفحات (`index.html` للشريط + `options.html`) بمسار نسبي.
- الأيقونات: sharp من `src/ui/favicon.svg` إلى 16/32/48/128.
- الناتج: `dist/` مكتمل (manifest + SW + content + UI + 4 أيقونات).

---

## 9. الوثائق والمستندات

- **`ROADMAP.md`** (409 أسطراً، عربية): المرحلة 1 (الأساسيات) 🟢 4/4، المرحلة 2 (تجربة المستخدم) 🟢 2/4 — مع علامات 🗑️ لثلاث ميزات أُزيلت وسجلات تنفيذ تفصيلية (بما فيها ربط Undo/Redo بالسجل وتصميم الشعار الجديد بتاريخ 2026-08-15).
- **`README.md`** — متقادم في ثلاث نقاط (انظر §7.11).
- **`KEYBOARD_SHORTCUTS.txt`** — مطابق للمنفَّذ.
- **`plan/`** — 13 وثيقة تصميم أولية (NewsClean) تشمل: الرؤية، PRD، البنية، محرّكات (freeze/inspection/cleanup/extraction/capture)، القواعد، نموذج البيانات، UI/UX، الأمان، إستراتيجية الاختبار (أهداف تغطية: domain ≥90%، engines ≥85%، messaging ≥90%، UI ≥75%).

---

## 10. التوصيات (خطة معالجة مقترحة)

**فورية (أولوية عالية)**
1. اختبارات تكامل لـ `service-worker.ts` و`content/index.ts` (توجيه الرسائل + مسارات الالتقاط) — هي أكبر أصول المشروع بلا حماية.
2. إصلاح تسرّب `data-newsclean-keep` بعد Reset (إزالة العلامات مع تصفير `protectedTargets`).
3. تحقق زمني لشكل الـ payload عند الحدود (SW + content) وفق خطة SECURITY.

**قصيرة الأمد (متوسطة)**
4. توحيد الإصدارات + حذف `public/manifest.json` القديم.
5. ترشيد الصلاحيات: إزالة `tabs` إن أمكن، تقييم `<all_urls>`، وإبقاء `downloads` اختيارياً مع طلب عند أول تصدير.
6. آليّة استعادة جلسة بعد إعادة تشغيل SW (إعادة تسجيل من content أو re-seed في `onStartup`).
7. تفعيل E2E (إعداد Playwright) أو إزالة السكربت، وتثبيت مزوّد التغطية أو حذف السكربت.

**صيانة (منخفضة)**
8. تنظيف الكود الميت (الجلسة، PresetEngine الموازي، EventBus، الاسم المستعار `@capture`، `restoreNode`).
9. تحديث README وتصحيح جدول ROADMAP وأعداد الاختبارات.
10. أول commit رسمي لضمان نقطة استعادة للمشروع.
11. إسكات ضجيج `overlay.test.ts` (استخدام `about:blank`/`data:` في الستاب).
12. اختياري: إرسال `CaptureProgress` لتحسين تجربة المستخدم، وتصفير رسائل التغذية عند تحديث الحالة.

---

## 11. الخلاصة

المشروع في حالة **ناضجة من حيث البنية والجودة التقنية**: حدود معمارية صحيحة، TS صارم، بوابات خضراء، واختبارات محرّكات ممتازة. المنتج اليوم يحقق غرضه المحدد (تنظيف + PNG) بعد إزالة الميزات الخارجة عن النطاق.

ما يحتاج إليه المشروع في المرحلة القادمة ليس ميزات جديدة، بل **تثبيت الأساس**: اختبارات للطبقة التنسيقية (SW/content) والواجهات، إصلاح خلل علامات الحماية، ترشيد الصلاحيات، توحيد الإصدارات والتوثيق، وأول commit — فتتحول من "نموذج يعمل" إلى "منتج قابل للصيانة والنشر بثقة".

---

## 12. حالة المعالجة بعد المراحل 0–5 (تحديث 2026-08-16)

> التقرير أعلاه هو التحليل الأصلي (2026-08-15) وقد شكّل أساس `REMEDIATION-PLAN.md`.
> الجدول التالي يوثّق مصير كل بند بعد إغلاق المراحل 0–5 (المرجع: المرحلة/المهمة في الخطة).

| البند (من §5/§7) | الحالة | المرجع |
|---|---|---|
| فجوة اختبارية حرجة: `content/index.ts` + `service-worker.ts` + الواجهات بلا اختبارات | 🟢 مغلقة — اختبارات تكامل SW/content + اختبارات UI (11+14+…) | المرحلة 1 |
| تسرّب `data-newsclean-keep` بعد Reset | 🟢 مغلق — `reset()` يزيل العلامات مع تصفير `protectedTargets` | 2.1 |
| تحقق زمني ناقص لشكل الـ payload عند الحدود | 🟢 مغلق — `INVALID_PAYLOAD` في SW + content | 2.3 |
| فقدان الجلسة بعد قتل SW الخامل | 🟢 مغلق — إعادة تسجيل من content عند `SESSION_NOT_FOUND` | 2.4 |
| الرد دائماً `id: ""` | 🟢 مغلق — الردود تعكس `message.id` | 2.5 |
| تفاصيل التجميد (`mutationObserverBlocked`/`HARD_FREEZE`/`DEGRADED`) | 🟢 مغلق — دلالة صحيحة + عدّادات + حالة degraded | 2.6 |
| صلاحيات واسعة (`tabs` + `<all_urls>` + `downloads` إجباري) | 🟢 مغلق — أُزيل `tabs` و`host_permissions`، `downloads` اختياري، WAF مقصورة على http/https | 3.1–3.2 |
| انحراف الإصدارات (`public/manifest.json` قديم) | 🟢 مغلق — إصدار موحّد `0.2.0` + حذف الملف القديم | 3.3 |
| `broadcastState` بـ `targetOrigin: "*"` | 🟢 مغلق — `targetOrigin` = أصل الامتداد + رفض مصادر غير `window.parent` | 3.4 |
| كود ميت: sessionStore/presets/engine/EventBus/settings/`@capture`/`restoreNode`/`elementId` | 🟢 مغلق — حُذف 6 ملفات + كود ميت آخر (`CleanupIntent`/`PresetApplicationResult`/`STORAGE_KEYS`) | 4.1–4.6 |
| أسماء ملفات الالتقاط غير موحّدة | 🟢 مغلق — `parotia-<title>-<YYYYMMDD>-<HHmmss>.png` | 4.7 |
| E2E غير مفعّل (`test:e2e` بلا إعداد) | 🟢 مغلق — `playwright.config.ts` + smoke حقيقي ضد `dist/` (نطاق: إقلاع SW + صفحة options؛ الحقن يتطلب `activeTab` بلفتة مستخدم) | 5.1 |
| `test:coverage` سيفشل (بلا مزوّد) | 🟢 مغلق — `@vitest/coverage-v8` + حدود 80/75/80/80 (المقيس 83.14/80.07/88.21/83.14)؛ كل المحرّكات ≥90% ما عدا `elementCapture` (58%, فجوة موثّقة) | 5.2 |
| `CaptureProgress` لا يُرسل + رسائل تغذية قديمة معلّقة | 🟢 مغلق — بث تقدّم لحظي + حفظ التغذية الحيّة من بث STATE | 5.3 |
| ضجيج `overlay.test.ts` | 🟢 مغلق — ستاب `getURL` إلى `about:blank` | 1.8 |
| التوثيق متقادم (README/ROADMAP) | 🟢 يُغلق في المرحلة 6 (هذا التحديث) | 6.1–6.3 |
| git بلا commits | 🟢 مغلق — `9e34ca9` أول commit ثم المراحل 3/4/5 (حتى `cb888b4`)، مدفوعة إلى `origin/master` | 0.1، 3–5 |

- **الوضع الحالي للبوابة:** `typecheck` + `lint` + `test` (236/236) + `build` + `test:coverage` + `test:e2e` — كلها خضراء.
- **المرحلة المتبقية:** 6.4 (commit ختامي، بانتظار موافقة صريحة) ثم المرحلة 7 (ميزة "التقاط الحيّز الحر").
- **فجوة معلنة:** `elementCapture` عند 58% تغطية (مضاهاة canvas/ImageBitmap/FileReader) — تُعالج عند الحاجة (المرحلة 7 تعيد استخدام أدوات القص).
