// Builders de XML sintético para tests — evitan repetir XML crudo como strings
// literales caso por caso. Puros, sin dependencias de test framework.

export interface ReferenciaXmlOpts {
  tipo: string; // '52' | '801' | 'HES' | cualquier código para casos borde
  folio?: string;
  fecha?: string; // YYYY-MM-DD
  razon?: string;
}

export interface BuildGuiaXmlOpts {
  referencias?: ReferenciaXmlOpts[];
}

/** Arma un XML crudo de guía (DTE 52) con bloques <Referencia> parametrizables. */
export function buildGuiaXml(opts: BuildGuiaXmlOpts = {}): string {
  const { referencias = [] } = opts;

  const referenciaBlocks = referencias
    .map((r) => {
      const folioTag =
        r.folio !== undefined ? `<FolioRef>${r.folio}</FolioRef>` : '';
      const fechaTag =
        r.fecha !== undefined ? `<FchRef>${r.fecha}</FchRef>` : '';
      const razonTag =
        r.razon !== undefined ? `<RazonRef>${r.razon}</RazonRef>` : '';
      return `    <Referencia>\n      <TpoDocRef>${r.tipo}</TpoDocRef>\n      ${folioTag}\n      ${fechaTag}\n      ${razonTag}\n    </Referencia>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DTE xmlns="http://www.sii.cl/SiiDte">
  <Documento>
    <Encabezado>
      <Emisor>
        <RUTEmisor>76407930-2</RUTEmisor>
        <RznSoc>Emisor Test SA</RznSoc>
        <GiroEmis>Transporte de Carga</GiroEmis>
      </Emisor>
      <Receptor>
        <RUTRecep>78041840-0</RUTRecep>
        <RznSocRecep>Receptor Test Ltda</RznSocRecep>
      </Receptor>
    </Encabezado>
${referenciaBlocks}
  </Documento>
</DTE>`;
}
