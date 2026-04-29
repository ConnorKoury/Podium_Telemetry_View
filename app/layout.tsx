import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaRacing Telemetry",
  description: "Live Podium telemetry dashboard for NovaRacing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-nova-dark text-nova-text font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
