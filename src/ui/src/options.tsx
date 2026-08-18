import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ParotiaLogo } from "./brand";
import {
  Bookmark,
  BookmarkCheck,
  BoxSelect,
  Camera,
  CircleX,
  Crosshair,
  ExternalLink,
  EyeOff,
  Globe,
  History,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import "./options.css";

type Lang = "ar" | "en";

type TK =
  | "heroSub" | "heroDesc" | "heroHow" | "heroHowDesc"
  | "guideTitle" | "guideDesc"
  | "gBrand" | "gBrandD" | "gPick" | "gPickD" | "gDelete" | "gDeleteD"
  | "gHide" | "gHideD" | "gKeep" | "gKeepD" | "gSave" | "gSaveD"
  | "gEnable" | "gEnableD" | "gCapture" | "gCaptureD" | "gRegion" | "gRegionD"
  | "gHistory" | "gHistoryD" | "gUndo" | "gUndoD" | "gRedo" | "gRedoD"
  | "gReset" | "gResetD" | "gSettings" | "gSettingsD" | "gClose" | "gCloseD"
  | "kbTitle" | "kbFreeze" | "kbFreezeD" | "kbPick" | "kbPickD"
  | "kbDel" | "kbDelD" | "kbEsc" | "kbEscD"
  | "footerText" | "footerGH";

const t: Record<Lang, Record<TK, string>> = {
  en: {
    heroSub: "Clean the stage. Keep the story.",
    heroDesc: "Parotia is a Chrome extension that declutters news articles, blog posts, and any web page — removing ads, navigation bars, sidebars, and distractions so you can focus on what matters.",
    heroHow: "How it works",
    heroHowDesc: "Click the Parotia icon on any page. The toolbar freezes the page and lets you pick elements to delete, hide, or protect. Save your cleanup as a preset and it will auto-apply next time you visit.",
    guideTitle: "Toolbar Guide",
    guideDesc: "Every button on the Parotia toolbar — exactly as it appears in the extension.",
    gBrand: "Freeze / Unfreeze", gBrandD: "Locks the page against live updates (new ads, pop-ups) so you can clean without interruptions. Click again to unfreeze.",
    gPick: "Pick", gPickD: "Activate the element picker. Hover to highlight, click to select, then use Delete, Hide, or Keep.",
    gDelete: "Delete", gDeleteD: "Permanently removes the selected element. Restorable with Undo.",
    gHide: "Hide / Show", gHideD: "Temporarily hides the element (display: none). Click Show to reveal it again.",
    gKeep: "Keep", gKeepD: "Protects the element so Parotia will never delete or hide it.",
    gSave: "Save", gSaveD: "Saves your cleanup rules as a reusable preset for this site.",
    gEnable: "Enable", gEnableD: "A saved preset was detected. Click to auto-apply it on every visit.",
    gCapture: "Capture", gCaptureD: "Captures the entire article as a clean PNG — no ads, no sidebars.",
    gRegion: "Select", gRegionD: "Draw a rectangle to capture a specific region as PNG.",
    gHistory: "History", gHistoryD: "Shows a log of all cleanup actions this session.",
    gUndo: "Undo", gUndoD: "Reverses the last cleanup action.",
    gRedo: "Redo", gRedoD: "Re-applies the last undone action.",
    gReset: "Reset", gResetD: "Restores ALL removed and hidden elements.",
    gSettings: "Settings", gSettingsD: "Opens this settings page.",
    gClose: "Close", gCloseD: "Closes the Parotia toolbar.",
    kbTitle: "Keyboard Shortcuts",
    kbFreeze: "Shift + Alt + F", kbFreezeD: "Toggle Freeze / Unfreeze",
    kbPick: "Shift + Alt + P", kbPickD: "Toggle element picker",
    kbDel: "Delete", kbDelD: "Delete the selected element (while picking)",
    kbEsc: "Escape", kbEscD: "Cancel picking / close inspector",
    footerText: "Parotia — Open source Chrome extension", footerGH: "View on GitHub",
  },
  ar: {
    heroSub: "نظّف المسرح. احتفظ بالقصة.",
    heroDesc: "Parotia هو إضافة لجوجل كروم تنظف المقالات الإخبارية وصفحات الويب — بإزالة الإعلانات وأشرطة التنقل والأعمدة الجانبية والمشتتات حتى تركز على ما يهمك.",
    heroHow: "كيف يعمل",
    heroHowDesc: "اضغط على أيقونة Parotia في أي صفحة. يجمّد الشريط الصفحة ويتيح لك تحديد العناصر للحذف أو الإخفاء أو الحماية. احفظ التنظيف كقالب وسيتم تطبيقه تلقائياً في المرة القادمة.",
    guideTitle: "دليل الأزرار",
    guideDesc: "كل زر في شريط Parotia — كما يظهر بالضبط في الإضافة.",
    gBrand: "تجميد / إلغاء التجميد", gBrandD: "يقفل الصفحة ضد التحديثات المباشرة. اضغط مرة أخرى لإلغاء التجميد.",
    gPick: "تحديد", gPickD: "تفعيل أداة تحديد العناصر. مرر الماوس للتحديد، اضغط للتحديد، ثم استخدم الحذف أو الإخفاء أو الحماية.",
    gDelete: "حذف", gDeleteD: "يحذف العنصر المحدد نهائياً. يمكن استعادته بالتراجع.",
    gHide: "إظهار / إخفاء", gHideD: "يخفي العنصر مؤقتاً. اضغط إظهار لإعادته.",
    gKeep: "حماية", gKeepD: "يحمي العنصر حتى لا يحذفه أو يخفيه Parotia.",
    gSave: "حفظ", gSaveD: "يحفظ قواعد التنظيف كقالب قابل لإعادة الاستخدام لهذا الموقع.",
    gEnable: "تفعيل", gEnableD: "تم اكتشاف قالب محفوظ. اضغط لتطبيقه تلقائياً في كل زيارة.",
    gCapture: "التقاط", gCaptureD: "يلتقط المقال كصورة PNG نظيفة — بدون إعلانات أو أعمدة جانبية.",
    gRegion: "تحديد", gRegionD: "ارسم مستطيلاً لالتقاط منطقة معينة كصورة PNG.",
    gHistory: "السجل", gHistoryD: "يعرض سجلاً بجميع إجراءات التنظيف في هذه الجلسة.",
    gUndo: "تراجع", gUndoD: "يعكس آخر إجراء تنظيف.",
    gRedo: "إعادة", gRedoD: "يعيد تطبيق آخر إجراء تم التراجع عنه.",
    gReset: "إعادة تعيين", gResetD: "يستعيد جميع العناصر المحذوفة والمخفية.",
    gSettings: "الإعدادات", gSettingsD: "يفتح صفحة الإعدادات هذه.",
    gClose: "إغلاق", gCloseD: "يغلق شريط Parotia.",
    kbTitle: "اختصارات لوحة المفاتيح",
    kbFreeze: "Shift + Alt + F", kbFreezeD: "تبديل التجميد / إلغاء التجميد",
    kbPick: "Shift + Alt + P", kbPickD: "تبديل أداة تحديد العناصر",
    kbDel: "Delete", kbDelD: "حذف العنصر المحدد (أثناء التحديد)",
    kbEsc: "Escape", kbEscD: "إلغاء التحديد / إغلاق المفتاح",
    footerText: "Parotia — إضافة مفتوحة المصدر لجوجل كروم", footerGH: "عرض على GitHub",
  },
};

/* ───────── Toolbar buttons (exact order from App.tsx) ───────── */
type ToolbarButton = {
  label: string;
  labelAr: string;
  desc: string;
  descAr: string;
  icon: React.ReactNode;
  color: string;
};

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { label: "Freeze / Unfreeze", labelAr: "تجميد / إلغاء التجميد", desc: "Locks the page against live updates (new ads, pop-ups) so you can clean without interruptions. Click again to unfreeze.", descAr: "يقفل الصفحة ضد التحديثات المباشرة. اضغط مرة أخرى لإلغاء التجميد.", icon: <ParotiaLogo />, color: "#c1e899" },
  { label: "Pick", labelAr: "تحديد", desc: "Activate the element picker. Hover to highlight, click to select, then use Delete, Hide, or Keep.", descAr: "تفعيل أداة تحديد العناصر. مرر الماوس للتحديد، اضغط للتحديد، ثم استخدم الحذف أو الإخفاء أو الحماية.", icon: <Crosshair size={18} />, color: "#c3cbdb" },
  { label: "Delete", labelAr: "حذف", desc: "Permanently removes the selected element. Restorable with Undo.", descAr: "يحذف العنصر المحدد نهائياً. يمكن استعادته بالتراجع.", icon: <Trash2 size={18} />, color: "#f87171" },
  { label: "Hide / Show", labelAr: "إظهار / إخفاء", desc: "Temporarily hides the element (display: none). Click Show to reveal it again.", descAr: "يخفي العنصر مؤقتاً. اضغط إظهار لإعادته.", icon: <EyeOff size={18} />, color: "#fbbf24" },
  { label: "Keep", labelAr: "حماية", desc: "Protects the element so Parotia will never delete or hide it.", descAr: "يحمي العنصر حتى لا يحذفه أو يخفيه Parotia.", icon: <ShieldCheck size={18} />, color: "#c1e899" },
  { label: "Save", labelAr: "حفظ", desc: "Saves your cleanup rules as a reusable preset for this site.", descAr: "يحفظ قواعد التنظيف كقالب قابل لإعادة الاستخدام لهذا الموقع.", icon: <Bookmark size={18} />, color: "#a78bfa" },
  { label: "Enable", labelAr: "تفعيل", desc: "A saved preset was detected. Click to auto-apply it on every visit.", descAr: "تم اكتشاف قالب محفوظ. اضغط لتطبيقه تلقائياً في كل زيارة.", icon: <BookmarkCheck size={18} />, color: "#22c55e" },
  { label: "Capture", labelAr: "التقاط", desc: "Captures the entire article as a clean PNG — no ads, no sidebars.", descAr: "يلتقط المقال كصورة PNG نظيفة — بدون إعلانات أو أعمدة جانبية.", icon: <Camera size={18} />, color: "#f97316" },
  { label: "Select", labelAr: "تحديد منطقة", desc: "Draw a rectangle to capture a specific region as PNG.", descAr: "ارسم مستطيلاً لالتقاط منطقة معينة كصورة PNG.", icon: <BoxSelect size={18} />, color: "#06b6d4" },
  { label: "History", labelAr: "السجل", desc: "Shows a log of all cleanup actions this session.", descAr: "يعرض سجلاً بجميع إجراءات التنظيف في هذه الجلسة.", icon: <History size={18} />, color: "#94a3b8" },
  { label: "Undo", labelAr: "تراجع", desc: "Reverses the last cleanup action.", descAr: "يعكس آخر إجراء تنظيف.", icon: <Undo2 size={18} />, color: "#7cb3ff" },
  { label: "Redo", labelAr: "إعادة", desc: "Re-applies the last undone action.", descAr: "يعيد تطبيق آخر إجراء تم التراجع عنه.", icon: <Redo2 size={18} />, color: "#7cb3ff" },
  { label: "Reset", labelAr: "إعادة تعيين", desc: "Restores ALL removed and hidden elements.", descAr: "يستعيد جميع العناصر المحذوفة والمخفية.", icon: <RotateCcw size={18} />, color: "#fbbf24" },
  { label: "Settings", labelAr: "الإعدادات", desc: "Opens this settings page.", descAr: "يفتح صفحة الإعدادات هذه.", icon: <ExternalLink size={18} />, color: "#94a3b8" },
  { label: "Close", labelAr: "إغلاق", desc: "Closes the Parotia toolbar.", descAr: "يغلق شريط Parotia.", icon: <CircleX size={18} />, color: "#f87171" },
];

/* ───── Main App ───── */
export function OptionsApp() {
  const [lang, setLang] = useState<Lang>("en");
  const tx = t[lang] as Record<TK, string>;
  const isRtl = lang === "ar";

  return (
    <div className={`opt ${isRtl ? "opt-rtl" : ""}`}>
      {/* ── Language Toggle (icon only, fixed position) ── */}
      <button
        type="button"
        className="opt-lang"
        onClick={() => setLang((l) => l === "en" ? "ar" : "en")}
        title={lang === "en" ? "التبديل إلى العربية" : "Switch to English"}
      >
        <Globe size={16} />
      </button>

      {/* ── Hero ── */}
      <header className="opt-hero">
        <div className="opt-hero-glow" />
        <div className="opt-hero-logo"><ParotiaLogo /></div>
        <h1 className="opt-hero-title">PAROTIA</h1>
        <p className="opt-hero-sub">{tx.heroSub}</p>
        <p className="opt-hero-desc">{tx.heroDesc}</p>
      </header>

      {/* ── How it works ── */}
      <section className="opt-section">
        <h2 className="opt-section-title">{tx.heroHow}</h2>
        <p className="opt-section-desc">{tx.heroHowDesc}</p>
      </section>

      {/* ── Toolbar Guide ── */}
      <section className="opt-section">
        <h2 className="opt-section-title">{tx.guideTitle}</h2>
        <p className="opt-section-desc">{tx.guideDesc}</p>
        <div className="opt-guide">
          {TOOLBAR_BUTTONS.map((btn, i) => {
            const isLogo = btn.label === "Freeze / Unfreeze";
            const iconStyle: React.CSSProperties = isLogo
              ? { background: "#fff", color: "#0f141a" }
              : { background: `${btn.color}18`, color: btn.color };
            return (
              <div key={i} className="opt-guide-row">
                <span
                  className={`opt-guide-icon ${isLogo ? "opt-guide-logo" : ""}`}
                  style={iconStyle}
                >
                  {btn.icon}
                </span>
                <div className="opt-guide-text">
                  <span className="opt-guide-label">{isRtl ? btn.labelAr : btn.label}</span>
                  <span className="opt-guide-desc">{isRtl ? btn.descAr : btn.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Keyboard Shortcuts ── */}
      <section className="opt-section">
        <h2 className="opt-section-title">{tx.kbTitle}</h2>
        <div className="opt-kb">
          <KbRow keys={tx.kbFreeze} desc={tx.kbFreezeD} />
          <KbRow keys={tx.kbPick} desc={tx.kbPickD} />
          <KbRow keys={tx.kbDel} desc={tx.kbDelD} />
          <KbRow keys={tx.kbEsc} desc={tx.kbEscD} />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="opt-footer">
        <span className="opt-footer-logo"><ParotiaLogo /></span>
        <p>{tx.footerText}</p>
        <a className="opt-footer-link" href="https://github.com/wittybrandcode/Parotia" target="_blank" rel="noopener noreferrer">{tx.footerGH}</a>
      </footer>
    </div>
  );
}

function KbRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="opt-kb-row">
      <kbd className="opt-kb-keys">{keys}</kbd>
      <span className="opt-kb-desc">{desc}</span>
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<OptionsApp />);
