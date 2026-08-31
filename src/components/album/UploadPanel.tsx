import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { albumApi } from "@/lib/album-api";
import { useUploadQueue, type UploadTask } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 ** 2).toFixed(bytes >= 1024 ** 3 ? 0 : 1)} MB`;
}

type UploadPanelProps = { mobileActionHidden?: boolean };

function QueueStatus({ tasks, onCancel, onRetry, compact = false }: {
  tasks: UploadTask[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  compact?: boolean;
}) {
  const pending = tasks.filter(task => ["queued", "uploading", "retrying"].includes(task.status));
  const interrupted = tasks.filter(task => task.status === "failed" || task.status === "canceled");
  const relevant = tasks.filter(task => task.status !== "canceled");
  const completed = relevant.filter(task => task.status === "done").length;
  const progress = relevant.length
    ? Math.round(relevant.reduce((total, task) => total + task.progress, 0) / relevant.length)
    : 0;

  if (!pending.length && !interrupted.length) return null;

  return (
    <div className={cn("rounded-xl border border-primary/15 bg-background/95 p-3 shadow-lg backdrop-blur", compact && "p-2.5")} aria-live="polite">
      {pending.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-xs font-medium">
              {pending.some(task => task.status === "retrying") ? "Reintentando…" : `Subiendo ${Math.min(completed + 1, relevant.length)} de ${relevant.length}`}
            </p>
            <span className="text-[11px] tabular-nums text-muted-foreground">{progress}%</span>
            <Button className="h-8 w-8" size="icon" variant="ghost" aria-label={`Cancelar ${pending[0].file.name}`} onClick={() => onCancel(pending[0].id)}><X /></Button>
          </div>
          <Progress className="mt-1.5 h-1.5" value={progress} aria-label="Progreso total de las subidas" />
          {!compact && <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{pending[0].file.name} · {formatBytes(pending[0].file.size)}</p>}
        </>
      )}
      {interrupted.map(task => (
        <div key={task.id} className={cn("flex items-center gap-2", pending.length && "mt-2 border-t pt-2")}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{task.file.name}</p>
            <p className="truncate text-[11px] text-destructive">{task.status === "canceled" ? "Subida cancelada" : task.error ?? "No se pudo completar la subida."}</p>
          </div>
          <Button className="h-8 px-2 text-xs" size="sm" variant="outline" onClick={() => onRetry(task.id)}><RotateCcw /> Reintentar</Button>
        </div>
      ))}
    </div>
  );
}

export function UploadPanel({ mobileActionHidden = false }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const announcedDone = useRef(new Set<string>());
  const queryClient = useQueryClient();
  const policy = useQuery({ queryKey: ["album-upload-policy"], queryFn: albumApi.uploadPolicy, staleTime: 30 * 60_000 });
  const queue = useUploadQueue(policy.data, queryClient);
  const hasVisibleStatus = useMemo(() => queue.tasks.some(task => task.status !== "done"), [queue.tasks]);

  useEffect(() => {
    queue.tasks.forEach(task => {
      if (task.status !== "done" || announcedDone.current.has(task.id)) return;
      announcedDone.current.add(task.id);
      toast.success("Recuerdo compartido", { description: task.file.name });
    });
  }, [queue.tasks]);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    queue.addFiles(event.dataTransfer.files);
  }

  return (
    <section className="mb-4" aria-labelledby="upload-title">
      <div className="wedding-card hidden items-center gap-5 p-4 sm:flex">
        <div className="min-w-0 flex-1">
          <h2 id="upload-title" className="font-heading text-2xl font-semibold text-primary">Añade tus fotos y vídeos</h2>
          <p className="mt-1 text-xs text-muted-foreground">Comparte tus fotos y vídeos con nosotros. Se guardarán en su calidad original.</p>
        </div>
      <button
        type="button"
          className={`flex min-h-16 w-[min(42%,28rem)] shrink-0 items-center justify-center gap-3 rounded-lg border border-dashed px-4 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          data-testid="desktop-upload-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
        disabled={!policy.data}
      >
          <ImagePlus className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">Selecciona o arrastra archivos</span>
      </button>
      </div>
      <input ref={inputRef} className="sr-only" type="file" multiple accept={policy.data ? ["image/*", "video/*", ...policy.data.acceptedTypes, ...policy.data.acceptedExtensions.map(extension => `.${extension}`)].join(",") : undefined} onChange={(event) => { if (event.target.files) queue.addFiles(event.target.files); event.target.value = ""; }} />

      <div className="mt-2 hidden sm:block"><QueueStatus tasks={queue.tasks} onCancel={queue.cancel} onRetry={queue.retry} /></div>

      {(policy.isError || queue.selectionErrors.length > 0) && <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{policy.isError && <p>No se ha podido preparar la subida.</p>}{queue.selectionErrors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>}

      {!mobileActionHidden && (
        <div className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 sm:hidden">
          {hasVisibleStatus && <div className="pointer-events-auto mb-2"><QueueStatus compact tasks={queue.tasks} onCancel={queue.cancel} onRetry={queue.retry} /></div>}
          <Button className="pointer-events-auto h-12 w-full rounded-full shadow-[0_12px_35px_rgba(76,34,45,0.3)]" data-testid="mobile-upload-action" onClick={() => inputRef.current?.click()} disabled={!policy.data}>
            <ImagePlus /> Subir fotos y vídeos
          </Button>
        </div>
      )}
    </section>
  );
}
