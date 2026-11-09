import { invoke } from "@tauri-apps/api/core";
import { parseProviders, type ProviderDescriptor } from "../model/types";

export const providerApi = {
  async list(): Promise<ProviderDescriptor[]> {
    return parseProviders(await invoke<unknown>("engine_providers"));
  },
};
