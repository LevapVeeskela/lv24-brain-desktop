import { describe, expect, it } from "vitest";
import {
  LOCALE_STORAGE_KEY,
  detectLocale,
  normalizeLocale,
  persistLocale,
  translate,
} from "./index";
import { en } from "./messages/en";
import { ru } from "./messages/ru";
import { zh } from "./messages/zh";

describe("i18n", () => {
  it("keeps every locale in sync with the English keys", () => {
    const expected = Object.keys(en).sort();
    expect(Object.keys(ru).sort()).toEqual(expected);
    expect(Object.keys(zh).sort()).toEqual(expected);
  });

  it("keeps placeholders in sync across locales", () => {
    const placeholders = (template: string): string[] =>
      [...template.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .sort();

    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const expected = placeholders(en[key]);
      expect(placeholders(ru[key]), `ru ${key}`).toEqual(expected);
      expect(placeholders(zh[key]), `zh ${key}`).toEqual(expected);
    }
  });

  it("interpolates parameters", () => {
    expect(
      translate("en", "hero.engineOnPort", { version: "0.12.0", port: 49152 }),
    ).toBe("Engine 0.12.0 on port 49152");
    expect(translate("ru", "notices.syncQueued", { queued: 2, total: 5 })).toBe(
      "В очередь поставлено 2 из 5 подключений.",
    );
    expect(translate("zh", "connections.count", { count: 3 })).toBe(
      "已配置 3 个",
    );
  });

  it("normalizes language tags and prefers the stored locale", () => {
    expect(normalizeLocale("ru-RU")).toBe("ru");
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh");
    expect(normalizeLocale("en_US")).toBe("en");
    expect(normalizeLocale("de-DE")).toBeNull();

    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    persistLocale("zh", adapter);
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe("zh");
    expect(detectLocale(adapter, "ru-RU")).toBe("zh");
    expect(detectLocale(null, "ru-RU")).toBe("ru");
    expect(detectLocale(null, "fr-FR")).toBe("en");
  });
});
