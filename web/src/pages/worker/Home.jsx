import { LocalizedText, localizedContent } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, typeIcon, when } from '../../format.js';
import { useLanguage } from '../../i18n.jsx';
import marketReviews from '../../data/market-research-reviews.json';

const TYPE_META = {
  intent: { label: 'Rate AI responses', blurb: 'Rate the quality and helpfulness of AI-generated responses.', color: 'blue', mins: 5 },
  image: { label: 'Image labeling', blurb: 'Label objects and scenes in images for AI models.', color: 'green', mins: 6 },
  text: { label: 'Text classification', blurb: 'Categorize text into the correct labels.', color: 'purple', mins: 4 },
};

const STATUS = {
  pending: 'In review',
  released: 'Approved',
  voided: 'Rejected',
};

export default function WorkerHome({ session }) {
  const { t: trText, language } = useLanguage();
  const [hub, setHub] = useState(null);
  const [error, setError] = useState('');
  const [gate, setGate] = useState('');
  const s = session || { user: {}, account: {}, stats: {} };

  useEffect(() => {
    api('/api/hub')
      .then(setHub)
      .catch((err) => setError(err.message));
  }, []);

  const accuracy = s.stats.accuracy ?? 0;
  const tierName = s.user.tier_name || hub?.tier_name || 'Bronze';
  const tier = s.user.tier || hub?.tier || 1;

  return (
    <div className="page dash tm-dash">
      <header className="dash-head">
        <h1><LocalizedText source={"AI Trainer Dashboard"} /></h1>
        <p><LocalizedText source={"Help build smarter AI. Complete tasks, improve models, and earn."} /></p>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="dash-kpis">
        <div className="dash-kpi">
          <div>
            <div className="meta"><LocalizedText source={"Available earnings"} /></div>
            <div className="dash-kpi-n">{money(s.account.balance)}</div>
            <div className="meta">
              {Number(s.account.pending) > 0 ? `Pending ${money(s.account.pending)}` : (<LocalizedText source={"Withdraw anytime"} />)}
            </div>
          </div>
        </div>
        <div className="dash-kpi">
          <div>
            <div className="meta"><LocalizedText source={"This week"} /></div>
            <div className="dash-kpi-n">{money(s.stats.week_earned)}</div>
            <div className="meta">{s.stats.tasks_done ?? 0}{' '}<LocalizedText source={"tasks completed"} /></div>
          </div>
        </div>
        <div className="dash-kpi">
          <div>
            <div className="meta"><LocalizedText source={"Total earned"} /></div>
            <div className="dash-kpi-n">{money(s.stats.total_earned)}</div>
            <div className="meta"><LocalizedText source={"All time"} /></div>
          </div>
        </div>
        <div className="dash-kpi">
          <div>
            <div className="meta"><LocalizedText source={"Quality score"} /></div>
            <div className="dash-kpi-n">{accuracy}%</div>
            <div className="meta">{accuracy >= 90 ? (<LocalizedText source={"Excellent work!"} />) : (<LocalizedText source={"Keep going"} />)}</div>
          </div>
          <span className="dash-ring" style={{ '--pct': `${accuracy}` }} />
        </div>
      </div>

      <div className="dash-grid">
        <div>
          <div className="section-h">
            <div>
              <h2><LocalizedText source={"Available Tasks"} /></h2>
              <p className="meta"><LocalizedText source={"Choose a task type and start earning"} /></p>
            </div>
            <Link to="/tasks" className="tm-viewall"><LocalizedText source={"View all tasks →"} /></Link>
          </div>
          <div className="dash-types">
            {['intent', 'image', 'text'].map((type) => {
              const meta = TYPE_META[type];
              const taskType = (hub?.types || []).find((x) => x.type === type);
              const locked = (type === 'text' || type === 'intent') && tier < 3;
              return (
                <div key={type} className={`dash-type ${meta.color}`}>
                  <span className="dash-type-ico">{typeIcon(type)}</span>
                  <h3>{trText(meta.label, meta.label)}</h3>
                  <p className="meta">{trText(meta.blurb, meta.blurb)}</p>
                  <div className="dash-type-pay">
                    <b>{taskType ? money(taskType.pay_dollars) : '—'}</b>
                    <span className="meta">{taskType ? `~${taskType.est_minutes || meta.mins} min` : (<LocalizedText source={"None open"} />)}</span>
                  </div>
                  {locked ? (
                    <button type="button" className="dash-type-btn" onClick={() => setGate(meta.label)}><LocalizedText source={"Start Task"} /></button>
                  ) : taskType ? (
                    <Link className="dash-type-btn" to={`/tasks/${taskType.id}`}><LocalizedText source={"Start Task"} /></Link>
                  ) : (
                    <span className="dash-type-btn off"><LocalizedText source={"Caught up"} /></span>
                  )}
                </div>
              );
            })}
          </div>

          <section className="client-testimonials" aria-labelledby="client-testimonials-title">
            <div className="client-testimonials-heading">
              <div>
                <p className="client-testimonials-eyebrow">Trusted by our community</p>
                <h2 id="client-testimonials-title">Real users. Real results.</h2>
              </div>
              <span className="client-testimonials-rating">{marketReviews.length} customer reviews</span>
            </div>
            {[marketReviews, [...marketReviews].reverse()].map((reviews, row) => (
              <div className="client-testimonial-marquee" key={row} aria-label={`Customer review marquee ${row + 1}`}>
                <div className={`client-testimonial-track${row ? ' reverse' : ''}`}>
                  {[...reviews, ...reviews].map((review, index) => (
                    <article className="client-testimonial" key={`${row}-${review.id}-${index}`} aria-hidden={index >= reviews.length}>
                      <div className="client-testimonial-stars" aria-label={`${review.rating} out of 5 stars`}>
                        {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} <span>{review.rating} / 5</span>
                      </div>
                      <blockquote>“{review.full}”</blockquote>
                      <div className="client-testimonial-person"><b>{review.reviewer}</b><span>{review.date}</span></div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <div className="section-h">
            <h2><LocalizedText source={"Recent activity"} /></h2>
          </div>
          <div className="card dash-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th><LocalizedText source={"Task"} /></th>
                  <th>ID</th>
                  <th><LocalizedText source={"Date"} /></th>
                  <th><LocalizedText source={"Payment"} /></th>
                  <th><LocalizedText source={"Status"} /></th>
                </tr>
              </thead>
              <tbody>
                {(hub?.activity || []).map((r) => (
                  <tr key={r.id}>
                    <td>{localizedContent(r.title, r.translations, language, 'title')}</td>
                    <td className="meta">T-{r.id}</td>
                    <td className="meta">{when(r.submitted_at)}</td>
                    <td className="money">{money(r.pay_dollars)}</td>
                    <td><span className={`pill ${r.payout_status}`}>{STATUS[r.payout_status] ? trText(STATUS[r.payout_status], STATUS[r.payout_status]) : r.payout_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hub && !hub.activity.length ? <p className="meta"><LocalizedText source={"No submissions yet."} /></p> : null}
          </div>
        </div>

        <aside className="dash-rail">
          <div className="card tm-train">
            <h3><LocalizedText source={"Skills Center"} /></h3>
            <p className="meta"><LocalizedText source={"Complete more work to unlock higher-paying tasks and improve your quality score."} /></p>
            <div className="dash-bar"><span style={{ width: `${(tier / 4) * 100}%` }} /></div>
            <p className="meta">{tier}{' '}<LocalizedText source={"/ 4 modules ·"} />{' '}{tierName}</p>
            <Link className="dash-type-btn blue-btn" to="/profile"><LocalizedText source={"View your skills"} /></Link>
          </div>
          <div className="card">
            <h3><LocalizedText source={"Why your work matters"} /></h3>
            <ul className="dash-list">
              <li><LocalizedText source={"Improve AI accuracy"} /></li>
              <li><LocalizedText source={"Help build reliable models"} /></li>
              <li><LocalizedText source={"Work from anywhere"} /></li>
              <li><LocalizedText source={"Get paid fairly"} /></li>
            </ul>
            <Link to="/account"><LocalizedText source={"Learn more →"} /></Link>
          </div>
        </aside>
      </div>
      {gate ? (
        <div className="gate-back" role="presentation" onClick={() => setGate('')}>
          <div className="gate-dialog" role="dialog" aria-modal="true" aria-labelledby="gate-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="gate-title">{gate}</h2>
            <p><LocalizedText source={"This is only available on Gold and Platinum."} /></p>
            <button type="button" className="primary" onClick={() => setGate('')}>OK</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
