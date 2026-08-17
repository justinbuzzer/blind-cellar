import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, tastingBottlePhotoUrl, validatePhotoFile } from "@/lib/photoUrl";

describe("validatePhotoFile", () => {
  it("accepts a jpeg/png/webp file within the size limit", () => {
    expect(validatePhotoFile({ size: 1024, type: "image/jpeg" })).toBeNull();
    expect(validatePhotoFile({ size: 1024, type: "image/png" })).toBeNull();
    expect(validatePhotoFile({ size: 1024, type: "image/webp" })).toBeNull();
  });

  it("accepts a file exactly at the size limit", () => {
    expect(validatePhotoFile({ size: MAX_PHOTO_BYTES, type: "image/jpeg" })).toBeNull();
  });

  it("rejects a file over the size limit", () => {
    expect(validatePhotoFile({ size: MAX_PHOTO_BYTES + 1, type: "image/jpeg" })).toBe(
      "Photo must be smaller than 8MB."
    );
  });

  it("rejects an unsupported mime type", () => {
    expect(validatePhotoFile({ size: 1024, type: "image/gif" })).toBe(
      "Photos must be a JPEG, PNG, or WebP image."
    );
    expect(validatePhotoFile({ size: 1024, type: "application/pdf" })).toBe(
      "Photos must be a JPEG, PNG, or WebP image."
    );
  });

  it("checks mime type before size, so an oversized non-image file gets the mime message", () => {
    expect(validatePhotoFile({ size: MAX_PHOTO_BYTES + 1, type: "text/plain" })).toBe(
      "Photos must be a JPEG, PNG, or WebP image."
    );
  });
});

describe("tastingBottlePhotoUrl", () => {
  it("returns null when the path is null, undefined, or empty", () => {
    expect(tastingBottlePhotoUrl(null, "https://project.supabase.co")).toBeNull();
    expect(tastingBottlePhotoUrl(undefined, "https://project.supabase.co")).toBeNull();
    expect(tastingBottlePhotoUrl("", "https://project.supabase.co")).toBeNull();
  });

  it("returns null when the supabase URL is missing", () => {
    expect(tastingBottlePhotoUrl("session/guest/photo.jpg", null)).toBeNull();
    expect(tastingBottlePhotoUrl("session/guest/photo.jpg", undefined)).toBeNull();
  });

  it("builds the public object URL", () => {
    expect(tastingBottlePhotoUrl("session/guest/photo.jpg", "https://project.supabase.co")).toBe(
      "https://project.supabase.co/storage/v1/object/public/bottle-photos/session/guest/photo.jpg"
    );
  });

  it("strips a trailing slash from the supabase URL before joining", () => {
    expect(tastingBottlePhotoUrl("session/guest/photo.jpg", "https://project.supabase.co/")).toBe(
      "https://project.supabase.co/storage/v1/object/public/bottle-photos/session/guest/photo.jpg"
    );
  });
});
