import Anthropic from "@anthropic-ai/sdk";

export const VISION_MODEL = "claude-sonnet-4-20250514";

export interface LlmRequest {
  systemPrompt: string;
  userText: string;
  imageBase64?: string;
  maxTokens?: number;
}

export async function requestLlmText(req: LlmRequest): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const client = new Anthropic({ apiKey });

  const userBlocks: Anthropic.MessageParam["content"] = [];
  if (req.imageBase64) {
    userBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: req.imageBase64,
      },
    });
  }
  userBlocks.push({ type: "text", text: req.userText });

  const message = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: req.maxTokens ?? 1024,
    system: req.systemPrompt,
    messages: [{ role: "user", content: userBlocks }],
  });

  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}
