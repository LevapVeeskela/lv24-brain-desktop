import { useState } from "react";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/Button";
import { downloadTextFile } from "../lib/download";
import { exportIdeasIcs } from "../model/export";
import type { IdeaExportSource } from "../model/types";

export interface ExportIcsButtonProps {
  source: IdeaExportSource;
  now: () => Date;
  save?: (fileName: string, text: string) => void;
}

export function ExportIcsButton({
  source,
  now,
  save = downloadTextFile,
}: ExportIcsButtonProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await exportIdeasIcs({ source, now, save });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="idea-export">
      <Button variant="secondary" loading={busy} onClick={() => void run()}>
        {t("ideas.export.ics")}
      </Button>
      {error ? (
        <span className="small idea-export-error" role="alert">
          {t("ideas.export.failed")} {error}
        </span>
      ) : null}
    </div>
  );
}
