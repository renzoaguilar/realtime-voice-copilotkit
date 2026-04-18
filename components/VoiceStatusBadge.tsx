"use client";

import type { VoiceSessionState } from "@/lib/realtime/types";

type VoiceStatusBadgeProps = {
  state: VoiceSessionState;
};

const labelByState: Record<VoiceSessionState, string> = {
  idle: "idle",
  connecting: "connecting",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  interrupted: "interrupted",
  error: "error",
};

export const VoiceStatusBadge = ({ state }: VoiceStatusBadgeProps) => {
  return (
    <span className={`voice-status-badge state-${state}`}>
      {labelByState[state]}
    </span>
  );
};
