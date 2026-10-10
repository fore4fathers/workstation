import { Link } from 'react-router-dom';
import { LanguageToggle, useLanguage } from '../i18n.jsx';

export default function AuthLayout({ children, title, subtitle }) {
  const { t: trText } = useLanguage();
  const { t } = useLanguage();
  const titleKey = title === 'Sign in' ? 'auth.signIn' : '';
  const subtitleKey = subtitle === 'Use your work email.' ? 'auth.signInSubtitle' : '';
  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-visual-brand">
          <Link to="/" aria-label={trText("EngageSphere home")}>
            <img src="/engagesphere-logo.png" alt="EngageSphere" className="auth-logo" />
          </Link>
        </div>
        <div className="auth-visual-copy">
          <span className="auth-kicker">{t('auth.contributorWorkspace')}</span>
          <h2>{t('auth.brandHeadline')}</h2>
          <p>{t('auth.brandDescription')}</p>
        </div>
      </div>
      <div className="auth-form-col">
        <div className="auth-card-top">
          <Link to="/" className="auth-home" aria-label={trText("EngageSphere home")}>
            <img src="/engagesphere-logo.png" alt="EngageSphere" className="auth-form-logo" />
          </Link>
          <LanguageToggle />
        </div>
        {title ? <h1 className="auth-title">{titleKey ? t(titleKey) : title}</h1> : null}
        {subtitle ? <p className="meta auth-sub">{subtitleKey ? t(subtitleKey) : subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
