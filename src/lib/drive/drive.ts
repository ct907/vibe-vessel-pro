// Minimal Google Drive v3 REST client scoped to the `drive.file` permission.
// Every request is authorized with the GIS access token. Files are grouped in a
// dedicated "Vibe Vessel" folder so they are easy to find in the user's Drive.

import { getAccessToken } from "./auth";

const FOLDER_NAME = "Vibe Vessel";
const ZIP_MIME = "application/zip";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    throw new Error(`Drive request failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return res;
}

let cachedFolderId: string | null = null;

async function ensureAppFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const q = encodeURIComponent(
    `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
  );
  const listRes = await authedFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
  );
  const list = (await listRes.json()) as { files: DriveFile[] };
  if (list.files.length > 0) {
    cachedFolderId = list.files[0].id;
    return cachedFolderId;
  }
  const createRes = await authedFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  const created = (await createRes.json()) as { id: string };
  cachedFolderId = created.id;
  return cachedFolderId;
}

async function findFileByName(name: string, folderId: string): Promise<DriveFile | null> {
  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`,
  );
  const res = await authedFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
  );
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files[0] ?? null;
}

// Create or overwrite a project zip by name, returning the file id.
export async function uploadProjectZip(name: string, blob: Blob): Promise<string> {
  const folderId = await ensureAppFolder();
  const existing = await findFileByName(name, folderId);

  if (existing) {
    await authedFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      { method: "PATCH", headers: { "Content-Type": ZIP_MIME }, body: blob },
    );
    return existing.id;
  }

  const metadata = { name, mimeType: ZIP_MIME, parents: [folderId] };
  const boundary = "vvp" + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${ZIP_MIME}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const res = await authedFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
  );
  const created = (await res.json()) as { id: string };
  return created.id;
}

export async function listProjects(): Promise<DriveFile[]> {
  const folderId = await ensureAppFolder();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await authedFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
  );
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files;
}

export async function downloadProject(fileId: string): Promise<Blob> {
  const res = await authedFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  );
  return res.blob();
}
