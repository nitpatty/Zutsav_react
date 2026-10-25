const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { toBlogAuthorRole } = require('../src/utils/roleUtils');
const RealBlog = require('../src/models/Blog');

const created = [];
let duplicateSource;
const blogModelPath = require.resolve('../src/models/Blog');
require.cache[blogModelPath] = {
  id: blogModelPath, filename: blogModelPath, loaded: true,
  exports: {
    create: async (payload) => { created.push(payload); return payload; },
    findById: () => ({ lean: async () => duplicateSource }),
  },
};
const controller = require('../src/controllers/blog.controller');

let permissionSettings = {};
const settingsModelPath = require.resolve('../src/models/SystemSettings');
require.cache[settingsModelPath] = {
  id: settingsModelPath, filename: settingsModelPath, loaded: true,
  exports: { findOne: () => ({ lean: async () => permissionSettings }) },
};
const blogPermission = require('../src/middleware/blogPermission');

function mockRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function createAs(role, body = {}) {
  created.length = 0;
  const req = {
    user: { _id: new mongoose.Types.ObjectId(), role, name: `${role} author`, profilePhoto: '' },
    blogSettings: { blogAdminPublish: true },
    body: { title: 'Safe Blog Title', content: '<p>Safe content</p>', action: 'publish', ...body },
  };
  const res = mockRes();
  let nextError;
  await controller.createBlog(req, res, (err) => { nextError = err; });
  assert.equal(nextError, undefined);
  return { req, res, payload: created[0] };
}

test('blog author roles normalize both admin tiers to the existing admin taxonomy', () => {
  assert.equal(toBlogAuthorRole('admin'), 'admin');
  assert.equal(toBlogAuthorRole('system_admin'), 'admin');
  assert.equal(toBlogAuthorRole('pandit'), 'pandit');
  assert.equal(toBlogAuthorRole('user'), 'user');
});

test('system admin can publish with canonical author role while retaining creator identity', async () => {
  const { req, res, payload } = await createAs('system_admin');
  assert.equal(res.statusCode, 201);
  assert.equal(payload.status, 'published');
  assert.equal(payload.authorRole, 'admin');
  assert.equal(String(payload.authorId), String(req.user._id));
  assert.equal(String(payload.publishedBy), String(req.user._id));
});

test('regular admin publishing remains direct and canonical', async () => {
  const { res, payload } = await createAs('admin');
  assert.equal(res.statusCode, 201);
  assert.equal(payload.status, 'published');
  assert.equal(payload.authorRole, 'admin');
});

test('client cannot override server-derived privileged role or publication identity', async () => {
  const { req, payload } = await createAs('system_admin', {
    authorRole: 'user', authorId: new mongoose.Types.ObjectId(), publishedBy: new mongoose.Types.ObjectId(), status: 'draft',
  });
  assert.equal(payload.authorRole, 'admin');
  assert.equal(String(payload.authorId), String(req.user._id));
  assert.equal(String(payload.publishedBy), String(req.user._id));
  assert.equal(payload.status, 'published');
});

test('pandit still follows the configured review workflow', async () => {
  const { res, payload } = await createAs('pandit');
  assert.equal(res.statusCode, 201);
  assert.equal(payload.status, 'pending_review');
  assert.equal(payload.authorRole, 'pandit');
});

test('system admin blog duplicates use the same canonical author role', async () => {
  created.length = 0;
  const userId = new mongoose.Types.ObjectId();
  duplicateSource = {
    _id: new mongoose.Types.ObjectId(), authorId: userId,
    title: 'Original', content: 'content', excerpt: '', featuredImage: '', category: null, tags: [],
    seoTitle: '', seoDescription: '', ogImage: '', canonicalUrl: '',
  };
  const req = { params: { id: String(duplicateSource._id) }, user: { _id: userId, role: 'system_admin', name: 'System Admin' } };
  const res = mockRes();
  let nextError;
  await controller.duplicateBlog(req, res, (err) => { nextError = err; });
  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].authorRole, 'admin');
  assert.equal(String(created[0].authorId), String(userId));
});

test('Blog schema accepts canonical historical roles and rejects raw system_admin', async () => {
  for (const authorRole of ['admin', 'pandit', 'user']) {
    const blog = new RealBlog({
      title: 'Historical role', slug: `historical-${authorRole}-${Date.now()}`,
      content: 'content', authorId: new mongoose.Types.ObjectId(), authorName: 'Synthetic', authorRole,
    });
    await blog.validate();
  }
  const invalid = new RealBlog({
    title: 'Invalid role', slug: `invalid-${Date.now()}`,
    content: 'content', authorId: new mongoose.Types.ObjectId(), authorName: 'Synthetic', authorRole: 'system_admin',
  });
  await assert.rejects(invalid.validate(), /authorRole/);
});

test('blog permission remains backend-enforced for admin tiers, user, pandit, and unknown roles', async () => {
  async function check(role, settings) {
    permissionSettings = settings;
    const req = { user: { role } };
    const res = mockRes();
    let called = false;
    let nextError;
    await blogPermission(req, res, (err) => { called = true; nextError = err; });
    assert.equal(nextError, undefined);
    return { called, res, req };
  }

  let result = await check('system_admin', { blogAdminPublish: true });
  assert.equal(result.called, true);
  assert.deepEqual(result.req.blogSettings, { blogAdminPublish: true });

  result = await check('admin', { blogAdminPublish: false });
  assert.equal(result.called, false);
  assert.equal(result.res.statusCode, 403);

  result = await check('pandit', { blogPanditPublish: false });
  assert.equal(result.called, false);
  assert.equal(result.res.statusCode, 403);

  result = await check('user', { blogUserPublish: false });
  assert.equal(result.called, false);
  assert.equal(result.res.statusCode, 403);

  result = await check('unknown', { blogAdminPublish: true, blogPanditPublish: true, blogUserPublish: true });
  assert.equal(result.called, false);
  assert.equal(result.res.statusCode, 403);
});
