// Company/legal info previously hardcoded independently in InvoicePage.jsx
// (a local `CO` object), and duplicated again with an inconsistent support
// email in MyOrders.jsx and AdminDashboard.jsx. This is now the one source.
export const company = {
  name: 'Zutsav Enterprises',
  gstin: '07AACCZ8054C1ZB',
  pan: 'AACCZ8054C',
  addr1: ' PLOT NO 23 KH NO 61/13, KALAN EXTENSION, POLE: MDKW622, New Delhi',
  addr2: 'West Delhi - 110041',
  email: process.env.REACT_APP_SUPPORT_EMAIL || 'info@zutsav.com',
  phone: '+91-8851576605',
  web: 'www.zutsav.com',
  state: 'Delhi',
};
