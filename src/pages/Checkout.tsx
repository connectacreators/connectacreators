import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Subscription checkout retired with the standalone software plans
// ($39/$79/$139). Access is provisioned by the Connecta team as part of
// Connecta+. Old links land on /select-plan's explanation page.
export default function Checkout() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/select-plan", { replace: true });
  }, [navigate]);
  return null;
}
