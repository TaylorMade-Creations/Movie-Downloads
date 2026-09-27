const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../public/app');
const { STREAMABLE_EXTENSIONS } = require('../lib/media');

function harness(extension) {
  const timers = new Map();
  let nextTimer = 0;
  const document = { createElement: tag => node(tag) };
  function node(tag = 'div') {
    const classes = new Set();
    const listeners = {};
    return {
      tag, ownerDocument: document, children: [], dataset: {}, style: {}, value: '',
      classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
      addEventListener(name, listener) { (listeners[name] ||= []).push(listener); },
      emit(name) { for (const listener of listeners[name] || []) listener(); },
      setAttribute() {}, removeAttribute(name) { delete this[name]; },
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
      remove() { this.removed = true; }, pause() { this.paused = true; }, load() {},
      async play() {},
    };
  }
  const grid = node();
  const app = createApp({
    movieSelect: node('select'), player: node('video'), status: node(),
    movieGrid: grid, authPanel: node(), libraryPanel: node(),
    fetchImpl: async url => ({ ok: true, status: 200, json: async () => url === '/api/library'
      ? { movies: [{ id: 'movie', title: 'Example', fileName: `Example${extension}`, extension, size: 100, posterUrl: '/cover.jpg' }], folders: [] }
      : { url: `https://cloud.example/video${extension}` } }),
    createOption: () => node('option'), locationOrigin: 'https://movie.example',
    setTimeoutImpl(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeoutImpl: id => timers.delete(id),
  });
  async function runTimer(delay) {
    const entry = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `expected a ${delay}ms timer`);
    timers.delete(entry[0]); entry[1].callback();
    await new Promise(resolve => setImmediate(resolve));
  }
  return { app, grid, timers, runTimer };
}

for (const extension of STREAMABLE_EXTENSIONS) {
  test(`${extension}: preview keeps cover until playing, then stops after five seconds`, async () => {
    const h = harness(extension);
    await h.app.loadLibrary();
    const card = h.grid.children[0];
    const poster = card.children[0];
    card.emit('mouseenter');
    await h.runTimer(650);
    const video = poster.children.find(child => child.tag === 'video');
    assert.ok(video);
    assert.equal(video.muted, true);
    assert.equal(card.classList.contains('previewing'), false);
    video.emit('playing');
    assert.equal(card.classList.contains('previewing'), true);
    await h.runTimer(5000);
    assert.equal(video.removed, true);
    assert.equal(video.paused, true);
    assert.equal(card.classList.contains('previewing'), false);
    assert.ok(poster.children.some(child => child.tag === 'img' && !child.removed));
  });
}

test('unsupported preview restores cover immediately without a blank tile', async () => {
  const h = harness('.avi');
  await h.app.loadLibrary();
  const card = h.grid.children[0];
  card.emit('focus');
  await h.runTimer(650);
  const video = card.children[0].children.find(child => child.tag === 'video');
  video.emit('error');
  assert.equal(video.removed, true);
  assert.equal(card.classList.contains('preview-loading'), false);
  assert.equal(card.classList.contains('previewing'), false);
  assert.equal(h.timers.size, 0);
});
