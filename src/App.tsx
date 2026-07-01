import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { LeadNotificationProvider } from "@/contexts/LeadNotificationContext";
import { OutOfCreditsProvider } from "@/contexts/OutOfCreditsContext";
import OutOfCreditsModal from "@/components/OutOfCreditsModal";
import { CompanionProvider } from "@/contexts/CompanionContext";
import CompanionBubble from "@/components/CompanionBubble";
import FloatingUploadProgress from "@/components/FloatingUploadProgress";
import DashboardLayout from "./layouts/DashboardLayout";
import { Loader2 } from "lucide-react";
import VideoEditor from "@/pages/VideoEditor";
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
import { useAuth } from "@/hooks/useAuth";
import ScriptsLogin from "@/components/ScriptsLogin";

// Lazy-loaded pages — each becomes its own chunk, loaded on demand
const Home = lazy(() => import("./pages/Home"));
const LandingPageNew = lazy(() => import("./pages/LandingPageNew"));
const LandingPageNewES = lazy(() => import("./pages/LandingPageNewES"));
const LandingPageDoctors = lazy(() => import("./pages/LandingPageDoctors"));
const LandingPageAbogados = lazy(() => import("./pages/LandingPageAbogados"));
const Index = lazy(() => import("./pages/Index"));
const IndexEN = lazy(() => import("./pages/IndexEN"));
const OneMillionGuarantee = lazy(() => import("./pages/OneMillionGuarantee"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Scripts = lazy(() => import("./pages/Scripts"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Vault = lazy(() => import("./pages/Vault"));
const Videographers = lazy(() => import("./pages/Videographers"));
const VideographerDetail = lazy(() => import("./pages/VideographerDetail"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LeadTracker = lazy(() => import("./pages/LeadTracker"));
const LeadCalendar = lazy(() => import("./pages/LeadCalendar"));
const Settings = lazy(() => import("./pages/Settings"));
const Subscription = lazy(() => import("./pages/Subscription"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PublicScript = lazy(() => import("./pages/PublicScript"));
const PublicFolderShare = lazy(() => import("./pages/PublicFolderShare"));
const Finances = lazy(() => import("./pages/Finances"));
const ApiUsage = lazy(() => import("./pages/ApiUsage"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const BookingSettings = lazy(() => import("./pages/BookingSettings"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const SelectPlan = lazy(() => import("./pages/SelectPlan"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const TopupSuccess = lazy(() => import("./pages/TopupSuccess"));
const Checkout = lazy(() => import("./pages/Checkout"));
const EditingQueue = lazy(() => import("./pages/EditingQueue"));
const MasterEditingQueue = lazy(() => import("./pages/MasterEditingQueue"));
const EditorIndex = lazy(() => import("./pages/Editor"));
const MasterDatabase = lazy(() => import("./pages/MasterDatabase"));
const ClientDatabase = lazy(() => import("./pages/ClientDatabase"));
const ClientFollowUpAutomation = lazy(() => import("./pages/ClientFollowUpAutomation"));
const AIFollowUpBuilder = lazy(() => import("./pages/AIFollowUpBuilder"));
const LandingPageBuilder = lazy(() => import("./pages/LandingPageBuilder"));
const PublicLandingPage = lazy(() => import("./pages/PublicLandingPage"));
const FacebookCallback = lazy(() => import("./pages/FacebookCallback"));
const ContentCalendar = lazy(() => import("./pages/ContentCalendar"));
const PublicContentCalendar = lazy(() => import("./pages/PublicContentCalendar"));
const PublicEditingQueue = lazy(() => import("./pages/PublicEditingQueue"));
const Trainings = lazy(() => import("./pages/Trainings"));
const ViralToday = lazy(() => import("./pages/ViralToday"));
const ViralVideoDetail = lazy(() => import("./pages/ViralVideoDetail"));
const Subscribers = lazy(() => import("./pages/Subscribers"));
const PublicVideoReview = lazy(() => import("./pages/PublicVideoReview"));
const Signup = lazy(() => import("./pages/Signup"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ClientStrategy = lazy(() => import("./pages/ClientStrategy"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const CommandCenterPreview = lazy(() => import("./pages/CommandCenterPreview"));
const PublicContract = lazy(() => import("./pages/PublicContract"));
const ContractsPage = lazy(() => import("./pages/ContractsPage"));
const SocialAccounts = lazy(() => import("./pages/SocialAccounts"));
const ThankYou = lazy(() => import("./pages/ThankYou"));

const queryClient = new QueryClient();

const KNOWN_HOSTS = ['connectacreators.com', 'www.connectacreators.com', 'connecta.so', 'www.connecta.so'];

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function RootRoute() {
  const hostname = window.location.hostname;
  const isCustomDomain = !KNOWN_HOSTS.includes(hostname) && hostname !== 'localhost' && !hostname.endsWith('.localhost');
  if (isCustomDomain) return <PublicLandingPage />;
  return <LandingPageNew />;
}

function LoginRoute() {
  const { user, loading, signInWithEmail } = useAuth();
  const [params] = useSearchParams();
  const redirect = params.get("redirect");
  // Only honor in-app paths (avoid open-redirect to external URLs).
  const safeRedirect = redirect && redirect.startsWith("/") ? redirect : "/dashboard";
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={safeRedirect} replace />;
  return <ScriptsLogin onSignIn={() => {}} signInWithEmail={signInWithEmail} redirectTo={safeRedirect} />;
}

// Old anonymous public onboarding link → new login-gated form route.
function PublicOnboardRedirect() {
  const { clientId } = useParams<{ clientId: string }>();
  return <Navigate to={`/onboarding/${clientId}`} replace />;
}

// App-shell chrome (upload progress, out-of-credits, companion bubble). Hidden
// on the client-facing onboarding form so a client filling it out sees a clean
// page — admins keep the chrome there for companion-assisted fill.
function GlobalChrome() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const onOnboardingSurface =
    location.pathname.startsWith("/onboarding") || location.pathname.startsWith("/public/onboard");
  if (onOnboardingSurface && !isAdmin) return null;
  return (
    <>
      <FloatingUploadProgress />
      <OutOfCreditsModal />
      <CompanionBubble />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrandingProvider>
      <LeadNotificationProvider>
      <CompanionProvider>
      <OutOfCreditsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <GlobalChrome />
          {/* NamingModal is first-run app-shell setup — rendered inside
              DashboardLayout so it never appears on public/standalone routes
              (e.g. the login-gated onboarding link). */}
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public / unauthenticated routes */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/p/:slug" element={<PublicLandingPage />} />
            <Route path="/home" element={<Home />} />
            <Route path="/reto" element={<Index />} />
            <Route path="/reto/en" element={<IndexEN />} />
            <Route path="/1mguarantee" element={<OneMillionGuarantee />} />
            <Route path="/about" element={<ComingSoon />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/onboarding/:clientId" element={<Onboarding />} />
            <Route path="/select-plan" element={<SelectPlan />} />
            <Route path="/coming-soon" element={<ComingSoon />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/topup-success" element={<TopupSuccess />} />
            <Route path="/s/:id" element={<PublicScript />} />
            <Route path="/f/:token" element={<PublicFolderShare />} />
            <Route path="/book/:clientId" element={<PublicBooking />} />
            <Route path="/public/calendar/:clientId" element={<PublicContentCalendar />} />
            <Route path="/public/onboard/:clientId" element={<PublicOnboardRedirect />} />
            <Route path="/public/edit-queue/:clientId" element={<PublicEditingQueue />} />
            <Route path="/public/review/:videoEditId" element={<PublicVideoReview />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
            <Route path="/facebook-callback" element={<FacebookCallback />} />
            <Route path="/es" element={<LandingPageNewES />} />
            <Route path="/thank-you" element={<ThankYou />} />
            <Route path="/doctors" element={<LandingPageDoctors />} />
            <Route path="/abogados" element={<LandingPageAbogados />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/contract/:token" element={<PublicContract />} />

            {/* Authenticated routes — all share the DashboardLayout */}
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scripts" element={<Scripts />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:clientId" element={<ClientDetail />} />
              <Route path="/clients/:clientId/scripts" element={<Scripts />} />
              <Route path="/clients/:clientId/leads" element={<LeadTracker />} />
              <Route path="/clients/:clientId/lead-calendar" element={<LeadCalendar />} />
              <Route path="/clients/:clientId/booking-settings" element={<BookingSettings />} />
              <Route path="/clients/:clientId/vault" element={<Vault />} />
              <Route path="/clients/:clientId/editing-queue" element={<EditingQueue />} />
              <Route path="/clients/:clientId/content-calendar" element={<ContentCalendar />} />
              <Route path="/content-calendar" element={<ContentCalendar />} />
              <Route path="/clients/:clientId/followup-automation" element={<ClientFollowUpAutomation />} />
              <Route path="/clients/:clientId/followup-builder" element={<AIFollowUpBuilder />} />
              <Route path="/clients/:clientId/database" element={<ClientDatabase />} />
              <Route path="/clients/:clientId/landing-page" element={<LandingPageBuilder />} />
              <Route path="/vault" element={<Vault />} />
              <Route path="/videographers" element={<Videographers />} />
              <Route path="/videographers/:videographerId" element={<VideographerDetail />} />
              <Route path="/leads" element={<LeadTracker />} />
              <Route path="/lead-calendar" element={<LeadCalendar />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/ai" element={<CommandCenter />} />
              <Route path="/ai/preview" element={<CommandCenterPreview />} />
              <Route path="/editing-queue" element={<MasterEditingQueue />} />
              {IS_VIDEO_EDITOR_ENABLED && (
                <Route path="/editor" element={<EditorIndex />} />
              )}
              <Route path="/master-database" element={<MasterDatabase />} />
              <Route path="/trainings" element={<Trainings />} />
              <Route path="/finances" element={<Finances />} />
              <Route path="/api-usage" element={<ApiUsage />} />
              <Route path="/viral-today" element={<ViralToday />} />
              {/* Reels feed removed — redirect any stale URL (bookmarks, mobile
                  bottom-nav cache, shared links) to the dashboard. */}
              <Route path="/viral-today/reels" element={<Navigate to="/dashboard" replace />} />
              <Route path="/viral-today/video/:videoId" element={<ViralVideoDetail />} />
              <Route path="/subscribers" element={<Subscribers />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/clients/:clientId/contracts" element={<ContractsPage />} />
              <Route path="/clients/:clientId/social-accounts" element={<SocialAccounts />} />
              <Route path="/clients/:clientId/strategy" element={<ClientStrategy />} />
            </Route>

            {/* Video editor — dev-gated, standalone (no DashboardLayout) */}
            {IS_VIDEO_EDITOR_ENABLED && <Route path="/editing/:id/edit" element={<VideoEditor />} />}

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </OutOfCreditsProvider>
      </CompanionProvider>
      </LeadNotificationProvider>
      </BrandingProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
