import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { getSupabaseAdmin, isSupabaseStorageConfigured, storageBucket } from './supabase';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export type ImageFolder = 'logos' | 'candidates';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(path.join(UPLOAD_ROOT, 'logos'));
ensureDir(path.join(UPLOAD_ROOT, 'candidates'));

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.jpg';
  }
}

function imageFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
    return;
  }
  cb(null, true);
}

/** Always buffer in memory — then push to Supabase Storage (or local disk fallback). */
const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: imageFilter,
});

export const logoUpload = memory;
export const candidateImageUpload = memory;

function objectKey(folder: ImageFolder, scope: string, filename: string): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${folder}/${safeScope}/${filename}`;
}

/** Public URL path for legacy local-disk files (still served by express.static). */
export function publicUploadUrl(subdir: ImageFolder, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

/**
 * Persist an uploaded image. Prefer Supabase Storage bucket `images` when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise write under uploads/.
 * Returns the URL to store in LogoURL / ImageURL.
 */
export async function storeImage(
  folder: ImageFolder,
  file: Express.Multer.File,
  scope: string
): Promise<string> {
  const filename = `${crypto.randomUUID()}${extensionFor(file.mimetype)}`;
  const key = objectKey(folder, scope, filename);
  const buffer = file.buffer;

  if (!buffer?.length) {
    throw new Error('Empty upload buffer');
  }

  if (isSupabaseStorageConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const bucket = storageBucket();
    const { error } = await supabase.storage.from(bucket).upload(key, buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '3600',
    });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(key);
    return data.publicUrl;
  }

  // Local fallback for developers without Storage credentials.
  const dir = path.join(UPLOAD_ROOT, folder, scope.replace(/[^a-zA-Z0-9_-]/g, '_'));
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/${folder}/${scope.replace(/[^a-zA-Z0-9_-]/g, '_')}/${filename}`;
}

/** Best-effort delete of a previously stored image (Supabase object or local file). */
export async function removeStoredImage(url: string | null | undefined): Promise<void> {
  if (!url) return;

  try {
    if (url.startsWith('/uploads/')) {
      const relative = url.replace(/^\//, ''); // uploads/...
      const absolute = path.resolve(process.cwd(), relative);
      if (absolute.startsWith(UPLOAD_ROOT) && fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
      return;
    }

    const objectPath = objectPathFromStoredUrl(url);
    if (!objectPath || !isSupabaseStorageConfigured()) return;

    const supabase = getSupabaseAdmin()!;
    await supabase.storage.from(storageBucket()).remove([objectPath]);
  } catch (err) {
    console.warn('Failed to remove stored image', url, err);
  }
}

/** Extract bucket-relative path from a Supabase public URL (or return raw path). */
function objectPathFromStoredUrl(url: string): string | null {
  const bucket = storageBucket();
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) {
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]!);
  }
  // Already a relative object key
  if (url.startsWith('logos/') || url.startsWith('candidates/')) {
    return url;
  }
  return null;
}
