CREATE TABLE `sales_daily_mart` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`salesDate` date NOT NULL,
	`yearMonth` varchar(7) NOT NULL,
	`yearStr` varchar(4) NOT NULL,
	`weekLabel` varchar(20),
	`dept` varchar(64),
	`channel` varchar(64),
	`itemLarge` varchar(128),
	`itemMid` varchar(128),
	`itemSmall` varchar(128),
	`itemName` varchar(256),
	`itemCode` varchar(64),
	`totalSalesAmt` decimal(18,2) NOT NULL DEFAULT '0',
	`totalQty` decimal(15,2) NOT NULL DEFAULT '0',
	`rowCount` int NOT NULL DEFAULT 0,
	`sourceFilename` varchar(255),
	CONSTRAINT `sales_daily_mart_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mart_date_dept` ON `sales_daily_mart` (`salesDate`,`dept`);--> statement-breakpoint
CREATE INDEX `mart_dept` ON `sales_daily_mart` (`dept`);--> statement-breakpoint
CREATE INDEX `mart_yearmonth_dept` ON `sales_daily_mart` (`yearMonth`,`dept`);--> statement-breakpoint
CREATE INDEX `mart_channel` ON `sales_daily_mart` (`channel`);--> statement-breakpoint
CREATE INDEX `mart_itemlarge` ON `sales_daily_mart` (`itemLarge`);--> statement-breakpoint
CREATE INDEX `mart_itemname` ON `sales_daily_mart` (`itemName`);--> statement-breakpoint
CREATE INDEX `mart_source` ON `sales_daily_mart` (`sourceFilename`);