import { useState, useRef, useMemo } from 'react'
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { procesarArchivo, combinarArchivos } from '../utils/excel'
import { buscarDriver } from '../utils/calc'
import { nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Card, KPI, PageTitle, Boton, Tabla, Aviso, Badge, Input, Spinner } from '../components/ui'
import Verificacion from '../components/Verificacion'

export default function CargarFactura() {
  const { perfil } = useAuth()
  const { drivers, reloadInvoices, reloadDrivers, setSelectedInvoiceId } = useData()
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [combinado, setCombinado] = useState(null)
  const [detalleArchivos, setDetalleArchivos] = useState([])
  const [semana, setSemana] = useState('')
  const [avisos, setAvisos] = useState([])
  const [errores, setErrores] = useState([])
  const [guardado, setGuardado] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [precios, setPrecios] = useState({}) // courier -> { ind, doble }
  const [busqueda, setBusqueda] = useState('')
  const [bulk, setBulk] = useState({ ind: '', doble: '' })
  const inputRef = useRef(null)

  const reset = () => {
    setCombinado(null)
    setDetalleArchivos([])
    setSemana('')
    setAvisos([])
    setErrores([])
    setGuardado(false)
    setPrecios({})
    setBusqueda('')
    setBulk({ ind: '', doble: '' })
  }

  const manejarArchivos = async (fileList) => {
    const files = Array.from(fileList).filter((f) => /\.xlsx?$/i.test(f.name))
    if (files.length === 0) return setErrores(['No se detectaron archivos .xlsx.'])
    reset()
    setProcesando(true)
    const nuevosAvisos = []
    const nuevosErrores = []
    try {
      const procesados = []
      for (const f of files) {
        const buf = await f.arrayBuffer()
        const p = procesarArchivo(buf, f.name)
        if (p.errores.length) p.errores.forEach((e) => nuevosErrores.push(`${f.name}: ${e}`))
        procesados.push(p)
      }
      const semanas = [...new Set(procesados.map((p) => p.semana).filter(Boolean))]
      let semanaFinal = semanas[0] || ''
      if (semanas.length > 1) nuevosAvisos.push(`⚠️ Los archivos tienen semanas distintas (${semanas.join(', ')}). Se usará "${semanaFinal}". Revisa que correspondan a la misma semana.`)
      if (!semanaFinal) nuevosAvisos.push('No se detectó la semana en el nombre de los archivos. Escríbela manualmente antes de guardar.')

      const comb = combinarArchivos(procesados)

      // choferes únicos detectados (log de diagnóstico)
      const couriersUnicos = [...new Set(comb.resumenChoferes.map((c) => c.nombre))]
      // eslint-disable-next-line no-console
      console.log(`[Gofo] Choferes únicos detectados en "Details of Delivery Fees": ${couriersUnicos.length}`, couriersUnicos)

      // inicializar precios de los choferes NUEVOS (no existentes en drivers)
      const nuevos = couriersUnicos.filter((n) => !buscarDriver(drivers, n))
      const p0 = {}
      nuevos.forEach((n) => (p0[n] = { ind: '', doble: '' }))
      setPrecios(p0)

      setCombinado(comb)
      setSemana(semanaFinal)
      setDetalleArchivos(
        procesados.map((p) => ({
          _key: p.archivoNombre,
          archivo: p.archivoNombre,
          semana: p.semana || '—',
          ciudades: p.ciudadesDetectadas.map(nombreCiudad).join(', ') || '—',
          paquetes: p.detalles.length,
          claims: p.claims.length,
        }))
      )
      setAvisos(nuevosAvisos)
      setErrores(nuevosErrores)
    } catch (e) {
      setErrores([e.message])
    } finally {
      setProcesando(false)
    }
  }

  const choferesNuevos = useMemo(
    () => (combinado ? [...new Set(combinado.resumenChoferes.map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n)).sort() : []),
    [combinado, drivers]
  )

  const setPrecio = (courier, campo, valor) => setPrecios((p) => ({ ...p, [courier]: { ...(p[courier] || { ind: '', doble: '' }), [campo]: valor } }))

  const aplicarBulk = () => {
    setPrecios((p) => {
      const np = { ...p }
      choferesNuevos.forEach((n) => {
        np[n] = {
          ind: np[n]?.ind && Number(np[n].ind) > 0 ? np[n].ind : bulk.ind,
          doble: np[n]?.doble && Number(np[n].doble) > 0 ? np[n].doble : bulk.doble,
        }
      })
      return np
    })
  }

  const todosConPrecio = choferesNuevos.every((n) => Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0)
  const nuevosFiltrados = choferesNuevos.filter((n) => n.toLowerCase().includes(busqueda.trim().toLowerCase()))
  const nConPrecio = choferesNuevos.filter((n) => Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0).length

  const guardar = async () => {
    if (!combinado) return
    if (!semana.trim()) return setErrores(['Debes indicar la semana antes de guardar.'])
    if (choferesNuevos.length > 0 && !todosConPrecio) return setErrores(['Falta asignar precio individual y doble (>0) a todos los choferes nuevos.'])
    setGuardando(true)
    setErrores([])
    try {
      // 1) crear los choferes nuevos en `drivers` (en lotes)
      if (choferesNuevos.length > 0) {
        const chunk = 450
        for (let i = 0; i < choferesNuevos.length; i += chunk) {
          const batch = writeBatch(db)
          for (const n of choferesNuevos.slice(i, i + chunk)) {
            const dref = doc(collection(db, 'drivers'))
            batch.set(dref, {
              nombre: n,
              precioIndividual: Number(precios[n].ind) || 0,
              precioDoble: Number(precios[n].doble) || 0,
              activo: true,
              companyId: perfil?.companyId || 'default',
              creadoEn: serverTimestamp(),
            })
          }
          await batch.commit()
        }
        await reloadDrivers()
      }

      // 2) guardar la factura (solo resumen) + claims
      const { detalles, claims, ...resumen } = combinado
      const invoicePayload = {
        semana: semana.trim(),
        archivoNombre: detalleArchivos.map((d) => d.archivo).join(', '),
        fechaCarga: serverTimestamp(),
        ...resumen,
      }
      const ref = await addDoc(collection(db, 'invoices'), invoicePayload)
      const chunk = 450
      for (let i = 0; i < claims.length; i += chunk) {
        const batch = writeBatch(db)
        for (const c of claims.slice(i, i + chunk)) {
          const cref = doc(collection(db, 'claims'))
          batch.set(cref, {
            invoiceId: ref.id,
            semana: semana.trim(),
            waybill: c.waybill,
            courier: c.courier,
            date: c.date,
            postalCode: c.postalCode,
            claimType: c.claimType,
            montoGofo: c.montoGofo,
            ciudad: c.ciudad || '',
            perdonado: false,
            motivo: '',
            perdonadoPor: '',
            perdonadoEn: null,
          })
        }
        await batch.commit()
      }
      await reloadInvoices()
      setSelectedInvoiceId(ref.id)
      setGuardado(true)
    } catch (e) {
      setErrores(['Error al guardar: ' + e.message])
    } finally {
      setGuardando(false)
    }
  }

  const puedeGuardar = !guardando && !!semana.trim() && (choferesNuevos.length === 0 || todosConPrecio)

  return (
    <div>
      <PageTitle>Cargar Factura</PageTitle>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); manejarArchivos(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-300 bg-surface-card dark:border-slate-600 dark:bg-surface-dark-card'
        }`}
      >
        <div className="text-4xl">⬆️</div>
        <div className="mt-2 font-bold text-brand-navy dark:text-slate-100">Arrastra uno o varios .xlsx (uno por ciudad)</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">o haz clic para seleccionar archivos</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => manejarArchivos(e.target.files)} />
      </div>

      {procesando && (
        <Aviso tipo="info">
          <span className="inline-flex items-center gap-2">
            <Spinner className="text-sky-600" /> Procesando archivo(s)… puede tardar si tienen 100.000+ filas.
          </span>
        </Aviso>
      )}
      {errores.map((e, i) => <Aviso key={i} tipo="error">{e}</Aviso>)}
      {avisos.map((a, i) => <Aviso key={i} tipo="warn">{a}</Aviso>)}
      {guardado && <Aviso tipo="ok">✅ Factura guardada correctamente en la base de datos.</Aviso>}

      {combinado && !guardado && (
        <>
          <Verificacion v={combinado.verificacion} />

          <div className="mb-4 flex flex-wrap gap-3">
            <KPI label="Paquetes" value={num(combinado.totalPaquetes)} icon="📦" accent="navy" />
            <KPI label="Individuales" value={num(combinado.totalIndividuales)} accent="blue" />
            <KPI label="Dobles" value={num(combinado.totalDobles)} accent="gold" />
            <KPI label="Ingreso total" value={money(combinado.ingresoTotal)} icon="💵" accent="green" />
            <KPI label="Choferes" value={num(combinado.numChoferes)} icon="🚚" accent="slate" />
            <KPI label="Rutas" value={num(combinado.numRutas)} accent="slate" />
            <KPI label="Claims" value={num(combinado.totalClaims)} icon="⚠️" accent="red" />
          </div>

          {/* Pantalla previa OBLIGATORIA: tarifas de choferes nuevos */}
          {choferesNuevos.length > 0 && (
            <Card className="mb-4 border-2 border-brand-gold/60 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Choferes nuevos — asigna sus tarifas</h3>
                <Badge color="gold">{choferesNuevos.length} nuevos</Badge>
                <Badge color={nConPrecio === choferesNuevos.length ? 'green' : 'slate'}>{nConPrecio}/{choferesNuevos.length} con precio</Badge>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Cada chofer tiene su propia tarifa. Debes asignar precio individual y doble (mayores que 0) a todos antes de guardar.
              </p>

              <div className="mb-3 flex flex-wrap items-end gap-2">
                <Input className="w-56" placeholder="🔎 Buscar chofer…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                <div className="ml-auto flex items-end gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Rellenar todos: individual</div>
                    <Input className="w-28" type="number" step="0.01" value={bulk.ind} onChange={(e) => setBulk((b) => ({ ...b, ind: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">doble</div>
                    <Input className="w-28" type="number" step="0.01" value={bulk.doble} onChange={(e) => setBulk((b) => ({ ...b, doble: e.target.value }))} />
                  </div>
                  <Boton variant="ghost" onClick={aplicarBulk}>Aplicar a vacíos</Boton>
                </div>
              </div>

              <div className="scroll-thin max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Chofer</th>
                      <th className="px-3 py-2 text-right font-semibold">Precio individual</th>
                      <th className="px-3 py-2 text-right font-semibold">Precio doble</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nuevosFiltrados.map((n, i) => {
                      const ok = Number(precios[n]?.ind) > 0 && Number(precios[n]?.doble) > 0
                      return (
                        <tr key={n} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                          <td className="px-3 py-1.5">
                            {ok ? '✅ ' : '• '}{n}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Input className="w-28 text-right" type="number" step="0.01" min="0" value={precios[n]?.ind ?? ''} onChange={(e) => setPrecio(n, 'ind', e.target.value)} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Input className="w-28 text-right" type="number" step="0.01" min="0" value={precios[n]?.doble ?? ''} onChange={(e) => setPrecio(n, 'doble', e.target.value)} />
                          </td>
                        </tr>
                      )
                    })}
                    {nuevosFiltrados.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">Sin choferes que coincidan con "{busqueda}".</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Archivos procesados</h3>
            <Tabla
              columns={[
                { key: 'archivo', label: 'Archivo' },
                { key: 'semana', label: 'Semana' },
                { key: 'ciudades', label: 'Ciudad(es) detectada(s)' },
                { key: 'paquetes', label: 'Paquetes', align: 'right' },
                { key: 'claims', label: 'Claims', align: 'right' },
              ]}
              rows={detalleArchivos}
              renderCell={(row, key) => (typeof row[key] === 'number' ? num(row[key]) : row[key])}
            />
          </Card>

          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Resumen por ciudad</h3>
            <Tabla
              columns={[
                { key: 'nombreCiudad', label: 'Ciudad' },
                { key: 'paquetes', label: 'Paquetes', align: 'right' },
                { key: 'individuales', label: 'Ind.', align: 'right' },
                { key: 'dobles', label: 'Dobles', align: 'right' },
                { key: 'ingreso', label: 'Ingreso', align: 'right' },
                { key: 'numChoferes', label: 'Choferes', align: 'right' },
                { key: 'numRutas', label: 'Rutas', align: 'right' },
                { key: 'numClaims', label: 'Claims', align: 'right' },
              ]}
              rows={combinado.resumenCiudades.map((c) => ({ ...c, _key: c.ubicacion }))}
              renderCell={(row, key) => (key === 'ingreso' ? money(row[key]) : typeof row[key] === 'number' ? num(row[key]) : row[key])}
            />
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-500 dark:text-slate-400">Semana:</label>
              <Input className="min-w-[240px]" value={semana} onChange={(e) => setSemana(e.target.value)} placeholder="ej. 22_06_2026-28_06_2026" />
              <Boton onClick={guardar} disabled={!puedeGuardar} variant="gold" className="ml-auto">
                {guardando ? <><Spinner /> Guardando…</> : choferesNuevos.length > 0 ? '💾 Guardar tarifas y procesar' : '💾 Guardar en base de datos'}
              </Boton>
              <Boton onClick={reset} variant="ghost">Descartar</Boton>
            </div>
            {choferesNuevos.length > 0 && !todosConPrecio && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Faltan {choferesNuevos.length - nConPrecio} chofer(es) por asignarles precio individual y doble.</p>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Se crean {num(choferesNuevos.length)} chofer(es) nuevo(s) y se guarda el resumen (no los {num(combinado.totalPaquetes)} paquetes) + {num(combinado.totalClaims)} claims. Cargado por {perfil?.nombre}.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
