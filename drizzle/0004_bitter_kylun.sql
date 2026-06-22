ALTER TABLE `promotions` ADD `notionPageId` varchar(64);--> statement-breakpoint
ALTER TABLE `promotions` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_notionPageId_unique` UNIQUE(`notionPageId`);