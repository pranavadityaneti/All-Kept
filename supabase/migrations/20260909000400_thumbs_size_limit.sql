-- Thumbnails: Instagram serves post images up to about 3 MB; the bucket limit must match MAX_STORED_THUMB_BYTES (4 MB) in pipeline.ts,
-- otherwise Storage rejects the upload ("The object exceeded the maximum allowed size") and the card has no image.
update storage.buckets set file_size_limit = 4194304 where id = 'thumbs';
