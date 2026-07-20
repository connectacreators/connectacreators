import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import AnimatedDots from "@/components/ui/AnimatedDots";
import FloatingCredits from "@/components/FloatingCredits";
import MobileBottomNav from "@/components/MobileBottomNav";
import NamingModal from "@/components/NamingModal";
import StorageCapBanner from "@/components/StorageCapBanner";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardLayout() {
  const { user, requiresPasswordChange } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect to change-password if force_password_change flag is set
  useEffect(() => {
    if (requiresPasswordChange && location.pathname !== "/change-password") {
      navigate("/change-password", { replace: true });
    }
  }, [requiresPasswordChange, location.pathname, navigate]);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const showChrome = !!user;

  return (
    <div className="h-screen bg-background flex overflow-hidden" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {showChrome && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {showChrome && (
        <DashboardSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          currentPath={location.pathname + location.search}
        />
      )}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {showChrome && <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />}
        {showChrome && <StorageCapBanner />}
        {/* pb must exceed MobileBottomNav's h-16 so the last element clears it */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pb-24 lg:pb-0">
          <Outlet />
        </div>
      </div>
      {showChrome && <FloatingCredits />}
      {showChrome && <MobileBottomNav />}
      <NamingModal />
    </div>
  );
}
