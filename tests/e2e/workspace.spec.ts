import { test, expect } from './fixtures/kafka-fixture';

// @group IntegrationTests > Navigation : Routes, browser history and persistent workspace controls
test('navigates through each workspace and preserves browser history', async ({ page }, testInfo) => {
  await page.goto('/topics');
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();

  for (const [label, path, heading] of [['Message explorer', '/explorer', 'Message explorer'], ['Message producer', '/producer', 'Message producer'], ['Consumer groups', '/groups', 'Consumer groups'], ['Settings', '/settings', 'Connection settings']]) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: new RegExp(`^${label}$`, 'i') }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: new RegExp(`^${heading}$`, 'i') })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-desktop.png`), fullPage: true });
  }

  await page.goBack();
  await expect(page.getByRole('heading', { name: /^Consumer groups$/i })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: /^Message producer$/i })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand sidebar' }).press('Enter');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Topics', exact: true })).toBeVisible();
});

// @group IntegrationTests > Sidebar : Compact utility actions retain keyboard access
test('keeps feedback and resource links accessible in the collapsed sidebar', async ({ page }) => {
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' });
  await expect(sidebar.getByRole('link', { name: 'GitHub', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Docker', exact: true })).toBeVisible();
  const feedback = sidebar.getByRole('button', { name: 'Send feedback', exact: true });
  await feedback.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toHaveCount(0);
  await expect(feedback).toBeFocused();
});

// @group IntegrationTests > Topics : Filtering and safe creation through the real form
test('filters topics and creates a topic with the selected partition count', async ({ page, mockApi }, testInfo) => {
  await page.goto('/topics');
  await expect(page.getByText('orders.created', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('topics-desktop.png'), fullPage: true });

  const search = page.getByPlaceholder(/Search topics/i);
  await search.fill('payments');
  await expect(page.getByText('payments.processed', { exact: true })).toBeVisible();
  await expect(page.getByText('orders.created', { exact: true })).toHaveCount(0);
  await search.fill('');

  await page.getByRole('button', { name: /^Create topic$/i }).click();
  await page.getByLabel(/^Topic name/i).fill('audit.events');
  await page.getByLabel(/^Partitions/i).fill('4');
  await page.locator('form').getByRole('button', { name: /^Create topic$/i }).click();
  await expect(page.getByText('audit.events', { exact: true })).toBeVisible();
  expect(mockApi.requests.find(request => request.method === 'POST' && request.path === '/api/topics')?.body).toMatchObject({ name: 'audit.events', partitions: 4, profileId: 'local' });
});

// @group EdgeCases > Connection : Empty, failed and recovered states
test('shows a clear empty state when the cluster has no topics', async ({ page, mockApi }) => {
  mockApi.topics = [];
  await page.goto('/topics');
  await expect(page.getByRole('heading', { name: 'Your first stream starts here' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Message producer$/i }).click();
  await expect(page.getByRole('heading', { name: /No topics available/i })).toBeVisible();
});

test('shows a connection failure and recovers on retry', async ({ page, mockApi }) => {
  mockApi.topicError = 'The test cluster is unavailable.';
  await page.goto('/topics');
  await expect(page.getByText('The test cluster is unavailable.').first()).toBeVisible();
  mockApi.topicError = null;
  await page.getByRole('button', { name: /Retry/i }).first().click();
  await expect(page.getByText('orders.created', { exact: true })).toBeVisible();
  await expect(page.getByText('The test cluster is unavailable.')).toHaveCount(0);
});

// @group IntegrationTests > Clusters : Pointer and keyboard operation of the selector
test('switches clusters by click and supports keyboard open and dismissal', async ({ page, mockApi }) => {
  await page.goto('/topics');
  const selector = page.getByRole('button', { name: 'Select cluster', exact: true });
  await selector.click();
  await expect(selector).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('menuitemradio', { name: /Staging/ }).click();
  await expect(selector).toContainText('Staging');
  await expect(selector).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => mockApi.requests.some(request => request.path === '/api/topics' && request.profileId === 'staging')).toBe(true);
  expect(mockApi.requests.some(request => request.body.action === 'switchProfile')).toBe(false);

  await selector.focus();
  await page.keyboard.press('Enter');
  await expect(selector).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(selector).toHaveAttribute('aria-expanded', 'false');
});

// @group IntegrationTests > Producer : Validate and transform content before sending
test('validates JSON, formats and minifies the message, then sends the selected payload', async ({ page, mockApi }) => {
  await page.goto('/producer');
  await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('orders.created');
  const message = page.getByLabel(/^Message value/i);
  await message.fill('{ invalid');
  await expect(page.getByText(/Invalid JSON:/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Format', exact: true })).toBeDisabled();

  await message.fill('{"orderId":42,"status":"created"}');
  await expect(page.getByText('Valid JSON', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(message).toHaveValue('{\n  "orderId": 42,\n  "status": "created"\n}');
  await page.getByRole('button', { name: 'Minify', exact: true }).click();
  await expect(message).toHaveValue('{"orderId":42,"status":"created"}');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(request => request.method === 'POST' && request.path === '/api/messages').length).toBe(1);
  expect(mockApi.requests.find(request => request.path === '/api/messages')?.body).toMatchObject({ topic: 'orders.created', profileId: 'local' });
});

// @group IntegrationTests > Consumers : Create and control a scoped consumer session
test('creates a consumer from selected topics and can start and stop it', async ({ page, mockApi }) => {
  await page.goto('/topics');
  await expect(page.getByText('orders.created', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New consumer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create consumer', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Session name/i).fill('browser-smoke-test');
  await dialog.getByRole('checkbox', { name: 'orders.created', exact: true }).check();
  await dialog.getByRole('button', { name: 'Create consumer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('browser-smoke-test', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => mockApi.requests.some(request => request.path === '/api/messages/consume')).toBe(true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  const start = mockApi.requests.find(request => request.path === '/api/messages/consume' && request.method === 'POST');
  expect(start?.body).toMatchObject({ topics: ['orders.created'], profileId: 'local' });
  expect(start?.body.groupId).toBeUndefined();
  await expect.poll(() => mockApi.requests.some(request => request.path === '/api/messages/consume' && request.method === 'DELETE' && request.body.sessionId === start?.body.sessionId)).toBe(true);
});

// @group EdgeCases > Responsive : Keep the application viewport contained on a narrow screen
test('keeps every workspace within a mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/topics', '/explorer', '/producer', '/groups', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Select cluster', exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Connected', exact: true })).toBeVisible();
    if (path === '/groups') {
      await expect(page.getByRole('table', { name: 'Consumer groups', exact: true })).toHaveAttribute('aria-busy', 'false');
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), `${path} must stay within the mobile viewport`).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-mobile.png`), fullPage: true });
  }
});

// @group IntegrationTests > TopicAdministration : Explicit cluster scope and truthful mutation results
test('edits only changed configuration values and uses the real partition request contract', async ({ page, mockApi }) => {
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Select cluster', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Staging/ }).click();
  await page.getByRole('button', { name: 'Expand configuration for orders.created', exact: true }).click();
  await page.getByRole('button', { name: 'Edit configuration for orders.created', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit topic configuration' });
  await dialog.getByLabel('retention.ms', { exact: true }).fill('3600000');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  const configRequest = mockApi.requests.find(request => request.method === 'PUT' && request.path.endsWith('/config'));
  expect(configRequest).toMatchObject({ profileId: 'staging', body: { configs: { 'retention.ms': '3600000' } } });
  expect(Object.keys(configRequest!.body.configs as object)).toEqual(['retention.ms']);
  page.once('dialog', dialog => dialog.accept('8'));
  await page.getByRole('button', { name: 'Add partitions to orders.created', exact: true }).click();
  await expect.poll(() => mockApi.requests.find(request => request.path.endsWith('/partitions'))).toMatchObject({ profileId: 'staging', body: { count: 8 } });
  await expect(page.getByRole('row').filter({ hasText: 'orders.created' }).getByText('8', { exact: true })).toBeVisible();
});

test('shows broker configuration errors instead of an empty successful editor', async ({ page, mockApi }) => {
  mockApi.configError = 'Kafka denied permission for this operation';
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Expand configuration for orders.created', exact: true }).click();
  await page.getByRole('button', { name: 'Edit configuration for orders.created', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit topic configuration' });
  await expect(dialog.getByRole('alert')).toContainText(mockApi.configError);
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

test('requires a scoped purge confirmation and reports partial bulk failures', async ({ page, mockApi }) => {
  mockApi.purgeFailures = ['payments.processed'];
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Expand configuration for orders.created', exact: true }).click();
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('orders.created');
    expect(dialog.message()).toContain('Local Kafka');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Purge messages from orders.created', exact: true }).click();
  expect(mockApi.requests.filter(request => request.path.endsWith('/cleanup'))).toEqual([]);
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('Local Kafka');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Purge all messages', exact: true }).click();
  const result = page.getByRole('alert').filter({ hasText: 'topics purged' });
  await expect(result).toContainText('2 of 3 topics purged');
  await expect(result).toContainText('payments.processed');
  expect(mockApi.requests.filter(request => request.path.endsWith('/cleanup')).every(request => request.profileId === 'local')).toBe(true);
});

// @group EdgeCases > Profiles : Durable browser selection and fail-closed configuration loading
test('keeps cluster selection local to this browser and restores it after reload', async ({ page, mockApi }) => {
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Select cluster', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Staging/ }).click();
  await expect(page.getByRole('button', { name: 'Select cluster', exact: true })).toContainText('Staging');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Select cluster', exact: true })).toContainText('Staging');
  expect(mockApi.config.activeProfileId).toBe('local');
  expect(mockApi.requests.filter(request => request.path === '/api/settings' && request.method !== 'GET')).toEqual([]);
});

test('does not silently connect to localhost when saved settings cannot load', async ({ page, mockApi }) => {
  mockApi.settingsError = 'Saved cluster configuration is unavailable';
  await page.goto('/topics');
  await expect(page.getByRole('status', { name: 'Disconnected', exact: true })).toBeVisible();
  expect(mockApi.requests.filter(request => request.path !== '/api/settings')).toEqual([]);
});

test('updates the shared cluster selection after editing and deleting profiles', async ({ page, mockApi }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.locator('#profile-name').fill('Renamed local');
  await page.locator('#profile-brokers').fill('replacement.kafka:9092');
  const readsBefore = mockApi.requests.filter(request => request.path === '/api/topics').length;
  await page.getByRole('button', { name: 'Update profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select cluster', exact: true })).toContainText('Renamed local');
  await expect.poll(() => mockApi.requests.filter(request => request.path === '/api/topics').length).toBeGreaterThan(readsBefore);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Select cluster', exact: true })).toContainText('Staging');
  await expect.poll(() => mockApi.requests.filter(request => request.path === '/api/topics').at(-1)?.profileId).toBe('staging');
});
