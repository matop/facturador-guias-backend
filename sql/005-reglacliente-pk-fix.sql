-- DDL 005: Fix PK de reglacliente
-- Semántica: exactamente UNA regla activa por cliente (empkey, gclirut)
-- reglaidl almacena TYPE reglaidl (ej: 977_campo_receptor_CmnaRecep), no VALUE
-- La tabla es propiedad del operador: sync solo lee, nunca escribe

TRUNCATE gde.reglacliente;
ALTER TABLE gde.reglacliente DROP CONSTRAINT reglacliente_pkey;
ALTER TABLE gde.reglacliente ADD PRIMARY KEY (empkey, gclirut);
