"use client";

import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  return (
    <html
      className={`${hanken.variable} ${jetbrains.variable} h-full antialiased`}
      lang="en"
    >
      <body className="min-h-full bg-background text-foreground">
        <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-5 py-10">
          <title>Something got in the way | Taby</title>
          <ErrorCallout
            action={<Button onClick={() => unstable_retry()}>Try again</Button>}
            message="Something got in the way. Try again."
            title={error.digest ? "Something got in the way" : "Something got in the way"}
          />
        </main>
      </body>
    </html>
  );
}
