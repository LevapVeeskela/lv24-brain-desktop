import { reaction } from "mobx";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { GitSyncStore } from "@/entities/git-sync/model/GitSyncStore";
import { ideasApi } from "@/entities/ideas/api/ideasApi";
import { memoryApi } from "@/entities/memory/api/memoryApi";
import { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { QuarantineStore } from "@/entities/memory/model/QuarantineStore";
import { ReviewStore } from "@/entities/memory/model/ReviewStore";
import { SearchStore } from "@/entities/memory/model/SearchStore";
import { projectApi } from "@/entities/project/api/projectApi";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { providerApi } from "@/entities/provider/api/providerApi";
import { ProvidersStore } from "@/entities/provider/model/ProvidersStore";
import { RunsStore } from "@/entities/run/model/RunsStore";
import { SettingsStore } from "@/entities/settings/model/SettingsStore";
import { SyncStore } from "@/entities/sync/model/SyncStore";
import {
  createLocalApiIdeaExportSource,
  ideaExportScope,
} from "@/features/ideas-export/api/localApiIdeaExport";
import type { IdeaExportSource } from "@/features/ideas-export/model/types";
import { IdeasStore } from "@/pages/ideas/model/IdeasStore";

export class RootStore {
  readonly engine: EngineStore;
  readonly connections: ConnectionsStore;
  readonly sync: SyncStore;
  readonly gitSync: GitSyncStore;
  readonly settings: SettingsStore;
  readonly runs: RunsStore;
  readonly projects: ProjectsStore;
  readonly providers: ProvidersStore;
  readonly memory: MemoryStore;
  readonly search: SearchStore;
  readonly review: ReviewStore;
  readonly quarantine: QuarantineStore;
  /** Real local API source; tests and stories inject the fake explicitly. */
  readonly ideas: IdeasStore;
  /** Real `.ics` export source for the WS9 calendar export surface. */
  readonly ideasExport: IdeaExportSource;
  /** A second search instance keeps the palette from replacing page results. */
  readonly commandSearch: SearchStore;

  private stopSelection: (() => void) | null = null;

  constructor() {
    const connectionApi = new ConnectionApi();
    this.engine = new EngineStore();
    this.settings = new SettingsStore();
    this.connections = new ConnectionsStore(connectionApi, this.engine);
    this.sync = new SyncStore(connectionApi, this.engine, this.connections);
    this.gitSync = new GitSyncStore();
    this.runs = new RunsStore(connectionApi);
    this.projects = new ProjectsStore(projectApi);
    this.providers = new ProvidersStore(providerApi);
    this.memory = new MemoryStore(memoryApi);
    this.search = new SearchStore(memoryApi);
    this.review = new ReviewStore(memoryApi);
    this.quarantine = new QuarantineStore(memoryApi);
    // WS8 integration point: the reminders settings provider calls
    // `this.ideas.setDefaultLeadMinutes(() =>
    // reminders.settings?.defaultLeadMinutes ?? null)` once its settings load;
    // the ideas store writes the concrete value on create/edit.
    this.ideas = new IdeasStore(ideasApi);
    this.ideasExport = createLocalApiIdeaExportSource(() =>
      ideaExportScope({
        scope: this.ideas.scope,
        projectId: this.ideas.projectId,
      }),
    );
    this.commandSearch = new SearchStore(memoryApi, { debounceMs: 160 });
  }

  start(): void {
    this.engine.start();
    this.connections.start();
    this.runs.start();
    void this.projects.load();
    void this.ideas.load();
    this.ideas.startClock();
    this.stopSelection = reaction(
      () => ({
        projectId: this.projects.selectedId,
        running: this.engine.isRunning,
      }),
      ({ projectId, running }) => {
        if (!projectId || !running) {
          return;
        }
        void this.review.load(projectId);
        void this.projects.loadState(projectId);
      },
      { fireImmediately: true },
    );
  }

  dispose(): void {
    this.stopSelection?.();
    this.stopSelection = null;
    this.ideas.dispose();
    this.commandSearch.dispose();
    this.search.dispose();
    this.settings.dispose();
    this.sync.dispose();
    this.runs.dispose();
    this.connections.dispose();
    this.engine.dispose();
  }
}
