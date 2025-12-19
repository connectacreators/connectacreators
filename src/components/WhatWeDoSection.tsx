import { FileText, Video, Users, Megaphone } from "lucide-react";

const services = [
  {
    icon: FileText,
    title: "20 Viral Short-Form Scripts per Month",
    description: "Scripts engineered for attention, retention, and authority across Instagram, TikTok, and YouTube Shorts."
  },
  {
    icon: Video,
    title: "High-Performance Video Editing",
    description: "Fast-paced, scroll-stopping edits designed for watch time and shares, not just aesthetics."
  },
  {
    icon: Users,
    title: "Coaching & Creative Direction",
    description: "Clear guidance on what to film, how to film it, and how to communicate on camera like a personal brand."
  },
  {
    icon: Megaphone,
    title: "Paid Ads Amplification",
    description: "Strategic promotion of winning content to accelerate growth and reach the right audience faster."
  }
];

const WhatWeDoSection = () => {
  return (
    <section className="py-24 md:py-32 bg-background">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-16 tracking-tight">
          What you get with Connecta
        </h2>
        
        <div className="grid md:grid-cols-2 gap-8">
          {services.map((service, index) => (
            <div 
              key={index}
              className="p-8 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all duration-300"
            >
              <service.icon className="w-10 h-10 text-primary mb-6" />
              <h3 className="text-xl font-bold text-foreground mb-4">
                {service.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhatWeDoSection;
