import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money, when } from '../../format.js';

export default function WorkerDriveSets() {
  const [sets, setSets] = useState([]);
  const [activeSet, setActiveSet] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [foreignMode, setForeignMode] = useState(false);
  const [foreignResponse, setForeignResponse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState('');

  useEffect(() => {
    if (!submissionNotice) return undefined;
    const timer = window.setTimeout(() => setSubmissionNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [submissionNotice]);

  async function load() {
    const data = await api('/api/worker/drive-sets');
    setSets(data.drive_sets || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function startSet(setId) {
    setError('');
    try {
      const data = await api(`/api/worker/drive-sets/${setId}/items`);
      const items = data.items || [];
      if (!items.length) throw new Error('This set has no image items.');
      setActiveSet({
        ...data.drive_set,
        title: data.drive_set.title,
        items,
        answered_count: Number(data.drive_set.answered_count || 0),
      });
      const firstUnanswered = items.findIndex((item) => item.selected_label == null);
      const index = firstUnanswered < 0 ? Math.max(0, items.length - 1) : firstUnanswered;
      setCurrentIndex(index);
      setImageLoading(true);
      setSelectedOption(null);
      setForeignMode(false);
      setForeignResponse('');
      setComplete(data.drive_set.status === 'completed');
    } catch (e) {
      setError(e.message);
    }
  }

  const item = activeSet?.items[currentIndex];
  const selectedLabel = item?.selected_label;
  const selectedOptionIndex = item?.options.indexOf(selectedLabel);

  async function submitAnswer() {
    if (!item || (foreignMode ? !foreignResponse.trim() : selectedOption == null)) return;
    const response = foreignMode ? foreignResponse.trim() : item.options[selectedOption];
    const submittedIndex = currentIndex;
    setBusy(true);
    setImageLoading(true);
    setError('');
    try {
      const result = await api('/api/worker/drive-sets/answer', {
        method: 'POST',
        body: {
          drive_set_id: activeSet.id,
          image_index: item.image_index,
          selected_label: response,
          response_type: foreignMode ? 'foreign_language' : 'caption_match',
        },
      });
      const updatedItems = activeSet.items.map((entry, index) => index === currentIndex
        ? { ...entry, selected_label: response, response_type: result.response_type, commission_cents: result.commission_cents }
        : entry);
      setActiveSet((prev) => ({
        ...prev,
        items: updatedItems,
        answered_count: result.answered_count,
        best_match_count: result.best_match_count,
        total_commission: result.total_commission,
      }));
      setSubmissionNotice(`Response saved · ${money(Number(result.commission_cents || 0) / 100)} added`);
      if (submittedIndex < activeSet.items.length - 1) {
        setCurrentIndex(submittedIndex + 1);
        setSelectedOption(null);
        setForeignMode(false);
        setForeignResponse('');
      } else {
        setImageLoading(false);
      }
      load().catch((e) => setError(e.message));
    } catch (e) {
      setImageLoading(false);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (currentIndex < activeSet.items.length - 1) {
      setImageLoading(true);
      setCurrentIndex((index) => index + 1);
      setSelectedOption(null);
      setForeignMode(false);
      setForeignResponse('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/worker/drive-sets/${activeSet.id}/complete`, { method: 'POST' });
      setComplete(true);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (activeSet && item) {
    const answeredCount = Number(activeSet.answered_count || 0);
    const hasAnswer = selectedLabel != null;
    const earned = Number(activeSet.total_commission || 0) / 100;
    return (
      <div className="card drive-trainer">
        <div className="section-h drive-trainer-header">
          <h2>{activeSet.title}</h2>
          <div className="drive-trainer-summary">
            <span>Image <b>{currentIndex + 1} of {activeSet.items.length}</b></span>
            <span>Progress <b>{answeredCount} answered</b></span>
            <span>Closest match <b>{money(Number(activeSet.commission_cents ?? 50) / 100)}</b></span>
            <span>Alternative <b>{money(Number(activeSet.alternative_commission_cents ?? 25) / 100)}</b></span>
            <span>Other language <b>{money(Number(activeSet.foreign_commission_cents ?? activeSet.commission_cents ?? 50) / 100)}</b></span>
            <span>Earned <b>{money(earned)}</b></span>
          </div>
        </div>
        {submissionNotice ? <p className="drive-submission-notice" role="status">{submissionNotice}</p> : null}
        <div className="drive-trainer-image-wrap">
          {imageLoading ? <div className="drive-image-loader" role="status" aria-live="polite">
            <span className="spinner" style={{ width: 32, height: 32 }} />
            <span>Loading image…</span>
          </div> : null}
          <img key={`${activeSet.id}:${item.image_index}`} className="drive-trainer-image" src={item.image_url}
            alt="Image labeling item" onLoad={() => setImageLoading(false)} onError={() => setImageLoading(false)} />
        </div>
        <h3>{activeSet.civitai_backed
          ? 'Which generation caption best matches this image?'
          : 'What is in this image?'}</h3>
        <p className="meta drive-trainer-hint">Every response earns a reward. The closest caption earns the highest rate; an answer in another language is accepted too.</p>
        <div className="drive-response-mode">
          <button type="button" className={foreignMode ? 'ghost' : 'primary'} disabled={busy || imageLoading || hasAnswer || complete}
            onClick={() => { setForeignMode(false); setForeignResponse(''); }}>Choose a caption</button>
          <button type="button" className={foreignMode ? 'primary' : 'ghost'} disabled={busy || imageLoading || hasAnswer || complete}
            onClick={() => { setForeignMode(true); setSelectedOption(null); }}>Respond in another language</button>
        </div>
        {hasAnswer && item.response_type === 'foreign_language' ? (
          <div className="drive-submitted-answer">{item.selected_label}</div>
        ) : foreignMode && !hasAnswer ? (
          <label className="drive-foreign-answer">
            Your response in another language
            <textarea value={foreignResponse} onChange={(e) => setForeignResponse(e.target.value)} rows={4}
              maxLength={4000} placeholder="Describe what you see in any language" disabled={busy || imageLoading || complete} />
          </label>
        ) : !foreignMode ? (
          <div className="drive-trainer-options">
            {item.options.map((option, index) => (
              <button key={option} type="button" title={option}
                className={`drive-caption-option ${((hasAnswer && index === selectedOptionIndex) || (!hasAnswer && selectedOption === index)) ? 'selected' : ''}`}
                onClick={() => setSelectedOption(index)} disabled={busy || imageLoading || hasAnswer || complete}>
                {activeSet.civitai_backed && option.length > 180 ? `${option.slice(0, 177)}…` : option}
              </button>
            ))}
          </div>
        ) : null}
        {hasAnswer && <p className="drive-response-feedback">
          {item.response_type === 'best_match' ? 'Closest caption' : item.response_type === 'foreign_language' ? 'Other-language response' : 'Alternative useful caption'}
          {' · '}{money(Number(item.commission_cents || 0) / 100)} reward earned
        </p>}
        {error ? <p className="error">{error}</p> : null}
        <div className={`row-actions${currentIndex === 0 ? ' single-action' : ''}`}>
          {currentIndex > 0 ? <button className="ghost" disabled={busy || imageLoading} onClick={() => {
            setImageLoading(true);
            setCurrentIndex((index) => index - 1);
            setSelectedOption(null);
            setForeignMode(false);
            setForeignResponse('');
          }}>Back</button> : null}
          {!hasAnswer && !complete ? (
            <button className="primary" disabled={busy || (foreignMode ? !foreignResponse.trim() : selectedOption == null)} onClick={submitAnswer}>
              {busy ? 'Submitting...' : 'Submit response'}
            </button>
          ) : currentIndex < activeSet.items.length - 1 ? (
            <button className="primary" disabled={busy} onClick={advance}>Next image</button>
          ) : complete ? (
            <button className="ghost" onClick={() => setActiveSet(null)}>Back to sets</button>
          ) : (
            <button className="primary" disabled={busy || answeredCount < activeSet.total_items} onClick={advance}>
              {busy ? 'Completing...' : 'Complete set'}
            </button>
          )}
        </div>
        {complete && <p className="meta" style={{ color: 'green' }}>Set completed. Commission earned: {money(earned)}.</p>}
      </div>
    );
  }

  return (
    <>
      <div className="section-h worker-label-set-heading">
        <h2>My Label Sets</h2>
        <p className="meta">Every response earns a reward. The closest match earns more, and other-language responses are accepted.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card worker-label-sets">
        <table className="table worker-label-set-table">
          <thead><tr><th>Task</th><th>Status</th><th>Progress</th><th>Commission earned</th><th>Assigned</th><th /></tr></thead>
          <tbody>
            {sets.map((set) => (
              <tr key={set.id}>
                <td data-label="Task">{set.title}</td>
                <td data-label="Status"><span className={`pill ${set.status}`}>{set.status}</span></td>
                <td data-label="Progress">{set.answered_count || 0} / {set.total_items} answered · {set.best_match_count || 0} closest</td>
                <td data-label="Commission earned" className="money">{money(Number(set.total_commission || 0) / 100)}</td>
                <td data-label="Assigned">{when(set.assigned_at)}</td>
                <td data-label="Action" className="worker-label-set-action">{set.status === 'active'
                  ? <button className="primary" onClick={() => startSet(set.id)}>{set.answered_count ? 'Continue' : 'Start'}</button>
                  : <span className="meta">Completed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sets.length && <p className="meta">No label sets assigned to you.</p>}
      </div>
    </>
  );
}
