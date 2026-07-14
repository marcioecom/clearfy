import { describe, expect, it, vi } from "vitest";
import { CommercialCatalog } from "./catalog";

describe("CommercialCatalog", () => {
  it("normalizes the customer query before delegating to the query port", async () => {
    const findOffers = vi.fn().mockResolvedValue([]);
    const catalog = new CommercialCatalog({
      findProfile: vi.fn(),
      findOffers,
    });

    await catalog.findCurrentOffers("  5w30  ");

    expect(findOffers).toHaveBeenCalledWith("5W30");
  });
});
