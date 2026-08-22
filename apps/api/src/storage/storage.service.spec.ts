const OLD_ENV = process.env;

beforeEach(() => {
  process.env = {
    ...OLD_ENV,
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    STORAGE_BUCKET: 'data-room-files',
  };
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe('StorageService.storageKey', () => {
  it('builds the key from dataRoomId and versionId, one blob per version', () => {
    const { StorageService } = require('./storage.service');
    const service = new StorageService();

    expect(service.storageKey('room-1', 'version-1')).toBe('room-1/version-1');
  });

  it('produces distinct keys for distinct versions of the same room', () => {
    const { StorageService } = require('./storage.service');
    const service = new StorageService();

    const a = service.storageKey('room-1', 'version-1');
    const b = service.storageKey('room-1', 'version-2');

    expect(a).not.toBe(b);
  });

  it('never lets one data room collide with another under the same version id', () => {
    const { StorageService } = require('./storage.service');
    const service = new StorageService();

    expect(service.storageKey('room-1', 'v1')).not.toBe(service.storageKey('room-2', 'v1'));
  });
});
