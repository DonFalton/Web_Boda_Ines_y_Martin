import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlbumShell } from "@/components/album/AlbumShell";
import { GuestGate } from "@/components/album/GuestGate";
import { UploadPanel } from "@/components/album/UploadPanel";
import { GalleryGrid } from "@/components/album/GalleryGrid";
import { AlbumApiError, albumApi } from "@/lib/album-api";

export default function AlbumPage() {
  const queryClient = useQueryClient();
  const exchangeStarted = useRef(false);
  const [exchangePending, setExchangePending] = useState(Boolean(window.location.hash));
  const [exchangeError, setExchangeError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const session = useQuery({ queryKey: ["album-session"], queryFn: albumApi.session, enabled: !exchangePending, retry: false });

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access");
    if (!window.location.hash) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (!accessToken) {
      setExchangePending(false);
      return;
    }
    void albumApi.exchangeAccess(accessToken)
      .then(() => queryClient.invalidateQueries({ queryKey: ["album-session"] }))
      .catch((error) => setExchangeError(error instanceof AlbumApiError ? error.message : "El enlace no se ha podido validar."))
      .finally(() => setExchangePending(false));
  }, [queryClient]);

  async function identityUpdated() {
    await queryClient.invalidateQueries({ queryKey: ["album-session"] });
    setEditingIdentity(false);
  }

  if (exchangePending || session.isLoading) {
    return <AlbumShell><p className="text-center text-sm text-muted-foreground" role="status">Preparando el álbum…</p></AlbumShell>;
  }

  if (exchangeError || session.isError || !session.data?.hasAccess) {
    return (
      <AlbumShell>
        <section className="wedding-card mx-auto max-w-lg p-6 text-center sm:p-8">
          <h2 className="section-title">Álbum privado</h2>
          <p className="mt-3 text-sm text-muted-foreground">{exchangeError || "Abre el enlace privado que te enviaron Inés y Martín para acceder."}</p>
        </section>
      </AlbumShell>
    );
  }

  if (!session.data.guest) {
    return <AlbumShell><GuestGate onCreated={() => queryClient.invalidateQueries({ queryKey: ["album-session"] })} /></AlbumShell>;
  }

  if (editingIdentity) {
    return (
      <AlbumShell>
        <GuestGate
          editing
          initialDisplayName={session.data.guest.displayName}
          onCancel={() => setEditingIdentity(false)}
          onCreated={identityUpdated}
        />
      </AlbumShell>
    );
  }

  return (
    <AlbumShell>
      <div className="mb-3 flex h-12 items-center justify-between gap-2 rounded-lg border border-primary/10 bg-card/70 px-3 sm:mb-4 sm:px-4">
        <p className="text-sm text-muted-foreground">Hola, <strong className="font-medium text-foreground">{session.data.guest.displayName}</strong></p>
        <Button className="h-9 px-2 text-xs sm:text-sm" variant="link" size="sm" onClick={() => setEditingIdentity(true)}>Cambiar</Button>
      </div>
      <UploadPanel mobileActionHidden={selectionMode} />
      <GalleryGrid onSelectionModeChange={setSelectionMode} />
    </AlbumShell>
  );
}
