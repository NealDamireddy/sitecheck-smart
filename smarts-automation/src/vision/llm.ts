import Anthropic from "@anthropic-ai/sdk";

/**
 * Must stay identical to AI_MODEL in ../../../src/lib/ai-model.ts.
 * The bot is a separate package with its own tsconfig, so it cannot import
 * `@/lib` across the process boundary — tests/model-pin.test.ts in the root
 * package reads this file and fails the build if the two ever disagree.
 */
export const VISION_MODEL = "claude-opus-5";

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
    // Thinking is on by default from Opus 5 onward and max_tokens caps
    // thinking + text together, so 1024 truncated mid-answer.
    max_tokens: req.maxTokens ?? 8192,
    system: req.systemPrompt,
    messages: [{ role: "user", content: userBlocks }],
  });

  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}
