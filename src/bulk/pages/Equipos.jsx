import CatalogoSimple from './CatalogoSimple'
import { EQUIPOS_SEED } from '../domain/constants'

export default function Equipos() {
  return <CatalogoSimple titulo="Tipos de equipo" coleccion="equipment" entidad="tipo de equipo" semilla={EQUIPOS_SEED} />
}
