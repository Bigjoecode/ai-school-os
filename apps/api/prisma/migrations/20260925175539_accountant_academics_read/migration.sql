-- Accountants need the term list and class levels to run fees.
UPDATE "roles"
   SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['academics.read']))
 WHERE "isSystem" AND "key" = 'accountant';
