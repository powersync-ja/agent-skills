# Sync Rules Reference

Sync rules define how data is partitioned into buckets and distributed to clients. This is considered legacy, however will still be supported. For the best experience use [sync-streams](./sync-streams.md).

## Structure

```yaml
bucket_definitions:
  bucket_name:
    parameters: SELECT ...   # Which buckets user can access
    data:                    # What data goes in each bucket
      - SELECT ... WHERE column = bucket.parameter
```

## Parameter Queries

Determine bucket access for authenticated users:

```yaml
# User's own data
parameters: SELECT request.user_id() AS user_id

# From database table
parameters: SELECT org_id FROM users WHERE id = request.user_id()

# From JWT claims
parameters: SELECT request.jwt() ->> 'tenant_id' AS tenant_id

# From client parameters
parameters: SELECT request.parameters() ->> 'workspace_id' AS workspace_id
```

## Data Queries

Define what rows go into each bucket:

```yaml
data:
  # Basic - all columns
  - SELECT * FROM documents WHERE user_id = bucket.user_id

  # Column selection
  - SELECT id, name, created_at FROM projects WHERE org_id = bucket.org_id

  # Transformations
  - SELECT id, UPPER(status) as status FROM tasks WHERE team_id = bucket.team_id
```

## Supported SQL Features

### Functions

| Category | Functions |
|----------|-----------|
| String | `upper()`, `lower()`, `substring()`, `length()`, `hex()`, `base64()` |
| JSON | `json_extract()`, `->`, `->>`, `json_array_length()`, `json_valid()` |
| Type | `typeof()`, `cast()` |
| Utility | `ifnull()`, `iif()`, `uuid_blob()` |
| Date/Time | `unixepoch()`, `datetime()` |
| Geospatial | `st_asgeojson()`, `st_astext()`, `st_x()`, `st_y()` |

### Operators (non-parameter comparisons)

- Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `AND`, `OR`, `NOT`, `IS`, `IS NOT`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- String: `||` (concatenation)
- Null: `IS NULL`, `IS NOT NULL`

### Parameter Comparisons (bucket.* or token_parameters.*)

Only `=` and `IN` supported:
```yaml
# Allowed
WHERE user_id = bucket.user_id
WHERE bucket.role IN roles_array

# NOT allowed
WHERE user_id > bucket.user_id
WHERE upper(bucket.name) = column
```

## Not Supported

- JOINs (in data queries)
- GROUP BY, HAVING
- ORDER BY, LIMIT, OFFSET, DISTINCT
- Subqueries, CTEs
- Window functions
- `COALESCE()` - use `ifnull()` instead

## Common Patterns

### Personal Data

```yaml
bucket_definitions:
  my_data:
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM notes WHERE owner_id = bucket.user_id
      - SELECT * FROM settings WHERE user_id = bucket.user_id
```

### Team/Organization

```yaml
bucket_definitions:
  team_data:
    parameters: |
      SELECT team_id FROM team_members
      WHERE user_id = request.user_id()
    data:
      - SELECT * FROM projects WHERE team_id = bucket.team_id
      - SELECT * FROM tasks WHERE team_id = bucket.team_id
```

### Role-Based Access

```yaml
bucket_definitions:
  admin_data:
    parameters: |
      SELECT 1 AS is_admin FROM users
      WHERE id = request.user_id() AND role = 'admin'
    data:
      - SELECT * FROM audit_logs WHERE bucket.is_admin = 1
```

### Global Data (all users)

```yaml
bucket_definitions:
  global:
    parameters: SELECT 'global' AS scope
    data:
      - SELECT * FROM app_config WHERE bucket.scope = 'global'
```

### Team-Based Access

```yaml
bucket_definitions:
  team_data:
    parameters: |
      SELECT team_id
      FROM team_members
      WHERE user_id = request.user_id()
    data:
      - SELECT * FROM projects WHERE team_id = bucket.team_id
      - SELECT * FROM tasks WHERE team_id = bucket.team_id
```

### Multi-Tenant Organization

```yaml
bucket_definitions:
  org_data:
    parameters: |
      SELECT org_id
      FROM users
      WHERE id = request.user_id()
    data:
      - SELECT * FROM documents WHERE org_id = bucket.org_id
      - SELECT * FROM folders WHERE org_id = bucket.org_id

  # User's private data within org
  private_data:
    parameters: |
      SELECT org_id, request.user_id() AS user_id
      FROM users
      WHERE id = request.user_id()
    data:
      - SELECT * FROM drafts WHERE org_id = bucket.org_id AND author_id = bucket.user_id
```

### Role-Based Access

```yaml
bucket_definitions:
  admin_data:
    parameters: |
      SELECT 1 AS is_admin
      FROM users
      WHERE id = request.user_id() AND role = 'admin'
    data:
      - SELECT * FROM audit_logs WHERE bucket.is_admin = 1
      - SELECT * FROM system_settings WHERE bucket.is_admin = 1

  user_data:
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM user_documents WHERE user_id = bucket.user_id
```

### Global Data (All Users)

```yaml
bucket_definitions:
  global:
    - SELECT * FROM app_config 
    - SELECT * FROM categories
```

### JWT Claims

```yaml
bucket_definitions:
  tenant_data:
    parameters: |
      SELECT request.jwt() ->> 'tenant_id' AS tenant_id
    data:
      - SELECT * FROM records WHERE tenant_id = bucket.tenant_id
```