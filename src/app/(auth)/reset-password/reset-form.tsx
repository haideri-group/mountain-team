"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { resetPassword, type ResetPasswordState } from "@/app/actions/auth";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/auth/password-rules";

const initialState: ResetPasswordState = { status: "idle" };

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPassword, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");

  const errorMessage = state.status === "error" ? state.message : null;
  const lengthValid = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          New Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg bg-input px-4 py-3 pr-11 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/40 hover:ring-border/30 focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <p
          className={`text-xs ${
            password.length === 0
              ? "text-muted-foreground/60"
              : lengthValid
                ? "text-success"
                : "text-muted-foreground"
          }`}
        >
          {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters
          {password.length > 0 && ` · ${password.length}/${PASSWORD_MAX_LENGTH}`}
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirmPassword"
          className="block font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          Confirm Password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            placeholder="••••••••"
            className="w-full rounded-lg bg-input px-4 py-3 pr-11 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/40 hover:ring-border/30 focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-lg bg-sidebar py-4 font-mono text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-sidebar/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset password"}
      </button>

      <div className="flex min-h-6 items-center justify-center">
        {errorMessage && (
          <p className="animate-in fade-in slide-in-from-bottom-2 text-sm font-medium text-destructive">
            {errorMessage}
          </p>
        )}
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Sign in instead
          </Link>
        </p>
      </div>
    </form>
  );
}
