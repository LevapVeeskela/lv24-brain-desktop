import type { Ref } from "react";
import type { ProviderDescriptor } from "@/entities/provider/model/types";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { InlineError } from "@/shared/ui/InlineError";
import { Loading } from "@/shared/ui/Loading";

interface ProviderStepProps {
  items: ProviderDescriptor[];
  query: string;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  engineReady: boolean;
  searchRef: Ref<HTMLInputElement>;
  onReload: () => void;
  onChoose: (provider: ProviderDescriptor) => void;
  onQueryChange: (query: string) => void;
}

export function ProviderStep({items, query, loading, loaded, error, engineReady, searchRef, onReload, onChoose, onQueryChange}: ProviderStepProps) {
  const {t} = useI18n();
  return (
  <Card>
    <div className="toolbar" role="search">
      <input
        ref={searchRef}
        type="search"
        className="input"
        value={query}
        aria-label={t("wizard.searchLabel")}
        placeholder={t("wizard.search")}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <Button
        variant="secondary"
        disabled={loading || !engineReady}
        onClick={onReload}
      >
        {loading ? t("common.loading") : t("actions.refresh")}
      </Button>
    </div>
    {error && engineReady ? (
      <InlineError>{error}</InlineError>
    ) : null}
    {loading && !loaded ? (
      <Loading label={t("wizard.searchLabel")} />
    ) : items.length > 0 ? (
      <div className="provider-grid">
        {items.map((item) => (
          <button
            key={item.provider}
            type="button"
            className="provider-card"
            onClick={() => onChoose(item)}
          >
            <strong>{item.displayName}</strong>
            <code>{item.provider}</code>
            <span className="badge-row">
              {item.capabilities.authModes.map((mode) => (
                <span className="badge" key={mode}>
                  {t(`auth.${mode}`)}
                </span>
              ))}
              {(
                [
                  ["backfill", item.capabilities.backfill],
                  ["incremental", item.capabilities.incremental],
                  ["deletes", item.capabilities.deletes],
                  ["actions", item.capabilities.actions],
                ] as const
              )
                .filter(([, enabled]) => enabled)
                .map(([name]) => (
                  <span className="badge" key={t(`wizard.capability.${name}`)}>
                    {t(`wizard.capability.${name}`)}
                  </span>
                ))}
            </span>
            <span className="muted small">
              {t("wizard.publish")}:{" "}
              {t(`publish.${item.defaultPublish}`)}
            </span>
            {item.backends.length > 1 ? (
              <span className="muted small">
                {item.backends.join(" / ")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    ) : loaded ? (
      <div className="empty-state">
        <strong>{t("wizard.noProviders")}</strong>
      </div>
    ) : engineReady ? (
      <Loading label={t("wizard.searchLabel")} />
    ) : null}
  </Card>
  );
}
