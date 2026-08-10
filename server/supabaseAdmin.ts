import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(value?: string) {
  return value?.replace(/\/rest\/v1\/?$/i, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseAdminConfigured() {
  return Boolean(
    supabaseUrl &&
      supabaseServiceRoleKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseServiceRoleKey.includes('your-service-role-key'),
  );
}

export function getSupabaseAdmin() {
  if (!isSupabaseAdminConfigured() || !supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase ainda nao configurado no backend do Norte.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getSupabaseUserFromAccessToken(accessToken: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error('Sessao do Supabase invalida ou expirada.');
  }

  return data.user;
}
