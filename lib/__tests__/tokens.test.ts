import { describe, expect, it } from "vitest";
import { generateRecoveryCode, generateSecureToken, hashToken } from "@/lib/tokens";

describe("generateSecureToken", () => {
  it("returns a high-entropy, URL-safe string", () => {
    const token = generateSecureToken();
    expect(token.length).toBeGreaterThan(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats across calls", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSecureToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("returns a 64-character lowercase hex SHA-256 digest", () => {
    const hash = hashToken("some-token-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the plaintext input", () => {
    expect(hashToken("my-secret-code")).not.toContain("my-secret-code");
  });
});

describe("generateRecoveryCode", () => {
  it("formats as two 4-character groups separated by a hyphen", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("never uses visually-ambiguous characters (I, L, O, 0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRecoveryCode();
      expect(code).not.toMatch(/[ILO01]/);
    }
  });

  it("never repeats across many calls", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(500);
  });
});
