import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { SettingsStore } from "@/entities/settings/model/SettingsStore";
import { SyncStore } from "@/entities/sync/model/SyncStore";

export class RootStore {
  readonly engine: EngineStore;
  readonly connections: ConnectionsStore;
  readonly sync: SyncStore;
  readonly settings: SettingsStore;

  constructor() {
    const connectionApi = new ConnectionApi();
    this.engine = new EngineStore();
    this.settings = new SettingsStore();
    this.connections = new ConnectionsStore(connectionApi, this.engine);
    this.sync = new SyncStore(connectionApi, this.engine, this.connections);
  }

  start(): void {
    this.engine.start();
    this.connections.start();
  }

  dispose(): void {
    this.connections.dispose();
    this.engine.dispose();
  }
}
