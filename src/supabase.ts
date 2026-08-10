import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

function normalizeSupabaseUrl(value?: string) {
  return value?.replace(/\/rest\/v1\/?$/i, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseAnonKey.includes('your-anon-key'),
  );
}

export const supabase =
  isSupabaseConfigured()
    ? createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: {
          storage: Platform.OS === 'web' ? undefined : AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;
