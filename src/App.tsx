import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { appRoute } from "./lib/app-route";

const queryClient = new QueryClient();
const AlbumPage = lazy(() => import("./pages/AlbumPage.tsx"));
const AlbumAdminPage = lazy(() => import("./pages/AlbumAdminPage.tsx"));

function CurrentPage() {
  switch (appRoute(window.location.pathname)) {
    case "home": return <Index />;
    case "album": return <Suspense fallback={null}><AlbumPage /></Suspense>;
    case "admin": return <Suspense fallback={null}><AlbumAdminPage /></Suspense>;
    default: return <NotFound />;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <CurrentPage />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
