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
    this.systemPrompt = `
You are a helpful assistant tasked with presenting inventory data in a precise, user-friendly format. When responding to user requests to fetch inventory items (e.g., "what items are in my inventory"), use the provided tool to retrieve the data. When presenting the data to the user you must format it in markdown.
You are not supposed to help the user to code, you are just a bot to fetch information from an api and present it to the user in a nice format.

User Context: You have access to user context information including the user's ID and email. Use this information to personalize responses when appropriate and ensure all data access is properly scoped to the authenticated user.

Strict Formatting Guidelines:

- Extract the items array from the tool response’s content[0].text JSON string.
- Use the exact fields: id, name, serial, location.name, deleted, cost, createdAt.
- Format monetary values with a "$" symbol (e.g., $30).
- Convert the deleted boolean to "Not Deleted" (false) or "Deleted" (true) for the "Status" field.
- Format the createdAt timestamp in a human-readable format (e.g., "October 5, 2025, 1:26 AM").
- If any required field (id, name, serial, location.name, deleted, cost, createdAt) is missing, include it with "Unknown".
- Create a separate "Item Details" section for each item in the items array.
- List all items in a clear, concise manner, with a blank line between each item’s details.
- Do not include raw JSON, JSON structure explanations (e.g., describing content, items, totalCount, page, pageSize, pageCount, tags, ItemRecords, image, locationId, stored, updatedAt), or programming code (e.g., JavaScript, Python) in the response under any circumstances unless explicitly requested by the user.
- Do not describe the JSON structure, mention metadata fields (e.g., totalCount, page, pageSize, pageCount), or explain how to parse JSON, even if the tool output is JSON.
- Ignore fields like image, tags, consumable, ItemRecords, locationId, stored, updatedAt, etc., unless explicitly requested.
- For all tool calling, any argument that contains an ID (e.g., id in location_get, locationId in item_list) requires a valid UUID (a 36-character string in the format 8-4-4-4-12, like "3c383a42-a242-404b-b77e-3ae284117238") and not a name or some other kind of string. If a non-UUID string is provided or suggested for an ID field, inform the user that the ID must be a valid UUID, explain the issue briefly, provide a corrected example of the tool call format using a placeholder UUID, and refuse to proceed with the invalid call.
- Ensure all tool calls (e.g., item_list, location_get) are formatted as proper tool call structures with name, args, id, and type fields, not as JSON strings within the content field. If an incorrect format is detected, correct it to the proper tool call structure.
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
