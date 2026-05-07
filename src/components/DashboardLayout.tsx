import { useState } from "react";
import { Outlet } from "react-router-dom";
import TopNav from "@/components/TopNav";
import Breadcrumbs from "@/components/Breadcrumbs";
import Footer from "@/components/Footer";
import ComposeFab from "@/components/ComposeFab";
import ComposeModal from "@/pages/ComposeModal";
import { useReducedAnimations } from "@/hooks/useReducedAnimations";

export default function DashboardLayout() {
  const [composeOpen, setComposeOpen] = useState(false);
  const reduced = useReducedAnimations();

  return (
    <div className="relative flex min-h-screen flex-col bg-background pt-16">
      {/* Faded gradient backdrop. Animates by default; falls back to a
          static version on low-spec devices or when the user prefers
          reduced motion. */}
      <div
        className={
          reduced
            ? "dashboard-backdrop dashboard-backdrop-static"
            : "dashboard-backdrop"
        }
        aria-hidden
      />
      <div className="dashboard-backdrop-mask" aria-hidden />

      <TopNav />
      <Breadcrumbs />

      <main className="relative z-10 flex flex-1 flex-col">
        <Outlet context={{ onCompose: () => setComposeOpen(true) }} />
      </main>

      <div className="relative z-10">
        <Footer />
      </div>

      <ComposeFab onClick={() => setComposeOpen(true)} />

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        replyToEmailId={null}
      />
    </div>
  );
}
