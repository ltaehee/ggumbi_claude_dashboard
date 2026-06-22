CREATE TABLE `naver_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productCode` varchar(64) NOT NULL,
	`keyword` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `naver_favorites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `naver_memos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productCode` varchar(64) NOT NULL,
	`keyword` varchar(128) NOT NULL,
	`memo` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `naver_memos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `naver_rankings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`recordedAt` timestamp NOT NULL,
	`recordedDate` date NOT NULL,
	`keyword` varchar(128) NOT NULL,
	`productCode` varchar(64) NOT NULL,
	`rank` int NOT NULL,
	`productName` varchar(512),
	`price` int,
	`seller` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `naver_rankings_id` PRIMARY KEY(`id`)
);
