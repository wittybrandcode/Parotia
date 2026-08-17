import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SitePreset } from "@shared/types";
import { ChromeStoragePresetRepository } from "@storage/chromeStorageRepositories";
import { PAROTIA_SLOGAN, ParotiaLogo } from "./brand";
import "./options.css";

const repository = new ChromeStoragePresetRepository();

export function OptionsApp() {
  const [presets, setPresets] = useState<SitePreset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPresets(await repository.list());
    } catch {
      setMessage({ ok: false, text: "Failed to load presets. Try reloading the page." });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleEnabled = async (preset: SitePreset) => {
    setBusy(true);
    try {
      // The toggle flips the preset-level opt-in: enabled = auto-applied on
      // matching sites. Rule-level flags stay untouched.
      const enabled = preset.enabled === true;
      const next: SitePreset = {
        ...preset,
        enabled: !enabled,
        metadata: { ...preset.metadata, updatedAt: Date.now() },
      };
      await repository.save(next);
      setMessage({ ok: true, text: `${!enabled ? "Enabled" : "Disabled"} ${preset.metadata.name}` });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const removePreset = async (preset: SitePreset) => {
    if (!window.confirm(`Delete preset "${preset.metadata.name}"?`)) return;
    setBusy(true);
    try {
      await repository.delete(preset.id);
      setMessage({ ok: true, text: `Deleted ${preset.metadata.name}` });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="opt">
      <header className="opt-head">
        <div className="opt-brand">
          <span className="opt-logo" aria-hidden="true">
            <ParotiaLogo />
          </span>
          <h1>Parotia — Site Presets</h1>
        </div>
        <p className="opt-tagline">{PAROTIA_SLOGAN}</p>
        <p>
          Presets re-apply a site's cleanup automatically on your next visit — but only when
          enabled. Nothing ever applies by force.
        </p>
      </header>

      {message && (
        <div className="opt-message" data-ok={message.ok}>
          {message.text}
        </div>
      )}

      {presets.length === 0 ? (
        <p className="opt-empty">
          No presets yet. Clean a site, then press <strong>Save</strong> in the toolbar to create one.
        </p>
      ) : (
        <ul className="opt-list">
          {presets.map((preset) => {
            const enabled = preset.enabled === true;
            const ruleCount = preset.cleanup?.rules.length ?? 0;
            return (
              <li key={preset.id} className="opt-card">
                <div className="opt-card-info">
                  <div className="opt-card-title">
                    {preset.metadata.name}
                    <span className="opt-chip" data-ok={enabled}>
                      {enabled ? "Active" : "Off"}
                    </span>
                  </div>
                  <div className="opt-card-meta">
                    {preset.site.hostname} · {ruleCount} rule{ruleCount === 1 ? "" : "s"} ·{" "}
                    {preset.metadata.source ?? "USER_CREATED"}
                  </div>
                </div>
                <div className="opt-card-actions">
                  <button type="button" className="opt-btn" disabled={busy} onClick={() => void toggleEnabled(preset)}>
                    {enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="opt-btn opt-btn-danger"
                    disabled={busy}
                    onClick={() => void removePreset(preset)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<OptionsApp />);
