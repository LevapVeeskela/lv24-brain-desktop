import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import { EngineStore } from "@/entities/engine/model/EngineStore";
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
  readonly settings: SettingsStore;
  readonly runs: RunsStore;
  readonly projects: ProjectsStore;
  readonly providers: ProvidersStore;

  constructor() {
    const connectionApi = new ConnectionApi();
    this.engine = new EngineStore();
    this.settings = new SettingsStore();
    this.connections = new ConnectionsStore(connectionApi, this.engine);
    this.sync = new SyncStore(connectionApi, this.engine, this.connections);
    this.runs = new RunsStore(connectionApi);
    this.projects = new ProjectsStore(projectApi);
    this.providers = new ProvidersStore(providerApi);
  }

  start(): void {
    this.engine.start();
    this.connections.start();
    this.runs.start();
  }

  dispose(): void {
    this.runs.dispose();
    this.connections.dispose();
    this.engine.dispose();
  }
}
