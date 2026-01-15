import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { transformStream } from "@crayonai/stream";
import { DBMessage, getMessageStore } from "../services/messageStore.js";
import { tools } from "../services/tools.js";

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

// System prompt for leverage loops that includes summary generation
const LEVERAGE_LOOP_SYSTEM_PROMPT = `You are a concise AI assistant for Orbiter helping users with leverage loops.

CRITICAL RULES - Follow these strictly:
1. Keep responses SHORT (2-4 sentences max for simple questions).
2. Use ONLY plain markdown: headers, bold, bullet lists, links.
3. NEVER use these components: Chart, Graph, Table, Tabs, Carousel, Accordion, Timeline, Layout, Section, DataTable, Kanban, Calendar.
4. For data, use simple bullet points - never tables or charts.
5. Avoid nested structures or complex formatting.
6. Get straight to the point - no unnecessary preamble.

IMPORTANT - SUMMARY REQUIREMENT:
At the END of EVERY response, you MUST include a brief conversation summary in this exact format:
[SUMMARY]A 2-3 sentence summary of what the user wants to accomplish in this conversation and how we can help them achieve it. Do not include extra details about the user
since we already know who they are.[/SUMMARY]

The summary should capture the user's main goal or request. Update the summary as the conversation progresses to reflect the current understanding of what the user wants help with.

Example response format:
Here are some people I can help you connect with...

[SUMMARY]User wants to find people to introduce to John Smith for business development opportunities.[/SUMMARY]

Be helpful but brief.`;

router.post("/", async (req: Request, res: Response) => {
  try {
    const { prompt, threadId, responseId, context } = req.body as {
      prompt: DBMessage;
      threadId: string;
      responseId: string;
      context?: string;
    };



    const client = new OpenAI({
      baseURL: "https://api.thesys.dev/v1/embed/",
      apiKey: process.env.THESYS_API_KEY,
    });

    const messageStore = getMessageStore(threadId);

    // Add appropriate system prompt if this is a new conversation

    if (messageStore.getOpenAICompatibleMessageList().length === 0) {
      // Use leverage loop prompt for leverage-loops context to include summary generation
      const systemPrompt = context === "leverage-loops" ?  LEVERAGE_LOOP_SYSTEM_PROMPT : SYSTEM_PROMPT;
      messageStore.addMessage({
        role: "system",
        content: systemPrompt,
      });

    }

    messageStore.addMessage(prompt);

    
    // Call C1 API - using prompt-based component restrictions for simplicity
    const llmStream = await client.beta.chat.completions.runTools({
      model: "c1/anthropic/claude-sonnet-4/v-20251230",
      temperature: 0.8, // Lower temperature for faster, more predictable responses
      messages: messageStore.getOpenAICompatibleMessageList(),
      stream: true,
      tool_choice: tools.length > 0 ? "auto" : "none",
      tools,
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
