import { Check } from "lucide-react";

const audiences = [
  "Professionals with proven services",
  "Clinics and medical practices",
  "Lawyers and legal brands",
  "Coaches and consultants",
  "Sales leaders and entrepreneurs"
];

const WhoItsFor = () => {
  return (
    <section className="py-24 md:py-32 bg-background">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-12 tracking-tight">
          Who Connecta is for
        </h2>
        
        <div className="space-y-4 mb-12">
          {audiences.map((audience, index) => (
            <div 
              key={index}
              className="flex items-center gap-4 text-lg md:text-xl text-foreground"
            >
              <Check className="w-6 h-6 text-primary flex-shrink-0" />
              <span>{audience}</span>
            </div>
          ))}
        </div>
        
        <p className="text-lg md:text-xl text-muted-foreground">
          If you want to be visible, trusted, and taken seriously online, this is for you.
        </p>
      </div>
    </section>
  );
};

export default WhoItsFor;
