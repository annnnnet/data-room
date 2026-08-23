import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * The smoke test needs a real, confirmed Supabase user to sign in as.
 * Signing up through the actual auth flow is rate-limited (a previous run
 * hit `429 over_email_send_rate_limit`) and requires clicking an email
 * confirmation link, neither of which a CI-style test run can do. Instead
 * this creates the user directly via the Supabase Admin API (service-role
 * key), with `email_confirm: true` so it's usable immediately — the same
 * approach a previous agent used for the API's own e2e fixtures.
 *
 * The service-role key lives only in `apps/api/.env` (gitignored, never
 * committed) and is read from there at run time — it is never hardcoded
 * or checked in. The user this creates is deleted again in global-teardown
 * so re-running the suite never accumulates garbage accounts; the email is
 * still randomized per run as a belt-and-suspenders guard against a leftover
 * user from a previous run that crashed before teardown ran.
 */
function loadApiEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../../api/.env');
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Cannot find ${envPath}. The e2e smoke test needs SUPABASE_URL and ` +
        'SUPABASE_SERVICE_ROLE_KEY from apps/api/.env to create a confirmed test user.',
    );
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const STATE_FILE = path.resolve(__dirname, '.e2e-user.json');

export default async function globalSetup() {
  const env = loadApiEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from apps/api/.env');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `e2e-smoke-${randomUUID()}@example.com`;
  const password = `Sm0ke-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create e2e test user via Supabase Admin API: ${error?.message}`);
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ userId: data.user.id, email, supabaseUrl, serviceRoleKey }),
  );

  // Playwright forks worker processes from this same Node process, so env
  // set here is inherited by every test file's process.env.
  process.env.E2E_EMAIL = email;
  process.env.E2E_PASSWORD = password;
}
