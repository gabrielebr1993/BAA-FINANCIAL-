import { useState, useRef } from 'react'
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { procesarArchivo, combinarArchivos } from '../utils/excel'
import { buscarDriver } from '../utils/calc'
import { COLORS, nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Card, Stat, PageTitle, Boton, Tabla, Aviso, Badge } from '../components/ui'

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
    if (files.length === 0) {
      setErrores(['No se detectaron archivos .xlsx.'])
      return
    }
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

      // verificar que todas las semanas coincidan
      const semanas = [...new Set(procesados.map((p) => p.semana).filter(Boolean))]
      let semanaFinal = semanas[0] || ''
      if (semanas.length > 1) {
        nuevosAvisos.push(
          `⚠️ Los archivos tienen semanas distintas (${semanas.join(', ')}). Se usará "${semanaFinal}". Revisa que correspondan a la misma semana.`
        )
      }
      if (!semanaFinal) {
        nuevosAvisos.push('No se detectó la semana en el nombre de los archivos. Escríbela manualmente antes de guardar.')
      }

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
    if (!semana.trim()) {
      setErrores(['Debes indicar la semana antes de guardar.'])
      return
    }
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

      // guardar claims en lotes (máx 450 por batch)
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

  const v = combinado?.verificacion

  return (
    <div>
      <PageTitle>Cargar Factura</PageTitle>

      {/* Zona drag & drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          manejarArchivos(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? COLORS.gold : COLORS.border}`,
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
          background: dragOver ? '#fffaf0' : '#fff',
          cursor: 'pointer',
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 40 }}>⬆️</div>
        <div style={{ fontWeight: 700, color: COLORS.navy, marginTop: 8 }}>Arrastra uno o varios .xlsx (uno por ciudad)</div>
        <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>o haz clic para seleccionar archivos</div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => manejarArchivos(e.target.files)}
        />
      </div>

      {procesando && <Aviso tipo="info">⏳ Procesando archivo(s)… puede tardar si tienen 100.000+ filas.</Aviso>}
      {errores.map((e, i) => (
        <Aviso key={i} tipo="error">
          {e}
        </Aviso>
      ))}
      {avisos.map((a, i) => (
        <Aviso key={i} tipo="warn">
          {a}
        </Aviso>
      ))}
      {guardado && <Aviso tipo="ok">✅ Factura guardada correctamente en la base de datos.</Aviso>}

      {combinado && !guardado && (
        <>
          {/* Panel de verificación con Gofo */}
          {v && (
            <Card style={{ marginBottom: 18, borderColor: v.cuadra === false ? COLORS.red : v.cuadra ? COLORS.green : COLORS.border, borderWidth: 2 }}>
              <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>Verificación con Gofo</h3>
              {v.gofo.disponible ? (
                <>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>Nuestro neto calculado</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{money(v.netoCalculado)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>Total oficial de Gofo</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{money(v.gofo.totalGofo)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>Diferencia</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: v.cuadra ? COLORS.green : COLORS.red }}>{money(v.diferencia)}</div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      {v.cuadra ? (
                        <Badge color={COLORS.green}>✅ Cuadra con Gofo</Badge>
                      ) : (
                        <Badge color={COLORS.red}>⚠️ No cuadra — revisar</Badge>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <Tabla
                      columns={[
                        { key: 'linea', label: 'Línea' },
                        { key: 'nuestro', label: 'Nuestro cálculo', align: 'right' },
                        { key: 'gofo', label: 'Gofo (DSP Summary)', align: 'right' },
                      ]}
                      rows={[
                        { _key: 'e', linea: 'Entregas', nuestro: v.sumaEntregas, gofo: null },
                        { _key: 'o', linea: 'Offset', nuestro: v.sumaOffset, gofo: -Math.abs(v.gofo.offset) },
                        { _key: 'c', linea: 'Claims', nuestro: v.sumaClaims, gofo: -Math.abs(v.gofo.claim) },
                        { _key: 'a', linea: 'Ajustes', nuestro: v.sumaAjustes, gofo: -Math.abs(v.gofo.ajuste) },
                        { _key: 't', linea: 'NETO', nuestro: v.netoCalculado, gofo: v.gofo.totalGofo },
                      ]}
                      renderCell={(row, key) => {
                        if (key === 'linea') return <b style={{ color: row.linea === 'NETO' ? COLORS.navy : undefined }}>{row.linea}</b>
                        const val = row[key]
                        return val == null ? '—' : money(val)
                      }}
                    />
                  </div>
                </>
              ) : (
                <Aviso tipo="warn">No se encontró la hoja "DSP Summary" con el total oficial de Gofo. Se muestra solo nuestro neto: {money(v.netoCalculado)}.</Aviso>
              )}
            </Card>
          )}

          {/* Resumen global */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Stat label="Paquetes" value={num(combinado.totalPaquetes)} />
            <Stat label="Individuales" value={num(combinado.totalIndividuales)} />
            <Stat label="Dobles" value={num(combinado.totalDobles)} color={COLORS.gold} />
            <Stat label="Ingreso total" value={money(combinado.ingresoTotal)} color={COLORS.green} />
            <Stat label="Choferes" value={num(combinado.numChoferes)} />
            <Stat label="Rutas" value={num(combinado.numRutas)} />
            <Stat label="Claims" value={num(combinado.totalClaims)} color={COLORS.red} />
          </div>

          {/* Resumen por archivo/ciudad */}
          <Card style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>Archivos procesados</h3>
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

          {/* Resumen por ciudad */}
          <Card style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: COLORS.navy }}>Resumen por ciudad</h3>
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

          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 14, color: COLORS.muted }}>Semana:</label>
              <input
                value={semana}
                onChange={(e) => setSemana(e.target.value)}
                placeholder="ej. 22_06_2026-28_06_2026"
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, minWidth: 240 }}
              />
              <Boton onClick={guardar} disabled={guardando} variant="gold" style={{ marginLeft: 'auto' }}>
                {guardando ? 'Guardando…' : '💾 Guardar en base de datos'}
              </Boton>
              <Boton onClick={reset} variant="ghost">
                Descartar
              </Boton>
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 8 }}>
              Se guarda solo el resumen (no los {num(combinado.totalPaquetes)} paquetes) + {num(combinado.totalClaims)} claims individuales. Cargado por {perfil?.nombre}.
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
