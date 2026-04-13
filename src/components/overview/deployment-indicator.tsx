"use client";

import { Rocket, Server } from "lucide-react";

interface DeploymentIndicatorProps {
  status: "production" | "staging" | null | undefined;
}

export function DeploymentIndicator({ status }: DeploymentIndicatorProps) {
  if (!status) return null;

  if (status === "production") {
    return (
      <span
        className="inline-flex items-center"
        title="Deployed to production"
      >
        <Rocket className="h-3 w-3 text-emerald-500" />
      </span>
    );
  }

  if (status === "staging") {
    return (
      <span
        className="inline-flex items-center"
        title="Deployed to staging"
      >
        <Server className="h-3 w-3 text-amber-500" />
      </span>
    );
  }

  return null;
}
