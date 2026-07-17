import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SignInSheet } from "@/components/auth/SignInSheet";
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

export const metadata: Metadata = {
  title: {
    default: "Taby — Settle the whole tab together",
    template: "%s | Taby",
  },
  description:
    "Agree on what counts, approve one Final Tab, and close shared expenses in one safe flow.",
  applicationName: "Taby",
  openGraph: {
    title: "Taby",
    description:
      "Agree on what counts, approve one Final Tab, and settle every final transfer together.",
    siteName: "Taby",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <AuthProvider>
          {children}
          <SignInSheet />
        </AuthProvider>
      </body>
    </html>
  );
}
