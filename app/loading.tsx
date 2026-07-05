import { LoadingState } from "@/components/ui/LoadingState";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8" id="main-content">
      <LoadingState />
    </main>
  );
}
