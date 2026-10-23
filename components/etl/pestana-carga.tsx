"use client"

import {
  ArrowClockwiseIcon,
  CloudArrowUpIcon,
  InfoIcon,
  LockSimpleIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { resumirCarga, TAMANO_LOTE, type Lote } from "@/lib/etl/carga"
import { paginar } from "@/lib/etl/filtrado"
import type { Orden, Registro } from "@/lib/etl/tipos"

import {
  Estado,
  formatoDuracion,
  formatoEntero,
  formatoFechaUtc,
  formatoNumero,
  Paginacion,
  Vacio,
  type EstadoFase,
} from "./comunes"
import type { EstadoCarga } from "./pipeline-etl"
import { COLUMNAS } from "./pestana-validos"

function estadoLote(l: Lote): { estado: EstadoFase; texto: string } {
  if (l.estado === "enviando") return { estado: "en_curso", texto: "Enviando" }
  if (l.estado === "error") return { estado: "error", texto: "Error" }
  if (l.estado === "pendiente") return { estado: "pendiente", texto: "Pendiente" }
  return { estado: "completada", texto: "Enviado" }
}

function textoVerificacion(l: Lote): { estado: EstadoFase; texto: string } {
  const v = l.verificacion
  if (v.estado === "verificando") return { estado: "en_curso", texto: "Verificando" }
  if (v.estado === "correcta")
    return { estado: "completada", texto: `${formatoEntero(v.encontrados)} / ${formatoEntero(l.registros.length)} en destino` }
  if (v.estado === "incompleta")
    return { estado: "error", texto: `Faltan ${formatoEntero(v.faltan.length)} claves` }
  if (v.estado === "error") return { estado: "error", texto: "Error al verificar" }
  return { estado: "pendiente", texto: "Sin verificar" }
}

export function PestanaCarga({
  paraCargar,
  orden,
  fueraDeFiltro,
  carga,
  estadoServidor,
  onSubir,
  onReintentar,
  onComprobarServidor,
}: {
  paraCargar: Registro[]
  orden: Orden
  fueraDeFiltro: number
  carga: EstadoCarga | null
  estadoServidor: { listo: boolean; mensaje: string } | null
  onSubir: () => void
  onReintentar: () => void
  onComprobarServidor: () => void
}) {
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(25)
  const vista = paginar(paraCargar, pagina, tamano)
  const resumen = carga ? resumirCarga(carga.lotes) : null
  const enCurso = Boolean(carga?.enCurso)
  const titulo = COLUMNAS.find((c) => c.campo === orden.campo)?.titulo ?? orden.campo
  const lotesPrevistos = Math.ceil(paraCargar.length / TAMANO_LOTE)
  const verificacionesConError = carga?.lotes.filter(
    (l) => l.verificacion.estado === "error" || l.verificacion.estado === "incompleta"
  )

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <InfoIcon />
        <AlertTitle>El orden no se guarda en la base de datos</AlertTitle>
        <AlertDescription>
          Las filas se envían en el orden de esta vista previa ({titulo},{" "}
          {orden.direccion === "asc" ? "ascendente" : "descendente"}), pero una tabla SQL no conserva el orden
          de inserción. Cualquier consulta posterior debe indicar <code>ORDER BY</code> para obtener un orden
          concreto.
        </AlertDescription>
      </Alert>

      {estadoServidor && !estadoServidor.listo && (
        <Alert variant="destructive">
          <WarningIcon />
          <AlertTitle>Supabase no está listo para recibir datos</AlertTitle>
          <AlertDescription>
            <p>{estadoServidor.mensaje}</p>
            <Button size="xs" variant="outline" className="mt-2" onClick={onComprobarServidor}>
              <ArrowClockwiseIcon data-icon="inline-start" />
              Comprobar de nuevo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-primary/30 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {formatoEntero(paraCargar.length)} registros seleccionados que cumplen los filtros
          </span>
          <span className="text-xs text-muted-foreground">
            Se enviarán en {lotesPrevistos} lote(s) de máximo {TAMANO_LOTE}, con upsert por (ciudad, fecha_hora).
            La escritura se hace desde el servidor; el navegador nunca ve la clave secreta.
          </span>
          {fueraDeFiltro > 0 && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {formatoEntero(fueraDeFiltro)} filas seleccionadas quedan fuera de los filtros y no se incluyen.
            </span>
          )}
        </div>
        <Button
          size="lg"
          className="ms-auto"
          onClick={onSubir}
          disabled={paraCargar.length === 0 || enCurso}
          aria-busy={enCurso}
        >
          <CloudArrowUpIcon data-icon="inline-start" />
          {enCurso ? "Carga en curso…" : `Subir ${formatoEntero(paraCargar.length)} registros a Supabase`}
        </Button>
      </div>

      {carga && resumen && (
        <section aria-labelledby="titulo-lotes" className="flex flex-col gap-3 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="titulo-lotes" className="font-semibold">
              Carga {enCurso ? "en curso" : "finalizada"}
            </h3>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockSimpleIcon aria-hidden />
              Copia congelada de {formatoEntero(resumen.total)} registros ({carga.congeladaEn.toLocaleTimeString("es-ES")}).
              Cambiar filtros o selección ahora no afecta a esta carga.
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-live="polite">
            <div className="rounded-xl bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">Enviados correctamente</dt>
              <dd className="font-semibold tabular-nums">{formatoEntero(resumen.enviadosOk)}</dd>
            </div>
            <div className="rounded-xl bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">Fallidos</dt>
              <dd className="font-semibold tabular-nums">{formatoEntero(resumen.fallidos)}</dd>
            </div>
            <div className="rounded-xl bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">Verificados en destino</dt>
              <dd className="font-semibold tabular-nums">{formatoEntero(resumen.verificados)}</dd>
            </div>
            <div className="rounded-xl bg-muted/60 p-2">
              <dt className="text-xs text-muted-foreground">Filas afectadas según Supabase</dt>
              <dd className="font-semibold tabular-nums">
                {resumen.procesadosSegunSupabase === null ? "—" : formatoEntero(resumen.procesadosSegunSupabase)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Supabase devuelve cuántas filas afectó el upsert, pero no distingue inserciones de actualizaciones,
            así que no se muestran por separado. Duración total: {formatoDuracion(carga.duracionMs)}.
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead className="text-end">Registros</TableHead>
                <TableHead>Envío</TableHead>
                <TableHead>Verificación</TableHead>
                <TableHead className="text-end">Intentos</TableHead>
                <TableHead className="text-end">Duración</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carga.lotes.map((l) => {
                const envio = estadoLote(l)
                const verif = textoVerificacion(l)
                return (
                  <TableRow key={l.numero}>
                    <TableCell>#{l.numero}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatoEntero(l.registros.length)}</TableCell>
                    <TableCell><Estado estado={envio.estado} texto={envio.texto} /></TableCell>
                    <TableCell><Estado estado={verif.estado} texto={verif.texto} /></TableCell>
                    <TableCell className="text-end tabular-nums">{l.intentos}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatoDuracion(l.duracionMs)}</TableCell>
                    <TableCell className="max-w-sm text-xs whitespace-normal text-destructive">
                      {l.error ??
                        (l.verificacion.estado === "error" ? l.verificacion.error : null) ??
                        (l.verificacion.estado === "incompleta"
                          ? `No encontradas: ${l.verificacion.faltan.slice(0, 3).join(", ")}${l.verificacion.faltan.length > 3 ? "…" : ""}`
                          : "")}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {!enCurso && (resumen.lotesFallidos > 0 || (verificacionesConError?.length ?? 0) > 0) && (
            <Button variant="outline" className="self-start" onClick={onReintentar}>
              <ArrowClockwiseIcon data-icon="inline-start" />
              Reintentar {resumen.lotesFallidos > 0 ? `${resumen.lotesFallidos} lote(s) fallido(s)` : "la verificación"}
            </Button>
          )}
        </section>
      )}

      <section aria-labelledby="titulo-vista-previa" className="flex flex-col gap-2">
        <h3 id="titulo-vista-previa" className="font-semibold">
          Vista previa: conjunto exacto que se enviará
        </h3>
        {paraCargar.length === 0 ? (
          <Vacio>
            No hay filas seleccionadas que cumplan los filtros. Selecciónalas en la pestaña “Válidos y selección”.
          </Vacio>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-end">Posición</TableHead>
                  <TableHead>Lote</TableHead>
                  {COLUMNAS.map((c) => (
                    <TableHead key={c.campo} className={c.numerica ? "text-end" : undefined}>
                      {c.titulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vista.filas.map((r, i) => {
                  const posicion = (vista.pagina - 1) * tamano + i + 1
                  return (
                    <TableRow key={`${r.ciudad}|${r.fecha_hora}`}>
                      <TableCell className="text-end tabular-nums">{formatoEntero(posicion)}</TableCell>
                      <TableCell className="tabular-nums">#{Math.ceil(posicion / TAMANO_LOTE)}</TableCell>
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
              total={paraCargar.length}
              tamano={tamano}
              etiqueta="registros a enviar"
              onPagina={setPagina}
              onTamano={(t) => {
                setTamano(t)
                setPagina(1)
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
