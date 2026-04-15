-- ============================================================
-- 汤圆畅想屋 — Supabase Database Setup
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Works table — stores artwork metadata
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '未命名作品',
  category TEXT NOT NULL DEFAULT 'photography',
  subcategory TEXT DEFAULT '',
  media_type TEXT DEFAULT 'image',
  description TEXT DEFAULT '',
  storage_path TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Custom subcategories table — stores user-added/removed subcategories
CREATE TABLE custom_subcategories (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  sub_key TEXT NOT NULL,
  sub_label TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'added', -- 'added' or 'removed'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, sub_key, action)
);

-- 3. Enable Row Level Security
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_subcategories ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — allow public read, anon write (admin auth is handled client-side)
-- Works: anyone can read
CREATE POLICY "works_select_all" ON works FOR SELECT USING (true);
-- Works: anyone can insert (admin check is client-side password)
CREATE POLICY "works_insert_all" ON works FOR INSERT WITH CHECK (true);
-- Works: anyone can update
CREATE POLICY "works_update_all" ON works FOR UPDATE USING (true);
-- Works: anyone can delete
CREATE POLICY "works_delete_all" ON works FOR DELETE USING (true);

-- Subcategories: same open policies
CREATE POLICY "subcats_select_all" ON custom_subcategories FOR SELECT USING (true);
CREATE POLICY "subcats_insert_all" ON custom_subcategories FOR INSERT WITH CHECK (true);
CREATE POLICY "subcats_update_all" ON custom_subcategories FOR UPDATE USING (true);
CREATE POLICY "subcats_delete_all" ON custom_subcategories FOR DELETE USING (true);

-- 5. Create storage bucket for artwork media files
INSERT INTO storage.buckets (id, name, public)
VALUES ('artworks', 'artworks', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies — public read, anon upload/delete
CREATE POLICY "artworks_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'artworks');

CREATE POLICY "artworks_anon_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'artworks');

CREATE POLICY "artworks_anon_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'artworks');

CREATE POLICY "artworks_anon_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'artworks');
