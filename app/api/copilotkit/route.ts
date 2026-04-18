import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { getOpenAIClient } from "@/lib/server/openai";
import { getCopilotRuntimeActions } from "@/lib/server/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runtimeInstance = new CopilotRuntime({
  actions: getCopilotRuntimeActions(),
});

const handler = async (request: Request): Promise<Response> => {
  const serviceAdapter = new OpenAIAdapter({
    openai: getOpenAIClient(),
    model: process.env.COPILOTKIT_TEXT_MODEL ?? "gpt-4o-mini",
    disableParallelToolCalls: true,
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(request);
};

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
