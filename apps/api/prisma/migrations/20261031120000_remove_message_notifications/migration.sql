-- Los mensajes ya no se guardan como notificación (S4-15, RN08): llenaban la bandeja de
-- notificaciones con algo que ya vive en la bandeja del chat. El aviso emergente sale de
-- conversation:updated. Se borran las que existían y el tipo deja de ser válido.
DELETE FROM "notifications" WHERE "type" = 'message';
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('like', 'comment', 'follow', 'reply'));
