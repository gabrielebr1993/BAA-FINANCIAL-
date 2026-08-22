import { useMemo, useState } from 'react'
import { FileWarning, Plus, Trash2 } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { estadoDocumento } from '../domain/facturacion'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

const TIPOS = ['Seguro', 'Licencia', 'Registro', 'DOT', 'MC', 'Inspección', 'Permiso']
const COLOR = { vencido: 'red', proximo: 'gold', ok: 'green', sin_fecha: 'slate' }
const LABEL = { vencido: 'Vencido', proximo: 'Por vencer', ok: 'Vigente', sin_fecha: 'Sin fecha' }

// Campo con etiqueta uniforme (recuadros del mismo tamaño).
function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export default function Documentos() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: docs, cargando } = useColeccion('documents')
  const { datos: carriers } = useColeccion('carriers')
  const [f, setF] = useState({ carrierId: '', tipo: 'Seguro', numero: '', vence: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    if (!f.carrierId || !f.vence) return
    await crear('documents', tenantId, { carrierId: f.carrierId, tipo: f.tipo, numero: f.numero.trim(), vence: f.vence })
    setF({ carrierId: '', tipo: 'Seguro', numero: '', vence: '' })
  }
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'

  const enriquecidos = useMemo(() => docs.map((d) => ({ ...d, ...estadoDocumento(d.vence) })).sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9)), [docs])
  const alertas = enriquecidos.filter((d) => d.estado === 'vencido' || d.estado === 'proximo')

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Documentos y vencimientos')}</PageTitle>
      {alertas.length > 0 && <Aviso tipo="warn" className="mb-3">{alertas.length} {t('documento(s) vencidos o por vencer en 30 días. Renuévalos.')}</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo documento')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label={t('Transportista')}>
            <Select value={f.carrierId} onChange={set('carrierId')} className="h-11 w-full"><option value="">{t('— Transportista —')}</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          </Campo>
          <Campo label={t('Tipo')}>
            <Select value={f.tipo} onChange={set('tipo')} className="h-11 w-full">{TIPOS.map((tp) => <option key={tp} value={tp}>{t(tp)}</option>)}</Select>
          </Campo>
          <Campo label={t('Número / folio')}>
            <Input placeholder={t('Número / folio')} value={f.numero} onChange={set('numero')} className="h-11 w-full" />
          </Campo>
          <Campo label={t('Vence')}>
            <Input type="date" value={f.vence} onChange={set('vence')} className="h-11 w-full" />
          </Campo>
        </div>
        <div className="mt-3"><Boton variant="gold" onClick={agregar} disabled={!f.carrierId || !f.vence}><Plus size={16} /> {t('Agregar')}</Boton></div>
      </Card>

      {enriquecidos.length === 0 ? <EstadoVacio titulo={t('Sin documentos')} texto={t('Registra seguros, licencias, DOT, MC, inspecciones y sus vencimientos.')} mostrarBoton={false} /> : (
        <Card className="p-4">
          <div className="space-y-2">
            {enriquecidos.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-3 dark:border-slate-700/50">
                <FileWarning size={16} className={d.estado === 'vencido' ? 'text-rose-500' : d.estado === 'proximo' ? 'text-amber-500' : 'text-slate-400'} />
                <span className="font-semibold text-brand-navy dark:text-slate-100">{t(d.tipo)}</span>
                {d.numero && <span className="text-xs text-slate-400">#{d.numero}</span>}
                <Badge color="navy">{nombreCarrier(d.carrierId)}</Badge>
                <span className="text-xs text-slate-400">{t('vence')} {d.vence}</span>
                <Badge color={COLOR[d.estado]}>{t(LABEL[d.estado])}{d.dias != null && d.estado !== 'ok' ? ` · ${d.dias < 0 ? `${t('hace')} ${-d.dias}d` : `${t('en')} ${d.dias}d`}` : ''}</Badge>
                <button onClick={() => window.confirm(t('¿Eliminar documento?')) && eliminar('documents', d.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
