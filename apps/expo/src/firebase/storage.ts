import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './client';

const downloadUrlCache = new Map<string, string>();

export function invalidateDownloadUrl(path: string) {
  downloadUrlCache.delete(path);
}

export async function getDownloadUrlCached(path: string): Promise<string> {
  const cached = downloadUrlCache.get(path);
  if (cached) return cached;

  const url = await getDownloadURL(ref(storage, path));
  downloadUrlCache.set(path, url);
  return url;
}

export function getUserAvatarPath(userId: string) {
  return `avatars/${userId}.jpg`;
}

/**
 * Uploads an avatar image to Firebase Storage at a stable path: avatars/{uid}.jpg
 * Overwrites existing file (same path) to avoid multiplying files.
 */
export async function uploadUserAvatarJpeg(userId: string, localUri: string): Promise<string> {
  const storagePath = getUserAvatarPath(userId);

  const response = await fetch(localUri);
  const blob = await response.blob();

  // NOTE: we set cacheControl to force clients to revalidate after overwrite.
  await uploadBytes(ref(storage, storagePath), blob, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=0',
  });

  invalidateDownloadUrl(storagePath);
  return storagePath;
}
