import { supabase } from './supabase';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Storage columns historically store the full "public" object URL
 * (e.g. https://.../storage/v1/object/public/item-photos/foo.jpg).
 * Buckets are now private, so we resolve that same string down to a
 * storage path and mint a short-lived signed URL from it on read.
 */
function extractPath(bucket: string, urlOrPath: string): string {
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const publicIdx = urlOrPath.indexOf(publicMarker);
  if (publicIdx !== -1) return urlOrPath.slice(publicIdx + publicMarker.length);

  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  const signIdx = urlOrPath.indexOf(signMarker);
  if (signIdx !== -1) return urlOrPath.slice(signIdx + signMarker.length).split('?')[0];

  return urlOrPath;
}

export async function getSignedUrl(bucket: string, urlOrPath: string | null | undefined): Promise<string | null> {
  if (!urlOrPath) return null;
  const path = extractPath(bucket, urlOrPath);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Batch-resolve multiple stored URLs/paths at once.
 * Returns a map keyed by the ORIGINAL input string, so callers can
 * look up `map[item.foto_urls[i]]` without re-deriving the path.
 */
export async function getSignedUrls(bucket: string, urlsOrPaths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const inputs = urlsOrPaths.filter((u): u is string => !!u);
  if (inputs.length === 0) return {};

  const paths = inputs.map((u) => extractPath(bucket, u));
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  data.forEach((entry, i) => {
    if (entry.signedUrl) map[inputs[i]] = entry.signedUrl;
  });
  return map;
}
