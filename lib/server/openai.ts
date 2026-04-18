import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  if (!cachedClient) {
    // Reutiliza una instancia del SDK por proceso para evitar recreaciones.
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return cachedClient;
};
