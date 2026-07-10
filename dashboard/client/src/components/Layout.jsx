import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity, Terminal, Users, UsersRound, Puzzle, BarChart3, Radio, KeySquare,
  Settings, Code2, QrCode, Image, ShieldCheck, DatabaseBackup, Cpu, LogOut, Menu,
} from 'lucide-react';
import { setToken } from '../api';
import { connectSocket } from '../socket';

const NAV = [
  { to: '/', label: 'Bot Status', icon: Activity, end: true },
  { to: '/logs', label: 'Live Logs', icon: Terminal },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/groups', label: 'Groups', icon: UsersRound },
  { to: '/plugins', label: 'Plugins', icon: Puzzle },
  { to: '/stats', label: 'Statistics', icon: BarChart3 },
  { to: '/broadcast', label: 'Broadcast', icon: Radio },
  { to: '/sessions', label: 'Sessions', icon: KeySquare },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/github', label: 'GitHub Updates', icon: Code2 },
  { to: '/pair', label: 'Pair New Number', icon: QrCode },
  { to: '/menu-image', label: 'Menu Image', icon: Image },
  { to: '/owner', label: 'Owner Management', icon: ShieldCheck },
  { to: '/backup', label: 'DB Backup/Restore', icon: DatabaseBackup },
  { to: '/system', label: 'System Monitor', icon: Cpu },
];

export default function Layout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => { connectSocket(); }, []);

  function logout() {
    setToken(null);
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex text-cyber-blue">
      <button
        className="md:hidden fixed top-3 left-3 z-30 glass-panel rounded-lg p-2 text-cyber-blue"
        onClick={() => setOpen((o) => !o)}
      >
        <Menu size={20} />
      </button>

      <aside className={`fixed md:static z-20 top-0 left-0 h-full w-64 glass-panel border-r border-cyber-border
        transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        flex flex-col`}>
        <div className="px-5 py-6 border-b border-cyber-border">
          <h1 className="text-xl font-bold neon-text tracking-widest">OLASUBOMI-MD</h1>
          <p className="text-xs text-cyber-purple mt-1">Command &amp; Control</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-cyber-panel2 text-cyber-blue shadow-neon border border-cyber-blue/40'
                    : 'text-slate-400 hover:text-cyber-blue hover:bg-cyber-panel2/60'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="m-3 flex items-center justify-center gap-2 rounded-lg border border-cyber-red/50 text-cyber-red py-2 hover:bg-cyber-red/10 text-sm"
        >
          <LogOut size={16} /> Log out
        </button>
      </aside>

      <main className="flex-1 min-h-screen p-4 md:p-8 pt-16 md:pt-8 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
