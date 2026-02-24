import { db } from "../../../lib/supabase.js";
import { requireAuth, checkCsrf, sanitize } from "../../../lib/security.js";

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const empresa_id = auth.session.user.empresa_id || null;
  const { searchParams } = new URL(req.url);
  const cliente_id = searchParams.get("cliente_id");

  let query = db().from("obligaciones").select("*").order("id");
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
  const monto_total = parseFloat(body.monto_total);
  if (!monto_total || isNaN(monto_total) || monto_total <= 0)
    return Response.json({ error: "Monto invalido" }, { status: 400 });
  if (!body.cliente_id) return Response.json({ error: "Falta cliente_id" }, { status: 400 });

  const row = {
    empresa_id:        auth.session.user.empresa_id || null,
    cliente_id:        parseInt(body.cliente_id),
    tipo:              body.tipo || "otro",
    descripcion:       sanitize(body.descripcion || "", 300),
    monto_total,
    monto_pagado:      0,
    saldo_restante:    monto_total,
    estado:            "pendiente",
    fecha_vencimiento: body.fecha_vencimiento || null,
  };

  const { data, error } = await db().from("obligaciones").insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
