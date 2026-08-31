import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlbumShell } from "@/components/album/AlbumShell";
import { AlbumApiError, albumApi } from "@/lib/album-api";

export default function AlbumAdminPage() {
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState("");
  const [message, setMessage] = useState("");
  const status = useQuery({ queryKey: ["album-admin-status"], queryFn: albumApi.adminStatus, retry: false });

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await albumApi.createAdminSession(adminKey);
      setAdminKey("");
      await queryClient.invalidateQueries({ queryKey: ["album-admin-status"] });
    } catch (error) {
      setMessage(error instanceof AlbumApiError ? error.message : "No se pudo iniciar la sesión.");
    }
  }

  if (status.isError && status.error instanceof AlbumApiError && status.error.status === 401) {
    return (
      <AlbumShell>
        <form className="wedding-card mx-auto max-w-md p-6 sm:p-8" onSubmit={login}>
          <h2 className="section-title text-center">Administración</h2>
          <label className="form-label mt-6" htmlFor="admin-key">Clave de administración</label>
          <input id="admin-key" type="password" className="form-input" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} autoComplete="current-password" />
          {message && <p className="mt-2 text-sm text-destructive" role="alert">{message}</p>}
          <Button className="mt-4 w-full" type="submit">Entrar</Button>
        </form>
      </AlbumShell>
    );
  }

  if (status.isError) {
    return <AlbumShell><section className="wedding-card mx-auto max-w-md p-6 text-center"><h2 className="section-title">Administración</h2><p className="mt-3 text-sm text-muted-foreground">No se ha podido consultar el estado del servidor.</p><Button className="mt-4" variant="outline" onClick={() => void status.refetch()}>Reintentar</Button></section></AlbumShell>;
  }

  return (
    <AlbumShell>
      <section className="wedding-card mx-auto max-w-xl p-6 sm:p-8">
        <h2 className="section-title">Conexión con OneDrive</h2>
        <p className="mt-3 text-sm text-muted-foreground">Estado: {status.isLoading ? "Comprobando…" : status.data?.connected ? "Conectado" : "Sin conectar"}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => window.location.assign("/api/admin/microsoft/connect")}>Conectar OneDrive</Button>
          <Button variant="outline" disabled={!status.data?.connected} onClick={() => void albumApi.testOneDrive().then((result) => setMessage(`Conexión correcta: ${result.itemName}`)).catch((error) => setMessage(error instanceof AlbumApiError ? error.message : "La prueba ha fallado."))}>Probar conexión</Button>
        </div>
        {message && <p className="mt-4 text-sm" role="status">{message}</p>}
      </section>
    </AlbumShell>
  );
}
