// Display labels for the family-member relationship. The relationship value ('Father', 'Mother', …) is what the API stores
// and receives — it is never changed or sent in translated form. Only the text shown for a KNOWN value is translated; an
// unknown or free-form value (older data) is shown exactly as stored.
export const RELATIONSHIP_VALUES = [
  'Father', 'Mother', 'Son', 'Daughter', 'Spouse',
  'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other',
];

const KEYS = {
  Father: 'family.relFather',
  Mother: 'family.relMother',
  Son: 'family.relSon',
  Daughter: 'family.relDaughter',
  Spouse: 'family.relSpouse',
  Brother: 'family.relBrother',
  Sister: 'family.relSister',
  Grandfather: 'family.relGrandfather',
  Grandmother: 'family.relGrandmother',
  Other: 'family.relOther',
};

export const relationshipLabel = (value, t) => (
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(KEYS, value) ? t(KEYS[value]) : value
);
