import { Link } from 'react-router-dom'
import { useLocale } from '../i18n'
import Icon from '../components/Icon'

export default function AdminAbout() {
  const { t } = useLocale()
  const capabilities = [
    {
      icon: 'clipboard',
      title: 'Structured hospital onboarding',
      description: 'Registration details move through an explicit review and decision process.',
      link: '/hospital-requests',
      linkLabel: 'Review registrations',
    },
    {
      icon: 'building',
      title: 'Connected hospital operations',
      description: 'Hospital teams maintain their facility profile, incubators, equipment, services, and staff.',
      link: '/hospitals',
      linkLabel: 'Explore hospitals',
    },
    {
      icon: 'fileCheck',
      title: 'Traceable data review',
      description: 'Submitted facility information can be reviewed, approved, or returned with requested changes.',
      link: '/data-reviews',
      linkLabel: 'Open data review',
    },
  ]

  const workflow = [
    ['01', 'Registration', 'Hospitals submit their profile for administrative review.'],
    ['02', 'Decision', 'The Super Admin approves a registration or records a rejection reason.'],
    ['03', 'Operations', 'Approved hospital teams maintain their own facility records and staff accounts.'],
    ['04', 'Data review', 'Submissions are sent for review and receive a recorded decision or feedback.'],
  ]

  return (
    <div className="sa-admin-page">
      <header className="sa-users-heading">
        <div>
          <span className="sa-eyebrow">{t('DANNA HEALTHCARE PLATFORM')}</span>
          <h1>{t('About DANNA')}</h1>
          <p>{t('Better Care. Brighter Futures.')}</p>
        </div>
      </header>

      <section className="sa-card sa-about-hero">
        <div className="sa-about-hero-copy">
          <span className="sa-eyebrow">{t('A connected workspace for neonatal care')}</span>
          <h2>{t('One clear process for hospital information and review.')}</h2>
          <p>{t('DANNA brings hospital onboarding, facility records, staff access, and administrative review into one role-based workspace.')}</p>
        </div>
        <img src="/assets/hospital-building.jpg" alt={t('Modern hospital building')} />
      </section>

      <section className="sa-about-capabilities" aria-label={t('What DANNA brings together')}>
        {capabilities.map((capability) => (
          <article className="sa-card sa-about-capability" key={capability.title}>
            <span className="sa-about-capability-icon"><Icon name={capability.icon} size={20} /></span>
            <h2>{t(capability.title)}</h2>
            <p>{t(capability.description)}</p>
            <Link to={capability.link}>
              {t(capability.linkLabel)}
              <Icon name="arrowRight" size={14} />
            </Link>
          </article>
        ))}
      </section>

      <section className="sa-card sa-about-workflow">
        <div className="sa-card-head">
          <div>
            <h2>{t('How the workspace works')}</h2>
            <p>{t('A shared workflow with clear responsibilities for each account.')}</p>
          </div>
        </div>
        <ol>
          {workflow.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <h3>{t(title)}</h3>
                <p>{t(description)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sa-about-footer">
        <div>
          <span className="sa-eyebrow">{t('DANNA')}</span>
          <h2>{t('Better Care. Brighter Futures.')}</h2>
          <p>{t('Explore the tools available to you as a Super Admin.')}</p>
        </div>
        <Link className="sa-primary-button" to="/reports">
          {t('View network reports')}
          <Icon name="arrowRight" size={15} />
        </Link>
      </section>
    </div>
  )
}
