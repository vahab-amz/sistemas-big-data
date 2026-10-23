"use client"

import { DownloadSimpleIcon } from "@phosphor-icons/react"
import { cn } from "cn"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { RespuestaOpenMeteo } from "@/lib/etl/tipos"

import { descargarJson, Estado, formatoEntero, Vacio } from "./comunes"
import type { EstadoCiudad } from "./pipeline-etl"

const ELEMENTOS_VISIBLES = 24

/**
 * JSON con sangría, pero con los arrays de valores en una sola línea y
 * recortados: el JSON completo de 31 días tiene miles de valores.
 */
function jsonAbreviado(valor: unknown, sangria = ""): string {
  if (Array.isArray(valor)) {
    const visibles = valor.slice(0, ELEMENTOS_VISIBLES).map((v) => JSON.stringify(v) ?? "undefined")
    const resto = valor.length - visibles.length
    return `[${visibles.join(", ")}${resto > 0 ? `, … (${formatoEntero(resto)} más)` : ""}]`
  }
  if (valor && typeof valor === "object") {
    const interior = sangria + "  "
    const entradas = Object.entries(valor).map(
      ([k, v]) => `${interior}${JSON.stringify(k)}: ${jsonAbreviado(v, interior)}`
    )
    return `{\n${entradas.join(",\n")}\n${sangria}}`
  }
  return JSON.stringify(valor)
}

export function PestanaJson({
  ciudades,
  respuestas,
}: {
  ciudades: EstadoCiudad[]
  respuestas: Record<string, RespuestaOpenMeteo>
}) {
  const [elegida, setElegida] = useState<string | null>(null)
  if (ciudades.length === 0) {
    return <Vacio>Todavía no hay extracciones. Configura el periodo y pulsa “Extraer datos”.</Vacio>
  }
  const actual = ciudades.find((c) => c.ciudad.id === elegida) ?? ciudades[0]
  const respuesta = respuestas[actual.ciudad.id]
  const conDatos = ciudades.filter((c) => respuestas[c.ciudad.id])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Respuesta original de la API, sin modificar. Se conserva en memoria durante la sesión y puede
        descargarse completa. Observa que <code>hourly</code> contiene <strong>arrays paralelos</strong>: la
        posición <em>i</em> de cada array corresponde a la hora <code>time[i]</code>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {ciudades.map((c) => (
          <Button
            key={c.ciudad.id}
            size="sm"
            variant={c.ciudad.id === actual.ciudad.id ? "default" : "outline"}
            onClick={() => setElegida(c.ciudad.id)}
            aria-pressed={c.ciudad.id === actual.ciudad.id}
          >
            {c.ciudad.nombre}
            {c.estado === "error" && " (error)"}
          </Button>
        ))}
        <Button
          size="sm"
          variant="secondary"
          className="ms-auto"
          disabled={conDatos.length === 0}
          onClick={() =>
            descargarJson(
              "open-meteo-original-todas.json",
              Object.fromEntries(conDatos.map((c) => [c.ciudad.nombre, respuestas[c.ciudad.id]]))
            )
          }
        >
          <DownloadSimpleIcon data-icon="inline-start" />
          Descargar todos
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{actual.ciudad.nombre}</h3>
          <Estado
            estado={
              actual.estado === "correcta"
                ? "completada"
                : actual.estado === "error"
                  ? "error"
                  : actual.estado === "descargando"
                    ? "en_curso"
                    : "pendiente"
            }
          />
        </div>
        <p className="font-mono text-xs break-all text-muted-foreground">
          GET {actual.url}
        </p>
        {actual.error && <p className="text-sm text-destructive">{actual.error}</p>}
        {respuesta ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                Coordenadas devueltas: {respuesta.latitude}, {respuesta.longitude} (celda de la rejilla del
                modelo)
              </span>
              <span>Zona: {String(respuesta.timezone)}</span>
              <span>Horas en time: {formatoEntero(respuesta.hourly?.time?.length ?? 0)}</span>
              <Button
                size="xs"
                variant="outline"
                className="ms-auto"
                onClick={() =>
                  descargarJson(`open-meteo-original-${actual.ciudad.id}.json`, respuesta)
                }
              >
                <DownloadSimpleIcon data-icon="inline-start" />
                Descargar JSON
              </Button>
            </div>
            <pre
              className={cn(
                "max-h-[28rem] overflow-auto rounded-xl bg-muted/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
              )}
              aria-label={`JSON original de ${actual.ciudad.nombre} (abreviado)`}
            >
              {jsonAbreviado(respuesta)}
            </pre>
            <p className="text-xs text-muted-foreground">
              Vista abreviada: cada array muestra sus primeros {ELEMENTOS_VISIBLES} valores. La descarga
              contiene el JSON completo.
            </p>
          </>
        ) : (
          !actual.error && <p className="text-sm text-muted-foreground">Aún no se ha recibido respuesta.</p>
        )}
      </div>
    </div>
  )
}
