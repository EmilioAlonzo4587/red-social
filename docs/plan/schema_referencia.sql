-- Esquema de referencia de ChatInit (PostgreSQL 16+). Validado en PostgreSQL 16.
-- La fuente de verdad es apps/api/prisma/schema.prisma; este archivo sirve para copiar
-- lo que Prisma no expresa (extensiones, CHECK, índices parciales y GIN) a la migración.
-- Los ids los genera Prisma en la aplicación con UUID v7 (uuid(7)). El DEFAULT gen_random_uuid()
-- de aquí (UUID v4) solo existe para probar este SQL por separado: no lo copies a la migración.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda de usuarios por fragmento

-- ---------- Identidad ----------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       citext      NOT NULL UNIQUE,              -- "Juan" y "juan" son el mismo
  email          citext      NOT NULL UNIQUE,
  password_hash  text        NOT NULL,                     -- argon2id (RN02)
  display_name   varchar(80),
  bio            varchar(300),
  avatar_public_id text,                                   -- id de Cloudinary, no la URL
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,30}$')
);

-- Búsqueda de usuarios ("ana" encuentra "mariana_93" y "Ana López"); SQL manual en Prisma
CREATE INDEX users_username_trgm_idx ON users USING gin ((lower(username::text)) gin_trgm_ops);
CREATE INDEX users_display_name_trgm_idx ON users USING gin ((lower(display_name)) gin_trgm_ops);

-- Sesiones para refresh tokens con rotación (RN12)
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,                 -- nunca el token en claro
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id),
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- ---------- Contenido ----------
CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       varchar(2000),
  like_count    integer     NOT NULL DEFAULT 0 CHECK (like_count >= 0),     -- desnormalizado a propósito
  comment_count integer     NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz                                -- borrado lógico
);
-- Perfil y feed personalizado: posts de un autor por fecha (keyset pagination)
CREATE INDEX posts_author_created_idx ON posts (author_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
-- Feed global
CREATE INDEX posts_created_idx ON posts (created_at DESC, id DESC) WHERE deleted_at IS NULL;

-- "Texto o multimedia": una tabla aparte permite varias imágenes, video y borrar en Cloudinary
CREATE TABLE post_media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid     NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  public_id  text     NOT NULL,                            -- para borrar/transformar en Cloudinary
  media_type varchar(10) NOT NULL CHECK (media_type IN ('image','video')),
  width      integer,
  height     integer,
  position   smallint NOT NULL DEFAULT 0,
  UNIQUE (post_id, position)
);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    varchar(1000) NOT NULL CHECK (length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX comments_post_created_idx ON comments (post_id, created_at);
CREATE INDEX comments_author_idx ON comments (author_id);

-- ---------- Interacciones ----------
CREATE TABLE post_likes (                                  -- "Like" es palabra reservada en SQL
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    uuid        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)                           -- sin id sustituto: el par ES la identidad
);
CREATE INDEX post_likes_post_idx ON post_likes (post_id);

CREATE TABLE follows (
  follower_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_no_self CHECK (follower_id <> following_id)
);
CREATE INDEX follows_following_idx ON follows (following_id);   -- "quién me sigue"

-- ---------- Chat 1 a 1 ----------
CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_a_last_read_at timestamptz,
  user_b_last_read_at timestamptz,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_ordered CHECK (user_a_id < user_b_id),   -- la BD impone el orden, no la app
  UNIQUE (user_a_id, user_b_id)
);
CREATE INDEX conversations_b_idx ON conversations (user_b_id);
CREATE INDEX conversations_last_msg_idx ON conversations (last_message_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         varchar(2000) NOT NULL CHECK (length(btrim(content)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_created_idx ON messages (conversation_id, created_at DESC, id DESC);

-- ---------- Notificaciones (RN08) ----------
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         varchar(20) NOT NULL CHECK (type IN ('like','comment','follow','message')),
  post_id      uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id   uuid REFERENCES comments(id) ON DELETE CASCADE,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_not_self CHECK (recipient_id <> actor_id)
);
CREATE INDEX notifications_recipient_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (recipient_id) WHERE read_at IS NULL;

-- ---------- Consultas clave (referencia) ----------
-- Feed personalizado con paginación por cursor (keyset), no OFFSET:
--   SELECT p.* FROM posts p
--   WHERE p.deleted_at IS NULL
--     AND (p.author_id = $me OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id = $me))
--     AND (p.created_at, p.id) < ($cursor_created_at, $cursor_id)
--   ORDER BY p.created_at DESC, p.id DESC
--   LIMIT 20;
--
-- Búsqueda de usuarios (mínimo 2 caracteres, escapar % y _ del texto del usuario):
--   SELECT id, username, display_name, avatar_public_id FROM users
--   WHERE lower(username::text) LIKE '%' || lower($q) || '%'
--      OR lower(display_name)   LIKE '%' || lower($q) || '%'
--   ORDER BY (lower(username::text) LIKE lower($q) || '%') DESC, username
--   LIMIT 20;
--
-- Like atómico (en una transacción):
--   INSERT INTO post_likes (user_id, post_id) VALUES ($me, $post) ON CONFLICT DO NOTHING;
--   -- solo si insertó 1 fila:
--   UPDATE posts SET like_count = like_count + 1 WHERE id = $post RETURNING like_count;
