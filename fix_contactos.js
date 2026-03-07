const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const sb = createClient(
  'https://dlzhwqlercetfgdntvzn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsemh3cWxlcmNldGZnZG50dnpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyNzUyOSwiZXhwIjoyMDg3MDAzNTI5fQ.Ff8RqT8FiL0BdiJiV2Pzd0Yj85C8JXHsx-FkN3hj50Y'
);

const norm = s => (s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

function limpiarTelefono(val) {
  if (!val) return null;
  const primero = val.split(':::')[0].trim();
  const limpio = primero.replace(/[^\d+]/g, '');
  if (!limpio || limpio.length < 7) return null;
  return primero.trim();
}

function parsearCSV(contenido) {
  const lineas = contenido.split('\n');
  const headers = lineas[0].split(',');
  const idxFirst  = headers.indexOf('First Name');
  const idxMiddle = headers.indexOf('Middle Name');
  const idxLast   = headers.indexOf('Last Name');
  const idxPhone1Val = headers.indexOf('Phone 1 - Value');
  const idxPhone2Val = headers.indexOf('Phone 2 - Value');

  const contactos = [];
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(',');
    const firstName  = (cols[idxFirst]  || '').trim();
    const middleName = (cols[idxMiddle] || '').trim();
    const lastName   = (cols[idxLast]   || '').trim();
    const phone1     = limpiarTelefono(cols[idxPhone1Val]);
    const phone2     = limpiarTelefono(cols[idxPhone2Val]);
    const telefono   = phone1 || phone2;

    if (!firstName || !telefono) continue;

    const codigo = /^\d+$/.test(lastName) ? parseInt(lastName) : null;
    const esCodigoMiddle = /^\d+$/.test(middleName);
    const nombreCompleto = [firstName, esCodigoMiddle ? '' : middleName].filter(Boolean).join(' ').trim();

    contactos.push({ nombreCompleto, codigo, telefono });
  }
  return contactos;
}

async function main() {
  // Paso 1: Limpiar contactos de clientes NO pertenecientes a A-CPEREZ
  console.log('Paso 1: Limpiando contactos de clientes que NO son de A-CPEREZ...');
  const { data: noAcperez, error: e1 } = await sb
    .from('clientes')
    .select('id, nombre, contacto, creado_por')
    .eq('empresa_id', 1)
    .neq('creado_por', 'A-CPEREZ')
    .not('contacto', 'is', null)
    .neq('contacto', '');

  if (e1) { console.error('Error consultando:', e1.message); process.exit(1); }

  console.log(`Clientes no-A-CPEREZ con contacto asignado: ${(noAcperez||[]).length}`);

  let limpiados = 0;
  for (const c of (noAcperez || [])) {
    const { error } = await sb
      .from('clientes')
      .update({ contacto: null })
      .eq('id', c.id);
    if (error) {
      console.error(`  ERROR limpiando [${c.nombre}]:`, error.message);
    } else {
      console.log(`  🧹 Limpiado: ${c.nombre} (${c.creado_por}) ← era: ${c.contacto}`);
      limpiados++;
    }
  }
  console.log(`\nLimpiados: ${limpiados}\n`);

  // Paso 2: Re-asignar contactos SOLO a clientes de A-CPEREZ
  console.log('Paso 2: Asignando contactos SOLO a clientes de A-CPEREZ...');
  const csv = fs.readFileSync('/mnt/c/Users/Erick/Downloads/contacts.csv', 'utf8');
  const contactos = parsearCSV(csv);
  console.log(`Contactos en CSV: ${contactos.length}`);

  const { data: clientes, error: e2 } = await sb
    .from('clientes')
    .select('id, nombre, contacto, codigo_cliente')
    .eq('empresa_id', 1)
    .eq('creado_por', 'A-CPEREZ');

  if (e2) { console.error('Error consultando clientes A-CPEREZ:', e2.message); process.exit(1); }

  console.log(`Clientes A-CPEREZ: ${(clientes||[]).length}`);

  const porNombre = {};
  const porCodigo = {};
  (clientes || []).forEach(c => {
    porNombre[norm(c.nombre)] = c;
    if (c.codigo_cliente) porCodigo[c.codigo_cliente] = c;
  });

  let ok = 0, sinMatch = 0;
  const noMatch = [];

  for (const contacto of contactos) {
    let cliente = (contacto.codigo && porCodigo[contacto.codigo]) || porNombre[norm(contacto.nombreCompleto)];

    if (!cliente) { sinMatch++; noMatch.push(contacto.nombreCompleto); continue; }

    const { error } = await sb
      .from('clientes')
      .update({ contacto: contacto.telefono })
      .eq('id', cliente.id);

    if (error) {
      console.error(`  ERROR [${cliente.nombre}]:`, error.message);
    } else {
      console.log(`  ✅ ${cliente.nombre} → ${contacto.telefono}`);
      ok++;
    }
  }

  console.log(`\n✅ Actualizados: ${ok} | ❌ Sin match: ${sinMatch}`);
  if (noMatch.length) {
    console.log('\nSin match:');
    noMatch.forEach(n => console.log('  -', n));
  }
}

main().catch(console.error);
