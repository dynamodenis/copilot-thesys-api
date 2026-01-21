import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type OpenAI from "openai";
import type { FunctionParameters } from "openai/resources/shared.js";

/**
 * Xano MCP Client
 * Connects to a Xano-hosted MCP server via Streamable HTTP transport (new MCP protocol)
 */
export class XanoMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private mcpUrl: string;
  public tools: OpenAI.ChatCompletionTool[] = [];
  private connected: boolean = false;

  constructor(mcpUrl: string) {
    this.mcpUrl = mcpUrl;
    this.client = new Client({
      name: "orbiter-copilot-mcp-client",
      version: "1.0.0",
    });
  }

  /**
   * Connect to the Xano MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      console.log("MCP client already connected");
      return;
    }

    try {
      // console.log(`Connecting to Xano MCP server at: ${this.mcpUrl}`);

      // Create Streamable HTTP transport (new MCP protocol, replaces SSE)
      this.transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl));

      // Connect to the MCP server
      await this.client.connect(this.transport);

      // List available tools from the MCP server
      const toolsResult = await this.client.listTools();
      
      // console.log(`Found ${toolsResult.tools.length} tools from Xano MCP:`);
      
      // Convert MCP tools to OpenAI-compatible format
      this.tools = toolsResult.tools.map((tool) => {
        console.log(`  - ${tool.name}: ${tool.description}`);
        return {
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description || "",
            parameters: tool.inputSchema as FunctionParameters,
          },
        };
      });

      this.connected = true;
      console.log("Successfully connected to Xano MCP server");
    } catch (error) {
      console.error("Failed to connect to Xano MCP server:", error);
      throw error;
    }
  }

  /**
   * Run a tool from the MCP server
   */
  async runTool({
    tool_call_id,
    name,
    args,
  }: {
    tool_call_id: string;
    name: string;
    args: Record<string, unknown>;
  }): Promise<{ tool_call_id: string; role: "tool"; content: string }> {
    console.log(`Calling MCP tool "${name}" with args:`, JSON.stringify(args));

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      console.log(`Tool "${name}" result:`, result);

      return {
        tool_call_id,
        role: "tool" as const,
        content: JSON.stringify(result.content),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error calling tool "${name}":`, error);

      return {
        tool_call_id,
        role: "tool" as const,
        content: JSON.stringify({
          error: `Tool call failed: ${errorMessage}`,
        }),
      };
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.connected = false;
      console.log("Disconnected from Xano MCP server");
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance for the Xano MCP client
let xanoMcpClient: XanoMcpClient | null = null;

/**
 * Get or create the Xano MCP client instance
 */
export function getXanoMcpClient(): XanoMcpClient {
  if (!xanoMcpClient) {
    const mcpUrl = process.env.XANO_MCP_URL;
    if (!mcpUrl) {
      throw new Error("XANO_MCP_URL environment variable is not set");
    }
    xanoMcpClient = new XanoMcpClient(mcpUrl);
  }
  return xanoMcpClient;
}

/**
 * Ensure the MCP client is connected
 */
export async function ensureXanoMcpConnection(): Promise<XanoMcpClient> {
  const client = getXanoMcpClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  return client;
}

