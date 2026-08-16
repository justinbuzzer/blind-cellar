"use client";

import { useParams } from "next/navigation";
import { ResultsHubClient } from "@/components/ResultsHubClient";

/** Participant results hub for course_reveal — see README "Results reveal". */
export default function CourseRevealResultsHubPage() {
  const params = useParams<{ publicId: string }>();
  return (
    <ResultsHubClient
      resultHref={(wineId) => `/session/${params.publicId}/bottle/${wineId}/reveal`}
      leaderboardHref={`/session/${params.publicId}/leaderboard`}
      recapHref={`/session/${params.publicId}/recap`}
    />
  );
}
