// Reglas de cálculo por EMPRESA y por CIUDAD:
//   claimFee   = multa "M1" al chofer (lo que cobras en el método fijo).
//   dobleMonto = monto exacto que clasifica un paquete como "doble".
//   metodos    = método de cobro (M1/M2/M3) por CATEGORÍA de claim.
// Jerarquía: ciudad (si la define) → empresa → global (M1 / 100 / 0.5).
import { useState, useEffect } from 'react'
import { Save, SlidersHorizontal, Info } from 'lucide-react'
import { useData } from '../DataContext'
import { CLAIM_FEE, DOBLE_MONTO, CATEGORIAS_CLAIM, METODOS_CLAIM, METODO_CLAIM_DEFAULT } from '../constants'
import { guardarReglasEmpresa } from '../utils/empresaSettings'
import { Card, Boton, Input, Select, Aviso, Spinner } from './ui'

const CATS = CATEGORIAS_CLAIM // [{key,label}]

export default function ReglasCalculo() {
  const { activeCompanyId, ajustes, ciudadesEmpresa, reloadAjustes } = useData()
  const [porCiudad, setPorCiudad] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => {
    setPorCiudad(ajustes?.reglasCiudad || {})
  }, [ajustes])

  const ciudadesConCodigo = (ciudadesEmpresa || []).filter((c) => c.codigo)
  const setCiudad = (code, campo, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), [campo]: val } }))
  const setCiudadMetodo = (code, cat, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), metodos: { ...((m[code] || {}).metodos || {}), [cat]: val } } }))
  const valCiudad = (code, campo) => { const v = porCiudad[code]?.[campo]; return v === undefined || v === null ? '' : v }
  const valCiudadMetodo = (code, cat) => porCiudad[code]?.metodos?.[cat] || ''
  const valCiudadMonto = (code, cat) => { const v = porCiudad[code]?.montos?.[cat]; return v === undefined || v === null ? '' : v }
  const setCiudadMonto = (code, cat, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), montos: { ...((m[code] || {}).montos || {}), [cat]: val } } }))
  // Método efectivo de una ciudad para una categoría (el suyo o el default global).
  const metodoEfCiudad = (code, cat) => valCiudadMetodo(code, cat) || METODO_CLAIM_DEFAULT

  const guardar = async () => {
    setGuardando(true); setOk('')
    try {
      const claves = [...CATS.map((c) => c.key), 'otro']
      // Sin defaults de empresa: las reglas de empresa se dejan vacías (todo va por
      // ciudad; lo no definido cae al global).
      const emp = {}
      const ciu = {}
      for (const [code, v] of Object.entries(porCiudad)) {
        const o = {}
        if (v?.claimFee !== '' && v?.claimFee != null && isFinite(+v.claimFee)) o.claimFee = +v.claimFee
        if (v?.dobleMonto !== '' && v?.dobleMonto != null && isFinite(+v.dobleMonto)) o.dobleMonto = +v.dobleMonto
        const met = {}
        const mon = {}
        claves.forEach((k) => {
          if (v?.metodos?.[k]) met[k] = v.metodos[k]
          const mv = v?.montos?.[k]
          if (mv !== '' && mv != null && isFinite(+mv)) mon[k] = +mv
        })
        if (Object.keys(met).length) o.metodos = met
        if (Object.keys(mon).length) o.montos = mon
        if (Object.keys(o).length) ciu[code] = o
      }
      await guardarReglasEmpresa(activeCompanyId, emp, ciu)
      await reloadAjustes()
      setOk('Reglas guardadas. Se aplican a las facturas que cargues a partir de ahora.')
    } finally {
      setGuardando(false)
    }
  }

  const todasCats = [...CATS, { key: 'otro', label: 'Otro' }]

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Reglas de cálculo</h3>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Configuración <b>manual por ciudad</b>. Por cada <b>categoría de claim</b> (se detecta sola desde la factura) eliges el <b>método</b> de cobro al chofer:
        {' '}<b>Manual</b> = le cobras el monto que tú pones (ganancia = monto − Gofo) · <b>Lo que Gofo cobra</b> = al chofer se le descuenta lo mismo que Gofo (ganancia $0) · <b>Perdón</b> = no cobras, tú lo asumes (absorbes lo de Gofo).
      </p>
      <p className="mb-3 rounded-lg bg-brand-gold/10 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        <b>Ojo:</b> aquí NO se pone lo que le <b>pagas</b> al chofer (eso va por chofer en <b>Choferes</b> o al subir la factura). Cuando eliges el método <b>Manual</b> en una categoría, aparece un campo para poner el <b>monto que le cobras</b> por ese claim. El <b>Monto doble</b> solo sirve para <b>detectar</b> los dobles (no es pago). Puedes cambiar el método de un claim puntual desde su detalle en <b>Claims</b>.
      </p>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Configuración manual POR CIUDAD (sin defaults de empresa) */}
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Manual por ciudad — método por categoría · Monto doble = detección</div>
      {ciudadesConCodigo.length === 0 ? (
        <p className="text-sm text-slate-400">Agrega ciudades con código en “Mis ciudades” para poder configurarlas.</p>
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-2 text-left font-semibold">Ciudad</th>
                <th className="px-3 py-2 text-right font-semibold">Monto doble ($)</th>
                {todasCats.map((cat) => (<th key={cat.key} className="px-3 py-2 text-left font-semibold">{cat.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {ciudadesConCodigo.map((c) => (
                <tr key={c.codigo} className="border-t border-slate-100 dark:border-slate-700/50">
                  <td className="px-3 py-2 whitespace-nowrap">{c.nombre} <span className="text-xs text-slate-400">({c.codigo})</span></td>
                  <td className="px-3 py-2 text-right"><Input className="w-24 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'dobleMonto')} onChange={(e) => setCiudad(c.codigo, 'dobleMonto', e.target.value)} placeholder={`${DOBLE_MONTO}`} /></td>
                  {todasCats.map((cat) => (
                    <td key={cat.key} className="px-3 py-2 align-top">
                      <Select className="w-40" value={valCiudadMetodo(c.codigo, cat.key) || METODO_CLAIM_DEFAULT} onChange={(e) => setCiudadMetodo(c.codigo, cat.key, e.target.value)}>
                        {METODOS_CLAIM.map((m) => (<option key={m.key} value={m.key}>{m.corto}</option>))}
                      </Select>
                      {metodoEfCiudad(c.codigo, cat.key) === 'M1' && (
                        <Input className="mt-1 w-40 text-right" type="number" step="0.01" min="0" value={valCiudadMonto(c.codigo, cat.key)} onChange={(e) => setCiudadMonto(c.codigo, cat.key, e.target.value)} placeholder={`$ ${CLAIM_FEE} (monto manual)`} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Info size={15} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
        Cada factura guarda las reglas con que se procesó, así el histórico no cambia si luego ajustas estos valores. El
        método se aplica automáticamente por la categoría detectada de cada claim; puedes cambiar el método de un claim
        puntual desde su detalle.
      </div>

      <div className="mt-3">
        <Boton variant="gold" onClick={guardar} disabled={guardando || !activeCompanyId}>
          {guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> Guardar reglas</>}
        </Boton>
      </div>
    </Card>
  )
}
