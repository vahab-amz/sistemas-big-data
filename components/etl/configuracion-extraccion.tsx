"use client"

import { ArrowClockwiseIcon, DownloadSimpleIcon } from "@phosphor-icons/react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CIUDADES, MAX_DIAS_EXTRACCION, validarConfiguracion } from "@/lib/etl/extraccion"

import { Estado, formatoDuracion, formatoEntero } from "./comunes"
import type { EstadoCiudad } from "./pipeline-etl"

export function ConfiguracionExtraccion({
  seleccion,
  onSeleccion,
  inicio,
  fin,
  onInicio,
  onFin,
  onExtraer,
  ocupado,
  ciudades,
  periodoExtraido,
  onReintentar,
}: {
  seleccion: string[]
  onSeleccion: (ids: string[]) => void
  inicio: string
  fin: string
  onInicio: (v: string) => void
  onFin: (v: string) => void
  onExtraer: () => void
  ocupado: boolean
  ciudades: EstadoCiudad[]
  periodoExtraido: { inicio: string; fin: string } | null
  onReintentar: (id: string) => void
}) {
  const validacion = validarConfiguracion(seleccion, inicio, fin)
  const valido = validacion.errores.length === 0
  const procesadas = ciudades.filter((c) => c.estado === "correcta" || c.estado === "error").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            1
          </span>
          Configuración de extracción
        </CardTitle>
        <CardDescription>
          Elige ciudades y periodo (máximo {MAX_DIAS_EXTRACCION} días). Las fechas se interpretan en UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Ciudades</legend>
            <div className="flex flex-wrap gap-2">
              {CIUDADES.map((c) => {
                const marcada = seleccion.includes(c.id)
                return (
                  <Label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5"
                  >
                    <Checkbox
                      checked={marcada}
                      disabled={ocupado}
                      onCheckedChange={(v) =>
                        onSeleccion(
                          v ? CIUDADES.filter((x) => x.id === c.id || seleccion.includes(x.id)).map((x) => x.id)
                            : seleccion.filter((id) => id !== c.id)
                        )
                      }
                    />
                    {c.nombre}
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {c.latitud}, {c.longitud}
                    </span>
                  </Label>
                )
              })}
            </div>
            <div className="flex gap-2 text-xs">
              <Button variant="link" size="xs" className="px-0" disabled={ocupado} onClick={() => onSeleccion(CIUDADES.map((c) => c.id))}>
                Todas
              </Button>
              <Button variant="link" size="xs" className="px-0" disabled={ocupado} onClick={() => onSeleccion([])}>
                Ninguna
              </Button>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-inicio">Fecha inicial (UTC)</Label>
              <Input
                id="fecha-inicio"
                type="date"
                value={inicio}
                disabled={ocupado}
                onChange={(e) => onInicio(e.target.value)}
                aria-invalid={!valido && validacion.errores.some((e) => e.includes("inicial"))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-fin">Fecha final (UTC)</Label>
              <Input
                id="fecha-fin"
                type="date"
                value={fin}
                disabled={ocupado}
                onChange={(e) => onFin(e.target.value)}
                aria-invalid={!valido && validacion.errores.some((e) => e.includes("final") || e.includes("periodo"))}
              />
            </div>
          </div>
        </div>

        <div className="hidden w-px bg-border lg:block" />

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium">Volumen previsto</p>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Peticiones", formatoEntero(validacion.peticiones)],
                ["Días", formatoEntero(validacion.dias)],
                ["Registros horarios", valido ? formatoEntero(validacion.registrosPrevistos) : "—"],
              ].map(([t, v]) => (
                <div key={t} className="rounded-2xl bg-muted/60 px-2 py-3">
                  <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                  <dt className="text-xs text-muted-foreground">{t}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Registros = ciudades × días × 24 horas. Cada registro trae 3 variables: temperatura (°C),
              humedad relativa (%) y precipitación (mm).
            </p>
          </div>

          {!valido && (
            <Alert variant="destructive">
              <AlertTitle>Revisa la configuración</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-4">
                  {validacion.errores.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Button size="lg" onClick={onExtraer} disabled={!valido || ocupado} className="self-start">
            <DownloadSimpleIcon data-icon="inline-start" />
            {ocupado && ciudades.some((c) => c.estado === "descargando") ? "Extrayendo…" : "Extraer datos"}
          </Button>
        </div>

        {ciudades.length > 0 && (
          <div className="flex flex-col gap-2 lg:col-span-3">
            <p className="text-sm font-medium" aria-live="polite">
              Peticiones: {procesadas} de {ciudades.length} procesadas
              {periodoExtraido && (
                <span className="font-normal text-muted-foreground">
                  {" "}· periodo extraído {periodoExtraido.inicio} → {periodoExtraido.fin}
                </span>
              )}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {ciudades.map((c) => (
                <li key={c.ciudad.id} className="flex flex-col gap-1 rounded-2xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.ciudad.nombre}</span>
                    <Estado
                      estado={
                        c.estado === "correcta"
                          ? "completada"
                          : c.estado === "descargando"
                            ? "en_curso"
                            : c.estado === "error"
                              ? "error"
                              : "pendiente"
                      }
                      texto={
                        c.estado === "correcta"
                          ? "Procesada"
                          : c.estado === "descargando"
                            ? "Descargando"
                            : c.estado === "error"
                              ? "Error"
                              : "Pendiente"
                      }
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.duracionMs !== null ? formatoDuracion(c.duracionMs) : "—"}
                    {c.intentos > 1 && ` · ${c.intentos} intentos`}
                  </span>
                  {c.error && <p className="text-xs wrap-break-word text-destructive">{c.error}</p>}
                  {c.estado === "error" && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="self-start"
                      disabled={ocupado}
                      onClick={() => onReintentar(c.ciudad.id)}
                    >
                      <ArrowClockwiseIcon data-icon="inline-start" />
                      Reintentar {c.ciudad.nombre}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
