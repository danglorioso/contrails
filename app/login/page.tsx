"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Incorrect password");
      setLoading(false);
    } else {
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      router.push(callbackUrl);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold tracking-[0.3em] mb-2">
            CONTRAILS
          </h1>
          <p className="text-gray-600 text-sm">Your personal flight map</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-950 rounded-2xl border border-gray-800 p-6"
        >
          <div className="mb-5">
            <label className="block text-gray-400 text-sm mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              autoFocus
            />
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-3 font-medium transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <span className="text-gray-600">Loading…</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
