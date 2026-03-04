ALTER TABLE gear_items ADD COLUMN image_urls TEXT;

UPDATE gear_items
SET image_urls = CASE
  WHEN image_url IS NULL OR TRIM(image_url) = '' THEN NULL
  ELSE json_array(image_url)
END
WHERE image_urls IS NULL;
