/**
 * URL shape for a local-dummy storage object.
 *
 * This is deliberately separate from `objects.ts`: pages that only need to
 * display a local URL must not pull filesystem-backed storage operations into
 * their server bundle.
 */
export const DUMMY_OBJECT_ROUTE = "/api/dummy-storage";

export function dummyObjectUrl(bucket: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${DUMMY_OBJECT_ROUTE}/${encodeURIComponent(bucket)}/${encodedPath}`;
}
