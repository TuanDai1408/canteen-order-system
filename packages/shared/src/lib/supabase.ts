import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string): string => {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    if (meta && meta.env && meta.env[key]) {
      return String(meta.env[key]);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return String(process.env[key]);
    }
  } catch {
    // ignore
  }
  return '';
};

const defaultUrl = 'https://auxmpozdvuvefnyfclcp.supabase.co';
const defaultKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eG1wb3pkdnV2ZWZueWZjbGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5OTcxMDAsImV4cCI6MjEwNTU3MzEwMH0.6q5tNRbOnd-4DFrRRXK_CZ1Zx1tirnsOKHT4mSYcIUY';

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || defaultUrl;
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || defaultKey;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('placeholder')
);

if (isSupabaseConfigured) {
  console.info('[@canteen/shared] Connected directly to Supabase:', supabaseUrl);
} else {
  console.info('[@canteen/shared] Running with local storage fallback.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


