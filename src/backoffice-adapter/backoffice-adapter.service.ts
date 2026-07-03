import { Injectable, BadGatewayException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmitirDteInput {
  RutEmisor: string;
  RutUsuario: string;
  TransaccionIdL: string;
  Mensaje: string;
  Formato?: string;
  Modo?: string;
}

export interface ResultadoDTE {
  FolioDocumento: number;
  EstadoEmision: string;
  LinkVisualizacion: string;
  LinkXML: string;
}

@Injectable()
export class BackofficeAdapterService {
  private readonly backofficeAdapterUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.backofficeAdapterUrl = this.configService.get<string>(
      'BACKOFFICE_ADAPTER_URL',
      'http://localhost:3333',
    );
  }

  async getGuias(
    rut: string,
    fechaInicial: string,
    fechaFinal: string,
    tipoDocumento = 52,
  ): Promise<Record<string, string>[]> {
    try {
      const rutSinGuion = rut.replace(/-/g, '');
      const url = new URL(`${this.backofficeAdapterUrl}/reportes`);
      url.searchParams.set('rut', rutSinGuion);
      url.searchParams.set('fechaInicial', fechaInicial);
      url.searchParams.set('fechaFinal', fechaFinal);
      url.searchParams.set('tipoDocumento', String(tipoDocumento));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json() as Promise<Record<string, string>[]>;
    } catch (error) {
      throw new BadGatewayException(
        `Error al consultar backoffice-adapter: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async emitirDte(input: EmitirDteInput): Promise<ResultadoDTE> {
    const url = `${this.backofficeAdapterUrl}/emision/dtes`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch (error) {
      throw new BadGatewayException(
        `Error de red al emitir DTE: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({})) as { message?: string };
      throw new UnprocessableEntityException(
        errBody.message ?? `HTTP ${response.status} al emitir DTE`,
      );
    }
    return response.json() as Promise<ResultadoDTE>;
  }
}
