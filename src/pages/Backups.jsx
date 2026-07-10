// Copias de seguridad: crear backup en la nube (Storage), historial de todos los
// backups, descargar/restaurar cada uno, y restaurar desde un archivo local.
import { useState, useEffect, useCallback } from 'react'
import { DatabaseBackup, Download, Upload, RefreshCw, RotateCcw, Trash2, Cloud, CheckCircle2 } from 'lucide-react'
import { useData } from '../DataContext'
import { descargarBackup, subirBackupStorage, listarBackups, restaurarDesdeUrl, restaurarBackup, borrarBackupNube } from '../utils/backup'
import { Card, PageTitle, Boton, Aviso, Badge, Spinner, Cargando } from '../components/ui'

const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? (n / 1e3).toFixed(0) + ' KB' : n + ' B')
const fmtFecha = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) } catch { return iso || '—' } }

export default function Backups() {
  const { activeCompanyId, empresaActiva, reloadInvoices, reloadDrivers } = useData()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompanyId) { setLista([]); setCargando(false); return }
    setCargando(true)
    try { setLista(await listarBackups(activeCompanyId)) }
    catch (e) { setMsg({ tipo: 'warn', txt: 'No se pudo leer el historial de la nube: ' + e.message + ' (revisa que Storage esté habilitado y las reglas publicadas).' }) }
    finally { setCargando(false) }
  }, [activeCompanyId])
  useEffect(() => { cargar() }, [cargar])

  const crearNube = async () => {
    setBusy('crear'); setMsg(null)
    try {
      const r = await subirBackupStorage(activeCompanyId)
      setMsg({ tipo: 'ok', txt: `Backup guardado en la nube: ${r.total} registros.` })
      await cargar()
    } catch (e) { setMsg({ tipo: 'error', txt: 'No se pudo guardar en la nube: ' + e.message }) }
    finally { setBusy('') }
  }
  const descargar = async () => {
    setBusy('descargar'); setMsg(null)
    try { const r = await descargarBackup(activeCompanyId); setMsg({ tipo: 'ok', txt: `Backup descargado: ${r.total} registros.` }) }
    catch (e) { setMsg({ tipo: 'error', txt: 'No se pudo descargar: ' + e.message }) }
    finally { setBusy('') }
  }
  const restaurarNube = async (b) => {
    if (!window.confirm(`Restaurar el backup del ${fmtFecha(b.updated)}? Repone/actualiza datos, no borra nada nuevo.`)) return
    setBusy(b.path); setMsg(null)
    try {
      const n = await restaurarDesdeUrl(b.url)
      await Promise.all([reloadInvoices?.(), reloadDrivers?.()])
      setMsg({ tipo: 'ok', txt: `Restaurados ${n} registros desde la nube. Recarga (Ctrl+Shift+R) si algo no se ve.` })
    } catch (e) { setMsg({ tipo: 'error', txt: 'No se pudo restaurar: ' + e.message }) }
    finally { setBusy('') }
  }
  const borrar = async (b) => {
    if (!window.confirm(`Borrar el backup del ${fmtFecha(b.updated)} de la nube? (Esto NO afecta tus datos, solo elimina esa copia.)`)) return
    setBusy(b.path); setMsg(null)
    try { await borrarBackupNube(b.path); await cargar() }
    catch (e) { setMsg({ tipo: 'error', txt: 'No se pudo borrar: ' + e.message }) }
    finally { setBusy('') }
  }
  const restaurarArchivo = async (file) => {
    if (!file) return
    if (!window.confirm('Restaurar desde este archivo? Repone/actualiza datos, no borra nada nuevo.')) return
    setBusy('archivo'); setMsg(null)
    try {
      const data = JSON.parse(await file.text())
      if (data.companyId && data.companyId !== activeCompanyId && !window.confirm('El backup es de OTRA empresa. ¿Continuar?')) { setBusy(''); return }
      const n = await restaurarBackup(data)
      await Promise.all([reloadInvoices?.(), reloadDrivers?.()])
      setMsg({ tipo: 'ok', txt: `Restaurados ${n} registros. Recarga (Ctrl+Shift+R) si algo no se ve.` })
    } catch (e) { setMsg({ tipo: 'error', txt: 'No se pudo restaurar: ' + e.message }) }
    finally { setBusy('') }
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Copias de seguridad</PageTitle>

      {msg && <Aviso tipo={msg.tipo}>{msg.txt}</Aviso>}

      <Card className="mb-4 p-5">
        <div className="mb-2 flex items-center gap-2">
          <DatabaseBackup size={18} strokeWidth={1.8} className="text-brand-gold" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Respaldos</h3>
        </div>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Se guarda una copia <b>automática cada 24 h</b> en la nube. También puedes <b>crear</b> una copia ahora (queda en el historial de abajo) o <b>descargar</b> el archivo. Restaurar solo <b>repone/actualiza</b>; nunca borra datos actuales.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Boton variant="gold" onClick={crearNube} disabled={!activeCompanyId || !!busy}>
            {busy === 'crear' ? <><Spinner /> Guardando…</> : <><Cloud size={16} strokeWidth={1.8} /> Crear backup en la nube</>}
          </Boton>
          <Boton variant="ghost" onClick={descargar} disabled={!activeCompanyId || !!busy}>
            {busy === 'descargar' ? <><Spinner /> Generando…</> : <><Download size={16} strokeWidth={1.8} /> Descargar archivo</>}
          </Boton>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:text-slate-300 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy === 'archivo' ? <><Spinner /> Restaurando…</> : <><Upload size={16} strokeWidth={1.8} /> Restaurar desde archivo</>}
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restaurarArchivo(e.target.files?.[0])} />
          </label>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Cloud size={18} strokeWidth={1.8} className="text-brand-gold" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Historial en la nube</h3>
          <Badge color="slate">{lista.length}</Badge>
          <Boton variant="ghost" className="ml-auto px-2.5 py-1 text-xs" onClick={cargar} disabled={cargando}><RefreshCw size={14} strokeWidth={1.8} /> Actualizar</Boton>
        </div>
        {cargando ? (
          <Cargando texto="Cargando historial…" />
        ) : lista.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay backups en la nube. Crea el primero arriba (o espera al automático).</p>
        ) : (
          <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                  <th className="px-3 py-2 text-left font-semibold">Archivo</th>
                  <th className="px-3 py-2 text-right font-semibold">Tamaño</th>
                  <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((b, i) => (
                  <tr key={b.path} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtFecha(b.updated)}
                      {i === 0 && <Badge color="green" className="ml-2"><span className="inline-flex items-center gap-1"><CheckCircle2 size={12} strokeWidth={2} /> más reciente</span></Badge>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{b.name}</td>
                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{fmtBytes(b.size)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <a href={b.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-gold dark:border-slate-600 dark:text-slate-300"><Download size={13} strokeWidth={1.8} /> Descargar</a>
                        <Boton variant="primary" className="px-2.5 py-1 text-xs" disabled={busy === b.path} onClick={() => restaurarNube(b)}>{busy === b.path ? <Spinner /> : <RotateCcw size={13} strokeWidth={1.8} />} Restaurar</Boton>
                        <Boton variant="ghost" className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400" disabled={busy === b.path} onClick={() => borrar(b)}><Trash2 size={13} strokeWidth={1.8} /></Boton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">Los backups se guardan en Firebase Storage (privado, solo tu empresa). Para protección total, activa además los backups administrados de Firebase.</p>
      </Card>
    </div>
  )
}
