"use client";

import { useMemo } from "react";
import type { Parameter } from "@copilotkit/shared";
import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotAction, useRenderToolCall } from "@copilotkit/react-core";
import { useRealtimeVoiceSession } from "@/hooks/useRealtimeVoiceSession";
import { useVoiceBridgeStore } from "@/store/voice-bridge-store";
import { VoiceModeToggle } from "@/components/VoiceModeToggle";
import { VoiceStatusBadge } from "@/components/VoiceStatusBadge";
import { ToolInvocationCard } from "@/components/ToolInvocationCard";
import { WeatherToolCard } from "@/components/WeatherToolCard";
import { PopulationToolCard } from "@/components/PopulationToolCard";
import { RealtimeCopilotBridge } from "@/components/RealtimeCopilotBridge";

const WEATHER_ACTION_PARAMETERS: Parameter[] = [
  {
    name: "location",
    type: "string",
    description: "City or place name",
    required: true,
  },
  {
    name: "unit",
    type: "string",
    description: "Temperature unit: c or f",
    required: false,
    enum: ["c", "f"],
  },
];

const POPULATION_ACTION_PARAMETERS: Parameter[] = [
  {
    name: "location",
    type: "string",
    description: "City name",
    required: true,
  },
  {
    name: "country",
    type: "string",
    description: "Optional country name",
    required: false,
  },
];

export const CopilotChatShell = () => {
  const { isVoiceMode, connectionState, startVoiceMode, stopVoiceMode, interruptAssistant } =
    useRealtimeVoiceSession();

  const timeline = useVoiceBridgeStore((state) => state.timeline);

  useCopilotAction(
    {
      name: "lookup_weather",
      description: "Renderiza el resultado de clima en una card visual.",
      parameters: WEATHER_ACTION_PARAMETERS,
      // Esta action no ejecuta clima: solo enseña la card cuando CopilotKit ve la tool.
      // La ejecucion real ya paso por /api/tools desde el flujo realtime.
      available: "frontend",
      render: (props) => {
        return (
          <WeatherToolCard
            status={props.status}
            args={props.args as Record<string, unknown>}
            result={props.result}
          />
        );
      },
    },
    [],
  );

  useCopilotAction(
    {
      name: "lookup_population",
      description: "Renderiza la poblacion de una ciudad en una card visual.",
      parameters: POPULATION_ACTION_PARAMETERS,
      // Mismo patron que clima: renderer frontend, resultado calculado en backend.
      available: "frontend",
      render: (props) => {
        return (
          <PopulationToolCard
            status={props.status}
            args={props.args as Record<string, unknown>}
            result={props.result}
          />
        );
      },
    },
    [],
  );

  // Renderer de seguridad: si agregamos una tool sin card propia, igual aparece legible.
  useRenderToolCall(
    {
      name: "*",
      description:
        "Renderiza cualquier invocacion de tool con estado y detalle legible.",
      parameters: [],
      render: (props: any) => {
        return (
          <ToolInvocationCard
            name={props.name}
            args={props.args}
            status={props.status}
            result={props.result}
          />
        );
      },
    },
    [],
  );

  const recentEvents = useMemo(
    () => [...timeline].reverse().slice(0, 10),
    [timeline],
  );

  const handleToggleVoice = () => {
    if (isVoiceMode) {
      stopVoiceMode();
      return;
    }

    void startVoiceMode();
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Realtime Voice + CopilotKit</h1>
          <p>
            Chat visual en CopilotKit, audio low-latency en OpenAI Realtime.
          </p>
        </div>
        <div className="voice-controls">
          <VoiceStatusBadge state={connectionState} />
          <VoiceModeToggle
            isActive={isVoiceMode}
            isBusy={connectionState === "connecting"}
            onToggle={handleToggleVoice}
          />
          <button
            type="button"
            className="interrupt-btn"
            disabled={!isVoiceMode}
            onClick={() => interruptAssistant("manual")}
          >
            Interrumpir
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="chat-column">
          <RealtimeCopilotBridge />
          <CopilotChat
            className="copilot-chat"
            instructions="Responde siempre en espanol claro. Usa tools cuando aporten valor y explica brevemente el resultado al usuario."
          />
        </section>

        <aside className="event-column">
          <h2>Eventos Realtime</h2>
          <ul>
            {recentEvents.map((event) => (
              <li key={event.id}>
                <strong>{event.type}</strong>
                <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
};
