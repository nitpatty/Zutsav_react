const crypto = require('crypto');
const Temple = require('../models/Temple');
const Festival = require('../models/Festival');
const EducationMaster = require('../models/EducationMaster');
const SpecializationMaster = require('../models/SpecializationMaster');
const Blog = require('../models/Blog');
const BlogComment = require('../models/BlogComment');
const BlogLike = require('../models/BlogLike');
const BlogBookmark = require('../models/BlogBookmark');

const CONFIRMATION = 'DELETE SELECTED DATA';
const TTL_MS = 5 * 60 * 1000;
const previews = new Map();

// Only categories whose ownership/dependencies are fully represented below are
// executable. Financial, identity and historical domains deliberately remain
// unavailable rather than being silently cascaded.
const REGISTRY = {
  temples: { label: 'Temple Directory', group: 'Directory', model: Temple, filter: {}, description: 'Permanently removes temple directory records.' },
  festivals: { label: 'Festival / Tithi / Panchang records', group: 'Calendar', model: Festival, filter: {}, description: 'Permanently removes display calendar records; integration settings are retained.' },
  education_masters: { label: 'Education Masters', group: 'Masters', model: EducationMaster, filter: {}, description: 'Permanently removes education master records.' },
  specialization_masters: { label: 'Specialization Masters', group: 'Masters', model: SpecializationMaster, filter: {}, description: 'Permanently removes specialization master records.' },
  blog_posts: { label: 'Blog Posts', group: 'Blog Management', model: Blog, filter: {}, description: 'Removes posts and their blog-owned comments, likes and bookmarks.', owned: [BlogComment, BlogLike, BlogBookmark] },
};

const BLOCKED = [
  ['bookings', 'Bookings are retained because payment, invoice, payout and audit records may reference them.'],
  ['users', 'User cleanup is unavailable: retained bookings, orders, wallets and security records require an approved retention plan.'],
  ['poojas', 'Pooja cleanup is unavailable: retained bookings may reference Poojas.'],
  ['pooja_categories', 'Category cleanup is unavailable until retained Pooja references are resolved.'],
  ['products', 'Product cleanup is unavailable: retained orders and kits may reference products.'],
  ['kits', 'Kit cleanup is unavailable: retained bookings may reference kits.'],
  ['orders', 'Order cleanup is unavailable: invoices, payment ledgers and shipment history are protected.'],
  ['blog_categories', 'Blog category cleanup is unavailable until retained blog references are resolved.'],
].map(([id, reason]) => ({ id, label: id.replace(/_/g, ' '), available: false, reason }));

function validateSelection(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) return 'Select one or more distinct cleanup categories.';
  const unknown = ids.find((id) => !REGISTRY[id]);
  return unknown ? `Unsupported cleanup category: ${unknown}` : null;
}

async function buildPlan(ids) {
  const error = validateSelection(ids);
  if (error) return { error };
  const collections = [];
  for (const id of ids) {
    const item = REGISTRY[id];
    const count = await item.model.countDocuments(item.filter);
    collections.push({ categoryId: id, model: item.model.modelName, planned: count });
    if (id === 'blog_posts') {
      const postIds = await Blog.find({}, '_id').lean();
      const filter = { blogId: { $in: postIds.map((p) => p._id) } };
      for (const child of item.owned) collections.push({ categoryId: id, model: child.modelName, planned: await child.countDocuments(filter), ownedBy: 'Blog' });
    }
  }
  return { selectedCategories: ids, collections, executable: true, warnings: ['Permanent deletion cannot be undone. Protected financial, audit, configuration and administrator records are not included.'] };
}

async function createPreview(operatorId, ids) {
  const plan = await buildPlan(ids);
  if (plan.error) return plan;
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TTL_MS);
  previews.set(id, { operatorId: String(operatorId), expiresAt, ...plan, state: 'previewed' });
  return { operationId: id, expiresAt, ...plan };
}

async function executePreview(operatorId, operationId, confirmation) {
  const plan = previews.get(operationId);
  if (!plan || plan.operatorId !== String(operatorId) || plan.expiresAt < new Date() || plan.state !== 'previewed') return { error: 'Cleanup preview is missing, expired, already used, or belongs to another administrator.' };
  if (confirmation !== CONFIRMATION) return { error: `Type ${CONFIRMATION} to confirm permanent deletion.` };
  const current = await buildPlan(plan.selectedCategories);
  if (JSON.stringify(current.collections.map((x) => x.planned)) !== JSON.stringify(plan.collections.map((x) => x.planned))) return { error: 'Data changed since preview. Generate a fresh preview.' };
  plan.state = 'running';
  const results = [];
  try {
    for (const id of plan.selectedCategories) {
      if (id === 'blog_posts') {
        const postIds = await Blog.find({}, '_id').lean();
        const filter = { blogId: { $in: postIds.map((p) => p._id) } };
        for (const child of REGISTRY[id].owned) {
          const before = await child.countDocuments(filter); const deleted = (await child.deleteMany(filter)).deletedCount;
          results.push({ model: child.modelName, before, deleted, remaining: await child.countDocuments(filter) });
        }
      }
      const item = REGISTRY[id]; const before = await item.model.countDocuments(item.filter); const deleted = (await item.model.deleteMany(item.filter)).deletedCount;
      results.push({ model: item.model.modelName, before, deleted, remaining: await item.model.countDocuments(item.filter) });
    }
    plan.state = 'completed'; return { operationId, results };
  } catch (err) { plan.state = 'failed'; return { error: 'Cleanup stopped before completion. Review the audit trail and do not retry blindly.', partial: results }; }
}

module.exports = { CONFIRMATION, REGISTRY, BLOCKED, createPreview, executePreview };
