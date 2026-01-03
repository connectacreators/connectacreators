import HeroVProjectEN from "@/components/en/HeroVProjectEN";
import FounderSectionEN from "@/components/en/FounderSectionEN";
import ProblemSectionEN from "@/components/en/ProblemSectionEN";
import ZiguFitSectionEN from "@/components/en/ZiguFitSectionEN";
import SolutionSectionEN from "@/components/en/SolutionSectionEN";
import WhatWeDoSectionEN from "@/components/en/WhatWeDoSectionEN";
import ConnectaMethodEN from "@/components/en/ConnectaMethodEN";
import ResultsSectionEN from "@/components/en/ResultsSectionEN";
import WhyConnectaEN from "@/components/en/WhyConnectaEN";
import WhoItsForEN from "@/components/en/WhoItsForEN";
import CTASectionEN from "@/components/en/CTASectionEN";

const IndexEN = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroVProjectEN />
      <FounderSectionEN />
      <ProblemSectionEN />
      <ZiguFitSectionEN />
      <SolutionSectionEN />
      <WhatWeDoSectionEN />
      <ConnectaMethodEN />
      <ResultsSectionEN />
      <WhyConnectaEN />
      <WhoItsForEN />
      <CTASectionEN />
      
      {/* Disclaimer */}
      <div className="bg-card py-6 text-center">
        <p className="text-muted-foreground text-xs">*results may vary*</p>
      </div>
    </div>
  );
};

export default IndexEN;
