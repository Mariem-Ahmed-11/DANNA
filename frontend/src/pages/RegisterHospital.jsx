import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiRequest } from '../api'
import '../App.css'

const initialForm = {
  name: '',
  governorate: '',
  city: '',
  address: '',
  phone: '',
  contact_email: '',
  short_description: '',
  overview: '',
  website_url: '',
  working_hours: '',
  establishment_year: '',
  location_url: '',
  specialties: '',
  services: '',
  contact_name: '',
  email: '',
  password: '',
  password_confirmation: '',
}

function RegisterHospital() {
  const [form, setForm] = useState(initialForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [logoFile, setLogoFile] = useState(null)

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFieldErrors({})
    setFormError('')
    setIsSubmitting(true)

    try {
      const data = new FormData()
      for (const [field, value] of Object.entries(form)) {
        if (['specialties', 'services'].includes(field)) {
          data.append(field, JSON.stringify(value.split(',').map((item) => item.trim()).filter(Boolean)))
        } else {
          data.append(field, ['name', 'governorate', 'city', 'address', 'phone', 'contact_email', 'short_description', 'overview', 'website_url', 'working_hours', 'establishment_year', 'location_url', 'contact_name', 'email'].includes(field) ? value.trim() : value)
        }
      }
      if (logoFile) data.append('logo', logoFile)

      await apiRequest('/api/hospitals', {
        method: 'POST',
        body: data,
      })
      setSubmitted(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(error.errors).map(([field, messages]) => [field.split('.')[0], messages[0]])
          )
        )
        setFormError('Please correct the highlighted fields.')
      } else {
        setFormError(error.message || 'The registration could not be submitted.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="login-card" aria-labelledby="registration-heading">
        <Link className="login-brand" to="/login" aria-label="DHANA sign in">
          <img
            className="login-logo"
            src="/dhana-logo-removebg-preview.png"
            alt="DHANA (ضنى) neonatal-care logo"
          />
          <span>
            <strong>DHANA</strong>
            <small>ضنى · Neonatal Care</small>
          </span>
        </Link>

        {submitted ? (
          <div className="login-intro" role="status">
            <span className="eyebrow">REGISTRATION RECEIVED</span>
            <h1 id="registration-heading">Awaiting review</h1>
            <p>
              Your hospital request is pending Super Admin review. The account will
              remain unavailable until the hospital is approved.
            </p>
            <Link className="primary-button" to="/login">Return to sign in</Link>
          </div>
        ) : (
          <>
            <div className="login-intro">
              <span className="eyebrow">HOSPITAL ACCOUNT</span>
              <h1 id="registration-heading">Request registration</h1>
              <p>Submit your hospital and responsible staff details for review.</p>
            </div>

            {formError && <div className="login-error" role="alert">{formError}</div>}

            <form className="login-form registration-form" onSubmit={handleSubmit}>
              <section className="registration-section" aria-labelledby="registration-hospital-heading">
                <h2 id="registration-hospital-heading">Hospital profile information</h2>
                <p>Optional profile details can be completed or updated after approval.</p>
              </section>
              {[
                ['name', 'Hospital name', 'text', 'organization', true],
                ['governorate', 'Governorate (optional)', 'text', 'address-level1', false],
                ['city', 'City', 'text', 'address-level2', true],
                ['address', 'Street address (optional)', 'text', 'street-address', false],
                ['phone', 'Hospital contact phone (optional)', 'tel', 'tel', false],
                ['contact_email', 'Hospital contact email (optional)', 'email', 'email', false],
                ['short_description', 'Short description (optional)', 'text', 'off', false],
                ['overview', 'Detailed overview (optional)', 'text', 'off', false],
                ['website_url', 'Website URL (optional)', 'url', 'url', false],
                ['working_hours', 'Working hours (optional)', 'text', 'off', false],
                ['establishment_year', 'Establishment year (optional)', 'number', 'off', false],
                ['location_url', 'Google Maps or location URL (optional)', 'url', 'url', false],
                ['specialties', 'Medical specialties (optional, comma-separated)', 'text', 'off', false],
                ['services', 'Services (optional, comma-separated)', 'text', 'off', false],
              ].map(([field, label, type, autoComplete, required]) => (
                <label key={field} htmlFor={`register-${field}`}>
                  {label}
                  {['short_description', 'overview'].includes(field) ? (
                    <textarea
                      id={`register-${field}`}
                      name={field}
                      rows={field === 'overview' ? 4 : 2}
                      maxLength={field === 'short_description' ? 500 : 5000}
                      value={form[field]}
                      onChange={(event) => updateField(field, event.target.value)}
                      aria-invalid={Boolean(fieldErrors[field])}
                      aria-describedby={fieldErrors[field] ? `register-${field}-error` : undefined}
                    />
                  ) : (
                    <input
                      id={`register-${field}`}
                      name={field}
                      type={type}
                      autoComplete={autoComplete}
                      required={required}
                      maxLength={field === 'phone' ? 32 : field === 'governorate' ? 100 : field === 'address' ? 1000 : field === 'website_url' || field === 'location_url' ? 2048 : 255}
                      min={field === 'establishment_year' ? 1800 : undefined}
                      max={field === 'establishment_year' ? new Date().getFullYear() : undefined}
                      value={form[field]}
                      onChange={(event) => updateField(field, event.target.value)}
                      aria-invalid={Boolean(fieldErrors[field])}
                      aria-describedby={fieldErrors[field] ? `register-${field}-error` : undefined}
                    />
                  )}
                  {fieldErrors[field] && (
                    <span className="auth-field-error" id={`register-${field}-error`}>
                      {fieldErrors[field]}
                    </span>
                  )}
                </label>
              ))}
              <label htmlFor="register-logo">
                Hospital logo/profile image (optional)
                <input
                  id="register-logo"
                  name="logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
                  aria-invalid={Boolean(fieldErrors.logo)}
                  aria-describedby={fieldErrors.logo ? 'register-logo-error' : 'register-logo-hint'}
                />
                <span id="register-logo-hint" className="profile-field-hint">JPEG, PNG, or WebP; maximum 2 MB.</span>
                {fieldErrors.logo && <span className="auth-field-error" id="register-logo-error">{fieldErrors.logo}</span>}
              </label>

              <section className="registration-section" aria-labelledby="registration-account-heading">
                <h2 id="registration-account-heading">Account administrator</h2>
                <p>These details create the private hospital administrator sign-in.</p>
              </section>
              {[
                ['contact_name', 'Administrator name', 'text', 'name'],
                ['email', 'Administrator sign-in email', 'email', 'email'],
                ['password', 'Password (12 characters minimum)', 'password', 'new-password'],
                ['password_confirmation', 'Confirm password', 'password', 'new-password'],
              ].map(([field, label, type, autoComplete]) => (
                <label key={field} htmlFor={`register-${field}`}>
                  {label}
                  <input
                    id={`register-${field}`}
                    name={field}
                    type={type}
                    autoComplete={autoComplete}
                    required
                    minLength={field === 'password' || field === 'password_confirmation' ? 12 : undefined}
                    maxLength={255}
                    value={form[field]}
                    onChange={(event) => updateField(field, event.target.value)}
                    aria-invalid={Boolean(fieldErrors[field])}
                    aria-describedby={fieldErrors[field] ? `register-${field}-error` : undefined}
                  />
                  {fieldErrors[field] && (
                    <span className="auth-field-error" id={`register-${field}-error`}>
                      {fieldErrors[field]}
                    </span>
                  )}
                </label>
              ))}

              <button className="login-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </form>
          </>
        )}
      </section>
      <p className="login-footer"><Link to="/login">Authorized staff sign in</Link></p>
    </main>
  )
}

export default RegisterHospital
