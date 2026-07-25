import { describe, expect, it } from "vitest";
import { parseEditingReviewNavigation } from "./actionSurface";

describe("parseEditingReviewNavigation", () => {
  it("matches a per-client editing-queue path with modal=revisions", () => {
    expect(parseEditingReviewNavigation("/clients/abc-123/editing-queue?item_id=xyz-789&modal=revisions")).toEqual({
      itemId: "xyz-789",
      clientId: "abc-123",
    });
  });

  it("matches modal=review the same as modal=revisions", () => {
    expect(parseEditingReviewNavigation("/clients/abc-123/editing-queue?item_id=xyz-789&modal=review")).toEqual({
      itemId: "xyz-789",
      clientId: "abc-123",
    });
  });

  it("matches the master queue path with no client segment", () => {
    expect(parseEditingReviewNavigation("/editing-queue?item_id=xyz-789&modal=revisions")).toEqual({
      itemId: "xyz-789",
      clientId: null,
    });
  });

  it("ignores other modal values", () => {
    expect(parseEditingReviewNavigation("/clients/abc-123/editing-queue?item_id=xyz-789&modal=footage")).toBeNull();
  });

  it("ignores editing-queue navigation with no modal", () => {
    expect(parseEditingReviewNavigation("/clients/abc-123/editing-queue?item_id=xyz-789")).toBeNull();
  });

  it("ignores paths missing item_id", () => {
    expect(parseEditingReviewNavigation("/clients/abc-123/editing-queue?modal=revisions")).toBeNull();
  });

  it("ignores unrelated paths", () => {
    expect(parseEditingReviewNavigation("/clients/abc-123/scripts?item_id=xyz-789&modal=revisions")).toBeNull();
  });

  it("ignores paths with no query string", () => {
    expect(parseEditingReviewNavigation("/editing-queue")).toBeNull();
  });
});
