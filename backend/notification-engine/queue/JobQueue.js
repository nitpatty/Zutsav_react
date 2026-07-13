/**
 * Job Queue — MongoDB-backed (no Redis dependency).
 *
 * enqueue() creates a durable NotificationJob. claimBatch() atomically
 * claims due jobs via findOneAndUpdate (status-guarded), so two worker
 * ticks — or two server processes — can never process the same job twice.
 * markFailed() computes exponential backoff and moves a job to dead_letter
 * once it exhausts maxAttempts.
 */

const NotificationJob = require('../../src/models/NotificationJob');

const BASE_DELAY_MS = 30 * 1000;       // 30s
const MAX_DELAY_MS  = 30 * 60 * 1000;  // cap at 30 min

/** Exponential backoff: 30s, 60s, 120s, 240s, ... capped at MAX_DELAY_MS */
function computeBackoff(attempts) {
  const delay = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(delay, MAX_DELAY_MS);
}

async function enqueue({ eventName, mappingId, channel, recipient, normalizedPayload, maxAttempts = 5 }) {
  return NotificationJob.create({
    eventName,
    mappingId,
    channel,
    recipient,
    normalizedPayload,
    maxAttempts,
    status: 'queued',
    nextAttemptAt: new Date(),
  });
}

/**
 * Atomically claim up to `limit` due jobs. Each claim is an independent
 * findOneAndUpdate (status-guarded transition queued/retrying → processing),
 * which is what makes concurrent claims safe — MongoDB guarantees only one
 * caller can win the update for a given document.
 */
async function claimBatch(limit = 20) {
  const claimed = [];
  for (let i = 0; i < limit; i++) {
    const job = await NotificationJob.findOneAndUpdate(
      { status: { $in: ['queued', 'retrying'] }, nextAttemptAt: { $lte: new Date() } },
      { $set: { status: 'processing', claimedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, new: true }
    );
    if (!job) break;
    claimed.push(job);
  }
  return claimed;
}

async function markDelivered(jobId) {
  return NotificationJob.findByIdAndUpdate(jobId, { status: 'delivered', lastError: '' }, { new: true });
}

async function markFailed(jobId, errorMessage) {
  const job = await NotificationJob.findById(jobId);
  if (!job) return null;

  if (job.attempts >= job.maxAttempts) {
    return NotificationJob.findByIdAndUpdate(
      jobId,
      { status: 'dead_letter', lastError: errorMessage },
      { new: true }
    );
  }

  const delay = computeBackoff(job.attempts);
  return NotificationJob.findByIdAndUpdate(
    jobId,
    { status: 'retrying', lastError: errorMessage, nextAttemptAt: new Date(Date.now() + delay) },
    { new: true }
  );
}

async function markSkipped(jobId, reason) {
  return NotificationJob.findByIdAndUpdate(jobId, { status: 'skipped', lastError: reason || '' }, { new: true });
}

async function markCancelled(jobId, reason) {
  return NotificationJob.findByIdAndUpdate(jobId, { status: 'cancelled', lastError: reason || '' }, { new: true });
}

module.exports = {
  enqueue,
  claimBatch,
  markDelivered,
  markFailed,
  markSkipped,
  markCancelled,
  computeBackoff,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
};
