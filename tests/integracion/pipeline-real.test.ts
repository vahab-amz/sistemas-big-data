// Pruebas de integración contra servicios reales (no usan fixtures).
//   npm run test:integracion
// La parte de Supabase necesita la app en marcha (npm run dev) y las variables
// de entorno configuradas; si /api/estado no está listo, esas pruebas se omiten
// y lo indican en la salida.

import { describe, expect, it } from "vitest"

import { CIUDADES, extraerCiudad } from "@/lib/etl/extraccion"
import { claveRegistro, limpiar } from "@/lib/etl/limpieza"
import type { Registro } from "@/lib/etl/tipos"
import { transformarRespuesta } from "@/lib/etl/transformacion"

const BASE = process.env.ETL_BASE_URL ?? "http://localhost:3000"
const BILBAO = CIUDADES.find((c) => c.id === "bilbao")!

async function extraerUnDia(): Promise<Registro[]> {
  const respuesta = await extraerCiudad(BILBAO, "2026-09-01", "2026-09-01")
  const { filas, avisos } = transformarRespuesta(BILBAO.nombre, respuesta)
  expect(avisos).toEqual([])
  return limpiar(filas).validos
}

describe("Open-Meteo real (prueba 1)", () => {
  it("una ciudad durante un día devuelve 24 registros horarios en UTC", async () => {
    const respuesta = await extraerCiudad(BILBAO, "2026-09-01", "2026-09-01")
    expect(respuesta.utc_offset_seconds).toBe(0)
    expect(respuesta.hourly_units).toMatchObject({
      temperature_2m: "°C",
      relative_humidity_2m: "%",
      precipitation: "mm",
    })
    const validos = await extraerUnDia()
    expect(validos).toHaveLength(24)
    expect(validos[0].fecha_hora).toBe("2026-09-01T00:00:00Z")
    expect(validos[23].fecha_hora).toBe("2026-09-01T23:00:00Z")
  })
})

async function supabaseListo(): Promise<{ listo: boolean; mensaje: string }> {
  try {
    const r = await fetch(`${BASE}/api/estado`)
    return (await r.json()) as { listo: boolean; mensaje: string }
  } catch {
    return { listo: false, mensaje: `La app no responde en ${BASE}.` }
  }
}

const estado = await supabaseListo()
if (!estado.listo) console.warn(`[integración] Supabase omitido: ${estado.mensaje}`)

describe.skipIf(!estado.listo)("Supabase real (pruebas 8 y 9)", () => {
  const cargar = (registros: unknown[]) =>
    fetch(`${BASE}/api/carga`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registros }),
    })

  it("una segunda carga del mismo día no duplica filas", async () => {
    const validos = await extraerUnDia()
    for (let vez = 0; vez < 2; vez++) {
      const r = await cargar(validos)
      expect(r.status).toBe(200)
    }
    const params = new URLSearchParams({
      ciudad: BILBAO.nombre,
      desde: "2026-09-01T00:00:00Z",
      hasta: "2026-09-01T23:00:00Z",
      tam: "100",
    })
    const lectura = await (await fetch(`${BASE}/api/mediciones?${params}`)).json()
    expect(lectura.total).toBe(24)

    const verificacion = await (
      await fetch(`${BASE}/api/verificacion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claves: validos }),
      })
    ).json()
    expect(new Set(verificacion.existentes)).toEqual(new Set(validos.map(claveRegistro)))
  })

  it("un lote inválido se rechaza entero en el servidor sin escribir nada", async () => {
    const validos = await extraerUnDia()
    const r = await cargar([validos[0], { ...validos[1], humedad_pct: null }])
    expect(r.status).toBe(422)
  })
})
