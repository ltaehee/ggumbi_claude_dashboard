CREATE TABLE `sales_analysis_memos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filterKey` varchar(128) NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`aiAnalysis` text,
	`aiGeneratedAt` timestamp,
	`manualMemo` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_analysis_memos_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_sales_memos_key` UNIQUE(`filterKey`,`startDate`,`endDate`)
);
