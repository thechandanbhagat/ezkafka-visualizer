## Summary
- Consolidate topic management into a single Topics view
- Remove the old Topic Manager tab and component

## What changed
- TopicList: add expand-to-view config, edit-config modal, add-partitions action, and message counts column
- KafkaVisualizer: remove Topic Manager tab and import
- Delete TopicManager component

## How to test
1. Start the dev server
2. Navigate to Topics
3. Expand a topic to view its config
4. Edit config (pencil icon) → Save → verify success
5. Add partitions (bar icon) and verify refresh shows the new count
6. Create and delete topics still work

## Screenshots
(optional)

## Notes
- UI remains compact and professional
- Message counts computed from partition offsets and displayed in a new column