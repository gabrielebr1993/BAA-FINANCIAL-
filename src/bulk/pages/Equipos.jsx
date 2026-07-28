import CatalogoSimple from './CatalogoSimple'
import { EQUIPOS_SEED } from '../domain/constants'
import { useLang } from '../../i18n'

export default function Equipos() {
  const { t } = useLang()
  return <CatalogoSimple titulo={t('Tipos de equipo')} coleccion="equipment" entidad={t('tipo de equipo')} semilla={EQUIPOS_SEED} />
}
