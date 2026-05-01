import { useState } from "react";
import type { PresenceUser } from "@/hooks/useRealtimePresence";
import PixelAvatar from "./PixelAvatars";

interface Props {
  others: PresenceUser[];
  myAnimalName: string;
  myColor: string;
}

function viewLabel(view?: string): string {
  if (!view) return "";
  if (view === "fullscreen-ai") return "AI Chat";
  if (view === "canvas") return "Canvas";
  return view;
}

export default function PresenceAvatars({ others, myAnimalName, myColor }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      {/* Self indicator */}
      <div className="relative group">
        <PixelAvatar creature={myAnimalName} color={myColor} size={28} />
        {/* Tooltip */}
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-[10px] font-medium bg-black/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
          You — Anonymous {myAnimalName}
        </div>
      </div>

      {/* Other users */}
      {others.slice(0, 5).map((user) => (
        <div key={user.tabId} className="relative group">
          <PixelAvatar
            creature={user.animalName}
            color={user.color}
            size={28}
            className="transition-transform hover:scale-110 cursor-default"
          />
          {/* Tooltip */}
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-[10px] font-medium bg-black/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg space-y-0.5">
            <div>Anonymous {user.animalName}</div>
            {user.currentView && (
              <div className="text-white/60">{viewLabel(user.currentView)}</div>
            )}
          </div>
        </div>
      ))}

      {/* Overflow count */}
      {others.length > 5 && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#333] text-white/80 cursor-pointer hover:bg-[#444] transition-colors"
          style={{ boxShadow: "0 0 0 2px #55555540" }}
          onClick={() => setExpanded(!expanded)}
          title={`${others.length - 5} more users online`}
        >
          +{others.length - 5}
        </div>
      )}

      {/* Expanded panel for overflow */}
      {expanded && others.length > 5 && (
        <div className="absolute top-full mt-2 right-0 bg-card border border-border rounded-xl shadow-xl p-2 z-50 min-w-[200px]">
          {others.slice(5).map((user) => (
            <div key={user.tabId} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/40">
              <PixelAvatar creature={user.animalName} color={user.color} size={20} showOnline={false} />
              <span className="text-xs text-muted-foreground">
                Anonymous {user.animalName}
              </span>
              {user.currentView && (
                <span className="text-[10px] text-muted-foreground/60 ml-auto">
                  {viewLabel(user.currentView)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
