import { db } from "../../../lib/supabase.js";
import { requireAuth, requireAdmin, checkCsrf, getIP, auditLog } from "../../../lib/security.js";

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const cliente_id = searchParams.get("cliente_id");
  const estado = searchParams.get("estado");
  const empresa_id = auth.session.user.empresa_id;
  let query = db().from("pagos").select("*").order("created_at", { ascending: false });
  if (empresa_id) query = query.eq("empresa_id", empresa_id);
  if (cliente_id) query = query.eq("cliente_id", parseInt(cliente_id));
  if (estado) query = query.eq("estado", estado);
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
  const row = {
    cliente_id:     body.cliente_id ? parseInt(body.cliente_id) : null,
    cliente_nombre: body.cliente_nombre || "",
    monto,
    fecha:          body.fecha || new Date().toISOString(),
    fecha_formato:  body.fecha_formato || "",
    fecha_pago:     body.fecha_pago || new Date().toISOString().split("T")[0],
    banco:          body.banco || "",
    referencia:     body.referencia || "",
    tipo_negocio:   body.tipo_negocio || "",
    nota:           body.nota || "",
    estado:         "pendiente",
    creado_por:     auth.session.user.username,
    empresa_id:     auth.session.user.empresa_id || null,
  };
  const { data, error } = await db().from("pagos").insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  auditLog("DATA_READ", auth.session.user.username, getIP(req), `CREATE pago id=${data.id}`);
  return Response.json(data, { status: 201 });
}

export async function PUT(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await req.json();
  const { id, estado, motivo_rechazo } = body;
  if (!id || !estado)
    return Response.json({ error: "Faltan datos" }, { status: 400 });
  const update = {
    estado,
    validado_por: auth.session.user.username,
    validado_en:  new Date().toISOString(),
  };
  if (motivo_rechazo) update.motivo_rechazo = motivo_rechazo;
  const { data, error } = await db().from("pagos").update(update).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  auditLog("DATA_READ", auth.session.user.username, getIP(req), `UPDATE pago id=${id} estado=${estado}`);
  return Response.json(data);
}

export async function DELETE(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });
  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
  const { error } = await db().from("pagos").delete().eq("id", parseInt(id));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  auditLog("DATA_READ", auth.session.user.username, getIP(req), `DELETE pago id=${id}`);
  return Response.json({ ok: true });
}
