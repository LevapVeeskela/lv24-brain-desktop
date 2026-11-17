import { reaction } from "mobx";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { GitSyncStore } from "@/entities/git-sync/model/GitSyncStore";
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
    this.commandSearch = new SearchStore(memoryApi, { debounceMs: 160 });
  }

  start(): void {
    this.engine.start();
    this.connections.start();
    this.runs.start();
    void this.projects.load();
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
    this.commandSearch.dispose();
    this.search.dispose();
    this.settings.dispose();
    this.sync.dispose();
    this.runs.dispose();
    this.connections.dispose();
    this.engine.dispose();
  }
}
