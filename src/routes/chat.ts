import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { transformStream } from "@crayonai/stream";
import { DBMessage, getMessageStore } from "../services/messageStore.js";
import { tools } from "../services/tools.js";
import { ensureXanoMcpConnection } from "../services/mcp/xanoMcpClient.js";
import type { JSONSchema } from "openai/lib/jsonschema.mjs";

const router = Router();

// System prompt optimized for fast, simple UI generation
const SYSTEM_PROMPT = `You are a concise AI assistant for Orbiter.

CRITICAL RULES - Follow these strictly:
1. Keep responses SHORT (2-4 sentences max for simple questions).
2. Use ONLY plain markdown: headers, bold, bullet lists, links.
3. NEVER use these components: Chart, Graph, Table, Tabs, Carousel, Accordion, Timeline, Layout, Section, DataTable, Kanban, Calendar.
4. For data, use simple bullet points - never tables or charts.
5. Avoid nested structures or complex formatting.
6. Get straight to the point - no unnecessary preamble.

You may use: simple text, headers, bullet lists, numbered lists, bold, links.
Be helpful but brief.`;

// Base system prompt for leverage loops/outcomes
const LEVERAGE_LOOP_OUTCOME_BASE_PROMPT = `You are a concise AI assistant for Orbiter helping users with leverage loops or outcomes provided to attain certain goals.

CRITICAL RULES - Follow these strictly:
1. Keep responses SHORT (2-4 sentences max for simple questions).
2. Use ONLY plain markdown: headers, bold, bullet lists, links.
3. NEVER use these components: Chart, Graph, Table, Tabs, Carousel, Accordion, Timeline, Layout, Section, DataTable, Kanban, Calendar.
4. For data, use simple bullet points - never tables or charts.
5. Avoid nested structures or complex formatting.
6. Get straight to the point - no unnecessary preamble.

IMPORTANT - SUMMARY REQUIREMENT:
At the END of EVERY response, you MUST include a brief conversation summary in this exact format:
[SUMMARY]A 2-3 sentence summary of what the user wants to accomplish in this conversation and how we can help them achieve it.[/SUMMARY]

Be helpful but brief.`;

// Function to build system prompt with first-message tool instructions
function buildLeverageLoopOutcomePrompt(
  isFirstMessage: boolean,
  copilotMode: "loop" | "outcome",
  userId?: string,
  masterPersonId?: string
): string {
  let prompt = LEVERAGE_LOOP_OUTCOME_BASE_PROMPT;

  if (isFirstMessage && userId) {
    prompt += `

FIRST MESSAGE - REQUIRED ACTION:
This is the user's FIRST message. You MUST call the create_suggestion_request tool IMMEDIATELY with:
- user_id: "${userId}"
- master_person_id: ${masterPersonId ? `"${masterPersonId}"` : "null"}
- copilot_mode: "${copilotMode}"
- request_panel_title: Use the user's message (first 100 characters)
- request_header_title: Use the user's full message as the title

IMPORTANT - TOOL RESULT REQUIREMENT:
After calling the tool successfully, you MUST include the COMPLETE tool result JSON in your response using this exact format:
[SUGGESTION_REQUEST]<paste the entire JSON object returned by the tool here>[/SUGGESTION_REQUEST]

Do NOT extract or modify the result - include the complete JSON as returned by the tool.

CRITICAL - GENUI JSON FORMAT:
When generating GenUI components inside <content thesys="true"> tags, the JSON must start IMMEDIATELY after the opening tag. Do NOT include any conversational text, preamble, or explanation inside the content tags. Only valid JSON is allowed inside <content thesys="true">...</content>.`;
  }

  return prompt;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const { prompt, threadId, responseId, context, user_id, master_person_id, dataSource } = req.body as {
      prompt: DBMessage;
      threadId: string;
      responseId: string;
      context?: string;
      user_id?: string;
      master_person_id?: string;
      dataSource?: string;
    };

    // Get auth token from request headers (forwarded from frontend)
    const authToken = req.headers.authorization?.replace('Bearer ', '');

    const client = new OpenAI({
      baseURL: "https://api.thesys.dev/v1/embed/",
      apiKey: process.env.THESYS_API_KEY,
    });

    const messageStore = getMessageStore(threadId);

    // Check if this is the first message (empty message store = first message)
    const isFirstMessage = messageStore.getOpenAICompatibleMessageList().length === 0;

    // Add appropriate system prompt if this is a new conversation
    if (isFirstMessage) {
      let systemPrompt: string;
      
      if (context === "leverage-loops" || context === "outcomes") {
        // Build dynamic prompt with first-message tool instructions
        const copilotMode = context === "leverage-loops" ? "loop" : "outcome";
        systemPrompt = buildLeverageLoopOutcomePrompt(
          true, // isFirstMessage
          copilotMode,
          user_id,
          master_person_id
        );
      } else {
        systemPrompt = SYSTEM_PROMPT;
      }
      
      messageStore.addMessage({
        role: "system",
        content: systemPrompt,
      });
    }

    messageStore.addMessage(prompt);

    // Get MCP tools from Xano (if configured)
    let mcpTools: typeof tools = [];
    let mcpClient: Awaited<ReturnType<typeof ensureXanoMcpConnection>> | null = null;
    
    if (process.env.XANO_MCP_URL) {
      try {
        // Pass auth token and dataSource to MCP client for x-data-source header
        mcpClient = await ensureXanoMcpConnection(authToken, dataSource);
        // Convert MCP tools to runnable tools format
        mcpTools = mcpClient.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.function.name,
            description: tool.function.description || "",
            parameters: tool.function.parameters as JSONSchema,
            parse: JSON.parse,
            function: async (args: unknown) => {
              const result = await mcpClient!.runTool({
                tool_call_id: tool.function.name + Date.now().toString(),
                name: tool.function.name,
                args: args as Record<string, unknown>,
              });
              return result.content;
            },
            strict: true,
          },
        }));
      } catch (error) {
        console.error("Failed to load MCP tools:", error);
      }
    }

    // Combine existing tools with MCP tools
    // Filter out create_suggestion_request tool if not the first message (already created)
    let allTools = [...tools, ...mcpTools];
    
    if (!isFirstMessage) {
      // Remove create_suggestion_request from available tools since it was already called
      allTools = allTools.filter(tool => tool.function.name !== "create_suggestion_request");
    }
    
    // Call C1 API - using prompt-based component restrictions for simplicity
    const llmStream = await client.beta.chat.completions.runTools({
      model: "c1/anthropic/claude-sonnet-4/v-20251230",
      temperature: 0.8,
      messages: messageStore.getOpenAICompatibleMessageList(),
      stream: true,
      tool_choice: allTools.length > 0 ? "auto" : "none",
      tools: allTools,
    });

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const responseStream = transformStream(
      llmStream,
      (chunk) => {
        return chunk.choices?.[0]?.delta?.content ?? "";
      },
      {
        onEnd: ({ accumulated }) => {
          const message = accumulated.filter((msg) => msg).join("");
          messageStore.addMessage({
            role: "assistant",
            content: message,
            id: responseId,
          });
        },
      }
    );

    // Stream the response
    const reader = responseStream.getReader();
    const decoder = new TextDecoder();

    const streamToClient = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        const chunk = typeof value === "string" ? value : decoder.decode(value);
        res.write(chunk);
      }
    };

    await streamToClient();
  } catch (error) {
    console.error("Chat API error:", error);
    // Log more details for debugging
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export const chatRouter = router;
