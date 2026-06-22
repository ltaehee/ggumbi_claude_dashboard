CREATE TABLE `item_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemCode` varchar(64) NOT NULL,
	`itemName` varchar(128),
	`itemLarge` varchar(64),
	`itemMid` varchar(64),
	`itemSmall` varchar(64),
	`dept` varchar(64),
	`note` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `item_mappings_itemCode_unique` UNIQUE(`itemCode`)
);
