import HeroVProject from "@/components/HeroVProject";
import ProblemSection from "@/components/ProblemSection";
import SolutionSection from "@/components/SolutionSection";
import WhatWeDoSection from "@/components/WhatWeDoSection";
import ConnectaMethod from "@/components/ConnectaMethod";
import ResultsSection from "@/components/ResultsSection";
import WhyConnecta from "@/components/WhyConnecta";
import WhoItsFor from "@/components/WhoItsFor";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroVProject />
      <ProblemSection />
      <SolutionSection />
      <WhatWeDoSection />
      <ConnectaMethod />
      <ResultsSection />
      <WhyConnecta />
      <WhoItsFor />
      <CTASection />
      <Footer />
    </div>
  );
};

export default Index;
