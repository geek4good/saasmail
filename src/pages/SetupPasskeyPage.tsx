import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { WordmarkLarge } from "@/components/Wordmark";

export default function SetupPasskeyPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setLoading(true);
    setError("");
    try {
      const result = await authClient.passkey.addPasskey();
      if (result?.error) {
        setError(result.error.message || "Passkey registration failed");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Passkey registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8">
      <WordmarkLarge />
      <div className="w-full rounded-2xl bg-white/10 p-8 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
        <div className="mb-6">
          <h2 className="text-xl font-extrabold tracking-tight text-white">
            Register a passkey
          </h2>
          <p className="mt-1.5 text-sm font-light text-white/60">
            For security, you must register a passkey before accessing saasmail.
          </p>
        </div>
        {error && (
          <p className="mb-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <button
          className="w-full rounded-full bg-white py-2.5 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleRegister}
          disabled={loading}
        >
          {loading ? "Registering…" : "Register passkey"}
        </button>
      </div>
    </div>
  );
}
