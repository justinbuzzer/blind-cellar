"use client";

import { useParams } from "next/navigation";
import { TastingRecapClient } from "@/components/TastingRecapClient";

/** Participant tasting recap for full_blind — see README "Final leaderboard and tasting recap". */
export default function FullBlindTastingRecapPage() {
  const params = useParams<{ publicId: string }>();
  return (
    <TastingRecapClient
      publicId={params.publicId}
      hubHref={`/tasting/${params.publicId}/results`}
      leaderboardHref={`/tasting/${params.publicId}/leaderboard`}
      bottleResultHref={(wineId) => `/tasting/${params.publicId}/bottle/${wineId}/result`}
    />
  );
}
