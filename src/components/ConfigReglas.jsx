// Selector de MODO de configuración (primer paso obligatorio) + el editor que
// corresponda: 'estandar' (reglas por ciudad) o 'ruta' (reglas por ruta).
import { useState, useEffect } from 'react'
import { Settings2, MapPin, Route as RouteIcon } from 'lucide-react'
import { useData } from '../DataContext'
import { guardarModoConfig } from '../utils/empresaSettings'
import { Card, Aviso, Spinner } from './ui'
import ReglasCalculo from './ReglasCalculo'
import ReglasPorRuta from './ReglasPorRuta'

export default function ConfigReglas() {
  const { activeCompanyId, ajustes, reloadAjustes } = useData()
  const [modo, setModo] = useState('estandar')
  const [guardando, setGuardando] = useState(false)

  // Por defecto 'estandar' (no rompe a quien ya configuró por ciudad); el usuario
  // elige explícitamente "Por ruta" si lo quiere.
  useEffect(() => { setModo(ajustes?.modoConfig || 'estandar') }, [ajustes])

  const elegir = async (m) => {
    if (m === modo) return
    setGuardando(true)
    setModo(m)
    try { await guardarModoConfig(activeCompanyId, m); await reloadAjustes() } finally { setGuardando(false) }
  }

  const Opcion = ({ valor, icon: Icon, titulo, desc }) => (
    <button
      type="button"
      onClick={() => elegir(valor)}
      className={`flex-1 rounded-xl border-2 p-4 text-left transition ${
        modo === valor
          ? 'border-brand-gold bg-brand-gold/5'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon size={18} strokeWidth={1.9} className={modo === valor ? 'text-brand-gold' : 'text-slate-400'} />
        <span className="font-bold text-brand-navy dark:text-slate-100">{titulo}</span>
        {modo === valor && <span className="ml-auto text-xs font-semibold text-brand-gold">Activo</span>}
      </div>
      <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{desc}</p>
    </button>
  )

  return (
    <div className="lg:col-span-2">
      <Card className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Settings2 size={18} strokeWidth={1.8} className="text-brand-gold" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Modo de configuración</h3>
          {guardando && <Spinner className="text-brand-gold" />}
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Elige cómo aplicar las reglas (tarifas y métodos de claim). Es el <b>primer paso</b>: define cómo se calcula el pago al cargar cada factura.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Opcion valor="estandar" icon={MapPin} titulo="Estándar (por ciudad)" desc="Las reglas se definen por empresa y por ciudad. Cada claim usa el método de su ciudad/categoría. Es el modo actual." />
          <Opcion valor="ruta" icon={RouteIcon} titulo="Por ruta" desc="Creas un set de reglas por cada ruta (tarifas + métodos de claim). Al cargar la factura asignas manualmente qué choferes van a cada ruta." />
        </div>
      </Card>

      {modo === 'ruta' ? <ReglasPorRuta /> : <ReglasCalculo />}
    </div>
  )
}
