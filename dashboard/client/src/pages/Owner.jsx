import React, { useEffect, useState } from 'react';
import { Card, Button, Input } from '../components/Card';
import api from '../api';

export default function Owner() {
  const [owners, setOwners] = useState([]);
  const [newOwner, setNewOwner] = useState('');

  function load() { api.get('/owner').then(({ data }) => setOwners(data.owners || [])); }
  useEffect(load, []);

  async function save(next) {
    setOwners(next);
    await api.post('/owner', { owners: next });
  }

  function add() {
    const num = newOwner.replace(/\D/g, '');
    if (!num || owners.includes(num)) return;
    save([...owners, num]);
    setNewOwner('');
  }

  function remove(num) {
    save(owners.filter((o) => o !== num));
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Owner Management</h2>
      <Card>
        <div className="flex gap-3 mb-4">
          <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Add owner number" />
          <Button onClick={add}>Add</Button>
        </div>
        <ul className="space-y-2 text-sm">
          {owners.map((o) => (
            <li key={o} className="flex items-center justify-between border-b border-cyber-border/50 pb-2">
              <span className="font-mono">{o}</span>
              <button className="text-cyber-red text-xs" onClick={() => remove(o)}>remove</button>
            </li>
          ))}
          {owners.length === 0 && <p className="text-slate-500">No additional owners set.</p>}
        </ul>
      </Card>
    </div>
  );
}
