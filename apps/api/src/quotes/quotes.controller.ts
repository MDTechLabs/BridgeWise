import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { GetQuoteDto, QuoteOption } from './dto/get-quote.dto';
import { QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async getQuotes(@Body() dto: GetQuoteDto): Promise<QuoteOption[]> {
    return this.quotesService.getAggregatedQuotes(dto);
  }
}
