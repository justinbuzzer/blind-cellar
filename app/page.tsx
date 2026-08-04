"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-cellar-maroon-dark">
          Blind Cellar
        </h1>
        <p className="mt-2 text-base text-cellar-text/70">
          Private blind tasting, fairly scored.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button fullWidth onClick={() => router.push("/host/new")}>
          Host a tasting
        </Button>
        <Button
          fullWidth
          variant="secondary"
          onClick={() => router.push("/join")}
        >
          Join a tasting
        </Button>
        <button
          type="button"
          onClick={() => router.push("/demo")}
          className="mt-1 rounded text-sm font-medium text-cellar-gold underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-cellar-gold"
        >
          See a demo report
        </button>
      </div>
    </main>
  );
}
