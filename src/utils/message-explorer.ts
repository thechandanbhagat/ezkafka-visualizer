import type { ExplorerMessage, ExplorerStart } from '@/models/message-explorer';

// @group Constants : Bound retained records and rendered payloads without silently discarding data
export const EXPLORER_MAX_RECORDS = 1000;
export const EXPLORER_MAX_BYTES = 16 * 1024 * 1024;
export const EXPLORER_DISPLAY_CHARACTERS = 256 * 1024;

// @group Types : Browser search and start-position input
export type ExplorerSearchField = 'all' | 'key' | 'value' | 'headers';
export type ExplorerStartKind = ExplorerStart['kind'];

// @group Validation : Preserve decimal offsets and convert local timestamps explicitly
export function createExplorerStart(kind: ExplorerStartKind, offset: string, timestamp: string): ExplorerStart {
  if (kind === 'offset') {
    if (offset.length > 19 || !/^(0|[1-9]\d*)$/.test(offset) || BigInt(offset) > BigInt('9223372036854775807')) {
      throw new Error('Enter a whole offset between 0 and 9223372036854775807.');
    }
    return { kind, offset };
  }
  if (kind === 'timestamp') {
    if (!timestamp || !Number.isFinite(new Date(timestamp).getTime()) || new Date(timestamp).getTime() < 0) {
      throw new Error('Choose a valid date and time on or after 1 January 1970.');
    }
    return { kind, timestamp: new Date(timestamp).toISOString() };
  }
  return { kind };
}

// @group BusinessLogic > Search : Search only loaded text and preserve null versus empty payloads
export function matchesExplorerMessage(message: ExplorerMessage, query: string, field: ExplorerSearchField = 'all'): boolean {
  const needle = query.toLocaleLowerCase();
  if (!needle) return true;
  const matches = (value: string | null) => value !== null && value.toLocaleLowerCase().includes(needle);
  if ((field === 'all' || field === 'key') && matches(message.key)) return true;
  if ((field === 'all' || field === 'value') && matches(message.value)) return true;
  if (field === 'all' || field === 'headers') {
    return Object.entries(message.headers).some(([key, value]) => matches(key) ||
      (Array.isArray(value) ? value.some(matches) : matches(value)));
  }
  return false;
}

// @group Utilities > Display : Concise previews and stable exact record identities
export function explorerRecordId(message: ExplorerMessage): string {
  return JSON.stringify([message.topic, message.partition, message.offset]);
}

export function previewExplorerValue(value: string | null, maxLength = 96): string {
  if (value === null) return 'Null';
  if (value === '') return 'Empty string';
  const singleLine = value.replace(/\s+/g, ' ');
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
}

export function formatExplorerTimestamp(timestamp: string | null): string {
  if (timestamp === null) return 'Unavailable';
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : 'Unavailable';
}

// @group Utilities > JSON : Indent validated JSON lexically so numeric literals never lose precision
export function formatExplorerJson(value: string): { text: string; isJson: boolean; formattingLimited?: boolean } {
  if (value.length > EXPLORER_DISPLAY_CHARACTERS) return { text: value, isJson: false, formattingLimited: true };
  try { JSON.parse(value); } catch { return { text: value, isJson: false }; }
  const tokens = value.match(/"(?:\\[\s\S]|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g) || [];
  let indent = 0;
  let text = '';
  const newline = () => '\n' + '  '.repeat(indent);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '{' || token === '[') {
      text += token;
      indent += 1;
      if (indent > 64) return { text: value, isJson: true, formattingLimited: true };
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') text += newline();
    } else if (token === '}' || token === ']') {
      indent -= 1;
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') text += newline();
      text += token;
    } else if (token === ',') text += ',' + newline();
    else if (token === ':') text += ': ';
    else text += token;
    if (text.length > EXPLORER_DISPLAY_CHARACTERS) return { text: value, isJson: true, formattingLimited: true };
  }
  return { text, isJson: true };
}

// @group BusinessLogic > Retention : Refuse oversized pages in full, retaining every accepted record
export function mergeExplorerMessages(existing: ExplorerMessage[], incoming: ExplorerMessage[]): ExplorerMessage[] {
  const seen = new Set(existing.map(explorerRecordId));
  const additions = incoming.filter(message => {
    const id = explorerRecordId(message);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const combined = [...existing, ...additions];
  if (combined.length > EXPLORER_MAX_RECORDS) {
    throw new Error('The 1,000-record workspace limit is reached. Export these records, then start a new browse.');
  }
  if (new TextEncoder().encode(JSON.stringify(combined)).byteLength > EXPLORER_MAX_BYTES) {
    throw new Error('This batch exceeds the 16 MiB workspace limit. Loaded records are retained. Export them, then start a new browse with a smaller batch.');
  }
  return combined;
}

// @group Utilities > Export : Keep payloads as original strings, with explicit scope and encoding metadata
export function serializeExplorerExport(messages: ExplorerMessage[], scope: {
  profileId: string;
  topic: string;
  partition: number;
  query: string;
  searchField: ExplorerSearchField;
}): string {
  return JSON.stringify({
    scope: 'Loaded matching records only',
    ...scope,
    count: messages.length,
    messages,
  }, null, 2);
}
