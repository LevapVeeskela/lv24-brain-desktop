import { apiClient, toApiError } from "@/shared/api/client";
import {
  asArray,
  asBoolean,
  asObject,
  asOptionalBoolean,
  asOptionalString,
  asOptionalTimestamp,
  asString,
} from "@/shared/api/validate";

export interface HookStatus {
  host: string;
  path: string;
  installed: boolean;
  detail: string;
  /** null when the host has no trust concept. */
  trusted: boolean | null;
  trust?: string;
  trustHash?: string;
  trustDrift: boolean;
  approve?: string;
  lastRun: string | null;
  lastEvent?: string;
  lastError?: string;
}

export interface HooksSource {
  list(): Promise<HookStatus[]>;
}

export const hooksApi: HooksSource = {
  async list() {
    const { data, error, response } = await apiClient.GET("/v1/hooks");
    if (error) {
      throw toApiError(response, error);
    }
    return parseHookStatuses(data);
  },
};

export function parseHookStatuses(value: unknown): HookStatus[] {
  return asArray(value, "hooks", parseHookStatus);
}

export function parseHookStatus(value: unknown, what: string): HookStatus {
  const hook = asObject(value, what);
  return {
    host: asString(hook.host, `${what}.host`),
    path: asString(hook.path, `${what}.path`),
    installed: asBoolean(hook.installed, `${what}.installed`),
    detail: asString(hook.detail, `${what}.detail`),
    trusted: asOptionalBoolean(hook.trusted, `${what}.trusted`) ?? null,
    trust: asOptionalString(hook.trust, `${what}.trust`),
    trustHash: asOptionalString(hook.trust_hash, `${what}.trust_hash`),
    trustDrift:
      asOptionalBoolean(hook.trust_drift, `${what}.trust_drift`) ?? false,
    approve: asOptionalString(hook.approve, `${what}.approve`),
    lastRun: asOptionalTimestamp(hook.last_run, `${what}.last_run`) ?? null,
    lastEvent: asOptionalString(hook.last_event, `${what}.last_event`),
    lastError: asOptionalString(hook.last_error, `${what}.last_error`),
  };
}
