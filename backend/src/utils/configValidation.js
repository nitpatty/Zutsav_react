// Shared validators for the System Configuration Center. Email/phone regexes
// match the ones already used in Register.jsx/PanditRegistration.jsx for
// consistency with the rest of the app.
const EMAIL_RE = /\S+@\S+\.\S+/;
const PHONE_RE = /^[6-9]\d{9}$/;

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidEmail(value) {
  return EMAIL_RE.test(value);
}

function isValidPhone(value) {
  return PHONE_RE.test(value);
}

/**
 * Validates `value` against a manifest field's `type`. Empty string is
 * allowed unless the field is `required`. Returns an error message string,
 * or null if valid.
 */
function validateField(field, value) {
  const v = String(value ?? '').trim();

  if (!v) {
    return field.required ? `${field.label} is required` : null;
  }

  switch (field.type) {
    case 'url':
      return isValidUrl(v) ? null : `${field.label} must be a valid http(s) URL`;
    case 'email':
      return isValidEmail(v) ? null : `${field.label} must be a valid email address`;
    case 'phone':
      return isValidPhone(v) ? null : `${field.label} must be a valid 10-digit Indian mobile number`;
    default:
      return null;
  }
}

module.exports = { isValidUrl, isValidEmail, isValidPhone, validateField };
