import { describe, expect, it } from "vitest";
import { isSafeReturnPath, resolveSafeReturnPath } from "@/lib/authRedirects";

describe("isSafeReturnPath", () => {
  it("accepts a bare internal path", () => {
    expect(isSafeReturnPath("/archive")).toBe(true);
  });

  it("accepts an internal path with a query string", () => {
    expect(isSafeReturnPath("/results/abc-123?from=archive")).toBe(true);
  });

  it("accepts the root path", () => {
    expect(isSafeReturnPath("/")).toBe(true);
  });

  it("rejects null and undefined", () => {
    expect(isSafeReturnPath(null)).toBe(false);
    expect(isSafeReturnPath(undefined)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isSafeReturnPath("")).toBe(false);
  });

  it("rejects a protocol-relative external URL", () => {
    expect(isSafeReturnPath("//evil.example.com")).toBe(false);
  });

  it("rejects a full external https URL", () => {
    expect(isSafeReturnPath("https://evil.example.com")).toBe(false);
  });

  it("rejects a path missing the leading slash", () => {
    expect(isSafeReturnPath("archive")).toBe(false);
  });

  it("rejects a javascript: pseudo-URL", () => {
    expect(isSafeReturnPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects a backslash-based bypass attempt", () => {
    expect(isSafeReturnPath("/\\evil.example.com")).toBe(false);
  });

  it("rejects a path containing a scheme separator", () => {
    expect(isSafeReturnPath("/redirect?next=https://evil.example.com")).toBe(false);
  });

  it("rejects a path containing embedded whitespace/control characters", () => {
    expect(isSafeReturnPath("/archive\n.evil.com")).toBe(false);
  });

  it("rejects an unreasonably long path", () => {
    expect(isSafeReturnPath(`/${"a".repeat(3000)}`)).toBe(false);
  });
});

describe("resolveSafeReturnPath", () => {
  it("returns the given path when it is safe", () => {
    expect(resolveSafeReturnPath("/archive")).toBe("/archive");
  });

  it("falls back to the default destination for an unsafe path", () => {
    expect(resolveSafeReturnPath("https://evil.example.com")).toBe("/account");
  });

  it("falls back to the default destination for a missing path", () => {
    expect(resolveSafeReturnPath(null)).toBe("/account");
  });
});
