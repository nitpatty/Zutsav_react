const ProductCategory = require('../models/ProductCategory');
const Product         = require('../models/Product');

const DEFAULT_CATEGORIES = [
  { name: 'Samagri',         slug: 'samagri',          icon: '🪔', displayOrder: 1 },
  { name: 'Rudraksha',       slug: 'rudraksha',         icon: '📿', displayOrder: 2 },
  { name: 'Yantra',          slug: 'yantra',            icon: '🔯', displayOrder: 3 },
  { name: 'Incense',         slug: 'incense',           icon: '🌿', displayOrder: 4 },
  { name: 'Idols',           slug: 'idol',              icon: '🛕', displayOrder: 5 },
  { name: 'Books',           slug: 'books',             icon: '📚', displayOrder: 6 },
  { name: 'Pooja Essentials',slug: 'pooja_essentials',  icon: '🧿', displayOrder: 7 },
  { name: 'Other',           slug: 'other',             icon: '🎁', displayOrder: 8 },
];

/* ── Seed default categories (idempotent) ── */
exports.seedCategories = async () => {
  const count = await ProductCategory.countDocuments();
  if (count > 0) return;
  await ProductCategory.insertMany(DEFAULT_CATEGORIES.map((c) => ({ ...c, isActive: true, featured: false })));
  console.log('[ProductCategory] Seeded', DEFAULT_CATEGORIES.length, 'default categories');
};

/* ── Public: list active categories with product counts ── */
exports.getCategories = async (req, res, next) => {
  try {
    await exports.seedCategories();
    const cats = await ProductCategory.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .select('-createdBy -__v')
      .lean();

    const counts = await Product.aggregate([
      { $match: { isActive: true, isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

    res.json({ success: true, categories: cats.map((c) => ({ ...c, productCount: countMap[c.slug] || 0 })) });
  } catch (err) { next(err); }
};

/* ── Admin: list all categories (including inactive) ── */
exports.getAdminCategories = async (req, res, next) => {
  try {
    await exports.seedCategories();
    const cats = await ProductCategory.find()
      .sort({ displayOrder: 1, name: 1 })
      .select('-__v')
      .lean();

    const counts = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

    res.json({ success: true, categories: cats.map((c) => ({ ...c, productCount: countMap[c.slug] || 0 })) });
  } catch (err) { next(err); }
};

/* ── Admin: create category ── */
exports.createCategory = async (req, res, next) => {
  try {
    const { name, slug, description, icon, featured, displayOrder, isActive, seoTitle, seoDescription } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, message: 'Name and slug are required' });

    const exists = await ProductCategory.findOne({ slug: slug.toLowerCase().trim() });
    if (exists) return res.status(409).json({ success: false, message: 'A category with this slug already exists' });

    const cat = await ProductCategory.create({
      name: name.trim(),
      slug: slug.toLowerCase().trim(),
      description: description || '',
      icon: icon || '🛍️',
      image: req.file ? req.file.path.replace(/\\/g, '/') : null,
      featured: featured === true || featured === 'true',
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== false && isActive !== 'false',
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
};

/* ── Admin: update category ── */
exports.updateCategory = async (req, res, next) => {
  try {
    const { name, description, icon, featured, displayOrder, isActive, seoTitle, seoDescription } = req.body;
    const update = {};
    if (name !== undefined)         update.name = name.trim();
    if (description !== undefined)  update.description = description;
    if (icon !== undefined)         update.icon = icon;
    if (featured !== undefined)     update.featured = featured === true || featured === 'true';
    if (displayOrder !== undefined) update.displayOrder = Number(displayOrder) || 0;
    if (isActive !== undefined)     update.isActive = isActive === true || isActive === 'true';
    if (seoTitle !== undefined)     update.seoTitle = seoTitle;
    if (seoDescription !== undefined) update.seoDescription = seoDescription;
    if (req.file) update.image = req.file.path.replace(/\\/g, '/');

    const cat = await ProductCategory.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
};

/* ── Admin: toggle active status ── */
exports.toggleCategoryStatus = async (req, res, next) => {
  try {
    const cat = await ProductCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    cat.isActive = !cat.isActive;
    await cat.save();
    res.json({ success: true, isActive: cat.isActive, message: `Category ${cat.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) { next(err); }
};

/* ── Admin: delete category (guard: no products assigned) ── */
exports.deleteCategory = async (req, res, next) => {
  try {
    const cat = await ProductCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

    const productCount = await Product.countDocuments({ category: cat.slug, isDeleted: false });
    if (productCount > 0)
      return res.status(400).json({ success: false, message: `Cannot delete: ${productCount} product(s) are assigned to this category` });

    await cat.deleteOne();
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) { next(err); }
};

/* ── Admin: reorder categories ── */
exports.reorderCategories = async (req, res, next) => {
  try {
    const { order } = req.body; // [{ id, displayOrder }]
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'order must be an array' });

    await Promise.all(order.map(({ id, displayOrder }) =>
      ProductCategory.findByIdAndUpdate(id, { $set: { displayOrder: Number(displayOrder) } })
    ));
    res.json({ success: true, message: 'Order updated' });
  } catch (err) { next(err); }
};
