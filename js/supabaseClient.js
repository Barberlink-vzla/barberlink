// js/supabaseClient.js
const SUPABASE_URL = 'https://ktoboiohgwsdjdggjdyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b2JvaW9oZ3dzZGpkZ2dqZHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyMjM1OTAsImV4cCI6MjA2Mzc5OTU5MH0.Rs1F3p9h9BacH1Vd2MyoqErzVKI_do2zYHy2bAIDUvw';

/**
 * Cliente de Supabase único y global para toda la aplicación.
 * Se asume que el script de Supabase CDN ya se ha cargado.
 * @type {supabase.SupabaseClient}
 */
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Unified Supabase Client Initialized ✅");
