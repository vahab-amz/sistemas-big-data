"use client"

import { ArrowClockwiseIcon, DatabaseIcon } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CIUDADES } from "@/lib/etl/extraccion"

import {
  formatoEntero,
  formatoFechaUtc,
  formatoNumero,
  Paginacion,
  SelectorNativo,
  Vacio,
} from "./comunes"

type Fila = {
  id: number
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
  importado_en: string
}

const CAMPOS = [
  ["fecha_hora", "Fecha y hora (UTC)"],
  ["ciudad", "Ciudad"],
  ["temperatura_c", "Temperatura (°C)"],
  ["humedad_pct", "Humedad (%)"],
  ["precipitacion_mm", "Precipitación (mm)"],
  ["importado_en", "Importado en"],
] as const

export function PestanaSupabase({
  activa,
  version,
  pendientesLocales,
}: {
  activa: boolean
  version: number
  pendientesLocales: number
}) {
  const [ciudades, setCiudades] = useState<string[]>([])
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [orden, setOrden] = useState("fecha_hora")
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc")
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(25)

  const [datos, setDatos] = useState<{ total: number; filas: Fila[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [leidoEn, setLeidoEn] = useState<Date | null>(null)

  const leer = useCallback(async () => {
    const p = new URLSearchParams({ orden, dir: direccion, pagina: String(pagina), tam: String(tamano) })
    for (const c of ciudades) p.append("ciudad", c)
    if (desde) p.set("desde", `${desde}:00Z`)
    if (hasta) p.set("hasta", `${hasta}:00Z`)
    setCargando(true)
    try {
      const r = await fetch(`/api/mediciones?${p}`, { cache: "no-store" })
      const cuerpo = await r.json()
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${cuerpo.error ?? "error desconocido"}`)
      setDatos(cuerpo)
      setError(null)
      setLeidoEn(new Date())
    } catch (e) {
      setDatos(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [ciudades, desde, hasta, orden, direccion, pagina, tamano])

  useEffect(() => {
    // Lectura real del destino al abrir la pestaña, al cambiar la consulta y tras cada carga.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activa) void leer()
  }, [activa, leer, version])

  const totalPaginas = Math.max(1, Math.ceil((datos?.total ?? 0) / tamano))

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <DatabaseIcon />
        <AlertTitle>Datos persistidos en Supabase</AlertTitle>
        <AlertDescription>
          Esta tabla se lee de la base de datos real (<code>mediciones_meteorologicas</code>) a través del
          servidor. No incluye los {formatoEntero(pendientesLocales)} registros locales seleccionados que solo
          existen en tu navegador hasta que los subas.
        </AlertDescription>
      </Alert>

      <section aria-label="Filtros de la consulta" className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Ciudades</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CIUDADES.map((c) => (
              <Label key={c.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={ciudades.includes(c.nombre)}
                  onCheckedChange={(v) => {
                    setCiudades(v ? [...ciudades, c.nombre] : ciudades.filter((n) => n !== c.nombre))
                    setPagina(1)
                  }}
                />
                {c.nombre}
              </Label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            Fechas <span className="font-normal text-muted-foreground">(UTC)</span>
          </legend>
          <Input
            type="datetime-local"
            step={3600}
            aria-label="Desde (UTC)"
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value.slice(0, 16))
              setPagina(1)
            }}
          />
          <Input
            type="datetime-local"
            step={3600}
            aria-label="Hasta (UTC)"
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value.slice(0, 16))
              setPagina(1)
            }}
          />
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">ORDER BY</legend>
          <SelectorNativo
            aria-label="Campo de ordenación"
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value)
              setPagina(1)
            }}
          >
            {CAMPOS.map(([campo, titulo]) => (
              <option key={campo} value={campo}>
                {titulo}
              </option>
            ))}
          </SelectorNativo>
          <SelectorNativo
            aria-label="Dirección"
            value={direccion}
            onChange={(e) => {
              setDireccion(e.target.value as "asc" | "desc")
              setPagina(1)
            }}
          >
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </SelectorNativo>
        </fieldset>
        <div className="flex flex-col justify-end gap-2">
          <Button onClick={() => void leer()} disabled={cargando}>
            <ArrowClockwiseIcon data-icon="inline-start" className={cargando ? "animate-spin" : undefined} />
            {cargando ? "Leyendo…" : "Actualizar"}
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {leidoEn ? `Última lectura: ${leidoEn.toLocaleTimeString("es-ES")}` : "Sin leer todavía"}
            {datos && ` · ${formatoEntero(datos.total)} filas en destino con estos filtros`}
          </span>
        </div>
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo leer Supabase</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {datos && datos.filas.length === 0 && <Vacio>La consulta no devuelve filas persistidas.</Vacio>}

      {datos && datos.filas.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-end">id</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Fecha y hora (UTC)</TableHead>
                <TableHead className="text-end">Temperatura (°C)</TableHead>
                <TableHead className="text-end">Humedad (%)</TableHead>
                <TableHead className="text-end">Precipitación (mm)</TableHead>
                <TableHead>Importado en (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos.filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-end tabular-nums">{f.id}</TableCell>
                  <TableCell>{f.ciudad}</TableCell>
                  <TableCell className="tabular-nums">{formatoFechaUtc(f.fecha_hora)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatoNumero(f.temperatura_c)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatoNumero(f.humedad_pct)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatoNumero(f.precipitacion_mm)}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {formatoFechaUtc(new Date(f.importado_en).toISOString())}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Paginacion
            pagina={Math.min(pagina, totalPaginas)}
            totalPaginas={totalPaginas}
            total={datos.total}
            tamano={tamano}
            etiqueta="filas persistidas"
            onPagina={setPagina}
            onTamano={(t) => {
              setTamano(t)
              setPagina(1)
            }}
          />
        </>
      )}
    </div>
  )
}
