import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import { useLocale } from '../i18n'
import '../App.css'

function readResetLink() {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return {
    email: query.get('email') || hash.get('email') || '',
    token: query.get('token') || hash.get('token') || '',
  }
}

function ResetPassword() {
  const { t } = useLocale()
  const [resetLink] = useState(readResetLink)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reset, setReset] = useState(false)

  useEffect(() => {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])

  async function submit(event) {
    event.preventDefault()
    setFieldErrors({})
    setError('')
    setIsSubmitting(true)
    try {
      await apiRequest('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          ...resetLink,
          password,
          password_confirmation: passwordConfirmation,
        }),
      })
      setReset(true)
      setPassword('')
      setPasswordConfirmation('')
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(requestError.errors || {}).map(([field, messages]) => [field, messages[0]])
          )
        )
        setError(
          t(
            requestError.errors?.email?.[0]
              || requestError.errors?.password?.[0]
              || requestError.message
              || 'Check the highlighted fields.'
          )
        )
      } else if (requestError instanceof ApiError && requestError.status === 429) {
        setError(t('Too many requests. Wait a minute before trying again.'))
      } else if (requestError instanceof ApiError && requestError.status === 419) {
        setError(t('Your security session expired. Refresh the page and try again.'))
      } else if (requestError instanceof TypeError) {
        setError(t('Could not connect to DANNA. Check your connection and try again.'))
      } else {
        setError(requestError.message || t('The password could not be reset. Request a new link and try again.'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const validLink = Boolean(resetLink.email && resetLink.token)

  return (
    <main className="auth-screen">
      <section className="login-card" aria-labelledby="reset-password-heading">
        <Link className="login-brand" to="/login" aria-label={t('DANNA sign in')}>
          <img className="login-logo" src="/dhana-logo-removebg-preview.png" alt={t('DANNA (ضنى) neonatal-care logo')} />
          <span><strong>DANNA</strong><small>{t('ضنى · Neonatal Care')}</small></span>
        </Link>
        <div className="login-intro">
          <span className="eyebrow">{t('SECURE ACCOUNT RECOVERY')}</span>
          <h1 id="reset-password-heading">{t(reset ? 'Password updated' : 'Set a new password')}</h1>
          <p>
            {reset
              ? t('Your password has been changed. Sign in using your new password.')
              : t('Choose a new password with at least 12 characters.')}
          </p>
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        {reset ? (
          <Link className="login-submit password-page-link" to="/login">{t('Continue to sign in')}</Link>
        ) : !validLink ? (
          <div className="login-error" role="alert">
            {t('This reset link is incomplete or invalid. Request a new password reset link.')}
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            <label htmlFor="reset-email">
              {t('Email address')}
              <input id="reset-email" type="email" value={resetLink.email} readOnly />
            </label>
            <label htmlFor="reset-password">
              {t('New password')}
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(event) => setPassword(event.target.value)}
              />
              {fieldErrors.password && <span className="auth-field-error">{fieldErrors.password}</span>}
            </label>
            <label htmlFor="reset-password-confirmation">
              {t('Confirm new password')}
              <input
                id="reset-password-confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />
              {fieldErrors.password_confirmation && (
                <span className="auth-field-error">{fieldErrors.password_confirmation}</span>
              )}
            </label>
            <button className="login-submit" type="submit" disabled={isSubmitting}>
              {t(isSubmitting ? 'Updating…' : 'Reset password')}
            </button>
          </form>
        )}
        {!reset && <p className="login-footer"><Link to="/forgot-password">{t('Request another reset link')}</Link></p>}
      </section>
      <p className="login-footer">{t('DANNA · ضنى · Neonatal Care Management')}</p>
    </main>
  )
}

export default ResetPassword
