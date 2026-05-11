import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ListOrdered,
  Pencil,
  Users,
  XCircle,
} from "lucide-react";
import PageHeader, { PageContainer } from "@/components/PageHeader";
import { SectionHeader } from "@/components/PageForm";
import {
  fetchSequence,
  fetchSequenceEnrollments,
  cancelEnrollment,
  type Sequence,
  type EnrollmentWithDetails,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/** Round delay-hours into a friendlier string for the step timeline. */
function formatDelay(hours: number): string {
  if (hours <= 0) return "immediately";
  if (hours < 24) return `${hours}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return days === 1 ? "1 day" : `${days} days`;
}

function totalDelayLabel(steps: { delayHours: number }[]): string {
  const total = steps.reduce((acc, s) => acc + (s.delayHours || 0), 0);
  return formatDelay(total);
}

function relativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

type Status = "active" | "completed" | "cancelled";

const STATUS_META: Record<
  Status,
  {
    label: string;
    chipClass: string;
    color: string;
    Icon: React.ElementType;
  }
> = {
  active: {
    label: "Active",
    chipClass: "bg-emerald-50 ring-emerald-200/60 dark:bg-emerald-500/10",
    color: "#047857",
    Icon: Clock,
  },
  completed: {
    label: "Completed",
    chipClass: "bg-violet/10 ring-violet/20",
    color: "#7c5cfc",
    Icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    chipClass: "bg-bg-muted ring-border",
    color: "#6b7280",
    Icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const key: Status =
    status === "active" || status === "completed" || status === "cancelled"
      ? status
      : "cancelled";
  const meta = STATUS_META[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        meta.chipClass,
      )}
      style={{ color: meta.color }}
    >
      <meta.Icon size={10} />
      {meta.label}
    </span>
  );
}

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchSequence(id), fetchSequenceEnrollments(id)])
      .then(([seq, enrs]) => {
        setSequence(seq);
        setEnrollments(enrs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleCancel(enrollmentId: string) {
    if (!confirm("Cancel this enrollment? Pending steps won't be sent.")) {
      return;
    }
    await cancelEnrollment(enrollmentId);
    setEnrollments((prev) =>
      prev.map((e) =>
        e.id === enrollmentId ? { ...e, status: "cancelled" } : e,
      ),
    );
  }

  // Bucket enrollments by status so each section shows just the relevant
  // rows. Active first because that's where most operator attention goes.
  const grouped = useMemo(() => {
    const buckets: Record<string, EnrollmentWithDetails[]> = {
      active: [],
      completed: [],
      cancelled: [],
    };
    for (const e of enrollments) {
      const k = (buckets[e.status] ? e.status : "cancelled") as string;
      buckets[k].push(e);
    }
    return buckets;
  }, [enrollments]);

  if (loading || !sequence) {
    return (
      <PageContainer>
        <p className="pt-10 text-sm text-text-tertiary">Loading…</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Link
        to="/sequences"
        className="-mt-1 mb-1 inline-flex items-center gap-1 text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={12} />
        Sequences
      </Link>

      <PageHeader
        title={sequence.name}
        subtitle={
          <>
            {sequence.steps.length} step
            {sequence.steps.length === 1 ? "" : "s"} · spans{" "}
            {totalDelayLabel(sequence.steps)} · {enrollments.length} enrollment
            {enrollments.length === 1 ? "" : "s"}
          </>
        }
        action={
          <button
            type="button"
            onClick={() => navigate(`/sequences/${sequence.id}/edit`)}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
          >
            <Pencil size={12} />
            Edit sequence
          </button>
        }
      />

      <div className="space-y-5">
        {/* --- Steps timeline --- */}
        <section className="overflow-hidden rounded-[8px] bg-card ring-1 ring-border">
          <div className="border-b border-border px-5 py-4">
            <SectionHeader
              icon={ListOrdered}
              title="Steps"
              subtitle="The journey every enrollment follows. Delays are measured from the previous step."
            />
          </div>
          <ol className="relative space-y-0">
            {sequence.steps.map((step, idx) => {
              const isLast = idx === sequence.steps.length - 1;
              return (
                <li
                  key={step.order}
                  className="relative flex items-start gap-3 px-5 py-4"
                >
                  {/* Connector line — visually links steps. */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute left-[34px] top-12 h-[calc(100%-2.5rem)] w-px bg-border"
                    />
                  )}
                  <span className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet/10 text-[11px] font-semibold tabular-nums">
                    <span style={{ color: "#7c5cfc" }}>{idx + 1}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      <code className="font-mono">{step.templateSlug}</code>
                    </p>
                    <p className="mt-0.5 text-xs font-light text-text-tertiary">
                      {idx === 0
                        ? "Sends right when someone is enrolled."
                        : `Sends ${formatDelay(step.delayHours)} after step ${idx}.`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* --- Enrollments --- */}
        <section className="overflow-hidden rounded-[8px] bg-card ring-1 ring-border">
          <div className="border-b border-border px-5 py-4">
            <SectionHeader
              icon={Users}
              title={`Enrollments (${enrollments.length})`}
              subtitle="Every contact who has been enrolled into this sequence."
            />
          </div>

          {enrollments.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-violet/10">
                <Users size={16} style={{ color: "#7c5cfc" }} />
              </span>
              <p className="text-sm font-medium text-text-primary">
                No enrollments yet
              </p>
              <p className="mt-1 text-xs font-light text-text-tertiary">
                Open a contact's profile and pick this sequence to enroll them,
                or call the API.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {(["active", "completed", "cancelled"] as Status[]).map(
                (statusKey) => {
                  const rows = grouped[statusKey] ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <EnrollmentGroup
                      key={statusKey}
                      status={statusKey}
                      rows={rows}
                      onCancel={handleCancel}
                    />
                  );
                },
              )}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function EnrollmentGroup({
  status,
  rows,
  onCancel,
}: {
  status: Status;
  rows: EnrollmentWithDetails[];
  onCancel: (id: string) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <div>
      <div className="flex items-center gap-2 bg-bg-subtle/40 px-5 py-2">
        <meta.Icon size={11} style={{ color: meta.color }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          {meta.label} · {rows.length}
        </h3>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((enr) => {
          const progress =
            enr.totalSteps > 0 ? enr.sentSteps / enr.totalSteps : 0;
          const initial = (enr.personName ?? enr.personEmail)
            .trim()
            .charAt(0)
            .toUpperCase();
          return (
            <li
              key={enr.id}
              data-testid="enrollment-row"
              data-enrollment-id={enr.id}
              className="flex items-center gap-3 px-5 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-muted text-xs font-semibold text-text-secondary">
                {initial || "?"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {enr.personName ?? enr.personEmail}
                  </p>
                  <StatusBadge status={enr.status} />
                </div>
                <p className="truncate text-xs font-light text-text-tertiary">
                  {enr.personEmail} · enrolled {relativeTime(enr.enrolledAt)}
                </p>
              </div>

              <div className="hidden shrink-0 items-center gap-3 sm:flex">
                <div className="w-32">
                  <div className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="text-text-tertiary">
                      {enr.sentSteps}/{enr.totalSteps}
                    </span>
                    <span className="text-text-tertiary">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(progress * 100, 2)}%`,
                        backgroundColor: STATUS_META[status].color,
                      }}
                    />
                  </div>
                </div>
              </div>

              {enr.status === "active" && (
                <button
                  type="button"
                  onClick={() => onCancel(enr.id)}
                  aria-label="Cancel"
                  className="shrink-0 rounded-[6px] border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
