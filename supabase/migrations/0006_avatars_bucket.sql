-- ============================================================
-- 0006: 프로필 아바타 이미지 저장소
--
-- - 'avatars' 버킷 (public 읽기, 5 MB 제한, 이미지만)
-- - 경로 구조: {user_id}/{filename}
-- - 본인 폴더 OR 매니저만 쓰기 가능
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 누구나 읽기 (public 버킷이지만 명시)
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- 본인 폴더에 업로드 OR 매니저
drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_manager()
    )
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_manager()
    )
  );

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_manager()
    )
  );
