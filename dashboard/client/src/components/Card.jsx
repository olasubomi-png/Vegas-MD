import React from 'react';

export function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`glass-panel rounded-xl p-5 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 mb-4 text-cyber-purple text-sm uppercase tracking-widest">
          {Icon && <Icon size={16} />}
          <span>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function StatPill({ label, value, accent = 'blue' }) {
  const colors = {
    blue: 'text-cyber-blue border-cyber-blue/40',
    purple: 'text-cyber-purple border-cyber-purple/40',
    green: 'text-cyber-green border-cyber-green/40',
    red: 'text-cyber-red border-cyber-red/40',
  };
  return (
    <div className={`glass-panel rounded-xl px-5 py-4 border ${colors[accent]}`}>
      <div className="text-2xl font-bold neon-text">{value}</div>
      <div className="text-xs text-slate-400 mt-1 uppercase tracking-wide">{label}</div>
    </div>
  );
}

export function Button({ children, className = '', variant = 'primary', ...props }) {
  const base = 'px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-gradient-to-r from-cyber-blue to-cyber-purple text-black hover:shadow-neon',
    danger: 'border border-cyber-red text-cyber-red hover:bg-cyber-red/10',
    ghost: 'border border-cyber-border text-cyber-blue hover:bg-cyber-panel2',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`w-full bg-cyber-panel2 border border-cyber-border rounded-lg px-3 py-2 text-sm text-cyber-blue placeholder:text-slate-600 focus:outline-none focus:border-cyber-blue focus:shadow-neon ${props.className || ''}`}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full bg-cyber-panel2 border border-cyber-border rounded-lg px-3 py-2 text-sm text-cyber-blue placeholder:text-slate-600 focus:outline-none focus:border-cyber-blue focus:shadow-neon ${props.className || ''}`}
    />
  );
}
