/**
 * The calendar export is a one-way file download, never a live subscription.
 * WS7 replaces the fake source with `GET /v1/ideas/ical`; the button, the
 * download and the ICS builder stay the same.
 */
export interface IdeaExportSource {
  /** The `.ics` text for the current ideas scope. */
  fetchIcs(): Promise<string>;
}
