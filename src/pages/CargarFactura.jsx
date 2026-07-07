import { useState, useRef } from 'react'
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
  const { drivers, reloadInvoices, setSelectedInvoiceId } = useData()
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [combinado, setCombinado] = useState(null)
  const [detalleArchivos, setDetalleArchivos] = useState([])
  const [semana, setSemana] = useState('')
  const [avisos, setAvisos] = useState([])
  const [errores, setErrores] = useState([])
  const [guardado, setGuardado] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const reset = () => {
    setCombinado(null)
    setDetalleArchivos([])
    setSemana('')
    setAvisos([])
    setErrores([])
    setGuardado(false)
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

  const choferesSinTarifa = combinado
    ? [...new Set(combinado.resumenChoferes.map((c) => c.nombre))].filter((n) => !buscarDriver(drivers, n))
    : []

  const guardar = async () => {
    if (!combinado) return
    if (!semana.trim()) return setErrores(['Debes indicar la semana antes de guardar.'])
    setGuardando(true)
    setErrores([])
    try {
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
            <KPI label="Choferes" value={num(combinado.numChoferes)} accent="slate" />
            <KPI label="Rutas" value={num(combinado.numRutas)} accent="slate" />
            <KPI label="Claims" value={num(combinado.totalClaims)} icon="⚠️" accent="red" />
          </div>

          <Card className="mb-4 p-4">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Archivos procesados</h3>
            <Tabla
              columns={[
                { key: 'archivo', label: 'Archivo' },
                { key: 'semana', label: 'Semana' },
                { key: 'ciudades', label: 'Ciudad(es)' },
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

          {choferesSinTarifa.length > 0 && (
            <Aviso tipo="warn">
              🚚 {choferesSinTarifa.length} chofer(es) sin tarifa en la base: {choferesSinTarifa.slice(0, 8).join(', ')}
              {choferesSinTarifa.length > 8 ? '…' : ''}. Ve a <b>Choferes y Tarifas</b> para asignarles precios.
            </Aviso>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-500 dark:text-slate-400">Semana:</label>
              <Input className="min-w-[240px]" value={semana} onChange={(e) => setSemana(e.target.value)} placeholder="ej. 22_06_2026-28_06_2026" />
              <Boton onClick={guardar} disabled={guardando} variant="gold" className="ml-auto">
                {guardando ? <><Spinner /> Guardando…</> : '💾 Guardar en base de datos'}
              </Boton>
              <Boton onClick={reset} variant="ghost">Descartar</Boton>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Se guarda solo el resumen (no los {num(combinado.totalPaquetes)} paquetes) + {num(combinado.totalClaims)} claims individuales. Cargado por {perfil?.nombre}.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
