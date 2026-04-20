import type { Action, Parameter } from "@copilotkit/shared";
import { z } from "zod";

// Este archivo es la fuente unica de verdad de tools:
// define el contrato que ve Realtime, el contrato que ve CopilotKit y la ejecucion real.
export type ServerToolName =
  | "lookup_weather"
  | "lookup_population"
  | "create_task";

type ToolSpec = {
  name: ServerToolName;
  description: string;
  // JSON Schema usado por OpenAI Realtime al decidir si llama una function.
  realtimeParameters: Record<string, unknown>;
  // Formato de parametros que espera CopilotKit para exponer actions de texto.
  copilotParameters: Parameter[];
};

const weatherArgsSchema = z.object({
  location: z.string().min(1),
  unit: z.enum(["c", "f"]).default("c"),
});

const populationArgsSchema = z.object({
  location: z.string().min(1),
  country: z.string().min(1).optional(),
});

const createTaskArgsSchema = z.object({
  title: z.string().min(1),
  dueDate: z.string().optional(),
});

const taskMemory: Array<{ id: string; title: string; dueDate?: string }> = [];

type GeocodingResult = {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  population?: number;
};

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    population?: number;
  }>;
};

type OpenMeteoWeatherResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const WEATHER_SUMMARY_BY_CODE: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
};

const fetchJson = async <T>(url: string, timeoutMs = 8000): Promise<T> => {
  // AbortController evita que una API externa lenta bloquee toda la respuesta.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`HTTP ${response.status}: ${message}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeCityName = (value: string): string => value.trim().toLowerCase();

const findBestLocation = (
  results: GeocodingResult[],
  cityName: string,
  country?: string,
): GeocodingResult | undefined => {
  const normalizedCity = normalizeCityName(cityName);
  const normalizedCountry = country ? normalizeCityName(country) : null;

  // Priorizamos coincidencia exacta por ciudad y pais cuando se provee pais.
  const exact = results.find((result) => {
    const sameCity = normalizeCityName(result.name) === normalizedCity;
    if (!sameCity) {
      return false;
    }

    if (!normalizedCountry) {
      return true;
    }

    const resultCountry = result.country ? normalizeCityName(result.country) : "";
    return resultCountry === normalizedCountry;
  });

  if (exact) {
    return exact;
  }

  // Si no hay exacta, hacemos match flexible por ciudad.
  return results.find((result) =>
    normalizeCityName(result.name).includes(normalizedCity),
  );
};

const geocodeCity = async (
  cityName: string,
  country?: string,
): Promise<GeocodingResult> => {
  const query = country ? `${cityName}, ${country}` : cityName;
  const url =
    `${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(query)}` +
    "&count=10&language=en&format=json";

  const payload = await fetchJson<OpenMeteoGeocodingResponse>(url);
  const candidates = (payload.results ?? [])
    .filter(
      (result): result is Required<Pick<GeocodingResult, "name" | "latitude" | "longitude">> &
        Pick<GeocodingResult, "country" | "population"> =>
        typeof result.name === "string" &&
        typeof result.latitude === "number" &&
        typeof result.longitude === "number",
    )
    .map((result) => ({
      name: result.name,
      country: result.country,
      latitude: result.latitude,
      longitude: result.longitude,
      population: result.population,
    }));

  if (candidates.length === 0) {
    throw new Error(`No se encontro la ciudad: ${cityName}`);
  }

  const best = findBestLocation(candidates, cityName, country) ?? candidates[0];
  return best;
};

const TOOL_SPECS: ToolSpec[] = [
  {
    name: "lookup_weather",
    description:
      "Get a quick weather snapshot for a city. Useful before giving travel or outfit advice.",
    realtimeParameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        location: {
          type: "string",
          description: "City or place name, for example Lima or New York.",
        },
        unit: {
          type: "string",
          enum: ["c", "f"],
          description: "Temperature unit. Use c for Celsius or f for Fahrenheit.",
        },
      },
      required: ["location"],
    },
    copilotParameters: [
      {
        name: "location",
        description: "City or place name",
        type: "string",
        required: true,
      },
      {
        name: "unit",
        description: "Temperature unit: c or f",
        type: "string",
        required: false,
        enum: ["c", "f"],
      },
    ],
  },
  {
    name: "lookup_population",
    description:
      "Get a population estimate for a city. Useful for travel, comparison, and city context.",
    realtimeParameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        location: {
          type: "string",
          description: "City name, for example Lima or Tokyo.",
        },
        country: {
          type: "string",
          description: "Optional country name to disambiguate the city.",
        },
      },
      required: ["location"],
    },
    copilotParameters: [
      {
        name: "location",
        description: "City name",
        type: "string",
        required: true,
      },
      {
        name: "country",
        description: "Optional country name",
        type: "string",
        required: false,
      },
    ],
  },
  {
    name: "create_task",
    description:
      "Create a lightweight task/reminder for the user. Use when they ask to remember or track something.",
    realtimeParameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "Task title in plain language.",
        },
        dueDate: {
          type: "string",
          description: "Optional due date in ISO format, for example 2026-04-20.",
        },
      },
      required: ["title"],
    },
    copilotParameters: [
      {
        name: "title",
        description: "Task title",
        type: "string",
        required: true,
      },
      {
        name: "dueDate",
        description: "Optional due date",
        type: "string",
        required: false,
      },
    ],
  },
];

// Realtime necesita tools como JSON Schema dentro de la configuracion de sesion.
export const getRealtimeToolDefinitions = (): Array<Record<string, unknown>> =>
  TOOL_SPECS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.realtimeParameters,
  }));

// CopilotKit runtime usa el mismo catalogo, pero con handler server-side.
export const getCopilotRuntimeActions = (): Array<Action<Parameter[]>> =>
  TOOL_SPECS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.copilotParameters,
    handler: async (args: Record<string, unknown>) =>
      executeServerTool(tool.name, args),
  }));

export const executeServerTool = async (
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  // Cada branch valida sus argumentos con zod antes de ejecutar logica.
  if (name === "lookup_weather") {
    const args = weatherArgsSchema.parse(rawArgs);
    const city = await geocodeCity(args.location);
    const weatherUrl =
      `${OPEN_METEO_FORECAST_URL}?latitude=${city.latitude}&longitude=${city.longitude}` +
      "&current=temperature_2m,weather_code&timezone=auto";
    const weatherPayload = await fetchJson<OpenMeteoWeatherResponse>(weatherUrl);

    const temperatureC = weatherPayload.current?.temperature_2m;
    if (typeof temperatureC !== "number" || Number.isNaN(temperatureC)) {
      throw new Error(`No se pudo obtener temperatura para ${args.location}`);
    }

    const weatherCode = weatherPayload.current?.weather_code;
    const summary =
      typeof weatherCode === "number"
        ? (WEATHER_SUMMARY_BY_CODE[weatherCode] ?? `Weather code ${weatherCode}`)
        : "Unknown conditions";
    const displayTemp =
      args.unit === "f"
        ? Math.round((temperatureC * 9) / 5 + 32)
        : Math.round(temperatureC);

    return {
      ok: true,
      location: city.name,
      country: city.country ?? "Unknown",
      unit: args.unit,
      temperature: displayTemp,
      summary,
      weatherCode: typeof weatherCode === "number" ? weatherCode : null,
      source: "open-meteo",
      coordinates: {
        latitude: city.latitude,
        longitude: city.longitude,
      },
      retrievedAt: new Date().toISOString(),
    };
  }

  if (name === "lookup_population") {
    const args = populationArgsSchema.parse(rawArgs);
    const city = await geocodeCity(args.location, args.country);
    if (typeof city.population !== "number" || Number.isNaN(city.population)) {
      throw new Error(
        `La fuente externa no reporto poblacion para ${city.name}`,
      );
    }

    const population = city.population;
    const formattedPopulation = new Intl.NumberFormat("en-US").format(population);

    return {
      ok: true,
      location: city.name,
      country: city.country ?? args.country ?? "Unknown",
      population,
      formattedPopulation,
      scope: "city_geocoding_population",
      source: "open-meteo-geocoding",
      isEstimate: false,
      coordinates: {
        latitude: city.latitude,
        longitude: city.longitude,
      },
      retrievedAt: new Date().toISOString(),
    };
  }

  if (name === "create_task") {
    const args = createTaskArgsSchema.parse(rawArgs);
    const task = {
      id: `task_${Date.now()}`,
      title: args.title,
      dueDate: args.dueDate,
    };

    taskMemory.push(task);

    return {
      ok: true,
      task,
      totalTasksInSession: taskMemory.length,
      createdAt: new Date().toISOString(),
    };
  }

  throw new Error(`Unknown tool: ${name}`);
};
