-- Insert establishments permissions
INSERT INTO "permissions" ("code", "description") VALUES
  ('establishments.list', 'Listar estabelecimentos'),
  ('establishments.create', 'Criar estabelecimento'),
  ('establishments.read', 'Ler dados do estabelecimento'),
  ('establishments.edit', 'Editar estabelecimento'),
  ('establishments.delete', 'Deletar estabelecimento')
ON CONFLICT ("code") DO NOTHING;

-- Assign establishments permissions to OWNER (all)
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
  ('OWNER', 'establishments.list'),
  ('OWNER', 'establishments.create'),
  ('OWNER', 'establishments.read'),
  ('OWNER', 'establishments.edit'),
  ('OWNER', 'establishments.delete')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Assign establishments permissions to ADMIN (all)
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
  ('ADMIN', 'establishments.list'),
  ('ADMIN', 'establishments.create'),
  ('ADMIN', 'establishments.read'),
  ('ADMIN', 'establishments.edit'),
  ('ADMIN', 'establishments.delete')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Assign establishments permissions to MEMBER (list + read only)
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
  ('MEMBER', 'establishments.list'),
  ('MEMBER', 'establishments.read')
ON CONFLICT ("role", "permission_code") DO NOTHING;