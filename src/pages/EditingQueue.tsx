import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import AnimatedDots from "@/components/ui/AnimatedDots";
import { Loader2, ArrowLeft, Play, ExternalLink } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface EditingQueueItem {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  fileSubmissionUrl: string | null;
  scriptUrl: string | null;
  lastEdited: string;
}

function extractGoogleDriveFileId(url: string): string | null {
  // Match /file/d/FILE_ID/ pattern
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];
  // Match ?id=FILE_ID pattern
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  return null;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "complete" || lower === "completed") return "default";
  if (lower.includes("progress") || lower.includes("editing")) return "secondary";
  return "outline";
}

function getStatusClassName(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "complete" || lower === "completed")
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (lower.includes("progress") || lower.includes("editing"))
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground";
}

export default function EditingQueue() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [clientName, setClientName] = useState("");
  const [items, setItems] = useState<EditingQueueItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<EditingQueueItem | null>(null);

  useEffect(() => {
    if (!clientId || !user) return;
    supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setClientName(data.name);
      });
  }, [clientId, user]);

  useEffect(() => {
    if (!clientId || !user) return;
    setFetching(true);
    setError(null);

    const fetchQueue = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error("No session");

        const res = await supabase.functions.invoke("fetch-editing-queue", {
          body: { client_id: clientId },
        });

        if (res.error) throw res.error;
        setItems(res.data?.items || []);
      } catch (e: any) {
        console.error("Error fetching editing queue:", e);
        setError(e.message || "Failed to fetch editing queue");
      } finally {
        setFetching(false);
      }
    };

    fetchQueue();
  }, [clientId, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedDriveId = selectedItem?.fileSubmissionUrl
    ? extractGoogleDriveFileId(selectedItem.fileSubmissionUrl)
    : null;

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/clients" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-6xl mx-auto w-full">
          <motion.button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {clientName || (language === "en" ? "Back" : "Volver")}
          </motion.button>

          <motion.h1
            className="text-xl sm:text-2xl font-bold text-foreground mb-6 tracking-tight"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            Editing Queue
          </motion.h1>

          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-muted-foreground text-sm">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {language === "en" ? "No items in the editing queue" : "No hay elementos en la cola de edición"}
            </div>
          ) : (
            <motion.div
              className="rounded-xl border border-border/50 bg-card/30 overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "en" ? "Title" : "Título"}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Video</TableHead>
                    <TableHead>Script</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const hasDriveVideo = item.fileSubmissionUrl
                      ? !!extractGoogleDriveFileId(item.fileSubmissionUrl)
                      : false;

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-foreground">{item.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusClassName(item.status)}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {hasDriveVideo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => setSelectedItem(item)}
                            >
                              <Play className="w-3.5 h-3.5" />
                              {language === "en" ? "Play" : "Ver"}
                            </Button>
                          ) : item.fileSubmissionUrl ? (
                            <a
                              href={item.fileSubmissionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Link
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.scriptUrl ? (
                            <a
                              href={item.scriptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {language === "en" ? "View" : "Ver"}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </motion.div>
          )}
        </div>
      </main>

      {/* Video Preview Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>{selectedItem?.title}</span>
              {selectedItem && (
                <Badge variant="outline" className={getStatusClassName(selectedItem.status)}>
                  {selectedItem.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {selectedDriveId ? (
              <div className="aspect-video rounded-lg overflow-hidden bg-black">
                <iframe
                  src={`https://drive.google.com/file/d/${selectedDriveId}/preview`}
                  className="w-full h-full"
                  allow="autoplay"
                  allowFullScreen
                />
              </div>
            ) : selectedItem?.fileSubmissionUrl ? (
              <div className="text-center py-10">
                <a
                  href={selectedItem.fileSubmissionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {language === "en" ? "Open file link" : "Abrir enlace del archivo"}
                </a>
              </div>
            ) : null}
            {selectedItem?.scriptUrl && (
              <div className="mt-3 text-right">
                <a
                  href={selectedItem.scriptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {language === "en" ? "View Script" : "Ver Guión"}
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
