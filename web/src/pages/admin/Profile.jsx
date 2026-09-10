export default function AdminProfile({ session }) {
  const u = session?.user || {};
  return (
    <div className="card">
      <h2>{u.display_name}</h2>
      <p className="meta">{u.email}</p>
    </div>
  );
}
