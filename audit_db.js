const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://dlzhwqlercetfgdntvzn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsemh3cWxlcmNldGZnZG50dnpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyNzUyOSwiZXhwIjoyMDg3MDAzNTI5fQ.Ff8RqT8FiL0BdiJiV2Pzd0Yj85C8JXHsx-FkN3hj50Y'
);
async function main() {
  // Clientes por usuario
  const { data: cls } = await sb.from('clientes').select('empresa_id, creado_por, monto');
  const porUser = {};
  (cls||[]).forEach(c => {
    const k = c.creado_por || '(sin usuario)';
    if (!porUser[k]) porUser[k] = { total:0, monto0:0 };
    porUser[k].total++;
    if (parseFloat(c.monto||0) === 0) porUser[k].monto0++;
  });
  console.log('=== CLIENTES por usuario ===');
  Object.entries(porUser).forEach(([k,v]) =>
    console.log(' ', k.padEnd(16), 'total:', v.total, '| con monto=0:', v.monto0)
  );

  // Audit log - cuántas entradas y fecha más antigua
  const { data: alOld } = await sb.from('audit_log').select('fecha').order('fecha', { ascending: true }).limit(1);
  const { data: alNew } = await sb.from('audit_log').select('fecha').order('fecha', { ascending: false }).limit(1);
  console.log('\n=== AUDIT LOG ===');
  console.log('  Más antigua:', alOld?.[0]?.fecha?.slice(0,10));
  console.log('  Más reciente:', alNew?.[0]?.fecha?.slice(0,10));

  // Historial JSON dentro de clientes
  const { data: conHist } = await sb.from('clientes').select('id, historial').not('historial', 'is', null);
  let totalEntradas = 0;
  let bytesHistorial = 0;
  (conHist||[]).forEach(c => {
    totalEntradas += (c.historial||[]).length;
    bytesHistorial += JSON.stringify(c.historial||[]).length;
  });
  console.log('\n=== HISTORIAL en clientes (columna JSON) ===');
  console.log('  Clientes con historial:', (conHist||[]).length);
  console.log('  Total entradas:', totalEntradas);
  console.log('  Tamaño aprox:', (bytesHistorial/1024).toFixed(1), 'KB');

  // Clientes sin contacto (no son "innecesarios" pero es info útil)
  const { data: sinContacto } = await sb.from('clientes').select('id', { count: 'exact', head: true }).is('contacto', null);
  console.log('\n=== Sin contacto:', sinContacto);

  // Tags totales
  const { data: conTags } = await sb.from('clientes').select('tags').not('tags', 'is', null);
  let totalTags = 0;
  (conTags||[]).forEach(c => { totalTags += (c.tags||[]).length; });
  console.log('\n=== TAGS ===');
  console.log('  Clientes con tags:', (conTags||[]).length, '| Total tags:', totalTags);
}
main().catch(console.error);
