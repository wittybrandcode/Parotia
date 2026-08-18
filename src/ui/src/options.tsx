import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SitePreset } from "@shared/types";
import { ChromeStoragePresetRepository } from "@storage/chromeStorageRepositories";
import { PAROTIA_SLOGAN, ParotiaLogo } from "./brand";
import {
  Bookmark,
  BookmarkCheck,
  BoxSelect,
  Camera,
  CircleX,
  Crosshair,
  ExternalLink,
  Eye,
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

const repository = new ChromeStoragePresetRepository();

type Lang = "ar" | "en";

type TK =
  | "heroTitle" | "heroSub" | "heroDesc" | "heroHow" | "heroHowDesc"
  | "guideTitle" | "guideDesc"
  | "gBrand" | "gBrandD" | "gPick" | "gPickD" | "gDelete" | "gDeleteD"
  | "gHide" | "gHideD" | "gKeep" | "gKeepD" | "gSave" | "gSaveD"
  | "gEnable" | "gEnableD" | "gCapture" | "gCaptureD" | "gRegion" | "gRegionD"
  | "gHistory" | "gHistoryD" | "gUndo" | "gUndoD" | "gRedo" | "gRedoD"
  | "gReset" | "gResetD" | "gSettings" | "gSettingsD" | "gClose" | "gCloseD"
  | "presetTitle" | "presetDesc" | "presetEmpty"
  | "active" | "off" | "enable" | "disable" | "delete"
  | "kbTitle" | "kbFreeze" | "kbFreezeD" | "kbPick" | "kbPickD"
  | "kbDel" | "kbDelD" | "kbEsc" | "kbEscD"
  | "footerText" | "footerGH" | "langLabel";

const t: Record<Lang, Record<TK, string>> = {
  en: {
    langLabel: "عربي",
    heroTitle: "Parotia",
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
    presetTitle: "Saved Presets", presetDesc: "Presets remember how you cleaned a site so Parotia can auto-apply the same cleanup on your next visit.",
    presetEmpty: "No presets yet. Clean a site, then press Save in the toolbar to create one.",
    active: "Active", off: "Off", enable: "Enable", disable: "Disable", delete: "Delete",
    kbTitle: "Keyboard Shortcuts",
    kbFreeze: "Shift + Alt + F", kbFreezeD: "Toggle Freeze / Unfreeze",
    kbPick: "Shift + Alt + P", kbPickD: "Toggle element picker",
    kbDel: "Delete", kbDelD: "Delete the selected element (while picking)",
    kbEsc: "Escape", kbEscD: "Cancel picking / close inspector",
    footerText: "Parotia — Open source Chrome extension", footerGH: "View on GitHub",
  },
  ar: {
    langLabel: "EN",
    heroTitle: "Parotia",
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
    presetTitle: "القوالب المحفوظة", presetDesc: "القوالب تتذكر كيف نظفت صفحة حتى يتمكن Parotia من تطبيق نفس التنظيف تلقائياً.",
    presetEmpty: "لا توجد قوالب بعد. نظّف صفحة، ثم اضغط حفظ في الشريط لإنشاء قالب.",
    active: "مفعّل", off: "معطّل", enable: "تفعيل", disable: "تعطيل", delete: "حذف",
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
  group: number;
};

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  // Group 0: Brand
  { label: "Freeze / Unfreeze", labelAr: "تجميد / إلغاء التجميد", desc: "Locks the page against live updates (new ads, pop-ups) so you can clean without interruptions. Click again to unfreeze.", descAr: "يقفل الصفحة ضد التحديثات المباشرة. اضغط مرة أخرى لإلغاء التجميد.", icon: <ParotiaLogo />, color: "#c1e899", group: 0 },
  // Group 1: Pick
  { label: "Pick", labelAr: "تحديد", desc: "Activate the element picker. Hover to highlight, click to select, then use Delete, Hide, or Keep.", descAr: "تفعيل أداة تحديد العناصر. مرر الماوس للتحديد، اضغط للتحديد، ثم استخدم الحذف أو الإخفاء أو الحماية.", icon: <Crosshair size={18} />, color: "#c3cbdb", group: 1 },
  // Group 2: Delete, Hide, Keep
  { label: "Delete", labelAr: "حذف", desc: "Permanently removes the selected element. Restorable with Undo.", descAr: "يحذف العنصر المحدد نهائياً. يمكن استعادته بالتراجع.", icon: <Trash2 size={18} />, color: "#f87171", group: 2 },
  { label: "Hide / Show", labelAr: "إظهار / إخفاء", desc: "Temporarily hides the element (display: none). Click Show to reveal it again.", descAr: "يخفي العنصر مؤقتاً. اضغط إظهار لإعادته.", icon: <EyeOff size={18} />, color: "#fbbf24", group: 2 },
  { label: "Keep", labelAr: "حماية", desc: "Protects the element so Parotia will never delete or hide it.", descAr: "يحمي العنصر حتى لا يحذفه أو يخفيه Parotia.", icon: <ShieldCheck size={18} />, color: "#c1e899", group: 2 },
  // Group 3: Save, Enable
  { label: "Save", labelAr: "حفظ", desc: "Saves your cleanup rules as a reusable preset for this site.", descAr: "يحفظ قواعد التنظيف كقالب قابل لإعادة الاستخدام لهذا الموقع.", icon: <Bookmark size={18} />, color: "#a78bfa", group: 3 },
  { label: "Enable", labelAr: "تفعيل", desc: "A saved preset was detected. Click to auto-apply it on every visit.", descAr: "تم اكتشاف قالب محفوظ. اضغط لتطبيقه تلقائياً في كل زيارة.", icon: <BookmarkCheck size={18} />, color: "#22c55e", group: 3 },
  // Group 4: Capture, Select, History, Undo, Redo, Reset
  { label: "Capture", labelAr: "التقاط", desc: "Captures the entire article as a clean PNG — no ads, no sidebars.", descAr: "يلتقط المقال كصورة PNG نظيفة — بدون إعلانات أو أعمدة جانبية.", icon: <Camera size={18} />, color: "#f97316", group: 4 },
  { label: "Select", labelAr: "تحديد منطقة", desc: "Draw a rectangle to capture a specific region as PNG.", descAr: "ارسم مستطيلاً لالتقاط منطقة معينة كصورة PNG.", icon: <BoxSelect size={18} />, color: "#06b6d4", group: 4 },
  { label: "History", labelAr: "السجل", desc: "Shows a log of all cleanup actions this session.", descAr: "يعرض سجلاً بجميع إجراءات التنظيف في هذه الجلسة.", icon: <History size={18} />, color: "#94a3b8", group: 4 },
  { label: "Undo", labelAr: "تراجع", desc: "Reverses the last cleanup action.", descAr: "يعكس آخر إجراء تنظيف.", icon: <Undo2 size={18} />, color: "#7cb3ff", group: 4 },
  { label: "Redo", labelAr: "إعادة", desc: "Re-applies the last undone action.", descAr: "يعيد تطبيق آخر إجراء تم التراجع عنه.", icon: <Redo2 size={18} />, color: "#7cb3ff", group: 4 },
  { label: "Reset", labelAr: "إعادة تعيين", desc: "Restores ALL removed and hidden elements.", descAr: "يستعيد جميع العناصر المحذوفة والمخفية.", icon: <RotateCcw size={18} />, color: "#fbbf24", group: 4 },
  // Side
  { label: "Settings", labelAr: "الإعدادات", desc: "Opens this settings page.", descAr: "يفتح صفحة الإعدادات هذه.", icon: <ExternalLink size={18} />, color: "#94a3b8", group: 5 },
  { label: "Close", labelAr: "إغلاق", desc: "Closes the Parotia toolbar.", descAr: "يغلق شريط Parotia.", icon: <CircleX size={18} />, color: "#f87171", group: 5 },
];

function getIconStyle(color: string, isLogo: boolean): React.CSSProperties {
  if (isLogo) return {};
  return { background: `${color}18`, color };
}

/* ───── Main App ───── */
export function OptionsApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [presets, setPresets] = useState<SitePreset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const tx = t[lang] as Record<TK, string>;
  const isRtl = lang === "ar";

  const refresh = useCallback(async () => {
    try { setPresets(await repository.list()); }
    catch { setMessage({ ok: false, text: "Failed to load presets." }); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggleEnabled = async (preset: SitePreset) => {
    setBusy(true);
    try {
      const on = preset.enabled === true;
      const next: SitePreset = { ...preset, enabled: !on, metadata: { ...preset.metadata, updatedAt: Date.now() } };
      await repository.save(next);
      setMessage({ ok: true, text: `${!on ? tx.enable : tx.disable} ${preset.metadata.name}` });
      await refresh();
    } finally { setBusy(false); }
  };

  const removePreset = async (preset: SitePreset) => {
    if (!window.confirm(`Delete preset "${preset.metadata.name}"?`)) return;
    setBusy(true);
    try {
      await repository.delete(preset.id);
      setMessage({ ok: true, text: `${tx.delete} ${preset.metadata.name}` });
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className={`opt ${isRtl ? "opt-rtl" : ""}`}>
      {/* ── Language Toggle ── */}
      <button
        type="button"
        className="opt-lang"
        onClick={() => setLang((l) => l === "en" ? "ar" : "en")}
        title={tx.langLabel}
      >
        <Globe size={15} />
        <span className="opt-lang-text">{tx.langLabel}</span>
      </button>

      {/* ── Hero ── */}
      <header className="opt-hero">
        <div className="opt-hero-glow" />
        <div className="opt-hero-logo"><ParotiaLogo /></div>
        <h1 className="opt-hero-title">PAROTIA</h1>
        <p className="opt-hero-sub">{tx.heroSub}</p>
        <div className="opt-hero-divider" />
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
            const iconStyle = isLogo
              ? { background: "#fff", color: "#0f141a" }
              : getIconStyle(btn.color, false);
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

      {/* ── Presets ── */}
      <section className="opt-section">
        <h2 className="opt-section-title">{tx.presetTitle}</h2>
        <p className="opt-section-desc">{tx.presetDesc}</p>
        {message && <div className="opt-message" data-ok={message.ok}>{message.text}</div>}
        {presets.length === 0 ? (
          <p className="opt-empty">{tx.presetEmpty}</p>
        ) : (
          <ul className="opt-list">
            {presets.map((p) => {
              const on = p.enabled === true;
              const n = p.cleanup?.rules.length ?? 0;
              return (
                <li key={p.id} className="opt-card">
                  <div className="opt-card-info">
                    <div className="opt-card-title">
                      {p.metadata.name}
                      <span className="opt-chip" data-ok={on}>{on ? tx.active : tx.off}</span>
                    </div>
                    <div className="opt-card-meta">{p.site.hostname} &middot; {n} rule{n === 1 ? "" : "s"}</div>
                  </div>
                  <div className="opt-card-actions">
                    <button type="button" className="opt-btn" disabled={busy} onClick={() => void toggleEnabled(p)}>
                      {on ? tx.disable : tx.enable}
                    </button>
                    <button type="button" className="opt-btn opt-btn-danger" disabled={busy} onClick={() => void removePreset(p)}>
                      {tx.delete}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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

/* ── KbRow ── */
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
