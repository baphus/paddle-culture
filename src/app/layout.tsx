import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CK Grounds — Pickleball Courts in Tabuelan, Cebu",
  description:
    "Book a pickleball court at CK Grounds in Tabuelan, Cebu in under a minute. Live availability 6 AM–3 AM, transparent ₱150 day / ₱200 night rates, no account needed. Track any booking with your reference code.",
  icons: { icon: "/logo.jpg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("scroll-smooth", jakarta.variable)}>
      <body className="bg-cream font-sans text-ink">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
