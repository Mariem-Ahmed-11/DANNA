import { useEffect, useState } from 'react'
import { apiRequest } from '../api'
import { useAuth } from '../auth'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

function displayStatus(status) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function HospitalStaff() {
  const { user } = useAuth()
  const { language, t } = useLocale()
  const canManageStaff = user?.role === 'hospital_admin'
  const [staff, setStaff] = useState([])
  const [invitations, setInvitations] = useState([])
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [workingId, setWorkingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadStaff() {
      try {
        const payload = await apiRequest('/api/hospital/staff', {
          signal: controller.signal,
        })
        if (!Array.isArray(payload.data?.staff) || !Array.isArray(payload.data?.invitations)) {
          throw new Error('The server returned an invalid staff list.')
        }
        setStaff(payload.data.staff)
        setInvitations(payload.data.invitations)
        setLoadError('')
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError(
            error.status === 403
              ? 'Your account does not have permission to manage hospital staff.'
              : error.message || 'Hospital staff could not be loaded.'
          )
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadStaff()
    return () => controller.abort()
  }, [reloadKey])

  function retry() {
    setIsLoading(true)
    setLoadError('')
    setReloadKey((current) => current + 1)
  }

  async function sendInvitation(event) {
    event.preventDefault()
    setIsSending(true)
    setActionError('')
    setFieldErrors({})
    setSuccess('')

    try {
      const payload = await apiRequest('/api/hospital/staff/invitations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
        }),
      })
      setSuccess(payload.message || 'Staff invitation sent.')
      setForm({ name: '', email: '' })
      setIsInviteOpen(false)
      setIsLoading(true)
      setReloadKey((current) => current + 1)
    } catch (error) {
      if (error.status === 422) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(error.errors || {}).map(([field, messages]) => [field, messages[0]])
          )
        )
        setActionError(error.message || 'Please correct the highlighted fields.')
      } else {
        setActionError(
          error.status === 503
            ? 'Invitation email is not configured. Contact the system administrator.'
            : error.message || 'The invitation could not be sent.'
        )
      }
    } finally {
      setIsSending(false)
    }
  }

  async function changeStatus(member, action) {
    const actionLabel = action === 'deactivate' ? 'deactivate' : 'reactivate'
    if (!window.confirm(t("Are you sure you want to {action} {name}'s account?", {
      action: t(actionLabel),
      name: member.name,
    }))) {
      return
    }

    setWorkingId(member.id)
    setActionError('')
    setSuccess('')
    try {
      const payload = await apiRequest(`/api/hospital/staff/${member.id}/${action}`, {
        method: 'POST',
      })
      setSuccess(payload.message)
      setIsLoading(true)
      setReloadKey((current) => current + 1)
    } catch (error) {
      setActionError(error.message || 'The staff account could not be updated.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <main className="main-content" id="hospital-staff-page">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Hospital workspace / Team</span>
          <h1>Hospital staff</h1>
          <p>{canManageStaff ? 'Invite and manage staff accounts for your hospital.' : 'View the staff accounts for your hospital.'}</p>
        </div>
        {canManageStaff && !isInviteOpen && (
          <button type="button" className="hospital-primary-action" onClick={() => setIsInviteOpen(true)}>
            <Icon name="plus" size={16} />
            {t('Invite staff')}
          </button>
        )}
      </header>

      {success && <div className="hospital-feedback success" role="status">{success}</div>}
      {actionError && <div className="hospital-feedback error" role="alert">{actionError}</div>}

      {canManageStaff && isInviteOpen && <section className="panel hospital-form-panel hospital-editor-panel">
        <div className="panel-heading">
          <div>
            <h2>Invite a staff member</h2>
            <p>The invitee will set their own password using a link that expires after 30 minutes.</p>
          </div>
        </div>
        <form className="hospital-form staff-invite-form" onSubmit={sendInvitation}>
          <label>
            Name *
            <input
              required
              maxLength={255}
              autoComplete="name"
              value={form.name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            {fieldErrors.name && <span className="hospital-field-error">{fieldErrors.name}</span>}
          </label>
          <label>
            Email *
            <input
              required
              type="email"
              maxLength={255}
              autoComplete="email"
              value={form.email}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
            {fieldErrors.email && <span className="hospital-field-error">{fieldErrors.email}</span>}
          </label>
          <button className="primary-button hospital-save-button" type="submit" disabled={isSending}>
            {isSending ? 'Sending…' : 'Send invitation'}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setIsInviteOpen(false)
              setFieldErrors({})
              setActionError('')
            }}
            disabled={isSending}
          >
            Cancel
          </button>
        </form>
      </section>}

      <section className="panel hospitals-directory staff-directory">
        <div className="directory-toolbar">
          <div>
            <h2>Staff accounts</h2>
            <p>{isLoading ? 'Loading staff…' : loadError ? 'Staff unavailable' : `${staff.length} staff accounts`}</p>
          </div>
          <button type="button" className="secondary-button" onClick={retry} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <div className="hospital-table-wrapper">
          <table className="hospital-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Account status</th>{canManageStaff && <th>Action</th>}</tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={canManageStaff ? 4 : 3} className="no-hospitals">Loading hospital staff…</td></tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={canManageStaff ? 4 : 3} className="no-hospitals" role="alert">
                    <p>{loadError}</p>
                    <button type="button" className="secondary-button" onClick={retry}>Retry</button>
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr><td colSpan={canManageStaff ? 4 : 3} className="no-hospitals">{canManageStaff ? 'No staff accounts yet. Send an invitation to get started.' : 'No staff accounts found.'}</td></tr>
              ) : staff.map((member) => (
                <tr key={member.id}>
                  <td data-label={t('Name')}><strong>{member.name}</strong></td>
                  <td data-label={t('Email')}>{member.email}</td>
                  <td data-label={t('Account status')}><span className={`staff-status staff-status-${member.status}`}>{displayStatus(member.status)}</span></td>
                  {canManageStaff && <td data-label={t('Action')}>
                    {['active', 'suspended'].includes(member.status) ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={workingId === member.id}
                        onClick={() => changeStatus(member, member.status === 'active' ? 'deactivate' : 'reactivate')}
                      >
                        {workingId === member.id
                          ? 'Saving…'
                          : member.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    ) : (
                      <span>Not manageable</span>
                    )}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManageStaff && <section className="panel hospitals-directory staff-directory">
        <div className="directory-toolbar">
          <div>
            <h2>Invitations</h2>
            <p>Invitation status and expiry for your hospital.</p>
          </div>
        </div>
        <div className="hospital-table-wrapper">
          <table className="hospital-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Status</th><th>Expires</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="4" className="no-hospitals">Loading invitations…</td></tr>
              ) : loadError ? (
                <tr><td colSpan="4" className="no-hospitals" role="alert">{loadError}</td></tr>
              ) : invitations.length === 0 ? (
                <tr><td colSpan="4" className="no-hospitals">No staff invitations have been sent.</td></tr>
              ) : invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td data-label={t('Name')}><strong>{invitation.name}</strong></td>
                  <td data-label={t('Email')}>{invitation.email}</td>
                  <td data-label={t('Status')}><span className={`staff-status staff-status-${invitation.status}`}>{displayStatus(invitation.status)}</span></td>
                  <td data-label={t('Expires')}>{invitation.status === 'accepted' ? 'Accepted' : new Date(invitation.expires_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>}
    </main>
  )
}

export default HospitalStaff
