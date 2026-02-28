import { requireAdmin } from "../../../lib/security.js";

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  return Response.json({
    SUPABASE_URL:              !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    DEFAULT_ADMIN_PASS:        !!process.env.DEFAULT_ADMIN_PASS,
    NEXTAUTH_SECRET:           !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL:              process.env.NEXTAUTH_URL,
    NODE_ENV:                  process.env.NODE_ENV,
  });
}
