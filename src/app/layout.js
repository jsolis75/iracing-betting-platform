import { Geist, Geist_Mono } from "next/font/google";
// Deployment trigger: 2026-02-18 17:34
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import BetSlipDock from "@/components/Betting/BetSlipDock";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import { BettingProvider } from "@/context/BettingContext";
import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/components/Toast/ToastContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "iRacing Betting Platform",
  description: "Live betting for iRacing events",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider>
          <UserProvider>
            <ToastProvider>
              <BettingProvider>
                <Header />
                <div className="appShell">
                  <Sidebar />
                  <main className="appMain">
                    {children}
                  </main>
                  <BetSlipDock />
                </div>
                <ThemeToggle />
              </BettingProvider>
            </ToastProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
