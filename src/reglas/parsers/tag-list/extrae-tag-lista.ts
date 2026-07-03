/**
 * Función pura que extrae los valores de una lista de tags XML y los concatena con ';'.
 * Opera sobre el XML crudo completo — no depende de ningún servicio NestJS.
 * Los tags ausentes o vacíos se omiten silenciosamente.
 * Si ningún tag es encontrado, devuelve string vacío.
 */
export function extraeTagLista(tags: string[], xml: string): string {
  const valores: string[] = [];
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
    if (m) {
      const value = m[1].trim();
      if (value) valores.push(value);
    }
  }
  return valores.join(';');
}
