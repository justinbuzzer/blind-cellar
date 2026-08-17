import Image from "next/image";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { tastingBottlePhotoUrl } from "@/lib/photoUrl";

interface BottlePhotoProps {
  photoPath: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
}

/**
 * Renders a bottle's photo thumbnail (see README "Bottle photos"), or
 * nothing at all when there is no photo — every caller already only ever
 * sees `photoPath` once the server's own reveal-gating has decided it's
 * safe to show, so this never needs to gate anything itself. Uses
 * next/image since these are stable public Storage URLs (unlike
 * PhotoUploadField's transient local blob preview) — see next.config.mjs
 * for the bottle-photos remote pattern.
 */
export function BottlePhoto({ photoPath, alt, size = 80, className = "" }: BottlePhotoProps) {
  const url = tastingBottlePhotoUrl(photoPath, getSupabaseEnv()?.url);
  if (!url) return null;
  return (
    <Image
      src={url}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 rounded-sm border border-cellar-border object-cover ${className}`}
    />
  );
}
