import { tool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { router, userProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";

interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

interface FormattedMessage {
  role: "assistant" | "user" | "tool" | "system";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
// Schema definitions
const CreateConversationInput = z.object({
  title: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.trim().length > 0,
      "Title cannot be empty if provided",
    ),
});

const SendMessageInput = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1, "Content cannot be empty"),
});

const GetConversationInput = z.object({
  conversationId: z.string().uuid(),
});

// Message interface
interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
}

// AI Provider interface
interface AIProvider {
  init(): Promise<void>;
  generateResponse(
    messages: Message[],
    userContext?: { id: string; email?: string },
    authHeaders?: Headers,
  ): Promise<string>;
}

type ConvertibleValue =
  | { [key: string]: ConvertibleValue } // Object with string keys
  | ConvertibleValue[] // Array of convertible values
  | string
  | number
  | boolean
  | null;

function convertStringTypes(obj: ConvertibleValue): ConvertibleValue {
  // Base case: if not an object or is null, return as-is
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => convertStringTypes(item));
  }

  // Handle objects
  const result: Record<string, ConvertibleValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      if (value === "null") {
        result[key] = null;
      } else if (value === "true") {
        result[key] = true;
      } else if (value === "false") {
        result[key] = false;
      } else if (!isNaN(Number(value)) && value.trim() !== "") {
        result[key] = Number(value); // Convert numeric strings to numbers
      } else {
        result[key] = value; // Keep other strings as-is
      }
    } else if (typeof value === "object") {
      result[key] = convertStringTypes(value); // Recursively process nested objects
    } else {
      result[key] = value; // Non-string, non-object values
    }
  }
  return result;
}

// Ollama Provider with MCP tool integration
class OllamaMcpProvider implements AIProvider {
  private readonly llm: ChatOllama;
  private readonly mcpClient: Client;
  private readonly transport: StreamableHTTPClientTransport;
  private readonly systemPrompt: string;
  private readonly ollamaUrl: string;
  private readonly model: string;
  private readonly mcpEndpoint: string;
  private readonly authToken: string;

  constructor(
    ollamaUrl = process.env.OLLAMA_URL ?? "",
    model = process.env.OLLAMA_MODEL ?? "qwen3:8b",
    mcpEndpoint = process.env.MCP_ENDPOINT ?? "http://localhost:3000/mcp",
    authToken = process.env.OLLAMA_AUTH_TOKEN ?? "",
  ) {
    this.ollamaUrl = ollamaUrl;
    this.model = model;
    this.mcpEndpoint = mcpEndpoint;
    this.authToken = authToken;
    const username = "bot";
    const password = process.env.MCP_PASSWORD;
    if (!password) {
      throw new Error("MCP_PASSWORD environment variable is required");
    }

    // Create a basic auth header
    const authHeader = "Basic " + btoa(`${username}:${password}`);

    this.transport = new StreamableHTTPClientTransport(
      new URL(this.mcpEndpoint),
      {
        requestInit: {
          headers: {
            Authorization: authHeader,
            "x-trpc-source": "mcp-server",
          },
        },
      },
    );
    this.mcpClient = new Client(
      { name: "inventory-client", version: "1.0.0" },
      { capabilities: { prompts: {}, resources: {}, tools: {}, logging: {} } },
    );
    this.llm = new ChatOllama({
      baseUrl: this.ollamaUrl,
      model: this.model,
      temperature: 0.7,
      topK: 20,
      topP: 0.8,
      maxRetries: 2,
      headers: this.authToken
        ? { Authorization: `Bearer ${this.authToken}` }
        : undefined,
    });
    this.systemPrompt =
      `You are an inventory management assistant for Monash Automation. You help users look up and understand their inventory data using the tools available to you.

## Your Capabilities
You have access to tools for:
- **Items**: Search, list, and look up inventory items (assets and consumables)
- **Locations**: Browse the location hierarchy and see what's stored where
- **Tags & Tag Groups**: View how items are categorized
- **Users & Groups**: Look up user info and group memberships
- **Transactions**: View checkout/check-in history, audit trails, and currently loaned items
- **Dashboard**: Get stats like loan history, top loaned items, inventory by location, and tag usage
- **QR Codes**: Generate QR URLs and look up items by QR scan
- **3D Printers**: Check printer status, list printers, and view print job history

## Rules
1. Always use tools to fetch data — never guess or make up inventory information.
2. ID arguments must be valid UUIDs (e.g. "3c383a42-a242-404b-b77e-3ae284117238"). If the user gives a name instead, use the appropriate list/search tool first to find the UUID, then call the detail tool.
3. Never output raw JSON to the user. Parse tool responses and present the data clearly.
4. Format monetary values with "$" (e.g. $30).
5. Format dates in a human-readable way (e.g. "5 Oct 2025, 1:26 AM").
6. When listing multiple items, use a markdown table with relevant columns.
7. Keep responses concise. Don't explain your tool calls or JSON parsing — just show the results.
8. If a tool returns an error or empty data, tell the user plainly (e.g. "No items found" or "That location doesn't exist").
9. You are read-only — you cannot create, update, or delete anything. If the user asks you to modify data, explain that you can only look up information.
10. Do not help with coding questions — you are an inventory lookup assistant only.
11. When the user greets you (e.g. "hello", "hi", "hey", "good morning"), always call the greeting tool first and use its response to greet them back by name.
`.trim();
  }

  async init(): Promise<void> {
    try {
      await this.mcpClient.connect(this.transport);
      console.log("MCP client connected successfully");
    } catch (error) {
      console.error("Failed to initialize MCP client:", error);
      throw new Error("MCP client initialization failed");
    }
  }

  async generateResponse(
    messages: Message[],
    userContext?: { id: string; email?: string },
    authHeaders?: Headers,
  ): Promise<string> {
    let perRequestClient: Client | null = null;
    try {
      // Create a new MCP client with both basic auth and forwarded user headers
      let mcpClient = this.mcpClient;
      if (authHeaders) {
        const forwardedHeaders: Record<string, string> = {};
        authHeaders.forEach((value, key) => {
          forwardedHeaders[key] = value;
        });

        // Add basic auth for MCP endpoint access
        const username = "bot";
        const password = process.env.MCP_PASSWORD;
        if (!password) {
          throw new Error("MCP_PASSWORD environment variable is required");
        }
        const authHeader = "Basic " + btoa(`${username}:${password}`);
        forwardedHeaders.Authorization = authHeader;

        const transport = new StreamableHTTPClientTransport(
          new URL(this.mcpEndpoint),
          {
            requestInit: {
              headers: forwardedHeaders,
            },
          },
        );

        mcpClient = new Client(
          { name: "inventory-client", version: "1.0.0" },
          {
            capabilities: {
              prompts: {},
              resources: {},
              tools: {},
              logging: {},
            },
          },
        );

        await mcpClient.connect(transport);
        perRequestClient = mcpClient;
      }

      // Fetch MCP tools
      const mcpTools = await mcpClient.listTools();
      const langchainTools = mcpTools.tools.map((mcpTool) =>
        tool(
          async (args) => {
            // Add user context to the arguments if available
            const argsWithUserContext = userContext
              ? {
                  ...(args as Record<string, unknown>),
                  userContext: {
                    userId: userContext.id,
                    userEmail: userContext.email,
                  },
                }
              : args;

            try {
              const result = await mcpClient.callTool({
                name: mcpTool.name,
                arguments: argsWithUserContext as Record<string, unknown>,
              });
              return JSON.stringify(result);
            } catch (error) {
              console.error(`MCP tool call failed for ${mcpTool.name}:`, error);
              return JSON.stringify({
                error: `Tool call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              });
            }
          },
          {
            name: mcpTool.name,
            description: mcpTool.description ?? "No description provided",
            schema: mcpTool.inputSchema,
          },
        ),
      );

      // Bind tools to LLM
      const llmWithTools = this.llm.bindTools(langchainTools);
      const formattedMessages: FormattedMessage[] = [
        { role: "system", content: this.systemPrompt },
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content.concat(msg.role === "user" ? " /no_think" : ""),
        })),
      ];

      // Initial LLM invocation

      let result = await llmWithTools.invoke(
        formattedMessages as BaseLanguageModelInput,
      );

      // Handle tool calls if present
      if (result.tool_calls?.length) {
        for (const toolCall of result.tool_calls) {
          let toolResult;
          try {
            toolResult = await mcpClient.callTool({
              name: toolCall.name,
              arguments: convertStringTypes(toolCall.args) as Record<
                string,
                unknown
              >,
            });
          } catch (error) {
            console.error(`MCP tool call failed for ${toolCall.name}:`, error);
            toolResult = {
              error: `Tool call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
          }

          // Append the tool call as a message to maintain context
          formattedMessages.push({
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: toolCall.id ?? `call_${Date.now()}`,
                name: toolCall.name,
                arguments: convertStringTypes(toolCall.args) as Record<
                  string,
                  unknown
                >,
              },
            ],
          });

          // Append the tool result as a 'tool' message
          formattedMessages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id ?? `call_${Date.now()}`,
          });
        }

        // Re-invoke LLM with updated message history including tool results
        result = await llmWithTools.invoke(
          formattedMessages as BaseLanguageModelInput,
        );
      }

      if (typeof result.content !== "string") {
        throw new Error("LLM returned non-string response");
      }

      const removeThinkTagsAtStartAndTopSpace = (text: string): string => {
        // Remove <think> tags at the start and normalize leading space
        const replaced = text.replace(/^<think>[\s\S]*?<\/think>\s*/, "");
        return replaced;
      };
      return removeThinkTagsAtStartAndTopSpace(result.content);
    } catch (error) {
      console.error("Error generating response:", error);
      throw new Error(
        `Failed to generate response: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      // Clean up per-request MCP client to prevent connection/memory leak
      if (perRequestClient) {
        try {
          await perRequestClient.close();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}

// Initialize AI provider
const aiProvider = new OllamaMcpProvider();
initializeAIProvider().catch(console.error);

async function initializeAIProvider() {
  try {
    await aiProvider.init();
    console.log("AI Provider initialized successfully");
  } catch (error) {
    console.error("Failed to initialize AI Provider:", error);
  }
}

// Chat router
export const chatRouter = router({
  createConversation: userProcedure
    .input(CreateConversationInput)
    .mutation(async ({ input }) => {
      const conversation = await prisma.chat.create({
        data: {
          title: input.title ?? "New Conversation",
          aiMessages: {},
          userMessages: {},
          aiMessageChildIds: {},
          userMessageChildIds: {},
        },
      });

      return {
        id: conversation.id,
        title: conversation.title,
        messages: [],
      };
    }),

  getConversation: userProcedure
    .input(GetConversationInput)
    .query(async ({ input }) => {
      const conversation = await prisma.chat.findUnique({
        where: { id: input.conversationId },
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const userMessages = conversation.userMessages as Record<
        string,
        { content: string; timestamp: number }
      >;
      const aiMessages = conversation.aiMessages as Record<
        string,
        { content: string; timestamp: number }
      >;

      const allMessages: Message[] = [
        ...Object.entries(userMessages).map(([id, msg]) => ({
          id: `user_${id}`,
          role: "user" as const,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        ...Object.entries(aiMessages).map(([id, msg]) => ({
          id: `ai_${id}`,
          role: "assistant" as const,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
      ].sort((a, b) => a.timestamp - b.timestamp);

      return {
        id: conversation.id,
        title: conversation.title,
        messages: allMessages,
      };
    }),

  sendMessage: userProcedure
    .input(SendMessageInput)
    .mutation(async ({ input, ctx }) => {
      const conversation = await prisma.chat.findUnique({
        where: { id: input.conversationId },
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const userMessageId = `msg_${Date.now()}`;
      const userTimestamp = Date.now();
      const userMessages = conversation.userMessages as Record<
        string,
        { content: string; timestamp: number }
      >;
      const aiMessages = conversation.aiMessages as Record<
        string,
        { content: string; timestamp: number }
      >;

      userMessages[userMessageId] = {
        content: input.content,
        timestamp: userTimestamp,
      };

      const allMessages: Message[] = [
        ...Object.entries(userMessages).map(([id, msg]) => ({
          id: `user_${id}`,
          role: "user" as const,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        ...Object.entries(aiMessages).map(([id, msg]) => ({
          id: `ai_${id}`,
          role: "assistant" as const,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
      ].sort((a, b) => a.timestamp - b.timestamp);

      // Get the original request headers for forwarding to MCP
      const originalHeaders = new Headers();
      ctx.req.headers.forEach((value, key) => {
        originalHeaders.set(key, value);
      });

      const aiResponse = await aiProvider.generateResponse(
        allMessages,
        {
          id: ctx.user.id,
          email: ctx.user.email,
        },
        originalHeaders,
      );
      const aiMessageId = `msg_${Date.now() + 1}`;
      const aiTimestamp = Date.now() + 1;

      aiMessages[aiMessageId] = {
        content: aiResponse,
        timestamp: aiTimestamp,
      };

      await prisma.chat.update({
        where: { id: input.conversationId },
        data: {
          userMessages,
          aiMessages,
          updatedAt: new Date(),
        },
      });

      return {
        userMessage: {
          id: userMessageId,
          role: "user" as const,
          content: input.content,
          timestamp: userTimestamp,
        },
        aiMessage: {
          id: aiMessageId,
          role: "assistant" as const,
          content: aiResponse,
          timestamp: aiTimestamp,
        },
      };
    }),

  getConversations: userProcedure.query(async () => {
    const conversations = await prisma.chat.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    return conversations;
  }),

  deleteConversation: userProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await prisma.chat.delete({
        where: { id: input.conversationId },
      });

      return { success: true };
    }),
});
