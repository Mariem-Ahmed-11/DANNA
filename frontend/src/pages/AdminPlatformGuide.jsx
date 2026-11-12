import { Link } from 'react-router-dom'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'

const roles = [
  {
    icon: 'shield',
    title: 'Super Admin responsibilities',
    description: 'Review hospital applications, manage hospital access, decide on submitted data, and inspect recorded account and lifecycle changes.',
    links: [
      ['Registration Requests', '/hospital-requests'],
      ['Data Review', '/data-reviews'],
      ['Audit Logs', '/audit-logs'],
    ],
  },
  {
    icon: 'building',
    title: 'Hospital team responsibilities',
    description: 'Keep hospital profile details and facility records current, invite staff, and submit information for administrative review.',
    links: [
      ['Hospitals', '/hospitals'],
      ['Users', '/users'],
    ],
  },
]

const principles = [
  ['Clear ownership', 'Hospital teams maintain their own submitted facility information; administrative users review it.'],
  ['Visible decisions', 'Approval, rejection, suspension, and requested changes are presented as explicit statuses.'],
  ['Recorded changes', 'Hospital lifecycle and account-status actions appear in the audit history.'],
]

export default function AdminPlatformGuide() {
  const { t } = useLocale()

  return (
    <div className="sa-admin-page sa-platform-guide">
      <header className="sa-users-heading">
        <div>
          <span className="sa-eyebrow">{t('DANNA HEALTHCARE PLATFORM')}</span>
          <h1>{t('DANNA in practice')}</h1>
          <p>{t('A practical guide to responsibilities, decisions, and information flow across the platform.')}</p>
        </div>
      </header>

      <section className="sa-platform-guide-hero">
        <img
          alt={t('Neonatal care team coordinating hospital information')}
          src="/assets/hero-nicu.jpg"
        />
        <div>
          <span className="sa-eyebrow">{t('One workspace. Two account roles.')}</span>
          <h2>{t('Keep facility information connected to the people who maintain and review it.')}</h2>
          <p>{t('DANNA separates hospital record maintenance from administrative decisions while keeping each submission and status easy to follow.')}</p>
        </div>
      </section>

      <section className="sa-platform-role-grid" aria-label={t('Platform roles')}>
        {roles.map((role) => (
          <article className="sa-card sa-platform-role" key={role.title}>
            <span className="sa-about-capability-icon"><Icon name={role.icon} size={20} /></span>
            <h2>{t(role.title)}</h2>
            <p>{t(role.description)}</p>
            <div className="sa-platform-links">
              {role.links.map(([label, path]) => (
                <Link key={path} to={path}>
                  {t(label)}
                  <Icon name="arrowRight" size={14} />
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="sa-card sa-platform-principles">
        <div className="sa-card-head">
          <div>
            <h2>{t('How to use DANNA with confidence')}</h2>
            <p>{t('The platform is designed around clear ownership and traceable review decisions.')}</p>
          </div>
        </div>
        <div className="sa-platform-principle-list">
          {principles.map(([title, description], index) => (
            <article key={title}>
              <span>{`0${index + 1}`}</span>
              <div>
                <h3>{t(title)}</h3>
                <p>{t(description)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
