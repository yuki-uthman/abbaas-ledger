-- How the money changed hands: cash, a cheque, or a bank transfer.
--
-- Nullable and with no default, so every row stored before this column existed
-- keeps a null method rather than being given one it was never told. The check
-- holds the three known words, and lets null through: a row with no method is
-- not a row with a wrong one.
--
-- No policy change is needed: the entries policies and grants are on the table,
-- so they cover this column as they cover every other.
alter table public.entries
  add column method text null;

alter table public.entries
  add constraint entries_method_known
  check (method is null or method in ('cash', 'cheque', 'transfer'));
