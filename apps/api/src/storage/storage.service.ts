import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../common/api-error';

@Injectable()
export class StorageService {
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
    if (error) throw new AppError('UPLOAD_EXPIRED', error.message, 502);
    return data.signedUrl;
  }

  async signedDownloadUrl(key: string, filename: string, disposition: 'inline' | 'attachment') {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, 300, {
        download: disposition === 'attachment' ? filename : undefined,
      });
    if (error) throw new AppError('NODE_NOT_FOUND', error.message, 404);
    return data.signedUrl;
  }
}
