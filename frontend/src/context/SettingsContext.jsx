import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import API from '../api/axios';
import { getImageUrl } from '../config';

// privacyUrl/termsUrl/contactUrl/helpCenterUrl/whatsappNumber/customerCareNumber/
// deployWebsiteUrl are managed from Admin → System Configuration and applied
// live (no rebuild) — components should prefer these over the static
// config/urls.config.js build-time defaults where both exist.
const SettingsContext = createContext({
  platformName: 'Zutsav',
  logo: '',
  contactEmail: '',
  supportPhone: '',
  supportAddress: '',
  privacyUrl: '',
  termsUrl: '',
  contactUrl: '',
  helpCenterUrl: '',
  whatsappNumber: '',
  customerCareNumber: '',
  deployWebsiteUrl: '',
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
    privacyUrl:         '',
    termsUrl:           '',
    contactUrl:         '',
    helpCenterUrl:      '',
    whatsappNumber:     '',
    customerCareNumber: '',
    deployWebsiteUrl:   '',
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
