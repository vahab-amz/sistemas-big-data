import { TABLA, comprobarAcceso, mensajeSupabase } from "@/lib/etl/servidor"
import { crearClienteAdmin } from "@/lib/supabase/admin"

// GET /api/estado — indica si el servidor puede escribir en Supabase (sin revelar claves).
export async function GET() {
  const denegado = comprobarAcceso()
  if (denegado) return denegado

  const cliente = crearClienteAdmin()
  if (!cliente) {
    return Response.json({
      listo: false,
      mensaje:
        "Faltan variables de entorno en el servidor: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY. Consulta el README.",
    })
  }
  // Sin `head: true`: con HEAD PostgREST no devuelve cuerpo y un error como
  // "la tabla no existe" llega vacío, lo que daría un falso "Conectado".
  const { error, count } = await cliente.from(TABLA).select("id", { count: "exact" }).limit(1)
  if (error) return Response.json({ listo: false, mensaje: mensajeSupabase(error) })
  return Response.json({
    listo: true,
    mensaje: `Conectado. La tabla ${TABLA} contiene ${count ?? 0} filas.`,
  })
}
