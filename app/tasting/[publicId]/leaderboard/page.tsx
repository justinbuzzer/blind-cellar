"use client";

import { useParams } from "next/navigation";
import { FinalLeaderboardClient } from "@/components/FinalLeaderboardClient";

/** Participant final leaderboard for full_blind — see README "Final leaderboard and tasting recap". */
export default function FullBlindFinalLeaderboardPage() {
  const params = useParams<{ publicId: string }>();
  return (
    <FinalLeaderboardClient
      publicId={params.publicId}
      hubHref={`/tasting/${params.publicId}/results`}
      recapHref={`/tasting/${params.publicId}/recap`}
    />
  );
}
