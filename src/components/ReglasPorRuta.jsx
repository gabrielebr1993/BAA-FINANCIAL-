// Reglas POR RUTA (modo 'ruta'). Cada ruta define: tarifa individual, tarifa
// doble, monto de "doble", multa M1 general, y por categoría de claim el método
// (M1/M2/M3) con su precio M1. Se aplican al cargar la factura asignando choferes
// a cada ruta (Fase 2).
import { useState, useEffect } from 'react'
import { Save, Route as RouteIcon, Plus, Trash2, Info } from 'lucide-react'
import { useData } from '../DataContext'
import { useLang } from '../i18n'
import { CLAIM_FEE, DOBLE_MONTO, CATEGORIAS_CLAIM, METODOS_CLAIM, METODO_CLAIM_DEFAULT } from '../constants'
import { guardarReglasRuta } from '../utils/empresaSettings'
import { Card, Boton, Input, Select, Aviso, Spinner, Badge } from './ui'

const CATS = [...CATEGORIAS_CLAIM, { key: 'otro', label: 'Otro' }]
const nuevaRegla = () => ({ nombre: '', tarifaInd: '', tarifaDoble: '', dobleMonto: '', claimFee: '', metodos: {}, montos: {} })

export default function ReglasPorRuta() {
  const { activeCompanyId, ajustes, reloadAjustes, ciudadesEmpresa } = useData()
  const { t } = useLang()
  const [rutas, setRutas] = useState({}) // { code: regla }
  const [nuevoCode, setNuevoCode] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setRutas(ajustes?.reglasRuta || {}) }, [ajustes])

  const codes = Object.keys(rutas).sort()
  const setCampo = (code, campo, val) => setRutas((r) => ({ ...r, [code]: { ...(r[code] || nuevaRegla()), [campo]: val } }))
  const setMetodo = (code, cat, val) => setRutas((r) => ({ ...r, [code]: { ...(r[code] || nuevaRegla()), metodos: { ...((r[code] || {}).metodos || {}), [cat]: val } } }))
  const setMonto = (code, cat, val) => setRutas((r) => ({ ...r, [code]: { ...(r[code] || nuevaRegla()), montos: { ...((r[code] || {}).montos || {}), [cat]: val } } }))

  const agregarRuta = () => {
    setError('')
    const code = nuevoCode.trim().toUpperCase()
    if (!code) return setError(t('Escribe el código de la ruta (ej. DFW01-001).'))
    if (rutas[code]) return setError(t('Esa ruta ya existe.'))
    setRutas((r) => ({ ...r, [code]: nuevaRegla() }))
    setNuevoCode('')
  }
  const eliminarRuta = (code) => setRutas((r) => { const n = { ...r }; delete n[code]; return n })

  const guardar = async () => {
    setGuardando(true); setOk(''); setError('')
    try {
      const limpio = {}
      for (const [code, v] of Object.entries(rutas)) {
        const o = { nombre: (v.nombre || '').trim() }
        if (v.ciudad) o.ciudad = v.ciudad // ciudad a la que pertenece la ruta (para filtrar al cargar)
        ;['tarifaInd', 'tarifaDoble', 'dobleMonto', 'claimFee'].forEach((k) => { if (v[k] !== '' && v[k] != null && isFinite(+v[k])) o[k] = +v[k] })
        const met = {}, mon = {}
        CATS.forEach((c) => {
          met[c.key] = v.metodos?.[c.key] || METODO_CLAIM_DEFAULT
          const mv = v.montos?.[c.key]
          if (mv !== '' && mv != null && isFinite(+mv)) mon[c.key] = +mv
        })
        o.metodos = met
        if (Object.keys(mon).length) o.montos = mon
        limpio[code] = o
      }
      await guardarReglasRuta(activeCompanyId, limpio)
      await reloadAjustes()
      setOk(t('Reglas por ruta guardadas. Se aplican al cargar facturas en modo "Por ruta".'))
    } finally {
      setGuardando(false)
    }
  }

  const claimFeeRuta = (r) => (r.claimFee !== '' && isFinite(+r.claimFee) ? +r.claimFee : CLAIM_FEE)

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <RouteIcon size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Reglas por ruta')}</h3>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {t('Cada ruta define sus')} <b>{t('tarifas')}</b> {t('(individual/doble) y el')} <b>{t('método')}</b> {t('de cobro por categoría de claim (M1 cobra la multa · M2 cobra lo de Gofo · M3 perdón).')}
        {' '}{t('Asigna cada ruta a su')} <b>{t('ciudad')}</b>{t(': así, al cargar una factura y detectar la ciudad automáticamente, solo verás las rutas y los choferes de esa ciudad.')}
        {' '}{t('Al cargar la factura asignarás manualmente qué choferes van a cada ruta y se les pagará con estas reglas.')}
      </p>
      <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        <Info size={14} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
        <span>
          <b>{t('“Monto de doble ($)”')}</b> {t('= el valor que')} <b>{t('Gofo te PAGA en la factura')}</b> {t('por una entrega doble (columna del monto de la entrega en el Excel de Gofo). El sistema marca como')} <b>{t('doble')}</b> {t('toda entrega cuyo monto sea')} <b>{t('exactamente')}</b> {t('ese. Ej.: si tus dobles se pagan')} <b>$1</b>, {t('pon')} <b>1</b> {t('aquí. Todo lo demás cuenta como')} <b>{t('individual')}</b>. {t('(No confundir con la')} <b>{t('tarifa doble')}</b>{t(', que es lo que TÚ le pagas al chofer por ese doble.)')}
        </span>
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {/* Agregar ruta */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{t('Nueva ruta (código)')}</div>
          <Input className="w-48" value={nuevoCode} onChange={(e) => setNuevoCode(e.target.value)} placeholder="DFW01-001" onKeyDown={(e) => e.key === 'Enter' && agregarRuta()} />
        </div>
        <Boton variant="gold" onClick={agregarRuta}><Plus size={16} strokeWidth={2} /> {t('Agregar ruta')}</Boton>
      </div>

      {codes.length === 0 ? (
        <Card className="p-4 text-sm text-slate-400">{t('Aún no hay rutas. Agrega la primera arriba.')}</Card>
      ) : (
        <div className="space-y-4">
          {codes.map((code) => {
            const r = rutas[code] || nuevaRegla()
            return (
              <div key={code} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/60">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge color="gold">{code}</Badge>
                  <Input className="w-56" value={r.nombre || ''} onChange={(e) => setCampo(code, 'nombre', e.target.value)} placeholder={t('Nombre / descripción de la ruta')} />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('Ciudad')}</span>
                    <Select className="w-40" value={r.ciudad || ''} onChange={(e) => setCampo(code, 'ciudad', e.target.value)}>
                      <option value="">{t('— Sin ciudad —')}</option>
                      {(ciudadesEmpresa || []).filter((c) => c.codigo).map((c) => (
                        <option key={c.codigo} value={c.codigo}>{c.nombre} ({c.codigo})</option>
                      ))}
                    </Select>
                  </div>
                  <Boton variant="ghost" onClick={() => eliminarRuta(code)} className="ml-auto px-2.5 py-1 text-xs text-rose-600 dark:text-rose-400"><Trash2 size={14} strokeWidth={1.8} /> {t('Quitar')}</Boton>
                </div>
                <div className="mb-3 flex flex-wrap gap-3">
                  <Campo label={t('Tarifa individual ($)')}><Input className="w-28" type="number" step="0.01" min="0" value={r.tarifaInd ?? ''} onChange={(e) => setCampo(code, 'tarifaInd', e.target.value)} /></Campo>
                  <Campo label={t('Tarifa doble ($)')}><Input className="w-28" type="number" step="0.01" min="0" value={r.tarifaDoble ?? ''} onChange={(e) => setCampo(code, 'tarifaDoble', e.target.value)} /></Campo>
                  <Campo label={t('Monto de “doble” ($)')}><Input className="w-28" type="number" step="0.01" min="0" value={r.dobleMonto ?? ''} onChange={(e) => setCampo(code, 'dobleMonto', e.target.value)} placeholder={String(DOBLE_MONTO)} /></Campo>
                  <Campo label={t('Multa M1 general ($)')}><Input className="w-28" type="number" step="0.01" min="0" value={r.claimFee ?? ''} onChange={(e) => setCampo(code, 'claimFee', e.target.value)} placeholder={String(CLAIM_FEE)} /></Campo>
                </div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{t('Método por categoría de claim')}</div>
                <div className="flex flex-wrap gap-3">
                  {CATS.map((cat) => {
                    const m = r.metodos?.[cat.key] || METODO_CLAIM_DEFAULT
                    return (
                      <div key={cat.key}>
                        <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{t(cat.label)}</div>
                        <Select className="w-40" value={m} onChange={(e) => setMetodo(code, cat.key, e.target.value)}>
                          {METODOS_CLAIM.map((mm) => (<option key={mm.key} value={mm.key}>{t(mm.corto)}</option>))}
                        </Select>
                        {m === 'M1' && (
                          <Input className="mt-1 w-40" type="number" step="0.01" min="0" value={r.montos?.[cat.key] ?? ''} onChange={(e) => setMonto(code, cat.key, e.target.value)} placeholder={`$ ${claimFeeRuta(r)} ${t('(multa)')}`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4">
        <Boton variant="gold" onClick={guardar} disabled={guardando || !activeCompanyId}>
          {guardando ? <><Spinner /> {t('Guardando…')}</> : <><Save size={16} strokeWidth={1.8} /> {t('Guardar reglas por ruta')}</>}
        </Boton>
      </div>
    </Card>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  )
}
