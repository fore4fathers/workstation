import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { money, when } from '../../format.js';

export default function WorkerDriveSets({ session }) {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [activeSet, setActiveSet] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState({}); // image_index -> selected_option_index
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function load() {
    const data = await api('/api/worker/drive-sets');
    setSets(data.drive_sets || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function startSet(setId) {
    const setData = sets.find((s) => s.id === setId);
    if (!setData) return;

    // Load task items via task_items payload (existing DB format)
    const { rows } = await api('/api/admin/drive-sets'); // or direct DB via server
    // Use the drive set's assigned task to pull images
    const itemsData = await api(`/api/tasks/${setData.task_id}`);
    const taskItems = taskData.items || [];

    // Build the set with 4-option multiple choice per image
    const items = taskItems.slice(0, setData.total_items).map((item, idx) => {
      const payload = item.payload;
      const gold = payload?.gold || '';
      const labels = (payload?.labels || payload?.intents || []).slice();
      if (gold && !labels.includes(gold)) labels.push(gold);
      // Shuffle
      const shuffled = [...labels].sort(() => Math.random() - 0.5);
      const correctIdx = shuffled.indexOf(gold);
      return {
        item_id: item.id,
        sort_order: item.sort_order,
        image_url: payload?.image_url || payload?.text || payload?.utterance || '',
        gold,
        options: shuffled.slice(0, 4), // exactly 4 options
        correct_option_index: correctIdx >= 0 ? correctIdx : 0,
      };
    });

    setActiveSet({ ...setData, items });
    setCurrentIndex(0);
    setSelections({});
    setComplete(false);
  }

  function selectOption(optionIdx) {
    setSelections((prev) => ({ ...prev, [currentIndex]: optionIdx }));
  }

  async function submitAnswer() {
    const selected = selections[currentIndex];
    if (selected === undefined) {
      setError('Please select an option');
      return;
    }

    const item = activeSet.items[currentIndex];
    const isCorrect = selected === item.correct_option_index;

    setBusy(true);
    setError('');
    try {
      await api('/api/worker/drive-sets/answer', {
        method: 'POST',
        body: {
          drive_set_id: activeSet.id,
          image_index: currentIndex,
          selected_option_index: selected,
          task_id: activeSet.task_id,
        },
      });
      // Update local state for correct count
      setActiveSet((prev) => ({
        ...prev,
        correct_count: (prev.correct_count || 0) + (isCorrect ? 1 : 0),
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function nextImage() {
    if (currentIndex < activeSet.items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Mark set as completed
      try {
        await api(`/api/worker/drive-sets/${activeSet.id}/complete`, {
          method: 'POST',
        });
        setComplete(true);
        await load();
      } catch (e) {
        setError(e.message);
      }
    }
  }

  if (activeSet) {
    const item = activeSet.items[currentIndex];
    const progress = `${currentIndex + 1} / ${activeSet.items.length}`;
    const isCorrectSoFar = selections[currentIndex] === item.correct_option_index;

    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="section-h">
          <h2>{activeSet.title}</h2>
          <div className="meta">Image {progress} · {money((activeSet.commission_per_correct || 50) / 100)} per correct</div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img
            src={item.image_url}
            alt="task"
            style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }}
          />
        </div>

        <h3>What is in this image?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {item.options.map((opt, i) => (
            <button
              key={i}
              className={`option-btn ${selections[currentIndex] === i ? 'selected' : ''}`}
              onClick={() => selectOption(i)}
              disabled={busy}
            >
              {opt}
            </button>
          ))}
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="row-actions">
          {currentIndex > 0 ? (
            <button className="ghost" onClick={() => setCurrentIndex(currentIndex - 1)}>Back</button>
          ) : (
            <span />
          )}
          {!busy && selections[currentIndex] === undefined ? (
            <button className="primary" disabled>Submit</button>
          ) : !busy ? (
            <>
              {isCorrectSoFar ? (
                <span className="meta" style={{ color: 'green' }}>✓ Correct!</span>
              ) : selections[currentIndex] !== undefined ? (
                <span className="meta" style={{ color: 'red' }}>✗ Incorrect</span>
              ) : null}
              <button className="primary" onClick={submitAnswer}>Submit</button>
            </>
          ) : (
            <button className="primary" disabled>Submitting...</button>
          )}
        </div>

        {complete && <p className="meta" style={{ color: 'green' }}>Set completed! Commission added to balance.</p>}
      </div>
    );
  }

  return (
    <>
      <div className="section-h">
        <h2>My Drive Sets</h2>
        <p className="meta">Complete 20-image identification sets to earn commission.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Commission</th>
              <th>Assigned</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(sets || []).map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td><span className={`pill ${s.status}`}>{s.status}</span></td>
                <td>{s.correct_count || 0} / {s.total_items}</td>
                <td className="money">{money((s.TOTAL_COMMISSION || 0) / 100)}</td>
                <td>{when(s.assigned_at)}</td>
                <td>
                  {s.status === 'active' ? (
                    <button className="primary small" onClick={() => startSet(s.id)}>
                      {s.correct_count ? 'Continue' : 'Start'}
                    </button>
                  ) : (
                    <span className="meta">Completed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(sets || []).length ? <p className="meta">No drive sets assigned to you.</p> : null}
      </div>
    </>
  );
}