import type { NextRequest } from "next/server"

import { CIUDADES } from "@/lib/etl/extraccion"
import {
  TABLA,
  comprobarAcceso,
  mensajeSupabase,
  normalizarTimestamp,
  obtenerCliente,
  respuestaError,
} from "@/lib/etl/servidor"

const CAMPOS_ORDEN = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "importado_en",
] as const
const TAMANOS = [25, 50, 100]
const NOMBRES = new Set(CIUDADES.map((c) => c.nombre))

// GET /api/mediciones — lectura paginada de lo que ya está persistido en Supabase.
export async function GET(request: NextRequest) {
  const denegado = comprobarAcceso()
  if (denegado) return denegado

  const p = request.nextUrl.searchParams
  const ciudades = p.getAll("ciudad")
  const desde = p.get("desde")
  const hasta = p.get("hasta")
  const orden = p.get("orden") ?? "fecha_hora"
  const ascendente = p.get("dir") !== "desc"
  const tamano = Number(p.get("tam") ?? 25)
  const pagina = Number(p.get("pagina") ?? 1)

  if (ciudades.some((c) => !NOMBRES.has(c))) return respuestaError(400, "Ciudad no válida.")
  if (!(CAMPOS_ORDEN as readonly string[]).includes(orden))
    return respuestaError(400, "Campo de ordenación no válido.")
  if (!TAMANOS.includes(tamano)) return respuestaError(400, "Tamaño de página no válido.")
  if (!Number.isInteger(pagina) || pagina < 1) return respuestaError(400, "Página no válida.")
  for (const fecha of [desde, hasta]) {
    if (fecha !== null && Number.isNaN(Date.parse(fecha)))
      return respuestaError(400, "Fecha de filtro no válida.")
  }

  const { cliente, error } = obtenerCliente()
  if (!cliente) return error

  let consulta = cliente
    .from(TABLA)
    .select("id, ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm, importado_en", {
      count: "exact",
    })
  if (ciudades.length > 0) consulta = consulta.in("ciudad", ciudades)
  if (desde) consulta = consulta.gte("fecha_hora", desde)
  if (hasta) consulta = consulta.lte("fecha_hora", hasta)

  // Sin ORDER BY la base de datos no garantiza ningún orden: siempre lo
  // indicamos y desempatamos por id para que la paginación sea estable.
  const primeraFila = (pagina - 1) * tamano
  const { data, count, error: errorSupabase } = await consulta
    .order(orden, { ascending: ascendente })
    .order("id", { ascending: true })
    .range(primeraFila, primeraFila + tamano - 1)

  if (errorSupabase) return respuestaError(502, mensajeSupabase(errorSupabase))

  return Response.json({
    total: count ?? 0,
    filas: (data ?? []).map((f) => ({
      ...f,
      fecha_hora: normalizarTimestamp(f.fecha_hora) ?? f.fecha_hora,
    })),
  })
}
