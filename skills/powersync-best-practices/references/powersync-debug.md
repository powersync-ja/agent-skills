# PowerSync Debugging

Systematic approach to diagnosing and fixing PowerSync issues.

## Quick Diagnosis

Run these checks in order:

### 1. Check Connection Status

```typescript
// JavaScript
console.log('Status:', db.currentStatus);
// Expected: { connected: true, uploading: false, downloading: false, ... }

// Dart
print('Status: ${db.currentStatus}');

// Kotlin
Log.d("PowerSync", "Status: ${database.currentStatus}")

// Swift
print("Status: \(database.currentStatus)")
```

### 2. Check Upload Queue

```sql
-- Count pending uploads
SELECT COUNT(*) FROM ps_crud;

-- View pending operations
SELECT * FROM ps_crud ORDER BY id LIMIT 10;
```

## Common Issues & Solutions

### Issue: "Database not connected"

**Symptoms:** Queries work but data doesn't sync

**Diagnosis:**
```typescript
console.log(db.currentStatus.connected); // false
```

**Solutions:**
1. Ensure `connect()` is called after initialization
2. Check connector's `fetchCredentials()` returns valid token
3. Verify network connectivity to PowerSync endpoint

```typescript
// Correct initialization order
const db = new PowerSyncDatabase({ schema, database: { dbFilename: 'app.db' } });
await db.connect(connector); // Don't forget this!
```

### Issue: Sync Not Starting

**Symptoms:** Connected but no data downloading

**Diagnosis:**
Check if parameter queries return any buckets
In PowerSync dashboard or logs, verify user gets buckets

**Solutions:**
1. Verify JWT token has correct `sub` (user_id)
2. Check parameter queries return data for this user
3. Test parameter query manually:

```sql
-- In your source database, test the parameter query
SELECT org_id FROM users WHERE id = 'your-user-id';
-- Should return at least one row
```

### Issue: Missing Data

**Symptoms:** Some records don't appear on client

**Diagnosis:**
```sql
-- On client: Check what's synced
SELECT * FROM your_table WHERE expected_filter;

-- Check bucket contents
SELECT * FROM ps_buckets;
```

**Solutions:**
1. Verify data query WHERE clause uses `bucket.parameter`:
```yaml
# WRONG - parameter not used
data:
  - SELECT * FROM todos

# RIGHT - parameter filters data
data:
  - SELECT * FROM todos WHERE user_id = bucket.user_id
```

2. Ensure all bucket parameters are used in data queries
3. Check source database actually has the expected data

### Issue: Upload Queue Growing

**Symptoms:** `ps_crud` table count keeps increasing

**Diagnosis:**
```sql
SELECT COUNT(*) FROM ps_crud;
-- If this keeps growing, uploads are failing
```

**Solutions:**
1. Check `uploadData` calls `batch.complete()`:
```typescript
async uploadData(database) {
  const batch = await database.getCrudBatch();
  if (!batch) return;

  try {
    // Process operations...
    await batch.complete(); // MUST call this!
  } catch (error) {
    // DON'T call complete() on error - retry later
    throw error;
  }
}
```

2. Check backend API is returning success
3. Look for errors in connector logs

### Issue: Duplicate Data

**Symptoms:** Same record appears multiple times

**Diagnosis:**
```sql
SELECT id, COUNT(*) FROM your_table GROUP BY id HAVING COUNT(*) > 1;
```

**Solutions:**
1. Ensure client-generated IDs are unique (use UUIDs)
2. Check backend handles upserts correctly
3. Verify sync rules don't have overlapping data queries

### Issue: Slow Initial Sync

**Symptoms:** First sync takes very long

**Diagnosis:**
```typescript
db.registerListener({
  statusChanged: (status) => {
    console.log('Progress:', status);
  }
});
```

**Solutions:**
1. Review bucket sizes - should be 100s-1000s of rows, not millions
2. Use priority sync for critical data
3. Add indexes to source database on columns used in data queries
4. Consider pagination for large datasets

### Issue: Connection Keeps Dropping

**Symptoms:** Frequent disconnects and reconnects

**Diagnosis:**
```typescript
db.registerListener({
  statusChanged: (status) => {
    console.log('Connected:', status.connected, 'at', new Date());
  }
});
```

**Solutions:**
1. Check JWT token expiration - implement refresh before expiry
2. Verify network stability
3. Check PowerSync Service logs for errors
4. Increase retry delays if server is rate-limiting

### Issue: Schema Mismatch

**Symptoms:** Error about column not found or type mismatch

**Diagnosis:**
```
Error: Column 'new_column' not found in schema
```

**Solutions:**
1. Client schema must match sync rules output exactly
2. After sync rule changes, update client schema
3. May need to reset local database:
```typescript
await db.disconnectAndClear();
await db.connect(connector);
```

### Issue: Web Worker Errors (Web only)

**Symptoms:** SharedArrayBuffer errors, COOP/COEP issues

**Diagnosis:**
```
Error: SharedArrayBuffer is not defined
```

**Solutions:**
Add required headers to your web server:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Debug Logging

### JavaScript

```typescript
import { Logger } from '@powersync/web';

// Enable verbose logging
Logger.useDefaults();
Logger.setLevel(Logger.DEBUG);
```

### Dart

```dart
import 'package:logging/logging.dart';

Logger.root.level = Level.ALL;
Logger.root.onRecord.listen((record) {
  print('${record.level.name}: ${record.message}');
});
```

### Kotlin

```kotlin
// Set log level in initialization
PowerSyncDatabase(
    // ...
    logLevel = LogLevel.DEBUG
)
```

## Diagnostic Queries

```sql
-- Check bucket status
SELECT * FROM ps_buckets;

-- Count records per table
SELECT 'todos' as tbl, COUNT(*) FROM todos
UNION ALL
SELECT 'lists' as tbl, COUNT(*) FROM lists;

-- Check pending uploads
SELECT op, table_name, COUNT(*) FROM ps_crud GROUP BY op, table_name;

-- View recent operations
SELECT * FROM ps_oplog ORDER BY id DESC LIMIT 20;

-- Check for sync errors
SELECT * FROM ps_buckets WHERE last_error IS NOT NULL;
```

## Network Debugging

```bash
# Test PowerSync endpoint connectivity
curl -I https://your-instance.powersync.journeyapps.com/sync/stream

# Test with auth token
curl -H "Authorization: Bearer YOUR_JWT" \
  https://your-instance.powersync.journeyapps.com/sync/stream

# Validate JWT token (decode without verification)
echo "YOUR_JWT" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq
```

## When to Contact Support

Gather this information before contacting PowerSync support:
1. SDK version and platform
2. Error messages and stack traces
3. Output of diagnostic queries above
4. Network request/response logs
5. PowerSync Service logs (if self-hosted)
