import { Link } from 'react-router-dom'
import { useLocale } from '../i18n'

export default function HospitalFooter() {
  const { t } = useLocale()

  return (
    <footer className="hospital-global-footer">
      <Link className="hospital-footer-brand" to="/" aria-label={t('DANNA hospital workspace')}>
        <img src="/dhana-logo-removebg-preview.png" alt="" />
        <span>
          <strong>DANNA</strong>
          <small>{t('Better Care. Brighter Futures.')}</small>
        </span>
      </Link>
      <span className="hospital-footer-copy">
        © {new Date().getFullYear()} DANNA · {t('Hospital workspace')}
      </span>
    </footer>
  )
}
