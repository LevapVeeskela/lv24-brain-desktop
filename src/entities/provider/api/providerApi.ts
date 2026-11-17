import { tauriInvoke } from "@/shared/api/tauri";
import { parseProviders, type ProviderDescriptor } from "../model/types";

export const providerApi = {
  async list(): Promise<ProviderDescriptor[]> {
    return parseProviders(await tauriInvoke<unknown>("engine_providers"));
  },
};
