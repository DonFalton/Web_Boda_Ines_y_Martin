import { useRef, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { albumApi } from "@/lib/album-api";
import { useUploadQueue } from "@/lib/upload-queue";

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 ** 2).toFixed(bytes >= 1024 ** 3 ? 0 : 1)} MB`;
}

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const queryClient = useQueryClient();
  const policy = useQuery({ queryKey: ["album-upload-policy"], queryFn: albumApi.uploadPolicy, staleTime: 30 * 60_000 });
  const queue = useUploadQueue(policy.data, queryClient);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    queue.addFiles(event.dataTransfer.files);
  }

  return (
    <section className="wedding-card p-5 sm:p-7" aria-labelledby="upload-title">
      <h2 id="upload-title" className="section-title">Añade tus fotos y vídeos</h2>
      <p className="mt-2 text-sm text-muted-foreground">Los originales se guardan directamente en el OneDrive privado de Inés y Martín.</p>
      <button
        type="button"
        className={`mt-5 flex w-full flex-col items-center rounded-lg border-2 border-dashed px-5 py-9 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
        disabled={!policy.data}
      >
        <ImagePlus className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
        <span className="font-medium">Selecciona o arrastra archivos aquí</span>
        <span className="mt-1 text-xs text-muted-foreground">Hasta {policy.data?.maxBatchFiles ?? "…"} archivos por selección</span>
      </button>
      <input ref={inputRef} className="sr-only" type="file" multiple accept={policy.data ? [...policy.data.acceptedTypes, ...policy.data.acceptedExtensions.map(extension => `.${extension}`)].join(",") : undefined} onChange={(event) => { if (event.target.files) queue.addFiles(event.target.files); event.target.value = ""; }} />

      {policy.isError && <p className="mt-3 text-sm text-destructive" role="alert">No se ha podido preparar la subida.</p>}
      {queue.selectionErrors.length > 0 && <div className="mt-3 text-sm text-destructive" role="alert">{queue.selectionErrors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>}

      {queue.tasks.length > 0 && (
        <ul className="mt-5 space-y-3" aria-label="Subidas">
          {queue.tasks.map(task => (
            <li key={task.id} className="rounded-md border bg-background/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(task.file.size)} · {task.status === "done" ? "Compartido" : task.status === "canceled" ? "Cancelado" : task.status === "failed" ? "Interrumpido" : task.status === "queued" ? "En espera" : task.status === "retrying" ? "Reintentando…" : `${task.progress}%`}</p>
                </div>
                {(task.status === "uploading" || task.status === "retrying" || task.status === "queued") && <Button size="icon" variant="ghost" aria-label={`Cancelar ${task.file.name}`} onClick={() => queue.cancel(task.id)}><X /></Button>}
                {(task.status === "failed" || task.status === "canceled") && <Button size="sm" variant="outline" onClick={() => queue.retry(task.id)}><RotateCcw /> Reintentar</Button>}
              </div>
              <Progress className="mt-2 h-2" value={task.progress} aria-label={`Progreso de ${task.file.name}`} />
              {task.error && <p className="mt-2 text-xs text-destructive" role="alert">{task.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
