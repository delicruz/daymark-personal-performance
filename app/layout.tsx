import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/daymark-heart.png`;

  return {
    title: "Daymark · Personal productivity forecasting",
    description: "Understand your work rhythm with private, explainable productivity forecasts based on daily check-ins and calendar availability.",
    icons: { icon: "/daymark-heart.svg", apple: "/daymark-heart.png" },
    openGraph: {
      title: "Daymark · Plan tomorrow with better signals",
      description: "Private, explainable productivity forecasts built around your own work rhythm.",
      images: [{ url: socialImage, width: 1254, height: 1254, alt: "Daymark heart pulse mark" }],
    },
    twitter: { card: "summary_large_image", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
