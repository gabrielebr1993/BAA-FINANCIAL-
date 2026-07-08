// Reglas de cálculo configurables por EMPRESA y por CIUDAD.
//   claimFee  = multa al chofer por claim no perdonado (default global 100).
//   dobleMonto= monto exacto que clasifica un paquete como "doble" (default 0.5).
// Jerarquía: ciudad (si la define) → empresa (default) → global (100 / 0.5).
import { useState, useEffect } from 'react'
import { Save, SlidersHorizontal, Info } from 'lucide-react'
import { useData } from '../DataContext'
import { CLAIM_FEE, DOBLE_MONTO, CLAIM_FEE_REDUCIDO } from '../constants'
import { guardarReglasEmpresa } from '../utils/empresaSettings'
import { Card, Boton, Input, Select, Aviso, Spinner } from './ui'

export default function ReglasCalculo() {
  const { activeCompanyId, ajustes, ciudadesEmpresa, reloadAjustes } = useData()
  const [empresa, setEmpresa] = useState({ claimFee: '', claimFeeReducido: '', dobleMonto: '', claimModo: 'fijo' })
  const [porCiudad, setPorCiudad] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => {
    const r = ajustes?.reglas || {}
    setEmpresa({ claimFee: r.claimFee ?? '', claimFeeReducido: r.claimFeeReducido ?? '', dobleMonto: r.dobleMonto ?? '', claimModo: r.claimModo || 'fijo' })
    setPorCiudad(ajustes?.reglasCiudad || {})
  }, [ajustes])

  const ciudadesConCodigo = (ciudadesEmpresa || []).filter((c) => c.codigo)
  const setCiudad = (code, campo, val) => setPorCiudad((m) => ({ ...m, [code]: { ...(m[code] || {}), [campo]: val } }))
  const valCiudad = (code, campo) => { const v = porCiudad[code]?.[campo]; return v === undefined || v === null ? '' : v }

  // Valor efectivo de empresa (para mostrar como placeholder en la tabla de ciudad).
  const empClaim = empresa.claimFee !== '' && isFinite(+empresa.claimFee) ? +empresa.claimFee : CLAIM_FEE
  const empDoble = empresa.dobleMonto !== '' && isFinite(+empresa.dobleMonto) ? +empresa.dobleMonto : DOBLE_MONTO
  // La multa reducida hereda de la general si no se define (no de un 50 fijo).
  const empClaimRed = empresa.claimFeeReducido !== '' && isFinite(+empresa.claimFeeReducido) ? +empresa.claimFeeReducido : empClaim

  const guardar = async () => {
    setGuardando(true); setOk('')
    try {
      const emp = {}
      if (empresa.claimFee !== '' && isFinite(+empresa.claimFee)) emp.claimFee = +empresa.claimFee
      if (empresa.claimFeeReducido !== '' && isFinite(+empresa.claimFeeReducido)) emp.claimFeeReducido = +empresa.claimFeeReducido
      if (empresa.dobleMonto !== '' && isFinite(+empresa.dobleMonto)) emp.dobleMonto = +empresa.dobleMonto
      if (empresa.claimModo === 'real') emp.claimModo = 'real' // 'fijo' es el default, no hace falta guardarlo
      const ciu = {}
      for (const [code, v] of Object.entries(porCiudad)) {
        const o = {}
        if (v?.claimFee !== '' && v?.claimFee != null && isFinite(+v.claimFee)) o.claimFee = +v.claimFee
        if (v?.claimFeeReducido !== '' && v?.claimFeeReducido != null && isFinite(+v.claimFeeReducido)) o.claimFeeReducido = +v.claimFeeReducido
        if (v?.dobleMonto !== '' && v?.dobleMonto != null && isFinite(+v.dobleMonto)) o.dobleMonto = +v.dobleMonto
        if (v?.claimModo === 'real' || v?.claimModo === 'fijo') o.claimModo = v.claimModo // '' = hereda de la empresa
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
        Configura la multa por claim (general y reducida) y qué monto cuenta como “doble”. La <b>multa reducida</b> se aplica
        a los claims de tipo <b>tracking interruption</b> y <b>lost</b>; el resto usa la general. Puedes fijar valores por defecto de la
        empresa y sobreescribirlos por ciudad. Vacío = hereda: ciudad → empresa → general ({CLAIM_FEE} / {DOBLE_MONTO}).
        Si dejas la multa reducida vacía, es igual a la general (sin descuento por tipo). El <b>modo de multa</b> permite, por ciudad,
        cobrarle al chofer <b>lo que Gofo te cobró</b> por cada claim (modo “real”) en vez de una multa fija — útil si ese es el trato con esa ciudad.
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
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Multa reducida ($) <span className="text-slate-400">tracking interr. / lost</span></div>
            <Input className="w-40" type="number" step="0.01" min="0" value={empresa.claimFeeReducido} onChange={(e) => setEmpresa((f) => ({ ...f, claimFeeReducido: e.target.value }))} placeholder={String(CLAIM_FEE_REDUCIDO)} />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Monto de “doble” ($)</div>
            <Input className="w-32" type="number" step="0.01" min="0" value={empresa.dobleMonto} onChange={(e) => setEmpresa((f) => ({ ...f, dobleMonto: e.target.value }))} placeholder={String(DOBLE_MONTO)} />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Modo de multa</div>
            <Select className="w-56" value={empresa.claimModo} onChange={(e) => setEmpresa((f) => ({ ...f, claimModo: e.target.value }))}>
              <option value="fijo">Multa fija (configurada arriba)</option>
              <option value="real">Cobrar lo que cobra Gofo (real)</option>
            </Select>
          </div>
        </div>
        {empresa.claimModo === 'real' && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">En modo “real”, a cada chofer se le descuenta exactamente el monto que Gofo cobró por cada claim (se ignoran las multas fija/reducida).</p>
        )}
      </div>

      {/* Nivel ciudad */}
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Por ciudad (opcional — vacío = hereda de la empresa)</div>
      {ciudadesConCodigo.length === 0 ? (
        <p className="text-sm text-slate-400">Agrega ciudades con código en “Mis ciudades” para poder configurarlas por separado.</p>
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-3 py-2 text-left font-semibold">Ciudad</th>
                <th className="px-3 py-2 text-right font-semibold">Multa por claim ($)</th>
                <th className="px-3 py-2 text-right font-semibold">Multa reducida ($)</th>
                <th className="px-3 py-2 text-right font-semibold">Monto de “doble” ($)</th>
                <th className="px-3 py-2 text-left font-semibold">Modo de multa</th>
              </tr>
            </thead>
            <tbody>
              {ciudadesConCodigo.map((c) => (
                <tr key={c.codigo} className="border-t border-slate-100 dark:border-slate-700/50">
                  <td className="px-3 py-2">{c.nombre} <span className="text-xs text-slate-400">({c.codigo})</span></td>
                  <td className="px-3 py-2 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'claimFee')} onChange={(e) => setCiudad(c.codigo, 'claimFee', e.target.value)} placeholder={`${empClaim}`} /></td>
                  <td className="px-3 py-2 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'claimFeeReducido')} onChange={(e) => setCiudad(c.codigo, 'claimFeeReducido', e.target.value)} placeholder={`${empClaimRed}`} /></td>
                  <td className="px-3 py-2 text-right"><Input className="w-28 text-right" type="number" step="0.01" min="0" value={valCiudad(c.codigo, 'dobleMonto')} onChange={(e) => setCiudad(c.codigo, 'dobleMonto', e.target.value)} placeholder={`${empDoble}`} /></td>
                  <td className="px-3 py-2">
                    <Select className="w-44" value={valCiudad(c.codigo, 'claimModo') || ''} onChange={(e) => setCiudad(c.codigo, 'claimModo', e.target.value)}>
                      <option value="">Como la empresa ({empresa.claimModo === 'real' ? 'real' : 'fija'})</option>
                      <option value="fijo">Multa fija</option>
                      <option value="real">Cobrar lo de Gofo</option>
                    </Select>
                  </td>
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
