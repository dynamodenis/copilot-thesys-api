import type { RunnableToolFunctionWithParse } from "openai/lib/RunnableFunction.mjs";
import type { RunnableToolFunctionWithoutParse } from "openai/lib/RunnableFunction.mjs";
import { tavilySearchTool } from "./tools/tavilySearch.js";
import { weatherTool } from "./tools/weather.js";

/**
 * Collection of tools available to the AI agent.
 * Each tool is a function that the AI can use to perform specific tasks.
 *
 * Current tools:
 * - tavilySearchTool: Web search powered by Tavily (recommended by Thesys)
 * - weatherTool: Fetches weather data for a given location
 *
 * ADD MORE TOOLS HERE TO EXTEND THE AI'S CAPABILITIES
 */

export const tools: (
  | RunnableToolFunctionWithoutParse
  | RunnableToolFunctionWithParse<{ searchQuery: string }>
  | RunnableToolFunctionWithParse<{ location: string }>
)[] = [tavilySearchTool, weatherTool];

