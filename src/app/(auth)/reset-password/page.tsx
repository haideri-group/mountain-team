import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import { validateResetToken } from "@/app/actions/auth";
import { ResetForm } from "./reset-form";
import { RecoveryHero } from "./recovery-hero";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const validation = await validateResetToken(token);

  return (
    <main className="flex min-h-screen">
      <RecoveryHero />

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

          {validation.valid ? (
            <>
              <div className="mb-10">
                <h2 className="mb-2 font-mono text-3xl font-bold tracking-tight text-foreground">
                  Choose a new password
                </h2>
                <p className="font-medium text-muted-foreground">
                  Resetting the password for{" "}
                  <span className="font-mono text-foreground">{validation.email}</span>.
                </p>
              </div>
              <ResetForm token={token!} />
            </>
          ) : (
            <div>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="mb-2 font-mono text-3xl font-bold tracking-tight text-foreground">
                Link invalid or expired
              </h2>
              <p className="mb-8 leading-relaxed text-muted-foreground">
                This reset link is no longer valid. It may have expired, been
                used already, or never existed. Request a new one to continue.
              </p>
              <Link
                href="/forgot-password"
                className="flex w-full items-center justify-center rounded-lg bg-sidebar py-4 font-mono text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-sidebar/90 active:scale-[0.98]"
              >
                Request a new link
              </Link>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link href="/login" className="font-bold text-primary hover:underline">
                  Sign in instead
                </Link>
              </p>
            </div>
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
