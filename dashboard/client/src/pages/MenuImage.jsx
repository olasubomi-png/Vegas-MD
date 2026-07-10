import React, { useState } from 'react';
import { Card, Button } from '../components/Card';
import api from '../api';

export default function MenuImage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('');

  function onPick(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setStatus('Uploading…');
    try {
      await api.post('/menu-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStatus('Uploaded ✓');
    } catch {
      setStatus('Upload failed');
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg tracking-widest text-cyber-purple uppercase">Menu Image</h2>
      <Card>
        <input type="file" accept="image/*" onChange={onPick} className="text-sm mb-4" />
        {preview && <img src={preview} alt="preview" className="max-w-xs rounded-lg border border-cyber-border mb-4" />}
        <div className="flex items-center gap-3">
          <Button onClick={upload} disabled={!file}>Upload</Button>
          {status && <span className="text-xs text-cyber-green">{status}</span>}
        </div>
      </Card>
    </div>
  );
}
