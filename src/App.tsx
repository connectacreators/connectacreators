import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LeadNotificationProvider } from "@/contexts/LeadNotificationContext";
import Home from "./pages/Home";
import Index from "./pages/Index";
import IndexEN from "./pages/IndexEN";
import Onboarding from "./pages/Onboarding";
import Scripts from "./pages/Scripts";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Vault from "./pages/Vault";
import Videographers from "./pages/Videographers";
import VideographerDetail from "./pages/VideographerDetail";
import Dashboard from "./pages/Dashboard";
import LeadTracker from "./pages/LeadTracker";
import LeadCalendar from "./pages/LeadCalendar";
import Settings from "./pages/Settings";
import Subscription from "./pages/Subscription";
import NotFound from "./pages/NotFound";
import PublicScript from "./pages/PublicScript";
import PublicBooking from "./pages/PublicBooking";
import BookingSettings from "./pages/BookingSettings";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import SelectPlan from "./pages/SelectPlan";
import ComingSoon from "./pages/ComingSoon";
import PaymentSuccess from "./pages/PaymentSuccess";
import Checkout from "./pages/Checkout";
import EditingQueue from "./pages/EditingQueue";
import MasterEditingQueue from "./pages/MasterEditingQueue";
import ClientWorkflow from "./pages/ClientWorkflow";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LeadNotificationProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reto" element={<Index />} />
            <Route path="/reto/en" element={<IndexEN />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/scripts" element={<Scripts />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:clientId" element={<ClientDetail />} />
            <Route path="/clients/:clientId/scripts" element={<Scripts />} />
            <Route path="/clients/:clientId/leads" element={<LeadTracker />} />
            <Route path="/clients/:clientId/lead-calendar" element={<LeadCalendar />} />
            <Route path="/clients/:clientId/booking-settings" element={<BookingSettings />} />
            <Route path="/clients/:clientId/vault" element={<Vault />} />
            <Route path="/clients/:clientId/editing-queue" element={<EditingQueue />} />
            <Route path="/clients/:clientId/workflow" element={<ClientWorkflow />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/videographers" element={<Videographers />} />
            <Route path="/videographers/:videographerId" element={<VideographerDetail />} />
            <Route path="/leads" element={<LeadTracker />} />
            <Route path="/lead-calendar" element={<LeadCalendar />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/select-plan" element={<SelectPlan />} />
            <Route path="/coming-soon" element={<ComingSoon />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/editing-queue" element={<MasterEditingQueue />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/s/:id" element={<PublicScript />} />
            <Route path="/book/:clientId" element={<PublicBooking />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </LeadNotificationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
