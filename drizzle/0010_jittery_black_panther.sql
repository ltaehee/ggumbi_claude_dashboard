CREATE INDEX `idx_sr_sales_date` ON `sales_records` (`salesDate`);--> statement-breakpoint
CREATE INDEX `idx_sr_dept_date` ON `sales_records` (`dept`,`salesDate`);--> statement-breakpoint
CREATE INDEX `idx_sr_channel` ON `sales_records` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_sr_item_large` ON `sales_records` (`itemLarge`);--> statement-breakpoint
CREATE INDEX `idx_sr_item_mid` ON `sales_records` (`itemMid`);--> statement-breakpoint
CREATE INDEX `idx_sr_item_small` ON `sales_records` (`itemSmall`);--> statement-breakpoint
CREATE INDEX `idx_sr_item_name` ON `sales_records` (`itemName`);--> statement-breakpoint
CREATE INDEX `idx_sr_source_filename` ON `sales_records` (`sourceFilename`);