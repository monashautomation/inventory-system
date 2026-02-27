"use client";

import remarkBreaks from "remark-breaks";
import { useEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Send, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { trpc } from "@/client/trpc";
import remarkGfm from "remark-gfm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

// Message interface
interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "tool" | "system";
  timestamp: number;
}

// Chat component props
interface ChatProps {
  id?: string;
  onUpdateConversationId?: (conversationId: string) => void;
}

// This wrapper component handles re-mounting the chat when the conversation ID changes.
function ChatComponentWithStaticId({ id, onUpdateConversationId }: ChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(id);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(
    null,
  );
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // tRPC mutations and queries
  const createConversation = trpc.chat.createConversation.useMutation();
  const sendMessage = trpc.chat.sendMessage.useMutation();
  const getConversation = trpc.chat.getConversation.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  // Handle query results - only update if we don't have local messages or if we're loading an existing conversation
  useEffect(() => {
    if (getConversation.data && !isLoading && !isSendingMessage) {
      // Only update messages if we don't have any local messages (loading existing conversation)
      // or if the conversation has more messages than we currently have (someone else added messages)
      if (
        messages.length === 0 ||
        getConversation.data.messages.length > messages.length
      ) {
        setMessages(getConversation.data.messages);
      }
      if (onUpdateConversationId) {
        onUpdateConversationId(getConversation.data.id);
      }
    }
  }, [
    getConversation.data,
    onUpdateConversationId,
    messages.length,
    isLoading,
    isSendingMessage,
  ]);

  useEffect(() => {
    if (getConversation.error) {
      setError(getConversation.error.message);
    }
  }, [getConversation.error]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setIsSendingMessage(true);
    setError(null);

    // Add user message immediately to the UI
    const tempUserMessage: Message = {
      id: `temp_${Date.now()}`,
      content: userMessage,
      role: "user",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      // Create conversation if we don't have one
      let currentConversationId = conversationId;
      if (!currentConversationId) {
        const newConversation = await createConversation.mutateAsync({
          title:
            userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : ""),
        });
        currentConversationId = newConversation.id;
        setConversationId(currentConversationId);
        if (onUpdateConversationId) {
          onUpdateConversationId(currentConversationId);
        }
      }

      // Send message and get AI response
      const result = await sendMessage.mutateAsync({
        conversationId: currentConversationId,
        content: userMessage,
      });

      // Replace the temporary user message with the real one and add AI response
      setMessages((prev) => {
        const filteredMessages = prev.filter(
          (msg) => msg.id !== tempUserMessage.id,
        );
        console.log(result.aiMessage);
        return [...filteredMessages, result.userMessage, result.aiMessage];
      });
    } catch (error) {
      // Remove the temporary user message on error
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== tempUserMessage.id),
      );

      // Store the failed message for retry
      setLastFailedMessage(userMessage);

      // Set appropriate error message
      let errorMessage = "Failed to send message";
      if (error instanceof Error) {
        if (error.message.includes("Gemini API")) {
          errorMessage =
            "AI service is temporarily unavailable. Please try again.";
        } else if (error.message.includes("conversation")) {
          errorMessage =
            "Unable to create or access conversation. Please refresh and try again.";
        } else if (
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        } else {
          errorMessage = error.message;
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setIsSendingMessage(false);
    }
  };

  const retryLastMessage = () => {
    if (lastFailedMessage) {
      setInput(lastFailedMessage);
      setError(null);
      setLastFailedMessage(null);
      // Focus the textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  const clearError = () => {
    setError(null);
    setLastFailedMessage(null);
  };

  const adjustTextareaHeight = () => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
  };

  useEffect(adjustTextareaHeight, [input]);

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[94vh] max-h-[94vh] w-full pt-4">
      <div className="mb-6 px-4">
        <h1 className="text-3xl font-bold text-left">Chat</h1>
        <p className="text-muted-foreground">
          Ask questions about your inventory
        </p>
      </div>

      <div className="flex justify-center items-center flex-1 min-h-0">
        <Card className="w-full h-full flex flex-col">
          <CardContent className="flex-1 min-h-0 h-[calc(100%-72px)]">
            <ScrollArea className="h-full pr-4">
              <div className="flex flex-col gap-4 py-4">
                {error ? (
                  <div className="flex flex-col items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">
                        Message failed to send
                      </span>
                    </div>
                    <p className="text-sm text-destructive/80 text-center max-w-md">
                      {error}
                    </p>
                    <div className="flex gap-2">
                      {lastFailedMessage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={retryLastMessage}
                          className="text-destructive border-destructive/20 hover:bg-destructive/10"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearError}
                        className="text-destructive/60 hover:text-destructive"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "mb-4 flex",
                          message.role === "user"
                            ? "justify-end"
                            : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[70%] p-3 rounded-lg",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground ml-4"
                              : "bg-muted text-foreground mr-4",
                          )}
                        >
                          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1">
                            <Markdown
                              remarkPlugins={[remarkBreaks, remarkGfm]}
                              components={{
                                table: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"table">) => (
                                  <div className="my-2 rounded-md border overflow-x-auto">
                                    <Table {...props}>{children}</Table>
                                  </div>
                                ),
                                thead: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"thead">) => (
                                  <TableHeader {...props}>
                                    {children}
                                  </TableHeader>
                                ),
                                tbody: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"tbody">) => (
                                  <TableBody {...props}>{children}</TableBody>
                                ),
                                tr: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"tr">) => (
                                  <TableRow {...props}>{children}</TableRow>
                                ),
                                th: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"th">) => (
                                  <TableHead {...props}>{children}</TableHead>
                                ),
                                td: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"td">) => (
                                  <TableCell {...props}>{children}</TableCell>
                                ),
                                pre: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"pre">) => (
                                  <pre
                                    className="overflow-x-auto rounded-md bg-muted p-3 text-sm"
                                    {...props}
                                  >
                                    {children}
                                  </pre>
                                ),
                                code: ({
                                  children,
                                  className,
                                  ...props
                                }: ComponentPropsWithoutRef<"code"> & {
                                  className?: string;
                                }) => {
                                  const isInline = !className;
                                  return isInline ? (
                                    <code
                                      className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                br: () => (
                                  <span
                                    style={{ margin: "0.1em", padding: "0" }}
                                  />
                                ),
                                li: ({ children }) => (
                                  <li style={{ margin: "0.1em", padding: "0" }}>
                                    {children}
                                  </li>
                                ),
                                ul: ({ children }) => (
                                  <ul className="list-disc pl-4">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="list-decimal pl-4">
                                    {children}
                                  </ol>
                                ),
                                blockquote: ({
                                  children,
                                }: ComponentPropsWithoutRef<"blockquote">) => (
                                  <Alert className="my-2 border-l-4 border-primary/50 bg-muted/50">
                                    <AlertDescription>
                                      {children}
                                    </AlertDescription>
                                  </Alert>
                                ),
                                hr: () => <Separator className="my-4" />,
                                a: ({
                                  children,
                                  href,
                                  ...props
                                }: ComponentPropsWithoutRef<"a">) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                                    {...props}
                                  >
                                    {children}
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                ),
                                img: ({
                                  src,
                                  alt,
                                  ...props
                                }: ComponentPropsWithoutRef<"img">) => (
                                  <img
                                    src={src}
                                    alt={alt ?? ""}
                                    className="my-2 max-w-full rounded-md border"
                                    loading="lazy"
                                    {...props}
                                  />
                                ),
                                input: ({
                                  type,
                                  checked,
                                  ...props
                                }: ComponentPropsWithoutRef<"input">) => {
                                  if (type === "checkbox") {
                                    return (
                                      <Checkbox
                                        checked={!!checked}
                                        disabled
                                        className="mr-2 translate-y-[2px] pointer-events-none"
                                      />
                                    );
                                  }
                                  return <input type={type} {...props} />;
                                },
                                h1: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"h1">) => (
                                  <h3
                                    className="text-lg font-semibold mt-3 mb-1"
                                    {...props}
                                  >
                                    {children}
                                  </h3>
                                ),
                                h2: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"h2">) => (
                                  <h4
                                    className="text-base font-semibold mt-3 mb-1"
                                    {...props}
                                  >
                                    {children}
                                  </h4>
                                ),
                                h3: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"h3">) => (
                                  <h5
                                    className="text-sm font-semibold mt-2 mb-1"
                                    {...props}
                                  >
                                    {children}
                                  </h5>
                                ),
                                h4: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"h4">) => (
                                  <h6
                                    className="text-sm font-medium mt-2 mb-1"
                                    {...props}
                                  >
                                    {children}
                                  </h6>
                                ),
                                del: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"del">) => (
                                  <del
                                    className="text-muted-foreground line-through"
                                    {...props}
                                  >
                                    {children}
                                  </del>
                                ),
                                strong: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"strong">) => (
                                  <strong className="font-semibold" {...props}>
                                    {children}
                                  </strong>
                                ),
                                p: ({
                                  children,
                                  ...props
                                }: ComponentPropsWithoutRef<"p">) => (
                                  <p
                                    className="my-1 leading-relaxed"
                                    {...props}
                                  >
                                    {children}
                                  </p>
                                ),
                              }}
                            >
                              {message.content}
                            </Markdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted text-foreground p-3 rounded-lg mr-4">
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
                            <span className="text-sm">AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="border-t p-4 h-[72px]">
            <form
              onSubmit={handleSubmit}
              className="flex w-full items-center space-x-2"
            >
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message here..."
                className="min-h-[45px] max-h-[40px] resize-none flex-1"
                style={{ fontSize: "18px" }}
                disabled={isLoading}
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-[40px]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

// Main Chat component that handles conversation ID changes
export default function Chat({ id, onUpdateConversationId }: ChatProps) {
  const [currentId, setCurrentId] = useState(id);

  useEffect(() => {
    setCurrentId(id);
  }, [id]);

  return (
    <ChatComponentWithStaticId
      key={currentId}
      id={currentId}
      onUpdateConversationId={onUpdateConversationId}
    />
  );
}
