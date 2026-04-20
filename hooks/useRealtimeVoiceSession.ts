"use client";

import { useCallback, useRef } from "react";
import { useVoiceBridgeStore } from "@/store/voice-bridge-store";
import type { VoiceSessionState } from "@/lib/realtime/types";

type RealtimeServerEvent = {
  type: string;
  [key: string]: unknown;
};

type FunctionCallDoneEvent = {
  type: "response.function_call_arguments.done";
  call_id: string;
  name: string;
  arguments: string;
};

type OutputItemFunctionCallDoneEvent = {
  type: "response.output_item.done";
  item?: {
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    [key: string]: unknown;
  };
};

type ConversationMessageItem = {
  id?: string;
  type?: string;
  role?: "user" | "assistant" | "system";
  content?: Array<{
    type?: string;
    text?: string;
    transcript?: string;
  }>;
};

type ConversationItemCreatedEvent = {
  type: "conversation.item.created";
  item?: ConversationMessageItem;
};

type ConversationItemAddedEvent = {
  type: "conversation.item.added";
  item?: ConversationMessageItem;
};

type InputAudioTranscriptionCompletedEvent = {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
  transcript: string;
};

type InputAudioTranscriptionDeltaEvent = {
  type: "conversation.item.input_audio_transcription.delta";
  item_id: string;
  delta?: string;
};

type ResponseAudioTranscriptDeltaEvent = {
  type: "response.audio_transcript.delta";
  item_id: string;
  delta: string;
};

type ResponseAudioTranscriptDoneEvent = {
  type: "response.audio_transcript.done";
  item_id: string;
  transcript: string;
};

type ResponseOutputAudioTranscriptDeltaEvent = {
  type: "response.output_audio_transcript.delta";
  item_id: string;
  delta: string;
};

type ResponseOutputAudioTranscriptDoneEvent = {
  type: "response.output_audio_transcript.done";
  item_id: string;
  transcript: string;
};

type ResponseOutputTextDeltaEvent = {
  type: "response.output_text.delta";
  item_id: string;
  delta: string;
};

type ResponseOutputTextDoneEvent = {
  type: "response.output_text.done";
  item_id: string;
  text: string;
};

type SessionBootstrapResponse = {
  value?: string;
  clientSecret?: string;
  expiresAt?: number;
};

// Los argumentos de una tool llegan como string JSON desde Realtime.
// Si el JSON viene incompleto o mal formado, preferimos no romper la sesion de voz:
// registramos la tool con args vacios y dejamos que el backend valide.
const safeParseRecord = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // La validacion real ocurre en /api/tools con zod.
  }

  return {};
};

const isFunctionCallDoneEvent = (
  event: RealtimeServerEvent,
): event is FunctionCallDoneEvent =>
  event.type === "response.function_call_arguments.done" &&
  typeof event.call_id === "string" &&
  typeof event.name === "string" &&
  typeof event.arguments === "string";

const isOutputItemFunctionCallDoneEvent = (
  event: RealtimeServerEvent,
): event is OutputItemFunctionCallDoneEvent =>
  event.type === "response.output_item.done" &&
  typeof event.item === "object" &&
  event.item !== null;

const isConversationItemCreatedEvent = (
  event: RealtimeServerEvent,
): event is ConversationItemCreatedEvent =>
  event.type === "conversation.item.created" &&
  typeof event.item === "object" &&
  event.item !== null;

const isConversationItemAddedEvent = (
  event: RealtimeServerEvent,
): event is ConversationItemAddedEvent =>
  event.type === "conversation.item.added" &&
  typeof event.item === "object" &&
  event.item !== null;

const isInputAudioTranscriptionCompletedEvent = (
  event: RealtimeServerEvent,
): event is InputAudioTranscriptionCompletedEvent =>
  event.type === "conversation.item.input_audio_transcription.completed" &&
  typeof event.item_id === "string" &&
  typeof event.transcript === "string";

const isInputAudioTranscriptionDeltaEvent = (
  event: RealtimeServerEvent,
): event is InputAudioTranscriptionDeltaEvent =>
  event.type === "conversation.item.input_audio_transcription.delta" &&
  typeof event.item_id === "string";

const isResponseAudioTranscriptDeltaEvent = (
  event: RealtimeServerEvent,
): event is ResponseAudioTranscriptDeltaEvent =>
  event.type === "response.audio_transcript.delta" &&
  typeof event.item_id === "string" &&
  typeof event.delta === "string";

const isResponseAudioTranscriptDoneEvent = (
  event: RealtimeServerEvent,
): event is ResponseAudioTranscriptDoneEvent =>
  event.type === "response.audio_transcript.done" &&
  typeof event.item_id === "string" &&
  typeof event.transcript === "string";

const isResponseOutputAudioTranscriptDeltaEvent = (
  event: RealtimeServerEvent,
): event is ResponseOutputAudioTranscriptDeltaEvent =>
  event.type === "response.output_audio_transcript.delta" &&
  typeof event.item_id === "string" &&
  typeof event.delta === "string";

const isResponseOutputAudioTranscriptDoneEvent = (
  event: RealtimeServerEvent,
): event is ResponseOutputAudioTranscriptDoneEvent =>
  event.type === "response.output_audio_transcript.done" &&
  typeof event.item_id === "string" &&
  typeof event.transcript === "string";

const isResponseOutputTextDeltaEvent = (
  event: RealtimeServerEvent,
): event is ResponseOutputTextDeltaEvent =>
  event.type === "response.output_text.delta" &&
  typeof event.item_id === "string" &&
  typeof event.delta === "string";

const isResponseOutputTextDoneEvent = (
  event: RealtimeServerEvent,
): event is ResponseOutputTextDoneEvent =>
  event.type === "response.output_text.done" &&
  typeof event.item_id === "string" &&
  typeof event.text === "string";

const extractConversationItemText = (item: ConversationMessageItem): string => {
  if (!Array.isArray(item.content)) {
    return "";
  }

  const chunks: string[] = [];

  item.content.forEach((part) => {
    if (typeof part?.text === "string" && part.text.trim()) {
      chunks.push(part.text.trim());
      return;
    }

    if (typeof part?.transcript === "string" && part.transcript.trim()) {
      chunks.push(part.transcript.trim());
    }
  });

  return chunks.join(" ").trim();
};

export type UseRealtimeVoiceSessionResult = {
  isVoiceMode: boolean;
  connectionState: VoiceSessionState;
  startVoiceMode: () => Promise<void>;
  stopVoiceMode: () => void;
  interruptAssistant: (reason?: string) => void;
};

export const useRealtimeVoiceSession = (): UseRealtimeVoiceSessionResult => {
  const connectionState = useVoiceBridgeStore((state) => state.connectionState);

  // Estas refs representan recursos vivos del navegador. No van en state de React
  // porque no deben provocar renders y deben cerrarse manualmente al apagar voz.
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  // Realtime puede reemitir eventos; call_id nos permite ejecutar cada tool una vez.
  const handledToolCallIdsRef = useRef<Set<string>>(new Set());

  const setConnectionState = useCallback((next: VoiceSessionState) => {
    useVoiceBridgeStore.getState().setConnectionState(next);
  }, []);

  const pushError = useCallback((message: string) => {
    const store = useVoiceBridgeStore.getState();
    store.setConnectionState("error", "error", { message });
  }, []);

  const sendClientEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    channel.send(JSON.stringify(event));
  }, []);

  const closeRealtimeResources = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    peerRef.current?.close();
    peerRef.current = null;

    handledToolCallIdsRef.current.clear();
    activeRef.current = false;
  }, []);

  const interruptAssistant = useCallback(
    (reason = "barge-in") => {
      if (!activeRef.current) {
        return;
      }

      // Barge-in: cuando el usuario habla encima del asistente, cancelamos
      // la respuesta actual y limpiamos audio pendiente para priorizar el nuevo turno.
      sendClientEvent({ type: "response.cancel" });
      sendClientEvent({ type: "output_audio_buffer.clear" });
      useVoiceBridgeStore
        .getState()
        .setConnectionState("interrupted", "assistant_interrupted", {
          reason,
        });
    },
    [sendClientEvent],
  );

  const handleToolCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      const toolStore = useVoiceBridgeStore.getState();

      // Regla importante: la tool se ejecuta una sola vez, en backend.
      // El cliente solo coordina el evento, actualiza UI y devuelve resultado a Realtime.
      if (handledToolCallIdsRef.current.has(callId)) {
        return;
      }
      handledToolCallIdsRef.current.add(callId);

      const args = safeParseRecord(argsJson);
      toolStore.toolStarted({ callId, name, args });
      toolStore.toolProgress(callId, "Executing on server...");

      try {
        const response = await fetch("/api/tools", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            args,
            callId,
          }),
        });

        const payload = (await response.json()) as {
          ok: boolean;
          result?: Record<string, unknown>;
          error?: string;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Tool execution failed");
        }

        toolStore.toolCompleted(callId, payload.result ?? {});

        // Realtime necesita recibir el resultado como function_call_output para que
        // el modelo pueda continuar hablando con el contexto de la tool.
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(payload.result ?? {}),
          },
        });

        sendClientEvent({ type: "response.create" });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown tool error";

        toolStore.toolFailed(callId, errorMessage);

        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ ok: false, error: errorMessage }),
          },
        });

        sendClientEvent({ type: "response.create" });
      }
    },
    [sendClientEvent],
  );

  const handleServerEvent = useCallback(
    (rawEvent: RealtimeServerEvent) => {
      const bridgeStore = useVoiceBridgeStore.getState();

      // Reservamos la posicion de turnos de chat apenas Realtime crea el item.
      // Esto evita que una tool se renderice arriba del mensaje del usuario
      // cuando la transcripcion llega unos ms mas tarde.
      if (
        isConversationItemCreatedEvent(rawEvent) ||
        isConversationItemAddedEvent(rawEvent)
      ) {
        const item = rawEvent.item;
        if (
          item &&
          item.type === "message" &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.id === "string"
        ) {
          const role = item.role;
          const messageId = `rt-${role}-${item.id}`;
          const existing = bridgeStore.realtimeMessagesById[messageId];
          const extractedContent = extractConversationItemText(item);

          // No pisamos contenido existente con vacio si el item llego tarde/desfasado.
          if (existing?.content && !extractedContent) {
            return;
          }

          bridgeStore.upsertRealtimeMessage({
            messageId,
            role,
            content: extractedContent || existing?.content || "",
            finalized: existing?.finalized ?? false,
          });
        }
        return;
      }

      if (isInputAudioTranscriptionDeltaEvent(rawEvent)) {
        if (!rawEvent.delta) {
          return;
        }

        bridgeStore.appendRealtimeMessageDelta({
          messageId: `rt-user-${rawEvent.item_id}`,
          role: "user",
          delta: rawEvent.delta,
        });
        return;
      }

      // Cuando termina la transcripcion de un turno de voz del usuario, lo publicamos en el chat.
      if (isInputAudioTranscriptionCompletedEvent(rawEvent)) {
        const transcript = rawEvent.transcript.trim();
        const messageId = `rt-user-${rawEvent.item_id}`;
        const existingContent =
          bridgeStore.realtimeMessagesById[messageId]?.content ?? "";
        const content = transcript || existingContent;

        if (!content) {
          return;
        }

        bridgeStore.upsertRealtimeMessage({
          messageId,
          role: "user",
          content,
          finalized: true,
        });
        return;
      }

      // El asistente puede ir enviando deltas de transcripcion mientras habla.
      if (
        isResponseOutputAudioTranscriptDeltaEvent(rawEvent) ||
        isResponseAudioTranscriptDeltaEvent(rawEvent) ||
        isResponseOutputTextDeltaEvent(rawEvent)
      ) {
        const delta = rawEvent.delta;
        bridgeStore.appendRealtimeMessageDelta({
          messageId: `rt-assistant-${rawEvent.item_id}`,
          role: "assistant",
          delta,
        });
        return;
      }

      // Al cerrar la respuesta del asistente, marcamos el mensaje como finalizado.
      if (
        isResponseOutputAudioTranscriptDoneEvent(rawEvent) ||
        isResponseAudioTranscriptDoneEvent(rawEvent) ||
        isResponseOutputTextDoneEvent(rawEvent)
      ) {
        const messageId = `rt-assistant-${rawEvent.item_id}`;
        const finalTranscript = (
          "transcript" in rawEvent ? rawEvent.transcript : rawEvent.text
        ).trim();
        const existingContent =
          bridgeStore.realtimeMessagesById[messageId]?.content ?? "";
        const content = finalTranscript || existingContent;

        if (!content) {
          return;
        }

        bridgeStore.upsertRealtimeMessage({
          messageId,
          role: "assistant",
          content,
          finalized: true,
        });
        return;
      }

      // Algunas versiones/eventos de Realtime envuelven las function calls distinto.
      // Aceptamos ambos formatos para que el bridge sea tolerante a cambios menores.
      if (isFunctionCallDoneEvent(rawEvent)) {
        void handleToolCall(rawEvent.call_id, rawEvent.name, rawEvent.arguments);
        return;
      }

      if (isOutputItemFunctionCallDoneEvent(rawEvent)) {
        const item = rawEvent.item;
        if (
          item?.type === "function_call" &&
          typeof item.call_id === "string" &&
          typeof item.name === "string"
        ) {
          const argumentsJson =
            typeof item.arguments === "string" ? item.arguments : "{}";
          void handleToolCall(item.call_id, item.name, argumentsJson);
        }
        return;
      }

      switch (rawEvent.type) {
        case "session.created":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("listening", "session_connected");
          break;
        case "input_audio_buffer.speech_started":
          if (useVoiceBridgeStore.getState().connectionState === "speaking") {
            interruptAssistant("barge-in");
          }
          useVoiceBridgeStore
            .getState()
            .setConnectionState("listening", "user_speech_started");
          break;
        case "input_audio_buffer.speech_stopped":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("thinking", "user_speech_stopped");
          break;
        case "response.created":
          useVoiceBridgeStore.getState().setConnectionState("thinking");
          break;
        case "output_audio_buffer.started":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("speaking", "assistant_speaking_started");
          break;
        case "output_audio_buffer.stopped":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("listening", "assistant_speaking_stopped");
          break;
        case "output_audio_buffer.cleared":
          useVoiceBridgeStore
            .getState()
            .setConnectionState("interrupted", "assistant_interrupted", {
              reason: "output_audio_buffer.cleared",
            });
          break;
        case "error": {
          const maybeError =
            typeof rawEvent.error === "object" && rawEvent.error
              ? (rawEvent.error as { message?: string })
              : undefined;

          pushError(maybeError?.message ?? "Realtime session error");
          break;
        }
        default:
          break;
      }
    },
    [handleToolCall, interruptAssistant, pushError],
  );

  const stopVoiceMode = useCallback(() => {
    closeRealtimeResources();
    useVoiceBridgeStore.getState().setConnectionState("idle");
  }, [closeRealtimeResources]);

  const startVoiceMode = useCallback(async () => {
    if (activeRef.current) {
      return;
    }

    activeRef.current = true;
    useVoiceBridgeStore
      .getState()
      .setConnectionState("connecting", "session_connecting");

    try {
      const tokenResponse = await fetch("/api/realtime/session", {
        method: "POST",
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to bootstrap realtime session");
      }

      const tokenPayload =
        (await tokenResponse.json()) as SessionBootstrapResponse;
      const ephemeralToken = tokenPayload.clientSecret ?? tokenPayload.value;

      if (!ephemeralToken) {
        throw new Error("Realtime ephemeral token is missing");
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      const remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      // El track remoto trae la voz del asistente; no se guarda en CopilotChat.
      // CopilotKit sigue siendo solo la capa visual del chat.
      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          void remoteAudioRef.current.play().catch(() => {
            // Algunos navegadores bloquean autoplay hasta la primera interaccion.
          });
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });

      const dataChannel = peer.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      // El DataChannel es el canal de control: aqui llegan eventos de voz,
      // estados de respuesta y function calls, no audio.
      dataChannel.addEventListener("open", () => {
        setConnectionState("listening");
      });

      dataChannel.addEventListener("error", () => {
        pushError("Realtime data channel error");
      });

      dataChannel.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeServerEvent;
          handleServerEvent(parsed);
        } catch {
          pushError("Received malformed realtime event");
        }
      });

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected"
        ) {
          pushError(`Peer connection ${peer.connectionState}`);
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error("Missing SDP offer payload");
      }

      // Intercambio SDP navegador -> OpenAI Realtime.
      // El token efimero viene de nuestro backend; nunca usamos OPENAI_API_KEY aqui.
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`Realtime SDP negotiation failed: ${errorText}`);
      }

      const answerSdp = await sdpResponse.text();
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown voice startup error";
      pushError(message);
      closeRealtimeResources();
    }
  }, [closeRealtimeResources, handleServerEvent, pushError, setConnectionState]);

  return {
    isVoiceMode: connectionState !== "idle",
    connectionState,
    startVoiceMode,
    stopVoiceMode,
    interruptAssistant,
  };
};
