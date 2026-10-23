"use client"

import { WarningIcon } from "@phosphor-icons/react"
import { useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { paginar } from "@/lib/etl/filtrado"
import type { FilaTransformada } from "@/lib/etl/tipos"

import { formatoFechaUtc, Paginacion, Vacio, ValorBruto } from "./comunes"

export function PestanaTransformados({
  filas,
  avisos,
}: {
  filas: FilaTransformada[]
  avisos: { ciudad: string; aviso: string }[]
}) {
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(25)
  if (filas.length === 0 && avisos.length === 0) {
    return <Vacio>No hay datos transformados todavía.</Vacio>
  }
  const vista = paginar(filas, pagina, tamano)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Cada posición de los arrays se convierte en un registro. La hora original (sin zona) se interpreta
        explícitamente como UTC. Los valores se copian <strong>tal cual</strong>: un <code>null</code> sigue
        siendo <code>null</code>; la limpieza decide después.
      </p>
      {avisos.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl border border-destructive/40 p-3 text-sm text-destructive">
          {avisos.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <WarningIcon aria-hidden className="mt-0.5 shrink-0" weight="bold" />
              <span>
                <strong>{a.ciudad}:</strong> {a.aviso}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ciudad</TableHead>
            <TableHead className="text-end">Índice en arrays</TableHead>
            <TableHead>time (original)</TableHead>
            <TableHead>fecha_hora (UTC)</TableHead>
            <TableHead className="text-end">Temperatura (°C)</TableHead>
            <TableHead className="text-end">Humedad (%)</TableHead>
            <TableHead className="text-end">Precipitación (mm)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vista.filas.map((f) => (
            <TableRow key={`${f.ciudad}-${f.indice}`}>
              <TableCell>{f.ciudad ?? <ValorBruto valor={null} />}</TableCell>
              <TableCell className="text-end tabular-nums">{f.indice}</TableCell>
              <TableCell className="font-mono text-xs">
                <ValorBruto valor={f.fecha_original} />
              </TableCell>
              <TableCell className="tabular-nums">
                {f.fecha_hora ? formatoFechaUtc(f.fecha_hora) : <span className="text-destructive">no válida</span>}
              </TableCell>
              <TableCell className="text-end"><ValorBruto valor={f.temperatura_c} /></TableCell>
              <TableCell className="text-end"><ValorBruto valor={f.humedad_pct} /></TableCell>
              <TableCell className="text-end"><ValorBruto valor={f.precipitacion_mm} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Paginacion
        pagina={vista.pagina}
        totalPaginas={vista.totalPaginas}
        total={filas.length}
        tamano={tamano}
        onPagina={setPagina}
        onTamano={(t) => {
          setTamano(t)
          setPagina(1)
        }}
      />
    </div>
  )
}
