import { Injectable } from '@nestjs/common';
import {
  parseDocument,
  parseDetalle,
  parseKv,
} from './xml-parser.utils.js';

// Re-export types so existing importers don't break
export type {
  EmisorData,
  ReceptorData,
  DetalleItem,
  DteDocument,
  FetchedDocument,
} from './xml-parser.utils.js';

@Injectable()
export class XmlParserService {
  async fetchDocument(guifilepath: string) {
    const res = await fetch(guifilepath);
    if (!res.ok) {
      throw new Error(`XML fetch failed: ${res.status} — ${guifilepath}`);
    }
    const rawXml = await res.text();
    return { ...parseDocument(rawXml), rawXml };
  }

  parseDocument = parseDocument;
  parseDetalle = parseDetalle;
  parseKv = parseKv;
}
