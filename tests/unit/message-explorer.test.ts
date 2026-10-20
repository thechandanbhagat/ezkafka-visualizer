import { describe, expect, it } from 'vitest';
import type { ExplorerMessage } from '@/models/message-explorer';
import {
  createExplorerStart,
  explorerRecordId,
  EXPLORER_DISPLAY_CHARACTERS,
  EXPLORER_MAX_BYTES,
  EXPLORER_MAX_RECORDS,
  formatExplorerJson,
  formatExplorerTimestamp,
  matchesExplorerMessage,
  mergeExplorerMessages,
  previewExplorerValue,
  serializeExplorerExport,
} from '@/utils/message-explorer';

// @group TestSetup : Records include exact offsets, nullable values, and repeated headers
function record(overrides: Partial<ExplorerMessage> = {}): ExplorerMessage {
  return {
    topic: 'orders', partition: 0, offset: '9007199254740993', timestamp: '2026-10-19T12:00:00.000Z',
    key: 'order-123', value: '{"orderId":9007199254740993,"status":"created"}',
    headers: { trace: ['first', 'SECOND'], source: 'checkout' },
    encoding: { key: 'utf8', value: 'utf8', headers: { trace: ['utf8', 'utf8'], source: 'utf8' } },
    ...overrides,
  };
}

// @group UnitTests > Positions : Input validation must not round Kafka offsets or accept invalid time
describe('message explorer start positions', () => {
  it('preserves offsets above the JavaScript safe integer limit', () => {
    expect(createExplorerStart('offset', '9007199254740993', '')).toEqual({ kind: 'offset', offset: '9007199254740993' });
    expect(createExplorerStart('offset', '9223372036854775807', '')).toEqual({ kind: 'offset', offset: '9223372036854775807' });
    expect(createExplorerStart('offset', '0', '')).toEqual({ kind: 'offset', offset: '0' });
  });

  it.each(['', '01', '-1', '1.5', ' 1 ', '1e5', '9223372036854775808', '9'.repeat(100000)])('rejects malformed or overflowing offset input', offset => {
    expect(() => createExplorerStart('offset', offset, '')).toThrow('whole offset');
  });

  it('serializes an explicit timestamp and supports the epoch', () => {
    expect(createExplorerStart('timestamp', '', '2026-10-19T14:12:13+02:00')).toEqual({ kind: 'timestamp', timestamp: '2026-10-19T12:12:13.000Z' });
    expect(createExplorerStart('timestamp', '', '1970-01-01T00:00:00Z')).toEqual({ kind: 'timestamp', timestamp: '1970-01-01T00:00:00.000Z' });
  });

  it.each(['', 'not-a-date', '1969-12-31T23:59:59Z'])('rejects invalid or pre-epoch timestamps %j', timestamp => {
    expect(() => createExplorerStart('timestamp', '', timestamp)).toThrow('valid date');
  });

  it('does not attach irrelevant fields to earliest or recent starts', () => {
    expect(createExplorerStart('earliest', 'bad', 'bad')).toEqual({ kind: 'earliest' });
    expect(createExplorerStart('latest', 'bad', 'bad')).toEqual({ kind: 'latest' });
  });
});

// @group UnitTests > Search : Literal, case-insensitive filters cover all repeated header values
describe('message explorer search', () => {
  it.each([
    ['ORDER-123', 'key', true], ['created', 'value', true], ['second', 'headers', true], ['trace', 'headers', true],
    ['checkout', 'all', true], ['checkout', 'key', false], ['order-123', 'headers', false], ['.*', 'all', false],
  ] as const)('matches %s in %s: %s', (query, field, expected) => {
    expect(matchesExplorerMessage(record(), query, field)).toBe(expected);
  });

  it('does not manufacture searchable text for null values', () => {
    const tombstone = record({ key: null, value: null, headers: {} });
    expect(matchesExplorerMessage(tombstone, '')).toBe(true);
    expect(matchesExplorerMessage(tombstone, 'null')).toBe(false);
    expect(matchesExplorerMessage(record({ value: 'null' }), 'null', 'value')).toBe(true);
  });

  it('searches binary fields in their explicit Base64 representation', () => {
    expect(matchesExplorerMessage(record({ value: '/wAB', encoding: { key: 'utf8', value: 'base64', headers: {} } }), '/wAB', 'value')).toBe(true);
  });

  it('preserves null header values and searches non-null repetitions', () => {
    const message = record({ headers: { nullable: null, repeated: [null, '', 'needle'] } });
    expect(matchesExplorerMessage(message, 'null', 'headers')).toBe(true);
    expect(matchesExplorerMessage(message, 'needle', 'headers')).toBe(true);
    expect(matchesExplorerMessage(record({ headers: { missing: null } }), 'null', 'headers')).toBe(false);
    expect(JSON.parse(serializeExplorerExport([message], { profileId: 'local', topic: 'orders', partition: 0, query: '', searchField: 'all' })).messages[0].headers).toEqual(message.headers);
  });
});

// @group UnitTests > Formatting : JSON layout preserves original number and escaped-string tokens
describe('message explorer formatting', () => {
  it('formats JSON without parsing its numeric values into floating-point output', () => {
    const source = '{"large":9007199254740993,"precise":0.123456789012345678901,"exponent":1e+999,"negative":-0}';
    const result = formatExplorerJson(source);
    expect(result.isJson).toBe(true);
    expect(result.text).toBe('{\n  "large": 9007199254740993,\n  "precise": 0.123456789012345678901,\n  "exponent": 1e+999,\n  "negative": -0\n}');
  });

  it('preserves escaped strings, Unicode, nested arrays, and empty containers', () => {
    const source = '{ "string": "a \\\"quote\\\" \\n 雪 {} []", "array": [true,null,{},[]] }';
    const result = formatExplorerJson(source);
    expect(result.isJson).toBe(true);
    expect(JSON.parse(result.text)).toEqual(JSON.parse(source));
    expect(result.text).toContain('"a \\\"quote\\\" \\n 雪 {} []"');
    expect(result.text).toContain('{}');
    expect(result.text).toContain('[]');
  });

  it.each(['hello', '', '{"invalid":}', '<script>alert(1)</script>'])('keeps non-JSON payloads unchanged', source => {
    expect(formatExplorerJson(source)).toEqual({ text: source, isJson: false });
  });

  it.each(['null', 'true', '"string"', '9007199254740993', '[]', '{}'])('formats JSON primitives without losing values', source => {
    expect(formatExplorerJson(source)).toEqual({ text: source, isJson: true });
  });

  it('bounds nested JSON and output expansion rather than freezing on indentation', () => {
    const deep = '['.repeat(50000) + '0' + ']'.repeat(50000);
    expect(formatExplorerJson(deep)).toEqual({ text: deep, isJson: true, formattingLimited: true });
    const expanded = '['.repeat(60) + Array.from({ length: 4000 }, () => '0').join(',') + ']'.repeat(60);
    expect(formatExplorerJson(expanded)).toEqual({ text: expanded, isJson: true, formattingLimited: true });
  });

  it('does not format beyond the raw preview cap', () => {
    const oversized = ' '.repeat(EXPLORER_DISPLAY_CHARACTERS) + '0';
    expect(formatExplorerJson(oversized)).toEqual({ text: oversized, isJson: false, formattingLimited: true });
  });

  it('distinguishes null, empty, whitespace, and text previews', () => {
    expect(previewExplorerValue(null)).toBe('Null');
    expect(previewExplorerValue('')).toBe('Empty string');
    expect(previewExplorerValue('  ')).toBe(' ');
    expect(previewExplorerValue('a\nb')).toBe('a b');
    expect(previewExplorerValue('abcdef', 3)).toBe('abc…');
  });

  it('renders timestamps consistently in UTC and handles absent metadata', () => {
    expect(formatExplorerTimestamp('2026-10-19T13:00:00+01:00')).toBe('2026-10-19T12:00:00.000Z');
    expect(formatExplorerTimestamp(null)).toBe('Unavailable');
    expect(formatExplorerTimestamp('invalid')).toBe('Unavailable');
  });
});

// @group UnitTests > Retention : Continuation retries deduplicate without reordering or silently evicting
describe('message explorer page retention', () => {
  it('deduplicates record identities while preserving partition and exact offset distinctions', () => {
    const first = record();
    const next = record({ offset: '9007199254740994' });
    const otherPartition = record({ partition: 1 });
    expect(mergeExplorerMessages([first], [first, next, next, otherPartition])).toEqual([first, next, otherPartition]);
    expect(explorerRecordId(first)).not.toBe(explorerRecordId(next));
    expect(explorerRecordId(first)).not.toBe(explorerRecordId(otherPartition));
  });

  it('rejects an entire page above the record limit and leaves the original list intact', () => {
    const existing = Array.from({ length: EXPLORER_MAX_RECORDS }, (_, index) => record({ offset: String(index) }));
    expect(() => mergeExplorerMessages(existing, [record()])).toThrow('1,000-record');
    expect(existing).toHaveLength(EXPLORER_MAX_RECORDS);
  });

  it('applies the byte limit to encoded Unicode payloads, not JavaScript character counts', () => {
    const original = [record()];
    const large = record({ offset: '1', value: '雪'.repeat(Math.ceil(EXPLORER_MAX_BYTES / 3)) });
    expect(() => mergeExplorerMessages(original, [large])).toThrow('16 MiB');
    expect(original).toEqual([record()]);
  });
});

// @group UnitTests > Export : Export stays faithful to loaded values and records the local filter scope
describe('message explorer export', () => {
  it('preserves raw JSON numbers, tombstones, empty values, binary encodings, and repeated headers', () => {
    const messages = [record(), record({ offset: '2', value: null }), record({ offset: '3', value: '' }), record({ offset: '4', value: '/wAB', encoding: { key: 'utf8', value: 'base64', headers: {} } })];
    const scope = { profileId: 'development', topic: 'orders', partition: 0, query: 'created', searchField: 'value' as const };
    const exported = JSON.parse(serializeExplorerExport(messages, scope));
    expect(exported).toMatchObject({ scope: 'Loaded matching records only', ...scope, count: 4 });
    expect(exported.messages).toEqual(messages);
    expect(exported.messages[0].value).toContain('9007199254740993');
    expect(exported.messages[0].headers.trace).toEqual(['first', 'SECOND']);
  });
});
