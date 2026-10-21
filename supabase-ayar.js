/* Supabase proje ayarları — Veri Girişi modülü için. Kurulum: supabase/KURULUM.md
 * url ve anonKey herkese açık bilgidir (güvenlik supabase/kurulum.sql'deki satır bazlı yetkilere dayanır).
 * Buraya ASLA "service_role" anahtarı yazmayın. Boş bırakılırsa panel Excel verisiyle çalışmaya devam eder.
 */
window.SUPABASE = {
  url: 'https://jjuouepazyvtfyqvortq.supabase.co',
  // "anon" (herkese açık) anahtar: rolü anon'dur; yazma satır bazlı yetkiyle engellenir (doğrulandı: anon yazma 42501 ile reddedilir)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqdW91ZXBhenl2dGZ5cXZvcnRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MDk4NjUsImV4cCI6MjEwODE4NTg2NX0.PyGMiI-Jrt5aFydSy0vtAYIvPAxoF3k7chdeHmKmJgA',
};
