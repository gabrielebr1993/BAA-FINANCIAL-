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
  const [empresa, setEmpresa] = useState({ claimFee: '', dobleMonto: '', metodos: {} })
  const [porCiudad, setPorCiudad] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => {
    const r = ajustes?.reglas || {}
    const met = {}
    CATS.forEach((c) => { met[c.key] = (r.metodos && r.metodos[c.key]) || METODO_CLAIM_DEFAULT })
    met.otro = (r.metodos && r.metodos.otro) || METODO_CLAIM_DEFAULT
    setEmpresa({ claimFee: r.claimFee ?? '', dobleMonto: r.dobleMonto ?? '', metodos: met })
    setPorCiudad(ajustes?.reglasCiudad || {})
  }, [ajustes])

  const ciudadesConCodigo = (ciudadesEmpresa || []).filter((c) => c.codigo)
  const setCiudad = (code, campo, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), [campo]: val } }))
  const setCiudadMetodo = (code, cat, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), metodos: { ...((m[code] || {}).metodos || {}), [cat]: val } } }))
  const valCiudad = (code, campo) => { const v = porCiudad[code]?.[campo]; return v === undefined || v === null ? '' : v }
  const valCiudadMetodo = (code, cat) => porCiudad[code]?.metodos?.[cat] || ''
  const setEmpMetodo = (cat, val) => setEmpresa((f) => ({ ...f, metodos: { ...f.metodos, [cat]: val } }))

  const empClaim = empresa.claimFee !== '' && isFinite(+empresa.claimFee) ? +empresa.claimFee : CLAIM_FEE
  const empDoble = empresa.dobleMonto !== '' && isFinite(+empresa.dobleMonto) ? +empresa.dobleMonto : DOBLE_MONTO

  const guardar = async () => {
    setGuardando(true); setOk('')
    try {
      const emp = { metodos: {} }
      if (empresa.claimFee !== '' && isFinite(+empresa.claimFee)) emp.claimFee = +empresa.claimFee
      if (empresa.dobleMonto !== '' && isFinite(+empresa.dobleMonto)) emp.dobleMonto = +empresa.dobleMonto
      ;[...CATS.map((c) => c.key), 'otro'].forEach((k) => { emp.metodos[k] = empresa.metodos[k] || METODO_CLAIM_DEFAULT })
      const ciu = {}
      for (const [code, v] of Object.entries(porCiudad)) {
        const o = {}
        if (v?.claimFee !== '' && v?.claimFee != null && isFinite(+v.claimFee)) o.claimFee = +v.claimFee
        if (v?.dobleMonto !== '' && v?.dobleMonto != null && isFinite(+v.dobleMonto)) o.dobleMonto = +v.dobleMonto
        const met = {}
        ;[...CATS.map((c) => c.key), 'otro'].forEach((k) => { if (v?.metodos?.[k]) met[k] = v.metodos[k] })
        if (Object.keys(met).length) o.metodos = met
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
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Por cada <b>categoría de claim</b> (se detecta sola desde la factura) eliges el <b>método</b> de cobro al chofer:
        {' '}<b>M1</b> cobra la multa (ganancia = multa − Gofo) · <b>M2</b> cobra lo de Gofo (ganancia $0) · <b>M3</b> perdón (absorbes lo de Gofo).
        Puedes fijarlo por empresa y sobreescribirlo por ciudad. Global: multa {CLAIM_FEE} / doble {DOBLE_MONTO} / método {METODO_CLAIM_DEFAULT}.
      </p>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Nivel empresa */}
      <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Por defecto de la empresa</div>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Multa por claim ($) — método M1</div>
            <Input className="w-40" type="number" step="0.01" min="0" value={empresa.claimFee} onChange={(e) => setEmpresa((f) => ({ ...f, claimFee: e.target.value }))} placeholder={String(CLAIM_FEE)} />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Monto de “doble” ($)</div>
            <Input className="w-32" type="number" step="0.01" min="0" value={empresa.dobleMonto} onChange={(e) => setEmpresa((f) => ({ ...f, dobleMonto: e.target.value }))} placeholder={String(DOBLE_MONTO)} />
          </div>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Método por categoría de claim</div>
        <div className="flex flex-wrap gap-3">
          {todasCats.map((cat) => (
            <div key={cat.key}>
              <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{cat.label}</div>
              <Select className="w-44" value={empresa.metodos[cat.key] || METODO_CLAIM_DEFAULT} onChange={(e) => setEmpMetodo(cat.key, e.target.value)}>
                {METODOS_CLAIM.map((m) => (<option key={m.key} value={m.key}>{m.corto}</option>))}
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Nivel ciudad */}
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Por ciudad (opcional — vacío = hereda de la empresa)</div>
      {ciudadesConCodigo.length === 0 ? (
        <p className="text-sm text-slate-400">Agrega ciudades con código en “Mis ciudades” para poder configurarlas por separado.</p>
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-2 text-left font-semibold">Ciudad</th>
                <th className="px-3 py-2 text-right font-semibold">Multa ($)</th>
                <th className="px-3 py-2 text-right font-semibold">Doble ($)</th>
                {todasCats.map((cat) => (<th key={cat.key} className="px-3 py-2 text-left font-semibold">{cat.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {ciudadesConCodigo.map((c) => (
                <tr key={c.codigo} className="border-t border-slate-100 dark:border-slate-700/50">
                  <td className="px-3 py-2 whitespace-nowrap">{c.nombre} <span className="text-xs text-slate-400">({c.codigo})</span></td>
                  <td className="px-3 py-2 text-right"><Input className="w-24 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'claimFee')} onChange={(e) => setCiudad(c.codigo, 'claimFee', e.target.value)} placeholder={`${empClaim}`} /></td>
                  <td className="px-3 py-2 text-right"><Input className="w-24 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'dobleMonto')} onChange={(e) => setCiudad(c.codigo, 'dobleMonto', e.target.value)} placeholder={`${empDoble}`} /></td>
                  {todasCats.map((cat) => (
                    <td key={cat.key} className="px-3 py-2">
                      <Select className="w-36" value={valCiudadMetodo(c.codigo, cat.key)} onChange={(e) => setCiudadMetodo(c.codigo, cat.key, e.target.value)}>
                        <option value="">Empresa ({empresa.metodos[cat.key] || METODO_CLAIM_DEFAULT})</option>
                        {METODOS_CLAIM.map((m) => (<option key={m.key} value={m.key}>{m.corto}</option>))}
                      </Select>
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
