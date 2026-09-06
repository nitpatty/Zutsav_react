/**
 * Notification Worker
 *
 * Polling loop that claims due NotificationJobs and hands each to a
 * registered processor (the actual channel-send logic — wired up by
 * ChannelRegistry once Phase 3 lands; until then this runs inert since
 * nothing is enqueuing real jobs yet).
 *
 * The processor is injected via setProcessor() rather than imported
 * directly, so the queue's reliability mechanics (claim locking, backoff,
 * dead-letter) can be tested in complete isolation from channel/provider
 * concerns — exactly what Phase 2's verification exercises.
 *
 * processor signature: async (job) => { success?, response?, variables?,
 *   renderedContent?, skip?, reason? }
 *   - throwing (or rejecting) = failure → backoff/retry/dead-letter
 *   - { skip: true, reason } = validation failed → logged as 'skipped', no retry
 *   - anything else = success → marked 'delivered'
 */

const JobQueue = require('./JobQueue');
const NotificationLogger = require('../logging/NotificationLogger');

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;

let _timer = null;
let _processor = null;
// Optional settlement hook invoked once per job after it reaches a terminal
// outcome (delivered/skipped/failed/dead_letter/cancelled). Registered by
// bootstrap (campaign ledger sync) — defaults to a no-op so the engine stays
// fully decoupled from campaign concerns when nothing registers it.
let _onJobSettled = async () => {};

function setProcessor(fn) {
  _processor = fn;
}

function setOnJobSettled(fn) {
  _onJobSettled = typeof fn === 'function' ? fn : _onJobSettled;
}

async function processOne(job) {
  await NotificationLogger.log({
    jobId: job._id,
    type: job.channel,
    event: job.eventName,
    status: 'processing',
    payload: job.normalizedPayload,
    retryCount: job.attempts,
  });

  try {
    const result = (await _processor(job)) || {};

    if (result.skip) {
      await JobQueue.markSkipped(job._id, result.reason || 'Required variable missing');
      await _onJobSettled(job, 'skipped', result.reason || '', null);
      const checklist = result.checklist || null;
      await NotificationLogger.log({
        jobId: job._id, type: job.channel, event: job.eventName,
        templateName: result.templateName || '',
        recipientId: job.recipient?.userId || null,
        recipientPhone: job.recipient?.phone || '',
        recipientEmail: job.recipient?.email || '',
        status: 'skipped', error: result.reason || '', retryCount: job.attempts,
        payload: job.normalizedPayload,
        metadata: {
          expectedVariableCount: checklist?.expectedCount ?? null,
          receivedVariableCount: checklist?.configuredCount ?? null,
          missingVariables: checklist
            ? checklist.rows.filter((r) => !r.ok).map((r) => r.payloadPath || `position ${r.position}`)
            : (result.missing || []),
        },
      });
      return;
    }

    await JobQueue.markDelivered(job._id);
    await _onJobSettled(job, 'delivered', '', result.response || null);
    await NotificationLogger.log({
      jobId: job._id, type: job.channel, event: job.eventName,
      status: 'delivered', response: result.response, variables: result.variables,
      renderedContent: result.renderedContent, retryCount: job.attempts,
    });
  } catch (err) {
    const updated = await JobQueue.markFailed(job._id, err.message);
    await _onJobSettled(job, updated ? updated.status : 'failed', err.message, null);
    await NotificationLogger.log({
      jobId: job._id, type: job.channel, event: job.eventName,
      status: updated ? updated.status : 'failed', error: err.message, retryCount: job.attempts,
    });
  }
}

async function tick() {
  if (!_processor) return; // no processor registered yet — inert

  let jobs;
  try {
    jobs = await JobQueue.claimBatch(BATCH_SIZE);
  } catch (err) {
    console.error('[Worker] claimBatch failed:', err.message);
    return;
  }

  for (const job of jobs) {
    await processOne(job);
  }
}

function start() {
  if (_timer) return;
  _timer = setInterval(() => {
    tick().catch((err) => console.error('[Worker] tick error:', err.message));
  }, POLL_INTERVAL_MS);
  console.log(`[NotificationEngine] Worker started (polling every ${POLL_INTERVAL_MS}ms)`);
}

function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

module.exports = { start, stop, tick, setProcessor, setOnJobSettled };
