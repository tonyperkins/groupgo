---
description: Add a new column to the SQLite database (no Alembic)
---

GroupGo does not use Alembic. The database uses `CREATE TABLE IF NOT EXISTS` — new columns must be added manually to the live SQLite file.

## Steps

1. Update the model in `app/models.py` — add the new field with a default value:
```python
new_field: Optional[str] = Field(default=None)
```

2. On your **local** dev database, run the ALTER TABLE directly:
```powershell
sqlite3 data/groupgo.db "ALTER TABLE poll ADD COLUMN new_field TEXT DEFAULT NULL"
```

3. On the **production** server, SSH in and run the same command:
```powershell
ssh asperkins65@portainer.homelab.lan "sqlite3 /opt/groupgo/data/groupgo.db 'ALTER TABLE poll ADD COLUMN new_field TEXT DEFAULT NULL'"
```

4. Deploy normally (the `CREATE TABLE IF NOT EXISTS` in `db.py` will not touch existing tables).

## Notes
- SQLite `ALTER TABLE` only supports `ADD COLUMN` — you cannot rename or drop columns without recreating the table.
- If you need to rename a column or change a type, you must: create a new table, copy data, drop old table, rename new table. This is risky on production — always back up first.
- To back up the production DB before a risky migration:
```powershell
ssh asperkins65@portainer.homelab.lan "cp /opt/groupgo/data/groupgo.db /opt/groupgo/data/groupgo.db.bak"
```
