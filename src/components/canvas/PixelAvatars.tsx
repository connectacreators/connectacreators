/**
 * Pixel-style anonymous avatars. 16-bit creatures painted in the user's
 * presence color. Replaces the old Google-Docs-style AnimalAvatars.
 *
 * Every creature is a tiny SVG on an 8x8 grid with shape-rendering: crispEdges
 * so it stays sharp at any display size.
 */

export const CREATURES = [
  "Ghost", "Robot", "Slime", "Alien", "Cat", "Pumpkin",
  "Skull", "Heart", "Star", "Mushroom", "Frog", "Owl",
  "Bee", "Duck", "Penguin", "Rabbit", "Cloud", "Flame",
  "Crystal", "Pizza", "Donut", "Crown", "Crab", "Bat",
] as const;

export type Creature = (typeof CREATURES)[number];

interface PixelAvatarProps {
  creature: string;
  color: string;
  size?: number;
  className?: string;
  showOnline?: boolean;
}

/**
 * Small helper for svg rects.
 * Kept verbose per pixel for readability — this is a pixel artwork file,
 * not logic we want to share or abstract.
 */
function paintCreature(name: string, color: string): React.ReactNode {
  switch (name) {
    case "Ghost":
      return (
        <>
          <rect x="2" y="1" width="4" height="1" fill={color} />
          <rect x="1" y="2" width="6" height="4" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="1" y="6" width="1" height="1" fill={color} />
          <rect x="3" y="6" width="1" height="1" fill={color} />
          <rect x="5" y="6" width="1" height="1" fill={color} />
          <rect x="2" y="7" width="1" height="1" fill={color} />
          <rect x="4" y="7" width="1" height="1" fill={color} />
          <rect x="6" y="7" width="1" height="1" fill={color} />
        </>
      );
    case "Robot":
      return (
        <>
          <rect x="3" y="0" width="2" height="1" fill={color} />
          <rect x="1" y="1" width="6" height="6" fill={color} />
          <rect x="2" y="2" width="4" height="1" fill="#000000" />
          <rect x="2" y="3" width="1" height="1" fill="#22d3ee" />
          <rect x="5" y="3" width="1" height="1" fill="#22d3ee" />
          <rect x="3" y="5" width="2" height="1" fill="#000000" />
          <rect x="0" y="4" width="1" height="2" fill={color} />
          <rect x="7" y="4" width="1" height="2" fill={color} />
        </>
      );
    case "Slime":
      return (
        <>
          <rect x="3" y="2" width="2" height="1" fill={color} />
          <rect x="2" y="3" width="4" height="1" fill={color} />
          <rect x="1" y="4" width="6" height="2" fill={color} />
          <rect x="1" y="6" width="1" height="1" fill={color} />
          <rect x="3" y="6" width="1" height="1" fill={color} />
          <rect x="4" y="6" width="1" height="1" fill={color} />
          <rect x="6" y="6" width="1" height="1" fill={color} />
          <rect x="3" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="4" y="4" width="1" height="1" fill="#ffffff" />
        </>
      );
    case "Alien":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill={color} />
          <rect x="2" y="2" width="4" height="3" fill={color} />
          <rect x="1" y="3" width="6" height="3" fill={color} />
          <rect x="2" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="3" y="6" width="2" height="1" fill={color} />
        </>
      );
    case "Cat":
      return (
        <>
          <rect x="1" y="1" width="1" height="1" fill={color} />
          <rect x="6" y="1" width="1" height="1" fill={color} />
          <rect x="1" y="2" width="2" height="1" fill={color} />
          <rect x="5" y="2" width="2" height="1" fill={color} />
          <rect x="1" y="3" width="6" height="3" fill={color} />
          <rect x="2" y="4" width="1" height="1" fill="#000000" />
          <rect x="5" y="4" width="1" height="1" fill="#000000" />
          <rect x="3" y="5" width="2" height="1" fill="#f87171" />
          <rect x="2" y="6" width="4" height="1" fill={color} />
        </>
      );
    case "Pumpkin":
      return (
        <>
          <rect x="3" y="0" width="2" height="1" fill="#166534" />
          <rect x="1" y="1" width="6" height="6" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#000000" />
          <rect x="5" y="3" width="1" height="1" fill="#000000" />
          <rect x="3" y="5" width="2" height="1" fill="#000000" />
        </>
      );
    case "Skull":
      return (
        <>
          <rect x="2" y="1" width="4" height="1" fill={color} />
          <rect x="1" y="2" width="6" height="3" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#000000" />
          <rect x="5" y="3" width="1" height="1" fill="#000000" />
          <rect x="2" y="5" width="1" height="1" fill={color} />
          <rect x="4" y="5" width="1" height="1" fill={color} />
          <rect x="6" y="5" width="1" height="1" fill={color} />
          <rect x="3" y="6" width="1" height="1" fill={color} />
          <rect x="5" y="6" width="1" height="1" fill={color} />
        </>
      );
    case "Heart":
      return (
        <>
          <rect x="2" y="1" width="1" height="1" fill={color} />
          <rect x="5" y="1" width="1" height="1" fill={color} />
          <rect x="1" y="2" width="3" height="1" fill={color} />
          <rect x="4" y="2" width="3" height="1" fill={color} />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="2" y="5" width="4" height="1" fill={color} />
          <rect x="3" y="6" width="2" height="1" fill={color} />
        </>
      );
    case "Star":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill={color} />
          <rect x="2" y="2" width="4" height="1" fill={color} />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="1" y="5" width="1" height="1" fill={color} />
          <rect x="2" y="5" width="1" height="1" fill={color} />
          <rect x="5" y="5" width="1" height="1" fill={color} />
          <rect x="6" y="5" width="1" height="1" fill={color} />
          <rect x="3" y="6" width="2" height="1" fill={color} />
        </>
      );
    case "Mushroom":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill={color} />
          <rect x="2" y="2" width="4" height="2" fill={color} />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="2" y="2" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="2" width="1" height="1" fill="#ffffff" />
          <rect x="3" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="3" y="5" width="2" height="2" fill="#fef3c7" />
          <rect x="2" y="6" width="1" height="1" fill="#fef3c7" />
          <rect x="5" y="6" width="1" height="1" fill="#fef3c7" />
        </>
      );
    case "Frog":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill={color} />
          <rect x="2" y="2" width="4" height="1" fill={color} />
          <rect x="1" y="3" width="6" height="3" fill={color} />
          <rect x="2" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="2" y="5" width="1" height="1" fill="#000000" />
          <rect x="5" y="5" width="1" height="1" fill="#000000" />
          <rect x="2" y="6" width="4" height="1" fill={color} />
        </>
      );
    case "Owl":
      return (
        <>
          <rect x="1" y="2" width="2" height="1" fill={color} />
          <rect x="5" y="2" width="2" height="1" fill={color} />
          <rect x="1" y="3" width="6" height="3" fill={color} />
          <rect x="2" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="3" y="5" width="2" height="1" fill="#f59e0b" />
          <rect x="3" y="6" width="2" height="1" fill={color} />
        </>
      );
    case "Bee":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill={color} />
          <rect x="2" y="2" width="4" height="1" fill="#000000" />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="1" y="5" width="6" height="1" fill="#000000" />
          <rect x="2" y="6" width="4" height="1" fill={color} />
          <rect x="2" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="4" width="1" height="1" fill="#ffffff" />
        </>
      );
    case "Duck":
      return (
        <>
          <rect x="3" y="2" width="2" height="1" fill={color} />
          <rect x="2" y="3" width="4" height="3" fill={color} />
          <rect x="1" y="4" width="6" height="2" fill={color} />
          <rect x="3" y="4" width="1" height="1" fill="#000000" />
          <rect x="6" y="4" width="1" height="1" fill="#fb923c" />
          <rect x="3" y="6" width="3" height="1" fill={color} />
        </>
      );
    case "Penguin":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill="#1e293b" />
          <rect x="2" y="2" width="4" height="2" fill="#1e293b" />
          <rect x="2" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="3" y="3" width="1" height="1" fill="#000000" />
          <rect x="4" y="3" width="1" height="1" fill="#000000" />
          <rect x="1" y="4" width="6" height="2" fill="#1e293b" />
          <rect x="3" y="4" width="2" height="2" fill={color} />
          <rect x="2" y="6" width="1" height="1" fill="#fb923c" />
          <rect x="5" y="6" width="1" height="1" fill="#fb923c" />
        </>
      );
    case "Rabbit":
      return (
        <>
          <rect x="2" y="0" width="1" height="2" fill={color} />
          <rect x="5" y="0" width="1" height="2" fill={color} />
          <rect x="1" y="2" width="6" height="4" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#000000" />
          <rect x="5" y="3" width="1" height="1" fill="#000000" />
          <rect x="3" y="4" width="2" height="1" fill="#f472b6" />
          <rect x="2" y="6" width="4" height="1" fill={color} />
        </>
      );
    case "Cloud":
      return (
        <>
          <rect x="2" y="2" width="4" height="4" fill={color} />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="1" y="4" width="6" height="1" fill={color} />
          <rect x="3" y="2" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="3" width="1" height="1" fill="#ffffff" />
        </>
      );
    case "Flame":
      return (
        <>
          <rect x="3" y="1" width="2" height="1" fill="#fbbf24" />
          <rect x="2" y="2" width="4" height="2" fill="#fb923c" />
          <rect x="1" y="3" width="6" height="3" fill={color} />
          <rect x="2" y="5" width="4" height="2" fill={color} />
          <rect x="3" y="3" width="1" height="2" fill="#fbbf24" />
        </>
      );
    case "Crystal":
      return (
        <>
          <rect x="3" y="0" width="2" height="1" fill="#ffffff" />
          <rect x="2" y="1" width="4" height="2" fill={color} />
          <rect x="1" y="2" width="6" height="3" fill={color} />
          <rect x="2" y="5" width="4" height="2" fill={color} />
          <rect x="3" y="7" width="2" height="1" fill={color} />
          <rect x="3" y="3" width="1" height="1" fill="#ffffff" />
        </>
      );
    case "Pizza":
      return (
        <>
          <rect x="2" y="1" width="4" height="1" fill="#fb923c" />
          <rect x="1" y="2" width="6" height="3" fill="#fbbf24" />
          <rect x="2" y="3" width="1" height="1" fill="#7c2d12" />
          <rect x="4" y="3" width="1" height="1" fill="#7c2d12" />
          <rect x="3" y="4" width="1" height="1" fill="#7c2d12" />
          <rect x="5" y="4" width="1" height="1" fill="#7c2d12" />
          <rect x="2" y="5" width="4" height="1" fill="#fb923c" />
        </>
      );
    case "Donut":
      return (
        <>
          <rect x="2" y="2" width="4" height="4" fill={color} />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#fef3c7" />
          <rect x="4" y="3" width="1" height="1" fill="#fef3c7" />
          <rect x="3" y="5" width="2" height="1" fill="#fef3c7" />
          <rect x="5" y="4" width="1" height="1" fill="#fef3c7" />
          <rect x="3" y="3" width="1" height="1" fill={color} />
          <rect x="3" y="4" width="1" height="1" fill={color} />
        </>
      );
    case "Crown":
      return (
        <>
          <rect x="1" y="1" width="1" height="1" fill="#fde047" />
          <rect x="3" y="0" width="1" height="1" fill="#fde047" />
          <rect x="4" y="0" width="1" height="1" fill="#fde047" />
          <rect x="6" y="1" width="1" height="1" fill="#fde047" />
          <rect x="1" y="2" width="6" height="3" fill={color} />
          <rect x="1" y="5" width="6" height="2" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#f472b6" />
          <rect x="5" y="3" width="1" height="1" fill="#f472b6" />
        </>
      );
    case "Crab":
      return (
        <>
          <rect x="2" y="3" width="4" height="1" fill={color} />
          <rect x="1" y="4" width="1" height="1" fill={color} />
          <rect x="6" y="4" width="1" height="1" fill={color} />
          <rect x="2" y="4" width="4" height="1" fill={color} />
          <rect x="1" y="5" width="6" height="1" fill={color} />
          <rect x="2" y="6" width="1" height="1" fill={color} />
          <rect x="5" y="6" width="1" height="1" fill={color} />
          <rect x="3" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="4" y="4" width="1" height="1" fill="#ffffff" />
          <rect x="2" y="5" width="1" height="1" fill="#000000" />
          <rect x="5" y="5" width="1" height="1" fill="#000000" />
        </>
      );
    case "Bat":
      return (
        <>
          <rect x="1" y="2" width="1" height="1" fill={color} />
          <rect x="6" y="2" width="1" height="1" fill={color} />
          <rect x="0" y="3" width="1" height="1" fill={color} />
          <rect x="7" y="3" width="1" height="1" fill={color} />
          <rect x="1" y="3" width="6" height="2" fill={color} />
          <rect x="2" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="5" y="3" width="1" height="1" fill="#ffffff" />
          <rect x="3" y="5" width="2" height="1" fill={color} />
        </>
      );
    default:
      // Fallback: a small filled circle so we never render a blank avatar.
      return <circle cx="4" cy="4" r="3" fill={color} />;
  }
}

export default function PixelAvatar({
  creature,
  color,
  size = 28,
  className,
  showOnline = true,
}: PixelAvatarProps) {
  // Normalise so legacy names (from the old AnimalAvatars set) still render
  // as a graceful fallback circle via the default branch.
  const resolved = CREATURES.includes(creature as Creature) ? creature : "Slime";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "rgba(30, 41, 59, 0.9)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 8 8"
          width={Math.floor(size * 0.75)}
          height={Math.floor(size * 0.75)}
          shapeRendering="crispEdges"
          style={{ imageRendering: "pixelated" as any }}
        >
          {paintCreature(resolved, color)}
        </svg>
      </div>
      {showOnline && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: Math.max(6, Math.floor(size * 0.25)),
            height: Math.max(6, Math.floor(size * 0.25)),
            borderRadius: "50%",
            background: "#10b981",
            border: "2px solid #0f1419",
          }}
        />
      )}
    </div>
  );
}
