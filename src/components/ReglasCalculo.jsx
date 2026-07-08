// Reglas de cálculo configurables por EMPRESA y por CIUDAD.
//   claimFee  = multa al chofer por claim no perdonado (default global 100).
//   dobleMonto= monto exacto que clasifica un paquete como "doble" (default 0.5).
// Jerarquía: ciudad (si la define) → empresa (default) → global (100 / 0.5).
import { useState, useEffect } from 'react'
import { Save, SlidersHorizontal, Info } from 'lucide-react'
import { useData } from '../DataContext'
import { CLAIM_FEE, DOBLE_MONTO } from '../constants'
import { guardarReglasEmpresa } from '../utils/empresaSettings'
import { Card, Boton, Input, Aviso, Spinner } from './ui'

export default function ReglasCalculo() {
  const { activeCompanyId, ajustes, ciudadesEmpresa, reloadAjustes } = useData()
  const [empresa, setEmpresa] = useState({ claimFee: '', dobleMonto: '' })
  const [porCiudad, setPorCiudad] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => {
    const r = ajustes?.reglas || {}
    setEmpresa({ claimFee: r.claimFee ?? '', dobleMonto: r.dobleMonto ?? '' })
    setPorCiudad(ajustes?.reglasCiudad || {})
  }, [ajustes])

  const ciudadesConCodigo = (ciudadesEmpresa || []).filter((c) => c.codigo)
  const setCiudad = (code, campo, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), [campo]: val } }))
  const valCiudad = (code, campo) => { const v = porCiudad[code]?.[campo]; return v === undefined || v === null ? '' : v }

  // Valor efectivo de empresa (para mostrar como placeholder en la tabla de ciudad).
  const empClaim = empresa.claimFee !== '' && isFinite(+empresa.claimFee) ? +empresa.claimFee : CLAIM_FEE
  const empDoble = empresa.dobleMonto !== '' && isFinite(+empresa.dobleMonto) ? +empresa.dobleMonto : DOBLE_MONTO

  const guardar = async () => {
    setGuardando(true); setOk('')
    try {
      const emp = {}
      if (empresa.claimFee !== '' && isFinite(+empresa.claimFee)) emp.claimFee = +empresa.claimFee
      if (empresa.dobleMonto !== '' && isFinite(+empresa.dobleMonto)) emp.dobleMonto = +empresa.dobleMonto
      const ciu = {}
      for (const [code, v] of Object.entries(porCiudad)) {
        const o = {}
        if (v?.claimFee !== '' && v?.claimFee != null && isFinite(+v.claimFee)) o.claimFee = +v.claimFee
        if (v?.dobleMonto !== '' && v?.dobleMonto != null && isFinite(+v.dobleMonto)) o.dobleMonto = +v.dobleMonto
        if (Object.keys(o).length) ciu[code] = o
      }
      await guardarReglasEmpresa(activeCompanyId, emp, ciu)
      await reloadAjustes()
      setOk('Reglas guardadas. Se aplican a las facturas que cargues a partir de ahora.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Reglas de cálculo</h3>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Configura la multa por claim y qué monto cuenta como “doble”. Puedes fijar un valor por defecto de la empresa
        y sobreescribirlo por ciudad. Si dejas un campo vacío, hereda: ciudad → empresa → global ({CLAIM_FEE} / {DOBLE_MONTO}).
      </p>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Nivel empresa */}
      <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Por defecto de la empresa</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Multa por claim ($)</div>
            <Input className="w-32" type="number" step="0.01" min="0" value={empresa.claimFee} onChange={(e) => setEmpresa((f) => ({ ...f, claimFee: e.target.value }))} placeholder={String(CLAIM_FEE)} />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Monto de “doble” ($)</div>
            <Input className="w-32" type="number" step="0.01" min="0" value={empresa.dobleMonto} onChange={(e) => setEmpresa((f) => ({ ...f, dobleMonto: e.target.value }))} placeholder={String(DOBLE_MONTO)} />
          </div>
        </div>
      </div>

      {/* Nivel ciudad */}
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Por ciudad (opcional — vacío = hereda de la empresa)</div>
      {ciudadesConCodigo.length === 0 ? (
        <p className="text-sm text-slate-400">Agrega ciudades con código en “Mis ciudades” para poder configurarlas por separado.</p>
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-2 text-left font-semibold">Ciudad</th>
                <th className="px-3 py-2 text-right font-semibold">Multa por claim ($)</th>
                <th className="px-3 py-2 text-right font-semibold">Monto de “doble” ($)</th>
              </tr>
            </thead>
            <tbody>
              {ciudadesConCodigo.map((c) => (
                <tr key={c.codigo} className="border-t border-slate-100 dark:border-slate-700/50">
                  <td className="px-3 py-2">{c.nombre} <span className="text-xs text-slate-400">({c.codigo})</span></td>
                  <td className="px-3 py-2 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'claimFee')} onChange={(e) => setCiudad(c.codigo, 'claimFee', e.target.value)} placeholder={`${empClaim}`} /></td>
                  <td className="px-3 py-2 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'dobleMonto')} onChange={(e) => setCiudad(c.codigo, 'dobleMonto', e.target.value)} placeholder={`${empDoble}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Info size={15} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
        Cada factura guarda las reglas que se usaron al procesarla, así el histórico no cambia si luego ajustas estos valores.
        Con los valores por defecto (100 / 0.5) el cálculo y la verificación con Gofo quedan idénticos.
      </div>

      <div className="mt-3">
        <Boton variant="gold" onClick={guardar} disabled={guardando || !activeCompanyId}>
          {guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> Guardar reglas</>}
        </Boton>
      </div>
    </Card>
  )
}
