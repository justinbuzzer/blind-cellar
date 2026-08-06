import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidOtpFormat,
  maskEmail,
  sanitizeDisplayName,
} from "@/lib/supabase/auth";

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
  });

  it("accepts an email with a subdomain and plus tag", () => {
    expect(isValidEmail("alice+tasting@mail.example.co.uk")).toBe(true);
  });

  it("rejects an email missing the @ sign", () => {
    expect(isValidEmail("aliceexample.com")).toBe(false);
  });

  it("rejects an email missing a domain", () => {
    expect(isValidEmail("alice@")).toBe(false);
  });

  it("rejects an email with spaces", () => {
    expect(isValidEmail("alice smith@example.com")).toBe(false);
  });

  it("rejects an email missing a TLD", () => {
    expect(isValidEmail("alice@example")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
  });

  it("rejects an unreasonably long email", () => {
    expect(isValidEmail(`${"a".repeat(255)}@example.com`)).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidEmail("  alice@example.com  ")).toBe(true);
  });
});

describe("isValidOtpFormat", () => {
  it("accepts six digits (the common/default Supabase OTP length)", () => {
    expect(isValidOtpFormat("123456")).toBe(true);
  });

  it("accepts six digits with surrounding whitespace (from paste)", () => {
    expect(isValidOtpFormat("  123456  ")).toBe(true);
  });

  it("accepts seven and eight digits (a project can configure a longer OTP length)", () => {
    expect(isValidOtpFormat("1234567")).toBe(true);
    expect(isValidOtpFormat("12345678")).toBe(true);
  });

  it("rejects fewer than six digits", () => {
    expect(isValidOtpFormat("12345")).toBe(false);
  });

  it("rejects more than eight digits", () => {
    expect(isValidOtpFormat("123456789")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(isValidOtpFormat("12345a")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidOtpFormat("")).toBe(false);
  });
});

describe("sanitizeDisplayName", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeDisplayName("  Alice  ")).toBe("Alice");
  });

  it("returns null for an empty string", () => {
    expect(sanitizeDisplayName("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(sanitizeDisplayName("   ")).toBeNull();
  });

  it("truncates a name longer than the maximum length", () => {
    const tooLong = "a".repeat(100);
    const result = sanitizeDisplayName(tooLong);
    expect(result).toHaveLength(60);
  });

  it("leaves a normal name unchanged", () => {
    expect(sanitizeDisplayName("Alice Host")).toBe("Alice Host");
  });
});

describe("maskEmail", () => {
  it("masks the middle of a typical local part", () => {
    expect(maskEmail("alice@example.com")).toBe("a***e@example.com");
  });

  it("masks a short (2-character) local part without going negative", () => {
    expect(maskEmail("al@example.com")).toBe("a***@example.com");
  });

  it("masks a single-character local part safely", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("returns the input unchanged if it has no @ sign", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});
