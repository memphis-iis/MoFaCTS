import { Random } from 'meteor/random';

// Keep filename-only references to older media unambiguous. New lesson
// references use the exact asset ID returned by the upload.
export function versionedAssetFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  return stem + '-' + Random.id() + extension;
}
