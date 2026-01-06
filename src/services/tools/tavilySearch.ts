import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import type { RunnableToolFunctionWithParse } from "openai/lib/RunnableFunction.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tavily, TavilyClient } from "@tavily/core";

// Lazy-initialize Tavily client
let tavilyClient: TavilyClient | null = null;

function getTavilyClient(): TavilyClient {
  if (!tavilyClient) {
    if (!process.env.TAVILY_API_KEY) {
      throw new Error("TAVILY_API_KEY environment variable is not set");
    }
    tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }
  return tavilyClient;
}

/**
 * Tavily web search tool for OpenAI
 * Recommended by Thesys for API tool calling integration
 */
export const tavilySearchTool: RunnableToolFunctionWithParse<{
  searchQuery: string;
}> = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for a given query. Use this tool when you need the most current information from the internet, " +
      "such as breaking news, recent articles, product updates, company information, or the latest documentation. " +
      "Returns detailed search results including titles, URLs, and content snippets.",
    parse: (input) => {
      return JSON.parse(input) as { searchQuery: string };
    },
    parameters: zodToJsonSchema(
      z.object({
        searchQuery: z.string().describe("The search query to look up on the web"),
      })
    ) as JSONSchema,
    function: async ({ searchQuery }: { searchQuery: string }) => {
      try {
        const client = getTavilyClient();
        const results = await client.search(searchQuery, {
          maxResults: 5,
        });

        return JSON.stringify(results);
      } catch (error) {
        console.error("Tavily search error:", error);
        return JSON.stringify({
          error: "Failed to perform web search",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    strict: true,
  },
};

