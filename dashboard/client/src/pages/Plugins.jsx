import React, { useEffect, useState } from 'react';
import { Puzzle } from 'lucide-react';
import { Card } from '../components/Card';
import api from '../api';

export default function Plugins() {
  const [plugins, setPlugins] = useState([]);
  useEffect(() => { api.get('/plugins').then(({ data }) => setPlugins(Array.isArray(data) ? data : [])); }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Plugins ({plugins.length})</h2>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {plugins.map((p) => (
          <Card key={p} className="flex items-center gap-3">
            <Puzzle className="text-cyber-green" size={18} />
            <span className="font-mono text-sm">{p}</span>
          </Card>
        ))}
        {plugins.length === 0 && <p className="text-slate-500 col-span-full">No plugins found.</p>}
      </div>
    </div>
  );
}
