import abogadoJonathan from "@/assets/abogado-jonathan.webp";
import drCalvin from "@/assets/dr-calvin-new.webp";
import zigufit from "@/assets/zigufit-profile.jpg";

const caseStudies = [
  {
    name: "Abogado Jonathan",
    timeline: "~9 months",
    image: abogadoJonathan,
    before: "378K",
    after: "1.28M"
  },
  {
    name: "Dr. Calvin's Clinic",
    timeline: "under 2 months",
    image: drCalvin,
    before: "0",
    after: "5,000"
  },
  {
    name: "ZiguFit (Fitness Creator)",
    timeline: "5 months",
    image: zigufit,
    before: "1,000",
    after: "17,700"
  }
];

const overallStats = [
  { platform: "Instagram", views: "10M+" },
  { platform: "TikTok", views: "87M+" },
  { platform: "YouTube", views: "6M+" }
];

const ResultsSection = () => {
  return (
    <section className="py-24 md:py-32 bg-background">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-16 tracking-tight">
          Real growth. Real numbers.
        </h2>
        
        {/* Case Studies */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {caseStudies.map((study, index) => (
            <div 
              key={index}
              className="p-8 rounded-2xl border border-border bg-card"
            >
              {study.image && (
                <img 
                  src={study.image} 
                  alt={study.name}
                  className="w-20 h-20 rounded-full object-cover mb-4"
                />
              )}
              <h3 className="text-xl font-bold text-foreground mb-2">
                {study.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Timeline: {study.timeline}
              </p>
              
              <p className="text-foreground font-medium text-lg">
                From <span className="text-muted-foreground">{study.before}</span> to <span className="text-primary">{study.after}</span> followers
              </p>
            </div>
          ))}
        </div>
        
        {/* Overall Stats */}
        <div className="p-8 rounded-2xl border border-primary/20 bg-card">
          <h3 className="text-lg font-bold text-muted-foreground mb-6 uppercase tracking-wider">
            Connecta Track Record
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            {overallStats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-4xl md:text-5xl font-bold text-primary mb-2">
                  {stat.views}
                </p>
                <p className="text-muted-foreground">
                  views on {stat.platform}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResultsSection;
