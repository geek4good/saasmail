import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface FooterProps {
  /** "light" (default) for dashboard pages on white-ish bg.
   *  "dark" for auth pages on the near-black gradient backdrop. */
  variant?: "light" | "dark";
}

/**
 * Single-row minimal footer matching givefeedback.dev's app footer.
 * Adapts to dark vs light parent bg via the `variant` prop so the same
 * markup works on both the dashboard and auth screens.
 */
export default function Footer({ variant = "light" }: FooterProps) {
  const dark = variant === "dark";

  return (
    <footer
      className={cn("border-t", dark ? "border-white/10" : "border-border/60")}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-3 px-4 py-5 text-xs sm:flex-row sm:justify-between md:px-6">
        {/* Left: Privacy / Terms pills */}
        <div className="flex items-center gap-2">
          <Link
            to="/privacy"
            className={cn(
              "rounded-[8px] px-3 py-1 font-semibold uppercase tracking-wider ring-1 transition-colors",
              dark
                ? "text-white/60 ring-white/15 hover:bg-white/5 hover:text-white"
                : "text-text-secondary ring-border hover:bg-bg-subtle hover:text-text-primary",
            )}
          >
            Privacy
          </Link>
          <Link
            to="/terms"
            className={cn(
              "rounded-[8px] px-3 py-1 font-semibold uppercase tracking-wider ring-1 transition-colors",
              dark
                ? "text-white/60 ring-white/15 hover:bg-white/5 hover:text-white"
                : "text-text-secondary ring-border hover:bg-bg-subtle hover:text-text-primary",
            )}
          >
            Terms
          </Link>
        </div>

        {/* Center: copyright */}
        <div className={dark ? "text-white/50" : "text-text-tertiary"}>
          © {new Date().getFullYear()} saasmail
        </div>

        {/* Right: sponsor */}
        <div
          className={cn(
            "flex items-center gap-2",
            dark ? "text-white/50" : "text-text-tertiary",
          )}
        >
          <span>Sponsored by</span>
          <a
            href="https://givefeedback.dev/saas"
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 transition-colors",
              dark
                ? "bg-white/[0.06] text-white ring-white/15 hover:bg-white/[0.1]"
                : "bg-violet/10 text-violet ring-violet/20 hover:bg-violet/15",
            )}
            style={!dark ? { color: "#7c5cfc" } : undefined}
          >
            <span style={{ color: "#bfff00" }}>✦</span>
            givefeedback.dev
          </a>
        </div>
      </div>
    </footer>
  );
}
