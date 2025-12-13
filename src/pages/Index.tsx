import Navbar from "@/components/Navbar";
import HeroVProject from "@/components/HeroVProject";
import Services from "@/components/Services";
import Process from "@/components/Process";
import Testimonial from "@/components/Testimonial";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroVProject />
      <Testimonial />
      <Process />
      <Services />
      <CTA />
      <Footer />
    </div>
  );
};

export default Index;
