// Mobile counterpart of the sidebar's client dropdown. Lives in the mobile
// top bar (where Sign out used to be — that action stays in the More sheet).
// Shows the active client's avatar + name at all times; tapping opens a
// bottom sheet with Master / My Brand / client list. Selection goes through
// useClientSwitcher, so navigation follows the client exactly like desktop.
import { useMemo, useState } from "react";
import { ChevronDown, Check, UserCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useClientSwitcher } from "@/hooks/useClientSwitcher";
import { useClientProfilePics } from "@/hooks/useClientProfilePics";
import { ClientAvatar } from "@/components/dashboard/ClientAvatar";

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

export default function MobileClientSwitcher() {
  const { isAdmin, isUser, isVideographer, isEditor } = useAuth();
  const { language } = useLanguage();
  const { viewMode, clients, ownClientId, ownClientName, switchTo } = useClientSwitcher();
  const [open, setOpen] = useState(false);

  const picIds = useMemo(
    () => Array.from(new Set([...clients.map(c => c.id), ownClientId].filter(Boolean) as string[])),
    [clients, ownClientId],
  );
  const pics = useClientProfilePics(picIds);

  if (isEditor) return null;

  const meLabel = ownClientName || (isUser ? (language === "en" ? "My Brand" : "Mi Marca") : (language === "en" ? "Me" : "Yo"));
  const selectedName =
    viewMode === "master" ? "Master"
    : viewMode === "me" ? meLabel
    : (clients.find(c => c.id === viewMode)?.name ?? ownClientName ?? (language === "en" ? "Client" : "Cliente"));
  const selectedPicId = viewMode === "master" ? null : viewMode === "me" ? ownClientId : viewMode;

  const pick = (mode: string) => {
    setOpen(false);
    switchTo(mode);
  };

  const avatarFallback = (label: string) => (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 text-muted-foreground"
      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
    >
      {getInitials(label)}
    </div>
  );

  return (
    <>
      {/* Trigger pill — always shows who you're working on */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full border border-border/60 bg-card/60 max-w-[46vw]"
        aria-label={language === "en" ? "Switch client" : "Cambiar cliente"}
      >
        {selectedPicId ? (
          <ClientAvatar
            picUrl={pics[selectedPicId]}
            alt={selectedName}
            size={24}
            fallback={avatarFallback(selectedName)}
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", color: "hsl(var(--aqua))", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            M
          </div>
        )}
        <span className="text-xs font-medium text-foreground truncate">{selectedName}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      </button>

      {/* Selector sheet */}
      {open && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-[90] lg:hidden rounded-t-2xl bg-card border-t border-border animate-in slide-in-from-bottom duration-300 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-3 mb-2" />
            <div className="px-6 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {language === "en" ? "Working on" : "Trabajando en"}
            </div>

            <div className="px-2 pb-8 overflow-y-auto">
              {(isAdmin || isVideographer) && (
                <button
                  onClick={() => pick("master")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.08)", color: "hsl(var(--aqua))", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    M
                  </div>
                  <span className="text-sm font-medium text-foreground flex-1">Master</span>
                  {viewMode === "master" && <Check className="w-4 h-4 text-primary" />}
                </button>
              )}

              {ownClientId && (
                <button
                  onClick={() => pick("me")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <ClientAvatar
                    picUrl={pics[ownClientId]}
                    alt={meLabel}
                    size={24}
                    fallback={
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
                      >
                        <UserCircle className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                    }
                  />
                  <span className="text-sm font-medium text-foreground flex-1">{meLabel}</span>
                  {viewMode === "me" && <Check className="w-4 h-4 text-primary" />}
                </button>
              )}

              {clients.length > 0 && <div className="h-px bg-border mx-2 my-1" />}

              {clients.map(client => (
                <button
                  key={client.id}
                  onClick={() => pick(client.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <ClientAvatar
                    picUrl={pics[client.id]}
                    alt={client.name}
                    size={24}
                    fallback={avatarFallback(client.name)}
                  />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{client.name}</span>
                  {viewMode === client.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
