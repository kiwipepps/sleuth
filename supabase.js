import 'react-native-url-polyfill/auto'; // You probably already have this
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://uyfgnfrnbcrabwdboqic.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZmduZnJuYmNyYWJ3ZGJvcWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODQxNDcsImV4cCI6MjA4ODE2MDE0N30.b4q21wSm3bXkMyWNGEutuwEm7SluicX3mnF2FQMrdtE';


export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,          // Tells Supabase to save the session here
    autoRefreshToken: true,         // Automatically refreshes the token behind the scenes
    persistSession: true,           // Keeps the user logged in across app restarts
    detectSessionInUrl: false,      // Set to false for React Native
  },
});