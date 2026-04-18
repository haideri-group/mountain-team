import { Clock, Mail, Shield, Users } from "lucide-react";

const FEATURES = [
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

export function RecoveryHero() {
  return (
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
  );
}
