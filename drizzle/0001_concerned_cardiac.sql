CREATE TABLE `bom_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemCode` varchar(64) NOT NULL,
	`costPerUnit` decimal(15,4) DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bom_costs_id` PRIMARY KEY(`id`),
	CONSTRAINT `bom_costs_itemCode_unique` UNIQUE(`itemCode`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemCode` varchar(64) NOT NULL,
	`itemName` varchar(128),
	`currentStock` decimal(15,2) DEFAULT '0',
	`expiryDate` date,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dept` varchar(64),
	`channel` varchar(128),
	`eventName` varchar(255),
	`startDate` date,
	`endDate` date,
	`targetAmt` decimal(18,2) DEFAULT '0',
	`achievedAmt` decimal(18,2) DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_records` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`salesDate` date NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`weekLabel` varchar(32),
	`yearMonth` varchar(16),
	`yearStr` varchar(8),
	`dept` varchar(64),
	`channel` varchar(128),
	`itemLarge` varchar(64),
	`itemMid` varchar(64),
	`itemSmall` varchar(64),
	`itemName` varchar(128),
	`itemCode` varchar(64),
	`qty` decimal(15,2) DEFAULT '0',
	`salesAmt` decimal(18,2) DEFAULT '0',
	`costPerUnit` decimal(15,4) DEFAULT '0',
	`grossProfit` decimal(18,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dept` varchar(64) NOT NULL,
	`itemMid` varchar(64) NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`targetAmt` decimal(18,2) DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileType` enum('sales','bom','target','promotion','inventory') NOT NULL,
	`rowCount` int DEFAULT 0,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` varchar(64),
	CONSTRAINT `uploaded_files_id` PRIMARY KEY(`id`)
);
