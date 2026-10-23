"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ejecutarCarga,
  prepararLotes,
  resumirCarga,
  type Lote,
} from "@/lib/etl/carga"
import {
  CIUDADES,
  construirUrl,
  ErrorExtraccion,
  extraerCiudad,
  PERIODO_INICIAL,
} from "@/lib/etl/extraccion"
import { FILTROS_VACIOS, ORDEN_INICIAL, resolverSeleccion } from "@/lib/etl/filtrado"
import { claveRegistro, limpiar } from "@/lib/etl/limpieza"
import type {
  Ciudad,
  FilaTransformada,
  Filtros,
  Orden,
  RespuestaOpenMeteo,
} from "@/lib/etl/tipos"
import { contarHorasRecibidas, transformarRespuesta } from "@/lib/etl/transformacion"

import { enviarLote, verificarLote } from "./api"
import { ConfiguracionExtraccion } from "./configuracion-extraccion"
import { Contadores } from "./contadores"
import { DiagramaPipeline, type Fase } from "./diagrama-pipeline"
import { PestanaCarga } from "./pestana-carga"
import { PestanaJson } from "./pestana-json"
import { PestanaRechazados } from "./pestana-rechazados"
import { PestanaSupabase } from "./pestana-supabase"
import { PestanaTransformados } from "./pestana-transformados"
import { PestanaValidos } from "./pestana-validos"

export type EstadoCiudad = {
  ciudad: Ciudad
  estado: "pendiente" | "descargando" | "correcta" | "error"
  url: string
  error: string | null
  duracionMs: number | null
  intentos: number
}

type Extraccion = {
  inicio: string
  fin: string
  ciudades: EstadoCiudad[]
  enCurso: boolean
  /** Tiempo real de la última ejecución (extracción completa o reintento). */
  duracionMs: number | null
}

export type EstadoCarga = {
  lotes: Lote[]
  congeladaEn: Date
  enCurso: boolean
  duracionMs: number | null
}

export type Pestana = "json" | "transformados" | "validos" | "rechazados" | "carga" | "supabase"

export function PipelineEtl() {
  // 1. Configuración
  const [seleccionCiudades, setSeleccionCiudades] = useState(CIUDADES.map((c) => c.id))
  const [inicio, setInicio] = useState(PERIODO_INICIAL.inicio)
  const [fin, setFin] = useState(PERIODO_INICIAL.fin)

  // 2. Extracción: los JSON originales se guardan aparte y se conservan toda la sesión.
  const [extraccion, setExtraccion] = useState<Extraccion | null>(null)
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaOpenMeteo>>({})

  // 4. Filtros, orden y selección
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set())

  // 5. Carga
  const [carga, setCarga] = useState<EstadoCarga | null>(null)
  const cargaActiva = useRef(false)
  const [estadoServidor, setEstadoServidor] = useState<{ listo: boolean; mensaje: string } | null>(
    null
  )

  const [pestana, setPestana] = useState<Pestana>("json")
  // Se incrementa tras cada carga para que la pestaña de Supabase relea el destino.
  const [versionDestino, setVersionDestino] = useState(0)

  const comprobarServidor = useCallback(async () => {
    try {
      const r = await fetch("/api/estado", { cache: "no-store" })
      const datos = (await r.json()) as { listo?: boolean; mensaje?: string; error?: string }
      setEstadoServidor({
        listo: Boolean(datos.listo),
        mensaje: datos.mensaje ?? datos.error ?? `HTTP ${r.status}`,
      })
    } catch {
      setEstadoServidor({ listo: false, mensaje: "No se pudo contactar con el servidor de la app." })
    }
  }, [])

  useEffect(() => {
    // Comprobación inicial del destino; el setState ocurre tras la respuesta de red.
    void comprobarServidor()
  }, [comprobarServidor])

  // ---------- Extracción ----------

  const actualizarCiudad = (id: string, cambios: Partial<EstadoCiudad>) =>
    setExtraccion((e) =>
      e && {
        ...e,
        ciudades: e.ciudades.map((c) => (c.ciudad.id === id ? { ...c, ...cambios } : c)),
      }
    )

  const descargar = async (ciudad: Ciudad, desde: string, hasta: string) => {
    actualizarCiudad(ciudad.id, { estado: "descargando", error: null })
    const t0 = performance.now()
    try {
      const respuesta = await extraerCiudad(ciudad, desde, hasta)
      // Reemplaza (no añade) la respuesta de la ciudad: reintentar no duplica datos.
      setRespuestas((r) => ({ ...r, [ciudad.id]: respuesta }))
      setExtraccion((e) =>
        e && {
          ...e,
          ciudades: e.ciudades.map((c) =>
            c.ciudad.id === ciudad.id
              ? { ...c, estado: "correcta", duracionMs: performance.now() - t0, intentos: c.intentos + 1 }
              : c
          ),
        }
      )
    } catch (error) {
      setExtraccion((e) =>
        e && {
          ...e,
          ciudades: e.ciudades.map((c) =>
            c.ciudad.id === ciudad.id
              ? {
                  ...c,
                  estado: "error",
                  error: error instanceof ErrorExtraccion ? error.message : String(error),
                  duracionMs: performance.now() - t0,
                  intentos: c.intentos + 1,
                }
              : c
          ),
        }
      )
    }
  }

  const extraer = async () => {
    if (extraccion?.enCurso || carga?.enCurso) return
    const ciudades = CIUDADES.filter((c) => seleccionCiudades.includes(c.id))
    setRespuestas({})
    setSeleccion(new Set())
    setFiltros(FILTROS_VACIOS)
    setOrden(ORDEN_INICIAL)
    setCarga(null)
    setPestana("json")
    setExtraccion({
      inicio,
      fin,
      enCurso: true,
      duracionMs: null,
      ciudades: ciudades.map((ciudad) => ({
        ciudad,
        estado: "pendiente",
        url: construirUrl(ciudad, inicio, fin),
        error: null,
        duracionMs: null,
        intentos: 0,
      })),
    })
    const t0 = performance.now()
    // Secuencial: así se ve qué ciudades están procesadas y cuáles pendientes.
    for (const ciudad of ciudades) await descargar(ciudad, inicio, fin)
    setExtraccion((e) => e && { ...e, enCurso: false, duracionMs: performance.now() - t0 })
  }

  const reintentarCiudad = async (id: string) => {
    if (!extraccion || extraccion.enCurso || carga?.enCurso) return
    const estado = extraccion.ciudades.find((c) => c.ciudad.id === id)
    if (!estado) return
    setExtraccion((e) => e && { ...e, enCurso: true })
    const t0 = performance.now()
    // Usa el periodo de la extracción original, no el que haya ahora en el formulario.
    await descargar(estado.ciudad, extraccion.inicio, extraccion.fin)
    setExtraccion((e) => e && { ...e, enCurso: false, duracionMs: performance.now() - t0 })
  }

  // ---------- Transformación y limpieza (derivadas de los JSON originales) ----------

  const ordenCiudades = extraccion?.ciudades.map((c) => c.ciudad) ?? []
  const claveOrden = ordenCiudades.map((c) => c.id).join(",")

  const transformacion = useMemo(() => {
    const t0 = performance.now()
    const filas: FilaTransformada[] = []
    const avisos: { ciudad: string; aviso: string }[] = []
    let horasRecibidas = 0
    let ciudadesConDatos = 0
    for (const ciudad of CIUDADES.filter((c) => claveOrden.split(",").includes(c.id))) {
      const respuesta = respuestas[ciudad.id]
      if (!respuesta) continue
      ciudadesConDatos++
      horasRecibidas += contarHorasRecibidas(respuesta)
      const r = transformarRespuesta(ciudad.nombre, respuesta)
      filas.push(...r.filas)
      avisos.push(...r.avisos.map((aviso) => ({ ciudad: ciudad.nombre, aviso })))
    }
    return { filas, avisos, horasRecibidas, ciudadesConDatos, duracionMs: performance.now() - t0 }
  }, [respuestas, claveOrden])

  const limpieza = useMemo(() => {
    const t0 = performance.now()
    const r = limpiar(transformacion.filas)
    return { ...r, duracionMs: performance.now() - t0 }
  }, [transformacion.filas])

  const resultadoSeleccion = useMemo(() => {
    const t0 = performance.now()
    const r = resolverSeleccion(limpieza.validos, filtros, orden, seleccion)
    return { ...r, duracionMs: performance.now() - t0 }
  }, [limpieza.validos, filtros, orden, seleccion])

  // ---------- Carga ----------

  const lanzarCarga = async (lotesIniciales: Lote[], congeladaEn: Date) => {
    // Evita envíos simultáneos aunque se pulse dos veces antes del re-render.
    if (cargaActiva.current) return
    cargaActiva.current = true
    const t0 = performance.now()
    setCarga({ lotes: lotesIniciales, congeladaEn, enCurso: true, duracionMs: null })
    try {
      await ejecutarCarga(lotesIniciales, enviarLote, verificarLote, (lotes) =>
        setCarga((c) => c && { ...c, lotes })
      )
    } finally {
      cargaActiva.current = false
      setCarga((c) => c && { ...c, enCurso: false, duracionMs: performance.now() - t0 })
      setVersionDestino((v) => v + 1)
      void comprobarServidor()
    }
  }

  const subir = () => {
    if (resultadoSeleccion.paraCargar.length === 0) return
    // Copia congelada del conjunto exacto de la vista previa, en su orden.
    void lanzarCarga(prepararLotes(resultadoSeleccion.paraCargar), new Date())
  }

  const reintentarFallidos = () => {
    if (carga) void lanzarCarga(carga.lotes, carga.congeladaEn)
  }

  // ---------- Fases del pipeline ----------

  const ciudadesExtraccion = extraccion?.ciudades ?? []
  const erroresExtraccion = ciudadesExtraccion.filter((c) => c.estado === "error").length
  const hayDatos = transformacion.ciudadesConDatos > 0
  const resumenCarga = carga ? resumirCarga(carga.lotes) : null

  const fases: Fase[] = [
    {
      id: "extraccion",
      pestana: "json",
      titulo: "Extracción",
      descripcion:
        "Una petición HTTP por ciudad a la API histórica de Open-Meteo (UTC, °C, mm). Se guarda el JSON original.",
      estado: !extraccion
        ? "pendiente"
        : extraccion.enCurso
          ? "en_curso"
          : erroresExtraccion > 0
            ? "error"
            : "completada",
      entrada: extraccion ? `${ciudadesExtraccion.length} ciudades` : "—",
      salida: hayDatos ? `${transformacion.horasRecibidas.toLocaleString("es-ES")} horas recibidas` : "—",
      duracionMs: extraccion?.duracionMs ?? null,
      detalle: extraccion
        ? `${ciudadesExtraccion.filter((c) => c.estado === "correcta").length} correctas · ${erroresExtraccion} con error · ${ciudadesExtraccion.filter((c) => c.estado === "pendiente" || c.estado === "descargando").length} pendientes`
        : undefined,
    },
    {
      id: "transformacion",
      pestana: "transformados",
      titulo: "Transformación",
      descripcion:
        "Los arrays paralelos (time, temperatura, humedad, precipitación) se convierten en una fila por ciudad y hora UTC.",
      estado: !hayDatos ? "pendiente" : transformacion.avisos.length > 0 ? "error" : "completada",
      entrada: hayDatos ? `${transformacion.ciudadesConDatos} respuestas JSON` : "—",
      salida: hayDatos ? `${transformacion.filas.length.toLocaleString("es-ES")} filas` : "—",
      duracionMs: hayDatos ? transformacion.duracionMs : null,
      detalle:
        transformacion.avisos.length > 0 ? `${transformacion.avisos.length} aviso(s) estructural(es)` : undefined,
    },
    {
      id: "limpieza",
      pestana: "rechazados",
      titulo: "Limpieza",
      descripcion:
        "Se validan tipos, nulos, rangos y fechas, y se eliminan duplicados por ciudad + fecha_hora. Cada descarte guarda su motivo.",
      estado: !hayDatos ? "pendiente" : "completada",
      entrada: hayDatos ? `${transformacion.filas.length.toLocaleString("es-ES")} filas` : "—",
      salida: hayDatos ? `${limpieza.validos.length.toLocaleString("es-ES")} válidos` : "—",
      duracionMs: hayDatos ? limpieza.duracionMs : null,
      detalle: hayDatos ? `${limpieza.rechazados.length.toLocaleString("es-ES")} rechazados por calidad` : undefined,
    },
    {
      id: "filtrado",
      pestana: "validos",
      titulo: "Filtrado y selección",
      descripcion:
        "Sobre los válidos: filtros → ordenación → selección manual. La paginación solo afecta a la vista.",
      estado: !hayDatos ? "pendiente" : "completada",
      entrada: hayDatos ? `${limpieza.validos.length.toLocaleString("es-ES")} válidos` : "—",
      salida: hayDatos
        ? `${resultadoSeleccion.paraCargar.length.toLocaleString("es-ES")} seleccionados`
        : "—",
      duracionMs: hayDatos ? resultadoSeleccion.duracionMs : null,
      detalle: hayDatos
        ? `${resultadoSeleccion.coinciden.length.toLocaleString("es-ES")} coinciden con los filtros`
        : undefined,
    },
    {
      id: "carga",
      pestana: "carga",
      titulo: "Carga",
      descripcion:
        "Upsert en Supabase por lotes de ≤ 500 desde el servidor, y verificación posterior de las claves en destino.",
      estado: !carga
        ? "pendiente"
        : carga.enCurso
          ? "en_curso"
          : resumenCarga && (resumenCarga.lotesFallidos > 0 || resumenCarga.verificados < resumenCarga.total)
            ? "error"
            : "completada",
      entrada: carga ? `${resumenCarga!.total.toLocaleString("es-ES")} registros congelados` : "—",
      salida: carga ? `${resumenCarga!.verificados.toLocaleString("es-ES")} verificados en destino` : "—",
      duracionMs: carga?.duracionMs ?? null,
      detalle: carga
        ? `${carga.lotes.length} lote(s) · ${resumenCarga!.lotesFallidos} fallido(s)`
        : undefined,
    },
  ]

  const alternarSeleccion = (claves: string[], seleccionar: boolean) =>
    setSeleccion((s) => {
      const nueva = new Set(s)
      for (const k of claves) {
        if (seleccionar) nueva.add(k)
        else nueva.delete(k)
      }
      return nueva
    })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Big Data · Práctica 1
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Pipeline ETL: Open-Meteo → Supabase
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Extrae mediciones horarias históricas, observa cómo cambian los datos en cada fase y decide
          exactamente qué registros se guardan en la base de datos.
        </p>
      </header>

      <ConfiguracionExtraccion
        seleccion={seleccionCiudades}
        onSeleccion={setSeleccionCiudades}
        inicio={inicio}
        fin={fin}
        onInicio={setInicio}
        onFin={setFin}
        onExtraer={extraer}
        ocupado={Boolean(extraccion?.enCurso || carga?.enCurso)}
        ciudades={ciudadesExtraccion}
        periodoExtraido={extraccion ? { inicio: extraccion.inicio, fin: extraccion.fin } : null}
        onReintentar={reintentarCiudad}
      />

      <DiagramaPipeline fases={fases} activa={pestana} onInspeccionar={setPestana} />

      <Contadores
        total={transformacion.filas.length}
        validos={limpieza.validos.length}
        rechazados={limpieza.rechazados.length}
        coinciden={resultadoSeleccion.coinciden.length}
        seleccionados={resultadoSeleccion.paraCargar.length}
        fueraDeFiltro={resultadoSeleccion.seleccionadasFueraDeFiltro}
      />

      <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="json">JSON original</TabsTrigger>
            <TabsTrigger value="transformados">Transformados</TabsTrigger>
            <TabsTrigger value="validos">Válidos y selección</TabsTrigger>
            <TabsTrigger value="rechazados">Rechazados</TabsTrigger>
            <TabsTrigger value="carga">Vista previa y carga</TabsTrigger>
            <TabsTrigger value="supabase">Datos en Supabase</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="json" className="pt-2">
          <PestanaJson ciudades={ciudadesExtraccion} respuestas={respuestas} />
        </TabsContent>
        <TabsContent value="transformados" className="pt-2">
          <PestanaTransformados filas={transformacion.filas} avisos={transformacion.avisos} />
        </TabsContent>
        <TabsContent value="validos" className="pt-2">
          <PestanaValidos
            validos={limpieza.validos}
            ciudades={ordenCiudades}
            filtros={filtros}
            onFiltros={setFiltros}
            orden={orden}
            onOrden={setOrden}
            coinciden={resultadoSeleccion.coinciden}
            seleccion={seleccion}
            paraCargar={resultadoSeleccion.paraCargar.length}
            fueraDeFiltro={resultadoSeleccion.seleccionadasFueraDeFiltro}
            onAlternar={alternarSeleccion}
            onSeleccionarCoincidencias={() =>
              alternarSeleccion(resultadoSeleccion.coinciden.map(claveRegistro), true)
            }
            onVaciar={() => setSeleccion(new Set())}
            onIrACarga={() => setPestana("carga")}
          />
        </TabsContent>
        <TabsContent value="rechazados" className="pt-2">
          <PestanaRechazados rechazados={limpieza.rechazados} />
        </TabsContent>
        <TabsContent value="carga" className="pt-2">
          <PestanaCarga
            paraCargar={resultadoSeleccion.paraCargar}
            orden={orden}
            fueraDeFiltro={resultadoSeleccion.seleccionadasFueraDeFiltro}
            carga={carga}
            estadoServidor={estadoServidor}
            onSubir={subir}
            onReintentar={reintentarFallidos}
            onComprobarServidor={comprobarServidor}
          />
        </TabsContent>
        <TabsContent value="supabase" className="pt-2">
          <PestanaSupabase
            activa={pestana === "supabase"}
            version={versionDestino}
            pendientesLocales={resultadoSeleccion.paraCargar.length}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

