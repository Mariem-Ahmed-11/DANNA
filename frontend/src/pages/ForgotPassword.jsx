import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import { useLocale } from '../i18n'
import '../App.css'

function ForgotPassword() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setFieldError('')
    setMessage('')
    setError('')
    setIsSubmitting(true)

    try {
      const payload = await apiRequest('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setMessage(
        t(payload?.message || 'If an account exists for that email, a password reset link will be sent.')
      )
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 422) {
        setFieldError(requestError.errors?.email?.[0] || t('Enter a valid email address.'))
        setError(t('Check the email address and try again.'))
      } else if (requestError instanceof ApiError && requestError.status === 429) {
        setError(t('Too many requests. Wait a minute before trying again.'))
      } else if (requestError instanceof ApiError && requestError.status === 419) {
        setError(t('Your security session expired. Refresh the page and try again.'))
      } else if (requestError instanceof ApiError && requestError.status === 503) {
        setError(t(requestError.message || 'The reset email could not be sent. Try again in a few minutes.'))
      } else if (requestError instanceof TypeError) {
        setError(t('Could not connect to DANNA. Check your connection and try again.'))
      } else {
        setError(requestError.message || t('The request could not be completed. Try again.'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="login-card" aria-labelledby="forgot-password-heading">
        <Link className="login-brand" to="/login" aria-label={t('DANNA sign in')}>
          <img className="login-logo" src="/dhana-logo-removebg-preview.png" alt={t('DANNA (ضنى) neonatal-care logo')} />
          <span><strong>DANNA</strong><small>{t('ضنى · Neonatal Care')}</small></span>
        </Link>
        <div className="login-intro">
          <span className="eyebrow">{t('ACCOUNT RECOVERY')}</span>
          <h1 id="forgot-password-heading">{t('Forgot your password?')}</h1>
          <p>{t('Enter your account email. If it is registered, we will send a secure reset link.')}</p>
        </div>
        {message && <div className="login-message" role="status">{message}</div>}
        {error && <div className="login-error" role="alert">{error}</div>}
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="forgot-email">
            {t('Email address')}
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              maxLength={255}
              value={email}
              aria-invalid={Boolean(fieldError)}
              onChange={(event) => {
                setEmail(event.target.value)
                setFieldError('')
              }}
              placeholder={t('you@organization.org')}
            />
            {fieldError && <span className="auth-field-error">{fieldError}</span>}
          </label>
          <button className="login-submit" type="submit" disabled={isSubmitting}>
            {t(isSubmitting ? 'Sending…' : 'Send reset link')}
          </button>
        </form>
        <p className="login-footer"><Link to="/login">{t('Return to sign in')}</Link></p>
      </section>
      <p className="login-footer">{t('DANNA · ضنى · Neonatal Care Management')}</p>
    </main>
  )
}

export default ForgotPassword
