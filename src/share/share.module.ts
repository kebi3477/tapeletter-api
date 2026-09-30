import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module.js';
import { ShelfModule } from '../shelf/shelf.module.js';
import { LinkPageController } from './link-page.controller.js';
import { ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';
import { ShareCardService } from './share-card.service.js';

@Module({
  imports: [ShelfModule, FriendsModule],
  controllers: [ShareController, LinkPageController],
  providers: [ShareService, ShareCardService],
})
export class ShareModule {}
