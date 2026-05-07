import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import Footer from "@/components/Footer";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/**
 * Public, readable layout for legal pages (Terms, Privacy). Light pastel
 * backdrop with a centered prose column. No auth required.
 */
export default function LegalLayout({
  title,
  lastUpdated,
  children,
}: LegalLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="dashboard-backdrop" aria-hidden />
      <div className="dashboard-backdrop-mask" aria-hidden />

      {/* Brand strip */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6 md:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-text-primary transition-opacity hover:opacity-80"
          >
            <Mail
              className="h-5 w-5"
              strokeWidth={2.5}
              style={{ color: "#7c5cfc" }}
              aria-hidden
            />
            <span className="text-lg font-extrabold uppercase tracking-tight">
              saasmail
            </span>
          </Link>
          <Link
            to="/login"
            className="text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
          <header className="mb-10 border-b border-border pb-8">
            <h1 className="text-4xl font-extrabold tracking-tight text-text-primary md:text-5xl">
              {title}
            </h1>
            <p className="mt-3 text-sm font-light text-text-tertiary">
              Last updated · {lastUpdated}
            </p>
          </header>

          <div className="prose prose-slate max-w-none [&_a]:font-medium [&_a]:text-violet [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-text-secondary [&_code]:rounded [&_code]:bg-bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-text-primary [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-text-primary [&_li]:my-1 [&_li]:text-[15px] [&_li]:leading-relaxed [&_p]:my-3 [&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:text-text-secondary [&_strong]:font-semibold [&_strong]:text-text-primary [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
            {children}
          </div>
        </article>
      </main>

      <div className="relative z-10">
        <Footer variant="light" />
      </div>
    </div>
  );
}
