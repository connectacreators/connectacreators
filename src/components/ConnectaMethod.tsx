const steps = [
  "We build viral scripts tailored to your niche and personality",
  "You film with confidence using our guidance",
  "We edit and optimize for maximum retention",
  "We amplify top-performing content with ads",
  "Your brand gains visibility, authority, and momentum"
];

const ConnectaMethod = () => {
  return (
    <section className="py-24 md:py-32 bg-card">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-16 tracking-tight">
          The Connecta Method
        </h2>
        
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div 
              key={index}
              className="flex items-start gap-6 p-6 rounded-xl border border-border bg-background/50 hover:border-primary/30 transition-all duration-300"
            >
              <span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                {index + 1}
              </span>
              <p className="text-lg md:text-xl text-foreground pt-1">
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ConnectaMethod;
