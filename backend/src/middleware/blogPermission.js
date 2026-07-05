const SystemSettings = require('../models/SystemSettings');

/**
 * Middleware: verify that the authenticated user's role is allowed to publish blogs.
 * Reads permission flags from SystemSettings — never hardcoded.
 * Attaches req.blogSettings so controllers can read approval requirements.
 */
module.exports = async function checkBlogPermission(req, res, next) {
  try {
    const settings = await SystemSettings.findOne().lean();
    const role     = req.user?.role;

    let allowed = false;
    if (role === 'admin'  && settings?.blogAdminPublish  !== false) allowed = true;
    if (role === 'pandit' && settings?.blogPanditPublish !== false) allowed = true;
    if (role === 'user'   && settings?.blogUserPublish   !== false) allowed = true;

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Blog publishing is not enabled for your role. Contact an administrator.',
      });
    }

    req.blogSettings = settings || {};
    next();
  } catch (err) {
    next(err);
  }
};
