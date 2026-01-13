import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { transformStream } from "@crayonai/stream";
import { DBMessage, getMessageStore } from "../services/messageStore.js";
import { tools } from "../services/tools.js";
import {
  CUSTOM_COMPONENT_SCHEMAS,
  CUSTOM_COMPONENTS_SYSTEM_PROMPT,
} from "../services/customComponents.js";

const router = Router();

// System prompt that guides the AI on how to behave
const SYSTEM_PROMPT = `You are a helpful AI assistant for Orbiter.

${CUSTOM_COMPONENTS_SYSTEM_PROMPT}

Be concise, helpful, and friendly in your responses.
`;

router.post("/", async (req: Request, res: Response) => {
  try {
    const { prompt, threadId, responseId } = req.body as {
      prompt: DBMessage;
      threadId: string;
      responseId: string;
    };

    const client = new OpenAI({
      baseURL: "https://api.thesys.dev/v1/embed/",
      apiKey: process.env.THESYS_API_KEY,
    });

    const messageStore = getMessageStore(threadId);

    // Add system prompt if this is a new conversation
    if (messageStore.getOpenAICompatibleMessageList().length === 0) {
      messageStore.addMessage({
        role: "system",
        content: SYSTEM_PROMPT,
      });
    }

    messageStore.addMessage(prompt);

    // Call C1 API with custom component schemas in metadata
    const llmStream = await client.beta.chat.completions.runTools({
      model: "c1/openai/gpt-5/v-20251230",
      temperature: 1,
      messages: messageStore.getOpenAICompatibleMessageList(),
      stream: true,
      tool_choice: tools.length > 0 ? "auto" : "none",
      tools,
      // // Pass custom component schemas to C1
      // // This tells C1 about the custom React components available on the frontend
      // metadata: {
      //   thesys: JSON.stringify({
      //     c1_custom_components: CUSTOM_COMPONENT_SCHEMAS,
      //   }),
      // },
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
    res.status(500).json({ error: "Internal server error" });
  }
});

export const chatRouter = router;
