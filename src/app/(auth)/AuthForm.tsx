"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login, signup } from "@/app/actions/auth";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : signup, undefined);
  const next = useSearchParams().get("next") ?? "";
  const isLogin = mode === "login";
  const otherHref = `${isLogin ? "/signup" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Username
        <input
          name="username"
          required
          autoComplete="username"
          autoFocus
          defaultValue={state?.username}
          className="rounded-lg border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete={isLogin ? "current-password" : "new-password"}
          minLength={isLogin ? undefined : 8}
          className="rounded-lg border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        {!isLogin && <span className="text-xs font-normal text-zinc-500">At least 8 characters.</span>}
      </label>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
      </button>

      <p className="text-center text-sm text-zinc-600">
        {isLogin ? "New to TCGLoader?" : "Already have an account?"}{" "}
        <Link href={otherHref} className="font-medium text-brand hover:underline">
          {isLogin ? "Sign up" : "Log in"}
        </Link>
      </p>
    </form>
  );
}
