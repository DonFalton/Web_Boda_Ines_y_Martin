import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { UploadPanel } from "./UploadPanel";
import { albumApi, type UploadPolicy } from "@/lib/album-api";
import type { UploadTask } from "@/lib/upload-queue";

const mocks = vi.hoisted(() => ({
  queue: {
    tasks: [] as UploadTask[],
    selectionErrors: [] as string[],
    addFiles: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
  },
}));

vi.mock("@/lib/upload-queue", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/upload-queue")>();
  return { ...original, useUploadQueue: () => mocks.queue };
});

vi.mock("@/lib/album-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/album-api")>();
  return { ...original, albumApi: { ...original.albumApi, uploadPolicy: vi.fn() } };
});

const policy: UploadPolicy = {
  maxFileBytes: 100_000_000,
  maxBatchFiles: 50,
  chunkBytes: 10 * 1024 * 1024,
  parallelFiles: 2,
  acceptedTypes: ["image/jpeg", "video/mp4"],
  acceptedExtensions: ["jpg", "jpeg", "mp4"],
  genericTypes: ["", "application/octet-stream"],
  typeExtensions: { "image/jpeg": ["jpg", "jpeg"], "video/mp4": ["mp4"] },
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><UploadPanel /></QueryClientProvider>);
}

describe("UploadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queue.tasks = [];
    mocks.queue.selectionErrors = [];
    vi.mocked(albumApi.uploadPolicy).mockResolvedValue(policy);
  });

  it("offers a mobile upload action while keeping drag and drop desktop-only", async () => {
    renderPanel();
    const mobileAction = await screen.findByTestId("mobile-upload-action");
    const desktopDropzone = screen.getByTestId("desktop-upload-dropzone");
    expect(mobileAction.parentElement).toHaveClass("sm:hidden");
    expect(desktopDropzone.parentElement).toHaveClass("hidden", "sm:flex");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toHaveAttribute("multiple");
    expect(input?.accept).toContain("image/*");
    expect(input?.accept).toContain("video/*");
  });

  it("shows active uploads as compact aggregate progress", async () => {
    mocks.queue.tasks = [{
      id: "upload-1",
      file: new File(["photo"], "recuerdo.jpg", { type: "image/jpeg" }),
      status: "uploading",
      progress: 42,
    }];
    renderPanel();
    expect((await screen.findAllByText("Subiendo 1 de 1")).length).toBe(2);
    expect(screen.getAllByLabelText("Progreso total de las subidas")).toHaveLength(2);
    expect(screen.getAllByText("42%")).toHaveLength(2);
  });
});
