import { describe, expect, it } from "vitest";
import { buildHostControlsHref } from "@/lib/hostControlsLink";

describe("buildHostControlsHref", () => {
  it("builds the /host/[publicId]?token=... route", () => {
    expect(buildHostControlsHref("abc-123", "sometoken")).toBe(
      "/host/abc-123?token=sometoken"
    );
  });

  it("URL-encodes token characters that aren't safe in a query string", () => {
    // Host tokens are base64 (see create_tasting_session in schema.sql) and
    // can contain +, /, and = — all of which are meaningful in a URL.
    const href = buildHostControlsHref("abc-123", "a+b/c=");
    expect(href).toBe("/host/abc-123?token=a%2Bb%2Fc%3D");
  });

  it("uses the given session's public id, not a hardcoded route", () => {
    expect(buildHostControlsHref("session-one", "t")).toContain("/host/session-one");
    expect(buildHostControlsHref("session-two", "t")).toContain("/host/session-two");
  });
});
