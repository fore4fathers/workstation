import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, typeIcon, when } from '../../format.js';

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
        <h1>AI Trainer Dashboard</h1>
        <p>Help build smarter AI. Complete tasks, improve models, and earn.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="dash-kpis">
        <div className="dash-kpi">
          <div>
            <div className="meta">Available earnings</div>
            <div className="dash-kpi-n">{money(s.account.balance)}</div>
            <div className="meta">
              {Number(s.account.pending) > 0 ? `Pending ${money(s.account.pending)}` : 'Withdraw anytime'}
            </div>
          </div>
          <span className="dash-kpi-ico teal">$</span>
        </div>
        <div className="dash-kpi">
          <div>
            <div className="meta">This week</div>
            <div className="dash-kpi-n">{money(s.stats.week_earned)}</div>
            <div className="meta">{s.stats.tasks_done ?? 0} tasks completed</div>
          </div>
          <span className="dash-kpi-ico blue">~</span>
        </div>
        <div className="dash-kpi">
          <div>
            <div className="meta">Total earned</div>
            <div className="dash-kpi-n">{money(s.stats.total_earned)}</div>
            <div className="meta">All time</div>
          </div>
          <span className="dash-kpi-ico purple">=</span>
        </div>
        <div className="dash-kpi">
          <div>
            <div className="meta">Quality score</div>
            <div className="dash-kpi-n">{accuracy}%</div>
            <div className="meta">{accuracy >= 90 ? 'Excellent work!' : 'Keep going'}</div>
          </div>
          <span className="dash-ring" style={{ '--pct': `${accuracy}` }} />
        </div>
      </div>

      <div className="dash-grid">
        <div>
          <div className="section-h">
            <div>
              <h2>Available Tasks</h2>
              <p className="meta">Choose a task type and start earning</p>
            </div>
            <Link to="/tasks" className="tm-viewall">View all tasks →</Link>
          </div>
          <div className="dash-types">
            {['intent', 'image', 'text'].map((type) => {
              const meta = TYPE_META[type];
              const t = (hub?.types || []).find((x) => x.type === type);
              const locked = (type === 'text' || type === 'intent') && tier < 3;
              return (
                <div key={type} className={`dash-type ${meta.color}`}>
                  <span className="dash-type-ico">{typeIcon(type)}</span>
                  <h3>{meta.label}</h3>
                  <p className="meta">{meta.blurb}</p>
                  <div className="dash-type-pay">
                    <b>{t ? money(t.pay_dollars) : '—'}</b>
                    <span className="meta">{t ? `~${t.est_minutes || meta.mins} min` : 'None open'}</span>
                  </div>
                  {locked ? (
                    <button type="button" className="dash-type-btn" onClick={() => setGate(meta.label)}>Start Task</button>
                  ) : t ? (
                    <Link className="dash-type-btn" to={`/tasks/${t.id}`}>Start Task</Link>
                  ) : (
                    <span className="dash-type-btn off">Caught up</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="section-h">
            <h2>Recent activity</h2>
          </div>
          <div className="card dash-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(hub?.activity || []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td className="meta">T-{r.id}</td>
                    <td className="meta">{when(r.submitted_at)}</td>
                    <td className="money">{money(r.pay_dollars)}</td>
                    <td><span className={`pill ${r.payout_status}`}>{STATUS[r.payout_status] || r.payout_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hub && !hub.activity.length ? <p className="meta">No submissions yet.</p> : null}
          </div>
        </div>

        <aside className="dash-rail">
          <div className="card tm-train">
            <h3>Training Center</h3>
            <p className="meta">Complete training to unlock higher-paying tasks and boost your quality score.</p>
            <div className="dash-bar"><span style={{ width: `${(tier / 4) * 100}%` }} /></div>
            <p className="meta">{tier} / 4 modules · {tierName}</p>
            <Link className="dash-type-btn blue-btn" to="/profile">Continue Training</Link>
          </div>
          <div className="card">
            <h3>Why your work matters</h3>
            <ul className="dash-list">
              <li>Improve AI accuracy</li>
              <li>Help build reliable models</li>
              <li>Work from anywhere</li>
              <li>Get paid fairly</li>
            </ul>
            <Link to="/account">Learn more →</Link>
          </div>
        </aside>
      </div>
      {gate ? (
        <div className="gate-back" role="presentation" onClick={() => setGate('')}>
          <div className="gate-dialog" role="dialog" aria-modal="true" aria-labelledby="gate-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="gate-title">{gate}</h2>
            <p>This is only available on Gold and Platinum.</p>
            <button type="button" className="primary" onClick={() => setGate('')}>OK</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
