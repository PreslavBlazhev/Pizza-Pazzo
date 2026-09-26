-- The restaurant is open around the clock (owner's decision, 2026-09-26).
--
-- Every day 00:00 – 24:00. "24:00" is the end of the day (accepted since the
-- same release), so consecutive days join at midnight without a gap: 24/7.
-- Only the opening hours change — address, phones, e-mail and any manual
-- closure / forced opening are left exactly as they are. The hours stay
-- editable from Admin → Settings afterwards.

UPDATE "RestaurantSettings"
SET "mondayOpen" = true,    "mondayFrom" = '00:00',    "mondayTo" = '24:00',
    "tuesdayOpen" = true,   "tuesdayFrom" = '00:00',   "tuesdayTo" = '24:00',
    "wednesdayOpen" = true, "wednesdayFrom" = '00:00', "wednesdayTo" = '24:00',
    "thursdayOpen" = true,  "thursdayFrom" = '00:00',  "thursdayTo" = '24:00',
    "fridayOpen" = true,    "fridayFrom" = '00:00',    "fridayTo" = '24:00',
    "saturdayOpen" = true,  "saturdayFrom" = '00:00',  "saturdayTo" = '24:00',
    "sundayOpen" = true,    "sundayFrom" = '00:00',    "sundayTo" = '24:00',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'restaurant';
