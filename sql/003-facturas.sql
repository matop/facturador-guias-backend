-- Migración: Tablas de Facturación
-- Fecha: 2026-05-20
-- Descripción: DDL para ambiente nuevo. En QA/producción estas tablas ya existen
--              en el legado Java. Script de referencia y para ambientes de dev limpios.

-- Factura electrónica (tipo 33)
CREATE TABLE IF NOT EXISTS gde.factura (
  empkey              bigint       NOT NULL,
  gfackey             bigint       NOT NULL,
  gfactipo            varchar(10)  NOT NULL,
  gfacfolio           bigint       NOT NULL,
  gfacestadoregistro  varchar(20)  NOT NULL DEFAULT '',
  gfacestadoanulacion varchar(20)  NOT NULL DEFAULT '',
  gfacfecha           date         NOT NULL,
  gfactotneto         bigint       NOT NULL DEFAULT 0,
  gfactotexento       bigint       NOT NULL DEFAULT 0,
  gfactotiva          bigint       NOT NULL DEFAULT 0,
  gfactotimpuestos    numeric      NOT NULL DEFAULT 0,
  gfactotdoc          bigint       NOT NULL DEFAULT 0,
  gfacfilepath        varchar(500) NOT NULL DEFAULT '',
  gfacloteidl         varchar(100) NOT NULL DEFAULT '',
  gclirut             varchar(20)  NOT NULL DEFAULT '',
  CONSTRAINT pk_factura PRIMARY KEY (empkey, gfackey)
);

-- Tabla de vinculación factura → guías que la componen
CREATE TABLE IF NOT EXISTS gde.facturaguias (
  empkey   bigint   NOT NULL,
  gfackey  bigint   NOT NULL,
  guitipo  smallint NOT NULL,
  guifolio bigint   NOT NULL,
  CONSTRAINT pk_facturaguias PRIMARY KEY (empkey, gfackey, guitipo, guifolio),
  CONSTRAINT fk_facturaguias_factura
    FOREIGN KEY (empkey, gfackey) REFERENCES gde.factura (empkey, gfackey)
);

-- Índices de acceso frecuente
CREATE INDEX IF NOT EXISTS idx_factura_empkey_fecha
  ON gde.factura (empkey, gfacfecha);

CREATE INDEX IF NOT EXISTS idx_factura_gclirut
  ON gde.factura (empkey, gclirut);
