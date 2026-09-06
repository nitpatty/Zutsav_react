/**
 * Wires the v2 pipeline together: registers channel plugins and gives the
 * Worker its job processor. Safe to call at boot regardless of whether
 * anything is enqueuing real jobs yet — the queue simply stays empty until
 * NotificationEngine.emit() is cut over to EventDispatcher (see EventRegistry
 * cutover note in NotificationEngine.js / this rebuild's Phase 4).
 */

const ChannelRegistry = require('./channels/ChannelRegistry');
const EmailChannel = require('./channels/EmailChannel');
const WhatsAppChannel = require('./channels/WhatsAppChannel');
const InAppChannel = require('./channels/InAppChannel');
const Worker = require('./queue/Worker');
const NotificationMapping = require('../src/models/NotificationMapping');
const WhatsAppTemplate = require('../src/models/WhatsAppTemplate');
const WhatsAppProvider = require('./providers/WhatsAppProvider');
// Coupon-campaign ledger sync — reconciles per-recipient delivery outcomes
// (delivered/skipped/failed) when a campaign job settles. No-op for non-
// campaign jobs, so registering it is harmless extra safety here.
const campaignService = require('../src/services/campaignService');

function registerChannels() {
  ChannelRegistry.register('email', EmailChannel);
  ChannelRegistry.register('whatsapp', WhatsAppChannel);
  ChannelRegistry.register('inapp', InAppChannel);
}

async function processJob(job) {
  const mapping = await NotificationMapping.findById(job.mappingId).lean();
  if (!mapping || !mapping.enabled) {
    return { skip: true, reason: 'Mapping disabled or deleted since this job was enqueued' };
  }
  const payload = { ...job.normalizedPayload, _eventName: job.eventName };
  const channel = ChannelRegistry.get(job.channel);
  return channel.send(mapping, payload, job.recipient);
}

/**
 * Startup audit: every enabled WhatsApp mapping's `whatsappVariables` is
 * admin-configured data (there is no code path that derives or seeds it —
 * see WhatsAppChannel.js), so a mismatch between what a Meta template
 * expects and what's configured is invisible until someone opens the Admin
 * > Notifications dry-run screen for that specific mapping. This runs the
 * exact same structural check (WhatsAppProvider.countExpectedBodyParams,
 * the same helper WhatsAppChannel.buildVariableChecklist uses — not a
 * second copy of the logic) against every enabled mapping at boot, so a gap
 * shows up in server logs immediately and identically in every environment,
 * the moment it exists — not only when someone happens to test that one
 * mapping by hand.
 *
 * Never throws — a misconfigured mapping is a config problem to fix in
 * Admin > Notifications, not a reason to fail the deploy.
 */
async function validateWhatsAppMappings() {
  const mappings = await NotificationMapping.find({ channel: 'whatsapp', enabled: true }).lean();
  const problems = [];
  let ok = 0;

  for (const m of mappings) {
    const label = m.label || `${m.eventName} / ${m.recipientType}`;

    // Phase 5 consent classification visibility: a WhatsApp mapping with no
    // purpose at all (pre-v1.2.0 doc) is never silently treated as
    // marketing, but it is unclassified — re-running bootstrap v1.2.0 fills
    // the verified purpose, or an admin sets it in Admin > Notifications.
    // Explicit 'UNKNOWN' (the default for admin-created mappings) is an
    // intentional safe state and is NOT flagged. This is advisory only — it
    // never blocks the send path (non-marketing continues normally) and
    // does not decrement `ok` (the mapping may still be fully configured).
    if (!m.purpose) {
      problems.push(`[${label}] no communication purpose set (Phase 5 consent classification) — re-run bootstrap v1.2.0 or set it in Admin > Notifications`);
    }

    if (!m.whatsappTemplateName) {
      problems.push(`[${label}] no whatsappTemplateName set`);
      continue;
    }

    const tmpl = await WhatsAppTemplate.findOne({ name: m.whatsappTemplateName }).lean();
    if (!tmpl) {
      problems.push(`[${label}] template "${m.whatsappTemplateName}" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?`);
      continue;
    }
    if (!tmpl.syncedAt) {
      problems.push(`[${label}] template "${m.whatsappTemplateName}" exists but has never been synced from Meta (syncedAt is null)`);
    }

    const expected = WhatsAppProvider.countExpectedBodyParams(tmpl);
    const configured = Array.isArray(m.whatsappVariables) ? m.whatsappVariables : [];
    if (configured.length !== expected) {
      problems.push(`[${label}] template "${m.whatsappTemplateName}" expects ${expected} variable(s) but this mapping has ${configured.length} configured — fill in the missing payload path(s) in Admin > Notifications`);
      continue;
    }

    const missingPath = configured.find((v) => !v.payloadPath);
    if (missingPath) {
      problems.push(`[${label}] position ${missingPath.position} has no payloadPath set`);
      continue;
    }

    ok++;
  }

  if (problems.length === 0) {
    console.log(`[NotificationEngine] ✅ WhatsApp mapping check: ${ok}/${mappings.length} enabled mapping(s) fully configured`);
  } else {
    console.warn(`[NotificationEngine] ⚠️  WhatsApp mapping check: ${ok}/${mappings.length} OK, ${problems.length} problem(s):`);
    problems.forEach((p) => console.warn(`[NotificationEngine]   - ${p}`));
  }

  return { ok, total: mappings.length, problems };
}

async function init() {
  console.log('[NotificationEngine] Bootstrapping...');
  registerChannels();
  Worker.setProcessor(processJob);
  Worker.setOnJobSettled((job, status, error) => campaignService.settleJob(job, status, error));
  console.log(`[NotificationEngine] Channels registered: ${['email', 'whatsapp', 'inapp'].filter((c) => ChannelRegistry.has(c)).join(', ')}`);

  try {
    await validateWhatsAppMappings();
  } catch (err) {
    // Diagnostic-only — must never block boot.
    console.error('[NotificationEngine] ⚠️  WhatsApp mapping check failed to run:', err.message);
  }

  console.log('[NotificationEngine] Ready.');
}

module.exports = { init, processJob, validateWhatsAppMappings };
