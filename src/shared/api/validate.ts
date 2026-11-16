/**
 * Small runtime validators for local API responses. Adapters build fresh
 * objects from these readers, so unknown fields never reach the UI.
 */
export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown, what: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return value as JsonObject;
}

export function asString(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new Error(`${what} must be a string`);
  }
  return value;
}

export function asOptionalString(value: unknown, what: string): string | undefined {
  return value === undefined || value === null ? undefined : asString(value, what);
}

export function asBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${what} must be a boolean`);
  }
  return value;
}

export function asOptionalBoolean(value: unknown, what: string): boolean | undefined {
  return value === undefined || value === null ? undefined : asBoolean(value, what);
}

export function asNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${what} must be a finite number`);
  }
  return value;
}

export function asOptionalNumber(value: unknown, what: string): number | undefined {
  return value === undefined || value === null ? undefined : asNumber(value, what);
}

export function asArray<T>(
  value: unknown,
  what: string,
  parseItem: (item: unknown, where: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} must be an array`);
  }
  return value.map((item, index) => parseItem(item, `${what}[${index}]`));
}

export function asEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  what: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${what} must be one of ${values.join(", ")}`);
  }
  return value as T;
}

export function asOptionalEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  what: string,
): T | undefined {
  return value === undefined || value === null ? undefined : asEnum(value, values, what);
}

/** RFC3339 strings are kept verbatim; only their parseability is checked. */
export function asTimestamp(value: unknown, what: string): string {
  const text = asString(value, what);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`${what} must be an RFC3339 timestamp`);
  }
  return text;
}

export function asOptionalTimestamp(value: unknown, what: string): string | undefined {
  return value === undefined || value === null ? undefined : asTimestamp(value, what);
}

export function asStringMap(value: unknown, what: string): Record<string, string> {
  const source = asObject(value, what);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(source)) {
    result[key] = asString(item, `${what}.${key}`);
  }
  return result;
}
