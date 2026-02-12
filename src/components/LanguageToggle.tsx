import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";

const LanguageToggle = () => {
  const { language, toggleLanguage } = useLanguage();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="h-8 w-10 p-0 text-xs font-bold"
      title={language === "en" ? "Cambiar a español" : "Switch to English"}
    >
      {language === "en" ? "ES" : "EN"}
    </Button>
  );
};

export default LanguageToggle;
