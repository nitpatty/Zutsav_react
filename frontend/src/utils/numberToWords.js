const W1 = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const W10 = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function _w(n) {
  if (n === 0) return '';
  if (n < 20) return W1[n] + ' ';
  if (n < 100) return W10[Math.floor(n / 10)] + (n % 10 ? ' ' + W1[n % 10] : '') + ' ';
  if (n < 1000) return W1[Math.floor(n / 100)] + ' Hundred ' + _w(n % 100);
  if (n < 100000) return _w(Math.floor(n / 1000)) + 'Thousand ' + _w(n % 1000);
  if (n < 10000000) return _w(Math.floor(n / 100000)) + 'Lakh ' + _w(n % 100000);
  return _w(Math.floor(n / 10000000)) + 'Crore ' + _w(n % 10000000);
}

/** Indian-format number to words, e.g. 587.8 -> "Five Hundred Eighty Seven Rupees and Eighty Paise Only". */
export function amtWords(num) {
  if (!num || num === 0) return 'Zero Rupees Only';
  const r = Math.floor(num);
  const p = Math.round((num - r) * 100);
  let s = _w(r).trim() + ' Rupees';
  if (p > 0) s += ' and ' + _w(p).trim() + ' Paise';
  return s + ' Only';
}
