import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  if (auth.session.user.rol !== 'admin') return Response.json({ error: 'Solo admin' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('logo');
  const empresa_id = formData.get('empresa_id');

  if (!file || !empresa_id) return Response.json({ error: 'Faltan datos' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `empresa-${empresa_id}/logo.${ext}`;

  const { error: uploadError } = await db()
    .storage
    .from('empresa-logos')
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

  const logoUrl = `https://dlzhwqlercetfgdntvzn.supabase.co/storage/v1/object/public/empresa-logos/${path}`;

  const { data: emp } = await db().from('empresas').select('config').eq('id', empresa_id).single();
  const config = { ...(emp?.config || {}), logoUrl };
  await db().from('empresas').update({ config }).eq('id', empresa_id);

  return Response.json({ logoUrl });
}
