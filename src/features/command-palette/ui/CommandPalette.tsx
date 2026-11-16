import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SearchStore } from "@/entities/memory/model/SearchStore";
import { SEARCH_MIN_LENGTH, type SearchHit } from "@/entities/memory/model/types";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/Badge";
import {
  filterActions,
  navigationActions,
  type PaletteAction,
} from "../model/navigation";

type PaletteItem =
  | { type: "hit"; hit: SearchHit }
  | { type: "action"; action: PaletteAction };

export const CommandPalette = observer(function CommandPalette({
  search,
  projects,
  engine,
}: {
  search: SearchStore;
  projects: ProjectsStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const query = search.query;
  const actions = filterActions(
    navigationActions(t, projects.selectedId),
    query,
  );
  const hits = search.hits.slice(0, 6);
  const items: PaletteItem[] = [
    ...hits.map((hit): PaletteItem => ({ type: "hit", hit })),
    ...actions.map((action): PaletteItem => ({ type: "action", action })),
  ];
  const active = items[Math.min(activeIndex, Math.max(0, items.length - 1))];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreFocus.current = document.activeElement as HTMLElement | null;
    if (projects.selectedId) {
      search.setProject(projects.selectedId);
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      search.setQuery("");
      search.resetResults();
      restoreFocus.current?.focus?.();
    };
  }, [open, projects, search]);

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, items.length - 1)),
    );
  }, [items.length]);

  const close = (): void => setOpen(false);

  const choose = (item: PaletteItem | undefined): void => {
    if (!item) {
      return;
    }
    close();
    if (item.type === "hit") {
      if (item.hit.kind === "state" && projects.selectedId) {
        navigate(`/projects/${encodeURIComponent(projects.selectedId)}`);
      } else {
        navigate(`/memory/${item.hit.kind}/${encodeURIComponent(item.hit.id)}`);
      }
      return;
    }
    navigate(item.action.to);
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.placeholder")}
      >
        <div className="palette-input-row">
          <input
            ref={inputRef}
            className="input"
            type="text"
            maxLength={256}
            role="combobox"
            aria-expanded={true}
            aria-controls="palette-results"
            aria-autocomplete="list"
            aria-label={t("palette.placeholder")}
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(event) => {
              if (engine.isRunning) {
                search.setQuery(event.target.value);
              }
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  Math.max(0, Math.min(items.length - 1, current + 1)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(active);
              }
            }}
          />
          <kbd className="palette-kbd">{t("palette.shortcut")}</kbd>
        </div>

        {!engine.isRunning ? (
          <p className="palette-status" role="status">
            {t("errors.engineUnavailable")}
          </p>
        ) : search.error ? (
          <p className="palette-status" role="alert">
            {search.error}
          </p>
        ) : search.loading && query.trim().length >= SEARCH_MIN_LENGTH ? (
          <p className="palette-status" role="status">
            {t("search.loading")}
          </p>
        ) : null}

        <div id="palette-results" className="palette-results">
          {hits.length > 0 ? (
            <section aria-label={t("palette.records")}>
              <h2 className="palette-group">{t("palette.records")}</h2>
              <ul className="palette-list">
                {hits.map((hit, index) => (
                  <li key={`${hit.projectId}-${hit.id}`}>
                    <button
                      type="button"
                      className={`palette-item ${activeIndex === index ? "is-active" : ""}`}
                      onClick={() => choose({ type: "hit", hit })}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <Badge>{hit.kind}</Badge>
                      <span className="palette-item-title">{hit.title}</span>
                      <span className="muted small">{hit.score.toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {actions.length > 0 ? (
            <section aria-label={t("palette.navigation")}>
              <h2 className="palette-group">{t("palette.navigation")}</h2>
              <ul className="palette-list">
                {actions.map((action, index) => {
                  const itemIndex = hits.length + index;
                  return (
                    <li key={action.id}>
                      <button
                        type="button"
                        className={`palette-item ${activeIndex === itemIndex ? "is-active" : ""}`}
                        onClick={() => choose({ type: "action", action })}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                      >
                        <span className="palette-item-title">{action.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {query.trim().length >= SEARCH_MIN_LENGTH ? (
            <button
              type="button"
              className="palette-item palette-all"
              onClick={() => {
                close();
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              {t("palette.searchAll", { query: query.trim() })}
            </button>
          ) : null}

          {items.length === 0 && query.trim().length >= SEARCH_MIN_LENGTH ? (
            <p className="palette-status">{t("palette.noResults")}</p>
          ) : null}
        </div>

        <p className="palette-hint muted small">{t("palette.hint")}</p>
      </div>
    </div>
  );
});
