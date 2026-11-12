import { Link } from 'react-router-dom'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'

export default function AdminSettings() {
  const { language, setLanguage, t } = useLocale()

  return (
    <div className="sa-admin-page">
      <header className="sa-users-heading">
        <div>
          <span className="sa-eyebrow">{t('ADMINISTRATION')}</span>
          <h1>{t('System Settings')}</h1>
          <p>{t('Manage workspace language and administrator account security.')}</p>
        </div>
      </header>

      <section className="sa-settings-grid">
        <article className="sa-card sa-settings-card">
          <span className="sa-settings-icon"><Icon name="globe" size={21} /></span>
          <h2>{t('Language and display')}</h2>
          <p>{t('Choose the language used across your DANNA workspace.')}</p>
          <label className="sa-settings-field" htmlFor="admin-language">
            <span>{t('Workspace language')}</span>
            <select
              id="admin-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
        </article>

        <article className="sa-card sa-settings-card">
          <span className="sa-settings-icon"><Icon name="shield" size={21} /></span>
          <h2>{t('Account security')}</h2>
          <p>{t('Manage your administrator profile and update your password.')}</p>
          <div className="sa-settings-links">
            <Link to="/profile"><Icon name="user" size={16} />{t('Profile')}</Link>
            <Link to="/change-password"><Icon name="shield" size={16} />{t('Change Password')}</Link>
          </div>
        </article>
      </section>
      <p className="sa-settings-note">{t('Language preference is saved in this browser. Account security changes apply to your signed-in account.')}</p>
    </div>
  )
}
