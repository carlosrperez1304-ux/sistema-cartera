import { db } from '../../../lib/supabase.js';
import { requireAdmin } from '../../../lib/security.js';

function escapeSQL(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val;
  if (Array.isArray(val)) return "'{" + val.map(v => typeof v === 'string' ? '"' + v.replace(/"/g, '\\"') + '"' : v).join(',') + "}'";
  if (typeof val === 'object') return "'" + JSON.stringify(val).replace(/'/g, "''") + "'";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function generarInserts(tabla, rows) {
  if (!rows || rows.length === 0) return '-- Sin datos en ' + tabla + '\n\n';
  const columnas = Object.keys(rows[0]);
  let sql = '-- ============================================\n-- TABLA: ' + tabla + ' (' + rows.length + ' registros)\n-- ============================================\n';
  rows.forEach(row => {
    const valores = columnas.map(col => escapeSQL(row[col])).join(', ');
    sql += 'INSERT INTO ' + tabla + ' (' + columnas.join(', ') + ') VALUES (' + valores + ');\n';
  });
  sql += '\n';
  return sql;
}

export async function GET(req) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const tablas = [
      'empresas', 'usuarios', 'clientes', 'creditos', 'abonos',
      'subgrupos_cliente', 'grupos_blueline', 'grupos_vinculos',
      'factura_mensual_blueline', 'cotizaciones', 'gestiones',
      'pagos', 'vendedores', 'plantillas', 'tickets',
      'delegations', 'delegation_clients', 'obligaciones',
      'recordatorios_enviados', 'notas_dashboard', 'permisos_rol',
      'config', 'activaciones', 'historial_meses', 'historial_conciliaciones'
    ];
    let backupSQL = '-- BACKUP COMPLETO PayTrack/CartaMaster\n-- Generado: ' + new Date().toISOString() + '\n\n';

    for (const tabla of tablas) {
      try {
        const { data, error } = await db().from(tabla).select('*');
        if (error) {
          backupSQL += '-- Error al leer ' + tabla + ': ' + error.message + '\n\n';
          continue;
        }
        backupSQL += generarInserts(tabla, data);
      } catch (e) {
        backupSQL += '-- Excepcion al leer ' + tabla + ': ' + e.message + '\n\n';
      }
    }

    return new Response(backupSQL, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="backup_paytrack_' + new Date().toISOString().split('T')[0] + '.sql"'
      }
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
