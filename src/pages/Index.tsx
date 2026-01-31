import { lazy, Suspense } from "react";
import HeroVProject from "@/components/HeroVProject";

// Lazy load sections below the fold for better mobile performance
const FounderSection = lazy(() => import("@/components/FounderSection"));
const ProblemSection = lazy(() => import("@/components/ProblemSection"));
const ZiguFitSection = lazy(() => import("@/components/ZiguFitSection"));
const WhatWeDoSection = lazy(() => import("@/components/WhatWeDoSection"));
const ConnectaMethod = lazy(() => import("@/components/ConnectaMethod"));
const ResultsSection = lazy(() => import("@/components/ResultsSection"));
const WhyConnecta = lazy(() => import("@/components/WhyConnecta"));
const WhoItsFor = lazy(() => import("@/components/WhoItsFor"));
const CTASection = lazy(() => import("@/components/CTASection"));

const SectionLoader = () => (
  <div className="min-h-[200px] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroVProject />
      <Suspense fallback={<SectionLoader />}>
        <FounderSection />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ProblemSection />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ZiguFitSection />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <WhatWeDoSection />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ConnectaMethod />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ResultsSection />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <WhyConnecta />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <WhoItsFor />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <CTASection />
      </Suspense>
      
      {/* Disclaimer */}
      <div className="bg-card py-6 text-center">
        <p className="text-muted-foreground text-xs">*resultados pueden variar*</p>
      </div>
    </div>
  );
};

export default Index;
