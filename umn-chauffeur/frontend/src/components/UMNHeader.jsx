// components/UMNHeader.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function UMNHeader({ role }) {
  const roleLabel = role === 'driver' ? 'Driver' : role === 'admin' ? 'Admin' : 'Student';
  const roleColor = role === 'driver' ? 'bg-blue-700' : role === 'admin' ? 'bg-gray-800' : 'bg-maroon';

  return (
    <header className="bg-maroon text-white shadow-md">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* M logo placeholder */}
          <div className="w-9 h-9 bg-gold rounded-full flex items-center justify-center font-black text-maroon text-lg select-none">
            M
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">UMN Chauffeur</div>
            <div className="text-xs text-gold opacity-80">University of Minnesota</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide ${roleColor} bg-opacity-80 border border-gold border-opacity-30`}>
            {roleLabel}
          </span>
          <nav className="flex gap-2 text-xs ml-2">
            <Link to="/student" className="opacity-70 hover:opacity-100 transition-opacity">Student</Link>
            <Link to="/driver" className="opacity-70 hover:opacity-100 transition-opacity">Driver</Link>
            <Link to="/admin" className="opacity-70 hover:opacity-100 transition-opacity">Admin</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
