# Orbiter Copilot Server

A Node.js backend server for an AI-powered copilot that supports streaming chat completions with tool calling capabilities.

## Features

- 🤖 **Streaming Chat API** - Real-time streaming responses using Server-Sent Events (SSE)
- 🔧 **Tool Calling** - Extensible tool system for AI agent capabilities
- 🔍 **Web Search** - Tavily-powered web search integration
- 🌤️ **Weather Tool** - Real-time weather data via Open-Meteo API
- 💬 **Conversation Memory** - Per-thread message history management

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **AI Provider**: Thesys API (OpenAI-compatible)
- **Stream Processing**: [@crayonai/stream](https://www.npmjs.com/package/@crayonai/stream)
- **Schema Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3001
THESYS_API_KEY=your_thesys_api_key
TAVILY_API_KEY=your_tavily_api_key
```

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `THESYS_API_KEY` | API key for Thesys | Yes |
| `TAVILY_API_KEY` | API key for Tavily web search | Yes (for search) |

### Running the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server status.

**Response:**
```json
{ "status": "ok" }
```

### Chat

```
POST /api/chat
```

Send a message and receive a streaming AI response.

**Request Body:**
```json
{
  "prompt": {
    "role": "user",
    "content": "Hello, how are you?",
    "id": "msg_123"
  },
  "threadId": "thread_abc",
  "responseId": "response_456"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | object | The message object with role, content, and optional id |
| `threadId` | string | Unique identifier for the conversation thread |
| `responseId` | string | Unique identifier for the assistant's response |

**Response:** Server-Sent Events stream with AI response chunks.

## Available Tools

The AI can use the following tools during conversations:

### Web Search (`web_search`)
Search the web using Tavily for current information, news, and documentation.

### Weather (`weather`)
Get current weather conditions for any location using Open-Meteo API.

## Adding Custom Tools

To add a new tool, create a file in `src/services/tools/` and register it in `src/services/tools.ts`:

```typescript
// src/services/tools/myTool.ts
import type { RunnableToolFunctionWithParse } from "openai/lib/RunnableFunction.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const myTool: RunnableToolFunctionWithParse<{ param: string }> = {
  type: "function",
  function: {
    name: "my_tool",
    description: "Description of what the tool does",
    parse: (input) => JSON.parse(input) as { param: string },
    parameters: zodToJsonSchema(
      z.object({
        param: z.string().describe("Parameter description"),
      })
    ),
    function: async ({ param }) => {
      // Tool implementation
      return "result";
    },
    strict: true,
  },
};
```

Then add it to the tools array in `src/services/tools.ts`.

## Project Structure

```
src/
├── index.ts              # Express server entry point
├── routes/
│   └── chat.ts           # Chat API route handler
└── services/
    ├── messageStore.ts   # In-memory conversation storage
    ├── tools.ts          # Tool registry
    └── tools/
        ├── tavilySearch.ts  # Web search tool
        └── weather.ts       # Weather tool
```

## License

Private

