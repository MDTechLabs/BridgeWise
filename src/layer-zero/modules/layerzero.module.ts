import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LayerZeroService } from '../services/layerzero.service';
import { LayerZeroController } from '../controllers/layerzero.controller';

@Module({
  imports: [ConfigModule],
  controllers: [LayerZeroController],
  providers: [LayerZeroService],
  exports: [LayerZeroService],
})
export class LayerZeroModule {}