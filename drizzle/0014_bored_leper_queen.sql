CREATE TABLE `monthly_variable_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`amount` bigint NOT NULL DEFAULT 0,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_variable_costs_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_mvc_year_month` UNIQUE(`year`,`month`)
);
