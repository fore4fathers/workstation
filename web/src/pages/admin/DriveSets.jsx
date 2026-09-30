import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';

export default function AdminDriveSets() {
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [sets, setSets] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [bestMatchRate, setBestMatchRate] = useState('0.50');
  const [alternativeRate, setAlternativeRate] = useState('0.25');
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
          total_items: 20,
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
        <h2>Label Sets</h2>
        <p className="meta">Assign image sets. The seeded demo image task now uses the imported Civitai images and their stored prompts.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <h3>Assign New Set</h3>
        <div className="row">
          <div>
            <label>Worker</label>
            <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
              <option value="">Select worker...</option>
              {(workers || []).map((w) => (
                <option key={w.id} value={w.id}>{w.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Task (Image Type)</label>
            <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
              <option value="">Select task...</option>
              {(tasks || []).filter((t) => t.type === 'image').map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Most accurate match reward ($)</label>
            <input type="number" min="0" step="0.01" value={bestMatchRate} onChange={(e) => setBestMatchRate(e.target.value)} />
          </div>
          <div>
            <label>Alternative useful match reward ($)</label>
            <input type="number" min="0" step="0.01" value={alternativeRate} onChange={(e) => setAlternativeRate(e.target.value)} />
          </div>
          <div>
        <label>Other-language response reward ($, matches closest reward)</label>
        <input type="number" value={bestMatchRate} readOnly aria-readonly="true" />
          </div>
          <p className="meta">Every submitted response earns its configured reward. The closest caption earns the highest rate.</p>
        </div>
        <button
          className="primary small"
          disabled={busy || !selectedWorker || !selectedTask}
          onClick={assignSet}
        >
          {busy ? 'Assigning...' : 'Assign 20-Image Set'}
        </button>
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <h3>Assigned Label Sets</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Task</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Most accurate</th>
              <th>Alternative</th>
              <th>Other language</th>
              <th>Commission earned</th>
              <th>Rewards (closest / alternative / other language)</th>
              <th>Assigned</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(sets || []).filter((s) => s.status !== 'cancelled').map((s) => {
              const w = (workers || []).find((x) => x.id === s.user_id);
              const t = (tasks || []).find((x) => x.id === s.task_id);
              return (
                <tr key={s.id}>
                  <td>{w ? w.display_name : s.user_id}</td>
                  <td>{t ? t.title : s.task_id}</td>
                  <td><span className={`pill ${s.status}`}>{s.status}</span></td>
                  <td>{s.answered_count || 0} / {s.total_items} answered</td>
                  <td>{s.best_match_count || 0}</td>
                  <td>{s.alternative_match_count || 0}</td>
                  <td>{s.foreign_language_count || 0}</td>
                  <td className="money">{money(Number(s.total_commission || 0) / 100)}</td>
                  <td>{money(Number(s.commission_cents ?? 50) / 100)} / {money(Number(s.alternative_commission_cents ?? 25) / 100)} / {money(Number(s.foreign_commission_cents ?? s.commission_cents ?? 50) / 100)}</td>
                  <td>{new Date(s.assigned_at).toLocaleString()}</td>
                  <td>{s.status === 'active' ? (
                    <button className="ghost small" disabled={busy} onClick={() => unassignSet(s.id)}>Unassign</button>
                  ) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!(sets || []).some((s) => s.status !== 'cancelled') ? <p className="meta">No label sets assigned yet.</p> : null}
      </div>
    </>
  );
}
