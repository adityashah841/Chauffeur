// components/StatusBadge.jsx
import React from 'react';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',     bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  assigned:  { label: 'Assigned',    bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  picked_up: { label: 'In Transit',  bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  completed: { label: 'Completed',   bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  available: { label: 'Available',   bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  on_route:  { label: 'On Route',    bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  done:      { label: 'Done',        bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-400' },
};

export default function StatusBadge({ status, pulse = false }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}
