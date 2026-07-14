import { describe, expect, it } from "vitest";
import { extractTextResponse } from "./response";

describe("extractTextResponse", () => {
  it("trims a plain text response", () => {
    expect(extractTextResponse("  Bom dia!  ")).toBe("Bom dia!");
  });

  it("joins text blocks in order", () => {
    expect(
      extractTextResponse([
        { type: "text", text: "Bom dia!" },
        { type: "text", text: "Como posso ajudar?" },
      ]),
    ).toBe("Bom dia!\nComo posso ajudar?");
  });

  it.each([
    ["whitespace", "   "],
    ["undefined", undefined],
    ["an empty array", []],
    ["non-text blocks", [{ type: "image", image_url: "internal" }]],
  ])("rejects %s as an empty text response", (_label, content) => {
    expect(() => extractTextResponse(content)).toThrow("empty text response");
  });
});
