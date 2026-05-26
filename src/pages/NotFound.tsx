import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--cream))" }}>
      <div className="text-center">
        <h1 className="font-serif text-6xl mb-3" style={{ color: "hsl(var(--ink-on-cream))", letterSpacing: "-0.02em", fontWeight: 500 }}>404</h1>
        <p className="text-base mb-6" style={{ color: "hsl(var(--ink-on-cream) / 0.55)" }}>Page not found</p>
        <a href="/" className="inline-block font-sans text-sm" style={{ background: "hsl(var(--aqua))", color: "hsl(var(--ink-on-cream))", border: "1px solid hsl(var(--ink-on-cream))", boxShadow: "2px 2px 0 hsl(var(--ink-on-cream))", padding: "10px 20px", borderRadius: 999, fontWeight: 500 }}>
          Return Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
