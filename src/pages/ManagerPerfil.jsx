// Perfil de un GASTO FIJO (manager): cabecera + la MISMA tarjeta de verificación
// que los choferes (datos personales, SSN, banco, documentos, export), sin Stripe
// ni portal (los managers no son contratistas 1099 con Stripe/portal).
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2 } from 'lucide-react'
import { useData } from '../DataContext'
import { nombreCiudad } from '../constants'
import { money } from '../utils/format'
import { Card, PageTitle, Badge, EstadoVacio } from '../components/ui'
import VerificacionChofer from '../components/VerificacionChofer'

export default function ManagerPerfil() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { managers, reloadManagers, activeCompanyId, ciudadesEmpresa } = useData()
  const m = managers.find((x) => x.id === id) || null
  const nombreCiu = (code) => { const c = (ciudadesEmpresa || []).find((x) => x.codigo === code); return c ? c.nombre : nombreCiudad(code) }

  return (
    <div>
      <PageTitle>
        <button onClick={() => navigate(-1)} className="mr-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-navy dark:hover:text-white">
          <ArrowLeft size={16} strokeWidth={2} /> Volver
        </button>
        Perfil del gasto fijo
      </PageTitle>

      {!m ? (
        <EstadoVacio titulo="No encontrado" texto="Este gasto fijo no existe o fue eliminado." mostrarBoton={false} />
      ) : (
        <>
          <Card className="mb-4 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy text-brand-gold"><Building2 size={26} strokeWidth={1.8} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 text-2xl font-bold text-brand-navy dark:text-slate-100">{m.nombre}</h2>
                  {m.activo === false ? <Badge color="slate">Inactivo</Badge> : <Badge color="green">Activo</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                  <span>Ciudad: <b className="text-brand-navy dark:text-slate-200">{nombreCiu(m.ciudad)}</b></span>
                  <span>Monto semanal: <b className="text-brand-navy dark:text-slate-200">{money(m.sueldoSemanal)}</b></span>
                </div>
              </div>
            </div>
          </Card>

          <div className="mb-4">
            <VerificacionChofer driver={m} activeCompanyId={activeCompanyId} onReload={reloadManagers} coleccion="managers" />
          </div>
        </>
      )}
    </div>
  )
}
