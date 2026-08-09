"use client";

import { useParams } from "next/navigation";
import { FinalLeaderboardClient } from "@/components/FinalLeaderboardClient";

/** Participant final leaderboard for course_reveal — see README "Final leaderboard and tasting recap". */
export default function CourseRevealFinalLeaderboardPage() {
  const params = useParams<{ publicId: string }>();
  return (
    <FinalLeaderboardClient
      publicId={params.publicId}
      hubHref={`/session/${params.publicId}/results`}
      recapHref={`/session/${params.publicId}/recap`}
    />
  );
}
