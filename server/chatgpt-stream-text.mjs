import { PublicError, isText } from './validation.mjs';

const invalid = () => new PublicError('ChatGPT 文本片段的格式或标识无效，已保留收到的内容。', 502);
const tooLong = () => new PublicError('回答超过长度预算，已保留收到的内容。', 502);
const index = value => {
  if (value === undefined) return 0; // Older streams can omit the sole part's indices.
  if (!Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
};

// Delta arrival order is not output order. Each message/part has its own text,
// and done snapshots can correct earlier provisional text without new inference.
export class ChatGptStreamText {
  constructor(limit, emit) {
    this.limit = limit; this.emit = emit; this.text = '';
    this.parts = new Map(); this.items = new Map(); this.itemIndices = new Map();
    this.completedItems = new Set(); this.size = 0;
  }

  identify(outputIndex, id) {
    if (id === undefined) return;
    if (!isText(id, 200, 1)) throw invalid();
    const existing = this.items.get(outputIndex);
    if (existing && existing !== id) throw invalid();
    const previousIndex = this.itemIndices.get(id);
    if (previousIndex !== undefined && previousIndex !== outputIndex) throw invalid();
    if (!existing && this.items.size >= 1024) throw invalid();
    this.items.set(outputIndex, id); this.itemIndices.set(id, outputIndex);
  }

  publish(next, { allowEmpty = false } = {}) {
    if (typeof next !== 'string') throw invalid();
    if (next.length > this.limit) throw tooLong();
    // An empty/incomplete terminal must not erase a recoverable partial answer.
    if (!allowEmpty && !next.trim() && this.text.trim()) return;
    if (next === this.text) return;
    const event = next.startsWith(this.text)
      ? { type: 'delta', text: next.slice(this.text.length) } : { type: 'replace', text: next };
    this.emit(event); this.text = next;
  }

  render() {
    const ordered = [...this.parts.values()].sort((a, b) => a.outputIndex - b.outputIndex || a.contentIndex - b.contentIndex);
    this.publish(ordered.map(part => part.text).join(''));
  }

  part(event, value, append = false) {
    if (typeof value !== 'string') throw invalid();
    const outputIndex = index(event.output_index), contentIndex = index(event.content_index);
    this.identify(outputIndex, event.item_id);
    const key = `${outputIndex}:${contentIndex}`, previous = this.parts.get(key);
    if (!previous && this.parts.size >= 1024) throw invalid();
    const next = (append ? previous?.text ?? '' : '') + value;
    const size = this.size - (previous?.text.length ?? 0) + next.length;
    if (size > this.limit) throw tooLong();
    this.size = size; this.parts.set(key, { outputIndex, contentIndex, text: next }); this.render();
  }

  // The caller validates completed assistant message content before supplying it.
  item(event) {
    const outputIndex = index(event.output_index), item = event.item;
    this.identify(outputIndex, item.id);
    const parts = item.content.map((part, contentIndex) => ({ outputIndex, contentIndex, text: part.type === 'output_text' ? part.text : part.refusal }));
    const remaining = [...this.parts.values()].filter(part => part.outputIndex !== outputIndex);
    const size = [...remaining, ...parts].reduce((total, part) => total + part.text.length, 0);
    if (size > this.limit) throw tooLong();
    if (remaining.length + parts.length > 1024) throw invalid();
    this.parts = new Map([...remaining, ...parts].map(part => [`${part.outputIndex}:${part.contentIndex}`, part]));
    this.size = size; this.render();
    if (item.id !== undefined) this.completedItems.add(item.id);
  }

  complete(output, text) {
    // Final output order can differ from wire output_index. Match identities,
    // allowing already-completed commentary to be omitted from the final output.
    const finalIds = new Set();
    for (const item of output) {
      if (item.id === undefined) continue;
      if (!isText(item.id, 200, 1) || finalIds.has(item.id)) throw invalid();
      if (this.itemIndices.has(item.id) && (item.type !== 'message' || item.role !== 'assistant')) throw invalid();
      finalIds.add(item.id);
    }
    for (const id of this.itemIndices.keys()) {
      if (!this.completedItems.has(id) && !finalIds.has(id)) throw invalid();
    }
    this.publish(text, { allowEmpty: true });
  }
}
