import { useI18n, type MessageKey } from "@/shared/i18n";
import { Badge } from "@/shared/ui/Badge";
import {
  DECISION_STATUSES,
  confidenceBand,
  type DecisionStatus,
  type Proposal,
  type ProvenanceOrigin,
  type RecordKind,
  type RecordScope,
  type ReviewState,
  type TrustLevel,
} from "../model/types";

const kindTone: Record<RecordKind, "info" | "success" | "warning" | "neutral"> = {
  note: "info",
  decision: "success",
  attempt: "warning",
  handoff: "neutral",
};

const kindKey: Record<RecordKind, MessageKey> = {
  note: "record.kind.note",
  decision: "record.kind.decision",
  attempt: "record.kind.attempt",
  handoff: "record.kind.handoff",
};

export function RecordKindBadge({ kind }: { kind: RecordKind }) {
  const { t } = useI18n();
  return <Badge tone={kindTone[kind]}>{t(kindKey[kind])}</Badge>;
}

export function RecordStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (DECISION_STATUSES.includes(status as DecisionStatus)) {
    return (
      <Badge tone={status === "accepted" ? "success" : status === "rejected" ? "danger" : "neutral"}>
        {t(`record.status.${status}` as MessageKey)}
      </Badge>
    );
  }
  return <Badge>{status}</Badge>;
}

const trustKey: Record<TrustLevel, MessageKey> = {
  verified: "record.trust.verified",
  stated: "record.trust.stated",
  inferred: "record.trust.inferred",
};

export function TrustBadge({ trust }: { trust: TrustLevel }) {
  const { t } = useI18n();
  return <Badge>{t(trustKey[trust])}</Badge>;
}

const originKey: Record<ProvenanceOrigin, MessageKey> = {
  human: "record.origin.human",
  agent: "record.origin.agent",
  connector: "record.origin.connector",
  import: "record.origin.import",
};

export function ProvenanceBadges({
  origin,
  quarantined,
  needsReview,
  reviewed,
  tone = "neutral",
}: {
  origin: ProvenanceOrigin;
  quarantined: boolean;
  needsReview: boolean;
  reviewed: boolean;
  tone?: "neutral" | "warning" | "danger";
}) {
  const { t } = useI18n();
  return (
    <span className="badge-row">
      <Badge tone={tone}>{t(originKey[origin])}</Badge>
      {quarantined ? <Badge tone="danger">{t("record.quarantined")}</Badge> : null}
      {needsReview ? <Badge tone="warning">{t("record.needsReview")}</Badge> : null}
      {reviewed ? <Badge tone="success">{t("record.reviewed")}</Badge> : null}
    </span>
  );
}

export function ReviewDueBadge({ review }: { review: ReviewState }) {
  const { t } = useI18n();
  return review.due ? <Badge tone="warning">{t("record.reviewDue")}</Badge> : null;
}

const scopeKey: Record<RecordScope, MessageKey> = {
  project: "record.scope.project",
  personal: "record.scope.personal",
  global: "record.scope.global",
};

export function ScopeBadge({ scope }: { scope: RecordScope }) {
  const { t } = useI18n();
  return <Badge>{t(scopeKey[scope])}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { t } = useI18n();
  const band = confidenceBand(confidence);
  return (
    <span title={t("inbox.confidenceValue", { value: confidence.toFixed(2) })}>
      <Badge
        tone={band === "high" ? "success" : band === "medium" ? "warning" : "danger"}
      >
        {t(
          band === "high"
            ? "inbox.confidenceHigh"
            : band === "medium"
              ? "inbox.confidenceMedium"
              : "inbox.confidenceLow",
        )}
      </Badge>
    </span>
  );
}

export function SourceHealthBadges({ proposal }: { proposal: Proposal }) {
  const { t } = useI18n();
  return (
    <span className="badge-row">
      {proposal.sourceStale ? <Badge tone="warning">{t("inbox.sourceStale")}</Badge> : null}
      {proposal.sourceOrphan ? <Badge tone="danger">{t("inbox.sourceOrphan")}</Badge> : null}
      {proposal.localOnly ? <Badge tone="warning">{t("inbox.localOnly")}</Badge> : null}
    </span>
  );
}
