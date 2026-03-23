import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

import StudentApp from './pages/StudentApp';
import DriverApp from './pages/DriverApp';
import AdminApp from './pages/AdminApp';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/student" replace />} />
        <Route path="/student/*" element={<StudentApp />} />
        <Route path="/driver/*" element={<DriverApp />} />
        <Route path="/admin" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
