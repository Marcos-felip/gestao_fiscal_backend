-- O papel MEMBER passa a nascer sem nenhuma permissão: todo o acesso de um MEMBER
-- vem exclusivamente dos perfis de permissão vinculados a ele.
--
-- ATENÇÃO: após esta migration, todos os MEMBERs existentes ficam sem acesso até
-- receberem um perfil (POST /permission-profiles + PUT /memberships/:id/profiles).

DELETE FROM "company_role_permissions" WHERE "role" = 'MEMBER';

-- As linhas de MEMBER em "role_permissions" são preservadas de propósito: a tabela
-- deixou de ser copiada para MEMBER na criação da empresa (CompaniesService.create
-- filtra o papel), mas o conjunto continua servindo de referência para montar o
-- primeiro perfil de cada empresa.
