

# Fix: Logo oscuro y caballo de ajedrez en modo claro

## Problema
El archivo `connecta-logo-dark.png` que se copio anteriormente puede no haberse guardado correctamente. La imagen que subiste ahora (logo negro sobre fondo blanco) es la correcta y necesita reemplazar el archivo existente.

## Lo que ya esta bien (no necesita cambios de codigo)
La logica de cambio de tema ya esta implementada correctamente en todos los archivos:
- **Dashboard**: Logo condicional y caballo con `filter: invert(1)` en modo claro
- **Scripts**: Caballo con inversion de color
- **LeadTracker**: Caballo con inversion de color  
- **LeadCalendar**: Caballo con inversion de color
- **Settings**: Logo condicional (claro/oscuro)
- **Navbar**: Logo condicional (claro/oscuro)
- **ScriptsLogin**: Logo condicional (claro/oscuro)

## Unico cambio necesario
Reemplazar el archivo `src/assets/connecta-logo-dark.png` con la imagen correcta que acabas de subir (el logo negro "CONNECTA Creators").

## Detalles tecnicos
- Copiar `user-uploads://Connecta_Logo_blackn-2.png` a `src/assets/connecta-logo-dark.png` (sobreescribir el existente)
- No se requieren cambios de codigo ya que todas las paginas ya tienen la logica condicional implementada
- El caballo de ajedrez ya tiene `style={theme === "light" ? { filter: "invert(1)" } : undefined}` en las 4 paginas donde aparece

