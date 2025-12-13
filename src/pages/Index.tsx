import HeroVProject from "@/components/HeroVProject";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroVProject />
      
      {/* Coming Soon Section */}
      <section className="bg-black py-12">
        <p className="text-white text-center text-sm">coming soon...</p>
      </section>
    </div>
  );
};

export default Index;
