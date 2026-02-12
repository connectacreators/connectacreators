import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import IndexEN from "./pages/IndexEN";
import Onboarding from "./pages/Onboarding";
import Scripts from "./pages/Scripts";
import Dashboard from "./pages/Dashboard";
import LeadTracker from "./pages/LeadTracker";
import LeadCalendar from "./pages/LeadCalendar";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reto" element={<Index />} />
            <Route path="/reto/en" element={<IndexEN />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/scripts" element={<Scripts />} />
            <Route path="/leads" element={<LeadTracker />} />
            <Route path="/lead-calendar" element={<LeadCalendar />} />
            <Route path="/settings" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
