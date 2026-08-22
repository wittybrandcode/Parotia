import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ParotiaLogo } from "./brand";
import {
  BoxSelect,
  Camera,
  CircleX,
  Crosshair,
  EyeOff,
  Globe,
  History,
  Lock,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import "./options.css";

type Lang = "ar" | "en";
type Tab = "about" | "guide";

type TK =
  | "tabAbout" | "tabGuide"
  | "heroSub" | "heroDesc"
  | "featuresTitle"
  | "featureFreeze" | "featureFreezeD"
  | "featurePick" | "featurePickD"
  | "featureCapture" | "featureCaptureD"
  | "featureRegion" | "featureRegionD"
  | "guideTitle" | "guideDesc"
  | "footerText" | "footerGH";

const t: Record<Lang, Record<TK, string>> = {
  en: {
    tabAbout: "About",
    tabGuide: "How It Works",
    heroSub: "Clean the stage. Keep the story.",
    heroDesc: "Parotia is a Chrome extension that declutters news articles, blog posts, and any web page — removing ads, navigation bars, sidebars, and distractions so you can focus on what matters.",
    featuresTitle: "What Parotia can do",
    featureFreeze: "Freeze the page",
    featureFreezeD: "Pause live updates — new ads and pop-ups can't interrupt your cleanup.",
    featurePick: "Pick any element",
    featurePickD: "Hover to highlight, click to select ads, banners, sidebars, or any distraction.",
    featureCapture: "Capture it clean",
    featureCaptureD: "Export the whole article as a polished PNG — no clutter, ready to share.",
    featureRegion: "Select a region",
    featureRegionD: "Draw a rectangle around exactly the part of the page you want to keep.",
    guideTitle: "Toolbar Guide",
    guideDesc: "Every button on the Parotia toolbar — exactly as it appears in the extension.",
    footerText: "Parotia — Open source Chrome extension",
    footerGH: "View on GitHub",
  },
  ar: {
    tabAbout: "نبذة",
    tabGuide: "كيف يعمل",
    heroSub: "نظّف المسرح. احتفظ بالقصة.",
    heroDesc: "Parotia هو إضافة لجوجل كروم تنظف المقالات الإخبارية وصفحات الويب — بإزالة الإعلانات وأشرطة التنقل والأعمدة الجانبية والمشتتات حتى تركز على ما يهمك.",
    featuresTitle: "ماذا يقدم لك Parotia",
    featureFreeze: "تجميد الصفحة",
    featureFreezeD: "أوقف التحديثات المباشرة — لا يمكن للإعلانات والنوافذ المنبثقة مقاطعة تنظيفك.",
    featurePick: "تحديد أي عنصر",
    featurePickD: "مرر الماوس لإبراز العنصر، واضغط لتحديد الإعلانات أو اللافتات أو الأعمدة الجانبية.",
    featureCapture: "التقاط نظيف",
    featureCaptureD: "صدّر المقال كاملاً كصورة PNG مصقولة — بدون فوضى وجاهزة للمشاركة.",
    featureRegion: "تحديد منطقة",
    featureRegionD: "ارسم مستطيلاً حول الجزء الذي تريد الاحتفاظ به من الصفحة بالضبط.",
    guideTitle: "دليل الأزرار",
    guideDesc: "كل زر في شريط Parotia — كما يظهر بالضبط في الإضافة.",
    footerText: "Parotia — إضافة مفتوحة المصدر لجوجل كروم",
    footerGH: "عرض على GitHub",
  },
};

/* ───────── Version ───────── */
function getVersion(): string {
  try {
    const manifest = chrome.runtime.getManifest();
    return manifest?.version ?? "1.4.0";
  } catch {
    return "1.4.0";
  }
}

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
  { label: "Freeze / Unfreeze", labelAr: "تجميد / إلغاء التجميد", desc: "Locks the page against live updates (new ads, pop-ups) so you can clean without interruptions. Click again to unfreeze.", descAr: "يقفل الصفحة ضد التحديثات المباشرة. اضغط مرة أخرى لإلغاء التجميد.", icon: <Lock size={18} />, color: "#c1e899" },
  { label: "Pick", labelAr: "تحديد", desc: "Activate the element picker. Hover to highlight, click to select, then use Delete or Hide.", descAr: "تفعيل أداة تحديد العناصر. مرر الماوس للتحديد، اضغط للتحديد، ثم استخدم الحذف أو الإخفاء.", icon: <Crosshair size={18} />, color: "#c3cbdb" },
  { label: "Delete", labelAr: "حذف", desc: "Permanently removes the selected element. Restorable with Undo.", descAr: "يحذف العنصر المحدد نهائياً. يمكن استعادته بالتراجع.", icon: <Trash2 size={18} />, color: "#f87171" },
  { label: "Hide / Show", labelAr: "إظهار / إخفاء", desc: "Temporarily hides the element (display: none). Click Show to reveal it again.", descAr: "يخفي العنصر مؤقتاً. اضغط إظهار لإعادته.", icon: <EyeOff size={18} />, color: "#fbbf24" },
  { label: "Capture", labelAr: "التقاط", desc: "Captures the entire article as a clean PNG — no ads, no sidebars.", descAr: "يلتقط المقال كصورة PNG نظيفة — بدون إعلانات أو أعمدة جانبية.", icon: <Camera size={18} />, color: "#f97316" },
  { label: "Select", labelAr: "تحديد منطقة", desc: "Draw a rectangle to capture a specific region as PNG.", descAr: "ارسم مستطيلاً لالتقاط منطقة معينة كصورة PNG.", icon: <BoxSelect size={18} />, color: "#06b6d4" },
  { label: "History", labelAr: "السجل", desc: "Shows a log of all cleanup actions this session.", descAr: "يعرض سجلاً بجميع إجراءات التنظيف في هذه الجلسة.", icon: <History size={18} />, color: "#94a3b8" },
  { label: "Undo", labelAr: "تراجع", desc: "Reverses the last cleanup action.", descAr: "يعكس آخر إجراء تنظيف.", icon: <Undo2 size={18} />, color: "#7cb3ff" },
  { label: "Redo", labelAr: "إعادة", desc: "Re-applies the last undone action.", descAr: "يعيد تطبيق آخر إجراء تم التراجع عنه.", icon: <Redo2 size={18} />, color: "#7cb3ff" },
  { label: "Reset", labelAr: "إعادة تعيين", desc: "Restores ALL removed and hidden elements.", descAr: "يستعيد جميع العناصر المحذوفة والمخفية.", icon: <RotateCcw size={18} />, color: "#fbbf24" },
  { label: "Close", labelAr: "إغلاق", desc: "Closes the Parotia toolbar.", descAr: "يغلق شريط Parotia.", icon: <CircleX size={18} />, color: "#f87171" },
];

/* ───────── Feature cards (About tab) ───────── */
type Feature = {
  key: "Freeze" | "Pick" | "Capture" | "Region";
  icon: React.ReactNode;
  color: string;
};

const FEATURES: Feature[] = [
  { key: "Freeze", icon: <Lock size={20} />, color: "#c1e899" },
  { key: "Pick", icon: <Crosshair size={20} />, color: "#7cb3ff" },
  { key: "Capture", icon: <Camera size={20} />, color: "#f97316" },
  { key: "Region", icon: <BoxSelect size={20} />, color: "#06b6d4" },
];

/* ───── Main App ───── */
export function OptionsApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("about");
  const tx = t[lang];
  const isRtl = lang === "ar";
  const version = getVersion();

  const aboutTabRef = useRef<HTMLButtonElement>(null);
  const guideTabRef = useRef<HTMLButtonElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = tab === "about" ? aboutTabRef.current : guideTabRef.current;
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    const onResize = () => {
      const target = tab === "about" ? aboutTabRef.current : guideTabRef.current;
      if (target) setIndicator({ left: target.offsetLeft, width: target.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab, lang]);

  return (
    <div className={`opt ${isRtl ? "opt-rtl" : ""}`}>
      {/* ── Language Toggle (fixed top-left, never moves) ── */}
      <button
        type="button"
        className="opt-lang"
        onClick={() => setLang((l) => l === "en" ? "ar" : "en")}
        title={lang === "en" ? "التبديل إلى العربية" : "Switch to English"}
      >
        <Globe size={16} />
      </button>

      {/* ── Hero (always visible) ── */}
      <header className="opt-hero">
        <div className="opt-hero-glow" />
        <div className="opt-hero-brand">
          <div className="opt-hero-logo"><ParotiaLogo /></div>
          <h1 className="opt-hero-title">PAROTIA</h1>
          <span className="opt-version">v{version}</span>
        </div>
        <p className="opt-hero-sub">{tx.heroSub}</p>
        <p className="opt-hero-desc">{tx.heroDesc}</p>
      </header>

      {/* ── Tab bar ── */}
      <nav className="opt-tabs" role="tablist">
        <button
          ref={aboutTabRef}
          type="button"
          role="tab"
          aria-selected={tab === "about"}
          className={`opt-tab ${tab === "about" ? "opt-tab-active" : ""}`}
          onClick={() => setTab("about")}
        >
          {tx.tabAbout}
        </button>
        <button
          ref={guideTabRef}
          type="button"
          role="tab"
          aria-selected={tab === "guide"}
          className={`opt-tab ${tab === "guide" ? "opt-tab-active" : ""}`}
          onClick={() => setTab("guide")}
        >
          {tx.tabGuide}
        </button>
        <span
          className="opt-tab-indicator"
          style={{ left: `${indicator.left}px`, width: `${indicator.width}px` }}
        />
      </nav>

      {/* ── About tab ── */}
      {tab === "about" && (
        <section className="opt-panel">
          <h2 className="opt-section-title">{tx.featuresTitle}</h2>
          <div className="opt-features">
            {FEATURES.map((f) => (
              <div key={f.key} className="opt-feature-card">
                <span className="opt-feature-icon" style={{ background: `${f.color}18`, color: f.color }}>
                  {f.icon}
                </span>
                <h3 className="opt-feature-title">{tx[`feature${f.key}`]}</h3>
                <p className="opt-feature-desc">{tx[`feature${f.key}D`]}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Guide tab ── */}
      {tab === "guide" && (
        <section className="opt-panel">
          <h2 className="opt-section-title">{tx.guideTitle}</h2>
          <p className="opt-section-desc">{tx.guideDesc}</p>
          <div className="opt-guide">
            {TOOLBAR_BUTTONS.map((btn, i) => (
              <div key={i} className="opt-guide-row">
                <span className="opt-guide-icon" style={{ background: `${btn.color}18`, color: btn.color }}>
                  {btn.icon}
                </span>
                <div className="opt-guide-text">
                  <span className="opt-guide-label">{isRtl ? btn.labelAr : btn.label}</span>
                  <span className="opt-guide-desc">{isRtl ? btn.descAr : btn.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="opt-footer">
        <span className="opt-footer-logo"><ParotiaLogo /></span>
        <p>{tx.footerText}</p>
        <a className="opt-footer-link" href="https://github.com/wittybrandcode/Parotia" target="_blank" rel="noopener noreferrer">{tx.footerGH}</a>
      </footer>
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<OptionsApp />);
