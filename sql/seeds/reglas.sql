-- Seeds: Reglas QA — formato v4 (reglaconfig JSONB)
-- Pre-requisito: migración 007 aplicada.

-- 1. Catálogo de reglas
INSERT INTO gde.regla (reglaidl, regladescripcion, reglaconfig) VALUES
  ('por_comuna',       'Agrupar por comuna del receptor',    '{"fn":"extraeTagLista","reglaTags":["CmnaRecep"]}'),
  ('por_razon_social', 'Agrupar por razón social',           '{"fn":"extraeTagLista","reglaTags":["RznSocRecep"]}'),
  ('por_ciudad',       'Agrupar por ciudad del receptor',    '{"fn":"extraeTagLista","reglaTags":["CiudadRecep"]}'),
  ('por_direccion',    'Agrupar por dirección del receptor', '{"fn":"extraeTagLista","reglaTags":["DirRecep"]}')
ON CONFLICT (reglaidl) DO UPDATE
  SET regladescripcion = EXCLUDED.regladescripcion,
      reglaconfig      = EXCLUDED.reglaconfig;

-- 2. Asignaciones empresa → reglas disponibles (QA empkey=977)
INSERT INTO gde.reglaempresa (empkey, reglaidl) VALUES
  (977, 'por_comuna'),
  (977, 'por_razon_social'),
  (977, 'por_ciudad'),
  (977, 'por_direccion')
ON CONFLICT DO NOTHING;

-- 3. Asignar regla a clientes QA (ajustar gclirut según datos reales)
-- UPDATE gde.clientes SET reglaidl = 'por_comuna'
--   WHERE empkey = 977 AND gclirut = '77004250-K';
