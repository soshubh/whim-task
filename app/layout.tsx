import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import "./style.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Whim Task",
  description: "Whim Task built with Next.js and shadcn/ui.",
  icons: {
    icon: "/Log.png",
    shortcut: "/Log.png",
    apple: "/Log.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <body className="app-body" suppressHydrationWarning>
        <AppProviders>
          <TooltipProvider>{children}</TooltipProvider>
        </AppProviders>
      </body>
    </html>
  );
}
