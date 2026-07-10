import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Status from './pages/Status';
import Logs from './pages/Logs';
import Users from './pages/Users';
import Groups from './pages/Groups';
import Plugins from './pages/Plugins';
import Stats from './pages/Stats';
import Broadcast from './pages/Broadcast';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import GitHub from './pages/GitHub';
import Pair from './pages/Pair';
import MenuImage from './pages/MenuImage';
import Owner from './pages/Owner';
import Backup from './pages/Backup';
import System from './pages/System';
import { getToken } from './api';

function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Status />} />
        <Route path="logs" element={<Logs />} />
        <Route path="users" element={<Users />} />
        <Route path="groups" element={<Groups />} />
        <Route path="plugins" element={<Plugins />} />
        <Route path="stats" element={<Stats />} />
        <Route path="broadcast" element={<Broadcast />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="settings" element={<Settings />} />
        <Route path="github" element={<GitHub />} />
        <Route path="pair" element={<Pair />} />
        <Route path="menu-image" element={<MenuImage />} />
        <Route path="owner" element={<Owner />} />
        <Route path="backup" element={<Backup />} />
        <Route path="system" element={<System />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
