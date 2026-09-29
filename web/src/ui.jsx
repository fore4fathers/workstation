export function Overlay({ title, sub }) {
  return (
    <div className="drive-overlay">
      <div className="drive-overlay-card">
        <span className="spinner" style={{ width: 48, height: 48 }} />
        {title ? <p className="drive-overlay-title">{title}</p> : null}
        {sub ? <p className="meta">{sub}</p> : null}
      </div>
    </div>
  );
}

export function Spinner({ size = 20 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
