"use client"

import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckSquareIcon,
  XSquareIcon,
} from "@phosphor-icons/react"
import { useState } from "react"

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
import { FILTROS_VACIOS, ORDEN_INICIAL, paginar } from "@/lib/etl/filtrado"
import { claveRegistro } from "@/lib/etl/limpieza"
import type { CampoOrden, Ciudad, Filtros, Orden, Registro } from "@/lib/etl/tipos"

import {
  formatoEntero,
  formatoFechaUtc,
  formatoNumero,
  Paginacion,
  SelectorNativo,
  Vacio,
} from "./comunes"

export const COLUMNAS: { campo: CampoOrden; titulo: string; numerica: boolean }[] = [
  { campo: "ciudad", titulo: "Ciudad", numerica: false },
  { campo: "fecha_hora", titulo: "Fecha y hora (UTC)", numerica: false },
  { campo: "temperatura_c", titulo: "Temperatura (°C)", numerica: true },
  { campo: "humedad_pct", titulo: "Humedad (%)", numerica: true },
  { campo: "precipitacion_mm", titulo: "Precipitación (mm)", numerica: true },
]

/** "" → null; cualquier otro valor del input numérico → número. */
const aNumero = (v: string) => (v.trim() === "" ? null : Number(v))
/** datetime-local ("2026-09-01T05:00") interpretado como UTC → "2026-09-01T05:00:00Z". */
const aIsoUtc = (v: string) => (v === "" ? null : `${v.slice(0, 16)}:00Z`)
const deIsoUtc = (v: string | null) => (v ? v.slice(0, 16) : "")

function RangoNumerico({
  etiqueta,
  unidad,
  min,
  max,
  onMin,
  onMax,
}: {
  etiqueta: string
  unidad: string
  min: number | null
  max: number | null
  onMin: (v: number | null) => void
  onMax: (v: number | null) => void
}) {
  const invertido = min !== null && max !== null && min > max
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">
        {etiqueta} <span className="font-normal text-muted-foreground">({unidad})</span>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step="any"
          placeholder="mín."
          aria-label={`${etiqueta} mínima`}
          value={min ?? ""}
          onChange={(e) => onMin(aNumero(e.target.value))}
          aria-invalid={invertido}
        />
        <Input
          type="number"
          step="any"
          placeholder="máx."
          aria-label={`${etiqueta} máxima`}
          value={max ?? ""}
          onChange={(e) => onMax(aNumero(e.target.value))}
          aria-invalid={invertido}
        />
      </div>
      {invertido && <p className="text-xs text-destructive">El mínimo es mayor que el máximo.</p>}
    </fieldset>
  )
}

export function PestanaValidos({
  validos,
  ciudades,
  filtros,
  onFiltros,
  orden,
  onOrden,
  coinciden,
  seleccion,
  paraCargar,
  fueraDeFiltro,
  onAlternar,
  onSeleccionarCoincidencias,
  onVaciar,
  onIrACarga,
}: {
  validos: Registro[]
  ciudades: Ciudad[]
  filtros: Filtros
  onFiltros: (f: Filtros) => void
  orden: Orden
  onOrden: (o: Orden) => void
  coinciden: Registro[]
  seleccion: ReadonlySet<string>
  paraCargar: number
  fueraDeFiltro: number
  onAlternar: (claves: string[], seleccionar: boolean) => void
  onSeleccionarCoincidencias: () => void
  onVaciar: () => void
  onIrACarga: () => void
}) {
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(25)

  if (validos.length === 0) return <Vacio>No hay registros válidos todavía.</Vacio>

  // Cambiar filtros u orden vuelve a la primera página (la paginación es solo vista).
  const cambiarFiltros = (cambios: Partial<Filtros>) => {
    onFiltros({ ...filtros, ...cambios })
    setPagina(1)
  }
  const cambiarOrden = (o: Orden) => {
    onOrden(o)
    setPagina(1)
  }

  const vista = paginar(coinciden, pagina, tamano)
  const clavesPagina = vista.filas.map(claveRegistro)
  const marcadasPagina = clavesPagina.filter((k) => seleccion.has(k)).length
  const fechasInvertidas =
    filtros.desde !== null && filtros.hasta !== null && filtros.desde > filtros.hasta

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Orden de operaciones: <strong>válidos → filtros → ordenación → selección → carga</strong>. Cambiar
        los filtros no selecciona filas nuevas automáticamente.
      </p>

      <section aria-label="Filtros" className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Ciudades</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ciudades.map((c) => (
              <Label key={c.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={filtros.ciudades.includes(c.nombre)}
                  onCheckedChange={(v) =>
                    cambiarFiltros({
                      ciudades: v
                        ? [...filtros.ciudades, c.nombre]
                        : filtros.ciudades.filter((n) => n !== c.nombre),
                    })
                  }
                />
                {c.nombre}
              </Label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Sin marcar = todas.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            Intervalo de fecha y hora <span className="font-normal text-muted-foreground">(UTC)</span>
          </legend>
          <Input
            type="datetime-local"
            step={3600}
            aria-label="Desde (UTC)"
            value={deIsoUtc(filtros.desde)}
            onChange={(e) => cambiarFiltros({ desde: aIsoUtc(e.target.value) })}
            aria-invalid={fechasInvertidas}
          />
          <Input
            type="datetime-local"
            step={3600}
            aria-label="Hasta (UTC)"
            value={deIsoUtc(filtros.hasta)}
            onChange={(e) => cambiarFiltros({ hasta: aIsoUtc(e.target.value) })}
            aria-invalid={fechasInvertidas}
          />
          {fechasInvertidas && <p className="text-xs text-destructive">“Desde” es posterior a “hasta”.</p>}
        </fieldset>

        <div className="flex flex-col gap-3">
          <RangoNumerico
            etiqueta="Temperatura"
            unidad="°C"
            min={filtros.temperaturaMin}
            max={filtros.temperaturaMax}
            onMin={(v) => cambiarFiltros({ temperaturaMin: v })}
            onMax={(v) => cambiarFiltros({ temperaturaMax: v })}
          />
          <RangoNumerico
            etiqueta="Humedad"
            unidad="%"
            min={filtros.humedadMin}
            max={filtros.humedadMax}
            onMin={(v) => cambiarFiltros({ humedadMin: v })}
            onMax={(v) => cambiarFiltros({ humedadMax: v })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <RangoNumerico
            etiqueta="Precipitación"
            unidad="mm"
            min={filtros.precipitacionMin}
            max={filtros.precipitacionMax}
            onMin={(v) => cambiarFiltros({ precipitacionMin: v })}
            onMax={(v) => cambiarFiltros({ precipitacionMax: v })}
          />
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={filtros.soloLluvia}
              onCheckedChange={(v) => cambiarFiltros({ soloLluvia: Boolean(v) })}
            />
            Solo registros con lluvia (precipitación &gt; 0)
          </Label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Ordenar por</legend>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <SelectorNativo
                aria-label="Campo de ordenación"
                value={orden.campo}
                onChange={(e) => cambiarOrden({ ...orden, campo: e.target.value as CampoOrden })}
              >
                {COLUMNAS.map((c) => (
                  <option key={c.campo} value={c.campo}>
                    {c.titulo}
                  </option>
                ))}
              </SelectorNativo>
              <SelectorNativo
                aria-label="Dirección"
                value={orden.direccion}
                onChange={(e) => cambiarOrden({ ...orden, direccion: e.target.value as "asc" | "desc" })}
              >
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </SelectorNativo>
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onFiltros(FILTROS_VACIOS)
              onOrden(ORDEN_INICIAL)
              setPagina(1)
            }}
          >
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Restablecer filtros
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <span className="text-sm">
          <strong className="tabular-nums">{formatoEntero(coinciden.length)}</strong> de{" "}
          {formatoEntero(validos.length)} válidos coinciden ·{" "}
          <strong className="tabular-nums">{formatoEntero(paraCargar)}</strong> seleccionados para cargar
          {fueraDeFiltro > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}· {formatoEntero(fueraDeFiltro)} seleccionados fuera de los filtros (no se subirán)
            </span>
          )}
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onSeleccionarCoincidencias} disabled={coinciden.length === 0}>
            <CheckSquareIcon data-icon="inline-start" />
            Seleccionar las {formatoEntero(coinciden.length)} coincidencias
          </Button>
          <Button size="sm" variant="outline" onClick={onVaciar} disabled={seleccion.size === 0}>
            <XSquareIcon data-icon="inline-start" />
            Vaciar selección
          </Button>
          <Button size="sm" onClick={onIrACarga} disabled={paraCargar === 0}>
            Revisar carga
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>

      {coinciden.length === 0 ? (
        <Vacio>Ningún registro válido cumple los filtros actuales.</Vacio>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Seleccionar todas las filas de esta página"
                    checked={marcadasPagina === clavesPagina.length}
                    indeterminate={marcadasPagina > 0 && marcadasPagina < clavesPagina.length}
                    onCheckedChange={(v) => onAlternar(clavesPagina, Boolean(v))}
                  />
                </TableHead>
                {COLUMNAS.map((c) => {
                  const activa = orden.campo === c.campo
                  return (
                    <TableHead
                      key={c.campo}
                      className={c.numerica ? "text-end" : undefined}
                      aria-sort={activa ? (orden.direccion === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:underline"
                        onClick={() =>
                          cambiarOrden({
                            campo: c.campo,
                            direccion: activa && orden.direccion === "asc" ? "desc" : "asc",
                          })
                        }
                      >
                        {c.titulo}
                        {activa &&
                          (orden.direccion === "asc" ? (
                            <CaretUpIcon aria-label="ascendente" />
                          ) : (
                            <CaretDownIcon aria-label="descendente" />
                          ))}
                      </button>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vista.filas.map((r) => {
                const clave = claveRegistro(r)
                const marcada = seleccion.has(clave)
                return (
                  <TableRow key={clave} data-state={marcada ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Seleccionar ${r.ciudad} ${formatoFechaUtc(r.fecha_hora)}`}
                        checked={marcada}
                        onCheckedChange={(v) => onAlternar([clave], Boolean(v))}
                      />
                    </TableCell>
                    <TableCell>{r.ciudad}</TableCell>
                    <TableCell className="tabular-nums">{formatoFechaUtc(r.fecha_hora)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatoNumero(r.temperatura_c)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatoNumero(r.humedad_pct)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatoNumero(r.precipitacion_mm)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Paginacion
            pagina={vista.pagina}
            totalPaginas={vista.totalPaginas}
            total={coinciden.length}
            tamano={tamano}
            etiqueta="coincidencias"
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
