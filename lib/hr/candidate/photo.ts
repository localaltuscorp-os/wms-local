/** Candidate-intake photo storage paths accepted by the signed-read actions. */
export function isCandidatePhotoPath(path: string): boolean {
  return /^candidate-intake\/(?:photo\/[0-9a-f-]+|[0-9a-f-]{36}\/(?:photo-[0-9a-f-]+|photo\/[0-9a-f-]+))\.(?:jpe?g|png|webp|heic|heif)$/i.test(path);
}
