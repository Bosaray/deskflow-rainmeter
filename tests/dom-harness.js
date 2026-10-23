// A small deterministic DOM/event adapter for application flow tests.
// This exercises real app.js and index.html, not browser layout or the Rainmeter runtime.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../core.js');

function datasetName(name) {
  return name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class Node {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.open = false;
    this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const present = force === undefined ? !this.classList.contains(name) : force;
        if (present) this.classList.add(name); else this.classList.remove(name);
        return present;
      }
    };
  }

  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  get isConnected() { return this === this.ownerDocument || !!this.parentNode?.isConnected; }

  setAttribute(name, value) {
    value = String(value);
    this.attributes.set(name, value);
    if (name === 'class') this.className = value;
    else if (name === 'id') this.id = value;
    else if (name === 'value') this.value = value;
    else if (name.startsWith('data-')) this.dataset[datasetName(name)] = value;
    else if (['disabled', 'hidden', 'readonly'].includes(name)) this[name] = true;
    else if (name === 'type') this.type = value;
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[datasetName(name)] ?? null;
    if (name === 'class') return this.className;
    if (name === 'id') return this.id || null;
    return this.attributes.get(name) ?? null;
  }
  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === 'string') { const text = new Node('#text', this.ownerDocument); text._text = node; node = text; }
      if (node.parentNode) node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    this.parentNode = null;
  }
  contains(other) { return other === this || this.children.some(child => child.contains(other)); }
  matches(selector) {
    return selector.split(',').some(piece => {
      const part = piece.trim();
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      const attr = part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return attr[2] === undefined ? this.getAttribute(attr[1]) !== null : this.getAttribute(attr[1]) === attr[2];
      return this.tagName.toLowerCase() === part.toLowerCase();
    });
  }
  querySelectorAll(selector) {
    const found = [];
    function visit(node) {
      for (const child of node.children) { if (child.matches(selector)) found.push(child); visit(child); }
    }
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type, data = {}) {
    const event = {
      type, target: this, currentTarget: this, defaultPrevented: false, isComposing: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
      ...data
    };
    const pending = [];
    let node = this;
    while (node) {
      event.currentTarget = node;
      for (const handler of node.listeners.get(type) || []) pending.push(handler(event));
      if (event.stopped || type === 'blur') break;
      node = node.parentNode;
    }
    this.lastEvent = event;
    return Promise.all(pending);
  }
  focus() {
    const previous = this.ownerDocument.activeElement;
    if (previous === this) return;
    this.ownerDocument.activeElement = this;
    if (previous) previous.dispatch('blur');
  }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
  click() {
    if (this.disabled) return Promise.resolve([]);
    this.focus();
    if (this.tagName === 'A') this.ownerDocument.downloads.push({ name: this.download, url: this.href });
    return this.dispatch('click');
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function makeDocument(source) {
  const document = new Node('#document', null);
  document.ownerDocument = document;
  document.downloads = [];
  document.createElement = tag => new Node(tag, document);
  const stack = [document];
  const voidTags = new Set(['meta', 'link', 'input', 'br', 'hr', 'img']);
  for (const token of source.match(/<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const node = document.createElement(tag);
      const attributes = token.slice(tag.length + 1, -1);
      const matcher = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      for (const match of attributes.matchAll(matcher)) node.setAttribute(match[1], match[2] ?? match[3] ?? match[4] ?? '');
      stack[stack.length - 1].append(node);
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
    } else {
      const text = document.createElement('#text');
      text._text = token;
      stack[stack.length - 1].append(text);
    }
  }
  document.body = document.querySelector('body');
  document.activeElement = document.body;
  for (const textarea of document.querySelectorAll('textarea')) textarea.value = textarea.textContent;
  return document;
}

function createHarness({ draft, rawDraft, blockStorage = false, rejectClipboard = false, confirm = true, loadCore = true } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const document = makeDocument(source);
  const storage = new Map();
  const blobs = new Map();
  const clipboard = [];
  const frames = new Map();
  let nextFrame = 0;
  const window = new Node('#window', document);
  window.DeskflowCore = loadCore ? Core : undefined;
  if (rawDraft !== undefined) storage.set('deskflow-draft-v1', rawDraft);
  else if (draft) storage.set('deskflow-draft-v1', JSON.stringify(draft));
  const sandbox = {
    window, document, console, Blob, Intl, Date,
    localStorage: {
      getItem(key) { if (blockStorage) throw new Error('storage disabled'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockStorage) throw new Error('storage disabled'); storage.set(key, value); }
    },
    navigator: { clipboard: { async writeText(text) { if (rejectClipboard) throw new Error('clipboard denied'); clipboard.push(text); } } },
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; },
      revokeObjectURL() {}
    },
    confirm: () => confirm,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    requestAnimationFrame(callback) { nextFrame += 1; frames.set(nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return {
    document, window, storage, blobs, clipboard,
    get: selector => document.querySelector(selector),
    all: selector => document.querySelectorAll(selector),
    saved: () => JSON.parse(storage.get('deskflow-draft-v1')),
    row: id => document.querySelectorAll('.task').find(row => row.dataset.taskId === id),
    async frames() {
      let rounds = 0;
      while (frames.size && rounds++ < 10) {
        const callbacks = [...frames.values()]; frames.clear();
        for (const callback of callbacks) callback();
        await Promise.resolve();
      }
      if (frames.size) throw new Error('render frame loop did not settle');
    }
  };
}

module.exports = { createHarness };
