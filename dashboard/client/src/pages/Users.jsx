import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import api from '../api';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => { api.get('/users').then(({ data }) => setUsers(Array.isArray(data) ? data : [])); }, []);

  const filtered = users.filter((u) => u.id?.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Users ({users.length})</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by number…"
          className="bg-cyber-panel2 border border-cyber-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyber-blue"
        />
      </div>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-cyber-purple text-xs uppercase border-b border-cyber-border">
            <tr><th className="text-left p-3">Number</th><th className="text-left p-3">Balance</th><th className="text-left p-3">Warnings</th><th className="text-left p-3">Banned</th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-cyber-border/50 hover:bg-cyber-panel2/50">
                <td className="p-3 font-mono">{u.id}</td>
                <td className="p-3">{u.balance ?? 0}</td>
                <td className="p-3">{u.warnings ?? 0}</td>
                <td className="p-3">{u.banned ? <span className="text-cyber-red">yes</span> : 'no'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-500">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
