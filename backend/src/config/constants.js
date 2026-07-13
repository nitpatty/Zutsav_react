const { readEnv } = require('./env');

// Misc shared constants that don't belong under urls/integrations/company.
module.exports = {
  UPLOAD_SUBFOLDERS: ['logos', 'profiles', 'govtids', 'products', 'kits', 'csv', 'kycdocs', 'blogs', 'herobanners'],
  // UPLOAD_PATH existed in .env/.env.example but was never actually read anywhere — wired up here.
  uploadDir: readEnv('UPLOAD_PATH') || 'uploads',
};
