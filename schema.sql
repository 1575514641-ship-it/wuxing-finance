-- 五行理财 App · Supabase 数据库升级脚本
-- 在 Supabase SQL Editor 里完整粘贴执行一次即可。
-- 作用：
-- 1. 保留原 user_data 单表 JSONB 存储。
-- 2. 移除“所有人可读写”的旧 RLS 策略。
-- 3. 改为通过 RPC 函数读写，并用同步码里的 secret 校验身份。
-- 4. 不依赖 pgcrypto 扩展，避免 Supabase 扩展 schema 差异导致 crypt() 不可用。

CREATE TABLE IF NOT EXISTS public.user_data (
  user_id     TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS secret_hash TEXT;

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_data_all ON public.user_data;
DROP POLICY IF EXISTS user_data_read_own ON public.user_data;
DROP POLICY IF EXISTS user_data_write_own ON public.user_data;

-- 不创建直接访问策略：anon 不能直接 select/insert/update/delete 表。
-- App 只通过下面两个 SECURITY DEFINER 函数访问。

CREATE OR REPLACE FUNCTION public.finance_load_data(
  p_user_id TEXT,
  p_secret TEXT
)
RETURNS TABLE (
  data JSONB,
  updated_at TIMESTAMPTZ,
  protected BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.data,
         u.updated_at,
         (u.secret_hash IS NOT NULL) AS protected
  FROM public.user_data AS u
  WHERE u.user_id = p_user_id
    AND (
      u.secret_hash IS NULL
      OR u.secret_hash = md5(p_secret)
    )
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_save_data(
  p_user_id TEXT,
  p_secret TEXT,
  p_data JSONB,
  p_updated_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  data JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) < 16 THEN
    RAISE EXCEPTION 'invalid user id';
  END IF;

  IF p_secret IS NULL OR length(trim(p_secret)) < 24 THEN
    RAISE EXCEPTION 'invalid sync secret';
  END IF;

  INSERT INTO public.user_data (user_id, secret_hash, data, updated_at)
  VALUES (
    p_user_id,
    md5(p_secret),
    COALESCE(p_data, '{}'::jsonb),
    COALESCE(p_updated_at, now())
  )
  ON CONFLICT (user_id) DO UPDATE
    SET secret_hash = COALESCE(public.user_data.secret_hash, EXCLUDED.secret_hash),
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    WHERE public.user_data.secret_hash IS NULL
       OR public.user_data.secret_hash = md5(p_secret);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync secret mismatch';
  END IF;

  RETURN QUERY
  SELECT u.data, u.updated_at
  FROM public.user_data AS u
  WHERE u.user_id = p_user_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON public.user_data FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_load_data(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_save_data(TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_load_data(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_save_data(TEXT, TEXT, JSONB, TIMESTAMPTZ) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_user_data_updated ON public.user_data (updated_at DESC);

-- 提醒 Supabase PostgREST 刷新函数缓存。
NOTIFY pgrst, 'reload schema';
