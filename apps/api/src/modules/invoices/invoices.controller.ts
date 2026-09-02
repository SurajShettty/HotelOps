import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { InvoicesService } from './invoices.service';

// `hotelId` query param on these routes is read by RolesGuard for scoping
// only, same convention as PATCH /rooms/:id/floor — invoices are keyed by
// their own id and don't otherwise need it.
@Roles('SUPER_ADMIN', 'OWNER', 'MANAGER', 'RECEPTIONIST', 'FINANCE')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } = await this.invoicesService.generatePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
