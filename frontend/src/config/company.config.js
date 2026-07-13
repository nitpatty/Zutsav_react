// Company/legal info previously hardcoded independently in InvoicePage.jsx
// (a local `CO` object), and duplicated again with an inconsistent support
// email in MyOrders.jsx and AdminDashboard.jsx. This is now the one source.
export const company = {
  name: 'Zutsav Enterprises',
  gstin: '09AAAFZ1234Z1Z5',
  pan: 'AAAFZ1234Z',
  addr1: 'E-012, Assotech The Nest, Crossing Republik',
  addr2: 'Ghaziabad, Uttar Pradesh - 201016',
  email: process.env.REACT_APP_SUPPORT_EMAIL || 'info@zutsav.com',
  phone: '+91-8851576605',
  web: 'www.zutsav.com',
  state: 'Uttar Pradesh',
};
