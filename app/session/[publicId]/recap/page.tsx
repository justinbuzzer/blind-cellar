"use client";

import { useParams } from "next/navigation";
import { TastingRecapClient } from "@/components/TastingRecapClient";

/** Participant tasting recap for course_reveal — see README "Final leaderboard and tasting recap". */
export default function CourseRevealTastingRecapPage() {
  const params = useParams<{ publicId: string }>();
  return (
    <TastingRecapClient
      publicId={params.publicId}
      hubHref={`/session/${params.publicId}/results`}
      leaderboardHref={`/session/${params.publicId}/leaderboard`}
      bottleResultHref={(wineId) => `/session/${params.publicId}/bottle/${wineId}/reveal`}
    />
  );
}
