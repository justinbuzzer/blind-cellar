"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/Button";
import { LocalDemoNote } from "@/components/LocalDemoNote";
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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          {session.title}
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          Demo report — {submissions.length} tasters, {session.wines.length} wines
        </p>
      </div>

      <LocalDemoNote />

      <TastingReportView report={report} />

      <Link href="/host/new">
        <Button fullWidth>Host a real tasting</Button>
      </Link>
    </main>
  );
}
