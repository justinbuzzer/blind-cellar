"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { StatusChip } from "@/components/StatusChip";
import { LocalDemoNote } from "@/components/LocalDemoNote";
import { HomeLink } from "@/components/navigation/HomeLink";
import { TastingReportView } from "@/components/report/TastingReportView";
import { buildDemoTasting } from "@/lib/demoData";
import { buildTastingReport } from "@/lib/results";

export default function DemoPage() {
  const { session, submissions, report } = useMemo(() => {
    const demo = buildDemoTasting();
    return {
      session: demo.session,
      submissions: demo.submissions,
      report: buildTastingReport(demo.session, demo.submissions),
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <HomeLink />

      <PageHeader
        eyebrow="The tasting report"
        title={session.title}
        supporting={`${submissions.length} tasters · ${session.wines.length} wines`}
        action={<StatusChip tone="warning">Sample report</StatusChip>}
      />

      <LocalDemoNote />

      <TastingReportView report={report} />

      <Link href="/host/new">
        <Button fullWidth>Host a real tasting</Button>
      </Link>
    </main>
  );
}
