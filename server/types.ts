export type MediaStatus = "uploading" | "visible" | "failed";

export type MediaRecord = {
  id: string;
  guestId: string;
  guestName: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  onedriveItemId: string | null;
  status: MediaStatus;
  createdAt: string;
  updatedAt: string;
};

export type MediaPage = {
  items: MediaRecord[];
  nextCursor: string | null;
};

export type StoredOAuthToken = {
  id: "microsoft";
  encryptedRefreshToken: string;
  updatedAt: string;
};

export type GuestIdentity = {
  guestId: string;
  displayName: string;
  exp: number;
};

export type AccessGrant = {
  granted: true;
  exp: number;
};

export type AdminSession = {
  admin: true;
  exp: number;
};

export type OAuthAttempt = {
  state: string;
  codeVerifier: string;
  exp: number;
};

