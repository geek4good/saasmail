import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ListOrdered, Pencil, Trash2 } from "lucide-react";
import { fetchSequences, deleteSequence, type Sequence } from "@/lib/api";
import PageHeader, { PageContainer } from "@/components/PageHeader";

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSequences()
      .then(setSequences)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this sequence?")) return;
    try {
      await deleteSequence(id);
      setSequences((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert("Cannot delete — sequence may have active enrollments.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Sequences"
        subtitle="Multi-step drip campaigns. Enroll a contact and saasmail sends templated emails on a schedule."
        action={
          <button
            onClick={() => navigate("/sequences/new")}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-text-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-text-primary/90"
          >
            <Plus size={14} />
            New sequence
          </button>
        }
      />

      <div className="max-w-4xl">
        {loading ? (
          <p className="text-sm font-light text-text-tertiary">Loading…</p>
        ) : sequences.length === 0 ? (
          <div className="rounded-[8px] bg-card p-10 text-center ring-1 ring-border">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet/10">
              <ListOrdered size={20} style={{ color: "#7c5cfc" }} />
            </span>
            <p className="mb-1 text-sm font-medium text-text-primary">
              No sequences yet
            </p>
            <p className="mb-4 text-xs font-light text-text-tertiary">
              Build your first multi-step campaign to nurture contacts
              automatically.
            </p>
            <button
              onClick={() => navigate("/sequences/new")}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-text-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-text-primary/90"
            >
              <Plus size={14} />
              New sequence
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[8px] bg-card ring-1 ring-border">
            <ul className="divide-y divide-border/60">
              {sequences.map((seq) => (
                <li
                  key={seq.id}
                  data-testid="sequence-row"
                  data-sequence-id={seq.id}
                  className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-text-primary/[0.02]"
                >
                  <Link
                    to={`/sequences/${seq.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-bg-muted">
                      <ListOrdered size={14} className="text-text-tertiary" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {seq.name}
                      </p>
                      <p className="truncate text-xs font-light text-text-tertiary">
                        {seq.steps.length} step
                        {seq.steps.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => navigate(`/sequences/${seq.id}/edit`)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(seq.id)}
                      aria-label="Delete"
                      className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
