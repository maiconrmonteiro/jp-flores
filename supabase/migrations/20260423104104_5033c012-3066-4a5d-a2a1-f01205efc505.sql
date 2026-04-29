-- Add 'entradas' to app_role enum (must be in standalone migration before being used)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'entradas';