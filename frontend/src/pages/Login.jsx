import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import '../App.css'

function Login() {
  const { login, status, error: authError, refreshUser } = useAuth()
  const { t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setFieldErrors({})
    setFormError('')
    setIsSubmitting(true)

    try {
      await login({ email: email.trim(), password })
      const destination = location.state?.from
      const path =
        destination?.pathname && destination.pathname !== '/login'
          ? `${destination.pathname}${destination.search || ''}${destination.hash || ''}`
          : '/'

      navigate(path, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const messages = Object.values(error.errors).flat()
        if (messages.some((message) => message.includes('credentials'))) {
          setFormError(t('The email or password is incorrect.'))
        } else {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(error.errors).map(([field, fieldMessages]) => [
                field,
                fieldMessages[0],
              ])
            )
          )
          setFormError(t('Check the highlighted fields and try again.'))
        }
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(t('Too many login attempts. Wait a minute before trying again.'))
      } else if (error instanceof ApiError && error.status === 419) {
        setFormError(t('Your security session expired. Refresh the page and try again.'))
      } else if (error instanceof TypeError) {
        setFormError(
          t('Could not connect to DANNA. Check that the Laravel server is running and both apps use the same hostname.')
        )
      } else {
        setFormError(error.message || t('Login could not be completed. Try again.'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="login-card" aria-labelledby="login-heading">
        <Link className="login-brand" to="/login" aria-label={t('DANNA sign in')}>
          <img
            className="login-logo"
            src="/dhana-logo-removebg-preview.png"
            alt={t('DANNA (ضنى) neonatal-care logo')}
          />
          <span>
            <strong>DANNA</strong>
            <small>{t('ضنى · Neonatal Care')}</small>
          </span>
        </Link>

        <div className="login-intro">
          <span className="eyebrow">{t('ADMINISTRATIVE WORKSPACE')}</span>
          <h1 id="login-heading">{t('Welcome back')}</h1>
          <p>{t('Sign in with your authorized DANNA account to continue.')}</p>
        </div>

        {location.state?.sessionExpired && (
          <div className="login-message" role="status">
            {t('Your session has expired. Sign in again to continue.')}
          </div>
        )}

        {location.state?.message && (
          <div className="login-message" role="status">
            {location.state.message}
          </div>
        )}

        {status === 'error' && (
          <div className="login-error" role="alert">
            <span>{authError}</span>
            <button type="button" onClick={refreshUser}>
              {t('Retry')}
            </button>
          </div>
        )}

        {formError && (
          <div className="login-error" role="alert">
            {formError}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">
            {t('Email address')}
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              maxLength={255}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setFieldErrors((current) => ({ ...current, email: '' }))
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              placeholder={t('you@organization.org')}
            />
            {fieldErrors.email && (
              <span className="auth-field-error" id="login-email-error">
                {fieldErrors.email}
              </span>
            )}
          </label>

          <label htmlFor="login-password">
            {t('Password')}
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setFieldErrors((current) => ({ ...current, password: '' }))
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? 'login-password-error' : undefined
              }
              placeholder={t('Enter your password')}
            />
            {fieldErrors.password && (
              <span className="auth-field-error" id="login-password-error">
                {fieldErrors.password}
              </span>
            )}
          </label>

          <button
            className="login-submit"
            type="submit"
            disabled={isSubmitting || status === 'checking'}
          >
            {t(isSubmitting ? 'Signing in…' : 'Sign in securely')}
          </button>
        </form>

        <div className="login-security">
          <span aria-hidden="true">⌑</span>
          {t('Protected connection · Authorized accounts only')}
        </div>
        <p className="login-footer">
          {t('Hospital representative?')} <Link to="/register-hospital">{t('Request an account')}</Link>
        </p>
        <p className="login-footer">
          <Link to="/forgot-password">{t('Forgot password?')}</Link>
        </p>
      </section>

      <p className="login-footer">
        {t('DANNA · ضنى · Neonatal Care Management')}
      </p>
    </main>
  )
}

export default Login
