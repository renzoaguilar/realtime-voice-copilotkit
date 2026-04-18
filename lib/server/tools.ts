import type { Action, Parameter } from "@copilotkit/shared";
import { z } from "zod";

export type ServerToolName =
  | "lookup_weather"
  | "lookup_population"
  | "create_task";

type ToolSpec = {
  name: ServerToolName;
  description: string;
  realtimeParameters: Record<string, unknown>;
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

const weatherSummaryByBucket = [
  "Sunny",
  "Partly cloudy",
  "Breezy",
  "Misty",
  "Light rain",
  "Overcast",
];

const populationDataset: Record<
  string,
  { country: string; population: number; scope: "urban_agglomeration_estimate" }
> = {
  lima: {
    country: "Peru",
    population: 11100000,
    scope: "urban_agglomeration_estimate",
  },
  "mexico city": {
    country: "Mexico",
    population: 22500000,
    scope: "urban_agglomeration_estimate",
  },
  bogota: {
    country: "Colombia",
    population: 11600000,
    scope: "urban_agglomeration_estimate",
  },
  "buenos aires": {
    country: "Argentina",
    population: 15600000,
    scope: "urban_agglomeration_estimate",
  },
  "new york": {
    country: "United States",
    population: 19300000,
    scope: "urban_agglomeration_estimate",
  },
  "sao paulo": {
    country: "Brazil",
    population: 22100000,
    scope: "urban_agglomeration_estimate",
  },
  madrid: {
    country: "Spain",
    population: 6800000,
    scope: "urban_agglomeration_estimate",
  },
  barcelona: {
    country: "Spain",
    population: 5600000,
    scope: "urban_agglomeration_estimate",
  },
  paris: {
    country: "France",
    population: 11100000,
    scope: "urban_agglomeration_estimate",
  },
  tokyo: {
    country: "Japan",
    population: 37100000,
    scope: "urban_agglomeration_estimate",
  },
};

const taskMemory: Array<{ id: string; title: string; dueDate?: string }> = [];

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
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

export const getRealtimeToolDefinitions = (): Array<Record<string, unknown>> =>
  TOOL_SPECS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.realtimeParameters,
  }));

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
  if (name === "lookup_weather") {
    const args = weatherArgsSchema.parse(rawArgs);
    const bucket = hashString(args.location) % weatherSummaryByBucket.length;
    const tempCelsius = 14 + (hashString(`${args.location}-temp`) % 17);
    const displayTemp =
      args.unit === "f" ? Math.round((tempCelsius * 9) / 5 + 32) : tempCelsius;

    return {
      ok: true,
      location: args.location,
      unit: args.unit,
      temperature: displayTemp,
      summary: weatherSummaryByBucket[bucket],
      source: "demo-weather-simulation",
      retrievedAt: new Date().toISOString(),
    };
  }

  if (name === "lookup_population") {
    const args = populationArgsSchema.parse(rawArgs);
    const key = args.location.trim().toLowerCase();
    const knownPopulation = populationDataset[key];
    const fallbackPopulation = 150000 + (hashString(`${args.location}-pop`) % 21000000);
    const population = knownPopulation?.population ?? fallbackPopulation;
    const formattedPopulation = new Intl.NumberFormat("en-US").format(population);

    return {
      ok: true,
      location: args.location,
      country: knownPopulation?.country ?? args.country ?? "Unknown",
      population,
      formattedPopulation,
      scope: knownPopulation?.scope ?? "simulated_city_estimate",
      source: knownPopulation
        ? "demo-population-dataset"
        : "demo-population-simulation",
      isEstimate: true,
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
