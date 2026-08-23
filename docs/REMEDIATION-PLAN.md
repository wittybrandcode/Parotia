# خطة التدقيق الذرّي وإصلاح إضافة Parotia

> وثيقة تنفيذية للحالة الحالية من الإضافة، وليست قائمة خصائص جديدة.

| البيان | القيمة |
|---|---|
| تاريخ التدقيق | 2026-08-23 |
| الفرع | `master` |
| أساس Git | `635b6c1` مع تغييرات محلية غير مدمجة |
| الإصدار الحالي | `1.4.1` |
| نطاق التدقيق | `src/` و`tests/` و`scripts/` و`.github/` والوثائق |
| حالة الوثيقة | جاهزة للتنفيذ، وتحل محل النسخة السابقة من خطة الإصلاح |

## 1. الهدف وحدود العمل

الهدف هو جعل الوظائف الموجودة الآن صحيحة، قابلة للاسترجاع، آمنة، قابلة للاختبار، وسهلة الصيانة. لا تتضمن هذه الخطة إضافة أدوات تحرير أو أنماط التقاط أو تكاملات جديدة.

### داخل النطاق

- تثبيت دقة Visible وFull Page وElement وRegion Capture.
- ضمان ظهور المكوّن المحدد كما يظهر للمستخدم، بما في ذلك الصور والنصوص وSVG وCanvas والفيديو وخلفيات CSS قدر الإمكان.
- منع أي تعديل مؤقت من البقاء في صفحة المستخدم بعد النجاح أو الفشل أو الإلغاء.
- توحيد صحة الجلسات والرسائل والتخزين والتنزيل.
- جعل أدوات المحرر الحالية وسجلها وعمليات الحفظ متسقة.
- إزالة الادعاءات التقنية غير الصحيحة وتفكيك الملفات المتضخمة دون تغيير تجربة المنتج.
- رفع جودة الاختبارات من نجاح شكلي إلى تحقق فعلي من الصورة والـDOM.

### خارج النطاق

- أدوات تحرير جديدة مثل تحديد الأشكال وتحريكها أو طبقات متقدمة، ما لم تكن واجهة المنتج الحالية تعد بها صراحة.
- مزامنة سحابية أو حسابات مستخدمين أو مشاركة خارجية جديدة.
- دعم متصفحات غير Chromium في هذه الدورة.
- إعادة تصميم بصري للواجهة.

## 2. كيف تعمل الإضافة حالياً

| الطبقة | المسؤولية الفعلية | الملفات المركزية |
|---|---|---|
| Service Worker | حقن content script، ربط الجلسة بالتبويب، تنسيق الالتقاط، التكبير، التخزين المؤقت، فتح المحرر والتنزيل | `src/background/service-worker.ts` |
| Content Runtime | امتلاك جلسة الصفحة، التجميد، الفحص، تعديل DOM، تحديد المنطقة، قياس العنصر read-only وقص/تجميع البكسلات | `src/content/index.ts` و`src/content/handlers/*` |
| Toolbar | إرسال الأوامر وعرض حالة الجلسة والتقدم والسجل | `src/ui/src/App.tsx` |
| Editor | عرض الصورة عبر Konva، الرسم والقص والضبط ثم Copy/Share/Save | `src/ui/src/editor/*` |
| التخزين المرحلي | نقل PNG كبير بين content وworker والمحرر باستخدام `chrome.storage.local` | `capture:*` و`elementcapture:*` و`regioncapture:*` و`editor-*` |

### تدفق الالتقاط الحالي

```text
Toolbar
  -> Service Worker
     -> Content: تجهيز DOM/القياس/التمرير
     -> chrome.tabs.captureVisibleTab
     -> Content: قص أو تجميع الشرائح في Canvas
     -> chrome.storage.local: صورة PNG مرحلية
     -> Service Worker: فتح Editor بتذكرة مؤقتة
     -> Editor: Copy / Share / Download
```

هذا التقسيم مناسب من حيث السياقات، لكن ملكية الحالة موزعة، وبعض العقود بين الطبقات لا تحافظ على الإحداثيات أو الحالة الأصلية بصورة صحيحة.

## 3. خط الأساس المثبت

تم تشغيل الأوامر على شجرة العمل الحالية أثناء هذا التدقيق:

| البوابة | النتيجة | الملاحظة |
|---|---|---|
| `npm run typecheck` | ✅ ناجح | لا أخطاء TypeScript |
| `npm run lint` | ✅ ناجح | لا تحذيرات ESLint |
| `npm run test:coverage` | ✅ 247/247 | 26 ملف اختبار |
| التغطية العامة | ✅ 80.48% statements/lines | branches 76.75%، functions 86.40% |
| `npm run build` | ✅ ناجح | editor 211.72 kB خام / 64.99 kB gzip |
| `npm run test:e2e` | ✅ 4/4 | Smoke فقط؛ لا يوجد التقاط أو تحرير فعلي |

### لماذا لا يعني الخط الأخضر أن الإضافة سليمة

- `src/ui/src/editor/AnnotationLayer.ts`: تغطية 0%.
- `src/content/handlers/captureHandler.ts`: تغطية 16.16% فقط.
- `src/content/editor/editorModal.ts`: تغطية 54% و20% للدوال.
- فروع `service-worker.ts`: 63.49% فقط.
- E2E يثبت إقلاع الإضافة وصفحة الخيارات فقط، ولا يفتح الشريط أو يلتقط صورة أو يشغل المحرر.
- الاختبارات الحالية تؤكد السلوك الذي كُتب، لكنها لا تختبر بعد صحة مواضع البكسلات ولا تطابق DOM قبل العملية وبعدها.

## 4. سجل النتائج الذرّي

التصنيف:

- **مؤكد:** السلوك ظاهر مباشرة من مسار الكود ويمكن إثباته باختبار صغير.
- **مخاطرة مثبتة التصميم:** لا يلزم أن تفشل كل مرة، لكن العقد الحالي لا يضمن الصحة.
- **دين تقني:** لا يغيّر الناتج فوراً لكنه يرفع احتمال الانحدار ويعطل المراجعة.

| ID | الأولوية | النوع | النتيجة | الدليل الحالي | الأثر |
|---|---:|---|---|---|---|
| CAP-001 | P0 | مؤكد | مجمّع الشرائح يتجاهل `scrollYCss` و`baseScrollCss` ويلصق الشرائح بالتتابع | `captureStitcher.ts:27-30,51-70` | تكرار أو فقد بكسلات، خصوصاً آخر شريحة المقيّدة بـ`maxScroll` |
| CAP-002 | P0 | مؤكد | `hideAllExceptTarget()` يمحو `visibility` الأصلي عند الاسترجاع ولا يحفظ القيمة أو `!important` | `elementCapture.ts:100,162-166,274-301` | تغيير دائم في صفحة المستخدم بعد الالتقاط |
| CAP-003 | P0 | مؤكد | تجهيز الصور يغيّر `loading/src/srcset` ولا يعيد كل السمات | `media.ts:14-28` و`elementCapture.ts:198-223` | تسريب DOM، واختيار مصدر صورة مختلف بعد انتهاء الالتقاط |
| SES-001 | P0 | مؤكد | استعادة جلسة worker المفقودة تعتمد على التبويب النشط وقد تعيد توجيه أمر جلسة قديمة إلى تبويب آخر | `service-worker.ts:146-164,181-197` | أمر أو التقاط في التبويب الخطأ بعد توقف MV3 أو تبديل التبويب |
| EDT-001 | P0 | مؤكد | للمحرر سجلان منفصلان؛ الواجهة تستخدم سجل التعليقات فقط بينما القص/الفلتر يحفظان في `CanvasEngine` غير الموصول | `EditorApp.tsx:39-42,75-87,132-153,161-166` و`CanvasEngine.ts:38-56,99-119` | Undo/Redo لا يعيدان القص والضبط، والتحويل يسطّح التعليقات ويمسح سجلها |
| LIV-001 | P0 | مؤكد | التجميد ينتظر سكون MutationObserver بلا مهلة كلية | `freezeEngine.ts:76-110,217-234` | المواقع الإخبارية دائمة التغيير قد تترك العملية معلقة للأبد |
| CAP-004 | P1 | مؤكد | مهلة انتظار عنصر تُمدد مع كل mutation بلا سقف كلي | `elementCapture.ts:322-355` | التقاط قد لا ينتهي على feed حي مثل X/Twitter |
| CAP-005 | P1 | مخاطرة مثبتة | الجاهزية تفحص `<img>` فقط؛ لا تسجل poster/video/SVG image/Canvas/CSS backgrounds/Open Shadow DOM | `media.ts:53-70` و`elementCapture.ts:322-367` | مكونات مرئية مفقودة أو قديمة في الصورة |
| CAP-006 | P1 | مؤكد | إصلاح صورة X الحالي يفرض opacity/visibility على كل شجرة الهدف | `elementCapture.ts:225-263` | ظهور عناصر كانت مخفية قصداً، وكلفة `getComputedStyle` كبيرة |
| CAP-007 | P1 | مؤكد | `srcset` يفترض أن أول مرشح هو الأكبر، وهذا غير مضمون في معيار `srcset` | `media.ts:3-5,21-28` | اختيار نسخة منخفضة الدقة أو خاطئة |
| CAP-008 | P1 | مؤكد | إحداثيات Region لا تُقيد داخل viewport والتحقق لا يفرض finite/positive | `freeSelect.ts:185-225,328-347` و`service-worker.ts:243-259` | قص فارغ/مزاح أو تخصيص Canvas غير صحيح مع payload مشوه |
| CAP-009 | P0 | مؤكد من مقارنة X فعلية | مسار Element كان يعزل DOM ويفرض `opacity/visibility/content-visibility` ويغيّر خصائص الصور، ثم يمرّر الصفحة ويضبط zoom إلى 2× | `elementCapture.ts` و`captureHandler.ts` و`captureModes/elementCapture.ts` قبل تصحيح 2026-08-23 | اختفاء صورة البروفايل وتغيّر القياس والتخطيط؛ الناتج ليس نسخة بكسلية من المنطقة المختارة |
| DOM-001 | P1 | مؤكد | Hide/Show/Undo يزيل `display` الأصلي بدلاً من حفظه بقيمته وأولويته | `mutationEngine.ts:191-255` | Reset لا يعيد الصفحة حرفياً إلى حالتها الأصلية |
| FRZ-001 | P1 | مؤكد | تعديل `window.setInterval` داخل isolated world لا يوقف timers الخاصة بسياق الصفحة الرئيسي | `freezeEngine.ts:172-200` | ادعاء التجميد أقوى من السلوك الفعلي |
| FRZ-002 | P1 | مؤكد | استرجاع `pointer-events` للإطارات و`visibility` للرؤوس لا يحفظ الأولوية الأصلية بالكامل | `freezeEngine.ts:127-129,203-209` و`fixedHeaders.ts:11-14,59,73-78` | تغيير CSS الأصلي بعد Unfreeze/Capture |
| MSG-001 | P1 | مؤكد | `isBackgroundCommand` يتحقق من الاسم فقط، والتحقق اليدوي لا يغطي كل الحقول أو `Number.isFinite` | `messages.ts:94-98` و`service-worker.ts:200-277` | عقود متباينة وقبول قيم غير صالحة عند الحدود المميزة |
| MSG-002 | P1 | دين تقني مؤثر | رد content يُغلف داخل رد worker مرة ثانية؛ الواجهة تعرف هذا ضمنياً | `service-worker.ts:168-170,280-291,979-981` و`App.tsx:139-161` | bootstrap هش، وأنواع الرد لا تطابق الواقع، ومعالجة أخطاء معقدة |
| SEC-001 | P1 | مخاطرة مثبتة | التحقق من مرسل المحرر يستخدم `startsWith` ولا يطابق `ticket.tabId` مع `sender.tab.id` | `service-worker.ts:635-659` | حد الصلاحية المؤقتة أضعف من العقد الموثق |
| STO-001 | P1 | مؤكد | تنظيف التذاكر المنتهية يحدث عند إقلاع worker فقط، والصور تنسخ كـbase64 في local storage | `service-worker.ts:605-633,990-1017` | مخلفات طويلة العمر وذروة ذاكرة/مساحة مرتفعة عند تعطل المحرر |
| EDT-002 | P1 | مؤكد | قفل التحويل لا يشمل Save/Copy/Share، وفشل callback غير ممسوك لأنه يُشغل بـ`void` | `EditorApp.tsx:75-87,132-153,182-218` | تصدير حالة نصف مكتملة أو unhandled rejection |
| EDT-003 | P1 | مخاطرة مثبتة | Close يرسل discard دون انتظار ثم يطلب إزالة iframe مباشرة | `EditorApp.tsx:220-225` و`editorModal.ts:63-70` | احتمال عدم استهلاك التذكرة عند إغلاق سريع |
| EDT-004 | P2 | مؤكد | بعد Save الناجح يبقى المحرر مفتوحاً لكن token يحذف؛ Save ثانٍ يفشل، ولا توجد حالة saved مستقلة | `EditorApp.tsx:182-200` | تجربة غير متسقة ورسالة خطأ بعد نجاح سابق |
| DOM-002 | P2 | مخاطرة مثبتة | regeneration guard يفحص جذر العقدة المضافة فقط ولا يمسح أحفاد subtree | `mutationEngine.ts:286-329` | عودة عناصر محذوفة عند إعادة بناء حاوية أعلى منها |
| PERF-001 | P2 | مؤكد | عزل العنصر يمسح DOM كاملاً ويحسب style لكل عنصر داخل الهدف | `elementCapture.ts:225-301` | توقف ملحوظ على الصفحات الكبيرة وfeeds الطويلة |
| ARCH-001 | P2 | دين تقني | Service Worker بلغ نحو 1022 سطراً ويجمع الأمن والجلسات والالتقاط والتخزين والتنزيل | `service-worker.ts` | صعوبة إثبات invariants ومراجعة التغييرات دون انحدار |
| ARCH-002 | P2 | دين تقني | توجد ثلاثة runtime listeners في content بدلاً من router واحد | `content/index.ts:316-346` | ترتيب معالجة ضمني واختبارات أكثر تعقيداً |
| QA-001 | P1 | مؤكد | البوابة عامة وتسمح بملفات حرجة شبه غير مختبرة | `vitest.config.ts:17-28` | نجاح CI رغم غياب اختبارات لمسار المنتج الأساسي |
| QA-002 | P1 | مؤكد | E2E الحالي Smoke فقط ويصرح بعدم تنفيذ action/capture | `tests/e2e/smoke.spec.ts:15-23` | لا دليل متصفح على سلامة الالتقاط أو المحرر |
| CI-001 | P2 | دين تقني | Jobs منفصلة تعيد `npm ci`، وtest/coverage مكرران، وE2E يعيد build | `.github/workflows/ci.yml:12-52` و`package.json:17-21` | CI أبطأ وأغلى مع artifacts ناقصة للتغطية |
| DOC-001 | P2 | مؤكد | أسماء `NewsClean` القديمة ما زالت في الأنواع وdata attributes والتعليقات | أمثلة: `messages.ts` و`elementCapture.ts` و`content/index.ts` | ارتباك تشخيصي، لا يُغيّر قبل تحديد توافق السمات |

## 5. القرارات المعمارية الملزمة قبل الإصلاح

هذه القرارات تمنع حلولاً موضعية جديدة:

1. **كل تعديل مؤقت معاملة قابلة للعكس:** أي style أو attribute أو scroll أو zoom أو DOM node يغيَّر أثناء الالتقاط يسجل قيمته الأصلية والأولوية ووجود السمة، ويسترجع داخل `finally` عبر `restore()` idempotent.
2. **الإحداثيات هي مصدر التجميع:** موضع الشريحة الفعلي، لا ترتيب وصولها، يحدد موضع البكسلات في Canvas.
3. **التقاط المظهر لا يعني إظهار المخفي:** تُنتظر/تُحفز الأصول المرئية، ولا تفرض `visibility/opacity` على كل subtree. أي fallback يقتصر على الأصل المرئي وسلسلة أسلافه ويُسترجع حرفياً.
4. **كل انتظار له مهلة كلية ثابتة:** Mutation قد تعيد محاولة ضمن الميزانية، لكنها لا تمدد النهاية إلى ما لا نهاية.
5. **جلسة واحدة مرتبطة بتبويب واحد:** لا fallback إلى active tab عند فقد خريطة الذاكرة؛ الربط الصغير يحفظ في `chrome.storage.session` ويُتحقق منه مع sender/tab.
6. **سجل محرر واحد ظاهر للمستخدم:** التعليق والقص والضبط عمليات ضمن history واحد؛ لا يبقى API history غير مستخدم.
7. **رد واحد لكل أمر:** Service Worker يفك رد content ويعيد envelope موحداً، بلا `success` داخل `data.success` إلا إذا كان ذلك بيانات مجال موثقة.
8. **الاختبار يحمي invariant لا implementation:** نقارن البكسلات، الإحداثيات، DOM قبل/بعد، وملكية التبويب؛ لا نكتفي بعدد استدعاءات mock.

## 6. خطة التنفيذ المرحلية

### المرحلة 0 — تثبيت الأدلة وخط الأساس

الحالة: 🟨 اكتملت fixtures والاختبارات؛ اعتماد اللقطات المرجعية اليدوي باقٍ قبل النشر

- [x] **AUD-001:** جرد السياقات والملفات وتدفقات الرسائل والتخزين.
- [x] **AUD-002:** تثبيت نتائج typecheck/lint/test/coverage/build/E2E.
- [x] **AUD-003:** فصل العيوب المؤكدة عن المخاطر والديون التقنية.
- [x] **AUD-004:** إنشاء fixtures محلية ثابتة: article، Twitter-like card، long page، dynamic feed، media matrix.
- [ ] **AUD-005:** حفظ لقطات مرجعية وDOM snapshots قبل أي إصلاح سلوكي.

**بوابة الخروج:** كل عيب P0 يملك اختباراً أحمر مستقلاً قبل تعديل الإنتاج.

### المرحلة 1 — سلامة الصفحة وإنهاء العمليات

الحالة: ✅ مكتملة ومثبتة باختبارات الاسترجاع والمهل

#### DOM-TRX-001 — سجل تغييرات قابل للعكس

- [ ] إنشاء `DomPatchLedger` صغير يحفظ `{element, property/attribute, existed, value, priority}`.
- [ ] استعماله في element capture وregion preload وfixed headers وfreeze frames وHide/Show.
- [ ] جعل `restore()` آمناً عند الاستدعاء المتكرر وبعد إزالة العنصر أو تغييره من الموقع.
- [ ] إزالة كل استرجاع عام من نوع `removeProperty()` ما لم تكن الخاصية غير موجودة أصلاً.
- [ ] اختبار success/failure/cancel/re-entry مع CSS عادي و`!important`.

**معيار القبول:** `outerHTML` والسمات والـinline styles المقصودة متطابقة قبل العملية وبعدها، باستثناء تغييرات الموقع نفسه المثبتة في الاختبار.

#### LIV-001 — حدود زمنية قطعية

- [ ] إضافة `MAX_FREEZE_WAIT_MS` ينهي التجميد بحالة `DEGRADED` مع diagnostics بدلاً من تعليق Promise.
- [ ] استبدال تمديد مهلة صور العنصر بميزانيتين: quiet window قصيرة وhard deadline ثابتة.
- [ ] ضمان فصل كل MutationObserver داخل `finally`.
- [ ] تمرير timeout/cancel reason إلى الواجهة برسالة قابلة للفهم.

**معيار القبول:** لا تتجاوز العملية الحد المعلن بهامش جدولة 500ms في fixture يحدث mutations كل 50ms.

### المرحلة 2 — صحة الالتقاط والبكسلات

الحالة: ✅ مكتملة ومثبتة باختبارات الإحداثيات ومصفوفة الوسائط

#### CAP-001 — تجميع قائم على الإحداثيات

- [ ] استبدال `nextY` بـ`destY = round((actualScrollY - baseScrollCss) * dpr)`.
- [ ] قص الجزء المتداخل من source عند تقييد آخر scroll إلى `maxScroll`.
- [ ] استخدام `drawHeightFor()` فعلياً وتسجيل intervals المرسومة.
- [ ] اكتشاف gaps/duplicates/out-of-order slices وإعادة المحاولة أو الفشل الصريح.
- [ ] تطبيق نفس العقد على Full Page وElement Capture.
- [ ] اختبار صفحات 601/1199/1201/1300px مع viewport 600px، وDPR 1/1.25/2، وscroll فعلي مختلف عن المطلوب.

**معيار القبول:** صورة checkerboard مرجعية تطابق الناتج بكسلياً بلا صف مكرر أو مفقود.

#### CAP-002 — تجهيز الأصول المرئية بدقة

- [ ] بناء `VisualReadinessTransaction` يجرد `<img>/<picture>`، video poster/frame، SVG `<image>`، canvas، CSS background images، وopen Shadow Roots.
- [ ] استخدام `currentSrc` واختيار المتصفح بدلاً من تحليل `srcset` بافتراض ترتيب المرشحين.
- [ ] حفظ واسترجاع `loading/src/srcset` وأي `data-*` تم ترقيته.
- [ ] انتظار fonts والأصول ضمن hard deadline، ثم إرجاع diagnostics بالأصول التي لم تجهز بدلاً من التعليق.
- [ ] معالجة X/Twitter: انتظار تبديل avatar أولاً، ثم fallback محدود للصورة وأسلافها، لا لكل subtree.
- [ ] توثيق القيود غير القابلة للحل من content script: closed shadow roots ومحتوى iframe الذي لا يمكن فحص DOM الخاص به؛ يظل screenshot المرئي مدعوماً.

**معيار القبول:** fixture media matrix لا يفقد أي أصل مرئي، ولا يُظهر عقدة `display:none/visibility:hidden` كانت مخفية قبل الالتقاط.

#### CAP-003 — حدود Region وElement

- [ ] clamp مستطيل Free Select أثناء move/resize إلى viewport.
- [ ] رفض كل rect غير finite أو غير موجب عند worker/content boundary.
- [ ] clamp source/destination داخل أبعاد bitmap قبل إنشاء Canvas.
- [ ] إعادة قياس element rect بعد readiness والتكبير وقبل كل خطة شرائح إذا تغيّر layout.
- [ ] اختبار scroll وzoom وRTL وعنصر أعرض/أطول من viewport وعنصر قريب من أسفل الصفحة.

**معيار القبول:** لا Canvas بأبعاد سالبة/NaN، والناتج يطابق المستطيل المرئي عند كل DPR مختبر.

#### CAP-009 — عقد التطابق البكسلي للعنصر المرئي

- [x] جعل القياس عملية read-only لا تضيف style/attribute ولا تغيّر `loading/src/srcset/opacity/visibility/content-visibility`.
- [x] منع zoom والتمرير المسبق وانتظار lazy-media في مسار Element المرئي.
- [x] إذا كان المستطيل كاملاً داخل viewport: التقاط PNG واحد بالدقة الأصلية ثم قص إحداثياته فقط.
- [x] إخفاء واجهة Parotia وانتظار خروجها من compositor بإطارين قصيرين قبل الالتقاط.
- [x] إبقاء stitching بالـzoom الأصلي كـfallback فقط عندما يمتد العنصر خارج viewport، مع استرجاع scroll في `finally`.
- [x] إضافة عقدة رسالة مستقلة `CAPTURE_ELEMENT_CROP` مع تحقق PNG/DPR/rect عند الحدود.
- [x] استبدال اختبارات «العزل والتكبير» باختبارات عدم تغيير DOM والإطار الواحد وعدم استدعاء `setZoom`.
- [x] تكبير PNG بعد القص إلى ×2 بترشيح عالي الجودة داخل render واحد، مع حد `32767px` وميزانية 64M بكسل وfallback آمن للحجم الأصلي.

**معيار القبول:** اختيار منشور ظاهر بالكامل، بما فيه avatar والنص والصورة/الفيديو، ينتج قصاً من نفس إطار viewport من دون إعادة تدفق الصفحة أو إضافة/إزالة مكوّنات منها، ثم PNG بأبعاد ×2 للصور العادية من دون تغيير الصفحة.

### المرحلة 3 — الجلسات والرسائل والأمن والتخزين

الحالة: ✅ مكتملة ومثبتة باختبارات الملكية والتذاكر والتخزين

#### SES-001 — ربط دائم وصحيح للتبويب

- [ ] حفظ `{tabId, sessionId, createdAt}` في `chrome.storage.session`، لا `local`.
- [ ] تسجيل session من رد action click نفسه، وعدم الاعتماد على bootstrap iframe وحده.
- [ ] عند استيقاظ worker: استرجاع الربط والتحقق من وجود التبويب والجلسة؛ لا استخدام active tab كبديل.
- [ ] رفض `sender.tab` إذا خالف مالك session.
- [ ] تنظيف الربط عند tab removed/navigation/session close.
- [ ] اختبار تبديل تبويبين ثم suspend/reload للـworker مع أوامر متزامنة.

**معيار القبول:** يستحيل أن ينفذ session A أمراً في tab B، ويعود `SESSION_NOT_FOUND` عند عدم إثبات الملكية.

#### MSG-001 — عقد موحد ومتحقق منه

- [ ] إنشاء validators مركزية لكل discriminated command واستخدامها في worker وcontent.
- [ ] فحص object shape وstring bounds وfinite numbers وpositive rects وPNG signature والحجم والfilename.
- [ ] توحيد `MessageResponse<T>` وإلغاء التغليف المزدوج.
- [ ] توحيد error codes؛ لا تحويل أخطاء صلاحية إلى `INTERNAL`.
- [ ] دمج listeners الثلاثة في content router واحد مع فصل command/notification/ping داخلياً.

**معيار القبول:** contract tests مشتركة تمر على الطرفين، وكل payload مشوه يرفض بلا side effect.

#### SEC/STO-001 — دورة حياة المحرر المؤقتة

- [ ] مقارنة sender URL كـURL دقيق للمسار والأصل، ومطابقة `ticket.tabId` مع `sender.tab.id` وsession.
- [ ] التحقق من PNG decoded bytes والتوقيع والحجم الحقيقي قبل التنزيل.
- [ ] جدولة تنظيف دوري خفيف عبر `chrome.alarms` أو تنظيف كسول في كل عملية editor، إضافة إلى startup cleanup.
- [ ] استهلاك التذكرة مرة واحدة مع state صريح: `issued -> consuming -> consumed/expired` لمنع السباق.
- [ ] إزالة الصورة والتذكرة في success/failure/discard/tab close/expiry.
- [ ] قياس كلفة base64؛ تقليل النسخ ما أمكن ضمن قيود MV3 دون تغيير UX.

**معيار القبول:** لا مفاتيح `capture:*` أو`editor-*` يتيمة بعد كل مسار، ولا يقبل token من تبويب أو صفحة أخرى أو مرتين.

### المرحلة 4 — اتساق المحرر الحالي

الحالة: ✅ مكتملة ومثبتة باختبارات الوحدة وChromium

#### EDT-001 — سجل واحد للعمليات الموجودة

- [ ] تعريف `EditorCommand` للعمليات الحالية فقط: annotation add، crop، adjust.
- [ ] اختيار تمثيل history واحد محدود الذاكرة؛ حذف API history الآخر أو دمجه فعلياً.
- [ ] إبقاء التعليقات قابلة للـUndo بعد crop/adjust أو تمثيل التحويل بشكل يمكن revert له؛ لا flatten يمحو السجل بصمت.
- [ ] ربط `canUndo/canRedo` بالمصدر الموحد وتحديث الأزرار بعد كل commit/revert.
- [ ] اختبار تسلسل مختلط: draw -> crop -> adjust -> undo×3 -> redo×3.

**معيار القبول:** كل ضغطة Undo تعكس آخر تغيير مرئي بالضبط، بصرف النظر عن نوع الأداة.

#### EDT-002 — تسلسل ذري ودورة حياة واضحة

- [ ] استعمال operation queue/mutex واحد لكل Crop/Adjust/Save/Copy/Share/Close.
- [ ] عدم إسقاط العملية الثانية بصمت؛ تعطيل الأزرار أو إرجاع حالة busy واضحة.
- [ ] التقاط أخطاء callbacks وتوجيهها إلى `setError`، ومنع unhandled rejections.
- [ ] عند Close: انتظار discard مع timeout قصير ثم إغلاق modal؛ cleanup server-side يبقى شبكة أمان.
- [ ] بعد Save: إغلاق المحرر أو تحويله إلى حالة Saved وتعطيل Save؛ اختيار السلوك القائم الأبسط وتوثيقه.
- [ ] مسح error القديم بعد نجاح Copy/Share/Save.

**معيار القبول:** لا يمكن تصدير frame نصف محول، ولا token معلق، ولا Save ثانٍ مضلل.

#### EDT-003 — اختبار AnnotationLayer مباشرة

- [ ] pointer mapping عند CSS scale وDPR مختلف.
- [ ] freehand/line/rect/ellipse/arrow/text مع commit/cancel.
- [ ] undo/redo وترتيب العقد.
- [ ] destroy أثناء رسم أو input نصي.
- [ ] render/export دون cursor أو أدوات UI.

**معيار القبول:** تغطية الملف ≥85% lines/functions و≥75% branches، مع اختبار سلوك لا snapshots شكلية فقط.

### المرحلة 5 — صحة التجميد والتنظيف

الحالة: ✅ مكتملة ومثبتة باسترجاع CSS حرفي

#### FRZ-001 — تعريف صادق للتجميد

- [ ] إزالة timer patch غير الفعال أو نقل حل محدود ومدروس إلى MAIN world بعد threat review؛ التوصية إزالة الادعاء والاعتماد على CSS/media/stability timeout.
- [ ] حفظ `pointer-events` وقيم الأولوية لكل iframe واسترجاعها حرفياً.
- [ ] حفظ visibility + priority للرؤوس الثابتة.
- [ ] اختبار iframe له inline `pointer-events` ورأس له `visibility!important`.

#### DOM-001 — Hide/Show قابل للعكس فعلاً

- [ ] إدخال snapshot display ضمن CleanupOperation عند أول Hide.
- [ ] Show/Undo/Redo/Reset تستخدم الحالة الأصلية ولا تفترض غياب `display`.
- [ ] مسح descendants في regeneration guard مع سقف عمل لمنع تجميد الصفحة.
- [ ] اختبار عنصر أصله `display:flex!important` وإعادة بناء حاوية تحتوي عنصراً محذوفاً.

**بوابة المرحلة:** Freeze/Unfreeze وHide/Show/Reset لا يغيران CSS الأصلي خارج التغيير الذي طلبه المستخدم.

### المرحلة 6 — تفكيك البنية دون تغيير سلوكي

الحالة: ✅ مكتملة؛ router ومنسق وأوضاع وخدمات مستقلة

لا يبدأ التفكيك قبل تثبيت اختبارات P0/P1، حتى يكون نقلاً ميكانيكياً لا إعادة اختراع.

- [x] **ARCH-001:** تقسيم worker إلى `router`، `sessionRegistry`، `captureCoordinator`، `captureModes/*`، `editorTickets`، `downloadService`، `temporaryStorage`.
- [x] **ARCH-002:** نقل validators إلى shared boundary module مع أنواع return واضحة.
- [x] **ARCH-003:** جعل معاملات capture كائنات ذات `prepare/execute/restore` بدلاً من globals مثل `regionStyleEl`.
- [x] **ARCH-004:** تحديد حد إرشادي 250-350 سطراً للمنسق؛ الاستثناءات توثق بسببها.
- [x] **ARCH-005:** logger صغير بمستويات وcontext (`tabId/sessionId/mode/phase`) مع إسكات الأخطاء المتوقعة في الاختبارات.

**معيار القبول:** لا تغيير في golden images أو message contract أو واجهة المستخدم خلال PR التفكيك.

### المرحلة 7 — بوابات الجودة والإصدار

الحالة: 🟨 البوابات الآلية مكتملة؛ مصفوفة النشر اليدوية متعددة المنصات باقية

#### QA-001 — اختبارات وحدة وتكامل حرجة

- [ ] رفع `captureHandler` و`AnnotationLayer` و`editorModal` وفروع worker إلى حدود ملفية، لا عامة فقط.
- [ ] اختبارات failure injection بعد كل خطوة: storage/set/get/remove، tab message، zoom، capture، bitmap decode، canvas encode، download.
- [ ] اختبار عدم بقاء observers/listeners/styles/canvases/storage keys بعد الفشل.
- [ ] Property tests/جدول حالات للإحداثيات والأبعاد وDPR.

#### QA-002 — E2E حقيقي على الإضافة المبنية

- [ ] تشغيل action أو حقن المسار المكافئ الموثق في Chromium headed/Xvfb عند الحاجة.
- [ ] فتح toolbar والتحقق من session.
- [ ] تنفيذ Visible/Full Page/Element/Region على fixtures محلية.
- [ ] فتح editor، الرسم والقص والضبط وUndo/Redo والحفظ والإغلاق.
- [ ] Twitter-like fixture بصورة profile lazy داخل wrapper opacity transition.
- [ ] اختبار tab switching وworker restart وتزامن capture.
- [ ] مقارنة PNG بأقنعة tolerance ضيقة للمناطق غير الحتمية.

#### CI-001 — CI أسرع وأوضح

- [x] عدم تشغيل Vitest مرتين؛ coverage job هو اختبار الوحدة الرسمي.
- [x] بناء artifact مرة واحدة وتمرير `dist/` إلى E2E.
- [x] رفع coverage report وPlaywright trace/screenshots عند الفشل.
- [ ] فصل smoke السريع عن capture E2E مع timeout مناسب وإعادة محاولة لأعطال المتصفح فقط.
- [x] منع `postMessage('*')` وكتابة `chrome.storage.local` لمفتاح مرحلي بلا owner/expiry عبر lint/check بسيط.

#### DOC/REL-001 — توثيق وإصدار

- [x] تحديث `ARCHITECTURE.md` و`SECURITY.md` و`PERMISSIONS.md` وREADME وCHANGELOG وفق التنفيذ الفعلي.
- [x] توحيد Parotia/NewsClean بخطة migration لا تكسر selectors أو fixtures القديمة دفعة واحدة.
- [x] تدقيق manifest وتقليل `web_accessible_resources` والpermissions إلى الضروري المثبت.
- [ ] اختبار تثبيت نظيف وترقية من 1.4.0، ثم حزمة إصدار reproducible.

## 7. نظام تتبع التنفيذ

### حالات العمل

| الرمز | الحالة | شرطها |
|---|---|---|
| ⬜ | لم تبدأ | لا يوجد تنفيذ |
| 🟥 | اختبار أحمر مثبت | reproduction آلي موجود ويفشل للسبب الصحيح |
| 🟦 | قيد التنفيذ | مالك وفرع/commit محددان |
| 🟨 | بانتظار مراجعة | التنفيذ والاختبارات مكتملان محلياً |
| ✅ | مكتملة | مدمجة وكل البوابات ناجحة |
| ⛔ | محجوبة | سبب خارجي وقرار مطلوب موثقان |

### لوحة المراحل

| المرحلة | الحالة | التبعيات | بوابة الخروج |
|---|---|---|---|
| 0. الأدلة والfixtures | 🟨 | — | fixture حتمي واختبارات P0؛ المرجع البصري اليدوي قبل النشر باقٍ |
| 1. DOM والمهل | ✅ | AUD-004/005 | استرجاع حرفي + لا تعليق |
| 2. الالتقاط والبكسلات | ✅ | المرحلة 1 | اختبارات إحداثيات/gaps ومصفوفة media ناجحة |
| 3. الجلسات والأمن | ✅ | المرحلة 1 | عزل tab/session + دورة حياة capability |
| 4. المحرر | ✅ | MSG/SEC contract | history ذري + export متسق |
| 5. freeze/cleanup | ✅ | DOM ledger | استرجاع CSS حرفي |
| 6. التفكيك | ✅ | P0/P1 tests | router 254 سطراً + coordinator/modes/services مستقلة |
| 7. QA والإصدار | 🟨 | 1-6 | البوابات الآلية مكتملة؛ فحص المنصتين اليدوي باقٍ قبل النشر |

### لوحة البنود ذات الأولوية

| ID | الحالة | يعتمد على | PR المقترح | دليل الإغلاق |
|---|---|---|---|---|
| CAP-001 | ✅ | AUD-004 | PR-02 | coordinate/overlap/gap tests |
| CAP-002/003 | ✅ | DOM-TRX-001 | PR-01 | DOM exact-restore tests |
| SES-001 | ✅ | MSG-001 | PR-03 | persisted owner/restart/wrong-tab tests |
| EDT-001 | ✅ | Editor decision record | PR-04 | mixed visible history test |
| LIV-001/CAP-004 | ✅ | — | PR-01 | hard-deadline tests |
| CAP-005/006/007 | ✅ | DOM-TRX-001 | PR-02 | media matrix + Twitter-like fixture |
| CAP-008 | ✅ | MSG-001 | PR-02 | finite/clamped rect tests |
| CAP-009 | ✅ | — | PR-02 | read-only DOM invariant + one-frame crop + no-zoom worker test |
| DOM-001/FRZ-001/002 | ✅ | DOM-TRX-001 | PR-05 | CSS priority restoration |
| SEC/STO-001 | ✅ | SES-001 | PR-03 | capability lifecycle/replay/expiry tests |
| EDT-002/003/004 | ✅ | EDT-001 | PR-04 | editor unit + Chromium test |
| ARCH-001/002 | ✅ | PR-01..05 | PR-06 | router/coordinator/capture modes/services split + shared validator |
| QA/CI/DOC | 🟨 | PR-01..06 | PR-07 | automated gates done; manual release matrix remains |

### قالب بطاقة تنفيذ ذرّية

```md
#### [ID] عنوان العمل
- الحالة: ⬜ / 🟥 / 🟦 / 🟨 / ✅ / ⛔
- المالك:
- الفرع / PR / commits:
- الاعتماديات:
- الدليل أو خطوات إعادة الإنتاج:
- الاختبار الأحمر:
- التغيير المنفذ:
- الملفات المتأثرة:
- مخاطر الانحدار:
- اختبارات القبول:
- النتائج: typecheck / lint / unit / coverage / build / e2e
- مراجعة الأمن/الأداء المطلوبة:
- ملاحظات متبقية:
```

### ترتيب Pull Requests

```text
PR-00  fixtures + reproductions فقط
  ├─ PR-01  DomPatchLedger + hard deadlines
  ├─ PR-02  coordinate stitcher + media readiness + rect bounds
  └─ PR-03  session registry + message contract + editor tickets/storage
          ↓
PR-04  unified editor history + atomic operations
PR-05  freeze/cleanup exact restoration
          ↓
PR-06  structural decomposition only
          ↓
PR-07  real E2E + CI + docs + release
```

لا يخلط PR إصلاحاً سلوكياً مع إعادة تسمية أو تنسيق واسع. وكل PR يبدأ باختبار يفشل قبل الإصلاح وينجح بعده.

## 8. مصفوفة التحقق المطلوبة

| المحور | الحالات الدنيا |
|---|---|
| الأبعاد | أصغر من viewport، مساوية، أكبر بـ1px، مضاعف غير كامل، قرب حد Canvas |
| DPR/Zoom | DPR 1/1.25/2/3؛ zoom 80/100/125/200% |
| الاتجاه | LTR وRTL |
| الوسائط | img lazy، picture/srcset، avatar opacity wrapper، SVG image، canvas، video poster، CSS background، open shadow root |
| ديناميكية الصفحة | ثابتة، mutation مستمر، infinite feed محدود، font متأخر، image broken |
| DOM | inline style غائب/عادي/`!important`، عنصر منفصل أثناء restore، iframe، fixed/sticky header |
| الفشل | message/storage/capture/decode/encode/download/close في كل مرحلة |
| الجلسات | تبويب واحد، تبويبان، تبديل active tab، worker restart، tab close، capture متزامن |
| المحرر | كل أداة حالية، تسلسل مختلط، export أثناء عملية، close أثناء save، token منتهي/مستهلك |

## 9. بوابات الدمج والإصدار

### لكل PR

- [ ] يوجد ID وخطأ قابل لإعادة الإنتاج أو هدف refactor موثق.
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] الاختبارات المتخصصة للـinvariant ناجحة.
- [ ] لا permissions أو web-accessible resources أو storage keys جديدة بلا تبرير.
- [ ] لا تعديل DOM مؤقت بلا ledger و`finally`.
- [ ] لا انتظار بلا hard deadline/cancellation.
- [ ] لا تغيير في message boundary بلا contract tests ومراجعة sender/session.

### أهداف التغطية الحرجة

- التغطية العامة لا تقل عن الحدود الحالية: 80% statements/lines/functions و75% branches.
- `AnnotationLayer.ts` و`captureHandler.ts` و`editorModal.ts`: ≥85% lines/functions و≥75% branches.
- فروع routing/session/editor-ticket في worker: ≥85% للمنطقة الحرجة، حتى لو بقي حد الملف العام أقل.
- لا يُخفض threshold لتجاوز فشل.

### قبل الإصدار

- [ ] كل P0 وP1 = ✅.
- [ ] E2E الحقيقي يمر على أوضاع الالتقاط الأربعة والمحرر.
- [ ] لا فرق DOM بعد success/failure/cancel.
- [ ] لا gaps أو duplicates في golden long-page images.
- [ ] Twitter-like avatar وكل media matrix ظاهرة دون إظهار hidden content.
- [ ] لا cross-tab routing بعد worker restart.
- [ ] لا storage keys/tokens/listeners/observers/styles/canvases يتيمة.
- [ ] فحص يدوي على Chrome Stable في Windows، ثم منصة ثانية قبل النشر.
- [ ] manifest والوثائق وCHANGELOG والإصدار متطابقة مع الواقع.

## 10. تعريف الإنجاز

لا تعتبر الإضافة «نقية» لمجرد نجاح lint أو وصول التغطية العامة إلى 80%. تعتبر دورة الإصلاح مكتملة فقط عندما:

1. تغلق كل نتائج P0 وP1 بدليل آلي مستقل.
2. تكون كل تغييرات DOM/scroll/zoom/storage مؤقتة وقابلة للاسترجاع في جميع مسارات الفشل.
3. يكون ناتج الالتقاط صحيح الإحداثيات ويحتوي كل مكوّن مرئي ضمن القيود الموثقة، من دون إظهار محتوى مخفي قصداً.
4. لا يمكن توجيه جلسة أو صلاحية محرر إلى تبويب أو مرسل غير مالك.
5. Undo/Redo يعكسان العمليات الحالية للمحرر بالترتيب المرئي الحقيقي.
6. تثبت اختبارات متصفح حقيقية التدفق من فتح الإضافة إلى PNG النهائي.
7. تطابق الوثائق والـmanifest والعقود السلوك المنفذ، ولا تبقى ملاحظات حرجة غير مصنفة.

## 11. تقرير التنفيذ المثبت — 2026-08-23

### النتيجة

- أُغلقت جميع نتائج P0 وP1 في هذه الوثيقة باختبارات آلية مستقلة.
- أُنجزت البنود البرمجية P2: regeneration guard، حالة Saved، التفكيك المعماري، logger، CI، التوثيق، وهجرة الأسماء المتوافقة.
- لا يوجد عيب برمجي معروف مفتوح ضمن النطاق الحالي. البنود غير المؤشرة في قوائم الإصدار هي تحقق يدوي/مرجعي لا يمكن اعتباره منجزاً بواسطة اختبارات headless وحدها.

### أدلة الإغلاق

| البوابة | النتيجة النهائية |
|---|---|
| TypeScript | `npm run typecheck` ✅ |
| ESLint | `npm run lint` ✅، بلا تحذيرات |
| Security invariants | `npm run check:security` ✅ |
| Dependency audit | `npm audit` ✅، صفر ثغرات مع تثبيت نظيف `--ignore-scripts` |
| Vitest | 323/323 عبر 36 ملفاً ✅ |
| Coverage | 90.85% lines/statements، 88.91% functions، 78.66% branches ✅ |
| Critical-file gates | ستة ملفات: capture/annotation/modal/session/tickets/coordinator ✅ |
| Production build | content/background/UI/icons/manifest ✅ |
| Chromium E2E | 5/5، ويشمل editor حقيقياً مع رسم وحفظ واستهلاك ticket ✅ |
| Diff hygiene | `git diff --check` ✅ بعد إزالة whitespace الزائد |

### ما تغير معمارياً

```text
service-worker.ts (router/lifecycle ~254 lines)
  ├─ sessionRegistry.ts
  ├─ captureCoordinator.ts
  ├─ captureSupport.ts
  ├─ captureModes/{visible,fullPage,element,region}Capture.ts
  ├─ editorGateway.ts -> editorTickets.ts
  ├─ temporaryStorage.ts
  └─ downloadService.ts
```

وفي content أصبح هناك router واحد، validator مشترك، `DomPatchLedger`، ومالك معاملات تجهيز الالتقاط بدلاً من globals متفرقة.

### بوابة النشر اليدوية المتبقية

هذه ليست أخطاء كود مفتوحة، لكنها تبقى إلزامية قبل توزيع الحزمة:

1. تشغيل الأوضاع الأربعة من زر الإضافة الأصلي على Chrome Stable headed؛ Playwright headless لا يملك primitive موثوقاً للنقر native extension action ومنح `activeTab`.
2. اعتماد PNG golden بصرياً على Windows ثم منصة ثانية، خصوصاً DPR 1.25/2/3 والخطوط غير الحتمية.
3. اختبار ترقية بيانات فعلي من نسخة 1.4.0 مثبتة واختبار تثبيت نظيف من `dist/`.
4. فحص يدوي لموقع X الحالي وموقعين إخباريين حقيقيين؛ fixture المحلي يغطي avatar/media contract لكنه لا يحل محل تغيرات المواقع الخارجية.

القيود الموثقة وليست عيوباً قابلة للإصلاح من content script: لا يمكن فحص closed Shadow DOM أو DOM داخل iframe غير متاح؛ تظل البكسلات التي رسمها المتصفح قابلة للالتقاط وفق سلوك Chromium.

### تصحيح التطابق البكسلي اللاحق — CAP-009

أثبتت مقارنة لقطة Parotia Pick بلقطة X الأصلية أن تجهيز العنصر نفسه كان سبب الفقد والتشويه: تغيير zoom أعاد بناء تخطيط X المتجاوب، بينما فرض CSS وخصائص الصور غيّر شجرة الرسم التي كان يفترض تصويرها. أزيلت هذه العمليات من Element Capture المرئي كلياً. العقد الحالي هو: قياس read-only ← لقطة viewport واحدة ← قص بكسلي مباشر ← تكبير PNG آمن عالي الجودة إلى ×2. لا يُستخدم التمرير والتجميع إلا إذا كان العنصر لا يمكن أن يوجد كاملاً داخل إطار واحد.

دليل الإغلاق الآلي المباشر: اختبارات `ElementCaptureIsolator fidelity contract` تثبت تطابق DOM وعدم التمرير، واختبار handler يثبت القص عند DPR الفعلي، واختبار worker يثبت لقطة واحدة وعدم استدعاء `chrome.tabs.setZoom`. يبقى فحص X الحقيقي على Chrome Stable جزءاً من بوابة النشر اليدوية لأن بنية الموقع تتغير خارج سيطرة المشروع.
