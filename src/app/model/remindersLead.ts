/**
 * Bridges the desktop reminder settings into the Ideas store.
 *
 * The getter is read at write time, so an early bind (before the first
 * `RemindersStore.load()` settles) is safe: it yields `null` until the settings
 * arrive and then follows every later change. The returned disposer clears the
 * hook on teardown.
 */
export interface DefaultLeadConsumer {
  setDefaultLeadMinutes(
    source: (() => number | null | undefined) | null,
  ): void;
}

export interface DefaultLeadSettings {
  readonly defaultLeadMinutes: number;
}

export interface DefaultLeadSource {
  readonly settings: DefaultLeadSettings | null;
}

export function bindRemindersDefaultLead(
  ideas: DefaultLeadConsumer,
  reminders: DefaultLeadSource,
): () => void {
  ideas.setDefaultLeadMinutes(
    () => reminders.settings?.defaultLeadMinutes ?? null,
  );
  return () => ideas.setDefaultLeadMinutes(null);
}
