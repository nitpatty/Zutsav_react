const User = require('../models/User');

const seedAdmin = async () => {
  const exists = await User.findOne({ role: { $in: ['admin', 'system_admin'] } });
  if (exists) {
    console.log('✅ Admin already exists — skipping seed');
    return;
  }

  const { ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_PHONE || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      '\n❌ No admin account exists and ADMIN_NAME/ADMIN_PHONE/ADMIN_EMAIL/ADMIN_PASSWORD are not fully set.\n' +
      '   Set them in backend/.env and restart to seed the first admin account.\n'
    );
    return;
  }

  // The first account on a fresh install is the platform's root authority —
  // seed it directly as system_admin so it can provision Admin accounts
  // through the Admin Management module immediately (a plain 'admin' has no
  // way to create anyone, which would otherwise lock a fresh deploy).
  await User.create({
    name:     ADMIN_NAME || 'Admin',
    phone:    ADMIN_PHONE,
    email:    ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role:     'system_admin',
    isActive: true,
  });

  console.log('🌱 System Admin seeded successfully');
  console.log(`   Phone   : ${ADMIN_PHONE}`);
  console.log(`   Email   : ${ADMIN_EMAIL}`);
};

module.exports = seedAdmin;
