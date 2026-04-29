-- Fevereiro 2026 - Rodrigo
INSERT INTO public.fechamento_semanal (motorista_id, semana_inicio, diesel, despesas, venda_manual, compra_manual)
VALUES
  ('1ef22a03-f0b1-4a0b-85fe-d32b878e3808', '2026-02-03', 522.50, 17.00, 27879.88, 22282.62),
  ('1ef22a03-f0b1-4a0b-85fe-d32b878e3808', '2026-02-10', 628.89, 186.77, 28344.10, 20071.20),
  ('1ef22a03-f0b1-4a0b-85fe-d32b878e3808', '2026-02-17', 493.00, 50.50, 25241.71, 18525.45),
  ('1ef22a03-f0b1-4a0b-85fe-d32b878e3808', '2026-02-24', 600.00, 111.00, 23101.97, 17487.16)
ON CONFLICT DO NOTHING;