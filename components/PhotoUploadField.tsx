"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { tastingBottlePhotoUrl, validatePhotoFile } from "@/lib/photoUrl";

interface PhotoUploadUrlResponse {
  path: string;
  signedUrl: string;
  token: string;
}

interface PhotoUploadFieldProps {
  publicId: string;
  guestToken: string;
  value: string | null;
  onChange: (photoPath: string | null) => void;
}

/**
 * One photo per bottle (see README "Bottle photos"). Uploads go straight
 * from the browser to Storage via a signed URL minted by
 * app/api/register/photo-upload-url — this component never sees or needs
 * a service-role credential. A locally-selected file is previewed via an
 * object URL immediately (before the round trip even starts) so the upload
 * feels instant; once persisted, `value` is just the object path, and an
 * existing photo (e.g. re-opening the edit-bottle page) is previewed via the
 * public `bottle-photos` URL instead.
 */
export function PhotoUploadField({ publicId, guestToken, value, onChange }: PhotoUploadFieldProps) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    localPreviewUrlRef.current = localPreviewUrl;
  }, [localPreviewUrl]);

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
    };
  }, []);

  const savedPhotoUrl = tastingBottlePhotoUrl(value, getSupabaseEnv()?.url);
  const previewUrl = localPreviewUrl ?? savedPhotoUrl;

  async function handleFileSelected(file: File) {
    const validationError = validatePhotoFile({ size: file.size, type: file.type });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);

    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);

    try {
      const response = await fetch("/api/register/photo-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, guestToken, mimeType: file.type }),
      });
      const body = (await response.json()) as PhotoUploadUrlResponse | { error: string };
      if (!response.ok || !("path" in body)) {
        throw new Error("error" in body ? body.error : "Couldn't prepare the photo upload.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase isn't configured for this app yet.");

      const { error: uploadError } = await supabase.storage
        .from("bottle-photos")
        .uploadToSignedUrl(body.path, body.token, file);
      if (uploadError) throw uploadError;

      onChange(body.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload photo. Please try again.");
      setLocalPreviewUrl(null);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setError(null);
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-cellar-text">Bottle photo (optional)</span>

      <div className="flex items-center gap-4">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Bottle preview"
            className="h-24 w-24 rounded-sm border border-cellar-border object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-sm border border-dashed border-cellar-border text-xs text-cellar-muted">
            No photo
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex min-h-[44px] items-center justify-center rounded-sm border border-cellar-maroon bg-transparent px-4 py-2 text-sm font-medium text-cellar-maroon transition-colors duration-150 hover:bg-cellar-maroon/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : previewUrl ? "Change photo" : "Add photo"}
          </button>
          {previewUrl && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs font-medium text-cellar-muted underline-offset-4 hover:text-cellar-danger hover:underline"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      {error && (
        <p role="alert" className="text-xs font-medium text-cellar-danger">
          {error}
        </p>
      )}
    </div>
  );
}
