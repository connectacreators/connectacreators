
# Plan: Modo Claro/Oscuro con Toggle Sol/Luna

## Resumen
Agregar un sistema de temas claro/oscuro a toda la aplicacion. El modo oscuro actual (negro + dorado) se mantiene, y el modo claro usara fondo blanco con acentos en azul. Un boton con icono de sol/luna permitira cambiar entre modos.

## Cambios a realizar

### 1. Crear hook `useTheme`
Un hook personalizado que:
- Lee la preferencia guardada en `localStorage`
- Aplica la clase `light` al elemento `<html>`
- Expone `theme` y `toggleTheme`

### 2. Actualizar CSS (`src/index.css`)
Agregar un bloque `.light` con las variables de color invertidas:
- Fondo: blanco/gris claro en vez de negro
- Texto: gris oscuro/negro en vez de blanco
- Primary: azul (ej. `210 80% 50%`) en vez de dorado
- Cards, borders, muted: tonos grises claros
- Sidebar: fondo claro con acentos azules
- Actualizar las clases utilitarias (glass-card, glass-gold) para que funcionen en modo claro

### 3. Crear componente `ThemeToggle`
- Boton con icono `Sun` (en modo oscuro) o `Moon` (en modo claro) de lucide-react
- Ubicado en la esquina superior derecha o en la barra de navegacion
- Transicion suave al cambiar de tema

### 4. Integrar el toggle en todas las paginas
Agregar el componente `ThemeToggle` en las paginas principales:
- Dashboard
- Scripts
- LeadTracker
- LeadCalendar
- Settings
- Onboarding
- Paginas de landing (Index, IndexEN)

## Detalles tecnicos

### Paleta Light Mode
| Token | Dark (actual) | Light (nuevo) |
|-------|--------------|---------------|
| background | negro `0 0% 4%` | blanco `0 0% 98%` |
| foreground | crema `45 10% 95%` | gris oscuro `220 15% 15%` |
| primary | dorado `43 74% 49%` | azul `210 80% 50%` |
| primary-light | dorado claro `45 80% 60%` | azul claro `210 85% 65%` |
| primary-dark | dorado oscuro `40 70% 40%` | azul oscuro `210 75% 40%` |
| card | gris oscuro `0 0% 7%` | blanco `0 0% 100%` |
| muted | gris `30 5% 12%` | gris claro `210 10% 95%` |
| border | `40 10% 18%` | `210 15% 88%` |

### Hook `useTheme`
```typescript
// src/hooks/useTheme.ts
function useTheme() {
  const [theme, setTheme] = useState(() => 
    localStorage.getItem("theme") || "dark"
  );
  
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  return { theme, toggleTheme };
}
```

### Componente ThemeToggle
```tsx
// src/components/ThemeToggle.tsx
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
};
```

### Archivos a crear
- `src/hooks/useTheme.ts`
- `src/components/ThemeToggle.tsx`

### Archivos a modificar
- `src/index.css` - agregar bloque `.light` con variables
- `src/pages/Dashboard.tsx` - agregar ThemeToggle
- `src/pages/Scripts.tsx` - agregar ThemeToggle
- `src/pages/LeadTracker.tsx` - agregar ThemeToggle
- `src/pages/LeadCalendar.tsx` - agregar ThemeToggle
- `src/pages/Settings.tsx` - agregar ThemeToggle
- `src/pages/Index.tsx` - agregar ThemeToggle
- `src/pages/IndexEN.tsx` - agregar ThemeToggle
- `src/pages/Onboarding.tsx` - agregar ThemeToggle
