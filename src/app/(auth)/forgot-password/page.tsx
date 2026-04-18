"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Shield,
  Users,
} from "lucide-react";
import {
  requestPasswordReset,
  type RequestPasswordResetState,
} from "@/app/actions/auth";

const RECOVERY_FEATURES = [
  {
    icon: Shield,
    title: "Secure tokens",
    description: "30-minute expiry, single-use, SHA-256 hashed at rest.",
  },
  {
    icon: Clock,
    title: "No account lockout",
    description: "Request a new link any time — never get stuck.",
  },
  {
    icon: Mail,
    title: "Delivery in seconds",
    description: "Check your inbox right after you submit.",
  },
];

const initialState: RequestPasswordResetState = { status: "idle" };

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  const sent = state.status === "sent";
  const errorMessage = state.status === "error" ? state.message : null;

  return (
    <main className="flex min-h-screen">
      {/* LEFT — Recovery hero (desktop only) */}
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
            Recovery without friction.
          </h1>
          <p className="mb-12 max-w-sm text-lg leading-relaxed text-white/60">
            Secure, short-lived reset links — you&apos;ll be back in under a
            minute.
          </p>

          <div className="space-y-8">
            {RECOVERY_FEATURES.map(({ icon: Icon, title, description }) => (
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

      {/* RIGHT — Request / Sent canvas */}
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

          <Link
            href="/login"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          {sent ? (
            <div>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 ring-1 ring-success/20">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h2 className="mb-2 font-mono text-3xl font-bold tracking-tight text-foreground">
                Check your inbox
              </h2>
              <p className="mb-6 leading-relaxed text-muted-foreground">
                If an account exists for{" "}
                <span className="font-mono text-foreground">
                  {maskEmail(state.email)}
                </span>
                , we&apos;ve sent a reset link. It expires in 30 minutes and
                can only be used once.
              </p>
              <p className="mb-8 text-sm text-muted-foreground">
                Didn&apos;t receive it? Check spam, or{" "}
                <Link
                  href="/forgot-password"
                  className="font-semibold text-primary hover:underline"
                >
                  try another email
                </Link>
                .
              </p>
              <Link
                href="/login"
                className="flex w-full items-center justify-center rounded-lg bg-sidebar py-4 font-mono text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-sidebar/90 active:scale-[0.98]"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-10">
                <h2 className="mb-2 font-mono text-3xl font-bold tracking-tight text-foreground">
                  Forgot your password?
                </h2>
                <p className="font-medium text-muted-foreground">
                  Enter your work email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form action={formAction} className="space-y-6">
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
                    required
                    autoFocus
                    placeholder="you@tilemountain.co.uk"
                    className="w-full rounded-lg bg-input px-4 py-3 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/40 hover:ring-border/30 focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="flex w-full items-center justify-center rounded-lg bg-sidebar py-4 font-mono text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-sidebar/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Send reset link"
                  )}
                </button>

                <div className="flex h-6 items-center justify-center">
                  {errorMessage && (
                    <p className="animate-in fade-in slide-in-from-bottom-2 text-sm font-medium text-destructive">
                      {errorMessage}
                    </p>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Remember your password?{" "}
                    <Link
                      href="/login"
                      className="font-bold text-primary hover:underline"
                    >
                      Sign in instead
                    </Link>
                  </p>
                </div>
              </form>
            </>
          )}

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
