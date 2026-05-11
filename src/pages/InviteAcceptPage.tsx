import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { signIn } from "@/lib/auth-client";
import { validateInvite, acceptInvite } from "@/lib/api";
import { WordmarkLarge } from "@/components/Wordmark";
import { useBranding } from "@/lib/branding";

export default function InviteAcceptPage() {
  const { passkeyRequired, brandName } = useBranding();
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">(
    "loading",
  );
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const info = await validateInvite(token);
        if (cancelled) return;
        if (info.valid) {
          setStatus("valid");
          if (info.email) {
            setInviteEmail(info.email);
            setEmail(info.email);
          }
        } else {
          setStatus("invalid");
        }
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await acceptInvite({ token, name, email, password });
      if (!result.success) {
        setError("Failed to create account");
        return;
      }
      const signInResult = await signIn.email({ email, password });
      if (signInResult.error) {
        setError("Account created but sign-in failed. Please go to login.");
        return;
      }
      // Redirect home regardless of passkey gating; the auth guard will
      // bounce to /setup-passkey if needed once the session is loaded.
      // This avoids a race where /api/config hasn't responded yet and we
      // end up stuck on /invite/ while passkeyRequired flips.
      void passkeyRequired;
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-white/60">Validating invitation…</p>;
  }

  if (status === "invalid") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <WordmarkLarge />
        <div className="w-full rounded-2xl bg-white/10 p-8 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
          <h2 className="text-xl font-extrabold tracking-tight text-white">
            Invalid invitation
          </h2>
          <p className="mt-3 text-sm font-light text-white/60">
            This invitation link is invalid, expired, or has already been used.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8">
      <WordmarkLarge />
      <div className="w-full rounded-2xl bg-white/10 p-8 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
        <div className="mb-6">
          <h2 className="text-xl font-extrabold tracking-tight text-white">
            Join {brandName}
          </h2>
          <p className="mt-1.5 text-sm font-light text-white/60">
            Create your account to get started.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="invite-name"
              className="text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Name
            </label>
            <input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="invite-email"
              className="text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={!!inviteEmail}
              className={INPUT_CLASS + (inviteEmail ? " opacity-60" : "")}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="invite-password"
              className="text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Password
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
            <p className="text-xs font-light text-white/40">
              At least 8 characters.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-full bg-white py-2.5 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border-0 bg-white/5 px-3 text-sm text-white ring-1 ring-white/15 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all";
