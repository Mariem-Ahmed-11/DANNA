import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { LanguageSwitcher, useLocale } from '../i18n'

export default function ErrorPage({ type = 'not-found' }) {
  const { user } = useAuth()
  const { t } = useLocale()
  const isFailure = type === 'failure'

  return (
    <main className="auth-screen danna-error-screen">
      <LanguageSwitcher />
      <section className="login-card danna-error-card" role="status">
        <Link className="login-brand" to="/" aria-label={t('DANNA home')}>
          <img
            className="login-logo"
            src="/dhana-logo-removebg-preview.png"
            alt={t('DANNA neonatal-care logo')}
          />
          <span>
            <strong>DANNA</strong>
            <small>{t('Better Care. Brighter Futures.')}</small>
          </span>
        </Link>
        <span className="sa-eyebrow">{isFailure ? t('SYSTEM MESSAGE') : '404'}</span>
        <h1>{t(isFailure ? 'Something went wrong' : 'Page not found')}</h1>
        <p>
          {t(isFailure
            ? 'The page could not be displayed. Try again or return to your workspace.'
            : 'The page you are looking for does not exist or is no longer available.')}
        </p>
        <Link className="login-submit danna-error-button" to={user ? '/' : '/login'}>
          {t(user ? 'Back to Workspace' : 'Back to sign in')}
        </Link>
      </section>
    </main>
  )
}
