import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STATE_FILE = path.resolve(__dirname, '.e2e-user.json');

/** Deletes the confirmed test user global-setup created, so re-running the
 * smoke test never accumulates garbage accounts in the Supabase project. */
export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return;
  const { userId, supabaseUrl, serviceRoleKey } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`Failed to delete e2e test user ${userId}: ${error.message}`);
  } finally {
    fs.rmSync(STATE_FILE, { force: true });
  }
}
