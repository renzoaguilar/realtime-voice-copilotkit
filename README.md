# Realtime Voice + CopilotKit

Proyecto de referencia para integrar:

- **OpenAI Realtime** como capa de audio bidireccional en tiempo real.
- **CopilotKit** como capa de chat visual y renderizado de tools/actions.
- Un **puente** para sincronizar tool calls de voz en la UI del chat.

El objetivo principal es mantener **una sola ejecucion real de tools**, mientras la conversacion por voz continua con baja latencia y el usuario ve el estado de acciones en el chat.

## Objetivos funcionales

- Usuario habla y asistente responde por voz en tiempo real.
- Modo voz opcional (activar/desactivar).
- Interrupcion inmediata (barge-in) cuando el usuario vuelve a hablar.
- Chat de texto sigue funcionando.
- Cuando una tool se dispara desde Realtime, aparece en CopilotChat con estado y resultado.

## Tecnologias principales

- Next.js (App Router) + TypeScript estricto
- React 19
- OpenAI SDK (`openai`) para session bootstrap Realtime
- CopilotKit (`@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/runtime`)
- Zustand para estado del puente
- Zod para validacion de payloads y args de tools

## Variables de entorno

Crear `.env.local` en la raiz:

```bash
OPENAI_API_KEY=<SECRET>
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
COPILOTKIT_TEXT_MODEL=gpt-4o-mini
NEXT_PUBLIC_APP_TITLE=Realtime Voice + CopilotKit
```

Base de referencia: [`.env.example`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/.env.example)

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Arquitectura (vision general)

1. **Capa de voz realtime (frontend)**
- Hook principal: [`useRealtimeVoiceSession.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/hooks/useRealtimeVoiceSession.ts)
- Abre WebRTC + DataChannel con OpenAI Realtime.
- Recibe eventos de voz y tool calls.
- Ejecuta interrupcion (barge-in) con `response.cancel` y `output_audio_buffer.clear`.

2. **Capa de backend seguro**
- Session bootstrap: [`/api/realtime/session`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/app/api/realtime/session/route.ts)
- Ejecucion de tools: [`/api/tools`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/app/api/tools/route.ts)
- Registro unico de tools: [`lib/server/tools.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/lib/server/tools.ts)
- Cliente OpenAI server-only: [`lib/server/openai.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/lib/server/openai.ts)

3. **Capa de chat visual**
- Provider CopilotKit: [`app/providers.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/app/providers.tsx)
- Chat principal: [`CopilotChatShell.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/components/CopilotChatShell.tsx)
- Runtime textual: [`/api/copilotkit`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/app/api/copilotkit/route.ts)
- Cards de acciones:
  - Clima: [`WeatherToolCard.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/components/WeatherToolCard.tsx)
  - Poblacion: [`PopulationToolCard.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/components/PopulationToolCard.tsx)
  - Renderer generico: [`ToolInvocationCard.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/components/ToolInvocationCard.tsx)

4. **Puente Realtime -> CopilotChat**
- Estado/eventos/tools en store: [`voice-bridge-store.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/store/voice-bridge-store.ts)
- Tipos de estado: [`lib/realtime/types.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/lib/realtime/types.ts)
- Sincronizacion de mensajes: [`RealtimeCopilotBridge.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/components/RealtimeCopilotBridge.tsx)

## Flujo de punta a punta

1. El usuario activa modo voz.
2. Frontend solicita token efimero a `/api/realtime/session`.
3. Se negocia WebRTC contra `https://api.openai.com/v1/realtime/calls`.
4. El usuario habla; Realtime procesa audio con VAD server-side.
5. Si el modelo llama una tool:
- Frontend detecta evento de function call.
- Frontend llama `/api/tools`.
- Backend ejecuta tool una sola vez (`executeServerTool`).
- Frontend envia `function_call_output` a Realtime.
- El asistente continua la respuesta por voz con ese resultado.
6. El store registra `tool_started`, `tool_progress`, `tool_completed` o `tool_failed`.
7. `RealtimeCopilotBridge` inyecta mensajes sinteticos para que CopilotChat renderice la accion en UI.

## Estados y eventos que maneja el sistema

Estados de sesion:
- `idle`
- `connecting`
- `listening`
- `thinking`
- `speaking`
- `interrupted`
- `error`

Eventos:
- `session_connecting`
- `session_connected`
- `user_speech_started`
- `user_speech_stopped`
- `assistant_speaking_started`
- `assistant_speaking_stopped`
- `assistant_interrupted`
- `tool_started`
- `tool_progress`
- `tool_completed`
- `tool_failed`
- `error`

## Herramientas actuales

Definidas en [`lib/server/tools.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/lib/server/tools.ts):

- `lookup_weather`
- `lookup_population`
- `create_task`

Notas:
- `lookup_weather` y `lookup_population` usan dataset/simulacion de demo.
- `create_task` guarda en memoria de proceso (sin persistencia de base de datos).

## Guia rapida para nuevos desarrolladores

1. Leer primero:
- [`hooks/useRealtimeVoiceSession.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/hooks/useRealtimeVoiceSession.ts)
- [`components/RealtimeCopilotBridge.tsx`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/components/RealtimeCopilotBridge.tsx)
- [`lib/server/tools.ts`](/Users/renzo/Desktop/AGENTIC-UI/realtime-voice-copilotkit/lib/server/tools.ts)

2. Agregar una nueva tool:
- Definir contrato + ejecucion en `lib/server/tools.ts`.
- Crear card UI (opcional) en `components/*ToolCard.tsx`.
- Registrar renderer en `CopilotChatShell.tsx` con `useCopilotAction`.
- Probar por texto y por voz.

3. Revisar compatibilidad:
- `npm run lint`
- `npm run build`

## Como probar localmente

1. `npm install`
2. Configurar `.env.local`
3. `npm run dev`
4. Abrir `http://localhost:3000`
5. Probar chat de texto
6. Activar voz y dar permisos de microfono
7. Probar prompts:
- "Que clima hace en Lima?"
- "Cual es la poblacion de Tokyo?"
- "Crea una tarea para maniana"

## Limitaciones actuales

- El bridge usa mensajes sinteticos para reflejar tools en chat. Funciona bien, pero agrega ruido tecnico al historial.
- No hay canal sideband server-to-server para observabilidad fina de sesiones realtime.
- Tools demo sin integraciones reales externas (clima/poblacion).
- Sin tests E2E de audio/barge-in en esta version.
- `create_task` no persiste entre reinicios del servidor.

## Siguientes pasos recomendados

1. Conectar tools a servicios reales y persistencia.
2. Agregar auth por usuario para tools y sesiones.
3. Implementar trazas y auditoria de tool calls.
4. Mejorar bridge para separar mejor contexto conversacional vs mensajes tecnicos.
5. Agregar tests:
- unitarios para `lib/server/tools.ts`
- integracion para `/api/realtime/session` y `/api/tools`
- E2E para flujo de voz e interrupcion

## Resolucion de problemas

- **500 en `/api/realtime/session`**:
  - validar `OPENAI_API_KEY`
  - validar `expires_after.anchor = "created_at"` en payload de client secret

- **No se oye audio del asistente**:
  - revisar permisos de microfono
  - revisar politicas de autoplay del navegador

- **No aparece la card de una tool**:
  - confirmar nombre de tool y renderer `useCopilotAction`
  - confirmar que `RealtimeCopilotBridge` este montado en `CopilotChatShell`

