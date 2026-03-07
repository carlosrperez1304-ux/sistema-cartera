const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const sb = createClient(
  'https://dlzhwqlercetfgdntvzn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsemh3cWxlcmNldGZnZG50dnpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQyNzUyOSwiZXhwIjoyMDg3MDAzNTI5fQ.Ff8RqT8FiL0BdiJiV2Pzd0Yj85C8JXHsx-FkN3hj50Y'
);

const norm = s => (s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

function limpiarTelefono(val) {
  if (!val) return null;
  // Tomar solo el primer número si hay varios separados por " ::: "
  const primero = val.split(':::')[0].trim();
  // Limpiar a solo dígitos y el +
  const limpio = primero.replace(/[^\d+]/g, '');
  if (!limpio || limpio.length < 7) return null;
  return primero.trim(); // devolver formato legible
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
    // CSV parse simple (sin comillas internas complejas)
    const cols = lineas[i].split(',');
    const firstName  = (cols[idxFirst]  || '').trim();
    const middleName = (cols[idxMiddle] || '').trim();
    const lastName   = (cols[idxLast]   || '').trim();
    const phone1     = limpiarTelefono(cols[idxPhone1Val]);
    const phone2     = limpiarTelefono(cols[idxPhone2Val]);
    const telefono   = phone1 || phone2;

    if (!firstName || !telefono) continue;

    // El código es el lastName si es numérico
    const codigo = /^\d+$/.test(lastName) ? parseInt(lastName) : null;

    // Nombre completo: firstName + middleName (si middleName no es código)
    const esCodigoMiddle = /^\d+$/.test(middleName);
    const nombreCompleto = [firstName, esCodigoMiddle ? '' : middleName].filter(Boolean).join(' ').trim();

    contactos.push({ nombreCompleto, codigo, telefono });
  }
  return contactos;
}

async function main() {
  const csv = fs.readFileSync('/mnt/c/Users/Erick/Downloads/contacts.csv', 'utf8');
  const contactos = parsearCSV(csv);
  console.log(`Contactos en CSV: ${contactos.length}`);

  // Obtener clientes de A-CPEREZ
  const { data: clientes } = await sb
    .from('clientes')
    .select('id, nombre, contacto, codigo_cliente')
    .eq('empresa_id', 1);

  // Índice por nombre normalizado
  const porNombre = {};
  const porCodigo = {};
  (clientes || []).forEach(c => {
    porNombre[norm(c.nombre)] = c;
    if (c.codigo_cliente) porCodigo[c.codigo_cliente] = c;
  });

  let ok = 0, sinMatch = 0;
  const noMatch = [];

  for (const contacto of contactos) {
    // Buscar por código primero, luego por nombre
    let cliente = (contacto.codigo && porCodigo[contacto.codigo]) || porNombre[norm(contacto.nombreCompleto)];

    if (!cliente) { sinMatch++; noMatch.push(contacto.nombreCompleto); continue; }

    const { error } = await sb
      .from('clientes')
      .update({ contacto: contacto.telefono })
      .eq('id', cliente.id);

    if (error) {
      console.error(`ERROR [${cliente.nombre}]:`, error.message);
    } else {
      console.log(`✅ ${cliente.nombre} → ${contacto.telefono}`);
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
