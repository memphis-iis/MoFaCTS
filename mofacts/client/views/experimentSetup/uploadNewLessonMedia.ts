// Drag-and-drop and the file picker can start overlapping batches in the same browser.
const pendingNames = new Set<string>();

export async function uploadNewLessonMedia(
  files: File[],
  scope: string,
  exists: (name: string) => boolean,
  upload: (file: File, index: number) => Promise<void>,
) {
  const savedNames = new Set<string>();
  const duplicates = new Set<string>();
  const errors: Array<{ name: string; error: unknown }> = [];
  let uploaded = 0;
  for (const [index, file] of files.entries()) {
    const key = JSON.stringify([scope, file.name]);
    try {
      if (savedNames.has(file.name) || pendingNames.has(key) || exists(file.name)) {
        duplicates.add(file.name);
        continue;
      }
      pendingNames.add(key);
      try {
        await upload(file, index);
        savedNames.add(file.name);
        uploaded++;
      } finally {
        pendingNames.delete(key);
      }
    } catch (error) {
      errors.push({ name: file.name, error });
    }
  }
  return { uploaded, duplicates: [...duplicates], errors };
}
