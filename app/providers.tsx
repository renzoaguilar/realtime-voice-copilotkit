"use client";

import { CopilotKit } from "@copilotkit/react-core";
import type { ReactNode } from "react";

type ProvidersProps = {
  children: ReactNode;
};

export const Providers = ({ children }: ProvidersProps) => {
  return <CopilotKit runtimeUrl="/api/copilotkit">{children}</CopilotKit>;
};
