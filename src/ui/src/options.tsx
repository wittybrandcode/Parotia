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
  Loader2,
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
    guideDesc: "Every button on the Parotia toolbar explained.",
    gBrand: "Freeze / Unfreeze", gBrandD: "Locks the page against live updates (new ads, pop-ups) so you can clean without interruptions. Click again to unfreeze and resume normal browsing.",
    gPick: "Pick", gPickD: "Activate the element picker. Hover over any element on the page to highlight it, then click to select. Press Delete to remove, or use the toolbar actions.",
    gDelete: "Delete", gDeleteD: "Permanently removes the selected element from the page. Deleted elements can be restored with Undo.",
    gHide: "Hide / Show", gHideD: "Temporarily hides the selected element using CSS (display: none). Click again to show it. Useful when you're not sure you want to delete something.",
    gKeep: "Keep", gKeepD: "Protects the selected element so Parotia will never delete or hide it. Useful for preserving important content.",
    gSave: "Save Preset", gSaveD: "Saves your current cleanup rules as a reusable preset for this website. The preset appears in Settings where you can enable auto-apply.",
    gEnable: "Enable Preset", gEnableD: "A saved preset was detected for this site. Click to enable auto-apply — Parotia will clean this site automatically on every visit.",
    gCapture: "Capture", gCaptureD: "Captures the entire article as a clean PNG image — no ads, no sidebars. The image is saved to your Downloads folder.",
    gRegion: "Select Region", gRegionD: "Draw a rectangle on the page to capture a specific region as a PNG image.",
    gHistory: "History", gHistoryD: "Shows a log of all cleanup actions performed during this session. Each entry can be individually undone.",
    gUndo: "Undo", gUndoD: "Reverses the last cleanup action (delete, hide, or batch cleanup). Restores the element(s) to their original state.",
    gRedo: "Redo", gRedoD: "Re-applies the last undone action. Useful if you changed your mind after undoing.",
    gReset: "Reset", gResetD: "Restores ALL removed and hidden elements on the page. A fresh start without reloading.",
    gSettings: "Settings", gSettingsD: "Opens this guide and settings page where you can manage your saved presets.",
    gClose: "Close", gCloseD: "Closes the Parotia toolbar and removes it from the page.",
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
    guideDesc: "شرح كل زر في شريط Parotia.",
    gBrand: "تجميد / إلغاء التجميد", gBrandD: "يقفل الصفحة ضد التحديثات المباشرة (إعلانات جديدة، نوافذ منبثقة) حتى تتمكن من التنظيف دون انقطاع. اضغط مرة أخرى لإلغاء التجميد والتصفح الطبيعي.",
    gPick: "تحديد", gPickD: "تفعيل أداة تحديد العناصر. مرر الماوس فوق أي عنصر لتحديده، ثم اضغط عليه. اضغط Delete للحذف، أو استخدم أزرار الشريط.",
    gDelete: "حذف", gDeleteD: "يحذف العنصر المحدد نهائياً من الصفحة. يمكن استعادة العناصر المحذوفة باستخدام التراجع.",
    gHide: "إظهار / إخفاء", gHideD: "يخفي العنصر المحدد مؤقتاً باستخدام CSS. اضغط مرة أخرى لإظهاره. مفيد عندما لا تتأكد إذا كنت تريد حذف شيء ما.",
    gKeep: "حماية", gKeepD: "يحمي العنصر المحدد حتى لا يحذفه أو يخفيه Parotia. مفيد لحفظ المحتوى المهم.",
    gSave: "حفظ القالب", gSaveD: "يحفظ قواعد التنظيف الحالية كقالب قابل لإعادة الاستخدام لهذا الموقع. يظهر القالب في الإعدادات حيث يمكنك تفعيل التطبيق التلقائي.",
    gEnable: "تفعيل القالب", gEnableD: "تم اكتشاف قالب محفوظ لهذا الموقع. اضغط لتفعيل التطبيق التلقائي — سيقوم Parotia بتنظيف هذا الموقع تلقائياً في كل زيارة.",
    gCapture: "التقاط", gCaptureD: "يلتقط المقال الكامل كصورة PNG نظيفة — بدون إعلانات أو أعمدة جانبية. تُحفظ الصورة في مجلد التنزيلات.",
    gRegion: "تحديد منطقة", gRegionD: "ارسم مستطيلاً على الصفحة لالتقاط منطقة معينة كصورة PNG.",
    gHistory: "السجل", gHistoryD: "يعرض سجلاً بجميع إجراءات التنظيف التي تمت خلال هذه الجلسة. يمكن التراجع عن كل إجراء على حدة.",
    gUndo: "تراجع", gUndoD: "يعكس آخر إجراء تنظيف (حذف، إخفاء، أو تنظيف جماعي). يستعيد العناصر إلى حالتها الأصلية.",
    gRedo: "إعادة", gRedoD: "يعيد تطبيق آخر إجراء تم التراجع عنه. مفيد إذا غيّرت رأيك بعد التراجع.",
    gReset: "إعادة تعيين", gResetD: "يستعيد جميع العناصر المحذوفة والمخفية في الصفحة. بداية جديدة بدون إعادة تحميل.",
    gSettings: "الإعدادات", gSettingsD: "يفتح صفحة هذا الدليل والإعدادات حيث يمكنك إدارة القوالب المحفوظة.",
    gClose: "إغلاق", gCloseD: "يغلق شريط Parotia ويزيله من الصفحة.",
    presetTitle: "القوالب المحفوظة", presetDesc: "القوالب تتذكر كيف نظفت صفحة حتى يتمكن Parotia من تطبيق نفس التنظيف تلقائياً في زيارتك القادمة.",
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

type FeatureDef = {
  icon: React.ReactNode;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  color: string;
  bg: string;
};

function makeFeatures(): FeatureDef[] {
  return [
    {
      icon: <ParotiaLogo />,
      titleEn: "Freeze Page", titleAr: "تجميد الصفحة",
      descEn: "Lock the page against live updates so ads can't sneak back in.",
      descAr: "اقفل الصفحة ضد التحديثات المباشرة حتى لا تعود الإعلانات.",
      color: "#0f141a", bg: "linear-gradient(135deg, #c1e899, #93d463)",
    },
    {
      icon: <Crosshair size={22} />,
      titleEn: "Pick & Delete", titleAr: "تحديد وحذف",
      descEn: "Select any element and delete it — or similar ones with one click.",
      descAr: "حدد أي عنصر واحذفه — أو العناصر المتشابهة بنقرة واحدة.",
      color: "#7cb3ff", bg: "rgba(124, 179, 255, 0.12)",
    },
    {
      icon: <EyeOff size={22} />,
      titleEn: "Hide / Show", titleAr: "إظهار / إخفاء",
      descEn: "Temporarily hide elements without permanent deletion.",
      descAr: "أخفي العناصر مؤقتاً دون حذف دائم.",
      color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)",
    },
    {
      icon: <ShieldCheck size={22} />,
      titleEn: "Protect Content", titleAr: "حماية المحتوى",
      descEn: "Mark important elements so Parotia never touches them.",
      descAr: "حدد العناصر المهمة حتى لا يلمسها Parotia.",
      color: "#c1e899", bg: "rgba(193, 232, 153, 0.12)",
    },
    {
      icon: <Camera size={22} />,
      titleEn: "Clean Capture", titleAr: "التقاط نظيف",
      descEn: "Screenshot the article without ads, nav bars, or sidebars.",
      descAr: "لقطة شاشة للمقال بدون إعلانات أو أعمدة جانبية.",
      color: "#f97316", bg: "rgba(249, 115, 22, 0.12)",
    },
    {
      icon: <Bookmark size={22} />,
      titleEn: "Smart Presets", titleAr: "قوالب ذكية",
      descEn: "Save your cleanup and auto-apply it next time you visit.",
      descAr: "احفظ تنظيفك وطبيقه تلقائياً في المرة القادمة.",
      color: "#a78bfa", bg: "rgba(167, 139, 250, 0.12)",
    },
  ];
}

/* ───── Main App ───── */
export function OptionsApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [presets, setPresets] = useState<SitePreset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const tx = t[lang] as Record<TK, string>;
  const isRtl = lang === "ar";
  const features = makeFeatures();

  const refresh = useCallback(async () => {
    try { setPresets(await repository.list()); }
    catch { setMessage({ ok: false, text: "Failed to load presets." }); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggleEnabled = async (preset: SitePreset) => {
    setBusy(true);
    try {
      const enabled = preset.enabled === true;
      const next: SitePreset = { ...preset, enabled: !enabled, metadata: { ...preset.metadata, updatedAt: Date.now() } };
      await repository.save(next);
      setMessage({ ok: true, text: `${!enabled ? tx.enable : tx.disable} ${preset.metadata.name}` });
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
      {/* ── Fixed Language Toggle ── */}
      <button
        type="button"
        className="opt-lang"
        onClick={() => setLang((l) => l === "en" ? "ar" : "en")}
        title={tx.langLabel}
      >
        <Globe size={16} />
        <span className="opt-lang-text">{tx.langLabel}</span>
      </button>

      {/* ── Hero ── */}
      <header className="opt-hero">
        <div className="opt-hero-glow" />
        <div className="opt-hero-logo"><ParotiaLogo /></div>
        <h1 className="opt-hero-title">{tx.heroTitle}</h1>
        <p className="opt-hero-sub">{tx.heroSub}</p>
        <div className="opt-hero-divider" />
        <p className="opt-hero-desc">{tx.heroDesc}</p>
      </header>

      {/* ── How it works ── */}
      <section className="opt-section">
        <h2 className="opt-section-title">{tx.heroHow}</h2>
        <p className="opt-section-desc">{tx.heroHowDesc}</p>
      </section>

      {/* ── Features Grid ── */}
      <section className="opt-section">
        <div className="opt-features">
          {features.map((f, i) => (
            <div key={i} className="opt-feature">
              <span className="opt-feature-icon" style={{ background: f.bg, color: f.color }}>
                {f.icon}
              </span>
              <h3 className="opt-feature-title">{isRtl ? f.titleAr : f.titleEn}</h3>
              <p className="opt-feature-desc">{isRtl ? f.descAr : f.descEn}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Toolbar Guide ── */}
      <section className="opt-section">
        <h2 className="opt-section-title">{tx.guideTitle}</h2>
        <p className="opt-section-desc">{tx.guideDesc}</p>
        <div className="opt-guide">
          <GuideRow icon={<ParotiaLogo />} bg="#c1e899" label={tx.gBrand} desc={tx.gBrandD} isLogo />
          <GuideRow icon={<Crosshair size={18} />} color="#7cb3ff" label={tx.gPick} desc={tx.gPickD} />
          <GuideRow icon={<Trash2 size={18} />} color="#f87171" label={tx.gDelete} desc={tx.gDeleteD} />
          <GuideRow icon={<EyeOff size={18} />} color="#fbbf24" label={tx.gHide} desc={tx.gHideD} />
          <GuideRow icon={<ShieldCheck size={18} />} color="#c1e899" label={tx.gKeep} desc={tx.gKeepD} />
          <GuideRow icon={<Bookmark size={18} />} color="#a78bfa" label={tx.gSave} desc={tx.gSaveD} />
          <GuideRow icon={<BookmarkCheck size={18} />} color="#22c55e" label={tx.gEnable} desc={tx.gEnableD} />
          <GuideRow icon={<Camera size={18} />} color="#f97316" label={tx.gCapture} desc={tx.gCaptureD} />
          <GuideRow icon={<BoxSelect size={18} />} color="#06b6d4" label={tx.gRegion} desc={tx.gRegionD} />
          <GuideRow icon={<History size={18} />} color="#94a3b8" label={tx.gHistory} desc={tx.gHistoryD} />
          <GuideRow icon={<Undo2 size={18} />} color="#7cb3ff" label={tx.gUndo} desc={tx.gUndoD} />
          <GuideRow icon={<Redo2 size={18} />} color="#7cb3ff" label={tx.gRedo} desc={tx.gRedoD} />
          <GuideRow icon={<RotateCcw size={18} />} color="#fbbf24" label={tx.gReset} desc={tx.gResetD} />
          <GuideRow icon={<ExternalLink size={18} />} color="#94a3b8" label={tx.gSettings} desc={tx.gSettingsD} />
          <GuideRow icon={<CircleX size={18} />} color="#f87171" label={tx.gClose} desc={tx.gCloseD} />
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

/* ── GuideRow ── */
function GuideRow({ icon, color, bg, label, desc, isLogo }: {
  icon: React.ReactNode; color?: string; bg?: string; label: string; desc: string; isLogo?: boolean;
}) {
  return (
    <div className="opt-guide-row">
      <span
        className={`opt-guide-icon ${isLogo ? "opt-guide-logo" : ""}`}
        style={isLogo ? { background: bg, color: "#0f141a" } : { background: `${color}18`, color }}
      >
        {icon}
      </span>
      <div className="opt-guide-text">
        <span className="opt-guide-label">{label}</span>
        <span className="opt-guide-desc">{desc}</span>
      </div>
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
