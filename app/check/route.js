export const dynamic = 'force-dynamic';

export async function GET() {
  const envs = {
    SUPABASE_URL:              process.env['SUPABASE_URL'] ? 'SET: ' + process.env['SUPABASE_URL'].slice(0,30) : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] ? 'SET (len=' + process.env['SUPABASE_SERVICE_ROLE_KEY'].length + ')' : 'MISSING',
    DEFAULT_ADMIN_PASS:        process.env['DEFAULT_ADMIN_PASS'] ? 'SET' : 'MISSING',
    NEXTAUTH_SECRET:           process.env['NEXTAUTH_SECRET'] ? 'SET (len=' + process.env['NEXTAUTH_SECRET'].length + ')' : 'MISSING',
    NEXTAUTH_URL:              process.env['NEXTAUTH_URL'] || 'MISSING',
    NODE_ENV:                  process.env['NODE_ENV'],
  };

  // Probar getUsers() completo
  let getUsersTest = 'not_tested';
  try {
    const { getUsers } = await import('../../lib/security.js');
    const users = await getUsers();
    getUsersTest = 'OK: ' + JSON.stringify(Object.keys(users));
  } catch (e) {
    getUsersTest = 'ERROR: ' + e.message;
  }

  // Probar conexión directa a Supabase
  let supabaseTest = 'not_tested';
  let usuariosTest = 'not_tested';
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
      supabaseTest = 'ERROR: missing env vars';
    } else {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      supabaseTest = 'client_created_ok';
      const { data, error } = await client.from('usuarios').select('username, rol').limit(5);
      if (error) {
        usuariosTest = 'QUERY_ERROR: ' + error.message;
      } else {
        usuariosTest = 'OK: ' + JSON.stringify((data || []).map(u => ({ username: u.username, rol: u.rol })));
      }
    }
  } catch (e) {
    supabaseTest = 'EXCEPTION: ' + e.message;
  }

  return Response.json({ envs, getUsersTest, supabaseTest, usuariosTest });
}
