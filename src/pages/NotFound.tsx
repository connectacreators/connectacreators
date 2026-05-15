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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#EAE6DC" }}>
      <div className="text-center">
        <h1 className="font-serif text-6xl mb-3" style={{ color: "#141414", letterSpacing: "-0.02em", fontWeight: 500 }}>404</h1>
        <p className="text-base mb-6" style={{ color: "rgba(20,20,20,0.55)" }}>Page not found</p>
        <a href="/" className="inline-block font-sans text-sm" style={{ background: "#8FD0D5", color: "#141414", border: "1px solid #141414", boxShadow: "2px 2px 0 #141414", padding: "10px 20px", borderRadius: 999, fontWeight: 500 }}>
          Return Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
