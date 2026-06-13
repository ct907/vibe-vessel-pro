// Browser-only Google auth via Google Identity Services (GIS) token client.
// No backend, no refresh token: we request a short-lived access token with the
// `drive.file` scope (the app can only see files it created). The token is held
// in memory + sessionStorage and silently re-requested when it expires.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const TOKEN_KEY = "songwriters-notebook:drive-token:v1";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

let gsiPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;

export function getClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

export function isDriveConfigured(): boolean {
  return !!getClientId();
}

function loadGsi(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

function readStored(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredToken;
    if (data.expiresAt <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return readStored()?.token ?? null;
}

export function isConnected(): boolean {
  return readStored() !== null;
}

export function signOut() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function ensureTokenClient(): Promise<TokenClient> {
  const clientId = getClientId();
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID is not configured");
  await loadGsi();
  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => { /* replaced per-request below */ },
    });
  }
  return tokenClient;
}

// Request a fresh access token. `interactive` shows the consent/account popup;
// when false we attempt a silent refresh that succeeds if the Google session is
// still alive, otherwise the promise rejects and the caller can retry with a popup.
export async function requestAccessToken(interactive: boolean): Promise<string> {
  const client = await ensureTokenClient();
  return new Promise<string>((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error || !resp.access_token) {
        reject(new Error(resp.error || "Authorization failed"));
        return;
      }
      const stored: StoredToken = {
        token: resp.access_token,
        expiresAt: Date.now() + (resp.expires_in - 60) * 1000,
      };
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
      } catch { /* ignore quota */ }
      resolve(resp.access_token);
    };
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

// Returns a usable token, refreshing silently or prompting only if needed.
export async function getAccessToken(): Promise<string> {
  const stored = readStored();
  if (stored) return stored.token;
  try {
    return await requestAccessToken(false);
  } catch {
    return requestAccessToken(true);
  }
}

export async function connect(): Promise<string> {
  return requestAccessToken(true);
}
