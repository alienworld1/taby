import { ButtonLink } from "@/components/ui/ButtonLink";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-5 py-10" id="main-content">
      <section className="rounded-md border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-soft">
        <h1 className="mt-3 text-3xl font-semibold leading-10">We couldn’t find that page.</h1>
        <p className="mt-3 text-muted">
          Return to Taby to open your tabs.
        </p>
        <div className="mt-6">
          <ButtonLink href="/">Go to Taby</ButtonLink>
        </div>
      </section>
    </main>
  );
}
