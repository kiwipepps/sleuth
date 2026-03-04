import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uyfgnfrnbcrabwdboqic.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZmduZnJuYmNyYWJ3ZGJvcWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODQxNDcsImV4cCI6MjA4ODE2MDE0N30.b4q21wSm3bXkMyWNGEutuwEm7SluicX3mnF2FQMrdtE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);