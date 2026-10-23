import { describe, expect, it } from "vitest"

import { ejecutarCarga, prepararLotes, resumirCarga, type Lote } from "@/lib/etl/carga"
import { construirUrl, CIUDADES, validarConfiguracion } from "@/lib/etl/extraccion"
import {
  FILTROS_VACIOS,
  ORDEN_INICIAL,
  paginar,
  resolverSeleccion,
} from "@/lib/etl/filtrado"
import { claveRegistro, limpiar, MOTIVO_DUPLICADO } from "@/lib/etl/limpieza"
import type { Registro, RespuestaOpenMeteo } from "@/lib/etl/tipos"
import { transformarRespuesta } from "@/lib/etl/transformacion"
import { validarLote } from "@/lib/etl/servidor"

import conProblemas from "./fixtures/respuesta-con-problemas.json"
import longitudesIncoherentes from "./fixtures/respuesta-longitudes-incoherentes.json"

/** Respuesta sintética de un día completo (24 h) con valores válidos. */
function diaSintetico(dia = "2026-09-01"): RespuestaOpenMeteo {
  const horas = Array.from({ length: 24 }, (_, h) => `${dia}T${String(h).padStart(2, "0")}:00`)
  return {
    utc_offset_seconds: 0,
    hourly: {
      time: horas,
      temperature_2m: horas.map((_, h) => 15 + h * 0.5),
      relative_humidity_2m: horas.map((_, h) => 40 + h),
      precipitation: horas.map((_, h) => (h % 6 === 0 ? 0.4 : 0)),
    },
  }
}

function registros(ciudad: string, n: number): Registro[] {
  return Array.from({ length: n }, (_, i) => ({
    ciudad,
    fecha_hora: new Date(Date.UTC(2026, 8, 1, i)).toISOString().replace(".000Z", "Z"),
    temperatura_c: (i * 7) % 31,
    humedad_pct: (i * 13) % 101,
    precipitacion_mm: i % 5 === 0 ? 1.5 : 0,
  }))
}

describe("Configuración de extracción", () => {
  it("construye la URL con UTC, °C, mm y las tres variables", () => {
    const url = new URL(construirUrl(CIUDADES[0], "2026-09-01", "2026-09-01"))
    expect(url.origin + url.pathname).toBe("https://archive-api.open-meteo.com/v1/archive")
    expect(url.searchParams.get("timezone")).toBe("UTC")
    expect(url.searchParams.get("temperature_unit")).toBe("celsius")
    expect(url.searchParams.get("precipitation_unit")).toBe("mm")
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,relative_humidity_2m,precipitation"
    )
  })

  it("limita el periodo a 31 días y calcula el volumen previsto", () => {
    expect(validarConfiguracion(["barcelona"], "2026-09-01", "2026-09-30", "2026-10-23")).toEqual({
      errores: [],
      dias: 30,
      registrosPrevistos: 720,
      peticiones: 1,
    })
    expect(
      validarConfiguracion(["barcelona"], "2026-08-01", "2026-09-01", "2026-10-23").errores
    ).toContain("El periodo tiene 32 días; el máximo por extracción es 31.")
    expect(
      validarConfiguracion([], "2026-09-10", "2026-09-01", "2026-10-23").errores
    ).toEqual([
      "Selecciona al menos una ciudad.",
      "La fecha final debe ser igual o posterior a la inicial.",
    ])
  })
})

describe("Transformación (prueba 2)", () => {
  it("convierte los arrays paralelos de un día en 24 filas UTC", () => {
    const { filas, avisos } = transformarRespuesta("Barcelona", diaSintetico())
    expect(avisos).toEqual([])
    expect(filas).toHaveLength(24)
    expect(filas[0]).toMatchObject({
      ciudad: "Barcelona",
      fecha_hora: "2026-09-01T00:00:00Z",
      temperatura_c: 15,
      humedad_pct: 40,
      precipitacion_mm: 0.4,
    })
    expect(filas[23].fecha_hora).toBe("2026-09-01T23:00:00Z")
    expect(filas[13]).toMatchObject({ temperatura_c: 21.5, humedad_pct: 53, precipitacion_mm: 0 })
  })

  it("interpreta las horas como UTC aunque el entorno tenga otra zona horaria", () => {
    const { filas } = transformarRespuesta("Madrid", diaSintetico())
    expect(Date.parse(filas[5].fecha_hora!)).toBe(Date.UTC(2026, 8, 1, 5))
  })

  it("avisa de longitudes incoherentes y no inventa valores", () => {
    const { filas, avisos } = transformarRespuesta(
      "Bilbao",
      longitudesIncoherentes as RespuestaOpenMeteo
    )
    expect(avisos[0]).toMatch(/Longitudes incoherentes/)
    expect(filas).toHaveLength(3)
    expect(filas[2].precipitacion_mm).toBeUndefined()
    const { validos, rechazados } = limpiar(filas)
    expect(validos).toHaveLength(2)
    expect(rechazados[0].motivos).toEqual(["Precipitación: valor ausente"])
  })

  it("rechaza las fechas si la respuesta no está en UTC", () => {
    const { filas, avisos } = transformarRespuesta("Sevilla", {
      ...diaSintetico(),
      utc_offset_seconds: 7200,
    })
    expect(avisos[0]).toMatch(/no está en UTC/)
    expect(filas.every((f) => f.fecha_hora === null)).toBe(true)
  })
})

describe("Limpieza con fixture controlado (pruebas 3 y 4)", () => {
  const { filas } = transformarRespuesta("Barcelona", conProblemas as RespuestaOpenMeteo)
  const { validos, rechazados } = limpiar(filas)
  const motivosDe = (indice: number) =>
    rechazados.find((r) => r.fila.indice === indice)?.motivos

  it("no convierte null, cadenas vacías ni cadenas en números", () => {
    expect(filas[1].temperatura_c).toBeNull()
    expect(motivosDe(1)).toEqual(["Temperatura: valor nulo (null)"])
    expect(motivosDe(2)).toEqual(["Humedad: valor nulo (null)"])
    expect(motivosDe(3)).toEqual(["Temperatura: cadena vacía"])
    expect(motivosDe(7)).toEqual(["Humedad: tipo no numérico (string)"])
    expect(validos.some((r) => r.temperatura_c === 0)).toBe(false)
  })

  it("valida rangos y fechas imposibles", () => {
    expect(motivosDe(4)).toEqual(["Humedad fuera de rango 0–100 % (104)"])
    expect(motivosDe(5)).toEqual(["Precipitación negativa (-0.1 mm)"])
    expect(motivosDe(6)).toEqual(["Fecha/hora ausente o no interpretable como UTC"])
  })

  it("elimina duplicados conservando la primera aparición válida", () => {
    expect(motivosDe(8)).toEqual([MOTIVO_DUPLICADO])
    const primera = validos.find((r) => r.fecha_hora === "2026-09-01T00:00:00Z")
    expect(primera?.temperatura_c).toBe(24.2)
  })

  it("no descarta temperaturas extremas", () => {
    expect(validos.map((r) => r.temperatura_c)).toEqual([24.2, 46.8])
    expect(rechazados).toHaveLength(8)
  })
})

describe("Filtros, ordenación, paginación y selección (pruebas 5 y 6)", () => {
  const validos = [...registros("Madrid", 60), ...registros("Barcelona", 60)]

  it("filtra y ordena el conjunto completo antes de paginar", () => {
    const { coinciden } = resolverSeleccion(
      validos,
      { ...FILTROS_VACIOS, temperaturaMin: 25 },
      { campo: "temperatura_c", direccion: "desc" },
      new Set()
    )
    // El máximo global (30 °C) aparece en la primera página aunque esté al final de los datos.
    const primera = paginar(coinciden, 1, 10)
    expect(primera.filas[0].temperatura_c).toBe(30)
    expect(coinciden.every((r) => r.temperatura_c >= 25)).toBe(true)
    const temps = coinciden.map((r) => r.temperatura_c)
    expect(temps).toEqual([...temps].sort((a, b) => b - a))
  })

  it("solo lluvia significa precipitación > 0", () => {
    const { coinciden } = resolverSeleccion(
      validos,
      { ...FILTROS_VACIOS, soloLluvia: true },
      ORDEN_INICIAL,
      new Set()
    )
    expect(coinciden.length).toBe(24)
    expect(coinciden.every((r) => r.precipitacion_mm > 0)).toBe(true)
  })

  it("selecciona filas de varias páginas y solo carga las que siguen cumpliendo los filtros", () => {
    const filtros = { ...FILTROS_VACIOS, ciudades: ["Madrid"] }
    const { coinciden } = resolverSeleccion(validos, filtros, ORDEN_INICIAL, new Set())
    const pag1 = paginar(coinciden, 1, 25).filas
    const pag3 = paginar(coinciden, 3, 25).filas
    const seleccion = new Set([...pag1.slice(0, 2), ...pag3.slice(0, 3)].map(claveRegistro))
    // Además, una fila de Barcelona seleccionada antes: queda fuera de los filtros actuales.
    seleccion.add(claveRegistro(validos[70]))

    const r = resolverSeleccion(validos, filtros, ORDEN_INICIAL, seleccion)
    expect(r.paraCargar).toHaveLength(5)
    expect(r.seleccionadasFueraDeFiltro).toBe(1)
    expect(r.paraCargar.every((x) => x.ciudad === "Madrid")).toBe(true)
  })

  it("seleccionar todas las coincidencias incluye filas de otras páginas", () => {
    const filtros = { ...FILTROS_VACIOS, ciudades: ["Barcelona"], soloLluvia: true }
    const { coinciden } = resolverSeleccion(validos, filtros, ORDEN_INICIAL, new Set())
    const seleccion = new Set(coinciden.map(claveRegistro))
    expect(resolverSeleccion(validos, filtros, ORDEN_INICIAL, seleccion).paraCargar).toEqual(
      coinciden
    )
  })
})

describe("Carga por lotes (pruebas 7 y 9)", () => {
  const conjunto = [...registros("Valencia", 700), ...registros("Sevilla", 400)]
  const { paraCargar } = resolverSeleccion(
    conjunto,
    FILTROS_VACIOS,
    { campo: "temperatura_c", direccion: "asc" },
    new Set(conjunto.map(claveRegistro))
  )

  it("envía exactamente la vista previa, en el mismo orden y en lotes de ≤ 500", async () => {
    const enviados: Registro[][] = []
    const lotes = prepararLotes(paraCargar)
    expect(lotes.map((l) => l.registros.length)).toEqual([500, 500, 100])
    await ejecutarCarga(
      lotes,
      async (r) => {
        enviados.push([...r])
        return { procesados: r.length }
      },
      async (r) => r.map(claveRegistro),
      () => {}
    )
    expect(enviados.flat()).toEqual(paraCargar)
  })

  it("la copia congelada no cambia si la selección cambia durante la carga", () => {
    const origen = registros("Bilbao", 3)
    const lotes = prepararLotes(origen)
    origen[0].temperatura_c = 999
    origen.pop()
    expect(lotes[0].registros).toHaveLength(3)
    expect(lotes[0].registros[0].temperatura_c).toBe(0)
  })

  it("si un lote falla conserva los anteriores y el reintento solo envía los fallidos", async () => {
    let fallar = true
    const llamadas: number[] = []
    const enviar = async (r: readonly Registro[]) => {
      const numero = llamadas.length
      llamadas.push(r.length)
      if (fallar && numero === 1) throw new Error("HTTP 502: fallo simulado")
      return { procesados: r.length }
    }
    const verificar = async (r: readonly Registro[]) => r.map(claveRegistro)

    let lotes: Lote[] = await ejecutarCarga(prepararLotes(paraCargar), enviar, verificar, () => {})
    expect(lotes.map((l) => l.estado)).toEqual(["correcto", "error", "correcto"])
    expect(lotes[1].error).toBe("HTTP 502: fallo simulado")
    expect(resumirCarga(lotes)).toMatchObject({ enviadosOk: 600, fallidos: 500, verificados: 600 })

    fallar = false
    llamadas.length = 0
    lotes = await ejecutarCarga(lotes, enviar, verificar, () => {})
    expect(llamadas).toEqual([500])
    expect(lotes.every((l) => l.estado === "correcto")).toBe(true)
    expect(resumirCarga(lotes)).toMatchObject({ enviadosOk: 1100, fallidos: 0, verificados: 1100 })
  })

  it("informa de claves que no aparecen en destino", async () => {
    const lotes = await ejecutarCarga(
      prepararLotes(paraCargar.slice(0, 3)),
      async () => ({ procesados: 3 }),
      async (r) => r.slice(1).map(claveRegistro),
      () => {}
    )
    expect(lotes[0].verificacion).toEqual({
      estado: "incompleta",
      encontrados: 2,
      faltan: [claveRegistro(paraCargar[0])],
    })
  })
})

describe("Validación en servidor", () => {
  it("acepta un lote válido y descarta campos extra", () => {
    const r = validarLote({
      registros: [{ ...registros("Madrid", 1)[0], id: 5, importado_en: "x" }],
    })
    expect("registros" in r && r.registros[0]).toEqual(registros("Madrid", 1)[0])
  })

  it("rechaza nulos, ciudades desconocidas, claves repetidas y lotes grandes", async () => {
    const base = registros("Madrid", 1)[0]
    const casos = [
      { registros: [{ ...base, temperatura_c: null }] },
      { registros: [{ ...base, ciudad: "Lisboa" }] },
      { registros: [base, { ...base }] },
      { registros: registros("Madrid", 501) },
      { registros: [] },
    ]
    for (const caso of casos) {
      const r = validarLote(caso)
      expect("error" in r).toBe(true)
      if ("error" in r) expect([400, 422]).toContain(r.error.status)
    }
  })
})
