import { observer } from "mobx-react-lite";
import type { RecordEditor } from "@/entities/memory/model/RecordEditor";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/Button";
import { Notice } from "@/shared/ui/Notice";
import { useFeedback } from "@/shared/ui/Feedback";

export const RecordEditForm = observer(function RecordEditForm({
  editor,
  disabled,
  onCancel,
  onSaved,
}: {
  editor: RecordEditor;
  disabled: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { notify } = useFeedback();

  const save = async (): Promise<void> => {
    const saved = await editor.save();
    if (saved) {
      notify(t("memory.editSaved"), "success");
      onSaved();
    }
  };

  const saveAsDuplicate = async (): Promise<void> => {
    const saved = await editor.saveAsDuplicate();
    if (saved) {
      notify(t("memory.editSaved"), "success");
      onSaved();
    }
  };

  return (
    <form
      className="record-edit"
      aria-label={t("memory.editTitle")}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="card-header">
        <div>
          <h3>{t("memory.editTitle")}</h3>
          <p className="muted small">
            {editor.dirty ? t("memory.editDirty") : t("memory.editClean")}
          </p>
        </div>
      </div>

      {editor.conflict ? (
        <Notice
          variant="warning"
          action={
            <Button
              variant="link"
              disabled={editor.saving}
              onClick={() => void editor.reload()}
            >
              {t("memory.editReload")}
            </Button>
          }
        >
          <span>{t("memory.editConflict")}</span>
        </Notice>
      ) : null}

      {editor.duplicate ? (
        <Notice
          variant="warning"
          action={
            <Button
              variant="link"
              disabled={editor.saving}
              onClick={() => void saveAsDuplicate()}
            >
              {t("memory.editSaveDuplicate")}
            </Button>
          }
        >
          <span>{t("memory.editDuplicate")}</span>
        </Notice>
      ) : null}

      {editor.limitExceeded ? (
        <Notice variant="error">
          <span>{t("memory.editLimit")}</span>
        </Notice>
      ) : null}

      {editor.error &&
      !editor.conflict &&
      !editor.duplicate &&
      !editor.limitExceeded ? (
        <Notice variant="error">
          <span>{editor.error}</span>
        </Notice>
      ) : null}

      {editor.canEditTitle ? (
        <label className="field">
          <span>{t("memory.editFieldTitle")}</span>
          <input
            className="input"
            maxLength={200}
            value={editor.title}
            disabled={disabled || editor.saving}
            onChange={(event) => editor.setTitle(event.target.value)}
          />
        </label>
      ) : (
        <p className="muted small">{t("memory.editNoTitle")}</p>
      )}

      <label className="field">
        <span>{t("memory.editFieldBody")}</span>
        <textarea
          className="input record-edit-body"
          rows={12}
          value={editor.body}
          disabled={disabled || editor.saving}
          onChange={(event) => editor.setBody(event.target.value)}
        />
      </label>

      {editor.kind === "note" ? (
        <label className="field">
          <span>{t("memory.editFieldTags")}</span>
          <input
            className="input"
            maxLength={1024}
            value={editor.tags}
            disabled={disabled || editor.saving}
            placeholder={t("memory.editTagsHint")}
            onChange={(event) => editor.setTags(event.target.value)}
          />
          <span className="muted small">{t("memory.editTagsHint")}</span>
        </label>
      ) : null}

      <div className="form-actions">
        <Button
          variant="primary"
          type="submit"
          loading={editor.saving}
          disabled={!editor.canSave || disabled}
        >
          {t("memory.editSave")}
        </Button>
        <Button
          variant="ghost"
          type="button"
          disabled={editor.saving}
          onClick={onCancel}
        >
          {t("memory.editCancel")}
        </Button>
      </div>
    </form>
  );
});
