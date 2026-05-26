import 'react-native-url-polyfill/auto'; // You probably already have this
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}


export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,          // Tells Supabase to save the session here
    autoRefreshToken: true,         // Automatically refreshes the token behind the scenes
    persistSession: true,           // Keeps the user logged in across app restarts
    detectSessionInUrl: false,      // Set to false for React Native
  },
});