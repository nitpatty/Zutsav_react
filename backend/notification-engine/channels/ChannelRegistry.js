/**
 * Channel plugin registry.
 *
 * A channel is any module exporting `send(mapping, payload, recipient)` that
 * returns `{ response, variables, renderedContent }` on success, throws on
 * failure (the Worker turns that into retry/backoff/dead-letter), or
 * returns `{ skip: true, reason }` when required data is missing.
 *
 * Adding a future channel (SMS/Push/Webhook/Slack/...) means writing one new
 * file and calling register() once here — nothing in the dispatcher, queue,
 * or worker needs to change.
 */

const _channels = new Map();

function register(name, channel) {
  if (!channel || typeof channel.send !== 'function') {
    throw new Error(`Channel "${name}" must export a send(mapping, payload, recipient) function`);
  }
  _channels.set(name, channel);
}

function get(name) {
  const channel = _channels.get(name);
  if (!channel) throw new Error(`No channel registered for "${name}"`);
  return channel;
}

function has(name) {
  return _channels.has(name);
}

module.exports = { register, get, has };
