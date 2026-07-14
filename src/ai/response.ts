export function extractTextResponse(content: unknown): string {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter(
              (block): block is { type: "text"; text: string } =>
                block?.type === "text" && typeof block.text === "string",
            )
            .map((block) => block.text)
            .join("\n")
        : "";
  const result = text.trim();

  if (!result) throw new Error("Agent returned an empty text response");

  return result;
}
