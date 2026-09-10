import { useEffect, useState } from 'react';

const MQ = '(min-width: 900px)';

export function useCompactHeader() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const update = () => setCompact(mq.matches && window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('scroll', update);
      mq.removeEventListener('change', update);
    };
  }, []);
  return compact;
}
