import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Link, useSearchParams } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SearchStore } from "@/entities/memory/model/SearchStore";
import {
  SEARCH_KINDS,
  SEARCH_MIN_LENGTH,
  type SearchKind,
} from "@/entities/memory/model/types";
import { RecordKindBadge } from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";

const searchKindKeys: Record<SearchKind, MessageKey> = {
  note: "record.kind.note",
  decision: "record.kind.decision",
  attempt: "record.kind.attempt",
  handoff: "record.kind.handoff",
  state: "record.kind.state",
};

export const SearchPage = observer(function SearchPage({
  search,
  projects,
  engine,
}: {
  search: SearchStore;
  projects: ProjectsStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const appliedParam = useRef<string | null>(null);
  const projectId = projects.selectedId;
  const queryParam = params.get("q") ?? "";

  useEffect(() => {
    void projects.load();
  }, [projects]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    search.setProject(projectId, { search: engine.isRunning });
    if (engine.isRunning && search.query.trim().length >= SEARCH_MIN_LENGTH) {
      search.submit();
    }
  }, [engine.isRunning, projectId, search]);

  useEffect(() => {
    if (
      queryParam &&
      queryParam !== appliedParam.current &&
      engine.isRunning
    ) {
      appliedParam.current = queryParam;
      search.setQuery(queryParam);
      search.submit();
    }
  }, [engine.isRunning, queryParam, search]);

  const toggleKind = (kind: SearchKind): void => {
    const next = search.filters.kinds.includes(kind)
      ? search.filters.kinds.filter((item) => item !== kind)
      : [...search.filters.kinds, kind];
    search.setFilters({ kinds: next });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("search.title")}</h2>
          <p className="muted">{t("search.subtitle")}</p>
        </div>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      <Card>
        <form
          className="search-form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            search.submit();
          }}
        >
          <div className="inline-field">
            <input
              className="input"
              type="search"
              maxLength={256}
              disabled={!engine.isRunning}
              aria-label={t("search.placeholder")}
              placeholder={t("search.placeholder")}
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
            />
            <Button variant="primary" type="submit" disabled={!projectId || !engine.isRunning}>
              {t("search.submit")}
            </Button>
          </div>

          <fieldset className="search-filters" disabled={!engine.isRunning}>
            <legend>{t("search.filters")}</legend>
            <div className="checkbox-grid">
              {SEARCH_KINDS.map((kind) => (
                <label className="checkbox" key={kind}>
                  <input
                    type="checkbox"
                    checked={search.filters.kinds.includes(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  {t(searchKindKeys[kind])}
                </label>
              ))}
            </div>
            <div className="filter-grid">
              <label className="field">
                <span>{t("search.mode")}</span>
                <Select
                  value={search.filters.mode}
                  onChange={(event) =>
                    search.setFilters({
                      mode: event.target.value as "all" | "any" | "",
                    })
                  }
                >
                  <option value="">{t("search.modeDefault")}</option>
                  <option value="all">{t("search.modeAll")}</option>
                  <option value="any">{t("search.modeAny")}</option>
                </Select>
              </label>
              <label className="field">
                <span>{t("search.minScore")}</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={search.filters.minScore ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    const parsed = Number.parseFloat(value);
                    search.setFilters({
                      minScore:
                        value === "" || Number.isNaN(parsed)
                          ? null
                          : Math.min(1, Math.max(0, parsed)),
                    });
                  }}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={search.filters.explain}
                  onChange={(event) =>
                    search.setFilters({ explain: event.target.checked })
                  }
                />
                {t("search.explain")}
              </label>
            </div>
          </fieldset>
        </form>
      </Card>

      {search.notice || search.relaxed ? (
        <Notice variant="info">
          <span>{search.notice ?? t("search.relaxed")}</span>
        </Notice>
      ) : null}

      {search.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={search.retry}>
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{search.error}</span>
        </Notice>
      ) : null}

      {!projectId ? (
        <EmptyState title={t("memory.noProject")} />
      ) : search.tooShort && !search.searched ? (
        <EmptyState
          title={t("search.tooShort", { count: SEARCH_MIN_LENGTH })}
          hint={t("search.subtitle")}
        />
      ) : search.loading && search.hits.length === 0 ? (
        <Loading label={t("search.loading")} />
      ) : search.isEmpty ? (
        <EmptyState
          title={t("search.empty", { query: search.appliedQuery })}
          hint={t("search.emptyHint")}
          action={
            <Button variant="link" onClick={search.clearFilters}>
              {t("memory.clearFilters")}
            </Button>
          }
        />
      ) : search.hits.length > 0 ? (
        <Card>
          <div className="card-header">
            <div>
              <h3>{t("search.resultsCount", { count: search.hits.length })}</h3>
              <p className="muted small">{search.appliedQuery}</p>
            </div>
          </div>
          <ul className="search-results">
            {search.hits.map((hit) => (
              <li key={`${hit.projectId}-${hit.id}`} className="search-hit">
                <div className="search-hit-main">
                  <div className="badge-row">
                    {hit.kind === "state" ? (
                      <Badge tone="info">{t("record.kind.state")}</Badge>
                    ) : (
                      <RecordKindBadge kind={hit.kind as Exclude<SearchKind, "state">} />
                    )}
                    <Badge>{t("search.score", { score: hit.score.toFixed(2) })}</Badge>
                    {hit.supersededBy ? <Badge tone="warning">{t("record.superseded")}</Badge> : null}
                  </div>
                  <h4 className="search-hit-title">
                    {hit.kind === "state" ? (
                      <span>{hit.title}</span>
                    ) : (
                      <Link
                        className="table-link"
                        to={`/memory/${hit.kind}/${encodeURIComponent(hit.id)}`}
                      >
                        {hit.title}
                      </Link>
                    )}
                  </h4>
                  <p className="search-preview">{hit.preview}</p>
                  {hit.matchReasons.length > 0 ? (
                    <p className="muted small">
                      {t("search.matchReasons", {
                        reasons: hit.matchReasons.join(", "),
                      })}
                    </p>
                  ) : null}
                  {hit.explain ? (
                    <details className="search-explain">
                      <summary>{t("search.explainTitle")}</summary>
                      <dl className="explain-grid">
                        <dt>bm25</dt>
                        <dd>{hit.explain.bm25.toFixed(3)}</dd>
                        <dt>recency</dt>
                        <dd>{hit.explain.recency.toFixed(3)}</dd>
                        <dt>importance</dt>
                        <dd>{hit.explain.importance.toFixed(3)}</dd>
                        <dt>pin</dt>
                        <dd>{hit.explain.pin.toFixed(3)}</dd>
                        <dt>link</dt>
                        <dd>{hit.explain.link.toFixed(3)}</dd>
                      </dl>
                    </details>
                  ) : null}
                </div>
                <span className="muted small">
                  {hit.scope ?? hit.subtype ?? hit.kind}
                </span>
              </li>
            ))}
          </ul>
          {search.hasMore ? (
            <div className="form-actions">
              <Button
                loading={search.loadingMore}
                onClick={() => void search.loadMore()}
              >
                {t("common.loadMore")}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
});
