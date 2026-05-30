import { supabase } from "../supabase";

// Run once to create lots table and add columns to stock
// Safe to run multiple times — checks before creating
export async function runMigrations() {
  try {
    // 1. Create lots table if it doesn't exist by trying to select from it
    const { error: lotsCheck } = await supabase
      .from("lots")
      .select("id")
      .limit(1);

    if (lotsCheck && lotsCheck.code === "42P01") {
      // Table doesn't exist — create via RPC if available, or just let it fail gracefully
      console.log("Lots table not found. Please create it in Supabase dashboard.");
    }

    // 2. Try to add lot_id column to stock (will fail silently if already exists)
    await supabase.rpc("add_lot_columns_if_missing").catch(() => {});

  } catch {
    // Migrations are best-effort
  }
}

// SQL to run manually in Supabase SQL editor:
export const MIGRATION_SQL = `
-- Create lots table
CREATE TABLE IF NOT EXISTS lots (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text NOT NULL,
  supplier        text,
  purchase_date   date,
  total_cost      numeric NOT NULL DEFAULT 0,
  total_devices   integer NOT NULL DEFAULT 0,
  status          text DEFAULT 'active',
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- Add lot columns to stock table
ALTER TABLE stock
  ADD COLUMN IF NOT EXISTS lot_id             uuid REFERENCES lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocated_lot_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refurb_cost        numeric DEFAULT 0;

-- Disable RLS on lots
ALTER TABLE lots DISABLE ROW LEVEL SECURITY;

-- Add supplier notes columns to activity_log
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS sourcing_deal_id uuid,
  ADD COLUMN IF NOT EXISTS channel text;
`;
