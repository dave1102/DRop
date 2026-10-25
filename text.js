function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
}

function validName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 18;
}

module.exports = { cleanName, validName };
