"use client";

import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";

type ErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-5 py-10" id="main-content">
      <ErrorCallout
        action={<Button onClick={() => unstable_retry()}>Try again</Button>}
        message="Something got in the way. Try again."
        title={error.digest ? "Something got in the way" : "Something got in the way"}
      />
    </main>
  );
}
