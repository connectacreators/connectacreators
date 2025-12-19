const ProblemSection = () => {
  return (
    <section className="py-24 md:py-32 bg-background">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 tracking-tight">
          Good businesses are invisible online.
        </h2>
        
        <div className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
          <p>
            Most professionals know they're good at what they do, but social media isn't bringing them clients.
            They post randomly, follow trends that don't fit their brand, or stay inconsistent because they don't know what actually works.
          </p>
          
          <p className="text-foreground font-medium">
            Social media growth isn't luck.<br />
            It's structure, messaging, and execution.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
