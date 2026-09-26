BEGIN;

-- C 端账号：由 scripts/ 迁移后承载 /api/auth/* 的注册与登录
-- 说明：auth-service 在配置 DATABASE_URL 时使用本表，否则回退到 data/user-data/*.json 文件存储
CREATE TABLE app_users (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  username VARCHAR(64) NOT NULL UNIQUE,
  pass_hash VARCHAR(128) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_users IS 'C 端用户账号（密码 scrypt + 随机盐）';
COMMENT ON COLUMN app_users.pass_hash IS 'scrypt(password, salt) 十六进制';

CREATE INDEX idx_app_users_username ON app_users (username);

-- 收藏：与 app_users 关联，删除账号时级联清理
CREATE TABLE user_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  route_id VARCHAR(64) NOT NULL,
  route_name VARCHAR(128) NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_id)
);

COMMENT ON TABLE user_favorites IS '用户收藏线路';

CREATE INDEX idx_user_favorites_user_id ON user_favorites (user_id);
CREATE INDEX idx_user_favorites_saved_at ON user_favorites (saved_at DESC);

COMMIT;
