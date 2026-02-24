import { db } from "../../../lib/supabase.js";
import { requireAuth, checkCsrf, sanitize } from "../../../lib/security.js";

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const empresa_id = auth.session.user.empresa_id || null;
  const { searchParams } = new URL(req.url);
  const cliente_id = searchParams.get("cliente_id");

  let query = db().from("pagos").select("*").order("created_at", { ascending: false });
  if (empresa_id) query = query.eq("empresa_id", empresa_id);
  if (cliente_id) query = query.eq("cliente_id", parseInt(cliente_id));

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const monto = parseFloat(body.monto);
  if (!monto || isNaN(monto) || monto <= 0)
    return Response.json({ error: "Monto invalido" }, { status: 400 });
  if (!body.obligacion_id) return Response.json({ error: "Falta obligacion_id" }, { status: 400 });
  if (!body.referencia) return Response.json({ error: "Falta referencia bancaria" }, { status: 400 });

  const { data: oblig } = await db().from("obligaciones").select("*").eq("id", parseInt(body.obligacion_id)).single();
  if (!oblig) return Response.json({ error: "Obligacion no encontrada" }, { status: 404 });
  if (oblig.empresa_id !== auth.session.user.empresa_id)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (monto > oblig.saldo_restante)
    return Response.json({ error: "Monto excede el saldo restante" }, { status: 400 });

  const { data: dupRef } = await db().from("pagos").select("id").eq("referencia", body.referencia).eq("empresa_id", auth.session.user.empresa_id);
  if (dupRef && dupRef.length > 0)
    return Response.json({ error: "Ya existe un pago con esa referencia bancaria" }, { status: 400 });

  const row = {
    empresa_id:    auth.session.user.empresa_id || null,
    cliente_id:    parseInt(body.cliente_id),
    obligacion_id: parseInt(body.obligacion_id),
    banco:         sanitize(body.banco || "", 100),
    referencia:    sanitize(body.referencia || "", 100),
    descripcion:   sanitize(body.descripcion || "", 300),
    fecha_pago:    body.fecha_pago || new Date().toISOString().split("T")[0],
    monto,
    estado:        "pendiente",
    created_by:    auth.session.user.username,
  };

  const { data, error } = await db().from("pagos").insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
