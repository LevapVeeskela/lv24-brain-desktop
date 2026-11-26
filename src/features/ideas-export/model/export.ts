import { icsFileName } from "../model/ics";
import type { IdeaExportSource } from "../model/types";

export interface IdeaExportRequest {
  source: IdeaExportSource;
  now: () => Date;
  /** Injected in tests; the default writes a Blob through an anchor. */
  save: (fileName: string, text: string) => void;
}

/**
 * Fetch the calendar text and hand it to the saver. Kept outside React so the
 * button behaviour is testable without a DOM.
 */
export async function exportIdeasIcs(
  request: IdeaExportRequest,
): Promise<string> {
  const text = await request.source.fetchIcs();
  request.save(icsFileName(request.now()), text);
  return text;
}
