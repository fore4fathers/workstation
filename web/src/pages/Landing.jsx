import { Link } from 'react-router-dom';
import { LanguageToggle, useLanguage } from '../i18n.jsx';

export default function Landing() {
  const { t, language } = useLanguage();
  return (
    <div className="landing tm-landing" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="landing-bar">
        <div className="landing-nav">
          <Link to="/" className="landing-brand" aria-label={t("EngageSphere home")}>
            <img src="/engagesphere-logo.png" alt="EngageSphere" className="landing-logo" />
          </Link>
          <nav className="landing-ctas" aria-label={t("Account")}>
            <LanguageToggle />
            <Link to="/sign-in" className="landing-signin">{t('landing.signIn')}</Link>
            <Link to="/register" className="primary small">{t('landing.createAccount')}</Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <img className="landing-hero-image" src="/back1.webp" alt="" aria-hidden="true" />
        <div className="landing-hero-shade" aria-hidden="true" />
        <div className="landing-copy">
          <p className="eyebrow">{t('landing.aiLabelingWork')}</p>
          <h1>{t('landing.headline')}</h1>
          <p>
            {t('landing.description')}
          </p>
          <div className="landing-ctas">
            <Link className="primary small" to="/register">{t('landing.createYourAccount')}</Link>
            <a className="landing-secondary-link" href="#how-it-works">{t('landing.seeHowItWorks')} <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>

      <section className="landing-steps" id="how-it-works">
        <h2>{t('landing.howItWorks')}</h2>
        <ol>
          <li><b>{t('landing.pickTask')}</b><span>{t('landing.pickTaskDetails')}</span></li>
          <li><b>{t('landing.labelItems')}</b><span>{t('landing.labelItemsDetails')}</span></li>
          <li><b>{t('landing.withdraw')}</b><span>{t('landing.withdrawDetails')}</span></li>
        </ol>
      </section>

      <footer className="tm-foot">
        <span>{t('nav.copyright')}</span>
        <span>{t('landing.footerSecurity')}</span>
      </footer>
    </div>
  );
}
