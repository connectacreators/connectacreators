import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PublicLandingPage from "./pages/PublicLandingPage";
import "./landing.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/p/:slug" element={<PublicLandingPage />} />
      <Route path="*" element={<PublicLandingPage />} />
    </Routes>
  </BrowserRouter>
);
