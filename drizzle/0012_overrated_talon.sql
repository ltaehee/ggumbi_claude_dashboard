CREATE TABLE `new_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemName` varchar(256) NOT NULL,
	`itemCode` varchar(64),
	`itemLarge` varchar(128),
	`itemMid` varchar(128),
	`itemSmall` varchar(128),
	`launchDate` date,
	`note` text,
	`addedBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `new_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_new_products_itemname` UNIQUE(`itemName`)
);
--> statement-breakpoint
ALTER TABLE `sales_daily_mart` MODIFY COLUMN `yearMonth` varchar(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_daily_mart` MODIFY COLUMN `yearStr` varchar(8) NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_daily_mart` MODIFY COLUMN `weekLabel` varchar(32);--> statement-breakpoint
CREATE INDEX `idx_new_products_itemcode` ON `new_products` (`itemCode`);