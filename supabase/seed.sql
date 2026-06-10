-- supabase/seed.sql
-- Safe, idempotent seed data for XNEXT Adventure Radar testing.
-- 
-- PURPOSE:
--   - Provides 15 sample published quests with valid `location_point` (geography)
--     clustered around Pasco / Tri-Cities, WA (approx 46.24, -119.10).
--   - Designed to be returned by the `find_quests_nearby` RPC (014 + 015).
--   - Varied experience_class, sq_score (high scores near center for interesting Radar results),
--     descriptions, cities, and tags.
--   - All status = 'published' and location_point IS NOT NULL (satisfies RPC filter).
--
-- USAGE (after migrations are pushed):
--   Option 1 (recommended with Supabase CLI):
--     supabase db seed
--
--   Option 2 (manual, using connection string from Supabase Dashboard > Settings > Database):
--     psql "postgresql://postgres:YOUR-PASSWORD@db.your-project-ref.supabase.co:5432/postgres" -f supabase/seed.sql
--
--   Option 3 (SQL Editor in Supabase Dashboard - paste and run):
--     (Copy the INSERT block below)
--
-- SAFETY:
--   - Uses ON CONFLICT (id) DO NOTHING so it is safe to re-run.
--   - Does NOT truncate existing data.
--   - Uses fixed UUIDs for reproducibility.
--   - created_by uses a placeholder test UUID. 
--     IMPORTANT: Create a test user in Supabase Auth (or adjust the UUID) if RLS on quests requires it.
--     For local/dev with service role or relaxed RLS during seeding, it works as-is.
--   - organization_id is left NULL (allowed per schema).
--   - Assumes the quests table + enums (from your base migrations 001-013) + PostGIS already exist.
--   - No real secrets or API keys.
--
-- VERIFICATION (after seeding, run this in SQL Editor or psql):
--   SELECT 
--     id, 
--     title, 
--     experience_class, 
--     sq_score, 
--     distance_km, 
--     lat, 
--     lng,
--     city
--   FROM find_quests_nearby(46.24, -119.10, 25, 10, 0)
--   ORDER BY distance_km ASC, sq_score DESC NULLS LAST;
--
-- Expected: 8-12+ rows returned within ~25km of Pasco center, with high-SQ items near top for small radii.

-- Use a consistent test user UUID for created_by (replace if you have a real test profile)
DO $$
DECLARE
  test_user_id uuid := '11111111-1111-1111-1111-111111111111';
BEGIN

INSERT INTO public.quests (
  id, created_by, slug, title, description, experience_class,
  location_name, location_point, city, country_code, tags,
  is_sponsored, status, sq_score, published_at, created_at, updated_at,
  media_urls, metadata, location_radius_m
) VALUES 
-- 1. High SQ near center (Pasco) - should show in small radius Radar
(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  test_user_id,
  'columbia-river-kayak-pasco',
  'Columbia River Kayak Adventure',
  'Paddle serene waters of the Columbia River at sunset. Perfect for beginners and photographers. Bring your own kayak or rent locally.',
  'wonder',
  'Columbia River Boat Launch',
  ST_GeogFromText('SRID=4326;POINT(-119.1006 46.2396)'),
  'Pasco',
  'US',
  ARRAY['water', 'kayak', 'sunset', 'local'],
  false,
  'published',
  92,
  now() - interval '3 days',
  now() - interval '14 days',
  now() - interval '1 day',
  '[]'::jsonb,
  '{}'::jsonb,
  3000
),
-- 2. High SQ very close
(
  'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid,
  test_user_id,
  'pasco-farmers-market-discovery',
  'Pasco Farmers Market Discovery',
  'Explore fresh local produce, artisanal goods, and live music at the historic Pasco Farmers Market. Great for families and foodies.',
  'opportunity',
  'Pasco Farmers Market',
  ST_GeogFromText('SRID=4326;POINT(-119.095 46.242)'),
  'Pasco',
  'US',
  ARRAY['food', 'market', 'family', 'local'],
  false,
  'published',
  88,
  now() - interval '1 day',
  now() - interval '10 days',
  now() - interval '2 hours',
  '[]'::jsonb,
  '{}'::jsonb,
  1500
),
-- 3. Transformation - personal growth themed
(
  'c3d4e5f6-a7b8-9012-cdef-23456789012a'::uuid,
  test_user_id,
  'tri-cities-mindfulness-hike',
  'Tri-Cities Mindfulness Hike at Badger Mountain',
  'Guided mindfulness hike with panoramic views. Focus on presence, gratitude, and connection with the high desert landscape.',
  'transformation',
  'Badger Mountain Trailhead',
  ST_GeogFromText('SRID=4326;POINT(-119.145 46.215)'),
  'Richland',
  'US',
  ARRAY['hike', 'mindfulness', 'nature', 'wellness'],
  false,
  'published',
  85,
  now() - interval '5 days',
  now() - interval '20 days',
  now() - interval '3 days',
  '[]'::jsonb,
  '{}'::jsonb,
  5000
),
-- 4. Connection - social
(
  'd4e5f6a7-b8c9-0123-defa-34567890123b'::uuid,
  test_user_id,
  'kennewick-community-potluck',
  'Kennewick Community Garden Potluck & Stories',
  'Join locals for a potluck dinner in the community garden. Share stories, recipes, and build real connections.',
  'connection',
  'Kennewick Community Garden',
  ST_GeogFromText('SRID=4326;POINT(-119.18 46.20)'),
  'Kennewick',
  'US',
  ARRAY['community', 'food', 'stories', 'social'],
  false,
  'published',
  78,
  now() - interval '2 days',
  now() - interval '8 days',
  now() - interval '1 day',
  '[]'::jsonb,
  '{}'::jsonb,
  2000
),
-- 5. Wonder - scenic
(
  'e5f6a7b8-c9d0-1234-efab-45678901234c'::uuid,
  test_user_id,
  'ice-harbor-dam-sunset',
  'Ice Harbor Dam Sunset Photography',
  'Capture stunning golden hour reflections over the Snake River. Bring tripod and enjoy the engineering marvel at dusk.',
  'wonder',
  'Ice Harbor Dam Overlook',
  ST_GeogFromText('SRID=4326;POINT(-118.95 46.25)'),
  'Pasco',
  'US',
  ARRAY['photography', 'sunset', 'river', 'scenic'],
  false,
  'published',
  81,
  now() - interval '4 days',
  now() - interval '12 days',
  now() - interval '2 days',
  '[]'::jsonb,
  '{}'::jsonb,
  4000
),
-- 6. Opportunity - local business
(
  'f6a7b8c9-d0e1-2345-fabc-56789012345d'::uuid,
  test_user_id,
  'richland-wine-tasting',
  'Richland Wine Tasting at Local Vineyard',
  'Sample award-winning Washington wines with a sommelier. Learn about the unique terroir of the Columbia Valley.',
  'opportunity',
  'Tagaris Winery',
  ST_GeogFromText('SRID=4326;POINT(-119.28 46.28)'),
  'Richland',
  'US',
  ARRAY['wine', 'tasting', 'local', 'adult'],
  false,
  'published',
  75,
  now() - interval '6 days',
  now() - interval '18 days',
  now() - interval '4 days',
  '[]'::jsonb,
  '{}'::jsonb,
  8000
),
-- 7. Transformation - challenge
(
  'a7b8c9d0-e1f2-3456-abcd-67890123456e'::uuid,
  test_user_id,
  'pasco-5k-charity-run',
  'Pasco Riverfront 5K Charity Run',
  'Run or walk the scenic riverfront path. All proceeds support local youth programs. Prizes for top finishers.',
  'transformation',
  'Pasco Riverfront Park',
  ST_GeogFromText('SRID=4326;POINT(-119.08 46.235)'),
  'Pasco',
  'US',
  ARRAY['running', 'charity', 'fitness', 'community'],
  false,
  'published',
  69,
  now() - interval '7 days',
  now() - interval '25 days',
  now() - interval '5 days',
  '[]'::jsonb,
  '{}'::jsonb,
  10000
),
-- 8. Connection - family
(
  'b8c9d0e1-f2a3-4567-bcde-78901234567f'::uuid,
  test_user_id,
  'kennewick-family-fishing',
  'Family Fishing Clinic on the Columbia',
  'Learn to fish with experienced local guides. All equipment provided. Kid-friendly and great for first-timers.',
  'connection',
  'Columbia River Fishing Access',
  ST_GeogFromText('SRID=4326;POINT(-119.13 46.26)'),
  'Kennewick',
  'US',
  ARRAY['fishing', 'family', 'outdoors', 'kids'],
  false,
  'published',
  82,
  now() - interval '3 days',
  now() - interval '15 days',
  now() - interval '1 day',
  '[]'::jsonb,
  '{}'::jsonb,
  6000
),
-- 9. Wonder - unique
(
  'c9d0e1f2-a3b4-5678-cdef-89012345678a'::uuid,
  test_user_id,
  'richland-lavender-farm',
  'Richland Lavender Farm Evening Tour',
  'Stroll through fragrant lavender fields at golden hour. Learn about sustainable farming and make your own sachet.',
  'wonder',
  'Desert Wind Lavender',
  ST_GeogFromText('SRID=4326;POINT(-119.22 46.31)'),
  'Richland',
  'US',
  ARRAY['lavender', 'farm', 'scent', 'tour'],
  false,
  'published',
  79,
  now() - interval '9 days',
  now() - interval '22 days',
  now() - interval '3 days',
  '[]'::jsonb,
  '{}'::jsonb,
  2500
),
-- 10. Opportunity - professional
(
  'd0e1f2a3-b4c5-6789-defa-90123456789b'::uuid,
  test_user_id,
  'tri-cities-networking-breakfast',
  'Tri-Cities Young Professionals Networking Breakfast',
  'Connect with local entrepreneurs and professionals. Light breakfast provided. Bring business cards.',
  'opportunity',
  'Pasco Convention Center',
  ST_GeogFromText('SRID=4326;POINT(-119.09 46.23)'),
  'Pasco',
  'US',
  ARRAY['networking', 'professional', 'breakfast', 'business'],
  false,
  'published',
  64,
  now() - interval '1 day',
  now() - interval '5 days',
  now() - interval '12 hours',
  '[]'::jsonb,
  '{}'::jsonb,
  12000
),
-- 11. Transformation - reflective
(
  'e1f2a3b4-c5d6-7890-efab-01234567890c'::uuid,
  test_user_id,
  'badger-mountain-sunset-meditation',
  'Badger Mountain Sunset Meditation Walk',
  'A gentle walk to the summit followed by a 20-minute guided meditation as the sun sets over the valley.',
  'transformation',
  'Badger Mountain Summit',
  ST_GeogFromText('SRID=4326;POINT(-119.16 46.205)'),
  'Richland',
  'US',
  ARRAY['meditation', 'sunset', 'hike', 'wellness'],
  false,
  'published',
  91,
  now() - interval '8 days',
  now() - interval '30 days',
  now() - interval '6 days',
  '[]'::jsonb,
  '{}'::jsonb,
  7000
),
-- 12. Wonder - cultural
(
  'f2a3b4c5-d6e7-8901-fabc-12345678901d'::uuid,
  test_user_id,
  'pasco-hispanic-heritage-festival',
  'Pasco Hispanic Heritage Festival',
  'Celebrate culture with music, dance, food, and art from the rich Hispanic communities of the Tri-Cities.',
  'wonder',
  'Pasco Special Events Center',
  ST_GeogFromText('SRID=4326;POINT(-119.11 46.24)'),
  'Pasco',
  'US',
  ARRAY['festival', 'culture', 'music', 'food'],
  false,
  'published',
  73,
  now() - interval '10 days',
  now() - interval '35 days',
  now() - interval '7 days',
  '[]'::jsonb,
  '{}'::jsonb,
  4000
),
-- 13. Connection - casual
(
  'a3b4c5d6-e7f8-9012-abcd-23456789012e'::uuid,
  test_user_id,
  'kennewick-board-game-night',
  'Kennewick Weekly Board Game Night',
  'Casual board game night at a local cafe. All skill levels welcome. New games introduced each week.',
  'connection',
  'The Local Bean Cafe',
  ST_GeogFromText('SRID=4326;POINT(-119.19 46.21)'),
  'Kennewick',
  'US',
  ARRAY['games', 'social', 'casual', 'indoor'],
  false,
  'published',
  66,
  now() - interval '2 days',
  now() - interval '6 days',
  now() - interval '4 hours',
  '[]'::jsonb,
  '{}'::jsonb,
  3000
),
-- 14. Opportunity - adventure
(
  'b4c5d6e7-f8a9-0123-bcde-34567890123f'::uuid,
  test_user_id,
  'tri-cities-e-bike-tour',
  'Tri-Cities E-Bike Wine Country Tour',
  'Guided electric bike tour through vineyards and orchards. Includes tastings and lunch. Helmets and bikes provided.',
  'opportunity',
  'Columbia Crest Winery',
  ST_GeogFromText('SRID=4326;POINT(-119.25 46.27)'),
  'Kennewick',
  'US',
  ARRAY['bike', 'wine', 'tour', 'active'],
  false,
  'published',
  84,
  now() - interval '5 days',
  now() - interval '16 days',
  now() - interval '2 days',
  '[]'::jsonb,
  '{}'::jsonb,
  15000
),
-- 15. Transformation - creative
(
  'c5d6e7f8-a9b0-1234-cdef-456789012340'::uuid,
  test_user_id,
  'richland-pottery-workshop',
  'Richland River Clay Pottery Workshop',
  'Create your own piece using local clay in this hands-on workshop. Firing and glazing included. All levels welcome.',
  'transformation',
  'River Clay Studio',
  ST_GeogFromText('SRID=4326;POINT(-119.17 46.26)'),
  'Richland',
  'US',
  ARRAY['pottery', 'art', 'workshop', 'creative'],
  false,
  'published',
  77,
  now() - interval '11 days',
  now() - interval '28 days',
  now() - interval '8 days',
  '[]'::jsonb,
  '{}'::jsonb,
  2500
)
ON CONFLICT (id) DO NOTHING;

END $$;

-- End of seed. Run the verification query above to test find_quests_nearby.