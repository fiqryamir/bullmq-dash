import { getQueueToken } from '@nestjs/bull-shared';
import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BULL_BOARD_INSTANCE, BULL_BOARD_QUEUES } from './bull-board.constants';
import type { BullBoardInstance, BullBoardQueueOptions } from './bull-board.types';

@Module({})
export class BullBoardFeatureModule implements OnModuleInit {
  constructor(
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(BULL_BOARD_QUEUES) private readonly queues: BullBoardQueueOptions[],
    @Inject(BULL_BOARD_INSTANCE) private readonly board: BullBoardInstance
  ) {}

  onModuleInit(): void {
    for (const queueOption of this.queues) {
      const queue =
        queueOption.queue ?? this.moduleRef.get(getQueueToken(queueOption.name), { strict: false });
      const queueAdapter = new queueOption.adapter(queue, queueOption.options);
      this.board.addQueue(queueAdapter);
    }
  }
}
