import { lazy, Suspense } from "react";
import HeroVProjectEN from "@/components/en/HeroVProjectEN";

// Lazy load sections below the fold for better mobile performance
const FounderSectionEN = lazy(() => import("@/components/en/FounderSectionEN"));
const ProblemSectionEN = lazy(() => import("@/components/en/ProblemSectionEN"));
const ZiguFitSectionEN = lazy(() => import("@/components/en/ZiguFitSectionEN"));
const WhatWeDoSectionEN = lazy(() => import("@/components/en/WhatWeDoSectionEN"));
const ConnectaMethodEN = lazy(() => import("@/components/en/ConnectaMethodEN"));
const ResultsSectionEN = lazy(() => import("@/components/en/ResultsSectionEN"));
const WhyConnectaEN = lazy(() => import("@/components/en/WhyConnectaEN"));
const WhoItsForEN = lazy(() => import("@/components/en/WhoItsForEN"));
const CTASectionEN = lazy(() => import("@/components/en/CTASectionEN"));

const SectionLoader = () => (
  <div className="min-h-[200px] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const IndexEN = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroVProjectEN />
      <Suspense fallback={<SectionLoader />}>
        <FounderSectionEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ProblemSectionEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ZiguFitSectionEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <WhatWeDoSectionEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ConnectaMethodEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ResultsSectionEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <WhyConnectaEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <WhoItsForEN />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <CTASectionEN />
      </Suspense>
      
      {/* Disclaimer */}
      <div className="bg-card py-6 text-center">
        <p className="text-muted-foreground text-xs">*results may vary*</p>
      </div>
    </div>
  );
};

export default IndexEN;
