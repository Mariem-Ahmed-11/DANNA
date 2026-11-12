import { useState } from 'react'
import { apiRequest } from '../api'
import { useLocale } from '../i18n'
import '../App.css'

function ChangePassword() {
  const { t } = useLocale()
  const [form, setForm] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setSuccess('')
  }

  async function submit(event) {
    event.preventDefault()
    setFieldErrors({})
    setError('')
    setSuccess('')
    setIsSubmitting(true)

    try {
      const payload = await apiRequest('/api/user/password', {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      setSuccess(t(payload.message || 'Your password has been changed.'))
      setForm({ current_password: '', password: '', password_confirmation: '' })
    } catch (requestError) {
      if (requestError.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(requestError.errors || {}).map(([field, messages]) => [field, messages[0]])
          )
        )
        setError(requestError.message || t('Check the highlighted fields.'))
      } else if (requestError.status === 429) {
        setError(t('Too many requests. Wait a moment and try again.'))
      } else {
        setError(requestError.message || t('Your password could not be changed.'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="main-content" id="change-password-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">{t('Account / Security')}</span>
          <h1>{t('Change password')}</h1>
          <p>{t('Update the password for your own DANNA account.')}</p>
        </div>
      </header>
      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && <div className="hospital-feedback error" role="alert">{error}</div>}
      <section className="panel password-change-panel">
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="current-password">
            {t('Current password')}
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={form.current_password}
              aria-invalid={Boolean(fieldErrors.current_password)}
              onChange={(event) => updateField('current_password', event.target.value)}
            />
            {fieldErrors.current_password && <span className="auth-field-error">{fieldErrors.current_password}</span>}
          </label>
          <label htmlFor="new-password">
            {t('New password')}
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={form.password}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) => updateField('password', event.target.value)}
            />
            {fieldErrors.password && <span className="auth-field-error">{fieldErrors.password}</span>}
          </label>
          <label htmlFor="new-password-confirmation">
            {t('Confirm new password')}
            <input
              id="new-password-confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={form.password_confirmation}
              aria-invalid={Boolean(fieldErrors.password_confirmation)}
              onChange={(event) => updateField('password_confirmation', event.target.value)}
            />
            {fieldErrors.password_confirmation && (
              <span className="auth-field-error">{fieldErrors.password_confirmation}</span>
            )}
          </label>
          <button className="login-submit" type="submit" disabled={isSubmitting}>
            {t(isSubmitting ? 'Updating…' : 'Change password')}
          </button>
        </form>
      </section>
    </main>
  )
}

export default ChangePassword
