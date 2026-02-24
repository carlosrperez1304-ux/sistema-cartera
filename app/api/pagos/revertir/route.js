import { db } from "../../../../lib/supabase.js";
import { requireAuth, checkCsrf } from "../../../../lib/security.js";

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  if (auth.session.user.rol !== "admin")
    return Response.json({ error: "Solo administradores pueden revertir pagos" }, { status: 403 });

  const { pago_id } = await req.json();
  const { data: pago } = await db().from("pagos").select("*").eq("id", pago_id).single();
  if (!pago) return Response.json({ error: "Pago no encontrado" }, { status: 404 });
  if (pago.estado !== "aprobado")
    return Response.json({ error: "Solo se pueden revertir pagos aprobados" }, { status: 400 });

  const { data: oblig } = await db().from("obligaciones").select("*").eq("id", pago.obligacion_id).single();
  if (!oblig) return Response.json({ error: "Obligacion no encontrada" }, { status: 404 });

  const nuevo_pagado = Math.max(0, parseFloat(oblig.monto_pagado) - parseFloat(pago.monto));
  const nuevo_saldo = parseFloat(oblig.monto_total) - nuevo_pagado;
  const nuevo_estado = nuevo_pagado <= 0 ? "pendiente" : "parcial";

  await db().from("obligaciones").update({ monto_pagado: nuevo_pagado, saldo_restante: nuevo_saldo, estado: nuevo_estado }).eq("id", oblig.id);
  await db().from("pagos").update({ estado: "revertido" }).eq("id", pago_id);

  return Response.json({ ok: true });
}
