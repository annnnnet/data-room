import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../common/api-error';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: SupabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  private bucket = process.env.STORAGE_BUCKET!;

  /** `${dataRoomId}/${versionId}` — one blob per version, never reused. */
  storageKey(dataRoomId: string, versionId: string) {
    return `${dataRoomId}/${versionId}`;
  }

  async signedUploadUrl(key: string): Promise<string> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(key);
    if (error) {
      // Nothing "expired" here — minting the URL itself failed (bad
      // credentials, bucket misconfiguration, provider outage, ...). Log the
      // provider's raw detail server-side only; clients get a generic
      // message so we never forward Supabase internals to them.
      this.logger.error(`Failed to mint an upload URL for ${key}: ${error.message}`);
      throw new AppError('INTERNAL', 'Could not create an upload URL, please try again', 500);
    }
    return data.signedUrl;
  }

  async signedDownloadUrl(key: string, filename: string, disposition: 'inline' | 'attachment') {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, 300, {
        download: disposition === 'attachment' ? filename : undefined,
      });
    if (error) {
      this.logger.error(`Failed to mint a download URL for ${key}: ${error.message}`);
      throw new AppError('NODE_NOT_FOUND', 'File not found', 404);
    }
    return data.signedUrl;
  }

  /**
   * True only if an object actually sits behind `key`. `complete()` calls
   * this before flipping a version to READY — without it, a client can skip
   * the PUT entirely and the file lists as available while every download
   * 404s.
   */
  async objectExists(key: string): Promise<boolean> {
    const idx = key.lastIndexOf('/');
    const dir = idx === -1 ? '' : key.slice(0, idx);
    const name = idx === -1 ? key : key.slice(idx + 1);
    const { data, error } = await this.client.storage.from(this.bucket).list(dir, { search: name });
    if (error) {
      this.logger.error(`Failed to check object existence for ${key}: ${error.message}`);
      throw new AppError('INTERNAL', 'Could not verify the upload, please try again', 500);
    }
    return (data ?? []).some((f) => f.name === name);
  }
}
