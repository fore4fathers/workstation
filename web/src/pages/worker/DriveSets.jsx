import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { money, when } from '../../format.js';

export default function WorkerDriveSets() {
  const { t: trText } = useLanguage();
  const [sets, setSets] = useState([]);
  const [activeSet, setActiveSet] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bundleIndex, setBundleIndex] = useState(0);
  const [showBundleNotice, setShowBundleNotice] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [foreignMode, setForeignMode] = useState(false);
  const [foreignResponse, setForeignResponse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState('');
  const activeSetRef = useRef(null);
  const currentIndexRef = useRef(0);

  useEffect(() => { activeSetRef.current = activeSet; }, [activeSet]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

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

  useEffect(() => {
    if (!activeSet?.id || activeSet.status !== 'active') return undefined;
    const setId = activeSet.id;
    const timer = window.setInterval(async () => {
      try {
        const latest = await api(`/api/worker/drive-sets/${setId}/items`);
        if (activeSetRef.current?.id !== setId) return;
        const previousItemId = activeSetRef.current.items[currentIndexRef.current]?.drive_set_item_id;
        const latestItems = latest.items || [];
        setActiveSet((prev) => prev?.id === setId ? { ...prev, ...latest.drive_set, items: latestItems } : prev);
        const nextIndex = latestItems.findIndex((entry) => entry.drive_set_item_id === previousItemId);
        if (nextIndex >= 0) setCurrentIndex(nextIndex);
      } catch {
        // Keep the loaded item available while the progress refresh retries.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeSet?.id, activeSet?.status]);

  useEffect(() => {
    if (!activeSet?.id || !activeSet.items?.some((entry) => entry.is_bundle)) return;
    const noticeKey = `drive_bundle_notice_${activeSet.id}`;
    if (localStorage.getItem(noticeKey) !== 'seen') setShowBundleNotice(true);
  }, [activeSet?.id, activeSet?.items]);

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
      const firstUnanswered = items.findIndex((item) => (item.components || []).some((component) => component.selected_label == null));
      const index = firstUnanswered < 0 ? Math.max(0, items.length - 1) : firstUnanswered;
      setCurrentIndex(index);
      const pendingComponent = items[index]?.components?.findIndex((component) => component.selected_label == null) ?? 0;
      setBundleIndex(Math.max(0, pendingComponent));
      setImageLoading(true);
      setSelectedOption(null);
      setForeignMode(false);
      setForeignResponse('');
      setComplete(data.drive_set.status === 'completed');
      const hasBundle = items.some((entry) => entry.is_bundle);
      const noticeKey = `drive_bundle_notice_${setId}`;
      setShowBundleNotice(hasBundle && localStorage.getItem(noticeKey) !== 'seen');
    } catch (e) {
      setError(e.message);
    }
  }

  const item = activeSet?.items[currentIndex];
  const component = item?.components?.[bundleIndex] || item;
  const selectedLabel = component?.selected_label;
  const selectedOptionIndex = component?.options?.indexOf(selectedLabel);
  const hasNextBundleProduct = Boolean(item?.is_bundle && bundleIndex < (item.components?.length || 1) - 1);

  async function submitAnswer() {
    if (!item || (foreignMode ? !foreignResponse.trim() : selectedOption == null)) return;
    const response = foreignMode ? foreignResponse.trim() : component.options[selectedOption];
    const submittedIndex = currentIndex;
    setBusy(true);
    setImageLoading(true);
    setError('');
    try {
      const result = await api('/api/worker/drive-sets/answer', {
        method: 'POST',
        body: {
          drive_set_id: activeSet.id,
          drive_set_item_id: item.drive_set_item_id,
          image_index: item.image_index,
          component_index: component.component_index ?? bundleIndex,
          selected_label: response,
          response_type: foreignMode ? 'foreign_language' : 'caption_match',
        },
      });
      const updatedItems = activeSet.items.map((entry) => entry.drive_set_item_id === item.drive_set_item_id
        ? {
          ...entry,
          components: (entry.components || []).map((part, index) => index === (component.component_index ?? bundleIndex)
            ? { ...part, selected_label: response, response_type: result.response_type, commission_cents: result.commission_cents }
            : part),
          selected_label: (entry.components || []).every((part, index) => index === (component.component_index ?? bundleIndex) || part.selected_label != null)
            ? response : null,
          commission_cents: Number(entry.commission_cents || 0) + Number(result.commission_cents || 0),
        }
        : entry);
      setActiveSet((prev) => ({
        ...prev,
        items: updatedItems,
        answered_count: result.answered_count,
        best_match_count: result.best_match_count,
        total_commission: result.total_commission,
      }));
      setSubmissionNotice(`Response saved · ${money(Number(result.commission_cents || 0) / 100)} added`);
      const componentCount = item.components?.length || 1;
      if ((component.component_index ?? bundleIndex) < componentCount - 1) {
        setBundleIndex((index) => index + 1);
        setSelectedOption(null);
        setForeignMode(false);
        setForeignResponse('');
      } else if (submittedIndex < activeSet.items.length - 1) {
        setCurrentIndex(submittedIndex + 1);
        setBundleIndex(0);
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
    const componentCount = item?.components?.length || 1;
    if (bundleIndex < componentCount - 1) {
      setImageLoading(true);
      setBundleIndex((index) => index + 1);
      setSelectedOption(null);
      setForeignMode(false);
      setForeignResponse('');
      return;
    }
    if (currentIndex < activeSet.items.length - 1) {
      setImageLoading(true);
      setCurrentIndex((index) => index + 1);
      setBundleIndex(0);
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
    const productSteps = item.components || [];
    const isBundleSet = activeSet.items.some((entry) => entry.is_bundle);
    const bundleShowcaseItem = activeSet.items.find((entry) => entry.is_bundle);
    const bundleShowcase = bundleShowcaseItem?.merge_products || [];
    return (
      <div className="card drive-trainer">
        <div className="section-h drive-trainer-header">
          <h2>{activeSet.title}</h2>
          {isBundleSet ? <span className="bundle-set-badge">Bundle Set</span> : null}
          <div className="drive-trainer-summary">
            <span><LocalizedText source={"Image"} />{' '}<b>{currentIndex + 1}{' '}<LocalizedText source={"of"} />{' '}{activeSet.items.length}</b></span>
            {item.is_bundle ? <span>Bundle product <b>{bundleIndex + 1} of {productSteps.length}</b></span> : null}
            <span><LocalizedText source={"Progress"} />{' '}<b>{answeredCount}{' '}<LocalizedText source={"answered"} /></b></span>
            <span><LocalizedText source={"Closest match"} />{' '}<b>{money(Number(activeSet.commission_cents ?? 50) / 100)}</b></span>
            <span><LocalizedText source={"Alternative"} />{' '}<b>{money(Number(activeSet.alternative_commission_cents ?? 25) / 100)}</b></span>
            <span><LocalizedText source={"Other language"} />{' '}<b>{money(Number(activeSet.foreign_commission_cents ?? activeSet.commission_cents ?? 50) / 100)}</b></span>
            <span><LocalizedText source={"Earned"} />{' '}<b>{money(earned)}</b></span>
          </div>
        </div>
        {submissionNotice ? <p className="drive-submission-notice" role="status">{submissionNotice}</p> : null}
        <div className="drive-trainer-image-wrap">
          {imageLoading ? <div className="drive-image-loader" role="status" aria-live="polite">
            <span className="spinner" style={{ width: 32, height: 32 }} />
            <span><LocalizedText source={"Loading image…"} /></span>
          </div> : null}
          <img key={`${activeSet.id}:${item.drive_set_item_id}:${bundleIndex}`} className="drive-trainer-image" src={component?.image_url || item.image_url}
            alt={component?.title || trText("Image labeling item")} onLoad={() => setImageLoading(false)} onError={() => setImageLoading(false)} />
        </div>
        <h3>{activeSet.civitai_backed
          ? (<LocalizedText source={"Which generation caption best matches this image?"} />)
          : (<LocalizedText source={"What is in this image?"} />)}</h3>
        <p className="meta drive-trainer-hint"><LocalizedText source={"Every response earns a reward. The closest caption earns the highest rate; an answer in another language is accepted too."} /></p>
        <div className="drive-response-mode">
          <button type="button" className={foreignMode ? 'ghost' : 'primary'} disabled={busy || imageLoading || hasAnswer || complete}
            onClick={() => { setForeignMode(false); setForeignResponse(''); }}><LocalizedText source={"Choose a caption"} /></button>
          <button type="button" className={foreignMode ? 'primary' : 'ghost'} disabled={busy || imageLoading || hasAnswer || complete}
            onClick={() => { setForeignMode(true); setSelectedOption(null); }}><LocalizedText source={"Respond in another language"} /></button>
        </div>
        {hasAnswer && component.response_type === 'foreign_language' ? (
          <div className="drive-submitted-answer">{component.selected_label}</div>
        ) : foreignMode && !hasAnswer ? (
          <label className="drive-foreign-answer"><LocalizedText source={"Your response in another language"} /><textarea value={foreignResponse} onChange={(e) => setForeignResponse(e.target.value)} rows={4}
              maxLength={4000} placeholder={trText("Describe what you see in any language")} disabled={busy || imageLoading || complete} />
          </label>
        ) : !foreignMode ? (
          <div className="drive-trainer-options">
            {(component?.options || item.options).map((option, index) => (
              <button key={option} type="button" title={option}
                className={`drive-caption-option ${((hasAnswer && index === selectedOptionIndex) || (!hasAnswer && selectedOption === index)) ? 'selected' : ''}`}
                onClick={() => setSelectedOption(index)} disabled={busy || imageLoading || hasAnswer || complete}>
                {activeSet.civitai_backed && option.length > 180 ? `${option.slice(0, 177)}…` : option}
              </button>
            ))}
          </div>
        ) : null}
        {hasAnswer && <p className="drive-response-feedback">
          {component.response_type === 'best_match' ? (<LocalizedText source={"Closest caption"} />) : component.response_type === 'foreign_language' ? (<LocalizedText source={"Other-language response"} />) : (<LocalizedText source={"Alternative useful caption"} />)}
          {' · '}{money(Number(component.commission_cents || 0) / 100)}{' '}<LocalizedText source={"reward earned"} /></p>}
        {error ? <p className="error">{error}</p> : null}
        <div className={`row-actions${currentIndex === 0 && bundleIndex === 0 ? ' single-action' : ''}`}>
          {currentIndex > 0 || bundleIndex > 0 ? <button className="ghost" disabled={busy || imageLoading} onClick={() => {
            setImageLoading(true);
            if (bundleIndex > 0) setBundleIndex((index) => index - 1);
            else {
              const previousIndex = currentIndex - 1;
              setCurrentIndex(previousIndex);
              const previousItem = activeSet.items[previousIndex];
              const lastComponent = Math.max(0, (previousItem?.components?.length || 1) - 1);
              setBundleIndex(lastComponent);
            }
            setSelectedOption(null);
            setForeignMode(false);
            setForeignResponse('');
          }}><LocalizedText source={"Back"} /></button> : null}
          {!hasAnswer && !complete ? (
            <button className="primary" disabled={busy || (foreignMode ? !foreignResponse.trim() : selectedOption == null)} onClick={submitAnswer}>
              {busy ? (<LocalizedText source={"Submitting..."} />) : (<LocalizedText source={"Submit response"} />)}
            </button>
          ) : hasNextBundleProduct ? (
            <button className="primary" disabled={busy} onClick={advance}>Next product</button>
          ) : currentIndex < activeSet.items.length - 1 ? (
            <button className="primary" disabled={busy} onClick={advance}><LocalizedText source={"Next image"} /></button>
          ) : complete ? (
            <button className="ghost" onClick={() => setActiveSet(null)}><LocalizedText source={"Back to sets"} /></button>
          ) : (
            <button className="primary" disabled={busy || answeredCount < activeSet.total_items} onClick={advance}>
              {busy ? (<LocalizedText source={"Completing..."} />) : (<LocalizedText source={"Complete set"} />)}
            </button>
          )}
        </div>
        {complete && <p className="meta" style={{ color: 'green' }}><LocalizedText source={"Set completed. Commission earned:"} />{' '}{money(earned)}.</p>}
        {showBundleNotice ? <div className="bundle-notice-backdrop" role="presentation">
          <section className="bundle-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="bundle-notice-title">
            <div className="bundle-notice-art">
              {bundleShowcase.slice(0, 2).map((product, index) => <img key={`${product.image_url}-${index}`} src={product.image_url} alt={product.title || `Bundle product ${index + 1}`} />)}
            </div>
            <span className="bundle-set-badge">Bundle Set opportunity</span>
            <h2 id="bundle-notice-title">Earn more from bundled products</h2>
            <p>Each bundle counts as one item in your set. Label both products as they appear to receive the extra bundle reward.</p>
            {bundleShowcaseItem?.bonus_cents ? <p className="bundle-notice-reward">Extra bundle reward: <b>{money(bundleShowcaseItem.bonus_cents / 100)}</b></p> : null}
            <button className="primary" type="button" onClick={() => {
              localStorage.setItem(`drive_bundle_notice_${activeSet.id}`, 'seen');
              setShowBundleNotice(false);
            }}>Continue</button>
          </section>
        </div> : null}
      </div>
    );
  }

  return (
    <>
      <div className="section-h worker-label-set-heading">
        <h2><LocalizedText source={"My Label Sets"} /></h2>
        <p className="meta"><LocalizedText source={"Every response earns a reward. The closest match earns more, and other-language responses are accepted."} /></p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card worker-label-sets">
        <table className="table worker-label-set-table">
          <thead><tr><th><LocalizedText source={"Task"} /></th><th><LocalizedText source={"Status"} /></th><th><LocalizedText source={"Progress"} /></th><th><LocalizedText source={"Commission earned"} /></th><th><LocalizedText source={"Assigned"} /></th><th /></tr></thead>
          <tbody>
            {sets.map((set) => (
              <tr key={set.id}>
                <td data-label={trText("Task")}>{set.title}</td>
                <td data-label={trText("Status")}><span className={`pill ${set.status}`}>{set.status}</span></td>
                <td data-label={trText("Progress")}>{set.answered_count || 0} / {set.total_items}{' '}<LocalizedText source={"answered ·"} />{' '}{set.best_match_count || 0}{' '}<LocalizedText source={"closest"} /></td>
                <td data-label={trText("Commission earned")} className="money">{money(Number(set.total_commission || 0) / 100)}</td>
                <td data-label={trText("Assigned")}>{when(set.assigned_at)}</td>
                <td data-label={trText("Action")} className="worker-label-set-action">{set.status === 'active'
                  ? <button className="primary" onClick={() => startSet(set.id)}>{set.answered_count ? (<LocalizedText source={"Continue"} />) : (<LocalizedText source={"Start"} />)}</button>
                  : <span className="meta"><LocalizedText source={"Completed"} /></span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sets.length && <p className="meta"><LocalizedText source={"No label sets assigned to you."} /></p>}
      </div>
    </>
  );
}
