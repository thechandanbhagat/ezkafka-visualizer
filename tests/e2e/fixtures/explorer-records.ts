import type { BrowseMessagesResponse, ExplorerMessage } from '../../../src/models/message-explorer';

// @group TestHelpers : Exact offsets, nullable records and binary data for the real explorer UI
export function explorerRecord(offset = '9007199254740993', overrides: Partial<ExplorerMessage> = {}): ExplorerMessage {
  return {
    topic: 'orders.created', partition: 0, offset, timestamp: '2026-10-19T12:00:00.000Z',
    key: 'order-42', value: '{"orderId":9007199254740993,"status":"created"}',
    headers: { source: 'checkout', tags: ['priority', 'europe'] },
    encoding: { key: 'utf8', value: 'utf8', headers: { source: 'utf8', tags: ['utf8', 'utf8'] } },
    ...overrides,
  };
}

export function explorerBatch(messages?: ExplorerMessage[]): BrowseMessagesResponse {
  return {
    messages: messages ?? [
      explorerRecord(),
      explorerRecord('9007199254740994', { key: 'deleted-order', value: null, headers: {} }),
      explorerRecord('9007199254740995', { key: null, value: '', headers: {} }),
      explorerRecord('9007199254740996', { key: 'binary-order', value: '/wAB', headers: {}, encoding: { key: 'utf8', value: 'base64', headers: {} } }),
    ],
    nextCursor: null, lowOffset: '9007199254740900', highOffset: '9007199254740997',
    complete: true, timedOut: false, warnings: [],
  };
}
