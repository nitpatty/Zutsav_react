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

function init() {
  registerChannels();
  Worker.setProcessor(processJob);
}

module.exports = { init, processJob };
