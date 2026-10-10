import { useLanguage } from '../../i18n.jsx';

export default function Training() {
  const { t } = useLanguage();

  return (
    <main className="page training-page">
      <header className="training-heading">
        <p className="training-kicker">{t('training.kicker')}</p>
        <h1>{t('training.title')}</h1>
        <p className="training-intro">{t('training.intro')}</p>
      </header>

      <figure className="training-hero-image">
        <img src="/back1.webp" alt={t('training.imageLabelingAlt')} />
        <figcaption>{t('training.imageLabelingCaption')}</figcaption>
      </figure>

      <article className="training-article">
        <section className="training-section">
          <div className="training-section-number">01</div>
          <div>
            <h2>{t('training.noiseTitle')}</h2>
            <p>{t('training.noiseIntro')}</p>
            <ul>
              <li><strong>{t('training.dataLabel')}</strong> {t('training.dataText')}</li>
              <li><strong>{t('training.reverseLabel')}</strong> {t('training.reverseText')}</li>
            </ul>
          </div>
        </section>

        <section className="training-section training-feedback-section">
          <div className="training-section-number">02</div>
          <div className="training-section-content">
            <h2>{t('training.feedbackTitle')}</h2>
            <p>{t('training.feedbackIntro')}</p>
            <ul>
              <li><strong>{t('training.experimentLabel')}</strong> {t('training.experimentText')}</li>
              <li><strong>{t('training.scoreLabel')}</strong> {t('training.scoreText')}</li>
              <li><strong>{t('training.adjustmentLabel')}</strong> {t('training.adjustmentText')}</li>
            </ul>
            <figure className="training-inline-image">
              <img src="/back2.webp" alt={t('training.humanFeedbackAlt')} loading="lazy" />
              <figcaption>{t('training.humanFeedbackCaption')}</figcaption>
            </figure>
          </div>
        </section>

        <section className="training-section">
          <div className="training-section-number">03</div>
          <div>
            <h2>{t('training.promptsTitle')}</h2>
            <p>{t('training.promptsIntro')}</p>
            <ul>
              <li>{t('training.promptPointOne')}</li>
              <li>{t('training.promptPointTwo')}</li>
            </ul>
          </div>
        </section>
      </article>
    </main>
  );
}
