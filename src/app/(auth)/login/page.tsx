"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authenticate, loginWithGoogle } from "@/app/actions/auth";
import { Loader2 } from "lucide-react";

function LoginContent() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const deactivatedMessage = urlError === "AccountDeactivated"
    ? "Your account has been deactivated. Contact an administrator."
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-bg)] relative overflow-hidden">
      {/* Decorative gradient blob */}
      <div className="absolute w-[600px] h-[600px] bg-[var(--accent-orange)]/10 rounded-full blur-3xl -top-32 -right-32 pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl -bottom-32 -left-32 pointer-events-none" />
      
      <div className="w-full max-w-sm p-8 bg-[var(--surface-pane)] rounded-2xl border border-[var(--surface-border)] shadow-2xl z-10 backdrop-blur-xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] mb-2 font-mono">
            TEAM<span className="text-[var(--accent-orange)]">FLOW</span>
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Sign in to access your dashboard
          </p>
        </div>

        <form className="flex flex-col space-y-4" action={formAction}>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1 px-1">
              Work Email
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder="admin@tilemountain.co.uk"
              className="w-full h-12 px-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--accent-orange)]/50 focus:bg-[var(--surface-bg)] outline-none text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all duration-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1 px-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              placeholder="••••••••"
              className="w-full h-12 px-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent focus:border-[var(--accent-orange)]/50 focus:bg-[var(--surface-bg)] outline-none text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all duration-300"
            />
            <div className="flex justify-end mt-2">
               <a href="#" className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors">Forgot password?</a>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-12 bg-[var(--accent-orange)] hover:bg-[#e8660a] text-white font-semibold rounded-xl flex items-center justify-center transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-[var(--accent-orange)]/20"
          >
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
          </button>
          
          <div className="h-6 flex items-center justify-center px-1">
             {(errorMessage || deactivatedMessage) && (
                <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-bottom-2">{deactivatedMessage || errorMessage}</p>
             )}
          </div>
        </form>

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-[var(--surface-border)]"></div>
          <span className="flex-shrink-0 mx-4 text-[var(--text-secondary)] text-sm font-medium">or</span>
          <div className="flex-grow border-t border-[var(--surface-border)]"></div>
        </div>

        <button
          className="w-full h-12 bg-transparent border border-[var(--surface-border)] hover:bg-[var(--surface-bg)] text-[var(--text-primary)] font-semibold rounded-xl flex items-center justify-center transition-all duration-300 group"
          onClick={() => loginWithGoogle()}
        >
          <svg className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
