const pillars = [
  "Psychology",
  "Platform knowledge", 
  "Clear direction",
  "Execution"
];

const WhyConnecta = () => {
  return (
    <section className="py-24 md:py-32 bg-card">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 tracking-tight">
          Why this works
        </h2>
        
        <div className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed mb-12">
          <p>
            Most agencies post content and hope it works.<br />
            Connecta focuses on messaging, retention, and consistency.
          </p>
        </div>
        
        <div className="mb-8">
          <p className="text-foreground font-medium text-lg mb-6">We combine:</p>
          <div className="flex flex-wrap gap-4">
            {pillars.map((pillar, index) => (
              <span 
                key={index}
                className="px-6 py-3 rounded-full border border-primary/30 bg-primary/5 text-foreground font-medium"
              >
                {pillar}
              </span>
            ))}
          </div>
        </div>
        
        <p className="text-lg md:text-xl text-foreground font-medium">
          So your content doesn't just exist.<br />
          It performs.
        </p>
      </div>
    </section>
  );
};

export default WhyConnecta;
