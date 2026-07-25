import type { Metadata } from "next";
import { Outfit, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { GradientBackground } from "@/components/GradientBackground";
import { Analytics } from "@vercel/analytics/next";

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "Clippa — Fast YouTube Clipper",
  description:
    "Clippa is a clean YouTube clipper: paste a link, mark start and end, download an HD clip. No ads.",
  keywords:
    "video clipper, youtube downloader, HD video clips, video trimmer, youtube clips, clippa, clippa.in, youtube clipper",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23e11d48'/><path d='M38 28v44l36-22z' fill='white'/></svg>",
    shortcut:
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23e11d48'/><path d='M38 28v44l36-22z' fill='white'/></svg>",
  },
  openGraph: {
    url: "https://clippa.in/",
    type: "website",
    locale: "en_US",
    siteName: "Clippa",
    title: "Clippa — Fast YouTube Clipper",
    description:
      "Paste a YouTube link, mark the moment, download a clean HD clip. No ads.",
  },
  other: {
    "twitter:card": "summary_large_image",
    "twitter:url": "https://clippa.in/",
    "twitter:domain": "clippa.in",
    "twitter:title": "Clippa — Fast YouTube Clipper",
    "twitter:description":
      "Paste a YouTube link, mark the moment, download a clean HD clip. No ads.",
    "og:url": "https://clippa.in/",
    "og:type": "website",
    "og:title": "Clippa — Fast YouTube Clipper",
    "og:description":
      "Paste a YouTube link, mark the moment, download a clean HD clip. No ads.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${sans.className} min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <GradientBackground />
          {children}
          <Analytics />
          <Toaster
            position="top-center"
            toastOptions={{
              className: "surface-panel font-sans",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
