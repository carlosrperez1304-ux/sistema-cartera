import { requireAdmin, readAuditLog, checkApiRateLimit, getIP, auditLog } from '../../../lib/security.js';

// GET — últimas líneas del audit log (solo admins)
export async function GET(req) {
  const rl = checkApiRateLimit(req, 'GET:/api/audit');
  if (rl.blocked) {
    return Response.json({ error: rl.message }, { status: 429 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    auditLog('ACCESS_DENY', '?', getIP(req), `GET /api/audit: ${auth.error}`);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const lines = Math.min(parseInt(searchParams.get('lines') || '200', 10), 500);

  const entries = readAuditLog(lines);
  return Response.json({ entries, total: entries.length });
}
