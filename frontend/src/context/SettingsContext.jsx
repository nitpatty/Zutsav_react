import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import API from '../api/axios';
import { getImageUrl } from '../config';

// whatsappNumber/customerCareNumber/deployWebsiteUrl are managed from
// Admin → System Configuration and applied live (no rebuild).
const SettingsContext = createContext({
  platformName: 'Zutsav',
  logo: '',
  contactEmail: '',
  supportPhone: '',
  supportAddress: '',
  whatsappNumber: '',
  customerCareNumber: '',
  deployWebsiteUrl: '',
  footerLinks: [],   // admin-managed custom footer links (sanitized by the public API)
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
    whatsappNumber:     '',
    customerCareNumber: '',
    deployWebsiteUrl:   '',
    footerLinks:        [],
  });

  const reload = useCallback(() => {
    API.get('/settings/public')
      .then(({ data }) => { if (data.success) setSettings(data.settings); })
      .catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const logoUrl = getImageUrl(settings.logo);

  return (
    <SettingsContext.Provider value={{ ...settings, logoUrl, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
