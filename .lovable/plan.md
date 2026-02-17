

# Rediseno Estilo Cregg Paris - Connecta Creators

## Inspiracion del Estilo Cregg Paris

El sitio de Cregg Paris se caracteriza por:
- **Fondo oscuro profundo** (casi negro puro, ~#0d0d0d) con mucho espacio en blanco (breathing room)
- **Navegacion con botones pill/rounded** con bordes sutiles grises
- **Tipografia grande, limpia y minimalista** - titulos enormes con mucho tracking
- **Un solo color de acento** que contrasta (en su caso rojo, en Connecta sera el azul/dorado existente)
- **Animaciones sutiles y elegantes** - sin ser llamativas, solo transiciones suaves de opacidad y posicion
- **Secciones con mucho padding vertical** - cada seccion respira
- **Estetica monocromatica** con textos en gris claro sobre fondo oscuro

## Cambios a Realizar

### 1. Home Page (`src/pages/Home.tsx`) - Rediseno completo del estilo

**Hero:**
- Fondo oscuro solido (sin gradiente azul) con un glow sutil del color primario muy difuminado
- Titular mucho mas grande (text-6xl a text-8xl) con letter-spacing amplio (tracking-tight)
- Subtitulo en gris suave (text-neutral-400)
- Boton CTA con estilo pill (rounded-full) y borde sutil, no solido
- Mucho mas espacio vertical (min-h-screen completo)

**Navbar:**
- Fondo casi transparente oscuro con backdrop-blur
- Logo a la izquierda, botones de navegacion como pills con bordes sutiles a la derecha
- Boton "Sign Up" como pill con borde, no relleno solido

**Feature Cards:**
- Fondo casi transparente con borde sutil (border-white/10)
- Sin sombras pesadas, solo bordes delicados
- Hover sutil con cambio de borde a color primario
- Layout mas espacioso

**How It Works:**
- Fondo ligeramente diferente (un tono mas claro del oscuro)
- Numeros grandes y elegantes
- Lineas conectoras sutiles entre pasos

**Footer:**
- Ultra minimalista, solo logo + links + copyright
- Separador con linea delgada (border-white/5)

### 2. CSS Global (`src/index.css`) - Ajustes menores
- Asegurar que el fondo base del body en dark mode sea casi negro puro
- Los cards en dark mode deben ser transparentes con borde, no con fondo solido

### 3. Modo Claro
- Mantener un estilo igualmente limpio: fondo blanco puro, textos en gris oscuro, bordes sutiles grises
- El mismo principio de minimalismo y espacio

## Resumen de Archivos

| Archivo | Accion |
|---|---|
| `src/pages/Home.tsx` | Rediseno completo del estilo visual (mismo contenido) |
| `src/index.css` | Ajustes menores al fondo base |

## Detalles Tecnicos

- Se mantienen las mismas secciones y contenido (Hero, Features, How It Works, CTA, Footer)
- Se mantiene `framer-motion` pero con animaciones mas sutiles (solo opacity + translateY minimo)
- Se mantiene el soporte bilingue con `useLanguage`
- Los botones usaran `rounded-full` + bordes en lugar de fondos solidos para el estilo pill
- El color primario se usa como acento puntual (palabras clave, hovers, iconos) no como fondos grandes
- Tipografia: titulos mas grandes con `tracking-tight`, subtitulos con `tracking-wide` en uppercase para jerarquia

