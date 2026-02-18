import { Geist, Geist_Mono } from "next/font/google";
// Deployment trigger: 2026-02-18 17:34
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import BetSlip from "@/components/Betting/BetSlip";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import { BettingProvider } from "@/context/BettingContext";
import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
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
            <BettingProvider>
              <Header />
              <div style={{ display: 'flex', minHeight: 'calc(100vh - 73px)' }}>
                <Sidebar />
                <main style={{ flex: 1, padding: '2rem' }}>
                  {children}
                </main>
                <aside style={{ width: '320px', borderLeft: '1px solid var(--border-color)', backgroundColor: 'var(--background-sidebar)' }}>
                  <BetSlip />
                </aside>
              </div>
              <ThemeToggle />
            </BettingProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
