ALTER TABLE `sales_records` ADD `sourceFilename` varchar(255);--> statement-breakpoint
ALTER TABLE `uploaded_files` ADD CONSTRAINT `uploaded_files_filename_uniq` UNIQUE(`filename`);