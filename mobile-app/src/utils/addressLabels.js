// Saved-address labels. The values 'Home' / 'Office' / 'Other' are what the backend stores (POST/PATCH /users/addresses
// `label`), so they are API data and must never be translated or replaced — only the text SHOWN to the user is.
// A label that is not one of the three (e.g. a custom one created on the website) is user-entered text: shown as typed.
export const ADDRESS_LABELS = ['Home', 'Office', 'Other'];

const KEYS = { Home: 'address.labelHome', Office: 'address.labelOffice', Other: 'address.labelOther' };

export function addressLabelText(label, t) {
  const key = KEYS[label];
  return key ? t(key) : label;
}
