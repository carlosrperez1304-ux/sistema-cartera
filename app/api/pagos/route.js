import { db } from "../../../lib/supabase.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cliente_id = searchParams.get("cliente_id");
  const estado = searchParams.get("estado");

  let query = db().from("pagos").select("*").order("created_at", { ascending: false });
  if (cliente_id) query = query.eq("cliente_id", parseInt(cliente_id));
  if (estado) query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req) {
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
    creado_por:     body.creado_por || "SISTEMA",
    empresa_id:     body.empresa_id || null,
  };

  const { data, error } = await db().from("pagos").insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

export async function PUT(req) {
  const body = await req.json();
  const { id, estado, motivo_rechazo, validado_por } = body;
  if (!id || !estado)
    return Response.json({ error: "Faltan datos" }, { status: 400 });

  const update = { estado, validado_por: validado_por || "SISTEMA", validado_en: new Date().toISOString() };
  if (motivo_rechazo) update.motivo_rechazo = motivo_rechazo;

  const { data, error } = await db().from("pagos").update(update).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
