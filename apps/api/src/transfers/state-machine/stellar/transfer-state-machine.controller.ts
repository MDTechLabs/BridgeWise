import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { TransferStateMachineService } from './transfer-state-machine.service';
import type { TransferState, TransferLifecycle } from './transfer-state-machine.types';

class TransitionDto {
  state: TransferState;
}

@ApiTags('Transfer State Machine')
@Controller('transfers/state-machine/stellar')
export class TransferStateMachineController {
  constructor(private readonly stateMachineService: TransferStateMachineService) {}

  @Post(':transferId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create state machine for a transfer' })
  @ApiParam({ name: 'transferId', type: 'string' })
  @ApiBody({ schema: { properties: { initialState: { type: 'string' } } }, required: false })
  @ApiResponse({ status: 201, description: 'State machine created' })
  create(
    @Param('transferId') transferId: string,
    @Body('initialState') initialState?: TransferState,
  ): TransferLifecycle {
    return this.stateMachineService.create(transferId, initialState);
  }

  @Get(':transferId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current lifecycle state of a transfer' })
  @ApiParam({ name: 'transferId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Transfer lifecycle returned' })
  get(@Param('transferId') transferId: string): TransferLifecycle {
    return this.stateMachineService.get(transferId);
  }

  @Post(':transferId/transition')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition transfer to a new state' })
  @ApiParam({ name: 'transferId', type: 'string' })
  @ApiBody({ schema: { properties: { state: { type: 'string' } }, required: ['state'] } })
  @ApiResponse({ status: 200, description: 'Transition applied' })
  transition(
    @Param('transferId') transferId: string,
    @Body() dto: TransitionDto,
  ): TransferLifecycle {
    if (!dto.state) throw new BadRequestException('"state" is required');
    return this.stateMachineService.transition(transferId, dto.state);
  }

  @Post(':transferId/recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recover a failed transfer (transitions to refunded)' })
  @ApiParam({ name: 'transferId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Recovery path initiated' })
  recover(@Param('transferId') transferId: string): TransferLifecycle {
    return this.stateMachineService.recover(transferId);
  }
}
