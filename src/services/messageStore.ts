import OpenAI from "openai";

export type DBMessage = OpenAI.Chat.ChatCompletionMessageParam & {
  id?: string;
};

const SYSTEM_PROMPT = `
You are a helpful and friendly AI assistant. Here are some rules you must follow:

Rules:
- Be concise, accurate, and helpful in your responses.
- Use the available tools (web search, weather) when you need current information.
- When using web search, provide sources for the information you find.
- Format your responses clearly using markdown when appropriate.
`;


const messagesStore: {
  [threadId: string]: DBMessage[];
} = {};

export const getMessageStore = (id: string) => {
  if (!messagesStore[id]) {
    messagesStore[id] = [{ role: "system", content: SYSTEM_PROMPT }];
  }
  const messageList = messagesStore[id];
  return {
    addMessage: (message: DBMessage) => {
      messageList.push(message);
    },
    messageList,
    getOpenAICompatibleMessageList: () => {
      return messageList.map((m) => {
        const message = {
          ...m,
        };
        delete message.id;
        return message;
      });
    },
  };
};

