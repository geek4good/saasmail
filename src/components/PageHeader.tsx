import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent page header used across dashboard pages.
 * Big extrabold title + optional subtitle + optional right-side action.
 * Mobile-compact, desktop-expansive — matches the Inbox page treatment.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-between gap-3 pt-3 sm:mb-4 sm:pt-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
        <h1 className="shrink-0 text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="min-w-0 max-w-2xl truncate text-xs font-light text-text-tertiary sm:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard width-capped, padded container for dashboard pages.
 * Caps at 1600px on desktop so the chrome lines up with the inbox + nav.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1600px] flex-1 px-4 pb-12 md:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
