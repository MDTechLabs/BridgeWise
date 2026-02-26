import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { FeeAggregationService } from './services/fee-aggregation.service';
import { GetQuotesDto, CompareQuotesResponseDto } from './dto/get-quotes.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@ApiTags('Bridge Quotes')
@Controller('quotes')
export class QuotesController {
  private readonly logger = new Logger(QuotesController.name);

  constructor(private readonly aggregationService: FeeAggregationService) {}

  @Get('compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compare live bridge quotes',
    description:
      'Fetches and ranks real-time quotes from all registered bridge adapters for a given transfer request.',
  })
  @ApiQuery({ name: 'fromChain', type: Number, example: 1 })
  @ApiQuery({ name: 'toChain', type: Number, example: 137 })
  @ApiQuery({ name: 'token', type: String, example: 'USDC' })
  @ApiQuery({ name: 'amount', type: String, example: '1000' })
  @ApiQuery({
    name: 'rankBy',
    enum: ['cost', 'speed', 'score'],
    required: false,
    description: 'Ranking strategy (default: score)',
  })
  @ApiResponse({
    status: 200,
    description: 'Ranked bridge quotes returned successfully',
    type: CompareQuotesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async compareQuotes(@Query() query: Record<string, string>): Promise<CompareQuotesResponseDto> {
    const dto = plainToInstance(GetQuotesDto, query);
    const errors = await validate(dto);

    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages);
    }

    this.logger.log(
      `Comparing quotes: ${dto.token} ${dto.amount} from chain ${dto.fromChain} → ${dto.toChain} [rankBy=${dto.rankBy}]`,
    );

    return this.aggregationService.compareQuotes(
      {
        fromChain: dto.fromChain,
        toChain: dto.toChain,
        token: dto.token,
        amount: dto.amount,
      },
      dto.rankBy,
    );
  }
}
