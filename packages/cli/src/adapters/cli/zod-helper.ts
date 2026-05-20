import type { z } from "zod";
import { UsageError } from "./args";

export function parseOrUsage<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new UsageError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  return parsed.data;
}
