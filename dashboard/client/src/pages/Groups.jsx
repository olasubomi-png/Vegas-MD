import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import api from '../api';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  useEffect(() => { api.get('/groups').then(({ data }) => setGroups(Array.isArray(data) ? data : [])); }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Groups ({groups.length})</h2>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-cyber-purple text-xs uppercase border-b border-cyber-border">
            <tr><th className="text-left p-3">Group JID</th><th className="text-left p-3">Antilink</th><th className="text-left p-3">Welcome</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-cyber-border/50 hover:bg-cyber-panel2/50">
                <td className="p-3 font-mono">{g.id}</td>
                <td className="p-3">{g.antilink ? 'on' : 'off'}</td>
                <td className="p-3">{g.welcome ? 'on' : 'off'}</td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={3} className="p-4 text-center text-slate-500">No groups found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
