"use client";

import { useParams } from "next/navigation";
import { ResultsHubClient } from "@/components/ResultsHubClient";

/** Participant results hub for full_blind — see README "Results reveal". */
export default function FullBlindResultsHubPage() {
  const params = useParams<{ publicId: string }>();
  return (
    <ResultsHubClient
      resultHref={(wineId) => `/tasting/${params.publicId}/bottle/${wineId}/result`}
      leaderboardHref={`/tasting/${params.publicId}/leaderboard`}
      recapHref={`/tasting/${params.publicId}/recap`}
    />
  );
}
