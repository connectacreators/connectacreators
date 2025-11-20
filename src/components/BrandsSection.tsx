const BrandsSection = () => {
  const clients = [
    "@elabogadojonathan",
    "@zigufit",
    "@tutorianegocio",
    "@expertofitness",
    "@consultordigital"
  ];

  return (
    <section className="py-20 px-6 bg-card/30">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-playfair font-bold mb-16 leading-tight">
          <span className="text-foreground">Marcas que utilizan el </span>
          <span className="italic text-foreground/90">sistema</span>
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 items-center">
          {clients.map((client, index) => (
            <div 
              key={index}
              className="p-6 rounded-xl bg-card/50 border border-primary/10 hover:border-primary/30 transition-all duration-300 hover:scale-105"
            >
              <p className="text-primary font-semibold text-lg">{client}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BrandsSection;
