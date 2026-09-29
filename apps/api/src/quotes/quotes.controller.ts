import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { GetQuoteDto, QuoteOption } from './dto/get-quote.dto';
import { QuotesService } from './quotes.service';
import {
  formatQuoteResponse,
  QUOTE_RESPONSE_VERSION_HEADER,
  QuoteResponseV1,
  resolveQuoteResponseVersion,
} from './quote-response-version';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async getQuotes(
    @Body() dto: GetQuoteDto,
    @Headers(QUOTE_RESPONSE_VERSION_HEADER) requestedVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<QuoteOption[] | QuoteResponseV1> {
    const version = resolveQuoteResponseVersion(requestedVersion);
    response.setHeader(QUOTE_RESPONSE_VERSION_HEADER, version);
    const quotes = await this.quotesService.getAggregatedQuotes(dto);
    return formatQuoteResponse(version, quotes);
  }
}
