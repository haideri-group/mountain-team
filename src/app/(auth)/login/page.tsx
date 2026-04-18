"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { authenticate, loginWithGoogle } from "@/app/actions/auth";

const FEATURES = [
  {
    icon: RefreshCw,
    title: "JIRA sync every 5 minutes",
    description: "Real-time status updates without manual refreshes.",
  },
  {
    icon: LayoutDashboard,
    title: "Multi-board tracking",
    description: "Cross-reference PROD clusters with project milestones.",
  },
  {
    icon: BarChart3,
    title: "Performance analytics",
    description: "Automated velocity reports and resource heatmaps.",
  },
];

function LoginContent() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const deactivatedMessage =
    searchParams.get("error") === "AccountDeactivated"
      ? "Your account has been deactivated. Contact an administrator."
      : null;
  const resetSuccess = searchParams.get("reset") === "success";

  return (
    <main className="flex min-h-screen">
      {/* LEFT — Brand hero (desktop only) */}
      <section className="relative hidden w-[520px] flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute -right-[10%] -top-[10%] h-96 w-96 rounded-full bg-primary blur-[100px]" />
          <div className="absolute -bottom-[5%] -left-[5%] h-64 w-64 rounded-full bg-chart-4 blur-[80px]" />
        </div>

        <div className="relative z-10">
          <div className="mb-16 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-lg">
              <Users className="h-6 w-6 text-white" />
            </div>
            <span className="font-mono text-2xl font-extrabold tracking-tight">
              TEAMFLOW
            </span>
          </div>

          <div className="mb-8 h-1.5 w-16 bg-primary" />
          <h1 className="mb-6 font-mono text-4xl font-bold leading-tight tracking-tight lg:text-5xl">
            Manage your teams with clarity.
          </h1>
          <p className="mb-12 max-w-sm text-lg leading-relaxed text-white/60">
            Unify your engineering workflow with real-time JIRA visibility and
            integrated performance tracking.
          </p>

          <div className="space-y-8">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-mono text-sm font-bold uppercase tracking-wider">
                    {title}
                  </p>
                  <p className="mt-1 text-xs text-white/40">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 pt-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/50">
            Crafted with <span className="text-primary">♥</span> by Haider ·
            Mountain Tech
          </p>
        </div>
      </section>

      {/* RIGHT — Sign-in canvas */}
      <section className="flex flex-1 flex-col items-center justify-center bg-background px-6 lg:px-24">
        <div className="w-full max-w-md">
          {/* Mobile-only brand */}
          <div className="mb-12 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar">
              <Users className="h-5 w-5 text-white" />
            </div>
            <span className="font-mono text-lg font-bold tracking-tight text-foreground">
              TEAMFLOW
            </span>
          </div>

          <div className="mb-10">
            <h2 className="mb-2 font-mono text-3xl font-bold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="font-medium text-muted-foreground">
              Sign in to your TeamFlow account
            </p>
          </div>

          {resetSuccess && (
            <div className="mb-6 flex items-start gap-3 rounded-lg bg-success/10 p-4 ring-1 ring-success/20">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
              <p className="text-sm font-medium text-foreground">
                Your password was reset. Sign in with your new password.
              </p>
            </div>
          )}

          <form action={formAction} className="space-y-6">
            <button
              type="button"
              onClick={() => loginWithGoogle()}
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-card px-4 py-3 ring-1 ring-border/30 transition-colors hover:bg-muted"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="text-sm font-semibold text-foreground">
                Continue with Google
              </span>
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-border/30" />
              <span className="mx-4 flex-shrink font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                or
              </span>
              <div className="flex-grow border-t border-border/30" />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                Work Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="sarah.chen@tilemountain.co.uk"
                className="w-full rounded-lg bg-input px-4 py-3 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/40 hover:ring-border/30 focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-input px-4 py-3 pr-11 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/40 hover:ring-border/30 focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                className="h-4 w-4 rounded accent-primary"
              />
              <label
                htmlFor="remember"
                className="cursor-pointer text-sm font-medium text-muted-foreground"
              >
                Keep me signed in
              </label>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center rounded-lg bg-sidebar py-4 font-mono text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-sidebar/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Sign In"
              )}
            </button>

            <div className="flex h-6 items-center justify-center">
              {(errorMessage || deactivatedMessage) && (
                <p className="animate-in fade-in slide-in-from-bottom-2 text-sm font-medium text-destructive">
                  {deactivatedMessage || errorMessage}
                </p>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Need access?{" "}
                <a
                  href="mailto:syed.haider@tilemountain.co.uk"
                  className="font-bold text-primary hover:underline"
                >
                  Contact your administrator
                </a>
              </p>
            </div>
          </form>

          <div className="mt-16 lg:hidden">
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50">
              Crafted with <span className="text-primary">♥</span> by Haider ·
              Mountain Tech
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
