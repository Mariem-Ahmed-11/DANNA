import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../api'
import { useDialogA11y } from '../useDialogA11y'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'
import '../App.css'

const statusNames = {
  active: 'Active',
  suspended: 'Deactivated',
  pending: 'Pending',
}

function AdminUsers() {
  const { t } = useLocale()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [success, setSuccess] = useState('')
  const [selected, setSelected] = useState(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  function closeDialog() {
    if (saving) return
    setSelected(null)
    setReason('')
    setReasonError('')
  }

  const dialogRef = useDialogA11y(Boolean(selected), closeDialog)

  useEffect(() => {
    const controller = new AbortController()

    apiRequest('/api/admin/users', { signal: controller.signal })
      .then((payload) => {
        if (!Array.isArray(payload.data)) {
          throw new Error('The server returned an invalid user list.')
        }
        setUsers(payload.data)
        setLoadError('')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setLoadError(error.message || 'Hospital users could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reloadKey])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) =>
      [user.name, user.email, user.role, user.hospital?.name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [search, users])
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize)

  async function activateUser(event) {
    event.preventDefault()
    if (!selected || saving) return

    const trimmedReason = reason.trim()
    if (trimmedReason.length < 10 || trimmedReason.length > 2000) {
      setReasonError(t('Provide a reason between 10 and 2000 characters.'))
      return
    }

    setSaving(true)
    setReasonError('')
    setActionError('')
    setSuccess('')
    try {
      const payload = await apiRequest(
        `/api/admin/hospitals/${selected.hospital_id}/users/${selected.id}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: trimmedReason }),
        }
      )
      setUsers((current) => current.map((user) => (
        user.id === payload.data.id ? { ...user, status: payload.data.status } : user
      )))
      setSuccess(t('User account activated.'))
      setSelected(null)
      setReason('')
    } catch (error) {
      const validationMessage = error.status === 422
        ? Object.values(error.errors || {}).flat()[0]
        : ''
      setReasonError(validationMessage || error.message || t('The account could not be activated.'))
    } finally {
      setSaving(false)
    }
  }

  function retry() {
    setLoading(true)
    setLoadError('')
    setReloadKey((current) => current + 1)
  }

  function statusTone(status) {
    if (status === 'active') return 'teal'
    if (status === 'pending') return 'amber'
    return 'rose'
  }

  function renderStatus(user) {
    const status = statusNames[user.status] || user.status
    return (
      <span className={`sa-status-text ${statusTone(user.status)}`}>
        <i aria-hidden="true" />
        {t(status)}
      </span>
    )
  }

  return (
    <div className="sa-users-page">
      <header className="sa-users-heading">
        <div className="sa-users-title">
          <span className="sa-users-title-icon" aria-hidden="true"><Icon name="users" size={21} /></span>
          <div>
            <span className="sa-eyebrow">{t('ADMINISTRATION')}</span>
            <h1>{t('Users')}</h1>
            <p>{t('View hospital users and manage their account activation status.')}</p>
          </div>
        </div>
        <label className="sa-users-search">
          <Icon name="search" size={18} />
          <span className="visually-hidden">{t('Search users')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder={t('Search by name, email, or hospital')}
          />
          {search && (
            <button
              aria-label={t('Clear search')}
              className="sa-users-search-clear"
              onClick={() => {
                setSearch('')
                setPage(1)
              }}
              type="button"
            >
              <Icon name="x" size={15} />
            </button>
          )}
        </label>
      </header>

      {success && <div className="sa-users-feedback is-success" role="status">{success}</div>}
      {actionError && <div className="sa-users-feedback" role="alert">{actionError}</div>}

      <section className="sa-card sa-table-card" aria-labelledby="hospital-users-heading">
        <div className="sa-card-head">
          <div>
            <h2 id="hospital-users-heading">{t('Hospital users')}</h2>
            <p>{t('Account status for users associated with registered hospitals.')}</p>
          </div>
          {!loading && !loadError && (
            <span className="sa-users-count">{t('{count} users', { count: filteredUsers.length })}</span>
          )}
        </div>

        {loadError ? (
          <div className="sa-users-state is-error" role="alert">
            <p>{t('Hospital users could not be loaded.')}</p>
            <button type="button" className="sa-secondary-button" onClick={retry}>{t('Retry')}</button>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table sa-users-table">
              <thead>
                <tr>
                  <th scope="col">{t('User')}</th>
                  <th scope="col">{t('Hospital')}</th>
                  <th scope="col">{t('Role')}</th>
                  <th scope="col">{t('Account status')}</th>
                  <th scope="col"><span className="visually-hidden">{t('Actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <tr className="sa-table-skeleton-row" key={`skeleton-${index}`} aria-hidden="true">
                      <td colSpan="5"><span className="sa-skeleton" /></td>
                    </tr>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="sa-table-empty">
                        <Icon name="users" size={27} />
                        <strong>{t(search ? 'No users match your search' : 'No hospital users found')}</strong>
                        <span>{t(search ? 'Try another search term.' : 'Hospital user accounts will appear here.')}</span>
                      </div>
                    </td>
                  </tr>
                ) : visibleUsers.map((user) => (
                  <tr key={user.id} className="sa-users-row">
                    <td data-label={t('User')}>
                      <span className="sa-users-identity">
                        <span className="sa-users-avatar" aria-hidden="true">
                          {user.name.trim().charAt(0).toLocaleUpperCase()}
                        </span>
                        <span className="sa-users-identity-copy">
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </span>
                      </span>
                    </td>
                    <td data-label={t('Hospital')}>
                      <span className="sa-users-hospital">
                        <Icon name="building" size={16} />
                        <span>{user.hospital?.name || '—'}</span>
                      </span>
                    </td>
                    <td data-label={t('Role')}>
                      <span className={`sa-user-role ${user.role === 'hospital_admin' ? 'is-admin' : ''}`}>
                        {t(user.role === 'hospital_admin' ? 'Hospital Admin' : 'Hospital Staff')}
                      </span>
                    </td>
                    <td data-label={t('Account status')}>{renderStatus(user)}</td>
                    <td data-label={t('Actions')}>
                      {user.status === 'suspended' && user.hospital?.status === 'approved' && (
                        <button
                          aria-label={t('Activate {name}', { name: user.name })}
                          className="sa-users-activate"
                          disabled={saving}
                          title={t('Activate')}
                          type="button"
                          onClick={() => {
                            setSelected(user)
                            setReason('')
                            setReasonError('')
                          }}
                        >
                          <Icon name="check" size={15} />
                          {t('Activate')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !loadError && pageCount > 1 && (
          <nav className="sa-pagination" aria-label={t('Users pagination')}>
            <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page === 1}>
              {t('Previous')}
            </button>
            <span>{t('Page {page} of {total}', { page, total: pageCount })}</span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page === pageCount}>
              {t('Next')}
            </button>
          </nav>
        )}
      </section>

      {selected && (
        <div className="lifecycle-dialog-backdrop">
          <section
            ref={dialogRef}
            tabIndex={-1}
            className="lifecycle-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activate-user-heading"
          >
            <h2 id="activate-user-heading">{t('Activate user account')}</h2>
            <p>{t('Activate {name} at {hospital}?', { name: selected.name, hospital: selected.hospital?.name || '' })}</p>
            <form onSubmit={activateUser}>
              <label htmlFor="activate-user-reason">{t('Reason for activation')}</label>
              <textarea
                id="activate-user-reason"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={reason}
                aria-invalid={Boolean(reasonError)}
                aria-describedby={reasonError ? 'activate-user-reason-error' : undefined}
                onChange={(event) => {
                  setReason(event.target.value)
                  setReasonError('')
                }}
              />
              {reasonError && <span className="hospital-field-error" id="activate-user-reason-error" role="alert">{reasonError}</span>}
              <div className="profile-form-actions">
                <button className="primary-button lifecycle-dialog-submit" type="submit" disabled={saving}>
                  {t(saving ? 'Activating…' : 'Activate')}
                </button>
                <button className="secondary-button" type="button" onClick={closeDialog} disabled={saving}>
                  {t('Cancel')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default AdminUsers
