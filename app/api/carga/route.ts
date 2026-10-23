import {
  TABLA,
  comprobarAcceso,
  leerJson,
  mensajeSupabase,
  obtenerCliente,
  respuestaError,
  validarLote,
} from "@/lib/etl/servidor"

// POST /api/carga — upsert de un lote (≤ 500 registros) por (ciudad, fecha_hora).
export async function POST(request: Request) {
  const denegado = comprobarAcceso()
  if (denegado) return denegado

  const cuerpo = await leerJson(request)
  if ("error" in cuerpo) return cuerpo.error
  const lote = validarLote(cuerpo.datos)
  if ("error" in lote) return lote.error

  const { cliente, error } = obtenerCliente()
  if (!cliente) return error

  const { error: errorSupabase, count } = await cliente
    .from(TABLA)
    .upsert(lote.registros, { onConflict: "ciudad,fecha_hora", count: "exact" })

  if (errorSupabase) {
    console.error("[carga] Error de Supabase:", errorSupabase.code, errorSupabase.message)
    return respuestaError(502, mensajeSupabase(errorSupabase))
  }

  // PostgREST devuelve el total de filas afectadas por el upsert; no indica
  // cuántas fueron inserciones y cuántas actualizaciones.
  return Response.json({ recibidos: lote.registros.length, procesados: count ?? null })
}
