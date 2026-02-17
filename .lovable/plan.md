

# Globo de puntos rotatorio en el fondo del Home

## Resumen

Se creara un componente de canvas HTML5 que renderiza un globo terraqueo formado por puntos (dots) en el fondo de la seccion Hero del Home. El globo rotara lentamente de izquierda a derecha, con puntos de color azul claro, similar al efecto de Cregg Paris pero con una estetica de mundo/mapa.

## Enfoque tecnico

Se usara un **canvas 2D puro** (sin dependencias 3D como Three.js) para mantener el rendimiento. El globo se construye proyectando puntos distribuidos en una esfera 3D a coordenadas 2D, y rotando el angulo horizontal en cada frame con `requestAnimationFrame`.

### Nuevo componente: `src/components/DottedGlobe.tsx`

- Canvas HTML5 a pantalla completa con `position: absolute` y baja opacidad
- Genera ~2000-3000 puntos distribuidos uniformemente en una esfera usando el algoritmo de Fibonacci sphere
- Proyecta cada punto 3D a 2D con perspectiva simple
- Solo renderiza puntos del hemisferio frontal (z > 0) para dar efecto de profundidad
- El tamano y opacidad de cada punto varia segun su posicion z (mas lejos = mas pequeno y transparente)
- Color de los puntos: azul claro (`rgba(100, 180, 255, opacity)`)
- Rotacion continua con `requestAnimationFrame` a velocidad lenta (~0.001 rad/frame)
- Responsivo: se ajusta al tamano del contenedor con `ResizeObserver`
- Limpieza de recursos en `useEffect` cleanup

### Modificacion: `src/pages/Home.tsx`

- Importar e insertar `<DottedGlobe />` dentro del contenedor de fondo fijo existente (el div con `fixed inset-0 -z-10`)
- El globo se posiciona centrado o ligeramente a la derecha del hero
- Se mantiene el glow sutil del color primario encima

## Archivos

| Archivo | Accion |
|---|---|
| `src/components/DottedGlobe.tsx` | Crear - componente canvas con globo de puntos rotatorio |
| `src/pages/Home.tsx` | Modificar - agregar el DottedGlobe al fondo |

## Detalles de implementacion

**Algoritmo de puntos en esfera (Fibonacci):**
- Se distribuyen N puntos uniformemente en la superficie de una esfera
- Para cada frame, se aplica una rotacion en el eje Y (left-to-right)
- Se proyecta a 2D con perspectiva: `x2d = x / (z + dist)`, `y2d = y / (z + dist)`

**Rendimiento:**
- Se usa `requestAnimationFrame` para animacion fluida
- Solo se redibujan puntos visibles (hemisferio frontal)
- Canvas se redimensiona con `devicePixelRatio` para nitidez en pantallas retina
- Sin dependencias adicionales, todo es vanilla canvas

**Modo claro vs oscuro:**
- Dark mode: puntos azul claro sobre fondo oscuro (efecto principal)
- Light mode: puntos azul mas oscuro/gris con opacidad reducida para que no compita con el fondo blanco

