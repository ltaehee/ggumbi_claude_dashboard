CREATE TABLE `naver_brand_keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `naver_brand_keywords_id` PRIMARY KEY(`id`)
);
