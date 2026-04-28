"use client";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import BottomNav from "@/components/layout/BottomNav";
import { ToastContainer } from "@/components/ui/ToastNotification";
import FloatingAIAssistant from "@/components/ui/FloatingAIAssistant";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F8F4] dark:bg-[#0f1410]">
      {/* Sidebar - hidden on mobile via native bottom nav */}
      <div className="hidden md:block">
        <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 lg:p-8 md:pb-8">
          {children}
        </main>

        {/* Mobile Navigation */}
        <BottomNav />
      </div>

      {/* Global: FCM toast notifications */}
      <ToastContainer />

      {/* Global: AI assistant floating button */}
      <FloatingAIAssistant />
    </div>
  );
}
