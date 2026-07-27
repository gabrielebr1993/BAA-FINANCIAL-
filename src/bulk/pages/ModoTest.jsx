import { useState } from 'react'
import { FlaskConical, Database, Trash2, Loader2, ShieldCheck, ArrowRight, UserPlus, KeyRound } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { sembrarDemo, borrarDemo, hayDemo, datosVinculoDemo, prepararChoferDemo } from '../data/demo'
import { BULK_ROLES_LABEL } from '../domain/constants'
import { PageTitle, Card, Boton, Select, Aviso } from '../../components/ui'

const TEST_EMAIL = 'test@test.com'
const TEST_PASS = 'testtest'
const ROLES_TEST = ['admin', 'dispatcher', 'cliente', 'transportista', 'chofer', 'supervisor_planta']

export default function ModoTest() {
  const { tenantId, crearUsuario } = useBulkAuth()
  const { datos: ordenes } = useColeccion('orders')
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: facturas } = useColeccion('invoices')
  const { datos: incidencias } = useColeccion('incidents')

  const [fase, setFase] = useState('idle') // idle | sembrando | borrando
  const [log, setLog] = useState([])
  const [msg, setMsg] = useState(null)
  const ocupado = fase !== 'idle'

  const [rolTest, setRolTest] = useState('admin')
  const [creandoU, setCreandoU] = useState(false)
  const [msgU, setMsgU] = useState(null)

  const demoOrdenes = ordenes.filter((o) => o.demo).length

  const cargar = async () => {
    const yaHay = await hayDemo(tenantId)
    if (yaHay > 0 && !window.confirm(`Ya hay ${yaHay} órdenes de prueba. ¿Cargar OTRO paquete de datos encima? (puedes borrar todo después)`)) return
    setFase('sembrando'); setLog([]); setMsg(null)
    try {
      const resumen = await sembrarDemo(tenantId, (m) => setLog((l) => [...l, m]))
      const t = Object.entries(resumen).map(([k, v]) => `${v} ${k}`).join(' · ')
      setMsg({ tipo: 'ok', txt: `Datos de demostración cargados: ${t}. Recorre el menú para verlo todo funcionando.` })
    } catch (e) {
      setMsg({ tipo: 'error', txt: 'No se pudieron cargar los datos: ' + e.message })
    } finally { setFase('idle') }
  }

  const borrar = async () => {
    if (!window.confirm('Esto borra SOLO los datos de prueba (marcados como demo). Tus datos reales no se tocan. ¿Continuar?')) return
    setFase('borrando'); setLog([]); setMsg(null)
    try {
      const n = await borrarDemo(tenantId, (m) => setLog((l) => [...l, m]))
      setMsg({ tipo: 'ok', txt: `Se borraron ${n} documentos de prueba.` })
    } catch (e) {
      setMsg({ tipo: 'error', txt: 'No se pudieron borrar: ' + e.message })
    } finally { setFase('idle') }
  }

  const necesitaDemo = ['cliente', 'transportista', 'chofer'].includes(rolTest)
  const crearUsuarioTest = async () => {
    setMsgU(null)
    if (necesitaDemo && demoOrdenes === 0) {
      if (!window.confirm('Para ese rol conviene cargar primero los datos de demostración (si no, su portal saldrá vacío). ¿Crear el usuario de todos modos?')) return
    }
    setCreandoU(true)
    try {
      const vinc = await datosVinculoDemo(tenantId, rolTest)
      const r = await crearUsuario({ nombre: 'Usuario de prueba', email: TEST_EMAIL, password: TEST_PASS, rol: rolTest, clienteId: vinc.clienteId, carrierId: vinc.carrierId })
      if (rolTest === 'chofer') await prepararChoferDemo(tenantId, r.uid, 'Usuario de prueba', vinc.carrierId)
      setMsgU({ tipo: 'ok', txt: `Usuario de prueba creado como ${BULK_ROLES_LABEL[rolTest]}. Cierra sesión (Salir) y entra con estas credenciales.` })
    } catch (e) {
      const m = e?.message || ''
      if (/already|exists|email.?exists|correo/i.test(m)) setMsgU({ tipo: 'warn', txt: `El correo ${TEST_EMAIL} ya existe. Entra con ${TEST_EMAIL} / ${TEST_PASS}, o bórralo en "Usuarios y roles" para recrearlo con otro rol.` })
      else setMsgU({ tipo: 'error', txt: 'No se pudo crear: ' + m })
    } finally { setCreandoU(false) }
  }

  return (
    <div>
      <PageTitle>Modo test</PageTitle>

      <Card className="mb-4 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><FlaskConical size={22} /></div>
          <div className="min-w-0">
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Datos de demostración</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Carga un negocio completo de ejemplo —clientes, plantas, transportistas, tarifas, trabajos y unas 50 órdenes en todas
              las etapas (en cola, en ruta y entregadas)— para ver el sistema funcionando de punta a punta: Dashboard, Órdenes, Mapa
              en vivo, Facturación, Documentos e Incidencias.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={14} /> Todo se marca como prueba. El botón de borrar elimina solo eso; tus datos reales nunca se tocan.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Boton variant="gold" onClick={cargar} disabled={ocupado}>
            {fase === 'sembrando' ? <><Loader2 size={16} className="animate-spin" /> Cargando…</> : <><Database size={16} /> Cargar datos de demostración</>}
          </Boton>
          <Boton variant="danger" onClick={borrar} disabled={ocupado}>
            {fase === 'borrando' ? <><Loader2 size={16} className="animate-spin" /> Borrando…</> : <><Trash2 size={16} /> Borrar datos de prueba</>}
          </Boton>
        </div>

        {msg && <Aviso tipo={msg.tipo} className="mt-4">{msg.txt}</Aviso>}
      </Card>

      {/* Usuario de prueba */}
      <Card className="mb-4 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-brand-navy/10 text-brand-navy dark:bg-amber-500/15 dark:text-amber-500"><UserPlus size={22} /></div>
          <div className="min-w-0">
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Usuario de prueba</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Crea una cuenta para entrar y probar cada vista. Elige el rol: <b>Administrador</b> ve todo el panel; <b>Chofer</b>, <b>Cliente</b>
              {' '}y <b>Transportista</b> abren su portal (los enlazo a los datos demo para que no salgan vacíos).
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <KeyRound size={13} className="text-amber-500" /> {TEST_EMAIL} &nbsp;·&nbsp; {TEST_PASS}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Rol</div>
            <Select value={rolTest} onChange={(e) => setRolTest(e.target.value)} className="w-56">
              {ROLES_TEST.map((r) => <option key={r} value={r}>{BULK_ROLES_LABEL[r]}</option>)}
            </Select>
          </div>
          <Boton variant="gold" onClick={crearUsuarioTest} disabled={creandoU}>
            {creandoU ? <><Loader2 size={16} className="animate-spin" /> Creando…</> : <><UserPlus size={16} /> Crear usuario de prueba</>}
          </Boton>
        </div>

        {msgU && <Aviso tipo={msgU.tipo} className="mt-4">{msgU.txt}</Aviso>}
        <p className="mt-3 text-[11px] text-slate-400">Nota: Firebase exige correo y contraseña de 6+ caracteres, por eso es <b>{TEST_EMAIL}</b> / <b>{TEST_PASS}</b>. Puedes borrar este usuario cuando quieras en “Usuarios y roles”.</p>
      </Card>

      {/* Resumen de lo que hay ahora mismo */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Mini label="Órdenes" valor={ordenes.length} nota={demoOrdenes ? `${demoOrdenes} demo` : null} />
        <Mini label="Clientes" valor={clientes.length} />
        <Mini label="Transportistas" valor={carriers.length} />
        <Mini label="Facturas" valor={facturas.length} />
        <Mini label="Incidencias" valor={incidencias.length} />
      </div>

      {log.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Progreso</div>
          <div className="scroll-thin max-h-52 overflow-y-auto rounded-lg bg-slate-950/90 p-3 font-mono text-xs text-emerald-300">
            {log.map((l, i) => <div key={i}>› {l}</div>)}
          </div>
        </Card>
      )}

      {demoOrdenes > 0 && !ocupado && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <ArrowRight size={15} className="text-amber-500" /> Ve al <b className="mx-1">Dashboard</b> o a <b className="mx-1">Mapa en vivo</b> para ver los datos en acción.
        </p>
      )}
    </div>
  )
}

function Mini({ label, valor, nota }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-black text-brand-navy dark:text-slate-100">{valor}</div>
      {nota && <div className="text-[10px] text-amber-500">{nota}</div>}
    </div>
  )
}
