import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money } from '../../format.js';

export default function AdminDriveSets() {
  const { t: trText } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [sets, setSets] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [bestMatchRate, setBestMatchRate] = useState('0.50');
  const [alternativeRate, setAlternativeRate] = useState('0.25');
  const [totalItems, setTotalItems] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [tData, wData, sData] = await Promise.all([
      api('/api/admin/tasks'),
      api('/api/admin/workers'),
      api('/api/admin/drive-sets'),
    ]);
    setTasks(tData.tasks || []);
    setWorkers(wData.workers || []);
    setSets(sData.drive_sets || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const timer = window.setInterval(() => {
      load().catch((e) => setError(e.message));
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function assignSet() {
    if (!selectedWorker || !selectedTask) {
      setError('Select a worker and a task');
      return;
    }
    if (Number(alternativeRate) > Number(bestMatchRate)) {
      setError('The closest-match reward must be at least as high as the alternative reward.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/drive-sets', {
        method: 'POST',
        body: {
          user_id: Number(selectedWorker),
          task_id: Number(selectedTask),
          total_items: Number(totalItems),
          commission_cents: Math.round(Number(bestMatchRate) * 100),
          alternative_commission_cents: Math.round(Number(alternativeRate) * 100),
          foreign_commission_cents: Math.round(Number(bestMatchRate) * 100),
        },
      });
      await load();
      setSelectedWorker('');
      setSelectedTask('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function unassignSet(setId) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/drive-sets/${setId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-h">
        <h2><LocalizedText source={"Label Sets"} /></h2>
        <div className="label-sets-heading-actions">
          <p className="meta"><LocalizedText source={"Assign image sets using imported Civitai images and their stored prompts."} /></p>
          <Link className="primary small" to="/tasks">Product tasks</Link>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <h3><LocalizedText source={"Assign New Set"} /></h3>
        <div className="row">
          <div>
            <label><LocalizedText source={"Worker"} /></label>
            <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
              <option value=""><LocalizedText source={"Select worker..."} /></option>
              {(workers || []).map((w) => (
                <option key={w.id} value={w.id}>{w.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label><LocalizedText source={"Task (Image Type)"} /></label>
            <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
              <option value=""><LocalizedText source={"Select task..."} /></option>
              {(tasks || []).filter((t) => t.type === 'image').map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label><LocalizedText source={"Most accurate match reward ($)"} /></label>
            <input type="number" min="0" step="0.01" value={bestMatchRate} onChange={(e) => setBestMatchRate(e.target.value)} />
          </div>
          <div>
            <label><LocalizedText source={"Alternative useful match reward ($)"} /></label>
            <input type="number" min="0" step="0.01" value={alternativeRate} onChange={(e) => setAlternativeRate(e.target.value)} />
          </div>
          <div>
            <label>Items in training set</label>
            <input type="number" min="1" step="1" required value={totalItems} onChange={(e) => setTotalItems(e.target.value)} />
            <small className="meta">Choose how many images to assign from the selected task.</small>
          </div>
          <div>
        <label><LocalizedText source={"Other-language response reward ($, matches closest reward)"} /></label>
        <input type="number" value={bestMatchRate} readOnly aria-readonly="true" />
          </div>
          <p className="meta"><LocalizedText source={"Every submitted response earns its configured reward. The closest caption earns the highest rate."} /></p>
        </div>
        <button
          className="primary small"
          disabled={busy || !selectedWorker || !selectedTask}
          onClick={assignSet}
        >
          {busy ? (<LocalizedText source={"Assigning..."} />) : (<LocalizedText source={"Assign 20-Image Set"} />)}
        </button>
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <h3><LocalizedText source={"Assigned Label Sets"} /></h3>
        <table className="table">
          <thead>
            <tr>
              <th><LocalizedText source={"Worker"} /></th>
              <th><LocalizedText source={"Task"} /></th>
              <th><LocalizedText source={"Status"} /></th>
              <th><LocalizedText source={"Progress"} /></th>
              <th><LocalizedText source={"Most accurate"} /></th>
              <th><LocalizedText source={"Alternative"} /></th>
              <th><LocalizedText source={"Other language"} /></th>
              <th><LocalizedText source={"Commission earned"} /></th>
              <th><LocalizedText source={"Rewards (closest / alternative / other language)"} /></th>
              <th><LocalizedText source={"Assigned"} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(sets || []).filter((s) => s.status !== 'cancelled').map((s) => {
              const w = (workers || []).find((x) => x.id === s.user_id);
              const task = (tasks || []).find((x) => x.id === s.task_id);
              return (
                <tr key={s.id}>
                  <td>{w ? w.display_name : s.user_id}</td>
                  <td>{task ? task.title : s.task_id}</td>
                  <td><span className={`pill ${s.status}`}>{trText(s.status, s.status)}</span></td>
                  <td>{s.answered_count || 0} / {s.total_items}{' '}<LocalizedText source={"answered"} /></td>
                  <td>{s.best_match_count || 0}</td>
                  <td>{s.alternative_match_count || 0}</td>
                  <td>{s.foreign_language_count || 0}</td>
                  <td className="money">{money(Number(s.total_commission || 0) / 100)}</td>
                  <td>{money(Number(s.commission_cents ?? 50) / 100)} / {money(Number(s.alternative_commission_cents ?? 25) / 100)} / {money(Number(s.foreign_commission_cents ?? s.commission_cents ?? 50) / 100)}</td>
                  <td>{new Date(s.assigned_at).toLocaleString()}</td>
                  <td>{s.status === 'active' ? (
                    <button className="ghost small" disabled={busy} onClick={() => unassignSet(s.id)}><LocalizedText source={"Unassign"} /></button>
                  ) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!(sets || []).some((s) => s.status !== 'cancelled') ? <p className="meta"><LocalizedText source={"No label sets assigned yet."} /></p> : null}
      </div>
    </>
  );
}
