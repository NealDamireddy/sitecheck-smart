import { z } from "zod";

export type VisionAction =
  | { type: "click"; x: number; y: number; reason: string }
  | { type: "type"; x: number; y: number; value: string; reason: string }
  | {
      type: "select";
      x: number;
      y: number;
      optionText: string;
      reason: string;
    }
  | { type: "halt"; reason: string }
  | { type: "done"; reason: string };

export const VisionActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    x: z.number(),
    y: z.number(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("type"),
    x: z.number(),
    y: z.number(),
    value: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("select"),
    x: z.number(),
    y: z.number(),
    optionText: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("halt"),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    reason: z.string(),
  }),
]);

export const VerifyResponseSchema = z.union([
  z.object({ confirmed: z.literal(true) }),
  z.object({ confirmed: z.literal(false), reason: z.string() }),
]);

export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

export class HaltError extends Error {
  readonly haltReason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "HaltError";
    this.haltReason = reason;
  }
}
