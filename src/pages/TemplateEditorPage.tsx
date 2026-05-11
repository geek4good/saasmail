import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Code2,
  Eye,
  Hash,
  Sparkles,
  Wand2,
} from "lucide-react";
import HtmlCodeEditor from "@/components/HtmlCodeEditor";
import PageHeader, { PageContainer } from "@/components/PageHeader";
import {
  CodeBlock,
  Field,
  FORM_INPUT_CLASS,
  PaneLabel,
  SectionHeader,
} from "@/components/PageForm";
import { fetchTemplate, createTemplate, updateTemplate } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Extract {{variableName}} tokens from any number of source strings. */
function extractVariables(...sources: string[]): string[] {
  const vars = new Set<string>();
  for (const src of sources) {
    const regex = /\{\{(\w+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(src)) !== null) {
      vars.add(m[1]);
    }
  }
  return Array.from(vars);
}

/** Lightweight HTML pretty-printer for the "Format" button — adds line
 *  breaks between adjacent tags and indents nested blocks. */
function formatHtml(input: string): string {
  return input
    .replace(/></g, ">\n<")
    .replace(/\n\s*/g, "\n")
    .split("\n")
    .reduce<{ lines: string[]; indent: number }>(
      (acc, line) => {
        const trimmed = line.trim();
        if (!trimmed) return acc;
        const isClosing = /^<\//.test(trimmed);
        const isSelfClosing =
          /\/>$/.test(trimmed) ||
          /^<(br|hr|img|input|meta|link)\b/i.test(trimmed);
        if (isClosing) acc.indent = Math.max(0, acc.indent - 1);
        acc.lines.push("  ".repeat(acc.indent) + trimmed);
        if (!isClosing && !isSelfClosing && /^<[^/!]/.test(trimmed))
          acc.indent++;
        return acc;
      },
      { lines: [], indent: 0 },
    )
    .lines.join("\n");
}

type ViewMode = "split" | "code" | "preview";

export default function TemplateEditorPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(slug);

  const [name, setName] = useState("");
  const [slugValue, setSlugValue] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  const variables = useMemo(
    () => extractVariables(subject, bodyHtml),
    [subject, bodyHtml],
  );

  useEffect(() => {
    if (!slug) return;
    fetchTemplate(slug)
      .then((t) => {
        setName(t.name);
        setSlugValue(t.slug);
        setSubject(t.subject);
        setBodyHtml(t.bodyHtml);
      })
      .catch(() => setError("Template not found"))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await updateTemplate(slug!, { name, subject, bodyHtml });
      } else {
        await createTemplate({ slug: slugValue, name, subject, bodyHtml });
      }
      navigate("/templates");
    } catch {
      setError("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <p className="pt-10 text-sm text-text-tertiary">Loading…</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Breadcrumb back-link, sits above the page header. */}
      <Link
        to="/templates"
        className="-mt-1 mb-1 inline-flex items-center gap-1 text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={12} />
        Templates
      </Link>

      <PageHeader
        title={isEdit ? name || "Edit template" : "New template"}
        subtitle={
          isEdit && slugValue ? (
            <span className="font-mono">{slugValue}</span>
          ) : (
            "Reusable HTML email with {{variable}} interpolation."
          )
        }
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/templates")}
              className="rounded-[6px] border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="rounded-[6px] bg-text-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
            </button>
          </div>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* --- Details card --- */}
        <section className="rounded-[8px] bg-card p-5 ring-1 ring-border">
          <SectionHeader
            icon={Sparkles}
            title="Details"
            subtitle="The template's identity. Slug is the stable id used by the API and sequences."
          />

          <div className="mt-4 space-y-4">
            <Field label="Name" hint="Shown in the template picker.">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Welcome email"
                required
                className={FORM_INPUT_CLASS}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Slug"
                hint={
                  isEdit
                    ? "Slug can't change once a template is created."
                    : "Lowercase letters, numbers, hyphens."
                }
              >
                <input
                  value={slugValue}
                  onChange={(e) => setSlugValue(e.target.value)}
                  placeholder="welcome-email"
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                  disabled={isEdit}
                  required
                  className={cn(
                    FORM_INPUT_CLASS,
                    "font-mono",
                    isEdit && "opacity-60",
                  )}
                />
              </Field>

              <Field
                label="Subject line"
                hint={
                  <>
                    Use{" "}
                    <code className="rounded bg-bg-muted px-1 py-0.5 font-mono text-[10px]">
                      {`{{variable}}`}
                    </code>{" "}
                    for placeholders.
                  </>
                }
              >
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Welcome, {{name}}!"
                  required
                  className={FORM_INPUT_CLASS}
                />
              </Field>
            </div>
          </div>
        </section>

        {/* --- Body card with HTML editor + live preview --- */}
        <section className="overflow-hidden rounded-[8px] bg-card ring-1 ring-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Code2 size={13} className="text-text-tertiary" />
                Body
              </h2>
              <p className="mt-0.5 text-xs font-light text-text-secondary">
                Author HTML on the left, see the rendered email on the right.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <button
                type="button"
                onClick={() => setBodyHtml(formatHtml(bodyHtml))}
                disabled={!bodyHtml}
                className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border bg-card px-2.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wand2 size={11} />
                Format
              </button>
            </div>
          </div>

          {/* Inline auto-detected variables. Blank when none, so the strip
              doesn't take space until something useful shows up. */}
          {variables.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-subtle/40 px-5 py-2.5">
              <Hash size={11} className="text-text-tertiary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                Variables
              </span>
              {variables.map((v) => (
                <code
                  key={v}
                  className="rounded-full bg-violet/10 px-2 py-0.5 text-[11px] font-mono"
                  style={{ color: "#7c5cfc" }}
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          )}

          <div className="grid h-[520px] grid-cols-1 md:grid-cols-2">
            {/* HTML editor */}
            {viewMode !== "preview" && (
              <div
                className={cn(
                  "flex min-w-0 flex-col",
                  viewMode === "split" &&
                    "border-b border-border md:border-b-0 md:border-r",
                  viewMode === "code" && "md:col-span-2",
                )}
              >
                <PaneLabel>HTML source</PaneLabel>
                <div className="min-h-0 flex-1">
                  <HtmlCodeEditor value={bodyHtml} onChange={setBodyHtml} />
                </div>
              </div>
            )}

            {/* Live preview */}
            {viewMode !== "code" && (
              <div
                className={cn(
                  "flex min-w-0 flex-col",
                  viewMode === "preview" && "md:col-span-2",
                )}
              >
                <PaneLabel>Preview</PaneLabel>
                <div className="min-h-0 flex-1 bg-white">
                  <iframe
                    title="Email preview"
                    sandbox="allow-same-origin"
                    srcDoc={bodyHtml}
                    className="h-full w-full"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* --- API reference (collapsible, no longer a slide-over) --- */}
        <ApiReferenceCard
          slug={slugValue || slug || ""}
          variables={variables}
        />
      </form>
    </PageContainer>
  );
}

/* --------------------------------- helpers --------------------------------- */

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-[6px] bg-bg-muted/70 p-0.5 ring-1 ring-border">
      <ToggleButton
        active={mode === "code"}
        onClick={() => onChange("code")}
        icon={Code2}
        label="Code"
      />
      <ToggleButton
        active={mode === "split"}
        onClick={() => onChange("split")}
        icon={Sparkles}
        label="Split"
      />
      <ToggleButton
        active={mode === "preview"}
        onClick={() => onChange("preview")}
        icon={Eye}
        label="Preview"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11px] font-medium transition-all",
        active
          ? "bg-card text-text-primary shadow-sm"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

/* ----------------------------- API reference card ----------------------------- */

function ApiReferenceCard({
  slug,
  variables,
}: {
  slug: string;
  variables: string[];
}) {
  const [open, setOpen] = useState(false);

  const varsObject = variables.reduce(
    (acc, v) => {
      acc[v] = `<${v}>`;
      return acc;
    },
    {} as Record<string, string>,
  );

  const curlBody = JSON.stringify(
    {
      to: "recipient@example.com",
      ...(variables.length > 0 ? { variables: varsObject } : {}),
    },
    null,
    2,
  );

  const endpoint = `${typeof window !== "undefined" ? window.location.origin : ""}/api/email-templates/${slug || "<slug>"}/send`;
  const curlCommand = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <your-api-key>" \\
  -d '${curlBody}'`;

  const errorBody = JSON.stringify(
    {
      error: "Missing required template variables",
      missingVariables: variables.length > 0 ? [variables[0]] : [],
      requiredVariables: variables,
    },
    null,
    2,
  );

  return (
    <section className="overflow-hidden rounded-[8px] bg-card ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-bg-muted/30"
      >
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Code2 size={13} className="text-text-tertiary" />
            Send via API
          </h2>
          <p className="mt-0.5 text-xs font-light text-text-secondary">
            Trigger this template from your backend with a single authenticated
            POST.
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-text-tertiary transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-5 py-5">
          <Field label="Endpoint" hint="POST to this URL with a JSON body.">
            <CodeBlock value={`POST ${endpoint}`} oneLine />
          </Field>

          {variables.length > 0 && (
            <Field
              label="Required variables"
              hint="All variables must be provided in the request body or the API returns 400."
            >
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <code
                    key={v}
                    className="rounded-full bg-violet/10 px-2 py-0.5 text-[11px] font-mono"
                    style={{ color: "#7c5cfc" }}
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </Field>
          )}

          <Field label="Example request">
            <CodeBlock value={curlCommand} />
          </Field>

          <Field label="Error response (400)">
            <CodeBlock value={errorBody} />
          </Field>
        </div>
      )}
    </section>
  );
}
