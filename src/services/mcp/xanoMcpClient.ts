import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type OpenAI from "openai";
import type { FunctionParameters } from "openai/resources/shared.js";

export interface XanoMcpClientOptions {
  mcpUrl: string;
  authToken?: string;
  dataSource?: string;
}

/**
 * Xano MCP Client
 * Connects to a Xano-hosted MCP server via Streamable HTTP transport (new MCP protocol)
 */
export class XanoMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private mcpUrl: string;
  private authToken?: string;
  private dataSource?: string;
  public tools: OpenAI.ChatCompletionTool[] = [];
  private connected: boolean = false;

  constructor(options: XanoMcpClientOptions) {
    this.mcpUrl = options.mcpUrl;
    this.authToken = options.authToken;
    this.dataSource = options.dataSource;
    this.client = new Client({
      name: "orbiter-copilot-mcp-client",
      version: "1.0.0",
    });
  }

  /**
   * Update headers (e.g., when dataSource changes)
   */
  setHeaders(authToken?: string, dataSource?: string): void {
    this.authToken = authToken;
    this.dataSource = dataSource;
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
      // Build custom headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
      
      if (this.dataSource) {
        headers['x-data-source'] = this.dataSource;
      }

      // Create Streamable HTTP transport with custom headers
      this.transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
        requestInit: {
          headers,
        },
      });

      // Connect to the MCP server
      await this.client.connect(this.transport);

      // List available tools from the MCP server
      const toolsResult = await this.client.listTools();
      
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

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });


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
export function getXanoMcpClient(authToken?: string, dataSource?: string): XanoMcpClient {
  if (!xanoMcpClient) {
    const mcpUrl = process.env.XANO_MCP_URL;
    if (!mcpUrl) {
      throw new Error("XANO_MCP_URL environment variable is not set");
    }
    xanoMcpClient = new XanoMcpClient({
      mcpUrl,
      authToken,
      dataSource,
    });
  } else if (authToken || dataSource) {
    // Update headers if provided
    xanoMcpClient.setHeaders(authToken, dataSource);
  }
  return xanoMcpClient;
}

/**
 * Ensure the MCP client is connected
 */
export async function ensureXanoMcpConnection(authToken?: string, dataSource?: string): Promise<XanoMcpClient> {
  const client = getXanoMcpClient(authToken, dataSource);
  if (!client.isConnected()) {
    await client.connect();
  }
  return client;
}
