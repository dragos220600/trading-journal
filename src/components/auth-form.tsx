"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/server/auth-actions";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-md border border-ink-line bg-ink-card px-3 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim";
const labelCls = "block text-xs font-medium text-text-muted mb-1.5";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "register";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      {mode === "register" && (
        <div>
          <label htmlFor="name" className={labelCls}>
            Name <span className="text-text-faint">(optional)</span>
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="How the desk should greet you"
            className={inputCls}
          />
        </div>
      )}
      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelCls}>
          Password{" "}
          {mode === "register" && (
            <span className="text-text-faint">(min. 8 characters)</span>
          )}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputCls}
        />
      </div>

      {state.error && (
        <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "btn-accent w-full px-4 py-2.5 text-sm",
          pending && "opacity-60",
        )}
      >
        {pending
          ? "One moment…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
      </button>

      <p className="text-center text-xs text-text-muted">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link
              href="/register"
              className="text-accent hover:text-accent-soft"
            >
              Create one
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="text-accent hover:text-accent-soft">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
