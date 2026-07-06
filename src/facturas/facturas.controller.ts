import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FacturasService } from './facturas.service.js';

@Controller('empresas')
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  // ─── Sync tipo 33 desde backoffice ─────────────────────────────────────────

  @Post(':empkey/facturas/sync')
  async sync(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
    @Query('rut') rut: string,
  ) {
    if (!periodo)
      throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    if (!rut) throw new BadRequestException('rut es obligatorio');
    return this.facturasService.sync(empkey, periodo, rut);
  }

  @Get(':empkey/facturas')
  async getFacturas(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
  ) {
    if (!periodo)
      throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    return this.facturasService.getFacturasPorPeriodo(empkey, periodo);
  }

  @Get(':empkey/facturas/:gfackey/guias')
  async getGuias(
    @Param('empkey') empkey: string,
    @Param('gfackey') gfackey: string,
  ) {
    return this.facturasService.getGuiasPorFactura(empkey, gfackey);
  }

  // ─── Factura Proforma ───────────────────────────────────────────────────────

  @Post(':empkey/facturas/proforma/generar')
  async generarProformas(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
    @Query('rut') rut: string,
  ) {
    if (!periodo)
      throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    if (!rut) throw new BadRequestException('rut es obligatorio');
    return this.facturasService.generar(empkey, periodo, rut);
  }

  @Post(':empkey/facturas/proforma/limpiar')
  async limpiarProformas(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
  ) {
    if (!periodo)
      throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    return this.facturasService.limpiar(empkey, periodo);
  }

  @Post(':empkey/facturas/proforma')
  async crearProforma(
    @Param('empkey') empkey: string,
    @Query('rut') rut: string,
    @Body() body: { periodo: string; gclirut: string; reglaidl: string },
  ) {
    if (!body.periodo || !body.gclirut || !body.reglaidl) {
      throw new BadRequestException(
        'periodo, gclirut y reglaidl son obligatorios',
      );
    }
    if (!rut) throw new BadRequestException('rut es obligatorio');
    return this.facturasService.crearManual(empkey, body, rut);
  }

  @Get(':empkey/facturas/proforma')
  async listarProformas(
    @Param('empkey') empkey: string,
    @Query('periodo') periodo: string,
    @Query('estado') estado?: string,
  ) {
    if (!periodo)
      throw new BadRequestException('periodo es obligatorio (YYYY-MM)');
    return this.facturasService.listarProformas(empkey, periodo, estado);
  }

  @Patch(':empkey/facturas/proforma/:gfackey/aprobar')
  async aprobarProforma(
    @Param('empkey') empkey: string,
    @Param('gfackey') gfackey: string,
  ) {
    return this.facturasService.aprobar(empkey, gfackey);
  }

  @Patch(':empkey/facturas/proforma/:gfackey/anular')
  async anularProforma(
    @Param('empkey') empkey: string,
    @Param('gfackey') gfackey: string,
  ) {
    return this.facturasService.anular(empkey, gfackey);
  }

  @Get(':empkey/facturas/proforma/:gfackey/preview-mensaje')
  async previewMensaje(
    @Param('empkey') empkey: string,
    @Param('gfackey') gfackey: string,
  ) {
    return this.facturasService.previewMensaje(empkey, gfackey);
  }

  @Post(':empkey/facturas/emision')
  async emitirPendientes(@Param('empkey') empkey: string) {
    return this.facturasService.emitirPendientes(empkey);
  }
}
