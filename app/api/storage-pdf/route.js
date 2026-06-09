import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dlzhwqlercetfgdntvzn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsemh3cWxlcmNldGZnZG50dnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Mjc1MjksImV4cCI6MjA4NzAwMzUyOX0.bleTLb4LWKRSt1YDDDyvX9_vFqbh6S1BzCveEib1gMg'
);

export async function POST(req) {
  try {
    const { base64, nombre, clienteId } = await req.json();
    if (!base64 || !nombre || !clienteId) {
      return Response.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // Convertir base64 a buffer
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    // Nombre único del archivo
    const fecha = new Date().toISOString().split('T')[0];
    const nombreArchivo = `${clienteId}/${fecha}_${nombre}`;

    // Subir a Supabase Storage
    const { data, error } = await supabase.storage
      .from('facturas-pdfs')
      .upload(nombreArchivo, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Obtener URL firmada válida por 30 días
    const { data: urlData } = await supabase.storage
      .from('facturas-pdfs')
      .createSignedUrl(nombreArchivo, 60 * 60 * 24 * 30);

    return Response.json({ ok: true, url: urlData?.signedUrl, path: nombreArchivo });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');
    if (!path) return Response.json({ error: 'Falta path' }, { status: 400 });

    const { data } = await supabase.storage
      .from('facturas-pdfs')
      .createSignedUrl(path, 60 * 60 * 24 * 30);

    return Response.json({ ok: true, url: data?.signedUrl });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
