import { useAuth } from '../auth'
import { useLocale } from '../i18n'

export default function AdminProfile() {
  const { user } = useAuth()
  const { t } = useLocale()
  const accountStatus = {
    active: 'Active',
    suspended: 'Suspended',
    pending: 'Pending',
  }[user?.status] || 'Active'

  return (
    <div className="sa-users-page sa-account-profile">
      <header className="sa-users-heading">
        <div>
          <span className="sa-eyebrow">{t('ACCOUNT')}</span>
          <h1>{t('Profile')}</h1>
          <p>{t('View your Super Admin account details.')}</p>
        </div>
      </header>

      <section className="sa-card sa-account-profile-card" aria-labelledby="admin-profile-heading">
        <div className="sa-card-head">
          <div>
            <h2 id="admin-profile-heading">{t('Account details')}</h2>
            <p>{t('Super Admin')}</p>
          </div>
          <span className="sa-status-text teal">
            <i aria-hidden="true" />
            {t(accountStatus)}
          </span>
        </div>
        <dl>
          <div>
            <dt>{t('Name')}</dt>
            <dd>{user?.name || '—'}</dd>
          </div>
          <div>
            <dt>{t('Email')}</dt>
            <dd>{user?.email || '—'}</dd>
          </div>
          <div>
            <dt>{t('Role')}</dt>
            <dd>{t('Super Admin')}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
