import { useEffect, useRef, useState } from 'react'
import { ApiError, apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import { useNavigate } from 'react-router-dom'
import '../App.css'

const emptyProfile = {
  name: '',
  phone: '',
  contact_email: '',
  governorate: '',
  city: '',
  address: '',
  short_description: '',
  overview: '',
  website_url: '',
  working_hours: '',
  establishment_year: '',
  location_url: '',
  specialties: '',
  services: '',
}

const textFields = [
  ['name', 'Hospital name', 255],
  ['contact_email', 'Public contact email', 255],
  ['phone', 'Contact phone', 32],
  ['governorate', 'Governorate', 100],
  ['city', 'City', 255],
  ['address', 'Street address', 1000],
  ['website_url', 'Website URL', 2048],
  ['working_hours', 'Working hours', 1000],
  ['establishment_year', 'Establishment year', 4],
  ['location_url', 'Google Maps or location URL', 2048],
]

function toForm(profile) {
  return {
    ...emptyProfile,
    ...profile,
    establishment_year: profile.establishment_year ? String(profile.establishment_year) : '',
    specialties: Array.isArray(profile.specialties) ? profile.specialties.join(', ') : '',
    services: Array.isArray(profile.services) ? profile.services.join(', ') : '',
  }
}

function listFromText(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function HospitalProfile({ rejectedRegistration = false }) {
  const { logout, user } = useAuth()
  const { t } = useLocale()
  const canEditProfile = user?.role === 'hospital_admin'
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(emptyProfile)
  const [logoFile, setLogoFile] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isResubmitting, setIsResubmitting] = useState(false)
  const [resubmitted, setResubmitted] = useState(false)
  const previewRef = useRef('')

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  function setSelectedLogo(file) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = file ? URL.createObjectURL(file) : ''
    setPreviewUrl(previewRef.current)
    setLogoFile(file)
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      try {
        const response = await apiRequest(
          rejectedRegistration
            ? '/api/hospital/rejected-registration/profile'
            : '/api/hospital/profile',
          {
          signal: controller.signal,
          }
        )
        if (!response.data?.id) {
          throw new Error('The server returned an invalid hospital profile.')
        }
        setProfile(response.data)
        setForm(toForm(response.data))
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'The hospital profile could not be loaded.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadProfile()
    return () => controller.abort()
  }, [reloadKey, rejectedRegistration])

  function changeField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setSuccess('')
  }

  function cancelEdit() {
    setForm(toForm(profile))
    setSelectedLogo(null)
    setRemoveLogo(false)
    setFieldErrors({})
    setError('')
    setIsEditing(false)
  }

  async function submitProfile(event) {
    event.preventDefault()
    if (isSaving) return

    setFieldErrors({})
    setError('')
    setSuccess('')
    setIsSaving(true)

    try {
      const data = new FormData()
      for (const [field] of textFields) {
        data.append(field, String(form[field] ?? '').trim())
      }
      data.append('short_description', String(form.short_description ?? '').trim())
      data.append('overview', String(form.overview ?? '').trim())
      data.append('specialties', JSON.stringify(listFromText(String(form.specialties ?? ''))))
      data.append('services', JSON.stringify(listFromText(String(form.services ?? ''))))
      if (logoFile) data.append('logo', logoFile)
      if (removeLogo) data.append('remove_logo', '1')
      data.append('_method', 'PATCH')

      const response = await apiRequest(
        rejectedRegistration
          ? '/api/hospital/rejected-registration/profile'
          : '/api/hospital/profile',
        {
        method: 'POST',
        body: data,
        }
      )
      if (!response.data?.id) {
        throw new Error('The server did not return the updated hospital profile.')
      }
      setProfile(response.data)
      setForm(toForm(response.data))
      window.dispatchEvent(new CustomEvent('danna:hospital-logo-updated', {
        detail: response.data.logo_url || '',
      }))
      setSelectedLogo(null)
      setRemoveLogo(false)
      setIsEditing(false)
      setSuccess(response.message || 'Hospital profile updated.')
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(requestError.errors).map(([field, messages]) => [field.split('.')[0], messages[0]])
          )
        )
        setError('Review the highlighted fields and try again.')
      } else {
        setError(requestError.message || 'The hospital profile could not be updated.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function resubmitRegistration() {
    if (!window.confirm(t('Submit the corrected hospital information for Super Admin review?'))) {
      return
    }

    setError('')
    setSuccess('')
    setIsResubmitting(true)
    try {
      const response = await apiRequest('/api/hospital/rejected-registration/resubmit', {
        method: 'POST',
      })
      setResubmitted(true)
      setIsEditing(false)
      setSuccess(response.message || 'Hospital registration resubmitted for review.')
    } catch (requestError) {
      setError(requestError.message || 'The hospital registration could not be resubmitted.')
    } finally {
      setIsResubmitting(false)
    }
  }

  async function signOutAfterResubmission() {
    try {
      await logout()
      navigate('/login', {
        replace: true,
        state: { message: 'Your hospital registration is pending review.' },
      })
    } catch (logoutError) {
      setError(logoutError.message || 'Sign out failed. Please try again.')
    }
  }

  function startEditing() {
    setError('')
    setSuccess('')
    setFieldErrors({})
    setIsEditing(true)
  }

  const logoUrl = previewUrl || (removeLogo ? '' : profile?.logo_url)
  const initials = profile?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

  return (
    <main className="main-content hospital-profile-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">
            {rejectedRegistration ? 'Hospital workspace / Registration corrections' : 'Hospital workspace / Hospital profile'}
          </span>
          <h1>{rejectedRegistration ? 'Correct hospital registration' : 'Hospital Profile'}</h1>
          <p>
            {rejectedRegistration
              ? 'Update the permitted hospital details requested for correction, then resubmit for approval.'
              : 'Manage the facility information associated with your approved account.'}
          </p>
        </div>
        {canEditProfile && !isEditing && profile && (!rejectedRegistration || !resubmitted) && (
          <button type="button" className="primary-button profile-edit-button" onClick={startEditing}>
            {rejectedRegistration ? 'Edit corrections' : 'Edit profile'}
          </button>
        )}
      </header>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {error && (
        <div className="hospital-feedback error" role="alert">
          <span>{error}</span>
          {!profile && (
            <button type="button" className="hospital-retry" onClick={() => {
              setIsLoading(true)
              setReloadKey((current) => current + 1)
            }}>
              Retry
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <section className="panel profile-loading" role="status">Loading hospital profile…</section>
      ) : profile ? (
        <>
          <section className="panel profile-summary">
            <div className="profile-identity">
              <div className="profile-logo">
                {logoUrl ? (
                  <img src={logoUrl} alt={`${profile.name} logo`} />
                ) : (
                  <span aria-label="Default hospital logo placeholder">{initials || 'H'}</span>
                )}
              </div>
              <div className="profile-identity-copy">
                <span className="eyebrow">HOSPITAL PROFILE</span>
                <h2>{profile.name}</h2>
                <p>{[profile.governorate, profile.city].filter(Boolean).join(', ') || 'Location not provided'}</p>
              </div>
            </div>
            <div
              className="profile-completion"
              aria-label={t('Profile {percentage}% complete', { percentage: profile.profile_completion.percentage })}
            >
              <div className="profile-completion-copy">
                <strong>{t('Profile completeness')}</strong>
                <span>{t('{completed} of {total} optional details', {
                  completed: profile.profile_completion.completed,
                  total: profile.profile_completion.total,
                })}</span>
              </div>
              <div
                className="profile-progress"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={profile.profile_completion.percentage}
                aria-label="Hospital profile completion"
              >
                <span style={{ width: `${profile.profile_completion.percentage}%` }} />
              </div>
              <strong className="profile-percentage">{profile.profile_completion.percentage}%</strong>
            </div>
          </section>

          {isEditing ? (
            <section className="panel profile-form-panel">
              <div className="panel-heading">
                <div>
                  <h2>{rejectedRegistration ? 'Update registration information' : 'Edit hospital information'}</h2>
                  <p>Administrator login credentials and approval status are managed separately.</p>
                </div>
              </div>

              <form className="profile-form" onSubmit={submitProfile}>
                <div className="profile-image-field">
                  <div className="profile-logo profile-logo-edit">
                    {logoUrl ? <img src={logoUrl} alt="Hospital logo preview" /> : <span>{initials || 'H'}</span>}
                  </div>
                  <div className="profile-image-controls">
                    <label htmlFor="hospital-logo">Hospital logo (optional)</label>
                    <input
                      id="hospital-logo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        setSelectedLogo(event.target.files?.[0] || null)
                        setRemoveLogo(false)
                        setFieldErrors((current) => ({ ...current, logo: '' }))
                      }}
                      aria-invalid={Boolean(fieldErrors.logo)}
                      aria-describedby={fieldErrors.logo ? 'profile-logo-error' : 'profile-logo-hint'}
                    />
                    <span id="profile-logo-hint" className="profile-field-hint">JPEG, PNG, or WebP; maximum 2 MB.</span>
                    {fieldErrors.logo && <span id="profile-logo-error" className="hospital-field-error">{fieldErrors.logo}</span>}
                    {profile.logo_url && !removeLogo && !logoFile && (
                      <button type="button" className="profile-remove-logo" onClick={() => {
                        setRemoveLogo(true)
                        setError('')
                      }}>
                        Remove current logo
                      </button>
                    )}
                    {removeLogo && <span className="profile-field-hint">The current logo will be removed when you save.</span>}
                  </div>
                </div>

                <div className="profile-fields-grid">
                  {textFields.map(([field, label, maxLength]) => (
                    <label key={field} className={field === 'address' ? 'profile-field-wide' : ''}>
                      {label}{['name', 'city'].includes(field) ? ' *' : ' (optional)'}
                      <input
                        type={field === 'contact_email' ? 'email' : field.endsWith('_url') ? 'url' : field === 'establishment_year' ? 'number' : field === 'phone' ? 'tel' : 'text'}
                        required={['name', 'city'].includes(field)}
                        min={field === 'establishment_year' ? 1800 : undefined}
                        max={field === 'establishment_year' ? new Date().getFullYear() : undefined}
                        maxLength={field === 'establishment_year' ? undefined : maxLength}
                        value={form[field]}
                        onChange={(event) => changeField(field, event.target.value)}
                        aria-invalid={Boolean(fieldErrors[field])}
                        aria-describedby={fieldErrors[field] ? `profile-${field}-error` : undefined}
                      />
                      {fieldErrors[field] && <span id={`profile-${field}-error`} className="hospital-field-error">{fieldErrors[field]}</span>}
                    </label>
                  ))}

                  <label className="profile-field-wide">
                    Short description (optional)
                    <textarea
                      rows="2"
                      maxLength={500}
                      value={form.short_description}
                      onChange={(event) => changeField('short_description', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.short_description)}
                    />
                    {fieldErrors.short_description && <span className="hospital-field-error">{fieldErrors.short_description}</span>}
                  </label>

                  <label className="profile-field-wide">
                    Detailed overview (optional)
                    <textarea
                      rows="5"
                      maxLength={5000}
                      value={form.overview}
                      onChange={(event) => changeField('overview', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.overview)}
                    />
                    {fieldErrors.overview && <span className="hospital-field-error">{fieldErrors.overview}</span>}
                  </label>

                  <label>
                    Medical specialties (optional)
                    <input
                      type="text"
                      value={form.specialties}
                      onChange={(event) => changeField('specialties', event.target.value)}
                      placeholder="Separate entries with commas"
                      aria-invalid={Boolean(fieldErrors.specialties)}
                    />
                    {fieldErrors.specialties && <span className="hospital-field-error">{fieldErrors.specialties}</span>}
                  </label>

                  <label>
                    Services (optional)
                    <input
                      type="text"
                      value={form.services}
                      onChange={(event) => changeField('services', event.target.value)}
                      placeholder="Separate entries with commas"
                      aria-invalid={Boolean(fieldErrors.services)}
                    />
                    {fieldErrors.services && <span className="hospital-field-error">{fieldErrors.services}</span>}
                  </label>
                </div>

                <div className="profile-form-actions">
                  <button type="submit" className="primary-button" disabled={isSaving || resubmitted}>
                    {isSaving ? 'Saving profile…' : 'Save profile'}
                  </button>
                  {!rejectedRegistration && (
                    <button type="button" className="secondary-button" onClick={cancelEdit} disabled={isSaving}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>
          ) : (
            <section className="profile-details-grid">
              <article className="panel profile-detail-card profile-detail-wide">
                <h2>About the hospital</h2>
                <p className="profile-short-description">{profile.short_description || 'No short description provided.'}</p>
                <p className="profile-overview">{profile.overview || 'No detailed overview provided.'}</p>
              </article>
              <article className="panel profile-detail-card">
                <h2>Contact and location</h2>
                <dl>
                  <div><dt>Contact email</dt><dd>{profile.contact_email || 'Not provided'}</dd></div>
                  <div><dt>Phone</dt><dd>{profile.phone || 'Not provided'}</dd></div>
                  <div><dt>Address</dt><dd>{[profile.address, profile.city, profile.governorate].filter(Boolean).join(', ') || 'Not provided'}</dd></div>
                  <div><dt>Website</dt><dd>{profile.website_url ? <a href={profile.website_url} target="_blank" rel="noreferrer">{profile.website_url}</a> : 'Not provided'}</dd></div>
                  <div><dt>Location</dt><dd>{profile.location_url ? <a href={profile.location_url} target="_blank" rel="noreferrer">Open location map</a> : 'Not provided'}</dd></div>
                </dl>
              </article>
              <article className="panel profile-detail-card">
                <h2>Profile information</h2>
                <dl>
                  <div><dt>Working hours</dt><dd>{profile.working_hours || 'Not provided'}</dd></div>
                  <div><dt>Established</dt><dd>{profile.establishment_year || 'Not provided'}</dd></div>
                  <div><dt>Specialties</dt><dd>{profile.specialties?.length ? profile.specialties.join(', ') : 'Not provided'}</dd></div>
                  <div><dt>Services</dt><dd>{profile.services?.length ? profile.services.join(', ') : 'Not provided'}</dd></div>
                </dl>
              </article>
            </section>
          )}
          {rejectedRegistration && (
            <section className="panel lifecycle-resubmit-panel">
              <div>
                <h2>{resubmitted ? 'Registration resubmitted' : 'Ready for review?'}</h2>
                <p>
                  {resubmitted
                    ? 'Your hospital is pending Super Admin review. Operational features remain unavailable until approval.'
                    : 'Save your corrections before submitting. Only a Super Admin can approve the hospital.'}
                </p>
              </div>
              {resubmitted ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={signOutAfterResubmission}
                >
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button lifecycle-action-button"
                  onClick={resubmitRegistration}
                  disabled={isResubmitting || isEditing || isSaving || isLoading}
                >
                  {isResubmitting ? 'Submitting…' : 'Resubmit for approval'}
                </button>
              )}
            </section>
          )}
        </>
      ) : null}
    </main>
  )
}

export default HospitalProfile
