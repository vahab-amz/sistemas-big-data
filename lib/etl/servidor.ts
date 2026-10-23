import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"

import { TAMANO_LOTE } from "./carga"
import { CIUDADES } from "./extraccion"
import { claveRegistro, esFechaIsoUtc, motivosDeRechazo } from "./limpieza"
import type { Registro } from "./tipos"

export const TABLA = "mediciones_meteorologicas"
/** 500 registros ocupan ~70 KB en JSON; 256 KB deja margen sin aceptar cuerpos enormes. */
export const MAX_BYTES_PETICION = 256 * 1024

const NOMBRES_CIUDADES = new Set(CIUDADES.map((c) => c.nombre))

export function respuestaError(estado: number, error: string, detalles?: unknown) {
  return Response.json({ error, detalles }, { status: estado })
}

/**
 * El proyecto no tiene autenticación. Los endpoints quedan abiertos solo en
 * desarrollo; en producción hay que añadir autenticación (o, bajo tu
 * responsabilidad, definir ETL_PERMITIR_SIN_AUTENTICACION=true).
 */
export function comprobarAcceso(): Response | null {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ETL_PERMITIR_SIN_AUTENTICACION !== "true"
  ) {
    return respuestaError(
      403,
      "Endpoint deshabilitado en producción: el proyecto no tiene autenticación. Protégelo antes de publicarlo."
    )
  }
  return null
}

export function obtenerCliente() {
  const cliente = crearClienteAdmin()
  if (!cliente) {
    return {
      cliente: null,
      error: respuestaError(
        503,
        "Supabase no está configurado en el servidor: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY."
      ),
    }
  }
  return { cliente, error: null }
}

/** Lee el cuerpo comprobando el tamaño real (no solo la cabecera Content-Length). */
export async function leerJson(request: Request): Promise<{ datos: unknown } | { error: Response }> {
  const declarado = Number(request.headers.get("content-length") ?? "0")
  if (declarado > MAX_BYTES_PETICION) {
    return { error: respuestaError(413, `La petición supera ${MAX_BYTES_PETICION} bytes.`) }
  }
  const texto = await request.text()
  if (new TextEncoder().encode(texto).length > MAX_BYTES_PETICION) {
    return { error: respuestaError(413, `La petición supera ${MAX_BYTES_PETICION} bytes.`) }
  }
  try {
    return { datos: JSON.parse(texto) }
  } catch {
    return { error: respuestaError(400, "El cuerpo no es JSON válido.") }
  }
}

/**
 * Valida un lote recibido del navegador con las mismas reglas que la limpieza,
 * más límites de tamaño, ciudades conocidas y ausencia de claves repetidas.
 */
export function validarLote(
  datos: unknown
): { registros: Registro[] } | { error: Response } {
  const lista = (datos as { registros?: unknown } | null)?.registros
  if (!Array.isArray(lista)) {
    return { error: respuestaError(400, "Se esperaba { registros: [...] }.") }
  }
  if (lista.length === 0 || lista.length > TAMANO_LOTE) {
    return {
      error: respuestaError(400, `Cada lote debe tener entre 1 y ${TAMANO_LOTE} registros (recibidos ${lista.length}).`),
    }
  }

  const registros: Registro[] = []
  const errores: { posicion: number; motivos: string[] }[] = []
  const claves = new Set<string>()
  lista.forEach((item, posicion) => {
    const fila = (item ?? {}) as Record<string, unknown>
    const motivos = motivosDeRechazo({
      ciudad: fila.ciudad,
      fecha_hora: fila.fecha_hora,
      temperatura_c: fila.temperatura_c,
      humedad_pct: fila.humedad_pct,
      precipitacion_mm: fila.precipitacion_mm,
    })
    if (typeof fila.ciudad === "string" && !NOMBRES_CIUDADES.has(fila.ciudad)) {
      motivos.push(`Ciudad no admitida: ${fila.ciudad}`)
    }
    if (motivos.length === 0) {
      // Solo se copian las cinco columnas permitidas; cualquier otro campo se ignora.
      const registro: Registro = {
        ciudad: fila.ciudad as string,
        fecha_hora: fila.fecha_hora as string,
        temperatura_c: fila.temperatura_c as number,
        humedad_pct: fila.humedad_pct as number,
        precipitacion_mm: fila.precipitacion_mm as number,
      }
      const clave = claveRegistro(registro)
      if (claves.has(clave)) motivos.push("Clave repetida dentro del lote")
      claves.add(clave)
      registros.push(registro)
    }
    if (motivos.length > 0) errores.push({ posicion, motivos })
  })

  if (errores.length > 0) {
    return {
      error: respuestaError(
        422,
        `El servidor rechazó el lote: ${errores.length} registro(s) no superan la validación.`,
        errores.slice(0, 20)
      ),
    }
  }
  return { registros }
}

/** Normaliza el timestamptz devuelto por PostgREST ("…+00:00") al formato del pipeline ("…Z"). */
export function normalizarTimestamp(valor: string): string | null {
  const ms = Date.parse(valor)
  if (Number.isNaN(ms)) return null
  const iso = new Date(ms).toISOString().replace(".000Z", "Z")
  return esFechaIsoUtc(iso) ? iso : null
}

/** Mensaje de error de Supabase sin filtrar credenciales ni cabeceras. */
export function mensajeSupabase(error: { message?: string; code?: string; hint?: string | null }) {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return `La tabla ${TABLA} no existe. Ejecuta la migración de supabase/migrations.`
  }
  return [error.code, error.message, error.hint].filter(Boolean).join(" · ")
}
