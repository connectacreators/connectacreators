import { Button } from "@/components/ui/button";

const CTASection = () => {
  return (
    <section className="py-24 md:py-32 bg-card">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-8 tracking-tight">
          Ready to build momentum?
        </h2>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
          If your service already works, your brand should reflect that.<br />
          Let's build something that grows.
        </p>
        
        <Button 
          size="lg"
          className="text-lg px-10 py-6 rounded-full"
          onClick={() => window.open('https://calendly.com/connectacreators/15min', '_blank')}
        >
          Book a Strategy Call
        </Button>
      </div>
    </section>
  );
};

export default CTASection;
