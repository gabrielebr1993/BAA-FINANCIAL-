import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, LogOut, Grid2x2, QrCode, CheckCircle2 } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { Card, Boton, Input, Badge, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

export default function SupervisorPortal() {
  const { t } = useLang()
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  const navigate = useNavigate()
  const { datos: ordenes } = useColeccion('orders')
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState(null)

  const pendientes = useMemo(() => ordenes.filter((o) => o.estado === E.ENTREGADA), [ordenes])

  const liberar = async (orden) => {
    await guardar('orders', orden.id, {
      estado: E.LIBERADA,
      hitos: { ...(orden.hitos || {}), liberacion: ahora() },
      liberadaPor: usuario?.nombre || usuario?.email,
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberar_carga', entidad: 'orden', entidadId: orden.id })
    setMsg({ tipo: 'ok', txt: `${t('Orden')} ${orden.numero} ${t('liberada. El chofer ya puede tomar otra carga.')}` })
  }

  const liberarPorCodigo = async () => {
    setMsg(null)
    const o = pendientes.find((x) => (x.numero || '').toLowerCase() === codigo.trim().toLowerCase())
    if (!o) { setMsg({ tipo: 'error', txt: t('No hay una orden entregada con ese código esperando liberación.') }); return }
    await liberar(o); setCodigo('')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><ShieldCheck size={18} /></div>
        <div><div className="text-sm font-bold">{usuario?.nombre}</div><div className="text-[11px] text-slate-400">{t('Supervisor de planta')}</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><LogOut size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-3">
        {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
        <Card className="mb-4 p-4 text-center">
          <QrCode size={36} className="mx-auto text-amber-500" />
          <div className="mt-1 text-sm font-semibold text-brand-navy dark:text-slate-100">{t('Escanear / escribir código del chofer')}</div>
          <div className="mt-3 flex gap-2">
            <Input placeholder={t('Ej. J1AB2-0001')} value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && liberarPorCodigo()} className="flex-1" />
            <Boton variant="gold" onClick={liberarPorCodigo} disabled={!codigo.trim()}>{t('Liberar')}</Boton>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('La orden solo se libera tras verificar el código. (Fase avanzada: cámara para escanear el QR.)')}</p>
        </Card>

        <h3 className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Esperando liberación')} ({pendientes.length})</h3>
        {pendientes.length === 0 ? <p className="text-sm text-slate-400">{t('Ninguna orden esperando. Cuando un chofer entregue, aparecerá aquí.')}</p> : (
          pendientes.map((o) => (
            <Card key={o.id} className="mb-2 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                <Boton variant="success" onClick={() => liberar(o)} className="ml-auto px-3 py-1 text-xs"><CheckCircle2 size={14} /> {t('Liberar')}</Boton>
              </div>
              <div className="mt-1 text-xs text-slate-400">{o.material} · {t('chofer:')} {o.choferNombre || '—'}</div>
            </Card>
          ))
        )}
      </main>
    </div>
  )
}
