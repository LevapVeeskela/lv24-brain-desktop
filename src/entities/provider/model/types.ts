export type AuthMode = "token" | "oauth-device" | "oauth-pkce" | "basic" | "none";
export type ProviderPublishPolicy = "local-only" | "shared";

export interface ProviderConfigField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  help?: string;
}

export interface ProviderCapabilities {
  backfill: boolean;
  incremental: boolean;
  deletes: boolean;
  authModes: AuthMode[];
  actions: boolean;
}

export interface ProviderDescriptor {
  provider: string;
  displayName: string;
  capabilities: ProviderCapabilities;
  defaultPublish: ProviderPublishPolicy;
  configFields: ProviderConfigField[];
  backends: string[];
  streams: string[];
}

export function parseProviders(value: unknown): ProviderDescriptor[] {
  if (!Array.isArray(value)) {
    throw new Error("engine returned a non-array provider list");
  }
  return value.map(parseProvider);
}

function parseProvider(value: unknown): ProviderDescriptor {
  if (!isRecord(value)) {
    throw new Error("engine returned an invalid provider descriptor");
  }
  const provider = requiredString(value.provider, "provider");
  const displayName = requiredString(value.displayName, "displayName");
  if (!isRecord(value.capabilities)) {
    throw new Error(`provider ${provider} has no capabilities`);
  }
  const capabilities = value.capabilities;
  const authModes = Array.isArray(capabilities.authModes)
    ? capabilities.authModes.filter(isAuthMode)
    : [];
  if (authModes.length === 0) {
    throw new Error(`provider ${provider} has no auth modes`);
  }
  const fields = Array.isArray(value.configFields)
    ? value.configFields.map((field) => parseField(provider, field))
    : [];
  return {
    provider,
    displayName,
    capabilities: {
      backfill: Boolean(capabilities.backfill),
      incremental: Boolean(capabilities.incremental),
      deletes: Boolean(capabilities.deletes),
      authModes,
      actions: Boolean(capabilities.actions),
    },
    defaultPublish: value.defaultPublish === "shared" ? "shared" : "local-only",
    configFields: fields,
    backends: stringArray(value.backends),
    streams: stringArray(value.streams),
  };
}

function parseField(provider: string, value: unknown): ProviderConfigField {
  if (!isRecord(value)) {
    throw new Error(`provider ${provider} has an invalid config field`);
  }
  return {
    key: requiredString(value.key, "field key"),
    label: requiredString(value.label, "field label"),
    required: Boolean(value.required),
    secret: Boolean(value.secret),
    help: optionalString(value.help),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`provider descriptor is missing ${label}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isAuthMode(value: unknown): value is AuthMode {
  return (
    value === "token" ||
    value === "oauth-device" ||
    value === "oauth-pkce" ||
    value === "basic" ||
    value === "none"
  );
}
