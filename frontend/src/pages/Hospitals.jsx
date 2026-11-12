import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api'
import { useAuth } from '../auth'
import { useDialogA11y } from '../useDialogA11y'
import '../App.css'

function getApiErrorMessage(error) {
  if (error.status === 401) {
    return 'Your session expired. Sign in again to continue.'
  }

  if (error.status === 403) {
    return 'Your account does not have permission to access hospitals.'
  }

  if (error instanceof TypeError) {
    return 'Could not connect to the Laravel API. Check that the backend is running and the API URL is correct.'
  }

  return error.message || 'An unexpected error occurred while contacting the API.'
}

function formatStatus(status) {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function Hospitals() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'
  const canUpdateHospital = user?.role === 'hospital_admin'
  const [hospitals, setHospitals] = useState([])
  const [search, setSearch] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [successMessage, setSuccessMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [lifecycleDialog, setLifecycleDialog] = useState(null)
  const [lifecycleError, setLifecycleError] = useState('')
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [accountDialog, setAccountDialog] = useState(null)
  const historyRequestRef = useRef(0)
  const [form, setForm] = useState({
    name: '',
    city: '',
    phone: '',
  })

  function closeSuspensionDialog() {
    if (lifecycleBusy) return
    setLifecycleDialog(null)
    setLifecycleError('')
  }

  function closeHistoryDialog() {
    historyRequestRef.current += 1
    setLifecycleDialog(null)
    setLifecycleError('')
  }

  const suspensionDialogRef = useDialogA11y(lifecycleDialog?.type === 'suspend', closeSuspensionDialog)
  const accountDialogRef = useDialogA11y(Boolean(accountDialog), closeAccountManagement)
  const historyDialogRef = useDialogA11y(lifecycleDialog?.type === 'history', closeHistoryDialog)

  useEffect(() => {
    const controller = new AbortController()

    async function loadHospitals() {
      try {
        const payload = await apiRequest('/api/hospitals', {
          signal: controller.signal,
        })

        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid hospitals list.')
        }

        setHospitals(payload.data)
        if (!isSuperAdmin && payload.data[0]) {
          setForm({
            name: payload.data[0].name,
            city: payload.data[0].city,
            phone: payload.data[0].phone || '',
          })
        }
        setLoadError('')
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError(getApiErrorMessage(error))
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadHospitals()

    return () => controller.abort()
  }, [reloadKey, isSuperAdmin])

  const filteredHospitals = hospitals.filter((hospital) =>
    `${hospital.name} ${hospital.city}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  function handleRefresh() {
    setIsLoading(true)
    setLoadError('')
    setReloadKey((current) => current + 1)
  }

  function handleFieldChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError('')
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setSuccessMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setFieldErrors({})
    setSuccessMessage('')
    setIsSaving(true)

    try {
      const payload = await apiRequest(
        isSuperAdmin ? '/api/hospitals' : `/api/hospitals/${user.hospital_id}`,
        {
        method: isSuperAdmin ? 'POST' : 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          city: form.city.trim(),
          phone: form.phone.trim() || null,
        }),
      })

      if (!payload.data?.id) {
        throw new Error('The server did not return the updated hospital record.')
      }

      setHospitals((current) => [
        payload.data,
        ...current.filter((hospital) => hospital.id !== payload.data.id),
      ])
      setSuccessMessage('Hospital information updated.')
      setIsLoading(true)
      setLoadError('')
      setReloadKey((current) => current + 1)
    } catch (error) {
      if (error.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(error.errors).map(([field, messages]) => [
              field,
              messages[0],
            ])
          )
        )
        setFormError('Please correct the highlighted fields.')
      } else {
        setFormError(getApiErrorMessage(error))
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function submitLifecycleDecision(event) {
    event.preventDefault()
    if (!lifecycleDialog || lifecycleBusy) return

    const reason = lifecycleDialog.reason?.trim() || ''
    if (reason.length < 10 || reason.length > 2000) {
      setLifecycleError('Provide a reason between 10 and 2000 characters.')
      return
    }

    setLifecycleError('')
    setLifecycleBusy(true)
    try {
      const payload = await apiRequest(`/api/admin/hospitals/${lifecycleDialog.hospital.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setHospitals((current) =>
        current.map((hospital) => hospital.id === lifecycleDialog.hospital.id ? payload.data : hospital)
      )
      setSuccessMessage('Hospital account suspended.')
      setLifecycleDialog(null)
    } catch (error) {
      setLifecycleError(
        error.status === 422 && error.errors?.reason?.[0]
          ? error.errors.reason[0]
          : getApiErrorMessage(error)
      )
    } finally {
      setLifecycleBusy(false)
    }
  }

  async function reactivateHospital(hospital) {
    if (!window.confirm(`Reactivate ${hospital.name}? Only accounts active before suspension will be restored.`)) {
      return
    }
    setFormError('')
    setSuccessMessage('')
    try {
      const payload = await apiRequest(`/api/admin/hospitals/${hospital.id}/reactivate`, {
        method: 'POST',
      })
      setHospitals((current) =>
        current.map((item) => item.id === hospital.id ? payload.data : item)
      )
      setSuccessMessage('Hospital account reactivated. Previously active accounts were restored.')
    } catch (error) {
      setFormError(getApiErrorMessage(error))
    }
  }

  async function showLifecycleHistory(hospital) {
    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId
    const isCurrentRequest = (current) => (
      historyRequestRef.current === requestId
      && current?.type === 'history'
      && current.hospital?.id === hospital.id
    )

    setLifecycleError('')
    setLifecycleDialog({ type: 'history', hospital, events: [], loading: true })
    try {
      const payload = await apiRequest(`/api/admin/hospitals/${hospital.id}/lifecycle-history`)
      if (!Array.isArray(payload.data)) {
        throw new Error('The server returned an invalid lifecycle history.')
      }
      setLifecycleDialog((current) => (
        isCurrentRequest(current)
          ? { type: 'history', hospital, events: payload.data, loading: false }
          : current
      ))
    } catch (error) {
      if (historyRequestRef.current !== requestId) return
      setLifecycleError(getApiErrorMessage(error))
      setLifecycleDialog((current) => (
        isCurrentRequest(current)
          ? { type: 'history', hospital, events: [], loading: false }
          : current
      ))
    }
  }

  async function showAccountManagement(hospital) {
    setFormError('')
    setSuccessMessage('')
    setAccountDialog({
      hospital,
      users: [],
      selectedUser: null,
      reason: '',
      error: '',
      loading: true,
      busy: false,
    })

    try {
      const payload = await apiRequest(`/api/admin/hospitals/${hospital.id}/users`)
      if (!Array.isArray(payload.data)) {
        throw new Error('The server returned an invalid user account list.')
      }
      setAccountDialog((current) =>
        current ? { ...current, users: payload.data, loading: false } : current
      )
    } catch (error) {
      setAccountDialog((current) =>
        current ? { ...current, loading: false, error: getApiErrorMessage(error) } : current
      )
    }
  }

  function selectAccountForActivation(account) {
    setAccountDialog((current) =>
      current ? { ...current, selectedUser: account, reason: '', error: '' } : current
    )
  }

  function closeAccountManagement() {
    if (accountDialog?.busy) return
    setAccountDialog(null)
  }

  async function activateSuspendedUser(event) {
    event.preventDefault()
    if (!accountDialog?.selectedUser || accountDialog.busy) return

    const reason = accountDialog.reason.trim()
    if (reason.length < 10 || reason.length > 2000) {
      setAccountDialog((current) =>
        current
          ? { ...current, error: 'Provide a reason between 10 and 2000 characters.' }
          : current
      )
      return
    }

    if (!window.confirm(
      `Activate ${accountDialog.selectedUser.name}'s account for ${accountDialog.hospital.name}?`
    )) {
      return
    }

    setAccountDialog((current) => (current ? { ...current, busy: true, error: '' } : current))

    try {
      const payload = await apiRequest(
        `/api/admin/hospitals/${accountDialog.hospital.id}/users/${accountDialog.selectedUser.id}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      )
      setAccountDialog((current) =>
        current
          ? {
              ...current,
              users: current.users.filter((account) => account.id !== payload.data.id),
              selectedUser: null,
              reason: '',
              busy: false,
              error: '',
            }
          : current
      )
      setSuccessMessage(`${payload.data.name}'s account was activated and the event was recorded.`)
    } catch (error) {
      const validationMessage = error.status === 422
        ? Object.values(error.errors || {}).flat()[0]
        : ''
      setAccountDialog((current) =>
        current
          ? {
              ...current,
              busy: false,
              error: validationMessage || getApiErrorMessage(error),
            }
          : current
      )
    }
  }

  return (
    <main className="main-content" id="hospitals-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Workspace / Hospitals</span>
          <h1>{isSuperAdmin ? 'Hospital Management' : 'My hospital'}</h1>
          <p>
            {isSuperAdmin
              ? 'View registered hospitals and manage approved accounts.'
              : canUpdateHospital
                ? 'View and update information for your approved hospital.'
                : 'View the hospital information available to your staff account.'}
          </p>
        </div>
      </header>

      <section className="section-heading">
        <div>
          <h2>{isSuperAdmin ? 'Registered hospitals' : 'Hospital information'}</h2>
          <p>{isSuperAdmin ? 'Monitor hospital account status.' : 'Changes apply only to your hospital.'}</p>
        </div>
      </section>

      <div className="prototype-notice" role="note">
        <span className="prototype-notice-icon" aria-hidden="true">i</span>
        <p>
          {isSuperAdmin
            ? 'Hospital registration requests can be reviewed from the requests page.'
            : 'Hospital records are scoped to your account and protected by the server.'}
        </p>
      </div>

      {successMessage && (
        <div className="hospital-feedback success" role="status">
          {successMessage}
        </div>
      )}

      {loadError && (
        <div className="hospital-feedback error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="hospital-retry" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {canUpdateHospital && (
        <section
          className="panel hospital-form-panel"
          id="hospital-registration-form"
        >
          <div className="panel-heading">
            <div>
              <h2>Update hospital information</h2>
              <p>Only your hospital account can update these details.</p>
            </div>
          </div>

          <form className="hospital-form" onSubmit={handleSubmit}>
            <label>
              Hospital name *
              <input
                required
                type="text"
                maxLength={255}
                autoComplete="organization"
                value={form.name}
                onChange={(event) => handleFieldChange('name', event.target.value)}
                placeholder="Enter hospital name"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'hospital-name-error' : undefined}
              />
              {fieldErrors.name && (
                <span className="hospital-field-error" id="hospital-name-error">
                  {fieldErrors.name}
                </span>
              )}
            </label>

            <label>
              City *
              <input
                required
                type="text"
                maxLength={255}
                autoComplete="address-level2"
                value={form.city}
                onChange={(event) => handleFieldChange('city', event.target.value)}
                placeholder="Enter city"
                aria-invalid={Boolean(fieldErrors.city)}
                aria-describedby={fieldErrors.city ? 'hospital-city-error' : undefined}
              />
              {fieldErrors.city && (
                <span className="hospital-field-error" id="hospital-city-error">
                  {fieldErrors.city}
                </span>
              )}
            </label>

            <label>
              Phone number
              <input
                type="tel"
                maxLength={32}
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => handleFieldChange('phone', event.target.value)}
                placeholder="Enter contact number"
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={
                  fieldErrors.phone ? 'hospital-phone-error' : undefined
                }
              />
              {fieldErrors.phone && (
                <span className="hospital-field-error" id="hospital-phone-error">
                  {fieldErrors.phone}
                </span>
              )}
            </label>

            {formError && (
              <p className="hospital-form-error" role="alert">
                {formError}
              </p>
            )}

            <button
              className="primary-button hospital-save-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </section>
      )}
      {!isSuperAdmin && !canUpdateHospital && (
        <div className="prototype-notice" role="note">
          <span className="prototype-notice-icon" aria-hidden="true">i</span>
          <p>Hospital profile changes are restricted to Hospital Admins. You can view the hospital details below.</p>
        </div>
      )}

      <section className="panel hospitals-directory">
        <div className="directory-toolbar">
          <div>
            <h2>Registered hospitals</h2>
            <p>
              {isLoading
                ? 'Loading hospital records…'
                : loadError && hospitals.length === 0
                ? 'Hospital records are unavailable'
                : `${filteredHospitals.length} ${filteredHospitals.length === 1 ? 'hospital' : 'hospitals'} displayed`}
            </p>
          </div>

          <input
            className="hospital-search"
            type="search"
            placeholder="Search by name or city..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search hospitals"
            aria-describedby="hospital-search-help"
          />
          <span className="visually-hidden" id="hospital-search-help">
            Search database hospital records by name or city.
          </span>
        </div>

        <div className="hospital-table-wrapper">
          <table className="hospital-table">
            <thead>
              <tr>
                <th scope="col">Hospital</th>
                <th scope="col">City</th>
                <th scope="col">Contact</th>
                <th scope="col">Status</th>
                {isSuperAdmin && <th scope="col">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 5 : 4} className="no-hospitals">
                    <p className="hospital-loading">Loading hospital records…</p>
                  </td>
                </tr>
              ) : loadError && hospitals.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 5 : 4} className="no-hospitals">
                    <strong>Hospitals could not be loaded</strong>
                    <p>Retry after resolving the API connection or authentication issue.</p>
                  </td>
                </tr>
              ) : (
                <>
                  {filteredHospitals.map((hospital) => (
                    <tr key={hospital.id}>
                      <td>
                        <div className="hospital-name-cell">
                          <span className="hospital-avatar">
                            {hospital.name.charAt(0).toUpperCase()}
                          </span>
                          <strong>{hospital.name}</strong>
                        </div>
                      </td>

                      <td>{hospital.city}</td>

                      <td>{hospital.phone || 'Not provided'}</td>

                      <td>
                        <span className={`hospital-status ${hospital.status}`}>
                          {formatStatus(hospital.status)}
                        </span>
                      </td>
                      {isSuperAdmin && (
                        <td>
                          <div className="hospital-review-actions">
                            <Link className="secondary-button" to={`/hospitals/${hospital.id}`}>
                              View
                            </Link>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => showLifecycleHistory(hospital)}
                            >
                              Decision history
                            </button>
                            {hospital.status === 'approved' && (
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setLifecycleError('')
                                  setLifecycleDialog({ type: 'suspend', hospital, reason: '' })
                                }}
                              >
                                Suspend
                              </button>
                            )}
                            {hospital.status === 'approved' && (
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => showAccountManagement(hospital)}
                              >
                                User accounts
                              </button>
                            )}
                            {hospital.status === 'suspended' && (
                              <button
                                className="primary-button"
                                type="button"
                                onClick={() => reactivateHospital(hospital)}
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}

                  {filteredHospitals.length === 0 && (
                    <tr>
                      <td colSpan={isSuperAdmin ? 5 : 4} className="no-hospitals">
                        <div className="empty-icon">⌂</div>
                        <strong>
                          {search ? 'No matching hospitals' : 'No hospitals registered yet'}
                        </strong>
                        <p>
                          {search
                            ? 'Try another name or city, or clear your search.'
                            : 'No hospital records are currently stored in the database.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {lifecycleDialog?.type === 'suspend' && (
        <div className="lifecycle-dialog-backdrop">
          <section ref={suspensionDialogRef} tabIndex={-1} className="lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="suspend-hospital-title">
            <h2 id="suspend-hospital-title">Suspend {lifecycleDialog.hospital.name}</h2>
            <p>Suspension blocks hospital access but preserves its records. Previously active accounts can be restored on reactivation.</p>
            <form onSubmit={submitLifecycleDecision}>
              <label htmlFor="hospital-suspension-reason">Reason for suspension</label>
              <textarea
                id="hospital-suspension-reason"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={lifecycleDialog.reason}
                aria-invalid={Boolean(lifecycleError)}
                onChange={(event) => {
                  setLifecycleDialog((current) => ({ ...current, reason: event.target.value }))
                  setLifecycleError('')
                }}
              />
              {lifecycleError && <span className="hospital-field-error" role="alert">{lifecycleError}</span>}
              <div className="profile-form-actions">
                <button className="primary-button lifecycle-dialog-submit" type="submit" disabled={lifecycleBusy}>
                  {lifecycleBusy ? 'Saving…' : 'Confirm suspension'}
                </button>
                <button className="secondary-button" type="button" onClick={() => setLifecycleDialog(null)} disabled={lifecycleBusy}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {accountDialog && (
        <div className="lifecycle-dialog-backdrop">
          <section ref={accountDialogRef} tabIndex={-1} className="lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="user-activation-title">
            <h2 id="user-activation-title">{accountDialog.hospital.name} user accounts</h2>
            <p>
              Only suspended Hospital Admin and Hospital Staff accounts at an approved
              hospital can be manually activated. Every activation requires a reason and
              is recorded in the audit history.
            </p>

            {accountDialog.loading ? (
              <p role="status">Loading eligible user accounts…</p>
            ) : accountDialog.error && !accountDialog.selectedUser ? (
              <div className="hospital-feedback error" role="alert">{accountDialog.error}</div>
            ) : accountDialog.selectedUser ? (
              <form onSubmit={activateSuspendedUser}>
                <p>
                  Activating <strong>{accountDialog.selectedUser.name}</strong>
                  {' '}({accountDialog.selectedUser.email}).
                </p>
                <label htmlFor="user-activation-reason">Reason for manual activation</label>
                <textarea
                  id="user-activation-reason"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={accountDialog.reason}
                  aria-invalid={Boolean(accountDialog.error)}
                  onChange={(event) => {
                    setAccountDialog((current) =>
                      current
                        ? { ...current, reason: event.target.value, error: '' }
                        : current
                    )
                  }}
                />
                {accountDialog.error && (
                  <span className="hospital-field-error" role="alert">{accountDialog.error}</span>
                )}
                <div className="profile-form-actions">
                  <button
                    className="primary-button lifecycle-dialog-submit"
                    type="submit"
                    disabled={accountDialog.busy}
                  >
                    {accountDialog.busy ? 'Activating…' : 'Confirm activation'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={accountDialog.busy}
                    onClick={() => {
                      setAccountDialog((current) =>
                        current
                          ? {
                              ...current,
                              selectedUser: null,
                              reason: '',
                              error: '',
                            }
                          : current
                      )
                    }}
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : accountDialog.users.length === 0 ? (
              <p>No suspended Hospital Admin or Hospital Staff accounts are awaiting manual activation.</p>
            ) : (
              <ul className="lifecycle-history-list">
                {accountDialog.users.map((account) => (
                  <li key={account.id}>
                    <div className="lifecycle-history-heading">
                      <strong>{account.name}</strong>
                      <span className={`hospital-status ${account.status}`}>
                        {formatStatus(account.status)}
                      </span>
                    </div>
                    <p>
                      {account.email}
                      {' · '}
                      {formatStatus(account.role)}
                    </p>
                    <div className="profile-form-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => selectAccountForActivation(account)}
                      >
                        Activate account
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="profile-form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={closeAccountManagement}
                disabled={accountDialog.busy}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
      {lifecycleDialog?.type === 'history' && (
        <div className="lifecycle-dialog-backdrop">
          <section ref={historyDialogRef} tabIndex={-1} className="lifecycle-dialog lifecycle-history-dialog" role="dialog" aria-modal="true" aria-labelledby="hospital-history-title">
            <h2 id="hospital-history-title">{lifecycleDialog.hospital.name} decision history</h2>
            {lifecycleDialog.loading ? (
              <p role="status">Loading decision history…</p>
            ) : lifecycleError ? (
              <div className="hospital-feedback error" role="alert">{lifecycleError}</div>
            ) : lifecycleDialog.events.length === 0 ? (
              <p>No lifecycle history is recorded for this hospital.</p>
            ) : (
              <ol className="lifecycle-history-list">
                {lifecycleDialog.events.map((event) => (
                  <li key={event.id}>
                    <div className="lifecycle-history-heading">
                      <strong>{formatStatus(event.action)}</strong>
                      <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                    </div>
                    <p>
                      {event.previous_status ? `${formatStatus(event.previous_status)} → ` : ''}
                      {formatStatus(event.new_status)}
                      {' · '}
                      {event.actor?.name || (event.actor_id ? 'Former administrator' : 'System')}
                    </p>
                    {event.reason && <blockquote>{event.reason}</blockquote>}
                  </li>
                ))}
              </ol>
            )}
            <div className="profile-form-actions">
              <button type="button" className="secondary-button" onClick={() => {
                setLifecycleDialog(null)
                setLifecycleError('')
              }}>Close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default Hospitals
