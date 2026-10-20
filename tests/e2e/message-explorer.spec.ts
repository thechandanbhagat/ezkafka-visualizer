import { test, expect } from './fixtures/kafka-fixture';
import { explorerBatch, explorerRecord } from './fixtures/explorer-records';

// @group IntegrationTests > Exploration : Scoped navigation and exact record inspection
test('opens a topic in the explorer and inspects JSON, tombstones and binary payloads', async ({ page, mockApi }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Browse messages in orders.created', exact: true }).click();
  await expect(page).toHaveURL(/\/explorer\?topic=orders.created$/);
  await expect(page.getByRole('heading', { name: 'Message explorer', exact: true })).toBeVisible();
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('orders.created');
  expect(mockApi.requests.filter(request => request.path === '/api/messages/browse')).toHaveLength(0);
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect offset 9007199254740993', exact: true }).click();
  await expect(page.locator('pre').filter({ hasText: 'orderId' })).toContainText('9007199254740993');
  await expect(page.getByText('priority', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Raw value', exact: true }).click();
  await expect(page.locator('pre').filter({ hasText: 'orderId' })).toHaveText('{"orderId":9007199254740993,"status":"created"}');
  await page.locator('#workspace-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('message-explorer-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Inspect offset 9007199254740994', exact: true }).click();
  await expect(page.getByText(/Tombstone/i).last()).toBeVisible();
  await page.getByRole('button', { name: 'Inspect offset 9007199254740996', exact: true }).click();
  await expect(page.getByText(/base64/i).last()).toBeVisible();
  expect(mockApi.requests.find(request => request.path === '/api/messages/browse')?.body).toMatchObject({ profileId: 'local', topic: 'orders.created', partition: 0, start: { kind: 'latest' } });
  expect(mockApi.requests.some(request => request.path === '/api/messages')).toBe(false);
});

test('searches only loaded records, includes repeated headers, and exports matching records', async ({ page }) => {
  await page.goto('/explorer?topic=orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect offset 9007199254740993', exact: true })).toBeVisible();
  await page.getByLabel('Search loaded records', { exact: true }).fill('EUROPE');
  await expect(page.getByRole('button', { name: /^Inspect offset / })).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export matching JSON', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  const payload = JSON.parse(Buffer.concat(parts).toString('utf8'));
  // The exported raw value and offsets must remain exact strings.
  const records = Array.isArray(payload) ? payload : payload.messages;
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ offset: '9007199254740993', headers: { tags: ['priority', 'europe'] } });
  expect(records[0].value).toContain('9007199254740993');
  await page.getByLabel('Search loaded records', { exact: true }).fill('no-such-key');
  await expect(page.getByRole('button', { name: /^Inspect offset / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export matching JSON', exact: true })).toBeDisabled();
});

// @group IntegrationTests > Pagination : A bounded snapshot continues without changing its selected cluster
test('loads the next batch using the original snapshot cursor', async ({ page, mockApi }) => {
  const cursor = { profileId: 'local', topic: 'orders.created', partition: 0, connectionId: 'test-connection', nextOffset: '9007199254740994', endOffset: '9007199254740997' };
  mockApi.explorerBatches = [
    { ...explorerBatch([explorerRecord()]), nextCursor: cursor, complete: false },
    explorerBatch([explorerRecord('9007199254740994', { key: 'order-43', value: 'second record' })]),
  ];
  await page.goto('/explorer?topic=orders.created');
  await page.getByLabel('Start at', { exact: true }).selectOption('earliest');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await page.getByRole('button', { name: 'Next batch', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Inspect offset / })).toHaveCount(2);
  const requests = mockApi.requests.filter(request => request.path === '/api/messages/browse');
  expect(requests[1].body).toMatchObject({ profileId: 'local', topic: 'orders.created', partition: 0, cursor });
  await expect(page.getByRole('button', { name: 'Next batch', exact: true })).toBeDisabled();
});

test('sends exact offsets and selected partitions without rounding', async ({ page, mockApi }) => {
  await page.goto('/explorer?topic=orders.created');
  await page.getByLabel('Partition', { exact: true }).selectOption('2');
  await page.getByLabel('Start at', { exact: true }).selectOption('offset');
  await page.getByLabel('Offset', { exact: true }).fill('9007199254740993');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect.poll(() => mockApi.requests.find(request => request.path === '/api/messages/browse')?.body).toMatchObject({ partition: 2, start: { kind: 'offset', offset: '9007199254740993' } });
});

// @group EdgeCases > Requests : Failures, cancellation and cluster changes do not leak stale results
test('shows a browse failure and recovers through retry', async ({ page, mockApi }) => {
  mockApi.explorerError = 'Kafka denied permission to read this partition';
  await page.goto('/explorer?topic=orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: mockApi.explorerError })).toBeVisible();
  mockApi.explorerError = null;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect offset 9007199254740993', exact: true })).toBeVisible();
});

test('discards an in-flight browse when the selected cluster changes', async ({ page, mockApi }) => {
  mockApi.explorerDelayMs = 800;
  await page.goto('/explorer?topic=orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(request => request.path === '/api/messages/browse').length).toBe(1);
  await page.getByRole('button', { name: 'Select cluster', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Staging/ }).click();
  await expect(page.getByRole('button', { name: 'Select cluster', exact: true })).toContainText('Staging');
  await page.waitForTimeout(1000);
  await expect(page.getByRole('button', { name: /^Inspect offset / })).toHaveCount(0);
  mockApi.explorerDelayMs = 0;
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect offset 9007199254740993', exact: true })).toBeVisible();
  expect(mockApi.requests.filter(request => request.path === '/api/messages/browse').at(-1)?.body.profileId).toBe('staging');
});

test('contains loaded records and details within a mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explorer?topic=orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect offset 9007199254740993', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('message-explorer-mobile.png'), fullPage: true });
});

// @group EdgeCases > EmptyAndCancellation : Boundaries remain explicit even without records
test('shows an empty snapshot and distinguishes a partial timeout from completion', async ({ page, mockApi }) => {
  mockApi.explorerBatches = [explorerBatch([])];
  await page.goto('/explorer?topic=orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect(page.getByText('Snapshot complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next batch', exact: true })).toBeDisabled();
  mockApi.explorerBatches = [{
    ...explorerBatch([explorerRecord()]), complete: false, timedOut: true,
    nextCursor: { profileId: 'local', topic: 'orders.created', partition: 0, connectionId: 'test-connection', nextOffset: '9007199254740994', endOffset: '9007199254740997' },
    warnings: ['The read deadline was reached. Continue from the returned cursor.'],
  }];
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect(page.getByText('The read deadline was reached. Continue from the returned cursor.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next batch', exact: true })).toBeEnabled();
});

test('cancels a request and ignores its late response', async ({ page, mockApi }) => {
  mockApi.explorerDelayMs = 700;
  await page.goto('/explorer?topic=orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(request => request.path === '/api/messages/browse').length).toBe(1);
  await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load messages', exact: true })).toBeEnabled();
  await page.waitForTimeout(850);
  await expect(page.getByRole('button', { name: /^Inspect offset / })).toHaveCount(0);
});

test('validates offsets before a request and converts timestamp input to ISO', async ({ page, mockApi }) => {
  await page.goto('/explorer?topic=orders.created');
  await page.getByLabel('Start at', { exact: true }).selectOption('offset');
  await page.getByLabel('Offset', { exact: true }).fill('9223372036854775808');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'offset' })).toBeVisible();
  expect(mockApi.requests.filter(request => request.path === '/api/messages/browse')).toHaveLength(0);
  await page.getByLabel('Start at', { exact: true }).selectOption('timestamp');
  await page.getByLabel('Timestamp', { exact: true }).fill('2026-10-19T12:30');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(request => request.path === '/api/messages/browse').length).toBe(1);
  const start = mockApi.requests.find(request => request.path === '/api/messages/browse')!.body.start as { kind: string; timestamp: string };
  expect(start.kind).toBe('timestamp');
  expect(start.timestamp).toMatch(/^2026-10-19T\d{2}:30:00\.000Z$/);
});

test('copies the exact raw value and keeps unavailable topic links unselected', async ({ page, context, mockApi }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/explorer?topic=missing.topic');
  await expect(page.getByRole('alert').filter({ hasText: 'topic is no longer available' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load messages', exact: true })).toBeDisabled();
  expect(mockApi.requests.filter(request => request.path === '/api/messages/browse')).toHaveLength(0);
  await page.getByLabel('Topic', { exact: true }).selectOption('orders.created');
  await page.getByRole('button', { name: 'Load messages', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect offset 9007199254740993', exact: true }).click();
  await page.getByRole('button', { name: 'Copy value', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('{"orderId":9007199254740993,"status":"created"}');
});
