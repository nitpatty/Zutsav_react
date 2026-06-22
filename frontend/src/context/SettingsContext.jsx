import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import API from '../api/axios';

const SettingsContext = createContext({
  platformName: 'Zutsav',
  logo: '',
  contactEmail: '',
  supportPhone: '',
  supportAddress: '',
  logoUrl: null,
  reload: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    platformName:   'Zutsav',
    logo:           '',
    contactEmail:   '',
    supportPhone:   '',
    supportAddress: '',
  });

  const reload = useCallback(() => {
    API.get('/settings/public')
      .then(({ data }) => { if (data.success) setSettings(data.settings); })
      .catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const logoUrl = settings.logo
    ? (settings.logo.startsWith('http') ? settings.logo : `http://localhost:5000/${settings.logo}`)
    : null;

  return (
    <SettingsContext.Provider value={{ ...settings, logoUrl, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
