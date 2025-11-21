import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import BetSlip from "@/components/Betting/BetSlip";
import Chat from "@/components/Chat/Chat";
import { BettingProvider } from "@/context/BettingContext";
import { UserProvider } from "@/context/UserContext";
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
            <Chat />
          </BettingProvider>
        </UserProvider>
      </body>
    </html>
  );
}
