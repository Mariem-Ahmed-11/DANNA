import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'
import '../App.css'

function AcceptStaffInvitation() {
  const { t } = useLocale()
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const email = hashParams.get('email') || ''
  const token = hashParams.get('token') || ''
  const hasInvitationDetails = Boolean(email && token)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await apiRequest('/api/staff-invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          email,
          token,
          password,
          password_confirmation: passwordConfirmation,
        }),
      })
      setAccepted(true)
    } catch (requestError) {
      if (requestError.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(requestError.errors || {}).map(([field, messages]) => [field, messages[0]])
          )
        )
        setError(requestError.message || 'This invitation could not be accepted.')
      } else {
        setError(requestError.message || 'The invitation could not be accepted.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="staff-invitation-card">
        <img className="login-logo" src="/dhana-logo-removebg-preview.png" alt={t('DANNA neonatal-care logo')} />
        {accepted ? (
          <>
            <h1>{t('Invitation accepted')}</h1>
            <p>{t('Your Hospital Staff account is ready. Sign in to continue.')}</p>
            <Link className="primary-button staff-invitation-submit" to="/login">{t('Go to sign in')}</Link>
          </>
        ) : !hasInvitationDetails ? (
          <>
            <h1>{t('Invitation link is invalid')}</h1>
            <p role="alert">{t('This invitation link is incomplete or invalid. Ask your hospital administrator to send a new invitation.')}</p>
            <Link className="primary-button staff-invitation-submit" to="/login">{t('Return to sign in')}</Link>
          </>
        ) : (
          <>
            <h1>{t('Join your hospital team')}</h1>
            <p>{t('Set a password for the Hospital Staff account invited to')} {email || t('your email address')}.</p>
            {error && <div className="hospital-feedback error" role="alert">{error}</div>}
            <form className="staff-invitation-form" onSubmit={submit}>
              <label>
                {t('Email')}
                <input type="email" value={email} readOnly required />
                {fieldErrors.email && <span className="hospital-field-error">{fieldErrors.email}</span>}
              </label>
              <label>
                {t('Password')}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  aria-invalid={Boolean(fieldErrors.password)}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {fieldErrors.password && <span className="hospital-field-error">{fieldErrors.password}</span>}
              </label>
              <label>
                {t('Confirm password')}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                />
              </label>
              {fieldErrors.invitation && <p className="hospital-form-error">{fieldErrors.invitation}</p>}
              <button className="primary-button staff-invitation-submit" type="submit" disabled={isSubmitting}>
                {t(isSubmitting ? 'Accepting…' : 'Accept invitation')}
              </button>
            </form>
            <Link className="staff-invitation-back" to="/login">{t('Return to sign in')}</Link>
          </>
        )}
      </section>
    </main>
  )
}

export default AcceptStaffInvitation
