import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { GuestsService } from './guests.service';

@Controller('guests')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  findAll(
    @Query('hotelId') hotelId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.guestsService.findAllForHotel(hotelId, { search, page, pageSize });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.guestsService.findOneWithHistory(id);
  }

  @Post()
  create(
    @Body()
    body: {
      hotelId: string;
      fullName: string;
      email?: string;
      phone?: string;
      idDocumentType?: string;
      idDocumentNumber?: string;
      notes?: string;
    },
  ) {
    return this.guestsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<{ fullName: string; email: string; phone: string; notes: string }>) {
    return this.guestsService.update(id, body);
  }
}
