-- Default earner for the "PS Sold through Social Media" sheet incentive.
-- Admin-changeable permanently from the Incentive page; applied during sync.
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS incentive_social_earner text NOT NULL DEFAULT 'Rohan Choudhary';
